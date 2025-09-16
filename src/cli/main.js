import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { stagingDir } from '../util/paths.js';
import { logger } from '../util/logger.js';
import { getAccessToken } from '../auth/tokenManager.js';
import { fetchCalendarView } from '../services/outlook/fetchCalendarView.js';

async function run() {
  try {
    const accessToken = await getAccessToken();
    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const events = await fetchCalendarView(accessToken, { start, end });
    if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true });
    const latestPath = path.join(stagingDir, 'outlook_events_latest.json');
    const datedPath = path.join(stagingDir, `outlook_events_${start.substring(0,10)}.json`);
    writeFileSync(latestPath, JSON.stringify({ fetchedAt: new Date().toISOString(), count: events.length, events }, null, 2));
    writeFileSync(datedPath, JSON.stringify(events, null, 2));
    logger.info('Fetched events', { count: events.length, latestPath });
  } catch (e) {
    logger.error('Run failed', { error: e.message, stack: e.stack });
    process.exitCode = 1;
  }
}

run();