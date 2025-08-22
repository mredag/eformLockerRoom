# 🚀 Raspberry Pi Deployment Guide - Complete Setup

**Eform Locker System - Production Deployment**

This guide covers the complete deployment process from a fresh Raspberry Pi to a fully operational locker system.

## 📋 Prerequisites

### Hardware Requirements
- **Raspberry Pi 4** (4GB+ RAM recommended)
- **32GB+ microSD card** (Class 10 or better)
- **Waveshare 16CH Modbus RTU Relay** (2x cards for 32 lockers)
- **USB-RS485 converter**
- **RFID reader** (HID or keyboard mode)
- **7" touchscreen display** (optional but recommended)
- **Reliable power supply** (5V 3A minimum)

### Network Requirements
- **Ethernet connection** (preferred) or WiFi
- **Internet access** for initial setup
- **Static IP** or DHCP reservation recommended

## 🔧 Step 1: Raspberry Pi OS Installation

### 1.1 Download and Flash OS
```bash
# Download Raspberry Pi Imager
# Flash Raspberry Pi OS (64-bit) to SD card

# Enable SSH, set username/password, configure WiFi
# Username: pi
# Password: [secure password]
# WiFi: [your network]
# Locale: Turkey/Turkish keyboard
```

### 1.2 First Boot Configuration
```bash
# SSH into the Pi
ssh pi@[pi-ip-address]

# Update system
sudo apt update && sudo apt upgrade -y
sudo rpi-update

# Enable required interfaces
sudo raspi-config
# Interface Options > SSH (Enable)
# Interface Options > I2C (Enable) 
# Interface Options > SPI (Enable)
# Advanced Options > Expand Filesystem
```

## 📦 Step 2: System Dependencies

### 2.1 Install Node.js 20
```bash
# Install Node.js 20 (required for eForm system)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x or higher
```

### 2.2 Install System Tools
```bash
# Development and system tools
sudo apt install -y git vim htop screen curl wget build-essential
sudo apt install -y python3-pip python3-serial

# USB and serial port tools
sudo apt install -y minicom setserial usbutils

# Security tools
sudo apt install -y ufw fail2ban

# Performance monitoring
sudo apt install -y iotop nethogs
```

### 2.3 Configure User Permissions
```bash
# Add pi user to required groups
sudo usermod -a -G dialout,gpio,i2c,spi,audio,video,input pi

# Set up USB device permissions
sudo chmod 666 /dev/ttyUSB* 2>/dev/null || true
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", MODE="0666"' | sudo tee /etc/udev/rules.d/99-usb-serial.rules
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", MODE="0666"' | sudo tee -a /etc/udev/rules.d/99-usb-serial.rules
sudo udevadm control --reload-rules
```

## 🔐 Step 3: Security Configuration

### 3.1 Firewall Setup
```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 3000:3003/tcp  # eForm services

# Configure fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3.2 SSH Security (Optional)
```bash
# Disable password authentication (use SSH keys)
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 📁 Step 4: Project Setup

### 4.1 Clone Repository
```bash
# Clone the eForm Locker project
cd /home/pi
git clone https://github.com/mredag/eformLockerRoom.git eform-locker
cd eform-locker

# Set up Git identity
git config user.email "pi@eform-locker.local"
git config user.name "Raspberry Pi Eform System"
```

### 4.2 Install Dependencies
```bash
# Install all project dependencies
npm install
npm run install-all

# Install TypeScript runner globally
npm install -g tsx

# Validate Node.js compatibility
npm run validate:nodejs
```

## ⚙️ Step 5: System Configuration

### 5.1 Generate Production Configuration
```bash
# Generate secure production configuration
npm run config:setup

# Validate configuration
npm run config:validate

# View configuration summary
npm run config:show
```

### 5.2 Database Setup
```bash
# Run database migrations
npm run migrate

# Verify database
npm run migrate:status
```

## 🔌 Step 6: Hardware Validation

### 6.1 Check Hardware Connections
```bash
# List USB devices
lsusb

# Check serial ports
ls -la /dev/ttyUSB*

# Check input devices (for RFID)
ls -la /dev/input/event*
```

### 6.2 Test Hardware Components
```bash
# Test Waveshare relay cards
npm run test:hardware

# Check RFID devices
npx tsx scripts/check-rfid-devices.js

# Test RFID functionality
npx tsx scripts/test-rfid-simple.js

# Run integration tests
npm run test:integration
```

## 🚀 Step 7: Service Deployment

### 7.1 Install Systemd Services
```bash
# Copy service files
sudo cp scripts/systemd/*.service /etc/systemd/system/

# Reload systemd and enable services
sudo systemctl daemon-reload
sudo systemctl enable eform-gateway eform-kiosk eform-panel

# Start services
sudo systemctl start eform-gateway
sudo systemctl start eform-kiosk  
sudo systemctl start eform-panel
```

### 7.2 Verify Service Status
```bash
# Check service status
sudo systemctl status eform-*

# Check service logs
sudo journalctl -u eform-gateway -f
sudo journalctl -u eform-kiosk -f
sudo journalctl -u eform-panel -f
```

## 🌐 Step 8: System Validation

### 8.1 Health Check Endpoints
```bash
# Test all service health endpoints
curl http://localhost:3000/health  # Gateway
curl http://localhost:3001/health  # Kiosk
curl http://localhost:3003/health  # Panel

# Check network accessibility
curl http://pi-eform-locker.local:3000/health
```

