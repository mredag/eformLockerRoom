# AGENTS.md — Working In This Repository

This guide briefs agents on how to navigate and extend the eForm Locker System with a focus on the kiosk (port 3002), locker fetching/rendering, RFID flows, and DB-backed assignments. Keep changes minimal and aligned with the existing architecture.

## Quick Orientation

- Workspaces:
  - `app/kiosk` — Kiosk service (UI + APIs + hardware; Modbus + RFID)
  - `app/panel` — Admin interface (Turkish UI)
  - `app/gateway` — API coordinator/auth
  - `shared` — Cross‑service TypeScript libraries (DB, services, i18n, zones)
- Config: `config/*.json` and `config/system.json` (zones)
- DB: SQLite via `shared/database/*` + `migrations/*.sql`
- Docs: See also `docs/kiosk-panel-system-research.md` for deep kiosk details.

## Coding Conventions

- Language: TypeScript (Node 20+). 2‑space indentation.
- File names: kebab-case (e.g., `locker-state-manager.ts`); classes PascalCase; vars/functions camelCase; constants UPPER_SNAKE.
- Prefer named exports in `shared/*`; avoid side-effects; use `src/index.ts` as entry points.
- Keep Fastify routes/controllers thin; push logic into `shared/services/*` and repository layer under `shared/database/*`.
- DB status values: use English canonical values (`Free`, `Owned`, `Opening`, `Error`, `Blocked`). UI mapping to Turkish happens in services/UI.

## Kiosk: Fetching Lockers

- Zone-aware endpoints are defined in `app/kiosk/src/index.ts`:
  - `GET /api/lockers/available?kiosk_id={id}&zone={zone?}` → array of Free lockers.
  - `GET /api/lockers/all?kiosk_id={id}&zone={zone?}` → array of all lockers with status and hardware mapping.
- Endpoints derive a zone-aware layout from `shared/services/locker-layout-service.ts` and combine with live DB state via `shared/services/locker-state-manager.ts`.
- Dynamic UI layout/tiles (for kiosk rendering) live in `app/kiosk/src/controllers/ui-controller.ts`:
  - `GET /api/ui/layout?kioskId={id}&zone={zone?}` → `{ success, layout, stats, gridCSS }`
  - `GET /api/ui/tiles?kioskId={id}&zone={zone?}` → HTML tiles

## Kiosk: Rendering the Locker Grid (UI)

- UI entry: `app/kiosk/src/ui/index.html` loads `static/app-simple.js`.
- Frontend logic: `app/kiosk/src/ui/static/app-simple.js`
  - Calls `GET /api/ui/layout` to get grid dimensions + `gridCSS`.
  - Builds tiles from `layout.lockers[]` (includes `displayName`, `cardId`, `relayId`).
  - During a selection session, hides tiles not in `state.availableLockers`.
  - Accessibility and Turkish labels are baked in.

## RFID Collection Paths

Two supported flows — pick one consistently per deployment:

1) Frontend HID keyboard emulation (UI)
   - File: `app/kiosk/src/ui/static/app-simple.js`
   - Buffers keystrokes until Enter; then calls kiosk APIs.
   - Uses raw card text as `cardId`.

2) Backend `node-hid` reader
   - File: `app/kiosk/src/hardware/rfid-handler.ts`
   - Standardizes card data and hashes with SHA‑256 (first 16 hex chars) before emitting `card_scanned`.
   - Bound in `app/kiosk/src/index.ts` to `RfidUserFlow` (`app/kiosk/src/services/rfid-user-flow.ts`).

Important: Ensure consistent card ID policy (raw vs. hashed) across the chosen path. The DB will store what you pass into `LockerStateManager.assignLocker(...)`.

## Assignment & Release Rules

- Primary UI endpoints (controller: `app/kiosk/src/controllers/ui-controller.ts`):
  - `GET /api/card/:cardId/locker` — check existing assignment.
  - `POST /api/locker/assign` — `{ cardId, lockerId, kioskId }`.
  - `POST /api/locker/release` — `{ cardId, kioskId }`.
  - `POST /api/lockers/select` — session-aware selection (`session_id` required).
