import 'dotenv/config';
import { logger } from '../util/logger.js';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  outlook: {
    clientId: required('OUTLOOK_CLIENT_ID'),
    clientSecret: required('OUTLOOK_CLIENT_SECRET'),
    tenantId: required('OUTLOOK_TENANT_ID'),
    refreshToken: required('OUTLOOK_REFRESH_TOKEN'),
    scope: 'offline_access Calendars.Read'
  },
  sync: {
    activeWindowMonths: parseInt(process.env.ACTIVE_WINDOW_MONTHS || '3', 10),
  targetCategory: process.env.TARGET_EVENT_CATEGORY || null,
  clickupTaskIdRegex: process.env.CLICKUP_TASK_ID_REGEX || '^[A-Za-z0-9_-]{6,15}$',
  clickupPrefixedPattern: process.env.CLICKUP_TASK_ID_PREFIX || 'tid#'
  }
};

logger.debug('Loaded config', { config: { ...config, outlook: { ...config.outlook, clientSecret: '***', refreshToken: '***' } } });