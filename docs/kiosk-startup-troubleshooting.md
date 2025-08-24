# 🔧 Kiosk Startup Troubleshooting Guide

**Status:** ✅ Updated for Production Deployment  
**Last Updated:** January 2025  
**Target:** Raspberry Pi 4/5 with Turkish Localization

## Common Error: "Cannot read properties of undefined (reading 'port')"

This error occurs when the ModbusController constructor receives an undefined config parameter. This issue has been resolved in the latest version.

### Quick Fix (Updated for 2025)

Use the automated deployment script for the latest fixes:

```bash
# Use the comprehensive deployment script
chmod +x scripts/deploy-to-pi.sh
./scripts/deploy-to-pi.sh

# Or use the quick setup for new installations
chmod +x scripts/quick-setup.sh
./scripts/quick-setup.sh
```

### Manual Fix Steps

1. **Clean and rebuild the kiosk service:**
   ```bash
   cd app/kiosk
   rm -rf dist node_modules/.cache
   npm install
   npm run build
   ```

2. **Verify the build:**
   ```bash
   # Check if dist/index.js exists
   ls -la dist/
   
   # Test for syntax errors
   node -c dist/index.js
   ```

3. **Check Node.js version:**
   ```bash
   node --version
   # Should be >= 18.0.0
   ```

### Root Causes and Solutions

#### 1. Outdated Build Artifacts
**Problem:** The dist folder contains old or corrupted build files.
**Solution:** Clean and rebuild as shown above.

#### 2. Node.js Version Incompatibility
**Problem:** Running Node.js < 18.0.0
**Solution:** Upgrade Node.js:
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 3. Missing Dependencies
**Problem:** Some npm packages are not properly installed.
**Solution:** 
```bash
cd app/kiosk
rm -rf node_modules package-lock.json
npm install
```

#### 4. Bundling Issues
**Problem:** esbuild bundling creates invalid JavaScript.
**Solution:** The code now includes validation to catch this early.

#### 5. Environment Variables
**Problem:** Missing or invalid environment variables.
**Solution:** Check environment variables:
```bash
echo "MODBUS_PORT: $MODBUS_PORT"
echo "MODBUS_BAUDRATE: $MODBUS_BAUDRATE"
echo "KIOSK_ID: $KIOSK_ID"
```

### Testing the Fix

After applying the fix, test the kiosk service:

```bash
cd app/kiosk
npm start
```

You should see:
```
Connected to SQLite database
Database pragmas initialized
Kiosk kiosk-1 already has 30 lockers
🚀 Kiosk service kiosk-1 running on port 3002 (zone: main)
```

### Hardware-Specific Issues

#### Serial Port Permissions
If you get serial port access errors:
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Check USB devices
ls -la /dev/ttyUSB*

# Reboot to apply group changes
sudo reboot
```

#### USB Device Detection
```bash
# List USB devices
lsusb

# Check dmesg for USB events
dmesg | grep -i usb
```

### Advanced Debugging

If the issue persists, enable debug mode:

1. **Add debug logging to the source:**
   ```typescript
   // In app/kiosk/src/index.ts, before ModbusController instantiation
   console.log('Debug: modbusConfig =', JSON.stringify(modbusConfig, null, 2));
   ```

2. **Rebuild and test:**
   ```bash
   npm run build
   npm start
   ```

3. **Check the bundled code:**
   ```bash
   # Search for the config definition in the built file
   grep -n "modbusConfig" dist/index.js
   ```

### Prevention

To prevent this issue in the future:

1. **Always clean build on deployment:**
   ```bash
   npm run build:clean  # If available
   # or
   rm -rf dist && npm run build
   ```

2. **Use consistent Node.js versions:**
   ```bash
   # Use nvm to manage Node.js versions
   nvm use 20
   ```

3. **Validate environment before starting:**
   ```bash
   # Check required environment variables
   [ -z "$MODBUS_PORT" ] && echo "Warning: MODBUS_PORT not set"
   ```

### Support

If you continue to experience issues:

1. Check the system logs: `journalctl -u eform-kiosk -f`
2. Verify hardware connections
3. Test with a minimal configuration
4. Contact support with the full error log and system information