### 8.2 Web Interface Access
```bash
# Access web interfaces
echo "🌐 System URLs:"
echo "Gateway API: http://pi-eform-locker.local:3000"
echo "Kiosk Interface: http://pi-eform-locker.local:3001"
echo "Admin Panel: http://pi-eform-locker.local:3003"
```

### 8.3 Comprehensive System Test
```bash
# Run full system validation
npm run test:comprehensive

# Test hardware endurance
npm run test:soak

# Performance validation
npx tsx scripts/validate-integration.js
```

## 📊 Step 9: Monitoring Setup

### 9.1 System Monitoring
```bash
# Set up log rotation
sudo nano /etc/logrotate.d/eform-locker
# Add log rotation configuration

# Configure system monitoring
htop  # Check system resources
iostat -x 1  # Check disk I/O
```

### 9.2 Automated Health Checks
```bash
# Add health check cron job
echo "*/5 * * * * curl -f http://localhost:3000/health || systemctl restart eform-gateway" | crontab -
echo "*/5 * * * * curl -f http://localhost:3001/health || systemctl restart eform-kiosk" | crontab -
echo "*/5 * * * * curl -f http://localhost:3003/health || systemctl restart eform-panel" | crontab -
```

## 💾 Step 10: Backup Configuration

### 10.1 Automated Backups
```bash
# Create backup directory
sudo mkdir -p /media/backup

# Set up daily database backup
echo "0 2 * * * rsync -av /home/pi/eform-locker/data/ /media/backup/\$(date +\%Y\%m\%d)/" | crontab -

# Weekly full system backup
echo "0 3 * * 0 sudo dd if=/dev/mmcblk0 of=/media/backup/pi-backup-\$(date +\%Y\%m\%d).img bs=4M" | crontab -
```

### 10.2 Configuration Backup
```bash
# Backup system configuration
sudo cp /boot/config.txt /media/backup/
sudo cp /boot/cmdline.txt /media/backup/
sudo cp /etc/dhcpcd.conf /media/backup/
cp -r /home/pi/eform-locker/config/ /media/backup/
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Hardware Not Detected
```bash
# Check USB devices
lsusb | grep -i "1a86\|0403\|067b"

# Check permissions
ls -la /dev/ttyUSB*
sudo chmod 666 /dev/ttyUSB*

# Restart udev
sudo udevadm control --reload-rules
sudo udevadm trigger
```

#### Services Not Starting
```bash
# Check service logs
sudo journalctl -u eform-gateway -n 50
sudo journalctl -u eform-kiosk -n 50
sudo journalctl -u eform-panel -n 50

# Check port conflicts
sudo netstat -tulpn | grep -E "3000|3001|3003"

# Restart services
sudo systemctl restart eform-*
```

#### Network Issues
```bash
# Check network connectivity
ping google.com
ping github.com

# Check DNS resolution
nslookup github.com

# Check firewall
sudo ufw status
```

#### Performance Issues
```bash
# Check system resources
htop
free -h
df -h

# Check temperature
vcgencmd measure_temp

# Optimize performance
echo 'performance' | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] Hardware assembled and connected
- [ ] Raspberry Pi OS installed and updated
- [ ] Network connectivity verified
- [ ] SSH access configured

### Software Installation
- [ ] Node.js 20 installed and verified
- [ ] System dependencies installed
- [ ] User permissions configured
- [ ] Security settings applied

### Project Setup
- [ ] Repository cloned successfully
- [ ] Dependencies installed
- [ ] Configuration generated
- [ ] Database migrated

### Hardware Validation
- [ ] USB-RS485 converter detected
- [ ] Waveshare relay cards responding
- [ ] RFID reader functional
- [ ] All hardware tests passing

### Service Deployment
- [ ] Systemd services installed
- [ ] Services enabled and started
- [ ] Health endpoints responding
- [ ] Web interfaces accessible

### Production Readiness
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Security hardened
- [ ] Documentation updated

## 📞 Support

### Log Collection
```bash
# Collect system information
uname -a > system-info.txt
lsusb >> system-info.txt
dmesg | tail -50 >> system-info.txt

# Collect service logs
sudo journalctl --since "1 hour ago" > service-logs.txt

# Create diagnostic report
npx tsx scripts/hardware-diagnostics.js > hardware-report.txt
```

### Emergency Recovery
```bash
# Stop all services
sudo systemctl stop eform-*

# Reset database (WARNING: Deletes all data)
rm -f /home/pi/eform-locker/data/system.db
npm run migrate

# Restart services
sudo systemctl start eform-*
```

---

## 🎉 Deployment Complete!

Your Raspberry Pi eForm Locker System is now fully deployed and operational!

**System Features:**
- ✅ 32-locker capacity with Waveshare relay cards
- ✅ RFID and QR code access methods
- ✅ Multi-language support (Turkish/English)
- ✅ VIP user management
- ✅ Real-time monitoring and health checks
- ✅ Automated backups and maintenance
- ✅ Production-grade security

**Next Steps:**
1. Configure locker assignments in the admin panel
2. Set up user accounts and access permissions
3. Test end-to-end user workflows
4. Monitor system performance and logs
5. Schedule regular maintenance tasks

For ongoing support and updates, refer to the project documentation and monitoring dashboards.