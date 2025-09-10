# Kiosk UX Ideas For Solenoid Locks

Problem
- Lockers use solenoid/magnetic locks that re-lock when the door is pushed. Current flow: new card → show available → user selects → locker opens → success message. When the same user scans again, the locker opens (and is released). Users can push the door and see it locked, assuming they “own it” without explicit confirmation. This can cause confusion or unintended release.

Principles
- Make ownership state explicit and user-driven (no hidden releases).
- Offer clear, persistent guidance in Turkish with audio/visual cues.
- Keep hardware unchanged; prefer UI/API tweaks. Be zone‑agnostic.
- Fallback gracefully when network/hardware is degraded.

Idea 1 — Explicit “Start” / “Finish & Release” Flow
- Summary: Replace implicit release-on-second-scan with an explicit finish action. Users must tap “Bitir ve Teslim Et” to release.
- UI
  - After assignment/open: persistent banner “Dolap X size atandı”. Big buttons: “Tekrar Aç” and “Bitir ve Teslim Et”.
  - On second scan: show the same choice screen instead of auto‑release.
  - Add audio cues: short success tone on assign; different tone on finish.
- Backend/API
  - Change existing-card flow in kiosk controller to NOT auto-release. Present options via UI.
  - Use existing `POST /api/locker/release` only when user chooses finish.
  - Keep `POST /api/locker/assign` as‑is; continue `confirmOwnership` on open success.
- Copy (TR)
  - Başlık: “Dolabınız hazır”
  - Butonlar: “Tekrar Aç” / “Bitir ve Teslim Et”
  - Açıklama: “Eşyalarınızı yerleştirdikten sonra ‘Bitir’ düğmesine basın.”
- Metrics
  - Track rate of accidental finishes vs. intentional finishes.

Idea 2 — Re‑Open Grace Window (No Release)
- Summary: Provide a timed window (e.g., 60–120s) in which the user can re‑open multiple times without releasing, preventing accidental ‘finished’ state when the door re‑locks.
- UI
  - Countdown chip: “Dolabı tekrar açmak için: 01:00”. Button “Tekrar Aç”.
  - Idle header shows “Dolap X sizde – x sn içinde tekrar açabilirsiniz”.
- Backend/API
  - Add a temporary “grace” flag to the locker (in memory or DB) after first open; subsequent scans within the window trigger open only, not release.
  - When user taps finish or grace expires, require explicit finish to release.
- Copy (TR)
  - “Eşyalarınızı yerleştirirken dolabı tekrar açıp kapatabilirsiniz.”
- Metrics
  - Measure re‑opens within grace; reduce unintended releases.

Idea 3 — Persistent Ownership Screen With Big Actions
- Summary: Keep the kiosk on an ownership screen until users act, with clear locker number and re‑open option.
- UI
  - Large tile: “Dolap X size ait”.
  - Primary: “Tekrar Aç” (opens without releasing). Secondary: “Bitir ve Teslim Et”.
  - Sticky footer tip: “Dolabı kapattığınızda otomatik kilitlenir.”
  - Provide a “Kayboldum, Dolabımı Bul” hint (re‑opens to make a sound/flash in UI).
- Backend/API
  - Reuse `/api/locker/assign` and `/api/locker/release`. Add a lightweight `/api/locker/open-again` alias calling Modbus open without state changes (optional; or reuse existing open path).
- Audio
  - Short chirp every 5s on the kiosk while ownership screen is up (optional, toggled after 30s to avoid noise).

Idea 4 — Hold‑To‑Finish Confirmation
- Summary: Reduce accidental finishes by requiring a 2‑second press to finish.
- UI
  - “Bitir ve Teslim Et” requires a press‑and‑hold with progress ring and haptic/audio feedback.
  - Tooltip: “Yanlışlıkla bitirmeyi önlemek için basılı tutun.”
- Backend/API
  - No changes; still calls `/api/locker/release` after hold completes.
- Accessibility
  - Provide keyboard alternative: press Enter for 2 seconds (visual countdown).
- Metrics
  - Drop in accidental finishes; time‑to‑finish distributions.

Idea 5 — Second‑Scan Decision Screen (Open vs. Finish)
- Summary: When the same card is scanned again, ask intent explicitly rather than auto‑releasing.
- UI
  - Full‑screen prompt: “Dolap X”. Big split buttons:
    - “Eşyamı almak için aç” → opens only, keeps ownership
    - “Dolabı teslim etmek istiyorum” → opens and then releases
  - Copy clarifies: “Teslim ettiğinizde dolap başkaları için uygun olur.”
- Backend/API
  - Update controller branch for existing ownership to present decision screen (frontend) instead of always opening+releasing.
  - On “Teslim” path, call open + `releaseLocker` (current behavior). On “Aç” path, just open.
- Safety
  - If hardware open fails, preserve ownership and show retry.

Implementation Notes (Incremental)
- Phase 1 (low risk)
  - Change existing‑card flow: remove implicit release; show decision screen (Idea 5). Use current endpoints.
  - Add hold‑to‑finish (Idea 4) to prevent accidental taps.
- Phase 2
  - Add grace window logic in `SessionManager` or `LockerStateManager` adjunct state (Idea 2).
  - Add optional `/api/locker/open-again` (thin wrapper) if cleaner for UI.
- Phase 3
  - Polish persistent ownership screen (Idea 3) and audio cues (reuse `playAudioFeedback` route in `ui-controller`).

Copy Suggestions (TR)
- Başlıklar
  - “Dolabınız hazır – Dolap X”
  - “Dolabı tekrar açmak ister misiniz?”
- Butonlar
  - “Tekrar Aç” / “Bitir ve Teslim Et”
- Açıklamalar
  - “Dolabı kapattığınızda otomatik kilitlenir.”
  - “Teslim ettikten sonra dolap başkaları için uygun olur.”

QA/Validation
- Simulate: assign → auto‑relock by pushing door → re‑scan → confirm the UI asks intent; ownership remains unless user finishes.
- Verify no regressions in VIP lockers (skip auto‑release unless explicit finish).
- Accessibility: large hit areas, keyboard navigation, color contrast, Turkish diacritics.

Telemetry To Add
- Counters: re‑open within grace, finish actions, accidental finish reversals.
- Times: assign→first close, assign→finish, re‑scan intervals.

Risks & Mitigations
- Users may ignore on‑screen finish: add periodic reminder and short audio cue; highlight “Bitir” after inactivity.
- Long ownership holding: add admin timeout policy (configurable) with on‑screen countdown and “yeniden aç” available.

Next Steps
- Approve Phase 1 changes to existing‑card flow and UI prompts.
- Implement small backend guard to ensure no implicit release without explicit user action.
