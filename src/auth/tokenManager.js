import fetch from 'node-fetch';
import { config } from '../config/index.js';
import { logger } from '../util/logger.js';

let cached = { token: null, expiresAt: 0 };

export async function getAccessToken() {
  const now = Date.now();
  if (cached.token && now < cached.expiresAt - 60000) { // 60s early refresh buffer
    logger.debug('Using cached access token');
    return cached.token;
  }
  logger.info('Refreshing access token');
  const params = new URLSearchParams();
  params.append('client_id', config.outlook.clientId);
  params.append('client_secret', config.outlook.clientSecret);
  params.append('refresh_token', config.outlook.refreshToken);
  params.append('grant_type', 'refresh_token');
  params.append('scope', config.outlook.scope);
  const url = `https://login.microsoftonline.com/${config.outlook.tenantId}/oauth2/v2.0/token`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  if (!resp.ok) {
    const text = await resp.text();
    logger.error('Token refresh failed', { status: resp.status, text });
    throw new Error('Token refresh failed');
  }
  const json = await resp.json();
  const expiresIn = json.expires_in || 3600;
  cached = { token: json.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  if (json.refresh_token && json.refresh_token !== config.outlook.refreshToken) {
    logger.warn('A new refresh_token was returned; update .env manually if you want to rotate.');
  }
  logger.debug('Token refreshed', { expiresAt: new Date(cached.expiresAt).toISOString() });
  return cached.token;
}