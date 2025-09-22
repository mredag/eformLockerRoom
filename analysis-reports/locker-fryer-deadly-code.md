# Locker Fryer Deadly Code Report

## Summary
A regression in the admin panel introduced a debugging shim around `openSelectedLockers()`. The shim reassigns `window.openSelectedLockers` and transparently invokes the original implementation. When the view script is re-evaluated (e.g., during partial reloads triggered by panel navigation), the shim wraps the already wrapped function. On the next button press each wrapper invokes the previously wrapped version, eventually re-entering the newest shim again. This creates a tight recursion loop that repeatedly reissues open commands until the page is reloaded.

## Impact
- Operators see lockers repeatedly receive open commands without further interaction.
- Command queue noise and hardware wear from repeated relay activations.
- Manual mitigation required via hard refresh or server intervention.

## Follow-up Investigation
- Additional telemetry wrappers were still intercepting other locker actions (`blockSelectedLockers`, `unblockSelectedLockers`,
  `performAction`, `showActionModal`, and `updateSelectedCount`). Each panel reload stacked another wrapper layer, multiplying
  the number of times these handlers ran per click. The "Open" button was already removed, but the same regression risked
  spreading to block/unblock, end-of-day, and refresh actions as operators navigated the panel throughout the day.

## Fix
- Removed the shim so `openSelectedLockers()` is no longer recursively wrapped.
- Removed the "Open" action button from the panel and replaced it with a warning banner while the backend loop is investigated.
- Updated `updateSelectedCount()` so it no longer references the removed button.
- Eliminated the remaining debug wrappers (`blockSelectedLockers`, `unblockSelectedLockers`, `performAction`, etc.) so repeated panel initialisations can no longer stack additional layers that re-trigger actions multiple times per click.
