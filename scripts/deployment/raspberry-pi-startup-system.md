# Raspberry Pi Startup System for eForm Locker

This document describes the comprehensive startup system for the eForm Locker on Raspberry Pi, including automatic service startup, hardware initialization, and system monitoring.

## 🏗️ System Architecture

The startup system consists of several components:

### **Systemd Services**
- `eform-locker.service` - Main application service
- `eform-hardware-init.service` - Hardware initialization
- `eform-monitor.service` - System monitoring

### **Startup Scripts**
- `startup-services.sh` - Starts all eForm services in order
- `hardware-init.sh` - Initializes hardware and system settings
- `system-monitor.sh` - Continuous health monitoring
- `stop-services.sh` - Graceful service shutdown
- `restart-services.sh` - Service restart functionality

### **Management Scripts**
- `pi-startup-system.sh` - Installs systemd services
- `pi-boot-setup.sh` - Optimizes Pi boot configuration
- `health-check.sh` - Quick health verification

## 🚀 Installation

### **Step 1: Install Startup System**

```bash
# Run as root to install systemd services
sudo bash scripts/deployment/pi-startup-system.sh

# Reload systemd and enable services
sudo systemctl daemon-reload
sudo systemctl enable eform-locker.service
sudo systemctl enable eform-hardware-init.service
sudo systemctl enable eform-monitor.service
```

### **Step 2: Optimize Boot Configuration**

```bash
# Run as root to optimize Pi settings
sudo bash scripts/deployment/pi-boot-setup.sh

# Reboot to apply changes
sudo reboot
```

### **Step 3: Verify Installation**

```bash
# Check service status
sudo systemctl status eform-locker
sudo systemctl status eform-hardware-init
sudo systemctl status eform-monitor

# Run health check
bash scripts/deployment/health-check.sh

# View status dashboard
/home/pi/eform-status.sh
```

## 🔧 Service Management

### **Manual Control**

```bash
# Start services
sudo systemctl start eform-locker

# Stop services
sudo systemctl stop eform-locker

# Restart services
sudo systemctl restart eform-locker

# Check status
sudo systemctl status eform-locker
```

### **View Logs**

```bash
# Service logs
sudo journalctl -u eform-locker -f
sudo journalctl -u eform-hardware-init -f
sudo journalctl -u eform-monitor -f

# Application logs
tail -f /home/pi/eform-locker/logs/gateway.log
tail -f /home/pi/eform-locker/logs/kiosk.log
tail -f /home/pi/eform-locker/logs/panel.log
tail -f /home/pi/eform-locker/logs/system-monitor.log
```

## 🔍 Monitoring and Health Checks

### **Automatic Monitoring**

The system includes continuous monitoring that:

- **Service Health**: Checks all services every 60 seconds
- **Resource Usage**: Monitors CPU, memory, disk, temperature
- **Hardware Status**: Verifies USB devices and connectivity
- **Auto-Recovery**: Restarts failed services automatically
- **Log Rotation**: Prevents log files from growing too large
- **Database Integrity**: Periodic database health checks

### **Health Check Commands**

```bash
# Quick health check
bash scripts/deployment/health-check.sh

# Detailed status dashboard
/home/pi/eform-status.sh

# View system status file
cat /home/pi/eform-locker/.system-status

# Check for alerts
cat /home/pi/eform-locker/.system-alerts
```

### **Cron Jobs**

The system automatically sets up maintenance cron jobs:

```bash
# Check services every 5 minutes
*/5 * * * * /home/pi/eform-locker/scripts/deployment/health-check.sh

# Daily maintenance at 2 AM
0 2 * * * /home/pi/eform-locker/scripts/maintenance/daily-cleanup.sh

# Weekly system update check (Sundays at 3 AM)
0 3 * * 0 apt list --upgradable
```

## ⚙️ Boot Optimizations

The `pi-boot-setup.sh` script applies these optimizations:

### **Hardware Optimizations**
- Reduces GPU memory to 16MB (headless operation)
- Disables audio, SPI, I2C (not needed)
- Optimizes USB settings
- Sets CPU frequency to 1500MHz
- Disables WiFi/Bluetooth power management

### **System Services**
- Disables unnecessary services (Bluetooth, CUPS, Avahi)
- Enables SSH for remote access
- Configures firewall with eForm ports

### **Network Configuration**
- Sets static IP address (192.168.1.8)
- Configures DNS servers
- Optimizes network settings

### **File System**
- Configures tmpfs for logs (reduces SD card wear)
- Sets up log rotation
- Optimizes file system mounts

## 📊 Status Files and Monitoring

### **Status Files**

The system creates several status files for monitoring:

