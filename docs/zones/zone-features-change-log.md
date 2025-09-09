# Zone Features – Change Log and Implementation Notes

## Overview

- Purpose: stabilize zone-aware configuration, allow assigning relay cards to zones from the Panel, and keep zone ranges aligned with actual hardware capacity.
- Scope: Kiosk UI, Panel Hardware Config view + API, Shared Config Manager and Zone Extension logic.

## Key Changes

- Kiosk UI
  - Uses `kiosk_id` param for availability endpoint and shows only available lockers.
  - Accepts both array and `{ lockers, sessionId }` response shapes.

- Panel – Hardware Config (UI)
  - Shows a Zone selector per relay card; edits update `zones[*].relay_cards` live.
  - Removing a relay card also removes it from all zone mappings.
  - Changing a card’s slave address preserves/updates zone references.

- Panel – Hardware Config (API)
  - Saves `hardware`, `lockers`, `features`, and `zones` sections (was only hardware/lockers before).
  - Pre-normalizes zones before validation:
    - Prunes `relay_cards` not present in hardware.
    - Auto-disables zones that end up with no `relay_cards`.
  - Validates a merged snapshot (current config + updates) to avoid transient shape errors.
  - Returns 400 for validation errors (instead of 500) for clearer UX.

- Shared – Config Manager
  - Replaces `zones` array on update (no object-merge); prunes invalid `relay_cards`, sorts addresses, and auto-disables empty zones.
  - Validation requires non-empty `ranges` and `relay_cards` only for enabled zones.
  - Triggers zone sync after zones update when `features.zones_enabled` is true.

- Shared – Zone Extension Service
  - Adds rebalance step to align zone ranges with capacity:
    - Allocates coverage sequentially based on `relay_cards.length * 16` per enabled zone.
    - Clamps total coverage to overall hardware capacity.
  - Hardened against undefined `zones` (TypeScript-safe).

## Affected Files

- Kiosk UI: `app/kiosk/src/ui/static/app-simple.js`
- Panel UI: `app/panel/src/views/hardware-config.html`
- Panel API: `app/panel/src/routes/hardware-config-routes.ts`
- Config Manager: `shared/services/config-manager.ts`
- Zone Extension: `shared/services/zone-extension-service.ts`
- Docs: `AGENTS.md` (added Zones MVP section)

## Behavior Changes

- Assigning/removing a relay card from a zone immediately reflects in `zones[*].relay_cards`.
- Zones with no `relay_cards` are automatically disabled on save.
- Zone ranges are rebalanced to match capacity after changes (e.g., 2 mens + 2 womens → womens becomes 33–64; if all four to mens → mens becomes 1–64; womens ranges cleared/disabled).
- Kiosk “available lockers” call returns/uses only available items.

## Usage – Admin Flow

1. Open Panel → Hardware Config.
2. For each relay card, use the Zone selector to assign it (or set to none).
3. Click Save. The API will:
   - Normalize/update `zones` and `features` (if present).
   - Validate the merged configuration.
   - Rebalance zone ranges to capacity on save.
4. Restart services if needed to pick up `config/system.json` changes.

## Validation & Error Handling

- Pre-normalization: zones are pruned to hardware and empty zones are auto-disabled before validation.
- Validation errors return HTTP 400 with details; other errors use HTTP 500.
- Config Manager’s validation only enforces non-empty `ranges`/`relay_cards` for enabled zones.

## Quick Test Steps

- Two zones (mens 1–32 on cards 1–2, womens 33–64 on cards 3–4):
  - Remove card 4 → womens becomes 33–48; Save succeeds.
  - Remove card 3 → womens relay_cards empty; womens auto-disabled, ranges cleared, Save succeeds.
  - Assign all four to mens → mens becomes 1–64, womens disabled with empty ranges.

## Troubleshooting

- Save returns 400
  - Check the response JSON for `details` (validation issues).
  - Ensure `features.zones_enabled` and `zones` array exist when using zones.
  - Confirm all `zones[*].relay_cards` exist in `hardware.relay_cards`.

- Save returns 500
  - Panel logs now downgrade validation errors to 400; 500 likely indicates unexpected runtime error. Check service logs.

- Kiosk shows “no lockers available” for a zone
  - Verify zone ranges and relay_cards after save.
  - Ensure lockers in that zone are `Free` in DB.

## Notes

- Ranges are computed from capacity; do not hand-edit ranges unless you disable auto-rebalance logic.
- Relay capacity assumed 16 per card; update if using different hardware.

