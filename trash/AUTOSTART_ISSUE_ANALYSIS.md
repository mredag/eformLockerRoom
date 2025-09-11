# Autostart Issue Analysis & Solution

## 🚨 Problem Identified

The eForm Locker services are not starting automatically on Raspberry Pi restart due to **missing startup scripts**.

### Root Cause

The systemd services were configured to call scripts in `scripts/deployment/` but these scripts didn't exist:

**Missing Scripts:**
- `scripts/deployment/startup-services.sh` ❌
- `scripts/deployment/stop-services.sh` ❌  
- `scripts/deployment/hardware-init.sh` ❌
- `scripts/deployment/system-monitor.sh` ❌
- `scripts/deployment/restart-services.sh` ❌

**Systemd Service Configuration:**
```ini
# /etc/systemd/system/eform-locker.service
ExecStart=/bin/bash /home/pi/eform-locker/scripts/deployment/startup-services.sh
ExecStop=/bin/bash /home/pi/eform-locker/scripts/deployment/stop-services.sh
```

**What Existed:**
- Similar scripts in `scripts/maintenance/` ✅
- Working `scripts/start-all-clean.sh` ✅
- Systemd service files ✅

## 🔧 Solution Implemented

### 1. Created Missing Scripts

**Created the following scripts in `scripts/deployment/`:**

#### `startup-services.sh`
- Comprehensive service startup with health checks
- Proper service ordering (Gateway → Kiosk → Panel)
- PID file management
- Service readiness verification
- Detailed logging and status reporting

#### `stop-services.sh`
- Graceful service shutdown
- PID-based process management
- Fallback force-kill if needed
- Port availability verification
- Cleanup of PID files

#### `hardware-init.sh`
- USB-RS485 adapter detection and configuration
- System permissions setup
- Network configuration check
- Resource monitoring (memory, disk, temperature)
- Database and Node.js verification
- Status file creation for monitoring

#### `system-monitor.sh`
- Continuous health monitoring (60s intervals)
- Service health checks with auto-restart
- Resource usage monitoring
- Hardware connectivity checks
- Log rotation and alert management
- Status file updates

#### `restart-services.sh`
- Simple restart wrapper
- Calls stop then start scripts
- Proper error handling

### 2. Created Fix Script

**`fix-autostart-issue.sh`** - One-command fix for the issue:
- Makes all scripts executable
- Reloads systemd daemon
- Enables all services
- Tests hardware initialization
- Provides clear next steps

## 🎯 How to Apply the Fix

### On Raspberry Pi:

```bash
# 1. Pull latest changes
cd /home/pi/eform-locker
git pull origin main

# 2. Run the fix script
bash fix-autostart-issue.sh

# 3. Reboot to test autostart
sudo reboot

# 4. After reboot, verify services
sudo systemctl status eform-locker
curl http://localhost:3000/health
curl http://localhost:3002/health
```

### From Windows PC (Remote):

```powershell
# Push changes to Pi
git add .
git commit -m "fix: add missing startup scripts for autostart functionality"
git push origin main

# SSH to Pi and apply fix
ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main && bash fix-autostart-issue.sh"

# Reboot Pi
ssh pi@pi-eform-locker "sudo reboot"

# Wait 2 minutes, then test
Start-Sleep 120
ssh pi@pi-eform-locker "sudo systemctl status eform-locker"
```

## 🔍 Verification Steps

After reboot, verify autostart is working:

### 1. Check Systemd Services
```bash
sudo systemctl status eform-locker
sudo systemctl status eform-hardware-init
sudo systemctl status eform-monitor
```

### 2. Check Service Health
```bash
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk
curl http://localhost:3001         # Panel
```

### 3. Check Logs
```bash
sudo journalctl -u eform-locker -f
tail -f /home/pi/eform-locker/logs/gateway.log
tail -f /home/pi/eform-locker/logs/kiosk.log
```

### 4. Check Process Status
```bash
ps aux | grep node
netstat -tuln | grep -E ":(3000|3001|3002)"
```

## 📊 Expected Results

After applying the fix and rebooting:

### ✅ Services Should Auto-Start
- **Gateway** on port 3000
- **Kiosk** on port 3002  
- **Panel** on port 3001

### ✅ Health Endpoints Should Respond
- `http://192.168.1.8:3000/health` → `{"status":"ok"}`
- `http://192.168.1.8:3002/health` → `{"status":"ok"}`
- `http://192.168.1.8:3001` → Admin panel loads

### ✅ Systemd Services Should Be Active
```
● eform-locker.service - eForm Locker System - Main Service
   Loaded: loaded (/etc/systemd/system/eform-locker.service; enabled)
   Active: active (running)
```

## 🚨 Troubleshooting

### If Services Still Don't Start

1. **Check systemd logs:**
   ```bash
   sudo journalctl -u eform-locker --no-pager
   sudo journalctl -u eform-hardware-init --no-pager
   ```

2. **Manual start for debugging:**
   ```bash
   cd /home/pi/eform-locker
   bash scripts/deployment/startup-services.sh
   ```

3. **Check script permissions:**
   ```bash
   ls -la scripts/deployment/*.sh
   # Should show -rwxr-xr-x permissions
   ```

4. **Verify Node.js and dependencies:**
   ```bash
   node --version
   npm --version
   ls -la node_modules/
   ```

### Common Issues

**Port conflicts:** Kill existing processes
```bash
sudo killall node
sudo fuser -k 3000/tcp 3001/tcp 3002/tcp
```

**Permission issues:** Fix ownership
```bash
sudo chown -R pi:pi /home/pi/eform-locker
sudo chmod +x scripts/deployment/*.sh
```

**USB device issues:** Check hardware
```bash
ls -la /dev/ttyUSB*
sudo chmod 666 /dev/ttyUSB0
```

## 📚 Related Files

### Scripts Created/Fixed
- `scripts/deployment/startup-services.sh`
- `scripts/deployment/stop-services.sh`
- `scripts/deployment/hardware-init.sh`
- `scripts/deployment/system-monitor.sh`
- `scripts/deployment/restart-services.sh`
- `fix-autostart-issue.sh`

### Systemd Services (Already Existed)
- `/etc/systemd/system/eform-locker.service`
- `/etc/systemd/system/eform-hardware-init.service`
- `/etc/systemd/system/eform-monitor.service`

### Status Files (Created by Scripts)
- `/home/pi/eform-locker/.startup-success`
- `/home/pi/eform-locker/.hardware-init-status`
- `/home/pi/eform-locker/.system-status`
- `/home/pi/eform-locker/.system-alerts`

## 🎉 Summary

The autostart issue was caused by missing startup scripts that the systemd services were configured to call. The solution creates these missing scripts with comprehensive functionality including:

- **Proper service startup sequencing**
- **Health monitoring and auto-recovery**
- **Hardware initialization and validation**
- **Resource monitoring and alerting**
- **Graceful shutdown procedures**

After applying this fix, the eForm Locker system will automatically start all services on boot and maintain them with continuous monitoring and auto-recovery capabilities.