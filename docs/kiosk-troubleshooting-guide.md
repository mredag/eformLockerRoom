# Kiosk UI Troubleshooting Guide

## Overview

This guide provides step-by-step troubleshooting procedures for common issues with the optimized kiosk UI system. Issues are organized by category with clear symptoms, causes, and solutions.

## Quick Diagnostic Commands

### System Health Check
```bash
# Run comprehensive health check
./scripts/health-check-kiosk.sh

# Check service status
sudo systemctl status kiosk-ui.service

# Check resource usage
htop

# Check disk space
df -h

# Check memory usage
free -h
```

### Service Status Check
```bash
# Check if kiosk service is running
pgrep -f "node.*kiosk"

# Check service logs
tail -50 /home/pi/logs/kiosk.log

# Test API endpoint
curl http://localhost:3002/health
```

## Common Issues and Solutions

### 1. Service Won't Start

#### Symptoms
- Kiosk service fails to start
- Error messages in logs about port conflicts
- `systemctl status` shows failed state

#### Possible Causes
- Port 3002 already in use
- Missing dependencies
- Configuration file errors
- Permission issues

#### Solutions

**Check Port Usage**:
```bash
# Check what's using port 3002
sudo lsof -i :3002

# Kill conflicting processes
sudo pkill -f "node.*3002"
```

**Verify Dependencies**:
```bash
# Check Node.js version
node --version  # Should be 18.x+

# Reinstall dependencies
cd /home/pi/eform-locker
npm install
```

**Check Configuration**:
```bash
# Verify config file exists and is valid
cat /etc/kiosk-config.json | jq .

# Check environment variables
env | grep KIOSK
```

**Fix Permissions**:
```bash
# Fix file permissions
sudo chown -R pi:pi /home/pi/eform-locker
chmod +x scripts/*.sh
```

### 2. High Memory Usage / System Freezes

#### Symptoms
- System becomes unresponsive
- High memory usage in `htop`
- Browser crashes or becomes slow
- Service restarts frequently

#### Possible Causes
- Memory leaks in JavaScript
- Too many concurrent sessions
- Insufficient memory for Pi model
- Background processes consuming memory

#### Solutions

**Immediate Relief**:
```bash
# Clear system caches
sudo sync && sudo sysctl vm.drop_caches=3

# Restart kiosk service
sudo systemctl restart kiosk-ui.service

# Kill unnecessary processes
sudo pkill -f chromium
sudo pkill -f firefox
```

**Long-term Solutions**:
```bash
# Enable memory monitoring
echo 'KIOSK_MEMORY_MONITORING=true' >> ~/.bashrc

# Reduce memory limits for Pi model
# Edit /etc/kiosk-config.json
{
  "performance": {
    "maxMemoryUsage": "150MB"  // Reduce for Pi 3B
  }
}

# Enable automatic cleanup
echo '*/10 * * * * /home/pi/eform-locker/scripts/cleanup-memory.sh' | crontab -
```

### 3. Touch Screen Not Responding

#### Symptoms
- Touch events not registered
- Incorrect touch coordinates
- Intermittent touch response

#### Possible Causes
- Touch screen driver issues
- Calibration problems
- Hardware connection issues
- CSS touch-action conflicts

#### Solutions

**Check Hardware**:
```bash
# List input devices
ls /dev/input/

# Test touch events
sudo evtest /dev/input/event0
```

**Recalibrate Touch Screen**:
```bash
# Install calibration tool
sudo apt install xinput-calibrator

# Run calibration
xinput_calibrator

# Apply calibration settings
sudo nano /usr/share/X11/xorg.conf.d/99-calibration.conf
```

**Check CSS Configuration**:
```javascript
// Verify touch-action is not disabled
// In app-simple.js, ensure:
document.body.style.touchAction = 'manipulation';
```

### 4. RFID Card Reading Issues

#### Symptoms
- Cards not detected
- Incorrect card IDs read
- Intermittent card reading

#### Possible Causes
- RFID reader connection issues
- Driver problems
- Interference from other devices
- Card reader configuration

#### Solutions

**Check Hardware Connection**:
```bash
# List USB devices
lsusb

# Check for RFID reader (should show as HID device)
ls /dev/input/by-id/ | grep -i rfid
```

