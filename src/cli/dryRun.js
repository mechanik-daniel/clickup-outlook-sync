import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { getAccessToken } from '../auth/tokenManager.js';
import { stagingDir } from '../util/paths.js';
import { planTimeEntryOperations } from '../services/clickup/dryRunPlanner.js';
import { logger } from '../util/logger.js';
import { preparePlanningInputs } from '../services/sync/planningPrep.js';

async function run() {
  try {
    const accessToken = await getAccessToken();
    const { events, existingEntries, subjectExpr, window } = await preparePlanningInputs(accessToken);
    const { start, end } = window;
    const { ops, unmatched, orphanCount, existingEntriesCount, skippedUpdates } = await planTimeEntryOperations(events, existingEntries, { subjectExpr });
    if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true });
    const file = path.join(stagingDir, 'clickup_dry_run.json');
    writeFileSync(
      file,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        window: { start, end },
        totalEvents: events.length,
        plannedOperations: ops.length,
        skippedUpdates,
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
