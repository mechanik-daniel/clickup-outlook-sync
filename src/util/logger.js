const LEVELS = ['debug', 'info', 'warn', 'error'];
const currentLevel = process.env.LOG_LEVEL || 'info';
const levelIdx = LEVELS.indexOf(currentLevel);

function log(level, msg, meta) {
  if (LEVELS.indexOf(level) < levelIdx) return;
  const time = new Date().toISOString();
  const payload = { time, level, msg, ...(meta ? { meta } : {}) };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export const logger = {
  debug: (m, meta) => log('debug', m, meta),
  info: (m, meta) => log('info', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  error: (m, meta) => log('error', m, meta),
};