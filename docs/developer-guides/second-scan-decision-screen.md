# Second‑Scan Decision Screen — Design & Implementation Guide

This document explains the motivation, UX, and code changes for the kiosk “Second‑Scan Decision Screen” (Idea 5). It also covers how to test, deploy, and extend it.

## Overview

Problem: Solenoid/magnetic locks re‑lock when the door is pushed. With the old flow, scanning the same card again auto‑opened and released the locker. Users could mistakenly think they still “owned” the locker after it re‑locked, causing accidental releases.

Solution: On second scan (when the card already owns a locker), show a decision screen with two explicit actions:
- “Eşyamı almak için aç” — Open the locker again without releasing ownership.
- “Dolabı teslim etmek istiyorum” — Open and release the locker (make it available to others).

This makes the ownership state explicit and prevents ambiguous auto‑release.

## UX Behavior

- New card scanned
  - Existing flow: show available lockers → user selects → locker opens → ownership confirmed.
- Same card scanned again (card owns a locker)
  - Show a full‑screen decision overlay.
  - User can:
    - Open: Locker pulses open; ownership is preserved. Kiosk returns to idle.
    - Finish & Release: Locker opens; DB ownership is cleared; locker becomes available.
- Hardware errors
  - Preserve ownership on failures.
  - Show specific error (hardware unavailable / open failed) with retry guidance.

Copy (TR)
- Open only: “Eşyamı almak için aç”
- Finish & Release: “Dolabı teslim etmek istiyorum”
- Messages: “Dolap X açılıyor…”, “Dolap X açıldı”, hardware errors in Turkish as in existing error catalog.

Accessibility
- Decision overlay buttons are keyboard‑focusable.
- Tiles remain keyboard‑selectable (Enter/Space) when session is active.

## Frontend Changes (Kiosk UI)

Files:
- `app/kiosk/src/ui/static/app-simple.js`

Key functions:
- `handleCardScan(cardId)`
  - Previously, if the card had an existing locker, it called `openAndReleaseLocker(...)` directly (auto‑release).
  - Now, if the card has an existing locker, it calls `showOwnedDecision(cardId, lockerId)`.

- `showOwnedDecision(cardId, lockerId)`
  - Renders a simple, self‑contained overlay with two buttons:
    - “Eşyamı almak için aç” → calls `openOwnedLockerOnly(cardId)`
    - “Dolabı teslim etmek istiyorum” → calls existing `openAndReleaseLocker(cardId, lockerId)`
  - The overlay is created on demand and torn down when an action is selected.

- `openOwnedLockerOnly(cardId)`
  - Sends a POST to the new endpoint `/api/locker/open-again` with `{ cardId, kioskId }`.
  - Does not change DB ownership. On success, shows a short confirmation and returns to idle.

- `openAndReleaseLocker(cardId, lockerId)` (existing)
  - Uses the existing `/api/locker/release` flow. On success, shows confirmation and returns to idle.

Error handling
- Maps server error codes to the existing Turkish error catalog (NETWORK_ERROR, HARDWARE_OFFLINE, LOCKER_OPEN_FAILED, etc.).

## Backend Changes (Kiosk Service)

Files:
- `app/kiosk/src/controllers/ui-controller.ts`

New route:
- `POST /api/locker/open-again`
  - Input: `{ cardId: string; kioskId: string }`
  - Flow:
    1. Validate payload; find existing locker for the card using `lockerStateManager.checkExistingOwnership(cardId, 'rfid')`.
    2. Attempt to open relay via `modbusController.openLocker(existingLocker.id)`.
    3. Do not modify DB ownership or status on success/failure.
    4. Return Turkish messages and structured error (`hardware_unavailable`, `hardware_failed`, `server_error`) consistent with the app.

Touched code in `registerRoutes` to register the new endpoint. No migrations/config changes required.

Existing endpoints unchanged:
- `POST /api/locker/release` — Used for the “Finish & Release” action.
- `POST /api/locker/assign` — Original assignment remains unchanged.

## State & Database

- The “Open only” path never updates the `lockers` table — it is a pure hardware operation.
- The “Finish & Release” path uses `releaseLocker(...)` to set `status='Free'` and clear ownership (as before).
- Optimistic locking (`version` column) and event logging remain handled by `LockerStateManager`.

## Testing Guide

Manual checks:
1. Assign a locker to a test card via UI or API.
2. Scan the same card again.
   - Expect the decision overlay with two buttons.
3. Click “Eşyamı almak için aç”.
   - Locker should open; DB ownership remains; kiosk returns to idle.
4. Scan the same card again; choose “Dolabı teslim etmek istiyorum”.
   - Locker should open; ownership is cleared; locker becomes available.
5. Simulate hardware failure (disconnect or force error):
   - “Open only” should preserve ownership and surface a clear error.

Automated (unit/integration) — suggested:
- Mock `modbusController.openLocker` to return true/false.
- Mock `LockerStateManager.checkExistingOwnership` to return an owned locker.
- Verify `/api/locker/open-again` returns success w/o DB updates on success.
- Verify error responses map to UI error catalog.

## Deployment & Rollback

Deployment
- No migrations.
- Build kiosk: `npm run build:kiosk`
- Restart kiosk service.

Rollback to old behavior
- Frontend only: revert `handleCardScan` to call `openAndReleaseLocker(...)` immediately for existing cards.
- Or checkout a pre‑feature commit for `app-simple.js`.

## Future Improvements

- Replace inline overlay with the shared modal container for total visual consistency (buttons already styled in CSS).
- Add a short “grace window” (e.g., 60–120 seconds) in which repeated scans default to “Open only” without showing the dialog (optional, configurable).
- Telemetry: count open‑only vs. finish actions, error rates, and time between scans.
- Config toggle: feature flag to enable/disable decision screen during rollout.

## File Map & References

- Frontend:
  - `app/kiosk/src/ui/static/app-simple.js`
    - `handleCardScan`, `showOwnedDecision`, `openOwnedLockerOnly`, `openAndReleaseLocker`.
- Backend:
  - `app/kiosk/src/controllers/ui-controller.ts`
    - route registration, `openLockerAgain()` implementation.
- Shared services (unchanged):
  - `shared/services/locker-state-manager.ts`
  - `shared/services/locker-layout-service.ts`

---
Maintainer note: This feature alters only the second‑scan path. New users and first‑time assignments are unaffected. Default behavior now requires explicit user intent to release, eliminating accidental releases caused by solenoid re‑lock behavior.
