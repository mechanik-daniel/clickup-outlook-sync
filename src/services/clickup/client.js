import { logger } from '../../util/logger.js';
import { config } from '../../config/index.js';

const BASE = 'https://api.clickup.com/api/v2';

function ensureEnabled() {
  if (!config.clickup.apiToken) {
    throw new Error('CLICKUP_API_TOKEN not set. Cannot perform real ClickUp operations.');
  }
}

export async function apiFetch(path, options = {}) {
  ensureEnabled();
  const url = `${BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': config.clickup.apiToken,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    logger.error('ClickUp API error', { status: resp.status, path, text });
    throw new Error(`ClickUp API ${resp.status}`);
  }
  return resp.json();
}

export function isClickUpEnabled() {
  return !!config.clickup.apiToken;
}
