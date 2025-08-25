# Context for Other LLMs - Service Worker Registration Error

## Quick Summary
I'm experiencing a persistent JavaScript error across all pages of a web application:
```
Uncaught TypeError: Cannot read properties of undefined (reading 'register')
at [page]:2:79 at HTMLDivElement.onreset
```

## What I Need Help With
**Primary Goal**: Eliminate this service worker registration error that appears on every HTML page at the exact same location (line 2, character 79).

## Key Information

### Error Pattern
- **Location**: Always line 2, character 79
- **Trigger**: `HTMLDivElement.onreset` event
- **Error**: `Cannot read properties of undefined (reading 'register')`
- **Frequency**: Every single page load, all pages

### What I've Tried (All Failed)
1. Added service worker stub in main JavaScript sections
2. Added early service worker prevention in HTML `<head>`
3. Applied fixes to all 6 HTML pages in the application
4. Rebuilt and redeployed multiple times

### Current Status
- ✅ **Application works perfectly** - all functionality intact
- ✅ **UI renders correctly** - no visual issues
- ✅ **i18n system working** - Turkish localization perfect
- ❌ **Console error persists** - unprofessional for production

### Technical Context
- **Stack**: Node.js/Fastify backend, vanilla HTML/JS frontend
- **Environment**: Raspberry Pi deployment, Chrome browser
- **Architecture**: Multi-service system serving static HTML files
- **Error timing**: Very early in page load (line 2)

## What I'm Looking For

### Debugging Approaches
1. How to identify what's causing the `HTMLDivElement.onreset` event?
2. How to trace what code is trying to access `navigator.serviceWorker.register`?
3. How to determine if this is browser extension interference?

### Solution Strategies
1. More comprehensive service worker blocking techniques
2. Ways to prevent external code from registering service workers
3. Methods to intercept and debug the onreset event
4. Alternative approaches to eliminate the error source

### Investigation Tools
1. Browser debugging techniques for this specific error pattern
2. Ways to identify hidden form elements or external scripts
3. Methods to trace the call stack at line 2, character 79

## Code Examples Available
I can provide:
- Current HTML file structures with attempted fixes
- Service worker prevention code that's not working
- Console logs showing exact error patterns
- Screenshots showing functional UI with console errors

## Constraints
- Must maintain current functionality (everything works)
- Need clean console output for production deployment
- Prefer solutions that don't require major architecture changes
- Should work across different browsers and environments

## Success Criteria
- ✅ No JavaScript errors in browser console
- ✅ All current functionality preserved
- ✅ Solution works consistently across all pages
- ✅ Professional, clean console output

**Please help me identify the root cause and provide a definitive solution for this persistent service worker registration error.**