# Thin Client Zone Deployment Guide

## Architecture Overview

This guide covers deploying **one main server** with **multiple thin client kiosks** using URL parameters for zone selection.

### System Architecture

```
Main Server (Raspberry Pi 4)
├── IP: 192.168.1.11
├── Services: Gateway, Kiosk, Panel, Hardware Control
├── Hardware: USB-RS485, Relay Cards, RFID Reader
└── Database: SQLite with all locker data

Mens Kiosk (Thin Client)
├── Small Raspberry Pi / Tablet / PC
├── Browser: http://192.168.1.11:3002?zone=mens
├── Hardware: RFID Reader (optional)
└── Display: Touch screen for locker selection

Womens Kiosk (Thin Client)
├── Small Raspberry Pi / Tablet / PC  
├── Browser: http://192.168.1.11:3002?zone=womens
├── Hardware: RFID Reader (optional)
└── Display: Touch screen for locker selection
```

## 🚀 Main Server Setup

### 1. Deploy Zone-Aware Code

```bash
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin feat/zones-mvp
npm run build:kiosk
```

### 2. Configure Main Server (NO KIOSK_ZONE needed)

```bash
# Do NOT set KIOSK_ZONE on main server
# Zone will be determined by URL parameter from clients
echo "# Main server - zone determined by client URL" >> .env
```

### 3. Start Services

```bash
sudo killall node
./scripts/start-all-clean.sh
```

### 4. Verify Main Server

```bash
# Check health (should show no kiosk_zone)
curl http://192.168.1.11:3002/health | jq '.kiosk_zone'
# Expected: null

# Test zone APIs work
curl "http://192.168.1.11:3002/api/lockers/available?zone=mens" | jq 'length'
curl "http://192.168.1.11:3002/api/lockers/available?zone=womens" | jq 'length'
```

## 📱 Thin Client Setup

### Option 1: Raspberry Pi Zero/4 Thin Clients

#### **Mens Kiosk Setup**

```bash
# Install minimal Raspberry Pi OS
sudo apt update && sudo apt install -y chromium-browser unclutter

# Create kiosk startup script
cat > /home/pi/start-mens-kiosk.sh << 'EOF'
#!/bin/bash
export DISPLAY=:0
chromium-browser \
  --kiosk \
  --no-sandbox \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --start-fullscreen \
  "http://192.168.1.11:3002?zone=mens"
EOF

chmod +x /home/pi/start-mens-kiosk.sh

# Auto-start on boot
echo "@/home/pi/start-mens-kiosk.sh" >> ~/.config/lxsession/LXDE-pi/autostart
```

#### **Womens Kiosk Setup**

```bash
# Same as above but with womens zone
cat > /home/pi/start-womens-kiosk.sh << 'EOF'
#!/bin/bash
export DISPLAY=:0
chromium-browser \
  --kiosk \
  --no-sandbox \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --start-fullscreen \
  "http://192.168.1.11:3002?zone=womens"
EOF

chmod +x /home/pi/start-womens-kiosk.sh
echo "@/home/pi/start-womens-kiosk.sh" >> ~/.config/lxsession/LXDE-pi/autostart
```

### Option 2: Windows PC/Tablet Thin Clients

#### **Create Kiosk Shortcuts**

**Mens Kiosk (mens-kiosk.bat):**
```batch
@echo off
start chrome --kiosk --no-default-browser-check "http://192.168.1.11:3002?zone=mens"
```

**Womens Kiosk (womens-kiosk.bat):**
```batch
@echo off
start chrome --kiosk --no-default-browser-check "http://192.168.1.11:3002?zone=womens"
```

#### **Auto-Start on Windows**

