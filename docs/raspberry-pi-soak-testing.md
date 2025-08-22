# Raspberry Pi Soak Testing Deployment Guide

This guide covers deploying and running the hardware soak testing system on Raspberry Pi.

## Prerequisites

### Hardware Requirements
- Raspberry Pi 4 (2GB+ RAM recommended)
- MicroSD card (32GB+ recommended)
- Waveshare Modbus RTU Relay modules
- USB-to-RS485 converter
- Locker hardware with electronic locks

### Software Requirements
- Raspberry Pi OS (Bullseye or newer)
- Node.js 18+ 
- Git

## Installation Steps

### 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git and build tools
sudo apt-get install -y git build-essential python3-dev

# Add user to hardware access groups
sudo usermod -a -G dialout,gpio $USER
```

**Important:** Log out and back in after adding user to groups.

### 2. Project Deployment

```bash
# Clone the project
git clone <your-repo-url> eform-locker-system
cd eform-locker-system

# Install dependencies
npm install

# Run database migrations
npm run migrate

# Validate Pi compatibility
chmod +x scripts/validate-pi-soak-tests.sh
./scripts/validate-pi-soak-tests.sh
```

### 3. Hardware Configuration

#### USB-to-RS485 Device Setup
```bash
# Check for USB serial devices
ls -la /dev/tty*

# Typical device names:
# /dev/ttyUSB0 - USB-to-serial adapter
# /dev/ttyAMA0 - Pi's built-in UART
```

#### Modbus Configuration
Update the hardware configuration in `config/system.json`:

```json
{
  "hardware": {
    "modbus": {
      "port": "/dev/ttyUSB0",
      "baudRate": 9600,
      "timeout": 1000
    }
  }
}
```

## Running Soak Tests

### Quick Validation
```bash
# Run all soak tests
npm run test:soak

# Run specific test suites
npx vitest run app/kiosk/src/__tests__/soak/hardware-endurance.test.ts
```

### Extended Soak Testing
```bash
# Run 1000-cycle endurance test on actual hardware
npm run test:soak -- --timeout=3600000  # 1 hour timeout

# Run with verbose logging
DEBUG=soak-test npm run test:soak
```

### Continuous Monitoring
```bash
# Run soak tests every hour
echo "0 * * * * cd /home/pi/eform-locker-system && npm run test:soak >> /var/log/soak-tests.log 2>&1" | crontab -

# Monitor test logs
tail -f /var/log/soak-tests.log
```

## Performance Considerations

### Memory Management
- **Minimum:** 1GB RAM
- **Recommended:** 2GB+ RAM for extended testing
- Monitor memory usage: `free -h`

### CPU Performance
- Tests may run 2-3x slower than development machines
- Increase test timeouts if needed
- Monitor CPU temperature: `vcgencmd measure_temp`

### Storage
- Ensure 1GB+ free space for test logs and database
- Use high-quality SD card (Class 10 or better)
- Consider USB storage for better I/O performance

## Hardware Integration

### Modbus Communication
```bash
# Test Modbus connectivity
node scripts/diagnose-modbus-issue.js

# Test relay activation
node scripts/test-relay-activation.js
```

### RFID Integration
```bash
# Check RFID reader connectivity
node scripts/check-rfid-devices.js

# Test RFID functionality
node scripts/test-rfid-simple.js
```

## Troubleshooting

### Common Issues

#### Permission Denied on Serial Port
```bash
# Check user groups
groups $USER

# Should include: dialout, gpio

# If not, add and reboot
sudo usermod -a -G dialout,gpio $USER
sudo reboot
```

#### Memory Issues During Testing
```bash
# Increase swap space
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Set CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

#### Slow Test Execution
```bash
# Increase test timeouts in vitest.config.comprehensive.ts
export default defineConfig({
  test: {
    timeout: 30000,  // 30 seconds instead of 5
    hookTimeout: 10000
  }
})
```

### Hardware Debugging

#### Check Modbus Connection
```bash
# List USB devices
lsusb

# Check serial device permissions
ls -la /dev/ttyUSB*

# Test serial communication
sudo minicom -D /dev/ttyUSB0 -b 9600
```

#### Monitor System Resources
```bash
# Real-time system monitoring
htop

# Check temperature
watch -n 1 vcgencmd measure_temp

# Monitor disk usage
df -h
```

## Production Deployment

### Systemd Service Setup
```bash
# Create service file
sudo nano /etc/systemd/system/eform-soak-monitor.service
```

```ini
[Unit]
Description=EForm Locker Soak Test Monitor
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eform-locker-system
ExecStart=/usr/bin/npm run test:soak
Restart=always
RestartSec=3600
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable eform-soak-monitor
sudo systemctl start eform-soak-monitor

# Check status
sudo systemctl status eform-soak-monitor

# View logs
sudo journalctl -u eform-soak-monitor -f
```

### Log Rotation
```bash
# Create logrotate config
sudo nano /etc/logrotate.d/eform-soak-tests
```

```
/var/log/soak-tests.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
}
```

## Monitoring and Alerts

### Health Checks
```bash
# Create health check script
cat > scripts/health-check-pi.sh << 'EOF'
#!/bin/bash
# Check system health for soak testing

# Check temperature
TEMP=$(vcgencmd measure_temp | cut -d'=' -f2 | cut -d"'" -f1)
if (( $(echo "$TEMP > 70" | bc -l) )); then
    echo "WARNING: High CPU temperature: ${TEMP}°C"
fi

# Check memory
FREE_MB=$(free -m | grep '^Mem:' | awk '{print $7}')
if [ "$FREE_MB" -lt 100 ]; then
    echo "WARNING: Low memory: ${FREE_MB}MB available"
fi

# Check disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "WARNING: High disk usage: ${DISK_USAGE}%"
fi

echo "System health check completed"
EOF

chmod +x scripts/health-check-pi.sh
```

### Email Alerts (Optional)
```bash
# Install mail utilities
sudo apt-get install -y ssmtp mailutils

# Configure ssmtp for email alerts
sudo nano /etc/ssmtp/ssmtp.conf
```

## Best Practices

1. **Regular Monitoring:** Check system health daily
2. **Temperature Management:** Ensure adequate cooling
3. **Backup Strategy:** Regular database and config backups
4. **Update Schedule:** Keep system and dependencies updated
5. **Documentation:** Log any hardware-specific configurations

## Performance Benchmarks

Expected performance on Raspberry Pi 4 (2GB):
- **Soak Test Suite:** 8-15 seconds
- **1000-Cycle Test:** 15-30 minutes (depending on hardware)
- **Memory Usage:** 200-400MB during testing
- **CPU Usage:** 50-80% during intensive tests

## Support

For Pi-specific issues:
1. Check the generated `pi-soak-test-report.md`
2. Review system logs: `sudo journalctl -xe`
3. Monitor hardware: `dmesg | tail`
4. Test hardware connectivity with diagnostic scripts

The soak testing system is designed to be robust and work reliably on Raspberry Pi hardware with proper configuration.