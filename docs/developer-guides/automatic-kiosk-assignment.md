# Automatic Kiosk Assignment Developer Guide

This guide documents how the single-kiosk automatic assignment flow works, how it is configured, and which components you should touch when extending the feature set.

## Configuration Model

- Automatic/manual behaviour is controlled through `services.kiosk.assignment` inside `config/system.json`. The shape is defined by `KioskAssignmentConfig`, which exposes a `default_mode` plus optional per-kiosk overrides. 【F:shared/types/system-config.ts†L69-L90】
- `ConfigManager.getDefaultConfiguration()` seeds the assignment block so fresh environments default to manual mode without diverging from the legacy schema. Defaults now include `recent_holder_min_hours` for the reassignment rule and `open_only_window_hours` for the quick-open UI. 【F:shared/services/config-manager.ts†L742-L783】
- Use `ConfigManager.setKioskAssignmentConfig()` to persist changes. It normalises modes, validates the result, saves with a lock, and records an audit log entry so panel writes do not corrupt `system.json`. Numeric thresholds are clamped between 0-24 hours and rounded to a single decimal before writing. 【F:shared/services/config-manager.ts†L463-L520】【F:shared/services/config-manager.ts†L1016-L1059】
- Configuration writes are guarded by an exclusive lock (`config/system.json.lock`) and every update produces a timestamped backup before the new snapshot is flushed. This protects the fragile config file from concurrent writes or power loss. 【F:shared/services/config-manager.ts†L908-L1030】

## Panel Settings Surface

The admin panel exposes `/panel/assignment-settings` so operators can toggle between manual and automatic mode.

- Routes live in `AssignmentSettingsRoutes`. They serve the HTML view, expose the read API, and POST the selected mode through `setKioskAssignmentConfig()`. All endpoints require the `SYSTEM_CONFIG` permission and POSTs enforce CSRF protection. The handler now returns and validates both time-based knobs. 【F:app/panel/src/routes/assignment-settings-routes.ts†L9-L118】
- The view itself (`app/panel/src/views/assignment-settings.html`) renders paired slider + numeric inputs for each knob so operators can tune the reassignment rule and the open-only window without restarting services. Reuse this module for future kiosk assignment settings. 【F:app/panel/src/views/assignment-settings.html†L37-L208】

## Runtime Flow (RFID ➜ Assignment)

1. `RfidUserFlow.handleCardScanned()` is the single entry point for kiosk scans. It checks for an existing locker ownership and short-circuits to the manual flow when necessary. 【F:app/kiosk/src/services/rfid-user-flow.ts†L62-L118】
2. When no locker is owned, `handleCardWithNoLocker()` collects zone-aware free lockers and resolves the active assignment mode through `ConfigManager.getKioskAssignmentMode()`. 【F:app/kiosk/src/services/rfid-user-flow.ts†L132-L187】【F:shared/services/config-manager.ts†L334-L353】
3. If the mode is `automatic`, the flow asks `LockerStateManager.getOldestAvailableLocker()` for the oldest free candidate, constrained to the allowed locker IDs/zone. A successful assignment immediately opens the locker and returns the open action to the UI. 【F:app/kiosk/src/services/rfid-user-flow.ts†L188-L235】【F:shared/services/locker-state-manager.ts†L552-L592】
4. Any failure (no candidate, hardware error, SQL exception) triggers a fallback. The flow logs the reason, refreshes the free-locker list, and returns the manual selection payload so the browser can render the existing grid. 【F:app/kiosk/src/services/rfid-user-flow.ts†L209-L260】

## Selection Algorithm Details

- `getOldestAvailableLocker()` orders by `COALESCE(updated_at, created_at)` ascending and falls back to the lowest locker ID to break ties. VIP lockers are excluded and the helper honours any zone/allowlist filters. 【F:shared/services/locker-state-manager.ts†L552-L592】
- The helper returns `null` when no candidate matches; callers must treat this as a fallback condition.

## UI Behaviour

- The kiosk UI receives the auto-assignment result. When `action` is `open_locker`, it proceeds directly to the success screen; otherwise it renders the familiar manual grid using the lockers returned by `handleCardWithNoLocker()`. 【F:app/kiosk/src/services/rfid-user-flow.ts†L220-L260】
- Owned-locker decisions (`showOwnedDecision`) honour the configurable “Eşya almak için aç” window returned by the server. The kiosk logs the threshold, toggles the button when the time elapses, and updates the helper copy with the active duration. 【F:app/kiosk/src/ui/static/app-simple.js†L657-L716】【F:app/kiosk/src/ui/static/app-simple.js†L948-L1059】

## Observability & Error Handling

- Successful auto assignments emit the `locker_auto_assign_success` event with card and locker metadata. Fallbacks emit `locker_auto_assign_fallback` with a structured reason string. Hook into these events from the kiosk process if you need additional telemetry or alerting. 【F:app/kiosk/src/services/rfid-user-flow.ts†L209-L235】
- When config lookups fail, the flow defaults to manual mode and logs a warning so operators are never blocked by configuration issues. 【F:shared/services/config-manager.ts†L334-L353】【F:app/kiosk/src/services/rfid-user-flow.ts†L84-L118】

## Testing

- Shared unit tests cover the ordering and filtering logic behind `getOldestAvailableLocker()`, ensuring we always pick the oldest free locker. 【F:shared/services/__tests__/locker-state-manager.test.ts†L98-L121】
- Kiosk unit tests simulate automatic mode, successful assignments, and fallback paths (hardware failure, no lockers). Keep them passing whenever you modify the flow. 【F:app/kiosk/src/services/__tests__/rfid-user-flow.test.ts†L210-L280】
- Run the following commands before shipping:
  - `npm run test --workspace=shared`
  - `npm run test --workspace=app/kiosk -- src/services/__tests__/rfid-user-flow.test.ts`
  - `npm run build:kiosk`

By following the pieces above you can confidently extend the automatic assignment behaviour without breaking manual fallback, zone awareness, or configuration safety guarantees.
