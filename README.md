# Outlook → ClickUp Time Entry Sync (One-Way)

Production-focused prototype that converts Outlook calendar events into ClickUp time entries with a safe, inspectable workflow. One-way only: Outlook is never modified.

## Core Features

| Area | Feature |
|------|---------|
| Identity | Stable mapping via Outlook `iCalUId` (legacy event `id` auto-migrated) |
| Fetch | Microsoft Graph `calendarView` with configurable rolling window or fixed hard start date |
| Window Padding | Optional minutes pad on both ends to avoid TZ boundary misses |
| Task Detection | Multiple heuristics: URL embedded, URL only, body exact, prefixed `tid#`, validated vs unvalidated variants |
| Subject Transform | JSONata expression (`SUBJECT_TRANSFORM_JSONATA`) applied to event subject (async) |
| Time Entry Diff | Create / update / delete planning + no-op skip (1s tolerance) |
| Snapshot | Local snapshot of created/updated entries (start/stop/duration/desc/task) used for diff fallback |
| Mapping Store | JSON file keyed by `iCalUId`, with migration + orphan detection |
| Interactive Apply | Step-by-step confirmation with tabular preview & description |
| Dry Run | Generates `staging/clickup_dry_run.json` with full plan & metrics |
| Deletion Planning | Orphan detection produces delete ops (not yet executed automatically) |
| Logging | Colored console logs (set `LOG_FORMAT=json` for structured JSON) with levels debug→error |
| Timezone Control | `OUTLOOK_TIMEZONE` for Graph fetch; `DISPLAY_TIMEZONE` for UI; local-offset ISO for hard start |

## CLI Commands

| Command | Purpose |
|---------|---------|
| `npm run sync:dry-run` | Compute plan (create/update/delete) and write JSON report |
| `npm run sync:apply-interactive` | Recompute plan then interactively apply operations |
| `npm run fetch:outlook` | (Optional legacy) Raw event fetch & extraction staging (kept if needed) |
| `npm run lint` / `lint:fix` | Code quality |

## Dry Run Output (`staging/clickup_dry_run.json`)
Key fields:
```
{
  window: { start, end },
  totalEvents,
  plannedOperations,
  skippedUpdates,
  orphanCount,
  existingEntriesCount,
  existingEntries: [...],
  ops: [ { type, taskId, start, end, duration, description, reason? } ],
  unmatched: [ { id, iCalUId, subject, reason? } ]
}
```

## Environment Variables

Required (Outlook OAuth – existing refresh token flow):
```
OUTLOOK_CLIENT_ID
OUTLOOK_CLIENT_SECRET
OUTLOOK_TENANT_ID
OUTLOOK_REFRESH_TOKEN
```
Required (ClickUp writes):
```
CLICKUP_API_TOKEN
CLICKUP_TEAM_ID
```
Optional sync controls:
```
ACTIVE_WINDOW_MONTHS=3                 # Rolling window size (ignored if HARD_START_DATE set)
HARD_START_DATE=2024-11-01             # Fixed local date (midnight local) start
WINDOW_PADDING_MINUTES=120             # Extra minutes added before start & after end for ClickUp fetch
TARGET_EVENT_CATEGORY=Billable         # Only events with this Outlook category
OUTLOOK_TIMEZONE=Europe/Berlin         # For Graph calendarView
DISPLAY_TIMEZONE=Europe/Berlin         # For console display
CLICKUP_TASK_ID_REGEX=^[A-Za-z0-9_-]{6,15}$
CLICKUP_TASK_ID_PREFIX=tid#
SUBJECT_TRANSFORM_JSONATA=$trim($)     # JSONata applied to subject → description
LOG_LEVEL=info                         # debug|info|warn|error
LOG_FORMAT=pretty                      # pretty (default) or json
MAPPING_STORE_PATH=data/mapping.json
```

## How Sync Planning Works
1. Compute window (hard start or rolling months) and apply optional padding when querying ClickUp.
2. Fetch Outlook events (category-filtered if set) with stable `iCalUId` & times.
3. Extract task IDs via heuristics; skip events without valid task ID (captured in `unmatched`).
4. Fetch existing ClickUp time entries (padded window) and coerce numeric fields.
5. Build planned operations:
   - create: no mapping or remote entry missing
   - update: mapping + remote entry present & meaningful diff
   - delete: mapping present but event absent (orphan)
   - skip: unchanged within tolerance
6. Write JSON dry-run file; interactive flow shows a table & asks per-op confirmation.

## Interactive Apply Flow
For each operation you can:
`y` apply, `s` skip, `q` quit.
Table columns include: TYPE, Task, Local Start, Duration (m), Subject, Desc (transformed), Reason (e.g. `missing_remote`).

## Mapping & Snapshots
`data/mapping.json` example entry:
```
"040000008200E00074C5...": {
  "clickupTimeEntryId": "4735679484236829612",
  "meta": {
    "createdFrom": "interactive",
    "snapshot": { "start": 1756674000000, "stop": 1756674900000, "duration": 900000, "taskId": "abc123", "description": "Trimmed subject" }
  },
  "updatedAt": "2025-09-17T09:15:42.123Z"
}
```

Snapshots allow no-op detection even when ClickUp fetch window narrowly misses an entry (should be rare with padding).

## Logging Modes
Default pretty colorized output. Set `LOG_FORMAT=json` for structured machine parsing.

## Deletions
Delete operations are planned (type `delete`) but not executed yet (they are shown and can be safely ignored). Future enhancement: configurable grace + confirmation.

## Development
```
npm install
npm run lint:fix
npm run sync:dry-run
npm run sync:apply-interactive
```

## Roadmap (Next Improvements)
- Execute deletes with grace period & flag
- Automated tests for planner & extraction
- Retry/backoff for rate limits
- Optional strict diff (fail if unexpected missing remote)
- Export metrics (counts, durations) to a simple dashboard

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `existingEntriesCount` = 0 unexpectedly | Window boundary / no padding | Increase `WINDOW_PADDING_MINUTES` |
| Repeated create prompts | Missing mapping or wrong team ID | Verify `CLICKUP_TEAM_ID` & mapping file |
| Wrong times in summaries | Timezone mismatch | Set `OUTLOOK_TIMEZONE` & `DISPLAY_TIMEZONE` explicitly |
| No color logs | `LOG_FORMAT=json` set | Remove or set to other value |

## Security
Treat all tokens as secrets. Mapping file may include task IDs and descriptions—avoid committing sensitive data in descriptions if repository is public.

---
Reach out or open an issue for feature requests or clarifications.
