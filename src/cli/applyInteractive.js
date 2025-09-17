import readline from 'readline';
import { getAccessToken } from '../auth/tokenManager.js';
import { config } from '../config/index.js';
import { createTimeEntry, updateTimeEntry } from '../services/clickup/timeEntries.js';
import { planSync } from '../services/sync/planSync.js';
import { loadMapping, saveMapping, upsertMapping } from '../storage/mappingStore.js';
import { logger } from '../util/logger.js';

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans); }));
}

function formatForDisplay(ms) {
  const tz = config.sync.displayTimezone;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ms);
  } catch {
    return new Date(ms).toISOString();
  }
}

function summarizeOp(op) {
  const startIso = new Date(op.start).toISOString();
  const local = formatForDisplay(op.start);
  if (op.type === 'create') {
    return `[CREATE] task=${op.taskId} startUTC=${startIso} startLocal=${local} dur=${(op.duration/60000).toFixed(1)}m subj="${op.subject}"`;
  } else if (op.type === 'update') {
    return `[UPDATE] timeEntryId=${op.timeEntryId} task=${op.taskId} startUTC=${startIso} startLocal=${local} dur=${(op.duration/60000).toFixed(1)}m subj="${op.subject}"`;
  } else if (op.type === 'delete') {
    return `[DELETE] timeEntryId=${op.timeEntryId} iCalUId=${op.iCalUId}`;
  }
  return `[UNKNOWN] ${JSON.stringify(op)}`;
}

async function applyOp(op, mapping) {
  if (op.type === 'create') {
    const stop = op.end || (op.start + op.duration);
    const res = await createTimeEntry({ taskId: op.taskId, start: op.start, stop, duration: op.duration, description: op.description });
    const createdId = res?.data?.id || res?.id || res?.time_entry?.id || res?.timeEntryId;
    if (!createdId) logger.warn('Could not determine created time entry id', { res });
    else upsertMapping(mapping, op.iCalUId, createdId, { createdFrom: 'interactive', snapshot: { start: op.start, stop, duration: op.duration, taskId: op.taskId, description: (op.description||'').trim() } });
    return { status: 'created', id: createdId };
  }
  if (op.type === 'update') {
    // Patch with normalized start/stop/duration plus description & task
    const stop = op.end || (op.start + op.duration);
    const patch = { start: op.start, stop, duration: op.duration, description: op.description, tid: op.taskId };
    await updateTimeEntry(op.timeEntryId, patch);
    upsertMapping(mapping, op.iCalUId, op.timeEntryId, { updatedFrom: 'interactive', snapshot: { start: op.start, stop, duration: op.duration, taskId: op.taskId, description: (op.description||'').trim() } });
    return { status: 'updated', id: op.timeEntryId };
  }
  if (op.type === 'delete') {
    // Not implementing delete API yet (safer). Mark skipped.
    return { status: 'skipped_delete' };
  }
  return { status: 'noop' };
}

async function main() {
  try {
    const accessToken = await getAccessToken();
    const { ops, unmatched, events } = await planSync(accessToken);
    logger.info('Planned operations ready', { totalOps: ops.length, unmatched: unmatched.length, totalEvents: events.length });

    const mapping = loadMapping();

    let index = 0;
    while (index < ops.length) {
      const op = ops[index];
      const summary = summarizeOp(op);
      const ans = await ask(`Op ${index+1}/${ops.length}: ${summary}\n[y] apply, [s] skip, [q] quit > `);
      if (ans.toLowerCase() === 'q') break;
      if (ans.toLowerCase() === 'y') {
        try {
          const result = await applyOp(op, mapping);
          saveMapping(mapping);
          logger.info('Applied', { opType: op.type, result });
        } catch (e) {
          logger.error('Apply failed', { error: e.message });
        }
      } else {
        logger.info('Skipped op', { opType: op.type });
      }
      index += 1;
    }

    logger.info('Interactive apply finished', { processed: index, totalPlanned: ops.length });
  } catch (e) {
    logger.error('Interactive apply failed', { error: e.message });
    process.exitCode = 1;
  }
}

main();
