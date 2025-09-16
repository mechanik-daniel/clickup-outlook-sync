# Outlook → ClickUp Sync (One-Way)

Automates exporting Outlook calendar events (within an active window) and extracting ClickUp task IDs so they can be synced as time entries in ClickUp (ClickUp integration to be added). Only Outlook → ClickUp; Outlook is never modified.

## Status
Current capabilities:
- OAuth2 (refresh token) → access token retrieval with caching.
- Fetch calendar events via Microsoft Graph `calendarView` within a past-only active window (configurable months back).
- Optional category filtering (only process events matching a specific Outlook category).
- Robust staging output (`staging/outlook_events_latest.json` + dated snapshots).
- Task ID extraction strategies:
  1. body_exact (entire stripped body is ID)
  2. prefixed (pattern `tid#<ID>`)
  3. url_embedded (ClickUp URL in HTML) / url_full_body (body contains only the URL)
  4. *_unvalidated variants (pattern found but not matching strict regex)
- Logging (JSON lines) with severity levels.
- ESLint + EditorConfig for consistent formatting.

Pending (next milestones):
- ClickUp API client + time entry creation/update.
- Mapping store (eventId ↔ timeEntryId) with pruning outside active window.
- Delta sync logic & conflict detection.
- CLI commands for dry-run vs apply.
- Tests (unit + integration) & error backoff.

## ClickUp Integration (In Progress)
Scaffolding added (client, time entry placeholders, dry-run planner & mapping store) but not yet performing real API writes unless `CLICKUP_API_TOKEN` is set.

Run a dry-run planning pass:
```
npm run sync:dry-run
```
Outputs proposed operations to `staging/clickup_dry_run.json`.

Additional env vars:
```
CLICKUP_API_TOKEN=
CLICKUP_TEAM_ID=
MAPPING_STORE_PATH=data/mapping.json
```

## Project Structure
```
src/
  auth/          tokenManager.js          (refresh → access token caching)
  cli/           main.js                  (current entry command)
  config/        index.js                 (env + validation)
  services/
    outlook/     fetchCalendarView.js, taskIdExtractor.js
  util/          logger.js, paths.js, html.js
staging/         (ignored) latest & snapshot JSON exports
PROJECT_PLAN.md  High-level planning
AUTH_SETUP.md    OAuth setup instructions
eslint.config.js ESLint flat config
```

## Environment Variables
Required:
- OUTLOOK_CLIENT_ID
- OUTLOOK_CLIENT_SECRET
- OUTLOOK_TENANT_ID
- OUTLOOK_REFRESH_TOKEN

Optional / Sync behavior:
- TARGET_EVENT_CATEGORY (only sync events having this Outlook category)
- ACTIVE_WINDOW_MONTHS (default 3; past-only window start)
- CLICKUP_TASK_ID_REGEX (strict validation; default `^[A-Za-z0-9_-]{6,15}$`)
- CLICKUP_TASK_ID_PREFIX (default `tid#`)
- LOG_LEVEL (debug | info | warn | error; default info)

Example `.env` snippet:
```
OUTLOOK_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OUTLOOK_CLIENT_SECRET=yourSecret
OUTLOOK_TENANT_ID=tenant-guid
* ACTIVE_WINDOW_MONTHS: Rolling window size (months) to fetch events (ignored if HARD_START_DATE set).
* HARD_START_DATE: Optional fixed start date (YYYY-MM-DD, local midnight) overriding rolling window.
* SUBJECT_TRANSFORM_JSONATA: Optional JSONata expression applied to Outlook subject to produce ClickUp time entry description (default: $trim($)).
TARGET_EVENT_CATEGORY=Billable
ACTIVE_WINDOW_MONTHS=3
CLICKUP_TASK_ID_REGEX=^[A-Za-z0-9_-]{6,15}$
CLICKUP_TASK_ID_PREFIX=tid#
LOG_LEVEL=info
```

## Install & Run
Install dependencies:
```
npm install
```
Fetch Outlook events & extract task IDs:
```
npm run fetch:outlook
```
Outputs:
- `staging/outlook_events_latest.json` (rich metadata + extraction results)
- `staging/outlook_events_<YYYY-MM-DD>.json` (raw events array)
- `staging/outlook_events_unmatched.json` (only if some events lacked a task ID)

## Task ID Extraction Logic
Order of detection:
1. Embedded ClickUp URL in raw HTML (`https://app.clickup.com/t/{TASK_ID}`) → method: `url_embedded`
2. Body text containing only a ClickUp URL → `url_full_body`
3. Entire stripped body equals a valid ID → `body_exact`
4. Prefixed pattern (`tid#<ID>`) anywhere in text → `prefixed`
5. Variants not passing regex validation get `_unvalidated` suffix.

You can tune patterns via `CLICKUP_TASK_ID_REGEX` and `CLICKUP_TASK_ID_PREFIX`.

## Active Window
Currently: past-only from (now - ACTIVE_WINDOW_MONTHS) → now.
Future: separate future window (e.g. upcoming scheduled work) optional.

## Logging
Structured JSON to stdout. Fields:
```
{ time, level, msg, meta }
```
Change level with `LOG_LEVEL=debug` for deeper diagnostics.

## Roadmap
Short-term:
- Add ClickUp client (token auth) & create placeholder time entry calls
- Implement mapping store (JSON first) + pruning
- Introduce sync orchestrator (delta detection: create / update / skip)
- Add dry-run flag and verbose CLI options

Medium-term:
- Retry/backoff for Graph & ClickUp 429/5xx
- SQLite-backed mapping for robustness
- Unit tests (tokenManager, extractor, calendar fetch)
- Structured error classification

Long-term:
- Parallelization for large windows (paging)
- Metrics / health endpoint
- Packaging as a Docker image or standalone binary (pkg / nexe)

## Contributing Workflow
1. Create feature branch
2. Run `npm run lint:fix`
3. Run command(s) to produce staging artifacts
4. Commit (never commit `.env`, `staging/`, or secrets)

## Security Notes
- Refresh token is sensitive; rotate if exposed.
- Never commit `.env` or staging outputs.
- Consider Azure App Registration secret rotation schedule aligned with secret expiry.

## Support / Next Steps
Ask for: ClickUp integration scaffolding; mapping store implementation; improved filtering (e.g., skip declined events). Provide the direction and I’ll implement next.

---
This README is generated to reflect the current code after refactor & extraction features.
