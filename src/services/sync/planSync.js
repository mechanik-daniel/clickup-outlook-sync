import { preparePlanningInputs } from './planningPrep.js';
import { planTimeEntryOperations } from '../clickup/dryRunPlanner.js';

// planSync: Fetch events + existing time entries, build subject expression, then plan operations.
// Returns: { window, events, existingEntries, subjectExpr, ops, unmatched, orphanCount, existingEntriesCount, skippedUpdates }
export async function planSync(accessToken, options = {}) {
  const { events, existingEntries, subjectExpr, window } = await preparePlanningInputs(accessToken, options);
  const planning = await planTimeEntryOperations(events, existingEntries, { subjectExpr });
  return { window, events, existingEntries, subjectExpr, ...planning };
}