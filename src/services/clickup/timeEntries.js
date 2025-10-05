import { apiFetch, isClickUpEnabled } from './client.js';
import { logger } from '../../util/logger.js';
import { config } from '../../config/index.js';

// Shape: { taskId, start, stop, duration?, description }
export async function createTimeEntry(entry) {
  if (!isClickUpEnabled()) {
    logger.warn('ClickUp disabled (no token) - skipping createTimeEntry');
    return { simulated: true };
  }
  if (!config.clickup.teamId) throw new Error('CLICKUP_TEAM_ID missing');
  const duration = (typeof entry.stop === 'number' && typeof entry.start === 'number')
    ? Math.max(0, entry.stop - entry.start)
    : (typeof entry.duration === 'number' ? entry.duration : null);
  if (!duration || duration <= 0) {
    logger.warn('Refusing to create time entry with non-positive duration', { start: entry.start, stop: entry.stop, duration });
    throw new Error('Non-positive duration for time entry');
  }
  const payload = {
    description: entry.description || '',
    tags: [],
    start: entry.start,
    stop: entry.stop || (entry.start + duration),
    duration,
    tid: entry.taskId
  };
  logger.debug('Creating ClickUp time entry', { taskId: entry.taskId, start: entry.start, stop: payload.stop, duration });
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
  const body = { ...patch };
  if (body.end && !body.stop) { // normalize accidental caller usage
    body.stop = body.end;
    delete body.end;
  }
  if (body.start && body.stop && !body.duration) {
    const d = body.stop - body.start;
    if (d > 0) body.duration = d; else delete body.duration;
  }
  if (!config.clickup.teamId) throw new Error('CLICKUP_TEAM_ID missing');
  return apiFetch(`/team/${config.clickup.teamId}/time_entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

// Fetch existing time entries for the active window (start,end in ms epoch)
export async function fetchTimeEntriesWithinWindow(startMs, endMs) {
  if (!isClickUpEnabled()) {
    logger.warn('ClickUp disabled (no token) - skipping fetchTimeEntriesWithinWindow');
    return [];
  }
  if (!config.clickup.teamId) throw new Error('CLICKUP_TEAM_ID missing');
  const maxPages = Math.max(1, config.clickup.timeEntriesMaxPages || 1);
  const pageSize = Math.max(1, config.clickup.timeEntriesPageSize || 100);
  const all = [];
  let page = 0;
  let more = true;
  while (more && page < maxPages) {
    const path = `/team/${config.clickup.teamId}/time_entries?start_date=${startMs}&end_date=${endMs}&page=${page}&limit=${pageSize}`;
    logger.debug('Fetching ClickUp time entries window page', { page, path, startMs, endMs });
    let json;
    try {
      json = await apiFetch(path, { method: 'GET' });
    } catch (e) {
      logger.error('Failed to fetch ClickUp time entries page', { error: e.message, page, path });
      break;
    }
    let entries = [];
    if (json) {
      if (Array.isArray(json.data)) entries = json.data;
      else if (Array.isArray(json.time_entries)) entries = json.time_entries;
      else if (Array.isArray(json)) entries = json;
    }
    if (!entries.length) {
      if (page === 0 && all.length === 0) {
        const keys = json && typeof json === 'object' ? Object.keys(json) : [];
        logger.warn('No ClickUp time entries returned for window (page 0)', { keys, startMs, endMs });
      }
      // Empty page => stop
      more = false;
    } else {
      const sample = entries[0];
      logger.debug('Fetched ClickUp time entries page summary', { page, count: entries.length, sampleKeys: Object.keys(sample || {}).slice(0, 10) });
      all.push(...entries);
      if (entries.length < pageSize) {
        more = false; // last page (short)
      } else {
        page += 1;
      }
    }
  }
  // Optional: log if we likely truncated
  if (page >= maxPages) {
    logger.warn('Reached max pages limit for time entries fetch; results may be truncated', { fetched: all.length, maxPages, pageSize });
  }
  return all;
}

// Fetch a single time entry by id (used as fallback when window query misses an expected mapping)
export async function fetchTimeEntryById(id) {
  if (!isClickUpEnabled()) return null;
  if (!id) return null;
  if (!config.clickup.teamId) throw new Error('CLICKUP_TEAM_ID missing');
  try {
    const json = await apiFetch(`/team/${config.clickup.teamId}/time_entries/${id}`, { method: 'GET' });
    // API sometimes returns { data: {...} } or direct object
    const te = json && json.data ? json.data : json;
    if (!te || typeof te !== 'object') return null;
    return te;
  } catch (e) {
    logger.warn('Failed to fetch single ClickUp time entry (may be deleted)', { id, error: e.message });
    return null;
  }
}
