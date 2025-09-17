import { Client } from '@microsoft/microsoft-graph-client';
import { logger } from '../../util/logger.js';

export async function fetchCalendarView(accessToken, { start, end, timezone = 'UTC', category = null }) {
  const client = Client.init({ authProvider: (done) => done(null, accessToken) });
  let url = `/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  const request = client
    .api(url)
    .header('Prefer', `outlook.timezone="${timezone}"`)
    .top(400)
  // Explicit select to ensure stable identity fields are present
    .select('id,subject,body,bodyPreview,start,end,categories,iCalUId,seriesMasterId');
  if (category) {
    // Graph supports filtering categories (collection of strings) with any()
    request.filter(`categories/any(c:c eq '${category.replace(/'/g, "''")}')`);
  }
  logger.debug('Fetching calendar view', { start, end, category: category || 'ALL' });
  const res = await request.get();
  return res.value || [];
}