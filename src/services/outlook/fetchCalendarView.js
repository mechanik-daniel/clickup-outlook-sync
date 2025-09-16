import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
import { logger } from '../../util/logger.js';

export async function fetchCalendarView(accessToken, { start, end, timezone = 'UTC' }) {
  const client = Client.init({ authProvider: (done) => done(null, accessToken) });
  const url = `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  logger.debug('Fetching calendar view', { start, end });
  const res = await client
    .api(url)
    .header('Prefer', `outlook.timezone="${timezone}"`)
    .top(200)
    .get();
  return res.value || [];
}