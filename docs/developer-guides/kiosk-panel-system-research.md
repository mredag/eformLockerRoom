# Kiosk Panel System – Technical Research

This document summarizes how the kiosk (port 3002) fetches lockers, renders the locker grid, collects RFID cards, and assigns lockers in the database. It references concrete code paths and APIs to guide new development for a locker assignment system.

## Scope

- Kiosk service: `app/kiosk` (UI + APIs + hardware integration)
- Shared services and DB: `shared/services/*`, `shared/database/*`, `migrations/*`
- Focus areas:
  - Fetching available/all lockers (zone-aware)
  - Rendering the locker grid (layout + CSS)
  - RFID card collection (UI keyboard + node-hid)
  - Assign/release flows and DB updates

## High-Level Architecture

- Web server: Fastify (`app/kiosk/src/index.ts` and controllers)
- UI: Static HTML/JS served by kiosk (`app/kiosk/src/ui/index.html`, `app/kiosk/src/ui/static/app-simple.js`)
- Hardware: Modbus RTU relay control (`app/kiosk/src/hardware/modbus-controller.ts`)
- RFID: Two modes
  - Frontend HID keyboard capture (`app-simple.js`)
  - Backend `node-hid` reader (`app/kiosk/src/hardware/rfid-handler.ts`)
- State & DB: `shared/services/locker-state-manager.ts`, SQLite via `shared/database/*` and migrations
- Layout & Zone-aware mapping: `shared/services/locker-layout-service.ts`, `shared/services/zone-helpers.ts`

## Data Model (DB)

- Core table (created by migrations): `lockers` (`migrations/001_initial_schema.sql`)
  - Columns: `kiosk_id`, `id`, `status` (`Free|Owned|Opening|Error|Blocked`), `owner_type` (`rfid|device|vip`), `owner_key`, timestamps, `is_vip`, `version` (optimistic locking)
  - Indexes: `idx_lockers_kiosk_status`, `idx_lockers_owner_key`
- Events table: `events` (audit of assignments, releases, errors)
- VIP contracts/tables: created in later migrations when needed

## Fetching Lockers (APIs)

Zone-aware APIs are mounted in `app/kiosk/src/index.ts`:

- `GET /api/lockers/available?kiosk_id={id}&zone={zone?}`
  - Returns an array of available lockers filtered by zone config: `[{ id, status: 'Free', is_vip }]`
  - Flow: generate zone-aware layout via `lockerLayoutService.generateLockerLayout()` → read each locker’s current DB status via `LockerStateManager.getLocker()` → include only `Free` and enabled.
  - Code: `index.ts` lines ~128–200

- `GET /api/lockers/all?kiosk_id={id}&zone={zone?}`
  - Returns all lockers’ statuses and hardware mapping: `[{ id, status, is_vip, owner_key, display_name, card_id, relay_id }]`
  - Same zone-aware layout approach, but includes all lockers with normalized extras.
  - Code: `index.ts` lines ~202–270

- Kiosk UI layout endpoints (served by controller):
  - `GET /api/ui/layout?kioskId={id}&zone={zone?}` → `{ success, layout, stats, gridCSS }`
    - `layout`: `{ rows, columns, totalLockers, lockers[] }`, where lockers include display names and card/relay mapping
  - `GET /api/ui/tiles?kioskId={id}&zone={zone?}` → HTML tiles string
  - Code: `app/kiosk/src/controllers/ui-controller.ts` (methods `getLockerLayout`, `getLockerTiles`)

Supporting services:

- `shared/services/locker-layout-service.ts`
  - `generateLockerLayout(kioskId, zoneId?)`: zone-aware selection of locker IDs, hardware mapping (card/relay), and display names via `LockerNamingService`.
  - `generateGridCSS()`: CSS for responsive kiosk grid.
  - `generateKioskTiles()`: HTML tile markup (also used by admin panel mode).
  - Auto-syncs DB to hardware when card/channel count increases via `LockerStateManager.syncLockersWithHardware()`.

- `shared/services/zone-helpers.ts`
  - `getLockersInZone`, `getLockerPositionInZone`, `computeHardwareMappingFromPosition`, `getZoneAwareHardwareMapping` implement the zone rules and the mapping formula: position→cardIndex=floor((pos-1)/16), coil=((pos-1)%16)+1.

## Rendering the Locker Grid (UI)

- UI entry: `app/kiosk/src/ui/index.html` loads `static/app-simple.js` and provides container elements (`#locker-grid`, state screens).
- Frontend logic: `app/kiosk/src/ui/static/app-simple.js`
  - On session start, calls `renderLockerGrid()`:
    - `GET /api/ui/layout` (zone-aware) to get `{ layout, stats, gridCSS }`.
    - Applies dynamic CSS via `applyDynamicGridCSS(gridCSS)`.
    - Iterates `layout.lockers` to create tiles with attributes: `data-locker-id`, `data-card-id`, `data-relay-id`, ARIA roles, Turkish labels.
    - Hides tiles not in `state.availableLockers` (only show available for selection during a session).
    - Updates tile status text via `updateLockerStatuses()`.
  - Touch-friendly feedback for tiles (haptic, ripple effect), keyboard accessibility, and responsive layout.
  - 30-second session timer UI with warning style under 10s.

