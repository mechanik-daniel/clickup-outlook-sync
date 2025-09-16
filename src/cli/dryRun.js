import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { getAccessToken } from '../auth/tokenManager.js';
import { fetchCalendarView } from '../services/outlook/fetchCalendarView.js';
import { config } from '../config/index.js';
import { stagingDir } from '../util/paths.js';
import { planTimeEntryOperations } from '../services/clickup/dryRunPlanner.js';
import { fetchTimeEntriesWithinWindow } from '../services/clickup/timeEntries.js';
import { logger } from '../util/logger.js';
import jsonata from 'jsonata';

async function run() {
  try {
    const accessToken = await getAccessToken();
    const now = new Date();
    let startDate;
    if (config.sync.hardStartDate) {
      // Interpret as local date at 00:00 local time, then convert to ISO
      const [y, m, d] = config.sync.hardStartDate.split('-').map(Number);
      startDate = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0); // local midnight
    } else {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - config.sync.activeWindowMonths);
    }
    const start = startDate.toISOString();
    const end = now.toISOString();
    const category = config.sync.targetCategory;
    const events = await fetchCalendarView(accessToken, { start, end, category });
    const existingEntries = await fetchTimeEntriesWithinWindow(Date.parse(start), Date.parse(end));

    // Subject transformation expression (JSONata). Default already in config.
    let subjectExpr;
    try {
      subjectExpr = jsonata(config.sync.subjectTransformExpression || '$trim($)');
    } catch (e) {
      logger.error('Invalid SUBJECT_TRANSFORM_JSONATA expression, falling back to $trim($)', { error: e.message });
      subjectExpr = jsonata('$trim($)');
    }

    const { ops, unmatched, orphanCount, existingEntriesCount } = await planTimeEntryOperations(
      events,
      existingEntries,
      { subjectExpr }
    );
    if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true });
    const file = path.join(stagingDir, 'clickup_dry_run.json');
    writeFileSync(
      file,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        window: { start, end },
        totalEvents: events.length,
        plannedOperations: ops.length,
        unmatchedCount: unmatched.length,
        orphanCount,
        existingEntriesCount,
        existingEntries: existingEntries.map(e => ({
          id: e.id || e.time_entry_id || e._id,
          taskId: e.task?.id || e.tid || e.task_id || null,
          start: e.start,
          end: e.end,
          duration: e.duration || (e.end && e.start ? (e.end - e.start) : null),
          description: e.description || ''
        })),
        ops,
        unmatched
      }, null, 2)
    );
    logger.info('Dry run planned', { file, ops: ops.length, unmatched: unmatched.length, orphanCount });
    if (unmatched.length) {
      unmatched.slice(0, 10).forEach(u => logger.warn('Unmatched (no task id)', { id: u.id, subject: u.subject, reason: u.reason }));
    }
  } catch (e) {
    logger.error('Dry run failed', { error: e.message });
    process.exitCode = 1;
  }
}

run();
