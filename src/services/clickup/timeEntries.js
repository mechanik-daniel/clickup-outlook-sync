import { apiFetch, isClickUpEnabled } from './client.js';
import { logger } from '../../util/logger.js';
import { config } from '../../config/index.js';

// Shape: { taskId, start, end, description }
export async function createTimeEntry(entry) {
  if (!isClickUpEnabled()) {
    logger.warn('ClickUp disabled (no token) - skipping createTimeEntry');
    return { simulated: true };
  }
  if (!config.clickup.teamId) throw new Error('CLICKUP_TEAM_ID missing');
  const payload = {
    description: entry.description || '',
    tags: [],
    start: entry.start,
    end: entry.end,
    // ClickUp derives duration from start/end; we still compute it for planning
    tid: entry.taskId
  };
  return apiFetch(`/team/${config.clickup.teamId}/time_entries`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateTimeEntry(id, patch) {
  if (!isClickUpEnabled()) {
    logger.warn('ClickUp disabled (no token) - skipping updateTimeEntry');
    return { simulated: true };
  }
  return apiFetch(`/time_entry/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch)
  });
}

// Fetch existing time entries for the active window (start,end in ms epoch)
export async function fetchTimeEntriesWithinWindow(startMs, endMs) {
  if (!isClickUpEnabled()) {
    logger.warn('ClickUp disabled (no token) - skipping fetchTimeEntriesWithinWindow');
    return [];
  }
  if (!config.clickup.teamId) throw new Error('CLICKUP_TEAM_ID missing');
  // ClickUp API supports querying by team with start_date & end_date (ms epoch)
  const path = `/team/${config.clickup.teamId}/time_entries?start_date=${startMs}&end_date=${endMs}`;
  const json = await apiFetch(path, { method: 'GET' });
  return json && Array.isArray(json.data) ? json.data : [];
}
