# Locker Fryer Deadly Code Report

## Summary
A regression in the admin panel introduced a debugging shim around `openSelectedLockers()`. The shim reassigns `window.openSelectedLockers` and transparently invokes the original implementation. When the view script is re-evaluated (e.g., during partial reloads triggered by panel navigation), the shim wraps the already wrapped function. On the next button press each wrapper invokes the previously wrapped version, eventually re-entering the newest shim again. This creates a tight recursion loop that repeatedly reissues open commands until the page is reloaded.

## Impact
- Operators see lockers repeatedly receive open commands without further interaction.
- Command queue noise and hardware wear from repeated relay activations.
- Manual mitigation required via hard refresh or server intervention.

## Fix
- Removed the shim so `openSelectedLockers()` is no longer recursively wrapped.
- Removed the "Open" action button from the panel and replaced it with a warning banner while the backend loop is investigated.
- Updated `updateSelectedCount()` so it no longer references the removed button.
