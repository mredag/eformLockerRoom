# Recent Holder Reassignment Developer Notes

This guide documents the production-ready implementation of the "recent holder" rule and the kiosk's quick-open window so engineers can extend or troubleshoot the experience quickly.

## Configuration Knobs

- `services.kiosk.assignment.recent_holder_min_hours` controls how long a card must have held a locker in the past 24 hours to be eligible for automatic reassignment. The value is clamped between 0-24 hours and rounded to one decimal place when normalised. 【F:shared/services/config-manager.ts†L1016-L1059】
- `services.kiosk.assignment.open_only_window_hours` defines how long the "Eşya almak için aç" button remains visible after a locker is assigned. It follows the same clamping and rounding rules. 【F:shared/services/config-manager.ts†L1016-L1059】
- Both defaults are seeded in `ConfigManager.getDefaultConfiguration()` so fresh installs inherit safe values (2 h reassignment, 1 h quick-open window). 【F:shared/services/config-manager.ts†L742-L783】
- `ConfigManager` exposes getters (`getRecentHolderMinHours()`, `getOpenOnlyWindowHours()`) for runtime callers; UI code should never read the JSON file directly. 【F:shared/services/config-manager.ts†L344-L386】

## Admin Panel Workflow

- The assignment settings API (`/api/assignment-settings`) now returns both numbers and validates incoming updates before persisting with the shared manager. 【F:app/panel/src/routes/assignment-settings-routes.ts†L9-L118】
- The panel view renders paired slider and numeric inputs for each knob, keeps them synchronised, and posts both values on save without requiring a service restart. 【F:app/panel/src/views/assignment-settings.html†L37-L208】

## Kiosk Runtime Behaviour

- `RfidUserFlow` logs when the recent-holder rule is active, records release durations, and reassigns the previous locker when the threshold is met. Fallbacks emit the same diagnostic bundle returned to the browser. 【F:app/kiosk/src/services/rfid-user-flow.ts†L226-L337】
- The kiosk UI fetches `openOnlyWindowHours` during the ownership check, sanitises it client-side, and uses it to show/hide the quick-open button while updating the helper copy. 【F:app/kiosk/src/controllers/ui-controller.ts†L1084-L1111】【F:app/kiosk/src/ui/static/app-simple.js†L657-L1059】

## Testing

- `shared/services/__tests__/config-manager.test.ts` covers persistence and sanitisation for both thresholds. Extend these tests whenever validation rules change. 【F:shared/services/__tests__/config-manager.test.ts†L506-L550】
- `app/kiosk/src/services/__tests__/rfid-user-flow.test.ts` exercises the reassignment paths, ensuring the UI receives the expected debug trace and reassignment results. 【F:app/kiosk/src/services/__tests__/rfid-user-flow.test.ts†L210-L360】

## Operational Tips

- Use the kiosk browser console's `[AUTO-ASSIGN][UI]` groups to inspect the decision trace returned from `RfidUserFlow`. The logs include whether the recent-holder rule triggered and any fallback reason.
- When debugging timing issues, confirm both thresholds in the panel, then inspect the kiosk overlay text to ensure the open-only window matches expectation. A value of `0` disables the quick-open button entirely.
