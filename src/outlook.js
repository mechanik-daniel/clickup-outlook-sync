import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';

function getAccessToken() {
  // TODO: Implement OAuth2 token retrieval using env vars
  // For now, use OUTLOOK_REFRESH_TOKEN from .env
  return process.env.OUTLOOK_REFRESH_TOKEN;
}

export async function fetchOutlookEvents() {
  const accessToken = getAccessToken();
  if (!accessToken) throw new Error('Missing Outlook access token');

  const client = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });

  // Example: fetch events for the next week
  const now = new Date().toISOString();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const events = await client
    .api('/me/events')
    .filter(`start/dateTime ge '${now}' and start/dateTime le '${nextWeek}'`)
    .get();

  return events.value;
}