**Test Card Reading**:
```bash
# Test RFID input directly
sudo evtest /dev/input/event1  # Adjust event number

# Check browser console for card events
# Open browser dev tools and scan card
```

**Fix Driver Issues**:
```bash
# Ensure HID drivers are loaded
sudo modprobe usbhid

# Check dmesg for USB errors
dmesg | grep -i usb | tail -20
```

### 5. Network Connectivity Issues

#### Symptoms
- API calls failing
- "Network Error" messages
- Intermittent connectivity
- Slow response times

#### Possible Causes
- WiFi power management
- Network configuration issues
- DNS problems
- Firewall blocking connections

#### Solutions

**Check Network Status**:
```bash
# Test connectivity
ping google.com

# Check network interface
ip addr show

# Test local API
curl http://localhost:3002/health
```

**Fix WiFi Issues**:
```bash
# Disable power management
sudo iwconfig wlan0 power off

# Restart network service
sudo systemctl restart networking

# Check WiFi signal strength
iwconfig wlan0
```

**Configure Static IP**:
```bash
# Edit network configuration
sudo nano /etc/dhcpcd.conf

# Add static IP configuration
interface wlan0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8
```

### 6. Display Issues

#### Symptoms
- Blank screen
- Incorrect resolution
- UI elements cut off
- Poor text rendering

#### Possible Causes
- Display configuration issues
- Resolution mismatch
- Graphics driver problems
- CSS viewport issues

#### Solutions

**Check Display Configuration**:
```bash
# Check current resolution
xrandr

# List available resolutions
xrandr --listmodes

# Set appropriate resolution
xrandr --output HDMI-1 --mode 1024x768
```

**Fix Boot Configuration**:
```bash
# Edit boot config
sudo nano /boot/config.txt

# Add/modify these lines:
hdmi_force_hotplug=1
hdmi_group=2
hdmi_mode=16  # 1024x768 @ 60Hz
```

**CSS Viewport Fix**:
```html
<!-- Ensure proper viewport meta tag -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
```

### 7. Performance Issues

#### Symptoms
- Slow UI response
- Laggy animations
- High CPU usage
- Delayed touch feedback

#### Possible Causes
- Insufficient resources for Pi model
- Background processes
- Inefficient JavaScript code
- Too many DOM elements

#### Solutions

**Optimize for Pi Model**:
```bash
# Check Pi model
cat /proc/cpuinfo | grep Model

# Apply appropriate configuration
sudo cp config/pi3-config.json /etc/kiosk-config.json  # For Pi 3B
```

**Reduce Background Load**:
```bash
# Disable unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable cups

# Check running processes
ps aux --sort=-%cpu | head -10
```

**JavaScript Optimization**:
```javascript
// Enable performance mode in config
{
  "performance": {
    "animationLevel": "none",
    "updateInterval": 500,
    "enableGPUAcceleration": false
  }
}
```

### 8. Hardware Communication Errors

#### Symptoms
- Lockers not opening
- "Hardware Error" messages
- Modbus communication failures
- Relay control issues

#### Possible Causes
- Serial port conflicts
- Modbus configuration errors
- Hardware connection issues
- Permission problems

#### Solutions

**Check Serial Port**:
```bash
# List serial ports
ls -la /dev/ttyUSB*

# Check port permissions
sudo chmod 666 /dev/ttyUSB0

# Test serial communication
sudo minicom -D /dev/ttyUSB0 -b 9600
```

**Test Hardware Directly**:
```bash
# Run hardware test script
node scripts/test-basic-relay-control.js

# Check Modbus communication
node scripts/test-modbus-simple.js
```

**Fix Port Conflicts**:
```bash
# Check what's using the serial port
sudo lsof /dev/ttyUSB0

# Kill conflicting processes
sudo pkill -f ttyUSB0
```

## Diagnostic Scripts

### Automated Diagnostics
```bash
# Run comprehensive system check
./scripts/diagnose-kiosk-system.sh

# Check specific components
./scripts/test-touch-interface.js
./scripts/test-rfid-simple.js
./scripts/test-hardware-simple.js
```

