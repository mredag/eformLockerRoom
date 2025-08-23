# Kiosk Startup Fix

## Problem
The kiosk service was failing with the error:
```
TypeError: Cannot read properties of undefined (reading 'port')
at new ModbusController
```

## Solution Applied

### 1. Added Config Validation
- **ModbusController constructor** now validates the config parameter
- **Kiosk index.ts** validates config before passing to constructor
- Clear error messages help identify the root cause

### 2. Created Fix Scripts
- `scripts/fix-kiosk-startup.sh` - Linux/Pi fix script
- `scripts/fix-kiosk-startup.ps1` - Windows fix script  
- `scripts/validate-kiosk-environment.js` - Environment validation

### 3. Added Documentation
- `docs/kiosk-startup-troubleshooting.md` - Comprehensive troubleshooting guide

## Quick Fix for Raspberry Pi

1. **Run the validation script:**
   ```bash
   node scripts/validate-kiosk-environment.js
   ```

2. **If validation fails, run the fix script:**
   ```bash
   chmod +x scripts/fix-kiosk-startup.sh
   ./scripts/fix-kiosk-startup.sh
   ```

3. **Start the kiosk service:**
   ```bash
   cd app/kiosk
   npm start
   ```

## Manual Fix Steps

If the scripts don't work:

1. **Clean and rebuild:**
   ```bash
   cd app/kiosk
   rm -rf dist node_modules/.cache
   npm install
   npm run build
   ```

2. **Verify the build:**
   ```bash
   node -c dist/index.js
   ```

3. **Check Node.js version:**
   ```bash
   node --version  # Should be >= 18.0.0
   ```

## Root Cause Analysis

The error occurred because:
1. The bundled JavaScript had an issue where the `config` parameter was undefined
2. This could be due to:
   - Outdated build artifacts
   - Node.js version incompatibility  
   - Bundling issues with esbuild
   - Missing dependencies

## Prevention

- Always clean build on deployment: `rm -rf dist && npm run build`
- Use consistent Node.js versions across environments
- Run validation script before deployment
- Check environment variables are set correctly

## Files Modified

- `app/kiosk/src/hardware/modbus-controller.ts` - Added config validation
- `app/kiosk/src/index.ts` - Added config validation  
- `scripts/fix-kiosk-startup.sh` - Linux fix script
- `scripts/fix-kiosk-startup.ps1` - Windows fix script
- `scripts/validate-kiosk-environment.js` - Environment validation
- `docs/kiosk-startup-troubleshooting.md` - Troubleshooting guide

The kiosk service should now start successfully with better error reporting if issues occur.