## RFID Card Collection

Two input paths are implemented:

1) Frontend HID keyboard emulation (UI)
   - File: `app/kiosk/src/ui/static/app-simple.js`
   - Listens to `keydown` globally; buffers characters until Enter; debounces scans; `handleCardScan(cardId)` triggers the flow.
   - Sequence:
     - `GET /api/card/{cardId}/locker` to check existing assignment.
     - If present: open and release that locker.
     - If not: start locker selection by fetching `GET /api/lockers/available` and switching UI to session mode.

2) Backend HID device reader (`node-hid`)
   - File: `app/kiosk/src/hardware/rfid-handler.ts`
   - Supports `reader_type: 'hid' | 'keyboard'`.
   - Normalizes and hashes card ID: SHA-256, first 16 hex chars (`hashCardId`) for storage/privacy.
   - Emits `card_scanned` events with `{ card_id, scan_time, reader_id }`.
   - Bound in `app/kiosk/src/index.ts`:
     - `rfidHandler.on('card_scanned', scanEvent => rfidUserFlow.handleCardScanned(scanEvent))`.
   - Flow orchestrator: `app/kiosk/src/services/rfid-user-flow.ts`
     - `handleCardScanned` → branch on existing assignment.
     - No existing assignment → list available lockers (zone-aware via `lockerLayoutService`) and emit `show_available_lockers`.
     - Existing assignment → open with Modbus, then release (unless VIP).

Note on IDs: UI path sends raw card text; backend HID path stores/queries hashed IDs. Aligning these is important when mixing modes.

## Assignment and Release (Server + DB)

Primary entrypoints for the UI:

- `GET /api/card/:cardId/locker` (controller)
  - Calls `LockerStateManager.checkExistingOwnership(cardId, 'rfid')` and returns `{ hasLocker, lockerId }`.

- `POST /api/locker/assign` with `{ cardId, lockerId, kioskId }`
  - Steps:
    1. `LockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId)`
       - SQL: `UPDATE lockers SET status='Owned', owner_type='rfid', owner_key=?, reserved_at=?, owned_at=NULL, version=version+1 ... WHERE ... AND status IN ('Free', 'Free')`
       - Enforces: not VIP, no existing ownership (one-card-one-locker), optimistic locking via `version`.
       - Logs `EventType.RFID_ASSIGN` in `events`.
    2. If assigned, hardware open via `ModbusController.openLocker(lockerId)` (zone-aware mapping used elsewhere when applicable).
    3. On open success: `LockerStateManager.confirmOwnership(kioskId, lockerId)` updates `owned_at` and broadcasts state.
    4. On open failure: releases the assignment with `releaseLocker(...)` and returns an error code (`hardware_failed` or `hardware_unavailable`).
  - Response on success includes Turkish message with display name, e.g. `Dolap 12 açıldı ve atandı`.
  - Code: `app/kiosk/src/controllers/ui-controller.ts` (method `assignLocker`).

- Alternative route (session-based): `POST /api/lockers/select` with `{ locker_id, kiosk_id, session_id }`
  - Validates session contains the locker in `availableLockers`.
  - Proceeds with assignment + open + confirm; on failure releases and returns structured error for retry.
  - Code: `ui-controller.ts` (method `selectLocker`).

- `POST /api/locker/release` with `{ cardId, kioskId }`
  - Finds existing locker for the card, opens the locker, then releases ownership (`Free`).
  - Code: `ui-controller.ts` (method `releaseLocker`).

DB service details (`shared/services/locker-state-manager.ts`):

- `assignLocker(kioskId, lockerId, ownerType, ownerKey)`
  - Validates transitions, checks VIP flag, enforces one card-one locker.
  - Updates row with optimistic locking and logs `RFID_ASSIGN`.

- `confirmOwnership(kioskId, lockerId)`
  - Sets `owned_at` (keeps status `Owned`), broadcasts state.

- `releaseLocker(kioskId, lockerId, ownerKey?)`
  - Clears ownership; sets `status='Free'`; logs `RFID_RELEASE`/`QR_RELEASE`.

- `checkExistingOwnership(ownerKey, 'rfid')`
  - Returns `Locker | null` if current state is `Owned`/`Opening` with matching owner.

- `getAvailableLockers(kioskId)` and enhanced variants include display names via `LockerNamingService`.

## Sessions (UI and Server)

- Client shows a 30-second session with countdown for selection (`app-simple.js`).
- Server tracks in-memory sessions via `SessionManager` (`app/kiosk/src/controllers/session-manager.ts` used inside `UiController`):
  - One session per kiosk; expires/cancels when new card is scanned.
  - Endpoints:
    - `GET /api/session/status?kiosk_id={id}` → current session/remaining time
    - `POST /api/session/cancel` → cancel current session
    - `POST /api/session/retry` → refresh available lockers after a failure

## Hardware & Zone Awareness