### Log Analysis
```bash
# Search for specific errors
grep -i "error" /home/pi/logs/kiosk.log | tail -20

# Check memory usage over time
grep -i "memory" /home/pi/logs/kiosk.log | tail -20

# Monitor real-time logs
tail -f /home/pi/logs/kiosk.log | grep -i "error\|warning"
```

## Recovery Procedures

### Service Recovery
```bash
# Restart kiosk service
sudo systemctl restart kiosk-ui.service

# If service won't start, force kill and restart
sudo pkill -9 -f "node.*kiosk"
sleep 5
sudo systemctl start kiosk-ui.service
```

### System Recovery
```bash
# Soft reboot (preferred)
sudo systemctl reboot

# Hard reboot (if system is frozen)
# Use physical power cycle as last resort
```

### Configuration Recovery
```bash
# Restore default configuration
sudo cp config/default-config.json /etc/kiosk-config.json

# Reset environment variables
unset KIOSK_MEMORY_LIMIT
unset KIOSK_GPU_ACCELERATION
source ~/.bashrc
```

### Data Recovery
```bash
# Restore from backup
./scripts/deploy-kiosk-ui.sh rollback

# Verify restoration
curl http://localhost:3002/health
```

## Monitoring and Prevention

### Automated Monitoring
```bash
# Set up monitoring cron jobs
crontab -e

# Add these lines:
# Check service every 5 minutes
*/5 * * * * /home/pi/eform-locker/scripts/check-kiosk-health.sh

# Clean up logs daily
0 2 * * * /home/pi/eform-locker/scripts/cleanup-logs.sh

# Monitor memory usage hourly
0 * * * * /home/pi/eform-locker/scripts/monitor-memory.sh
```

### Performance Monitoring
```bash
# Enable performance logging
echo 'KIOSK_PERFORMANCE_LOGGING=true' >> ~/.bashrc

# Monitor key metrics
watch -n 5 'free -h && ps aux | grep node | grep kiosk'
```

### Preventive Maintenance
```bash
# Weekly system update (test first!)
sudo apt update && sudo apt list --upgradable

# Monthly log rotation
sudo logrotate -f /etc/logrotate.conf

# Quarterly full backup
./scripts/backup-kiosk-system.sh
```

## Emergency Procedures

### System Unresponsive
1. Try SSH connection: `ssh pi@kiosk-ip`
2. If SSH works: `sudo systemctl restart kiosk-ui.service`
3. If SSH fails: Physical power cycle
4. After reboot: Check logs and run diagnostics

### Hardware Failure
1. Check hardware connections
2. Test with known working hardware
3. Run hardware diagnostic scripts
4. Contact hardware vendor if needed

### Data Corruption
1. Stop all services: `sudo systemctl stop kiosk-ui.service`
2. Backup current state: `./scripts/backup-current-state.sh`
3. Restore from known good backup: `./scripts/restore-backup.sh`
4. Verify system integrity: `./scripts/verify-system.sh`

## Getting Help

### Log Collection
```bash
# Collect all relevant logs
./scripts/collect-diagnostic-logs.sh

# This creates: /tmp/kiosk-diagnostics-TIMESTAMP.tar.gz
```

### System Information
```bash
# Generate system report
./scripts/generate-system-report.sh

# Includes:
# - Pi model and specs
# - Software versions
# - Configuration files
# - Recent logs
# - Performance metrics
```

### Contact Information
- **Technical Support**: Check project documentation
- **Hardware Issues**: Refer to hardware vendor documentation
- **Software Issues**: Check project GitHub issues

## Troubleshooting Checklist

### Before Calling for Help
- [ ] Checked service status
- [ ] Reviewed recent logs
- [ ] Tested basic connectivity
- [ ] Verified hardware connections
- [ ] Tried service restart
- [ ] Checked available disk space
- [ ] Verified system time is correct
- [ ] Collected diagnostic information

### Information to Provide
- Pi model and RAM size
- Software version
- Error messages (exact text)
- Steps to reproduce issue
- Recent changes made
- Diagnostic log files

This troubleshooting guide should help resolve most common issues with the kiosk UI system. For complex issues, use the diagnostic scripts and collect detailed information before seeking additional help.