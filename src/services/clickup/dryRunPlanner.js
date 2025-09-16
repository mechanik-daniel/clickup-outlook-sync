import { extractTaskId } from '../outlook/taskIdExtractor.js';
import { loadMapping, rekeyFromLegacy, findOrphans } from '../../storage/mappingStore.js';
import { logger } from '../../util/logger.js';

function toEpoch(dateTime) {
  if (!dateTime) return null;
  return Date.parse(dateTime);
}

export async function planTimeEntryOperations(events, existingEntries = [], { subjectExpr } = {}) {
  const mapping = loadMapping();
  // Allow legacy rekeying if needed (events contain fresh iCalUId)
  rekeyFromLegacy(mapping, events);
  const ops = [];
  const unmatched = [];
  const seenIds = new Set();
  const duplicateIds = new Set();
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
    let description = ev.subject || '';
    if (subjectExpr) {
      try {
        description = await subjectExpr.evaluate(ev.subject || '');
      } catch (e) {
        logger.warn('Subject transform failed for event; using raw subject', { error: e.message });
      }
    }
    if (existing) {
      ops.push({ type: 'update', eventId: ev.id, iCalUId: ev.iCalUId, seriesMasterId: ev.seriesMasterId, timeEntryId: existing.clickupTimeEntryId, taskId: extraction.taskId, start, end, duration, subject: ev.subject, description });
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
  return { ops, unmatched, orphanCount: orphans.length, existingEntriesCount: existingEntries.length };
}
