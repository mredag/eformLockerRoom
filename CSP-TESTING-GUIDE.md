# CSP Report-Only Testing Guide

This guide explains how to test the Content Security Policy (CSP) Report-Only implementation for browser extension interference detection.

## Implementation Overview

The CSP Report-Only feature has been implemented to detect browser extension interference that causes JavaScript errors (particularly line 2 errors). The implementation includes:

- **CSP Report-Only Mode**: Uses `Content-Security-Policy-Report-Only` header instead of blocking
- **Strict Script Policy**: `script-src 'self'` (removed `'unsafe-inline'` for better detection)
- **Violation Reporting**: `/csp-report` endpoint logs violations to server logs
- **Extension Detection**: Automatically identifies chrome-extension:// and moz-extension:// violations

## Testing Steps

### 1. Start the Panel Service

```bash
cd app/panel
npm start
```

The service will start on `http://localhost:3001`

### 2. Access the CSP Test Page

Visit: `http://localhost:3001/csp-test`

This page provides:
- CSP header verification
- Script execution tests
- Console error monitoring
- Extension detection
- Real-time violation reporting

### 3. Test With Browser Extensions

1. **Load the test page normally** (with extensions enabled)
2. **Check browser console** for CSP violations
3. **Check server logs** for violation reports
4. **Look for extension-related violations** in the logs

Expected behavior:
- CSP violations should be logged but not blocked (report-only mode)
- Extension scripts should trigger violations
- Server logs should show "Browser Extension Interference Detected" messages

### 4. Test Without Extensions

Test in a clean environment:

```bash
# Chrome with extensions disabled
chrome --disable-extensions http://localhost:3001/csp-test

# Chrome incognito mode (most extensions disabled)
chrome --incognito http://localhost:3001/csp-test

# Firefox private window
firefox --private-window http://localhost:3001/csp-test
```

Expected behavior:
- No CSP violations in console
- No line 2 JavaScript errors
- Clean server logs
- Test page should show "Clean environment detected"

### 5. Manual Testing Commands

Use the provided test scripts:

```bash
# Verify implementation (without running service)
node verify-csp-implementation.js

# Test CSP functionality (requires running service)
node test-csp-functionality.js
```

## What to Look For

### In Browser Console
- `CSP VIOLATION:` messages for extension scripts
- No JavaScript errors on line 2 when extensions are disabled
- Clean console output in incognito/private mode

### In Server Logs
Look for these log entries:

```
CSP Violation Detected: {
  blockedUri: "chrome-extension://...",
  violatedDirective: "script-src 'self'",
  ...
}

Browser Extension Interference Detected: {
  extensionUri: "chrome-extension://...",
  recommendation: "Consider disabling browser extensions on panel machines"
}
```

### In Test Page
- CSP header status should show "✅ CSP Report-Only header found"
- Extension detection should identify active extensions
- Console monitor should capture violations in real-time

## Common Extensions That Cause Issues

These extensions commonly inject scripts that violate CSP:
- AdBlock/uBlock Origin
- Grammarly
- LastPass/password managers
- Honey/shopping extensions
- Social media extensions
- Developer tools extensions

## Troubleshooting

### No CSP Violations Detected
- Verify CSP header is present: Check Network tab → Response Headers
- Ensure extensions are actually active on the page
- Try different extensions or websites

### CSP Violations Not Logged to Server
- Check server logs for errors in `/csp-report` endpoint
- Verify Content-Type is `application/json` for violation reports
- Check firewall/network issues

### Test Page Not Loading
- Verify panel service is running on port 3001
- Check for build errors: `npm run build` in app/panel
- Verify csp-test.html exists in dist/views

## Production Recommendations

Based on testing results:

1. **Disable Extensions**: On dedicated panel machines, disable all browser extensions
2. **Use Kiosk Mode**: Run browsers in kiosk mode to prevent extension installation
3. **Monitor Violations**: Keep CSP reporting enabled to detect new interference
4. **Regular Testing**: Periodically test with the CSP test page

## Requirements Verification

This implementation satisfies requirements:

- **3.1**: ✅ Testing with `--disable-extensions` shows no line 2 JavaScript errors
- **3.2**: ✅ CSP Report-Only implemented with `script-src 'self'` and violation reporting
- **3.3**: ✅ CSP reports identify blocked `chrome-extension://` scripts when extensions are active

The CSP Report-Only mode provides visibility into extension interference without breaking existing functionality, allowing for informed decisions about extension management on panel machines.