1. Copy `.bat` files to `C:\kiosk\`
2. Add to Windows startup folder:
   - Press `Win+R`, type `shell:startup`
   - Create shortcut to appropriate `.bat` file

### Option 3: Android Tablet Thin Clients

#### **Using Chrome Browser**

1. **Install Chrome** on Android tablet
2. **Create Bookmarks**:
   - Mens: `http://192.168.1.11:3002?zone=mens`
   - Womens: `http://192.168.1.11:3002?zone=womens`
3. **Enable Kiosk Mode** (if supported) or use fullscreen
4. **Set as Homepage** for auto-launch

#### **Using Kiosk Browser Apps**

1. **Install Kiosk Browser** from Play Store
2. **Configure URL**: `http://192.168.1.11:3002?zone=mens`
3. **Enable Fullscreen Mode**
4. **Disable Navigation** and other controls

## 🧪 Testing Your Setup

### 1. Test Main Server APIs

```bash
# Test from main server
curl "http://192.168.1.11:3002/api/lockers/available?zone=mens" | jq 'length'
curl "http://192.168.1.11:3002/api/lockers/available?zone=womens" | jq 'length'

# Expected: Different counts (30 vs 48 lockers)
```

### 2. Test Thin Client URLs

**From any device on network:**

```bash
# Test mens zone URL
curl "http://192.168.1.11:3002?zone=mens" | grep "Erkek Dolap Sistemi"

# Test womens zone URL  
curl "http://192.168.1.11:3002?zone=womens" | grep "Kadın Dolap Sistemi"
```

### 3. Test RFID Card Scanning

1. **Open Mens Kiosk**: `http://192.168.1.11:3002?zone=mens`
2. **Verify Zone Indicator**: "Erkek Dolap Sistemi" in top-right
3. **Scan RFID Card**: Should show only lockers 2-32
4. **Repeat for Womens**: `http://192.168.1.11:3002?zone=womens`

### 4. Browser Console Verification

Open browser dev tools on thin client:

```javascript
// Check zone detection
console.log('Detected zone:', window.kioskApp?.kioskZone);

// Check API calls include zone
// Look in Network tab for: /api/lockers/available?kioskId=kiosk-1&zone=mens
```

## 🎯 Expected Behavior

### **Mens Kiosk (`?zone=mens`)**

- **URL**: `http://192.168.1.11:3002?zone=mens`
- **Zone Indicator**: "Erkek Dolap Sistemi" (top-right corner)
- **Page Title**: "Erkek Dolap Sistemi - eForm Locker"
- **RFID Card Scan**: Shows only lockers 2-32 (30 available)
- **Error Messages**: "Erkek bölgesi dolapları dolu"
- **API Calls**: Include `&zone=mens` parameter

### **Womens Kiosk (`?zone=womens`)**

- **URL**: `http://192.168.1.11:3002?zone=womens`
- **Zone Indicator**: "Kadın Dolap Sistemi" (top-right corner)
- **Page Title**: "Kadın Dolap Sistemi - eForm Locker"
- **RFID Card Scan**: Shows only lockers 33-80 (48 available)
- **Error Messages**: "Kadın bölgesi dolapları dolu"
- **API Calls**: Include `&zone=womens` parameter

## 🔧 Network Configuration

### Main Server Network Settings

```bash
# Ensure kiosk service binds to all interfaces
# In .env file:
HOST=0.0.0.0
PORT=3002

# Firewall (if enabled)
sudo ufw allow 3002/tcp
```

### Thin Client Network Requirements

- **Network Access**: Must reach `192.168.1.11:3002`
- **DNS/Hosts**: Ensure IP resolution works
- **Firewall**: Allow outbound HTTP/HTTPS

### Network Testing

```bash
# From thin client, test connectivity
ping 192.168.1.11
telnet 192.168.1.11 3002
curl -I http://192.168.1.11:3002
```

## 🔍 Troubleshooting

### Issue: Zone Not Detected on Thin Client

**Symptoms:**
- No zone indicator shown
- All lockers displayed instead of zone-filtered

**Solutions:**

