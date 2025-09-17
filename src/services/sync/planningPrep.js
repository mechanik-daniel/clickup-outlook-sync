import { fetchCalendarView } from '../outlook/fetchCalendarView.js';
import { fetchTimeEntriesWithinWindow } from '../clickup/timeEntries.js';
import { config } from '../../config/index.js';
import { logger } from '../../util/logger.js';
import jsonata from 'jsonata';

function toLocalOffsetIso(date) {
  const pad = n => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}${sign}${offH}:${offM}`;
}

export function computeWindow(now = new Date()) {
  let startDate;
  if (config.sync.hardStartDate) {
    const [y, m, d] = config.sync.hardStartDate.split('-').map(Number);
    startDate = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  } else {
    startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - config.sync.activeWindowMonths);
  }
  const start = config.sync.hardStartDate ? toLocalOffsetIso(startDate) : startDate.toISOString();
  const end = now.toISOString();
  return { start, end, startDate, now };
}

export async function preparePlanningInputs(accessToken, { includeEvents = true, includeExisting = true } = {}) {
  const window = computeWindow();
  const padMs = (config.sync.windowPaddingMinutes || 0) * 60000;
  let events = [];
  if (includeEvents) {
    events = await fetchCalendarView(accessToken, { start: window.start, end: window.end, category: config.sync.targetCategory, timezone: config.sync.outlookTimezone });
    logger.debug('Fetched Outlook events', { count: events.length });
  }
  let existingEntries = [];
  if (includeExisting) {
    const existingEntriesRaw = await fetchTimeEntriesWithinWindow(Date.parse(window.start) - padMs, Date.parse(window.end) + padMs);
    existingEntries = existingEntriesRaw.map(e => ({
      ...e,
      start: e.start !== undefined ? Number(e.start) : e.start,
      stop: e.stop !== undefined ? Number(e.stop) : e.stop,
      end: e.end !== undefined ? Number(e.end) : e.end,
      duration: e.duration !== undefined ? Number(e.duration) : e.duration
    }));
    logger.debug('Fetched ClickUp existing entries', { count: existingEntries.length });
  }
  let subjectExpr;
  try {
    subjectExpr = jsonata(config.sync.subjectTransformExpression || '$trim($)');
  } catch (e) {
    logger.error('Invalid SUBJECT_TRANSFORM_JSONATA expression, falling back to $trim($)', { error: e.message });
    subjectExpr = jsonata('$trim($)');
  }
  return { events, existingEntries, subjectExpr, window, padMs };
}
