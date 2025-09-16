import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../util/logger.js';
import { projectRoot } from '../util/paths.js';

function mappingFilePath() {
  return path.isAbsolute(config.storage.mappingPath)
    ? config.storage.mappingPath
    : path.join(projectRoot, config.storage.mappingPath);
}

export function loadMapping() {
  const file = mappingFilePath();
  if (!existsSync(file)) return { version: 2, entries: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    // Migrate legacy structure (no version) assumed keyed by Outlook eventId -> re-key will occur lazily during sync when iCalUId known.
    if (!data.version) {
      logger.info('Migrating legacy mapping to version 2');
      return { version: 2, legacy: data.entries || data, entries: {} };
    }
    return data;
  } catch (e) {
    logger.warn('Failed to read mapping file, starting fresh', { file, error: e.message });
    return { version: 2, entries: {} };
  }
}

export function saveMapping(mapping) {
  const file = mappingFilePath();
  const dir = path.dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(mapping, null, 2));
}

export function upsertMapping(mapping, iCalUId, clickupTimeEntryId, meta = {}) {
  mapping.entries[iCalUId] = { clickupTimeEntryId, meta, updatedAt: new Date().toISOString() };
}

export function rekeyFromLegacy(mapping, events) {
  if (!mapping.legacy) return;
  const byId = new Map(events.map(e => [e.id, e]));
  Object.entries(mapping.legacy).forEach(([oldEventId, val]) => {
    const ev = byId.get(oldEventId);
    if (ev && (ev.iCalUId || ev.uid)) {
      const key = ev.iCalUId || ev.uid;
      if (!mapping.entries[key]) {
        mapping.entries[key] = { ...val, migratedFrom: oldEventId, migratedAt: new Date().toISOString() };
      }
    }
  });
  delete mapping.legacy;
}

export function findOrphans(mapping, currentICalUIds, _activeWindowStartIso) {
  const orphans = [];
  Object.entries(mapping.entries).forEach(([ical, record]) => {
    if (!currentICalUIds.has(ical)) {
      // Simple orphan detection (future: track lastSeen).
      orphans.push({ iCalUId: ical, clickupTimeEntryId: record.clickupTimeEntryId });
    }
  });
  return orphans;
}