1. **Check URL Parameter**:
   ```
   ✅ Correct: http://192.168.1.11:3002?zone=mens
   ❌ Wrong:   http://192.168.1.11:3002/zone=mens
   ```

2. **Verify Browser Console**:
   ```javascript
   console.log('URL params:', new URLSearchParams(window.location.search).get('zone'));
   ```

3. **Clear Browser Cache**: Hard refresh with `Ctrl+F5`

### Issue: API Calls Missing Zone Parameter

**Symptoms:**
- Zone indicator shows but wrong lockers displayed
- Network tab shows API calls without `&zone=` parameter

**Solutions:**

1. **Check Browser Console Logs**:
   ```javascript
   // Look for: "🎯 Fetching available lockers: /api/lockers/available?kioskId=kiosk-1&zone=mens"
   ```

2. **Verify Zone Detection**:
   ```javascript
   console.log('App zone:', window.kioskApp?.kioskZone);
   ```

3. **Force Refresh**: Close browser completely and reopen

### Issue: Main Server Not Responding

**Symptoms:**
- Thin clients can't connect
- "Connection refused" errors

**Solutions:**

1. **Check Service Status**:
   ```bash
   curl http://localhost:3002/health
   ps aux | grep node
   ```

2. **Check Network Binding**:
   ```bash
   netstat -tlnp | grep 3002
   # Should show: 0.0.0.0:3002 not 127.0.0.1:3002
   ```

3. **Restart Services**:
   ```bash
   sudo killall node
   ./scripts/start-all-clean.sh
   ```

### Issue: RFID Not Working on Thin Clients

**Note**: RFID readers need to be connected to the **main server** (192.168.1.11) where the hardware control is located. Thin clients are for display only unless you have separate RFID readers.

**For RFID on Thin Clients**:
- Connect RFID reader to thin client
- RFID events will be captured by browser
- API calls will be sent to main server for processing

## 📊 Performance Optimization

### Main Server Optimization

```bash
# Increase connection limits for multiple clients
echo "net.core.somaxconn = 1024" >> /etc/sysctl.conf
echo "fs.file-max = 65536" >> /etc/sysctl.conf
sysctl -p
```

### Thin Client Optimization

```bash
# Reduce memory usage on Pi Zero
echo "gpu_mem=16" >> /boot/config.txt
echo "disable_splash=1" >> /boot/config.txt

# Chromium optimization flags
--memory-pressure-off
--max_old_space_size=128
--disable-background-timer-throttling
```

## 🎉 Deployment Summary

Your **one server + multiple thin clients** architecture is perfect for:

✅ **Centralized Management**: All logic and data on main server
✅ **Cost Effective**: Cheap thin clients (Pi Zero, tablets, old PCs)
✅ **Easy Maintenance**: Update only main server
✅ **Zone Separation**: Clear visual and functional separation
✅ **Scalable**: Add more zones by adding URL parameters
✅ **Network Efficient**: Minimal bandwidth usage

## 📋 Quick Setup Checklist

### Main Server (192.168.1.11)
- [ ] Deploy zone-aware code
- [ ] Do NOT set KIOSK_ZONE environment variable
- [ ] Start all services
- [ ] Test zone APIs work
- [ ] Verify network accessibility

### Mens Thin Client
- [ ] Configure to open `http://192.168.1.11:3002?zone=mens`
- [ ] Set up auto-start/kiosk mode
- [ ] Test zone indicator shows "Erkek Dolap Sistemi"
- [ ] Test RFID shows only mens lockers (2-32)

### Womens Thin Client
- [ ] Configure to open `http://192.168.1.11:3002?zone=womens`
- [ ] Set up auto-start/kiosk mode
- [ ] Test zone indicator shows "Kadın Dolap Sistemi"
- [ ] Test RFID shows only womens lockers (33-80)

Your architecture is **production-ready** and will provide excellent zone separation with minimal hardware costs!