# Kiosk UI Deployment Guide

## Quick Start

### Automated Deployment (Recommended)
```bash
# 1. Configure Pi model automatically
./scripts/configure-pi-model.sh

# 2. Deploy optimized kiosk UI
./scripts/deploy-kiosk-ui.sh

# 3. Validate deployment
./scripts/validate-deployment.sh

# 4. Check system health
./scripts/health-check-kiosk.sh
```

### Manual Deployment
```bash
# 1. Stop existing services
sudo systemctl stop kiosk-ui.service

# 2. Build optimized UI
npm run build:kiosk

# 3. Start service
sudo systemctl start kiosk-ui.service

# 4. Verify deployment
curl http://localhost:3002/health
```

## Documentation Overview

This deployment package includes comprehensive documentation and scripts for deploying and maintaining the optimized kiosk UI system on Raspberry Pi hardware.

### 📚 Documentation Files

#### Configuration and Setup
- **[Pi Configuration Guide](pi-configuration-guide.md)** - Model-specific configuration for Pi 3B, 3B+, and Pi 4
- **[Performance Monitoring Guide](performance-monitoring-guide.md)** - Monitoring, maintenance, and optimization procedures
- **[Troubleshooting Guide](kiosk-troubleshooting-guide.md)** - Common issues and solutions
- **[Rollback Procedures](rollback-procedures.md)** - Recovery and rollback procedures

#### Scripts and Tools
- **[Deployment Scripts](#deployment-scripts)** - Automated deployment and configuration
- **[Monitoring Scripts](#monitoring-scripts)** - Health checks and performance monitoring
- **[Maintenance Scripts](#maintenance-scripts)** - Automated maintenance and cleanup

## Deployment Scripts

### Core Deployment Scripts

#### `scripts/deploy-kiosk-ui.sh`
**Purpose**: Main deployment script with backup and rollback capabilities
```bash
# Deploy new version
./scripts/deploy-kiosk-ui.sh deploy

# Rollback to previous version
./scripts/deploy-kiosk-ui.sh rollback

# Verify current deployment
./scripts/deploy-kiosk-ui.sh verify
```

**Features**:
- Automatic backup creation before deployment
- Service management (stop/start)
- Build verification
- Rollback capability
- Deployment validation

#### `scripts/configure-pi-model.sh`
**Purpose**: Automatic Pi model detection and optimization
```bash
# Auto-detect and configure
./scripts/configure-pi-model.sh

# Force specific model configuration
./scripts/configure-pi-model.sh pi4
./scripts/configure-pi-model.sh pi3plus
./scripts/configure-pi-model.sh pi3
```

**Features**:
- Automatic Pi model detection
- Model-specific performance optimization
- Environment variable configuration
- System service setup
- Boot configuration optimization

#### `scripts/validate-deployment.sh`
**Purpose**: Comprehensive deployment validation
```bash
# Full validation suite
./scripts/validate-deployment.sh

# Quick essential checks
./scripts/validate-deployment.sh quick

# Specific component validation
./scripts/validate-deployment.sh service
./scripts/validate-deployment.sh api
./scripts/validate-deployment.sh performance
```

**Validation Tests**:
- Service status and health
- API endpoint functionality
- UI file integrity
- Configuration validation
- System resource usage
- Hardware communication
- Performance benchmarks
- Log file analysis
- Backup system verification

## Monitoring Scripts

### Health Monitoring

#### `scripts/health-check-kiosk.sh`
**Purpose**: Comprehensive system health monitoring
```bash
# Full health check
./scripts/health-check-kiosk.sh

# Specific component checks
./scripts/health-check-kiosk.sh service
./scripts/health-check-kiosk.sh resources
./scripts/health-check-kiosk.sh hardware
```

**Monitoring Areas**:
- Service status and uptime
- API response times
- System resource usage (CPU, memory, disk)
- Hardware connectivity (serial ports, USB devices)
- Network connectivity
- Log file analysis
- Configuration validation
- Database integrity

### Performance Monitoring

#### Automated Monitoring Setup
```bash
# Set up continuous monitoring
crontab -e

# Add these lines for automated monitoring:
# Health check every 5 minutes
*/5 * * * * /home/pi/eform-locker/scripts/health-check-kiosk.sh

# Performance metrics every minute
* * * * * /home/pi/eform-locker/scripts/collect-performance-metrics.sh

# Daily maintenance at 3 AM
0 3 * * * /home/pi/eform-locker/scripts/daily-maintenance.sh
```

## Maintenance Scripts

### Automated Maintenance

#### Daily Maintenance
- Service health verification
- Disk space monitoring and cleanup
- Memory usage optimization
- Log file rotation
- API endpoint testing

#### Weekly Maintenance
- System update checking
- Performance trend analysis
- Hardware health verification
- Network connectivity testing
- Configuration backup

#### Monthly Maintenance
- Full system backup
- Security update review
- Hardware stress testing
- Documentation updates
- Performance optimization review

## Configuration Management

### Pi Model Configurations

#### Raspberry Pi 4 (High Performance)
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
  }
}
```

#### Raspberry Pi 3B+ (Optimized)
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
  }
}
```

#### Raspberry Pi 3B (Minimal)
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
  }
}
```

## Rollback and Recovery

### Quick Rollback Commands
```bash
# Rollback to latest backup
./scripts/rollback-kiosk.sh latest

