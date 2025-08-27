# Raspberry Pi Configuration Guide for Kiosk UI

## Overview

This guide provides configuration instructions for deploying the optimized kiosk UI on different Raspberry Pi models. The UI has been specifically optimized for Pi hardware constraints while maintaining excellent performance.

## Supported Pi Models

### Raspberry Pi 4 (Recommended)
- **RAM**: 2GB minimum, 4GB+ recommended
- **Performance**: Excellent, handles all features smoothly
- **Configuration**: Standard settings work well

### Raspberry Pi 3B+
- **RAM**: 1GB (requires optimization)
- **Performance**: Good with proper configuration
- **Configuration**: Requires memory optimization

### Raspberry Pi 3B
- **RAM**: 1GB (minimal configuration required)
- **Performance**: Acceptable with aggressive optimization
- **Configuration**: Requires all optimizations enabled

## Pre-Installation Requirements

### System Requirements
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (required)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be 18.x or higher
npm --version
```

### Memory Configuration
```bash
# Edit boot config for memory optimization
sudo nano /boot/config.txt

# Add these lines for Pi 3B/3B+ (Pi 4 can skip this)
gpu_mem=64          # Minimal GPU memory
disable_camera=1    # Disable camera if not used
dtoverlay=disable-bt # Disable Bluetooth if not needed
```

### Performance Tuning
```bash
# Edit cmdline.txt for better performance
sudo nano /boot/cmdline.txt

# Add these parameters (on same line, space-separated):
# cgroup_memory=1 cgroup_enable=memory
```

## Model-Specific Configurations

### Raspberry Pi 4 Configuration

**Optimal Settings** (`config/pi4-config.json`):
```json
{
  "performance": {
    "maxMemoryUsage": "400MB",
    "enableGPUAcceleration": true,
    "animationLevel": "full",
    "updateInterval": 100
  },
  "display": {
    "resolution": "1920x1080",
    "touchOptimization": true,
    "highDPI": true
  },
  "hardware": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "timeout": 1000
  }
}
```

**Environment Variables**:
```bash
# Add to ~/.bashrc or /etc/environment
export KIOSK_PI_MODEL="pi4"
export KIOSK_MEMORY_LIMIT="400"
export KIOSK_GPU_ACCELERATION="true"
```

### Raspberry Pi 3B+ Configuration

**Optimized Settings** (`config/pi3plus-config.json`):
```json
{
  "performance": {
    "maxMemoryUsage": "200MB",
    "enableGPUAcceleration": false,
    "animationLevel": "minimal",
    "updateInterval": 200
  },
  "display": {
    "resolution": "1024x768",
    "touchOptimization": true,
    "highDPI": false
  },
  "hardware": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "timeout": 2000
  }
}
```

**Environment Variables**:
```bash
export KIOSK_PI_MODEL="pi3plus"
export KIOSK_MEMORY_LIMIT="200"
export KIOSK_GPU_ACCELERATION="false"
```

### Raspberry Pi 3B Configuration

**Minimal Settings** (`config/pi3-config.json`):
```json
{
  "performance": {
    "maxMemoryUsage": "150MB",
    "enableGPUAcceleration": false,
    "animationLevel": "none",
    "updateInterval": 500
  },
  "display": {
    "resolution": "1024x768",
    "touchOptimization": true,
    "highDPI": false
  },
  "hardware": {
    "serialPort": "/dev/ttyUSB0",
    "baudRate": 9600,
    "timeout": 3000
  }
}
```

**Environment Variables**:
```bash
export KIOSK_PI_MODEL="pi3"
export KIOSK_MEMORY_LIMIT="150"
export KIOSK_GPU_ACCELERATION="false"
export KIOSK_MINIMAL_MODE="true"
```

## Installation Steps

### 1. Automatic Configuration Detection
```bash
# Run the configuration script
./scripts/configure-pi-model.sh

# This will:
# - Detect Pi model automatically
# - Apply appropriate configuration
# - Set environment variables
# - Optimize system settings
```

### 2. Manual Configuration
```bash
# Copy appropriate config file
sudo cp config/pi4-config.json /etc/kiosk-config.json

# Set environment variables
echo 'export KIOSK_PI_MODEL="pi4"' >> ~/.bashrc
source ~/.bashrc

# Apply system optimizations
sudo ./scripts/optimize-pi-system.sh
```

### 3. Deploy Kiosk UI
```bash
# Deploy optimized UI
./scripts/deploy-kiosk-ui.sh

