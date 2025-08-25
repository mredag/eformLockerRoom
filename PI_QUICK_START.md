# Raspberry Pi Quick Start Guide

## 🚀 Quick Setup (Copy & Paste)

### 1. Get Latest Code
```bash
# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Build project
npm run build:shared
npm run build
```

### 2. Make Script Executable
```bash
# Make the helper script executable
chmod +x pi-button-test.sh
```

### 3. Run Complete Test
```bash
# Run full testing sequence
./pi-button-test.sh full-test
```

## 🎯 Quick Commands

| Command | Purpose |
|---------|---------|
| `./pi-button-test.sh check` | Check if services are running |
| `./pi-button-test.sh test-api` | Test API connectivity |
| `./pi-button-test.sh add-logging` | Add button logging |
| `./pi-button-test.sh browser` | Open browser |
| `./pi-button-test.sh full-test` | Run everything |

## 🌐 Access URLs

Replace `PI_IP` with your Raspberry Pi's IP address:

- **Main Interface**: `http://PI_IP:3001/lockers`
- **Test Interface**: `http://PI_IP:3001/test-client-button-functions.html`
- **From Pi locally**: `http://localhost:3001/lockers`

## 🔍 Debug Steps

### Step 1: Check Services
```bash
./pi-button-test.sh check
```

### Step 2: Add Enhanced Logging
```bash
./pi-button-test.sh add-logging
```

### Step 3: Open Browser & Console
1. Open browser to locker page
2. Press `F12` to open developer console
3. Click the "Console" tab

### Step 4: Test Buttons
1. Select a kiosk from dropdown
2. Click "Yenile" (Refresh) - watch console
3. Click locker cards to select them - watch console
4. Try action buttons - watch console

### Step 5: Expected Console Output
```
🔄 loadData called (Refresh button)
📊 CSRF token: present
✅ loadData completed

🎯 toggleLocker called
📊 Kiosk ID: kiosk-1
📊 Locker ID: 1
✅ toggleLocker completed

🖱️ Button clicked: {text: "Seçilenleri Aç (1)", disabled: false}
🔓 openSelectedLockers called
📊 Selected lockers count: 1
✅ openSelectedLockers completed
```

## 🧹 Cleanup
```bash
# Remove logging when done
./pi-button-test.sh remove-logging
```

## 🆘 Troubleshooting

### Services Not Running?
```bash
# Check what's running
ps aux | grep node

# Start services manually
npm run start:gateway &
npm run start:panel &
npm run start:kiosk &
```

### Can't Access from Browser?
```bash
# Check Pi's IP address
hostname -I

# Check if ports are open
netstat -tlnp | grep -E ':(3001|3002|3003)'
```

### Database Issues?
```bash
# Test database
node debug-database-direct.js
```

## 📱 Remote Access

If testing from another computer:
1. Find Pi IP: `hostname -I`
2. Open: `http://PI_IP:3001/lockers`
3. Use browser dev tools on your computer

The enhanced logging will show exactly what happens when you click buttons!