# List available backups
./scripts/rollback-kiosk.sh list

# Emergency system recovery
./scripts/emergency-recovery.sh
```

### Backup Management
```bash
# Manual backup creation
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p /home/pi/backups/kiosk-ui
cp -r app/kiosk/src/ui /home/pi/backups/kiosk-ui/ui_backup_$TIMESTAMP

# Automated backup cleanup (keeps 30 days)
find /home/pi/backups/kiosk-ui -name "ui_backup_*" -mtime +30 -delete
```

## Performance Optimization

### Pi Model-Specific Optimizations

#### For All Pi Models
- Disable unnecessary system services
- Optimize boot configuration
- Configure memory management
- Set up automatic cleanup

#### Pi 4 Specific
- Enable GPU acceleration
- Use full resolution displays
- Enable all UI animations
- Higher memory limits

#### Pi 3B/3B+ Specific
- Disable GPU acceleration
- Use lower resolutions
- Minimal or no animations
- Aggressive memory management

### Performance Monitoring
```bash
# Real-time performance monitoring
watch -n 2 'free -h && ps aux | grep node | grep kiosk'

# Response time monitoring
watch -n 5 'curl -s -w "%{time_total}" http://localhost:3002/health'

# Resource usage alerts
./scripts/performance-alerts.sh
```

## Troubleshooting Quick Reference

### Common Issues

#### Service Won't Start
```bash
# Check service status
sudo systemctl status kiosk-ui.service

# Check logs
tail -50 /home/pi/logs/kiosk.log

# Restart service
sudo systemctl restart kiosk-ui.service
```

#### High Memory Usage
```bash
# Clear system caches
sudo sync && sudo sysctl vm.drop_caches=3

# Check memory usage
free -h

# Restart service to clear memory leaks
sudo systemctl restart kiosk-ui.service
```

#### API Not Responding
```bash
# Test API directly
curl http://localhost:3002/health

# Check port usage
sudo lsof -i :3002

# Verify service is running
pgrep -f "node.*kiosk"
```

#### Hardware Communication Issues
```bash
# Check serial port
ls -la /dev/ttyUSB*

# Test hardware communication
node scripts/test-hardware-simple.js

# Check USB devices
lsusb
```

## Production Deployment Checklist

### Pre-Deployment
- [ ] Backup current system
- [ ] Test deployment on staging system
- [ ] Verify all dependencies are installed
- [ ] Check available disk space
- [ ] Confirm network connectivity

### Deployment
- [ ] Run Pi model configuration
- [ ] Execute deployment script
- [ ] Validate deployment success
- [ ] Perform health checks
- [ ] Test all functionality

### Post-Deployment
- [ ] Monitor system for 24 hours
- [ ] Verify performance metrics
- [ ] Check error logs
- [ ] Test rollback procedures
- [ ] Update documentation

## Support and Maintenance

### Regular Maintenance Schedule
- **Daily**: Health checks, log monitoring
- **Weekly**: Performance analysis, system updates
- **Monthly**: Full backups, security reviews
- **Quarterly**: Hardware inspection, documentation updates

### Monitoring Dashboards
- **System Health**: `./scripts/health-check-kiosk.sh`
- **Performance Metrics**: Available at `http://pi-ip:3003/monitor`
- **Log Analysis**: `tail -f /home/pi/logs/kiosk.log`

### Emergency Contacts
- **System Issues**: Check troubleshooting guide first
- **Hardware Problems**: Refer to hardware documentation
- **Critical Failures**: Use emergency recovery procedures

## File Structure Reference

```
docs/
├── DEPLOYMENT_README.md          # This file
├── pi-configuration-guide.md     # Pi model configurations
├── performance-monitoring-guide.md # Monitoring and maintenance
├── kiosk-troubleshooting-guide.md # Troubleshooting procedures
└── rollback-procedures.md        # Recovery procedures

scripts/
├── deploy-kiosk-ui.sh           # Main deployment script
├── configure-pi-model.sh        # Pi configuration script
├── validate-deployment.sh       # Deployment validation
├── health-check-kiosk.sh        # Health monitoring
├── rollback-kiosk.sh           # Rollback procedures
└── emergency-recovery.sh        # Emergency recovery

config/
├── pi4-config.json             # Pi 4 configuration
├── pi3plus-config.json         # Pi 3B+ configuration
├── pi3-config.json             # Pi 3B configuration
└── default-config.json         # Default configuration
```

This comprehensive deployment package ensures reliable, optimized deployment of the kiosk UI system across all supported Raspberry Pi models with robust monitoring, maintenance, and recovery capabilities.