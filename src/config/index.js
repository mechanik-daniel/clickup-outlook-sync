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
    scope: 'offline_access Calendars.Read',
  },
  sync: {
    activeWindowMonths: parseInt(process.env.ACTIVE_WINDOW_MONTHS || '3', 10),
  },
};

logger.debug('Loaded config', { config: { ...config, outlook: { ...config.outlook, clientSecret: '***', refreshToken: '***' } } });