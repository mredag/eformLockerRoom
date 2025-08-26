# Raspberry Pi Environment Setup Guide

## 🔧 Required Environment Variables

Set these environment variables on your Raspberry Pi for optimal hardware integration:

### Database Configuration
```bash
export EFORM_DB_PATH="/home/pi/eform-locker/data/eform.db"
```

### Kiosk Configuration
```bash
export KIOSK_ID="kiosk-1"
```

### Modbus/RS-485 Configuration
```bash
export MODBUS_PORT="/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0"
export MODBUS_BAUD="9600"
export MODBUS_PARITY="none"
```

### Timing Configuration
```bash
export PULSE_DURATION_MS="400"        # Adjust based on your relay requirements
export COMMAND_INTERVAL_MS="2000"     # Command polling interval
export MAX_RETRIES="3"                # Maximum retry attempts for failed commands
```

## 📝 Setting Up Environment Variables

### Option 1: System-wide (Recommended for Production)
```bash
sudo nano /etc/environment
```

Add these lines:
```
EFORM_DB_PATH="/home/pi/eform-locker/data/eform.db"
KIOSK_ID="kiosk-1"
MODBUS_PORT="/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0"
MODBUS_BAUD="9600"
MODBUS_PARITY="none"
PULSE_DURATION_MS="400"
COMMAND_INTERVAL_MS="2000"
MAX_RETRIES="3"
```

### Option 2: User Profile
```bash
nano ~/.bashrc
```

Add these lines at the end:
```bash
# eForm Locker Environment Variables
export EFORM_DB_PATH="/home/pi/eform-locker/data/eform.db"
export KIOSK_ID="kiosk-1"
export MODBUS_PORT="/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0"
export MODBUS_BAUD="9600"
export MODBUS_PARITY="none"
export PULSE_DURATION_MS="400"
export COMMAND_INTERVAL_MS="2000"
export MAX_RETRIES="3"
```

Then reload:
```bash
source ~/.bashrc
```

### Option 3: Project-specific .env file
```bash
cd /home/pi/eform-locker
nano .env
```

Add:
```
EFORM_DB_PATH="/home/pi/eform-locker/data/eform.db"
KIOSK_ID="kiosk-1"
MODBUS_PORT="/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0"
MODBUS_BAUD="9600"
MODBUS_PARITY="none"
PULSE_DURATION_MS="400"
COMMAND_INTERVAL_MS="2000"
MAX_RETRIES="3"
```

## 🔍 Finding Your RS-485 Device Path

### List available serial devices:
```bash
ls -la /dev/serial/by-id/
```

### Common RS-485 converter patterns:
- FTDI: `/dev/serial/by-id/usb-FTDI_*`
- CH340: `/dev/serial/by-id/usb-1a86_USB2.0-Serial-*`
- CP2102: `/dev/serial/by-id/usb-Silicon_Labs_CP2102_*`

### Test your device:
```bash
# Check if device exists
ls -la /dev/serial/by-id/usb-FTDI_*

# Test basic communication
sudo chmod 666 /dev/serial/by-id/usb-FTDI_*
```

## ⚙️ Hardware-Specific Adjustments

### Pulse Duration
- **Default**: 500ms
- **Recommended**: 400ms for most relays
- **Fast relays**: 200-300ms
- **Slow relays**: 600-1000ms

### Modbus Settings
- **Baud Rate**: Usually 9600 or 19200
- **Parity**: Usually "none" or "even"
- **Data Bits**: 8 (default)
- **Stop Bits**: 1 (default)

## 🗄️ Database and Logging

### Database Backup Script
```bash
#!/bin/bash
# Create daily database backups
DB_PATH="/home/pi/eform-locker/data/eform.db"
BACKUP_DIR="/home/pi/eform-locker/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
cp "$DB_PATH" "$BACKUP_DIR/eform_backup_$DATE.db"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "eform_backup_*.db" -mtime +7 -delete
```

### Log Rotation Setup
```bash
sudo nano /etc/logrotate.d/eform-locker
```

Add:
```
/home/pi/eform-locker/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
}
```

## 🚀 Verification Commands

### Check Environment Variables
```bash
env | grep -E "(EFORM|KIOSK|MODBUS|PULSE|COMMAND|MAX_RETRIES)"
```

### Test Hardware Connection
```bash
# Run hardware validation
npm run test:hardware

# Test Modbus communication
node scripts/test-modbus-controller-mapping.js
```

### Verify Services
```bash
# Check all services are running
npm run start

# Test admin panel access
curl http://localhost:3003/health

# Test kiosk API
curl http://localhost:3002/health
```

## 🔧 Troubleshooting

### Permission Issues
```bash
# Add pi user to dialout group for serial access
sudo usermod -a -G dialout pi

# Set correct permissions for serial device
sudo chmod 666 /dev/serial/by-id/usb-*
```

### Service Issues
```bash
# Check service logs
journalctl -u eform-locker -f

# Restart services
sudo systemctl restart eform-locker
```

### Database Issues
```bash
# Check database integrity
sqlite3 /home/pi/eform-locker/data/eform.db "PRAGMA integrity_check;"

# Run migration fix if needed
npm run migrate:fix-duplicates
```

## 📋 Production Checklist

- [ ] Environment variables configured
- [ ] RS-485 device path verified and stable
- [ ] Database backups configured
- [ ] Log rotation setup
- [ ] Hardware validation tests pass
- [ ] All services start successfully
- [ ] Admin panel accessible
- [ ] Kiosk responds to commands
- [ ] Modbus communication working
- [ ] Relay control functional