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
  if (ms === undefined || ms === null || isNaN(ms)) {
    return 'Invalid Date';
  }
  
  const tz = config.sync.displayTimezone;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ms);
  } catch {
    try {
      return new Date(ms).toISOString();
    } catch {
      return 'Invalid Date';
    }
  }
}

function summarizeOp(op) {
  let startIso = '-';
  let local = '-';
  let durMin = '-';
  
  // Only process start time if it exists and is valid
  if (op.start !== undefined && op.start !== null) {
    try {
      startIso = new Date(op.start).toISOString();
      local = formatForDisplay(op.start);
    } catch {
      // Handle invalid date values
      startIso = 'Invalid Date';
      local = 'Invalid Date';
    }
  }
  
  // Only process duration if it exists and is valid
  if (op.duration !== undefined && op.duration !== null && !isNaN(op.duration)) {
    durMin = (op.duration/60000).toFixed(1);
  }
  
  const desc = (op.description || '').slice(0,80);
  const reason = op.reason || '';
  
  if (op.type === 'create') return { kind: 'CREATE', id: '-', timeEntryId: '-', task: op.taskId, startUtc: startIso, startLocal: local, durMin, subj: op.subject, desc, reason };
  if (op.type === 'update') return { kind: 'UPDATE', id: op.timeEntryId, timeEntryId: op.timeEntryId, task: op.taskId, startUtc: startIso, startLocal: local, durMin, subj: op.subject, desc, reason };
  if (op.type === 'delete') return { kind: 'DELETE', id: op.timeEntryId, timeEntryId: op.timeEntryId, task: '-', startUtc: '-', startLocal: '-', durMin: '-', subj: '-', desc: '-', reason };
  return { kind: 'UNKNOWN', id: '?', task: '?', startUtc: startIso, startLocal: local, durMin, subj: op.subject, desc, reason };
}

function renderOpTable(opSummaries, page = 0, pageSize = 10) {
  const slice = opSummaries.slice(page*pageSize, page*pageSize + pageSize);
  if (!slice.length) return 'No operations.';
  const headers = ['#','TYPE','Task','Start(Local)','Dur(m)','Subject','Desc','Reason'];
  const rows = slice.map((s,i)=>[
    (page*pageSize)+i+1,
    s.kind,
    s.task||'-',
    s.startLocal||'-',
    s.durMin||'-',
    (s.subj||'').slice(0,40),
    (s.desc||'').slice(0,40),
    s.reason||''
  ]);
  const widths = headers.map((h,idx)=>Math.min( Math.max(h.length, ...rows.map(r=>String(r[idx]).length)), 50));
  const fmtRow = r => r.map((c,i)=>String(c).padEnd(widths[i])).join('  ');
  return [fmtRow(headers), fmtRow(headers.map(h=>'-'.repeat(h.length))), ...rows.map(fmtRow)].join('\n');
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
    const summaries = ops.map(o => summarizeOp(o));
    logger.info('Planned operations ready', { totalOps: ops.length, unmatched: unmatched.length, totalEvents: events.length });
    console.log(renderOpTable(summaries, 0, 15));

    const mapping = loadMapping();

    let index = 0;
    while (index < ops.length) {
      const op = ops[index];
      const summary = summarizeOp(op);
      const ans = await ask(`Op ${index+1}/${ops.length}: ${summary.kind} task=${summary.task} dur=${summary.durMin}m subj="${summary.subj}" desc="${summary.desc}" reason=${summary.reason || '-'}\n[y] apply, [s] skip, [q] quit > `);
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
