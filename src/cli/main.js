import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { stagingDir } from '../util/paths.js';
import { logger } from '../util/logger.js';
import { getAccessToken } from '../auth/tokenManager.js';
import { fetchCalendarView } from '../services/outlook/fetchCalendarView.js';
import { config } from '../config/index.js';

async function run() {
  try {
    const accessToken = await getAccessToken();
    const now = new Date();
    const monthsBack = config.sync.activeWindowMonths;
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - monthsBack);
    // Only go up to 'now' (past-only sync); adjust if future inclusion is desired
    const start = startDate.toISOString();
    const end = now.toISOString();
    const category = config.sync.targetCategory;
    const events = await fetchCalendarView(accessToken, { start, end, category });
    // Derive category stats
    const categoryCounts = events.reduce((acc, e) => {
      (e.categories || []).forEach(c => { acc[c] = (acc[c] || 0) + 1; });
      if (!e.categories || e.categories.length === 0) acc['__uncategorized__'] = (acc['__uncategorized__'] || 0) + 1;
      return acc;
    }, {});
    if (!existsSync(stagingDir)) mkdirSync(stagingDir, { recursive: true });
    const latestPath = path.join(stagingDir, 'outlook_events_latest.json');
    const datedPath = path.join(stagingDir, `outlook_events_${start.substring(0,10)}.json`);
    writeFileSync(latestPath, JSON.stringify({ fetchedAt: new Date().toISOString(), count: events.length, categoryFilter: category, categoryCounts, start, end, events }, null, 2));
    writeFileSync(datedPath, JSON.stringify(events, null, 2));
    logger.info('Fetched events', { count: events.length, latestPath, categoryFilter: category, categoryCounts });
  } catch (e) {
    logger.error('Run failed', { error: e.message, stack: e.stack });
    process.exitCode = 1;
  }
}

run();