# Verify deployment
curl http://localhost:3002/health
```

## Performance Optimization by Model

### Pi 4 Optimizations
- Enable GPU acceleration for smooth animations
- Use full resolution (1920x1080)
- Standard update intervals (100ms)
- Full feature set enabled

### Pi 3B+ Optimizations
- Disable GPU acceleration to save memory
- Use moderate resolution (1024x768)
- Slower update intervals (200ms)
- Minimal animations only

### Pi 3B Optimizations
- Aggressive memory management
- Lowest resolution settings
- Slowest update intervals (500ms)
- No animations, text-only feedback

## Memory Management

### Automatic Memory Monitoring
The system includes automatic memory monitoring:

```javascript
// Memory limits by Pi model
const MEMORY_LIMITS = {
  'pi4': 400 * 1024 * 1024,      // 400MB
  'pi3plus': 200 * 1024 * 1024,  // 200MB
  'pi3': 150 * 1024 * 1024       // 150MB
};
```

### Manual Memory Optimization
```bash
# Check current memory usage
free -h

# Clear system caches
sudo sync && sudo sysctl vm.drop_caches=3

# Monitor kiosk memory usage
ps aux | grep node | grep kiosk
```

## Display Configuration

### Touch Screen Setup
```bash
# Install touch screen drivers (if needed)
sudo apt install xserver-xorg-input-evdev

# Calibrate touch screen
sudo apt install xinput-calibrator
xinput_calibrator
```

### Resolution Optimization
```bash
# Check current resolution
xrandr

# Set optimal resolution for Pi model
# Pi 4: 1920x1080
# Pi 3B+/3B: 1024x768
xrandr --output HDMI-1 --mode 1024x768
```

## Network Configuration

### WiFi Optimization
```bash
# Disable power management for stable connection
sudo iwconfig wlan0 power off

# Set static IP for kiosk (recommended)
sudo nano /etc/dhcpcd.conf

# Add:
# interface wlan0
# static ip_address=192.168.1.100/24
# static routers=192.168.1.1
# static domain_name_servers=192.168.1.1
```

### Ethernet Configuration (Recommended)
```bash
# Use wired connection for best reliability
# Configure static IP in /etc/dhcpcd.conf
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1
```

## Service Configuration

### Systemd Service Setup
```bash
# Create systemd service
sudo nano /etc/systemd/system/kiosk-ui.service
```

**Service File Content**:
```ini
[Unit]
Description=Kiosk UI Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eform-locker
ExecStart=/usr/bin/npm run start:kiosk
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=KIOSK_PI_MODEL=pi4

[Install]
WantedBy=multi-user.target
```

**Enable Service**:
```bash
sudo systemctl daemon-reload
sudo systemctl enable kiosk-ui.service
sudo systemctl start kiosk-ui.service
```

## Monitoring and Maintenance

### Performance Monitoring
```bash
# Check service status
sudo systemctl status kiosk-ui.service

# Monitor resource usage
htop

# Check kiosk logs
tail -f /home/pi/logs/kiosk.log
```

### Automatic Health Checks
```bash
# Add to crontab for automatic monitoring
crontab -e

# Add this line:
# */5 * * * * /home/pi/eform-locker/scripts/health-check-kiosk.sh
```

## Troubleshooting by Model

### Pi 4 Issues
- **High CPU usage**: Check for background processes
- **Memory leaks**: Monitor with `htop`, restart service if needed
- **Display issues**: Verify HDMI connection and resolution

### Pi 3B+ Issues
- **Slow response**: Increase update intervals in config
- **Memory errors**: Reduce memory limit, disable features
- **Touch issues**: Recalibrate touch screen

### Pi 3B Issues
- **System freezes**: Enable minimal mode, reduce memory usage
- **Service crashes**: Check logs, may need more aggressive optimization
- **Network timeouts**: Increase timeout values in config

## Configuration Files Reference

### Main Config File Locations
- **System Config**: `/etc/kiosk-config.json`
- **User Config**: `~/.kiosk/config.json`
- **Project Config**: `config/production.json`

### Environment Variables
- `KIOSK_PI_MODEL`: Pi model (pi3, pi3plus, pi4)
- `KIOSK_MEMORY_LIMIT`: Memory limit in MB
- `KIOSK_GPU_ACCELERATION`: Enable/disable GPU acceleration
- `KIOSK_MINIMAL_MODE`: Enable minimal mode for Pi 3B

### Log File Locations
- **Service Logs**: `/home/pi/logs/kiosk.log`
- **System Logs**: `/var/log/syslog`
- **Deployment Logs**: `/home/pi/logs/deployment.log`

## Best Practices

### For All Pi Models
1. Use wired Ethernet connection when possible
2. Keep system updated but test before production deployment
3. Monitor memory usage regularly
4. Use UPS or battery backup for power stability
5. Regular system backups

### Model-Specific Recommendations
- **Pi 4**: Can run full feature set, use for high-traffic locations
- **Pi 3B+**: Good balance of features and cost, suitable for most deployments
- **Pi 3B**: Use only for low-traffic or backup locations

### Maintenance Schedule
- **Daily**: Check service status and logs
- **Weekly**: Monitor memory usage and performance
- **Monthly**: Update system packages (test first)
- **Quarterly**: Full system backup and configuration review

This configuration guide ensures optimal performance of the kiosk UI across all supported Raspberry Pi models while maintaining reliability and user experience.