# Button Testing Guide for Raspberry Pi

## Overview
This guide shows how to use the button testing suite on your Raspberry Pi to debug the locker management button issues.

## Prerequisites
- Raspberry Pi with the eform locker system installed
- SSH access or direct terminal access
- Web browser (Chromium/Firefox on Pi or remote browser)
- Services running on the Pi

## Step-by-Step Testing Process

### 1. Pull Latest Changes
First, get the latest code with the testing suite:

```bash
# SSH into your Raspberry Pi
ssh pi@your-pi-ip

# Navigate to your project directory
cd /path/to/eformLockroom

# Pull the latest changes
git pull origin main

# Install any new dependencies
npm install
```

### 2. Build the Project
Make sure everything is compiled:

```bash
# Build shared components
npm run build:shared

# Build all services
npm run build
```

### 3. Start Services
Start all the locker system services:

```bash
# Option 1: Use PM2 (if configured)
pm2 start ecosystem.config.js

# Option 2: Use npm scripts (run in separate terminals)
npm run start:gateway &
npm run start:panel &
npm run start:kiosk &

# Option 3: Use your existing startup script
./scripts/start-all.sh
```

### 4. Verify Services Are Running
Check that services are active:

```bash
# Check if ports are listening
sudo netstat -tlnp | grep -E ':(3001|3002|3003)'

# Or check processes
ps aux | grep node

# Test basic connectivity
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### 5. Access the Enhanced Locker Page

#### Option A: Direct Browser on Pi
If using the Pi's desktop environment:

```bash
# Open Chromium browser
chromium-browser http://localhost:3001/lockers
```

#### Option B: Remote Browser Access
From your computer, access the Pi's web interface:

```
http://your-pi-ip:3001/lockers
```

### 6. Enable Browser Developer Console

#### On Chromium/Chrome:
1. Press `F12` or `Ctrl+Shift+I`
2. Click the "Console" tab
3. Clear any existing logs

#### On Firefox:
1. Press `F12` or `Ctrl+Shift+K`
2. Click the "Console" tab
3. Clear any existing logs

### 7. Test Button Functions with Enhanced Logging

The locker page now has enhanced logging. When you interact with buttons, you'll see detailed logs:

#### Test Sequence:
1. **Login** (if not already logged in)
2. **Select a kiosk** from the dropdown
3. **Click "Yenile" (Refresh)** - Watch console for logs
4. **Click on locker cards** to select them - Watch selection logs
5. **Try clicking action buttons** - Watch for button state and function logs

#### Expected Console Output:

**When clicking Refresh:**
```
🔄 loadData called (Refresh button)
📊 Current user: {username: "admin", ...}
📊 CSRF token: present
✅ loadData completed
```

**When selecting lockers:**
```
🖱️ Button clicked: {text: "kiosk-1-1", className: "locker-card free"}
🎯 toggleLocker called
📊 Kiosk ID: kiosk-1
📊 Locker ID: 1
📊 Current selection count: 0
📊 New selection count: 1
✅ toggleLocker completed
```

**When clicking action buttons:**
```
🖱️ Button clicked: {text: "Seçilenleri Aç (1)", id: "open-btn", disabled: false}
🔓 openSelectedLockers called
📊 Selected lockers count: 1
📊 Selected lockers: ["kiosk-1-1"]
📊 CSRF token: present
✅ openSelectedLockers completed
```

### 8. Run Server-Side API Tests

Test the backend APIs directly:

```bash
# Run the API test suite
node test-button-functions.js
```

This will test:
- Login/Session validation
- Kiosk API endpoints
- Locker API endpoints
- Button action APIs

### 9. Use the Browser Test Interface

Access the dedicated test page:

```
http://your-pi-ip:3001/test-client-button-functions.html
```

This provides:
- Interactive test buttons
- Visual logging interface
- Comprehensive test results
- Real-time error tracking

### 10. Common Issues and Solutions

#### Issue: Services Not Running
```bash
# Check service status
sudo systemctl status your-service-name

# Restart services
sudo systemctl restart your-service-name

# Check logs
sudo journalctl -u your-service-name -f
```

#### Issue: Port Access Problems
```bash
# Check if ports are blocked
sudo ufw status

# Allow ports if needed
sudo ufw allow 3001
sudo ufw allow 3002
sudo ufw allow 3003
```

#### Issue: Permission Problems
```bash
# Check file permissions
ls -la /path/to/eformLockroom

# Fix permissions if needed
sudo chown -R pi:pi /path/to/eformLockroom
```

#### Issue: Database Problems
```bash
# Check database file
ls -la data/eform.db

# Test database connectivity
node debug-database-direct.js
```

### 11. Remote Debugging from Another Machine

If you need to debug from your development machine:

```bash
# On your Pi, start services with external access
npm run start:panel -- --host 0.0.0.0

# From your computer, access:
http://pi-ip-address:3001/lockers
```

### 12. Collecting Debug Information

When you find issues, collect this information:

#### Browser Console Logs:
1. Right-click in console
2. Select "Save as..." to save logs
3. Or copy/paste relevant log entries

#### Server Logs:
```bash
# Check application logs
tail -f logs/application.log

# Check system logs
sudo journalctl -f

# Check PM2 logs (if using PM2)
pm2 logs
```

#### System Information:
```bash
# Pi system info
cat /proc/version
free -h
df -h

# Node.js version
node --version
npm --version
```

### 13. Cleanup After Testing

When debugging is complete:

```bash
# Remove enhanced logging
node add-button-logging.js remove

# Commit any fixes
git add .
git commit -m "Fix button functionality issues"
git push origin main
```

## Troubleshooting Quick Reference

| Problem | Command | Expected Result |
|---------|---------|----------------|
| Services not running | `ps aux \| grep node` | Should show node processes |
| Ports not accessible | `netstat -tlnp \| grep 3001` | Should show listening port |
| Database issues | `node debug-database-direct.js` | Should show database connection |
| API issues | `node test-button-functions.js` | Should show API test results |
| Frontend issues | Open browser console | Should show detailed logs |

## Getting Help

If you encounter issues:

1. **Check the console logs** - The enhanced logging will show exactly what's happening
2. **Run the API tests** - This will identify backend issues
3. **Use the browser test page** - This provides comprehensive frontend testing
4. **Collect the debug information** listed above
5. **Share the specific error messages** from the console logs

The enhanced logging system will make it very easy to identify exactly where the button functionality is failing!