- Always route DB changes via `shared/services/locker-state-manager.ts`:
  - `assignLocker(kioskId, lockerId, 'rfid', cardId)` — validates transition, VIP flag, one-card-one-locker; optimistic locking with `version`; logs `RFID_ASSIGN`.
  - `confirmOwnership(kioskId, lockerId)` — sets `owned_at`, broadcasts state.
  - `releaseLocker(kioskId, lockerId, cardId?)` — clears ownership to `Free`, logs release.
- Hardware opening via `ModbusController.openLocker(lockerId, optionalSlave?)` with retries and health metrics. On hardware failure, release the assignment and return structured error codes.

## Zones & Layout

- Config keys (`config/system.json`):
  - `features.zones_enabled: boolean`
  - `zones[]`: `{ id, name?, enabled, ranges: [start, end][], relay_cards: number[] }`
- Helpers in `shared/services/zone-helpers.ts`:
  - `getLockersInZone`, `getLockerPositionInZone`, `computeHardwareMappingFromPosition`, `getZoneAwareHardwareMapping`.
- Layout service `shared/services/locker-layout-service.ts`:
  - `generateLockerLayout(kioskId, zoneId?)` — yields lockers with display names and hardware mapping.
  - Auto-syncs DB to hardware channel count via `LockerStateManager.syncLockersWithHardware()`.

## Database Layer

- Use `DatabaseConnection` (`shared/database/connection.ts`) for SQLite access (WAL mode, optimistic locking patterns).
- Repositories under `shared/database/*` (e.g., `locker-repository.ts`) implement query helpers if needed.
- Schema is created via `migrations/*.sql`; core tables in `001_initial_schema.sql` (e.g., `lockers`, `events`).

## Testing Guidance

- Frameworks: Vitest (kiosk/gateway/panel/shared). Tests co-located as `*.test.ts` or under `__tests__`.
- For DB logic, prefer the in-memory DB (`DatabaseConnection.getInstance(':memory:')`) as used in repo tests.
- Mock hardware/IO. Do not drive real RS-485 or modify production DB in unit tests.

## Do / Don’t

- Do keep controllers thin; prefer adding logic to `shared/services/*`.
- Do respect status values and transitions enforced by `LockerStateManager`.
- Do honor zone-aware behavior when fetching/operating lockers if zones are enabled.
- Don’t bypass services with ad-hoc SQL for state changes.
- Don’t mix raw and hashed card IDs within the same flow.

## Useful Entry Points (Paths)

- Kiosk APIs: `app/kiosk/src/index.ts`, `app/kiosk/src/controllers/ui-controller.ts`
- UI runtime: `app/kiosk/src/ui/static/app-simple.js`
- State & DB: `shared/services/locker-state-manager.ts`
- Layout & zones: `shared/services/locker-layout-service.ts`, `shared/services/zone-helpers.ts`
- Hardware: `app/kiosk/src/hardware/modbus-controller.ts`

## Recent Changes You Should Know

- Second‑Scan Decision Screen (Idea 5)
  - Frontend: `app/kiosk/src/ui/static/app-simple.js`
    - On existing‑card scan, shows decision overlay via `showOwnedDecision(cardId, lockerId)`.
    - “Eşyamı almak için aç” → `openOwnedLockerOnly(cardId)` → no DB change.
    - “Dolabı teslim etmek istiyorum” → existing `openAndReleaseLocker`.
  - Backend: `POST /api/locker/open-again` in `app/kiosk/src/controllers/ui-controller.ts` to open without releasing.
  - Docs: `docs/developer-guides/second-scan-decision-screen.md`.

- Cleanup
  - Removed portable demo folder `portable-kosks/` (kept out of repo to avoid confusion; use kiosk UI directly).
  - Removed zero‑length scripts: `scripts/start-dual-kiosks.sh`, `scripts/maintenance/install-production.sh`, and stray `fix-config-to-32-lockers.js`.
  - If you add new scripts, wire them in `package.json` or document in `scripts/README.md`.