- Zone middleware validates and logs zone context: `app/kiosk/src/middleware/zone-validation-middleware.ts`.
- Mapping logic: `shared/services/zone-helpers.ts` and `shared/services/locker-layout-service.ts`.
- Kiosk endpoints accept optional `zone` query and apply zone filtering when generating layout and available lockers.

## Key UI Flow (Frontend app-simple.js)

1. Idle screen: prompts “Kartınızı okutun”.
2. On RFID (keyboard) scan:
   - `GET /api/card/{cardId}/locker`
   - If has locker → open + release → show message → return to idle.
   - Else → `GET /api/lockers/available` → set `state.availableLockers`.
3. Session screen:
   - `GET /api/ui/layout` → build tiles; hide non-available tiles.
   - Click available tile → `POST /api/locker/assign`.
   - On success → display success, auto-return to idle.
   - On failure → Turkish error handling; optional retry.
4. 30-second countdown; on timeout → error display → idle.
5. Robust Turkish error catalog and connection monitoring update the header indicator.

## Important Files & Responsibilities

- `app/kiosk/src/index.ts`
  - Boots Fastify, mounts zone-aware APIs for `/api/lockers/available` and `/api/lockers/all`, binds RFID handler, health endpoints.

- `app/kiosk/src/controllers/ui-controller.ts`
  - Serves `/` and `/ui`, provides API endpoints for card lookup, assign/release, session ops, and dynamic layout/tiles.

- `app/kiosk/src/ui/index.html` and `app/kiosk/src/ui/static/app-simple.js`
  - Kiosk UI, dynamic grid rendering and full assignment UX.

- `app/kiosk/src/hardware/rfid-handler.ts`
  - Node HID or keyboard mode RFID reader; standardizes and hashes card IDs; emits `card_scanned`.

- `app/kiosk/src/services/rfid-user-flow.ts`
  - Back-end orchestrator for card scan paths (existing vs. no locker), zone-aware fetch, and open/release.

- `shared/services/locker-state-manager.ts`
  - All locker DB operations (assign/confirm/release), state transitions, event logging, and websocket broadcast.

- `shared/services/locker-layout-service.ts`
  - Generates zone-aware layout and CSS, ensures DB is in sync with hardware channel count, provides kiosk tiles.

- `shared/services/zone-helpers.ts`
  - Pure functions for zone positioning and hardware mapping.

## Request/Response Snapshots (Simplified)

- `GET /api/lockers/available?kiosk_id=kiosk-1&zone=mens`
  - → `[ { id: 1, status: 'Free', is_vip: false }, ... ]`

- `GET /api/lockers/all?kiosk_id=kiosk-1&zone=mens`
  - → `[ { id, status, is_vip, owner_key, display_name, card_id, relay_id }, ... ]`

- `GET /api/ui/layout?kioskId=kiosk-1`
  - → `{ success: true, layout: { rows, columns, totalLockers, lockers: [...] }, stats: { totalCards, enabledCards, totalChannels, configuredLockers, utilizationPercent }, gridCSS: "..." }`

- `GET /api/card/{cardId}/locker`
  - → `{ hasLocker: true, lockerId }` or `{ hasLocker: false }`

- `POST /api/locker/assign`
  - Body: `{ cardId, lockerId, kioskId }`
  - Success: `{ success: true, lockerId, message }`
  - Failure: `{ success: false, error: 'assignment_failed'|'hardware_unavailable'|'hardware_failed', message, hardware_status? }`

- `POST /api/locker/release`
  - Body: `{ cardId, kioskId }`
  - Success: `{ success: true, lockerId, message }`

- `GET /api/session/status?kiosk_id=kiosk-1`
  - → `{ has_session, session_id?, remaining_seconds?, available_lockers? }`

## Notes & Caveats

- Card ID normalization: UI (keyboard) uses raw text; backend HID uses hashed 16-char hex by default. Ensure consistency across flows for production.
- Zone consistency: `zone-validation-middleware` validates `zone` and logs context; `locker-layout-service` auto-sync can create missing lockers if hardware config increases channel count.
- Error handling is Turkish-first with clear guidance for users (e.g., `NO_LOCKERS_AVAILABLE`, `HARDWARE_OFFLINE`, `ASSIGNMENT_FAILED`).

## Quick Code Map

- Fetch available: `app/kiosk/src/index.ts` → `/api/lockers/available` → `lockerLayoutService` + `LockerStateManager`
- Fetch all: `app/kiosk/src/index.ts` → `/api/lockers/all` → `lockerLayoutService` + `LockerStateManager`
- Grid render: UI `renderLockerGrid()` → `/api/ui/layout` → `lockerLayoutService`
- RFID input: UI `keydown` buffer or backend `RfidHandler` → `RfidUserFlow`
- Assign DB: `ui-controller.assignLocker()` → `LockerStateManager.assignLocker()` → `ModbusController.openLocker()` → `LockerStateManager.confirmOwnership()`
- Release DB: `ui-controller.releaseLocker()` → `LockerStateManager.releaseLocker()`

