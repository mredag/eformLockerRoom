# AGENTS.md — Working In This Repository

This playbook captures everything we have learned while modernising the eForm Locker System. Follow it to extend the platform without regressing locker assignment, auto-release, kiosk audio, or panel tooling. Keep changes focused, prefer shared services, and preserve the established configuration structure that operators already rely on.

## Quick Orientation

- Workspaces:
  - `app/kiosk` — Kiosk service (UI + APIs + hardware; Modbus + RFID)
  - `app/panel` — Admin interface (Turkish UI)
  - `app/gateway` — API coordinator/auth
  - `shared` — Cross-service TypeScript libraries (DB, services, i18n, zones)
- Config: `config/system.json` (full environment hierarchy) and `config/*.json`.
- DB: SQLite via `shared/database/*` + `migrations/*.sql`.
- Docs: `docs/kiosk-panel-system-research.md`, `SYSTEM_DOCUMENTATION.md` for architecture notes.

## Coding Conventions

- Language: TypeScript (Node 20+). 2-space indentation.
- File names: kebab-case (e.g., `locker-state-manager.ts`); classes PascalCase; vars/functions camelCase; constants UPPER_SNAKE.
- Prefer named exports in `shared/*`; avoid side-effects; use `src/index.ts` as entry points.
- Keep Fastify routes/controllers thin; push logic into `shared/services/*` and repository layer under `shared/database/*`.
- DB status values: use English canonical values (`Free`, `Owned`, `Opening`, `Error`, `Blocked`). UI mapping to Turkish happens in services/UI.

## Configuration & `system.json`

- `config/system.json` must retain the **full legacy hierarchy** (system, features, zones, services, hardware, security, lockers, qr, logging, i18n, monitoring, backup, network, maintenance). Do not trim sections—even if unused—because downstream tools expect the structure exactly as shipped.
- Never write to this file directly. Route every change through `ConfigManager.updateConfiguration()` so normalization, auditing, and seeded defaults stay intact.
- Auto-release is configured via `lockers.auto_release_hours`; nullable fields (e.g., `lockers.reserve_ttl_seconds`) must remain explicit `null` values, not `undefined` or deleted keys.
- When adding new settings:
  1. Extend typings in `shared/types/system-config.ts`.
  2. Seed defaults in `ConfigManager.getDefaultConfiguration()`.
  3. Update normalization helpers so admin saves and kiosk fetches remain compatible.
  4. Document the behaviour here so future agents know the canonical path.

## Locker State & Auto-release

- `shared/services/locker-state-manager.ts` is the **single source of truth** for locker lifecycle:
  - `assignLocker`, `confirmOwnership`, `releaseLocker`, `cleanupExpiredReservations`, `broadcastStateUpdate`.
  - Auto-release scheduler (`runCleanupCycle`, `computeNextCleanupDelayMs`) reads `lockers.auto_release_hours`, uses `computeNextCleanupDelayMs` to avoid long gaps, and logs `AUTO_RELEASE` events with metadata for audits.
  - Graceful shutdown is required; `app/gateway/src/index.ts` wires `LockerStateManager.shutdown()` to SIGINT/SIGTERM. Reuse that hook if you add new background work.
- WebSocket payloads expose ISO `ownedAt`/`reservedAt` strings and VIP flags. Any UI timers should rely on these fields rather than running fresh SQL queries.
- Tests live in `shared/services/__tests__/locker-auto-release.test.ts`; extend them whenever cleanup logic, thresholds, or event payloads change.

## Admin Panel (Lockers)

- Login redirects to `/lockers`; never regress this behaviour when adjusting auth or routing.
- Locker grid (`app/panel/src/views/lockers.html`):
  - Fetches `/api/hardware-config` to derive `auto_release_hours` and display countdown chips.
  - Keeps countdowns in sync through `updateAutoReleaseCountdowns()` and data attributes (`data-auto-release-*`). Preserve those attributes when touching markup.
  - Defaults kiosk selection to `kiosk-1` (or the first available). Helpers like `applyDefaultKioskSelection()` and `highlightActiveKiosk()` must remain wired after DOM updates.
- Sorting uses a Turkish `Intl.Collator` with numeric comparison for natural ordering. Reuse the shared collator for any new sort features.
- The sound settings page (`/panel/sound-config`) interacts with the same config pipeline as the kiosk. Any new audio controls must flow through the existing fetch/save helpers and ConfigManager normalization.

## Kiosk UI Essentials

- Frontend entry: `app/kiosk/src/ui/static/app-simple.js`.
  - Fetches layout via `/api/ui/layout`, builds the locker grid, and attaches `enableTouchScrolling()` so swipe gestures work on touchscreens.
  - The decision overlay (`showOwnedDecision`) exposes `btn-open-only` for the first ownership hour using `shouldShowOpenOnlyButton()` and ISO timestamps from the server. Keep helper logic consistent with backend payloads.
  - Audio feedback goes through `playSound()`, which respects `soundConfig.enabled`, master volume, and per-action volume clamps. Reuse this helper for any new feedback so the admin-configured sounds remain authoritative.
- API endpoints in `app/kiosk/src/controllers/ui-controller.ts` must delegate to `LockerStateManager`; avoid raw SQL or duplicate business logic.

## Database Layer

- Use `DatabaseConnection` (`shared/database/connection.ts`) for SQLite access (WAL mode, optimistic locking patterns).
- Repositories under `shared/database/*` (e.g., `locker-repository.ts`) encapsulate SQL helpers; prefer adding there rather than embedding queries in services.
- Schema is defined via `migrations/*.sql`; run migrations before relying on new columns or tables.

## Testing Guidance

- Framework: Vitest. Tests co-located as `*.test.ts` or under `__tests__`.
- For DB logic, prefer the in-memory DB (`DatabaseConnection.getInstance(':memory:')`).
- Mock hardware/IO; do not drive physical RS-485 or modify production DB in unit tests.
- Build each workspace before shipping. There is no umbrella script; run the four builds in sequence:
  - `npm run build:shared`
  - `npm run build:kiosk`
  - `npm run build:panel`
  - `npm run build:gateway`

## Guardrails

- Keep controllers thin; push logic into shared services where possible.
- Honor zone-aware behaviour when fetching/operating lockers if zones are enabled.
- Preserve countdown data attributes on locker cards so the auto-update ticker keeps working.
- Avoid mixing raw and hashed card IDs within the same flow.
- Validate configuration updates via `ConfigManager.updateConfiguration()`; never write to `system.json` directly.
- If you must touch `config/system.json` by hand for testing, restore the exact canonical structure before committing. A malformed schema breaks migrations, kiosk boot, and the admin panel.
