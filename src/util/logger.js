const LEVELS = ['debug', 'info', 'warn', 'error'];
const currentLevel = process.env.LOG_LEVEL || 'info';
const levelIdx = Math.max(0, LEVELS.indexOf(currentLevel));
const COLOR_ENABLED = (process.env.LOG_FORMAT || '').toLowerCase() !== 'json';

const COLORS = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m',
  dim: '\x1b[2m'
};

function fmtMeta(meta) {
  if (!meta) return '';
  try { return JSON.stringify(meta); } catch { return String(meta); }
}

function log(level, msg, meta) {
  if (LEVELS.indexOf(level) < levelIdx) return;
  const time = new Date().toISOString();
  if (!COLOR_ENABLED) {
    const payload = { time, level, msg, ...(meta ? { meta } : {}) };
    console.log(JSON.stringify(payload));
    return;
  }
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const dim = COLORS.dim;
  const metaStr = meta ? ' ' + dim + fmtMeta(meta) + reset : '';
  console.log(`${dim}${time}${reset} ${color}${level.toUpperCase().padEnd(5)}${reset} ${msg}${metaStr}`);
}

export const logger = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta)
};