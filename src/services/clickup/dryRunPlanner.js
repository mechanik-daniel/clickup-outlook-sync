import { extractTaskId } from '../outlook/taskIdExtractor.js';
import { loadMapping, rekeyFromLegacy, findOrphans } from '../../storage/mappingStore.js';
import { logger } from '../../util/logger.js';
import { fetchTimeEntryById } from './timeEntries.js';

function toEpoch(dateTime) {
  if (!dateTime) return null;
  return Date.parse(dateTime);
}

export async function planTimeEntryOperations(events, existingEntries = [], { subjectExpr } = {}) {
  const mapping = loadMapping();
  // Allow legacy rekeying if needed (events contain fresh iCalUId)
  rekeyFromLegacy(mapping, events);
  const ops = [];
  let skippedUpdates = 0;
  // removed optimistic assumedSkippedUpdates logic; rely solely on real fetch + snapshot only for no-op diff when remote exists
  const unmatched = [];
  const seenIds = new Set();
  const duplicateIds = new Set();
  // Index existing ClickUp entries by id for diff checks
  const existingById = {};
  existingEntries.forEach(te => {
    const id = te.id || te.time_entry_id || te._id;
    if (id) existingById[id] = te;
  });
  const toNum = v => (v === null || v === undefined ? undefined : Number(v));
  const isClose = (a, b, tolerance = 1000) => (a === undefined || b === undefined) ? true : Math.abs(a - b) <= tolerance; // allow 1s drift
  let fallbackFetches = 0;
  let fallbackFound = 0;
  for (const ev of events) {
    // Normalize iCalUId (some older snapshots had a 'uid' field); prefer documented iCalUId
    if (!ev.iCalUId && ev.uid) ev.iCalUId = ev.uid;
    if (seenIds.has(ev.id)) duplicateIds.add(ev.id); else seenIds.add(ev.id);
    const extraction = extractTaskId(ev);
    if (!extraction || !extraction.taskId) {
      unmatched.push({ id: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, subject: ev.subject });
      continue; // skip this event, proceed with others
    }
    const existing = mapping.entries[ev.iCalUId];
    const startIso = ev.start?.dateTime || ev.start?.dateTimeRaw || null;
    const endIso = ev.end?.dateTime || ev.end?.dateTimeRaw || null;
    const start = toEpoch(startIso);
    const end = toEpoch(endIso);
    if (!start || !end) {
      unmatched.push({ id: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, subject: ev.subject, reason: 'missing_time' });
      continue; // skip malformed timing
    }
    const duration = end - start;
    if (duration <= 0) {
      unmatched.push({ id: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, subject: ev.subject, reason: 'non_positive_duration' });
      continue;
    }
    let description = ev.subject || '';
    if (subjectExpr) {
      try {
        description = await subjectExpr.evaluate(ev.subject || '');
      } catch (e) {
        logger.warn('Subject transform failed for event; using raw subject', { error: e.message });
      }
    }
    if (existing) {
      const existingTe = existingById[existing.clickupTimeEntryId];
      if (existingTe) {
        const existingStart = toNum(existingTe.start);
        const existingStopRaw = existingTe.stop || existingTe.end || (existingTe.start && existingTe.duration ? (toNum(existingTe.start) + toNum(existingTe.duration)) : undefined);
        const existingStop = toNum(existingStopRaw);
        const existingDuration = toNum(existingTe.duration) || (existingStop && existingStart ? existingStop - existingStart : undefined);
        const existingTaskId = existingTe.tid || existingTe.task_id || existingTe.task?.id;
        const existingDesc = (existingTe.description || '').trim();
        const plannedStop = end; // internal 'end' corresponds to stop
        const descTrim = (description || '').trim();
        const unchanged = isClose(existingStart, start) &&
          isClose(existingStop, plannedStop) &&
          (existingDuration ? isClose(existingDuration, duration) : true) &&
          (!existingTaskId || existingTaskId === extraction.taskId) &&
          (existingDesc === descTrim);
        if (unchanged) {
          skippedUpdates += 1;
        } else {
          ops.push({ type: 'update', eventId: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, timeEntryId: existing.clickupTimeEntryId, taskId: extraction.taskId, start, end, duration, subject: ev.subject, description });
        }
      } else {
        // Remote time entry missing from window fetch - attempt a direct fetch by id (possible pagination gap)
        if (existing.clickupTimeEntryId) {
          fallbackFetches += 1;
          try {
            const fetched = await fetchTimeEntryById(existing.clickupTimeEntryId);
            if (fetched) {
              fallbackFound += 1;
              // insert into existingById for potential reuse (if duplicate events share same mapping erroneously)
              const id = fetched.id || fetched.time_entry_id || fetched._id || existing.clickupTimeEntryId;
              if (id) existingById[id] = fetched;
              // Re-run unchanged diff logic inline (duplicate of above block but simplified)
              const existingStart = toNum(fetched.start);
              const existingStopRaw = fetched.stop || fetched.end || (fetched.start && fetched.duration ? (toNum(fetched.start) + toNum(fetched.duration)) : undefined);
              const existingStop = toNum(existingStopRaw);
              const existingDuration = toNum(fetched.duration) || (existingStop && existingStart ? existingStop - existingStart : undefined);
              const existingTaskId = fetched.tid || fetched.task_id || fetched.task?.id;
              const existingDesc = (fetched.description || '').trim();
              const plannedStop = end;
              const descTrim = (description || '').trim();
              const unchanged = isClose(existingStart, start) &&
                isClose(existingStop, plannedStop) &&
                (existingDuration ? isClose(existingDuration, duration) : true) &&
                (!existingTaskId || existingTaskId === extraction.taskId) &&
                (existingDesc === descTrim);
              if (unchanged) {
                skippedUpdates += 1;
              } else {
                ops.push({ type: 'update', eventId: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, timeEntryId: existing.clickupTimeEntryId, taskId: extraction.taskId, start, end, duration, subject: ev.subject, description });
              }
              continue; // done with this event
            }
          } catch (e) {
            logger.warn('Fallback fetch failed for time entry id', { id: existing.clickupTimeEntryId, error: e.message });
          }
        }
        // Still missing after fallback attempt -> plan create
        // Heuristic: if we have a stored snapshot in mapping that matches current planning values, assume remote still exists but was not fetched (pagination / API limits) -> skip
        const snapshot = existing.meta?.snapshot;
        if (snapshot) {
          const snapStart = toNum(snapshot.start);
          const snapStop = toNum(snapshot.stop) || (snapshot.start && snapshot.duration ? toNum(snapshot.start) + toNum(snapshot.duration) : undefined);
          const snapDuration = toNum(snapshot.duration) || (snapStop && snapStart ? snapStop - snapStart : undefined);
          const snapTaskId = snapshot.taskId;
          const snapDesc = (snapshot.description || '').trim();
          const descTrim = (description || '').trim();
          const unchangedBySnapshot = isClose(snapStart, start) &&
            isClose(snapStop, end) &&
            (snapDuration ? isClose(snapDuration, duration) : true) &&
            (!snapTaskId || snapTaskId === extraction.taskId) &&
            (snapDesc === descTrim);
          if (unchangedBySnapshot) {
            skippedUpdates += 1;
            logger.debug('Assuming existing via snapshot (skipping create)', { iCalUId: ev.iCalUId, timeEntryId: existing.clickupTimeEntryId });
            continue;
          } else {
            // If snapshot differs we attempt an update (best effort) instead of blind create to avoid duplication
            ops.push({ type: 'update', eventId: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, timeEntryId: existing.clickupTimeEntryId, taskId: extraction.taskId, start, end, duration, subject: ev.subject, description, reason: 'snapshot_based' });
            continue;
          }
        }
        ops.push({ type: 'create', eventId: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, taskId: extraction.taskId, start, end, duration, subject: ev.subject, description, reason: 'missing_remote' });
      }
    } else {
      ops.push({ type: 'create', eventId: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, taskId: extraction.taskId, start, end, duration, subject: ev.subject, description });
    }
  }
  if (duplicateIds.size) {
    logger.warn('Duplicate Outlook event IDs encountered in fetched window', { duplicateCount: duplicateIds.size });
  }
  // Orphan detection: any mapping key (iCalUId) absent from current events becomes delete op
  const currentSet = new Set(events.map(e => e.iCalUId).filter(Boolean));
  const orphans = findOrphans(mapping, currentSet);
  orphans.forEach(o => {
    ops.push({ type: 'delete', iCalUId: o.iCalUId, timeEntryId: o.clickupTimeEntryId });
  });
  if (fallbackFetches) {
    logger.debug('Fallback single-entry fetch stats', { attempted: fallbackFetches, found: fallbackFound });
  }
  return { ops, unmatched, orphanCount: orphans.length, existingEntriesCount: existingEntries.length, skippedUpdates, fallbackFetches, fallbackFound };
}
