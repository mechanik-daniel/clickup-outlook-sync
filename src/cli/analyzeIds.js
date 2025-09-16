import { readFileSync } from 'fs';
import path from 'path';
import { stagingDir } from '../util/paths.js';
import { logger } from '../util/logger.js';

function tally(list, field) {
  const counts = new Map();
  list.forEach(o => {
    const v = o[field];
    if (!v) return;
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  const dups = [...counts.entries()].filter(([, c]) => c > 1).sort((a,b)=>b[1]-a[1]);
  return { totalWithField: [...counts.keys()].length, duplicates: dups.slice(0, 20) };
}

try {
  const file = path.join(stagingDir, 'clickup_dry_run.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const ops = raw.ops || [];
  const unmatched = raw.unmatched || [];
  const all = [...ops, ...unmatched];
  const idStats = tally(all, 'eventId');
  const iCalStats = tally(all.map(e => ({ ...e, iCalUId: e.iCalUId || e.iCalUid })), 'iCalUId');
  logger.info('ID analysis', { sampleTotal: all.length, uniqueEventIds: idStats.totalWithField, dupEventIdsTop: idStats.duplicates, uniqueICals: iCalStats.totalWithField, dupICalsTop: iCalStats.duplicates });
} catch (e) {
  logger.error('Failed analyzing IDs', { error: e.message });
  process.exitCode = 1;
}
