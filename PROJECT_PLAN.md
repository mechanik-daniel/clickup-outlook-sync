# Outlook-ClickUp Calendar Sync Project Plan

## Overview
This JavaScript project will automate the synchronization of Outlook calendar events with ClickUp time entries. The goal is to manage all time entries as calendar events, each marked with a specific category and containing the ClickUp task ID in the event description. The tool will periodically sync changes (deltas) between Outlook and ClickUp, ensuring no duplication and allowing updates to existing events (e.g., task ID, times, title).

## Key Features
- **Sync Outlook events to ClickUp time entries**
- **One-way sync only**: Events are synced from Outlook to ClickUp, never the other way around
- **Event categorization**: Only events with a specific category are managed
- **Task ID correlation**: Store ClickUp task ID in event description
- **Delta management**: Track and sync changes without duplication
- **Periodic sync**: Run multiple times a day, updating previous events
- **Customizable parameters**: Event category, sync interval, etc.

## High-Level Architecture
1. **Authentication**
   - Outlook: OAuth2 (Microsoft Graph API)
   - ClickUp: Personal API Token
2. **Event/Entry Mapping**
   - Use Outlook event ID and ClickUp time entry ID for correlation
   - Store mapping in a local database/file (e.g., SQLite, JSON)
3. **Sync Logic**
   - Define an "active window" (default: last 3 months)
   - Fetch events from Outlook (filtered by category and start date >= today - 3 months)
   - Compare Outlook events to existing ClickUp time entries within the active window
   - Create or update ClickUp time entries as needed
   - Never modify Outlook events based on ClickUp
   - Lock historical entries: Events older than the active window are excluded from sync and updates
   - Update mapping store and periodically prune entries older than the active window
4. **Configuration**
   - Use environment variables for secrets and parameters
   - Support for custom sync interval and event category

## Required Environment Variables
| Name                      | Description                                      |
|---------------------------|--------------------------------------------------|
| `OUTLOOK_CLIENT_ID`       | OAuth2 Client ID for Microsoft Graph API         |
| `OUTLOOK_CLIENT_SECRET`   | OAuth2 Client Secret for Microsoft Graph API     |
| `OUTLOOK_TENANT_ID`       | Azure Tenant ID                                  |
| `OUTLOOK_REFRESH_TOKEN`   | OAuth2 Refresh Token (if using offline access)   |
| `CLICKUP_API_TOKEN`       | Personal API Token for ClickUp                   |
| `TARGET_EVENT_CATEGORY`   | Category name for managed Outlook events         |
| `SYNC_INTERVAL_MINUTES`   | How often to run the sync (in minutes)           |
| `MAPPING_STORE_PATH`      | Path to local mapping store (e.g., `mapping.json`)|

## Customizable Parameters
- **Targeted event category**: Only events with this category are managed
- **Sync interval**: How often the sync runs
- **Mapping store path**: Where to persist event/time entry correlations
- **Active window duration**: Number of months to sync backwards (default: 3)

## Next Steps
1. Core project structure & dependencies (DONE - modular refactor)
2. Outlook authentication (refresh -> access) (DONE - token manager w/ caching)
3. Add ClickUp client & mapping store (PENDING)
4. Implement active window filtering in fetch layer (PENDING)
5. Sync logic (delta + create/update) (PENDING)
6. Config validation & logging (PARTIAL - basic added)
7. Tests & reliability (PENDING)
8. Scheduler / CLI commands (PARTIAL - fetch command added)

---
This document is intended for both human developers and Copilot agents to guide the implementation and configuration of the Outlook-ClickUp calendar sync tool.