```bash
# Service startup status
/home/pi/eform-locker/.startup-success

# Hardware initialization status
/home/pi/eform-locker/.hardware-init-status

# Current system status
/home/pi/eform-locker/.system-status

# System alerts
/home/pi/eform-locker/.system-alerts

# Service status
/home/pi/eform-locker/.service-status
```

### **Log Files**

```bash
# Application logs
/home/pi/eform-locker/logs/gateway.log
/home/pi/eform-locker/logs/kiosk.log
/home/pi/eform-locker/logs/panel.log

# System logs
/home/pi/eform-locker/logs/system-monitor.log
/home/pi/eform-locker/logs/health-check.log
/home/pi/eform-locker/logs/maintenance.log

# System service logs
/var/log/eform-hardware-init.log
```

### **PID Files**

Process IDs are stored for service management:

```bash
/home/pi/eform-locker/pids/gateway.pid
/home/pi/eform-locker/pids/kiosk.pid
/home/pi/eform-locker/pids/panel.pid
```

## 🚨 Troubleshooting

### **Services Won't Start**

```bash
# Check systemd status
sudo systemctl status eform-locker
sudo journalctl -u eform-locker --no-pager

# Check hardware initialization
sudo systemctl status eform-hardware-init
cat /var/log/eform-hardware-init.log

# Manual service start
cd /home/pi/eform-locker
bash scripts/deployment/startup-services.sh
```

### **Hardware Issues**

```bash
# Check USB devices
ls -la /dev/ttyUSB*
lsusb | grep -i "serial\|rs485\|ftdi"

# Check permissions
ls -la /dev/ttyUSB0
groups pi

# Reset hardware
bash scripts/deployment/hardware-init.sh
```

### **High Resource Usage**

```bash
# Check system resources
top
free -h
df -h

# Check temperature
vcgencmd measure_temp

# View resource alerts
cat /home/pi/eform-locker/.system-alerts
```

### **Service Recovery**

```bash
# Manual restart
sudo systemctl restart eform-locker

# Force restart
bash scripts/deployment/restart-services.sh

# Emergency stop
bash scripts/deployment/stop-services.sh
sudo killall node
```

## 🔧 Configuration

### **Environment Variables**

The services use these environment variables:

```bash
NODE_ENV=production
PATH=/usr/local/bin:/usr/bin:/bin:/home/pi/.nvm/versions/node/v20.17.0/bin
```

### **Service Configuration**

Systemd service files are located in `/etc/systemd/system/`:

- `eform-locker.service`
- `eform-hardware-init.service`
- `eform-monitor.service`

### **Firewall Configuration**

The system configures UFW with these rules:

```bash
# SSH access
ufw allow 22/tcp

# eForm services
ufw allow 3000/tcp  # Gateway
ufw allow 3001/tcp  # Panel
ufw allow 3002/tcp  # Kiosk

# Local network access
ufw allow from 192.168.1.0/24
```

## 📈 Performance Monitoring

### **Real-time Monitoring**

```bash
# Watch system resources
watch -n 5 '/home/pi/eform-status.sh'

# Monitor service logs
tail -f /home/pi/eform-locker/logs/*.log

# Watch system status
watch -n 10 'cat /home/pi/eform-locker/.system-status'
```

### **Performance Metrics**

The system tracks:

- **CPU Usage**: Target <80%
- **Memory Usage**: Target <85%
- **Disk Usage**: Alert >90%
- **Temperature**: Alert >70°C
- **Service Response Time**: Target <5s
- **USB Device Count**: Should be >0

## 🎯 Best Practices

### **Regular Maintenance**

1. **Daily**: Automatic cleanup and health checks
2. **Weekly**: Review system logs and alerts
3. **Monthly**: Update system packages
4. **Quarterly**: Review and optimize configuration

### **Backup Strategy**

```bash
# Backup configuration
sudo cp -r /etc/systemd/system/eform-* /home/pi/backup/
cp /home/pi/eform-locker/.env /home/pi/backup/

# Backup database
cp /home/pi/eform-locker/data/eform.db /home/pi/backup/
```

### **Security Considerations**

- Services run as `pi` user (not root)
- Firewall configured with minimal required ports
- SSH key authentication recommended
- Regular security updates via cron

## 🔄 Updates and Deployment

### **Code Updates**

```bash
# Pull latest code
cd /home/pi/eform-locker
git pull origin main

# Restart services to apply changes
sudo systemctl restart eform-locker
```

### **System Updates**

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Reboot if kernel updated
sudo reboot
```

### **Service Updates**

```bash
# Update systemd services
sudo bash scripts/deployment/pi-startup-system.sh
sudo systemctl daemon-reload
sudo systemctl restart eform-locker
```

---

This startup system provides a robust, production-ready foundation for running the eForm Locker System on Raspberry Pi with automatic startup, monitoring, and recovery capabilities.