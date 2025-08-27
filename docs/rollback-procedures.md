# Kiosk UI Rollback Procedures

## Overview

This document provides comprehensive rollback procedures for the kiosk UI system, ensuring quick recovery from deployment issues, system failures, or performance problems.

## Rollback Scenarios

### 1. Deployment Rollback
When a new deployment causes issues and you need to return to the previous working version.

### 2. Configuration Rollback
When configuration changes cause system instability or performance issues.

### 3. Emergency System Recovery
When the system is completely unresponsive and needs to be restored to a known working state.

### 4. Partial Component Rollback
When specific components (UI, API, hardware drivers) need to be reverted individually.

## Automated Rollback System

### Quick Rollback Commands

#### Rollback to Previous Version
```bash
# Rollback to latest backup
./scripts/rollback-kiosk.sh latest

# Rollback to specific backup
./scripts/rollback-kiosk.sh ui_backup_20241227_143022

# List available backups
./scripts/rollback-kiosk.sh list
```

#### Emergency Recovery
```bash
# Complete system recovery (nuclear option)
./scripts/emergency-recovery.sh

# Service-only recovery
sudo systemctl stop kiosk-ui.service
sudo systemctl start kiosk-ui.service

# Configuration-only recovery
sudo cp config/default-config.json /etc/kiosk-config.json
sudo systemctl restart kiosk-ui.service
```

## Manual Rollback Procedures

### 1. UI Component Rollback

#### Symptoms
- UI not loading or displaying incorrectly
- JavaScript errors in browser console
- CSS styling issues
- Touch interface not responding

#### Manual Rollback Steps
```bash
# 1. Stop the kiosk service
sudo systemctl stop kiosk-ui.service

# 2. Backup current state (for investigation)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p /home/pi/backups/failed_deployments
cp -r app/kiosk/src/ui /home/pi/backups/failed_deployments/ui_failed_$TIMESTAMP

# 3. Restore from backup
BACKUP_DIR="/home/pi/backups/kiosk-ui"
LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | grep "ui_backup_" | head -n1)

if [ -n "$LATEST_BACKUP" ]; then
    echo "Restoring from: $LATEST_BACKUP"
    rm -rf app/kiosk/src/ui
    cp -r "$BACKUP_DIR/$LATEST_BACKUP/ui" app/kiosk/src/ui/
else
    echo "No backup found, restoring from git"
    git checkout HEAD -- app/kiosk/src/ui/
fi

# 4. Rebuild the UI
npm run build:kiosk

# 5. Restart service
sudo systemctl start kiosk-ui.service

# 6. Verify rollback
sleep 10
curl http://localhost:3002/health
```

### 2. Configuration Rollback

#### Symptoms
- Service won't start after configuration changes
- Performance degradation
- Hardware communication failures
- Memory or CPU issues

#### Manual Rollback Steps
```bash
# 1. Stop service
sudo systemctl stop kiosk-ui.service

# 2. Backup current config
sudo cp /etc/kiosk-config.json /etc/kiosk-config.json.failed

# 3. Restore previous configuration
if [ -f "/etc/kiosk-config.json.backup" ]; then
    sudo cp /etc/kiosk-config.json.backup /etc/kiosk-config.json
else
    # Use default configuration
    sudo cp config/default-config.json /etc/kiosk-config.json
fi

# 4. Reset environment variables
sed -i '/^export KIOSK_/d' ~/.bashrc
source ~/.bashrc

# 5. Reconfigure for Pi model
./scripts/configure-pi-model.sh auto

# 6. Restart service
sudo systemctl start kiosk-ui.service
```

### 3. Database Rollback

#### Symptoms
- Database corruption errors
- Data inconsistency issues
- Service crashes related to database operations

#### Manual Rollback Steps
```bash
# 1. Stop all services
sudo systemctl stop kiosk-ui.service
sudo systemctl stop gateway.service 2>/dev/null || true

# 2. Backup corrupted database
DB_PATH="/home/pi/eform-locker/data/eform.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp "$DB_PATH" "/home/pi/backups/db_corrupted_$TIMESTAMP.db"

# 3. Restore from backup
DB_BACKUP_DIR="/home/pi/backups/database"
LATEST_DB_BACKUP=$(ls -t "$DB_BACKUP_DIR" | head -n1)

if [ -n "$LATEST_DB_BACKUP" ]; then
    echo "Restoring database from: $LATEST_DB_BACKUP"
    cp "$DB_BACKUP_DIR/$LATEST_DB_BACKUP" "$DB_PATH"
else
    echo "No database backup found, reinitializing..."
    rm -f "$DB_PATH"
    npm run migrate
fi

# 4. Verify database integrity
sqlite3 "$DB_PATH" "PRAGMA integrity_check;"

# 5. Restart services
sudo systemctl start kiosk-ui.service
```

### 4. System-Level Rollback

#### Symptoms
- System won't boot properly
- Multiple service failures
- Hardware driver issues
- Kernel or system library problems

#### Manual Rollback Steps
```bash
# 1. Boot from recovery or SSH from another machine

# 2. Restore system configuration files
sudo cp /boot/config.txt.backup /boot/config.txt
sudo cp /boot/cmdline.txt.backup /boot/cmdline.txt

# 3. Restore system packages (if needed)
sudo apt update
sudo apt install --reinstall nodejs npm

# 4. Restore project from git
cd /home/pi/eform-locker
git stash
git checkout main
git pull origin main

# 5. Rebuild everything
npm install
npm run build:all

# 6. Reconfigure system
./scripts/configure-pi-model.sh auto

# 7. Reboot
sudo reboot
```

## Rollback Verification Procedures

### Post-Rollback Checks

#### 1. Service Health Check
```bash
# Check service status
sudo systemctl status kiosk-ui.service

# Check API health
curl http://localhost:3002/health

# Check logs for errors
tail -50 /home/pi/logs/kiosk.log | grep -i error
```

#### 2. Functionality Test
```bash
# Run automated tests
./scripts/test-kiosk-functionality.sh

# Test hardware communication
node scripts/test-basic-relay-control.js

# Test RFID reading
node scripts/test-rfid-simple.js
```

#### 3. Performance Verification
```bash
# Check resource usage
htop

# Monitor response times
watch -n 5 'curl -s -w "%{time_total}" http://localhost:3002/health'

# Check memory usage
free -h
```

## Backup Management

### Automatic Backup Creation

#### Pre-Deployment Backup
```bash
# This is automatically done by deploy-kiosk-ui.sh
# Manual backup creation:
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/pi/backups/kiosk-ui"
mkdir -p "$BACKUP_DIR"

# Backup UI files
cp -r app/kiosk/src/ui "$BACKUP_DIR/ui_backup_$TIMESTAMP/"

# Backup configuration
cp /etc/kiosk-config.json "$BACKUP_DIR/config_backup_$TIMESTAMP.json"

# Backup database
cp /home/pi/eform-locker/data/eform.db "$BACKUP_DIR/db_backup_$TIMESTAMP.db"
```

#### Scheduled Backups
```bash
# Add to crontab for automatic backups
crontab -e

# Daily backup at 2 AM
0 2 * * * /home/pi/eform-locker/scripts/create-backup.sh

# Weekly full system backup
0 3 * * 0 /home/pi/eform-locker/scripts/full-system-backup.sh
```

### Backup Retention Policy

#### Automatic Cleanup
```bash
# Keep backups for different periods
# - UI backups: 30 days
# - Config backups: 90 days  
# - Database backups: 60 days
# - Full system backups: 30 days

# Cleanup script (run weekly)
find /home/pi/backups/kiosk-ui -name "ui_backup_*" -mtime +30 -delete
find /home/pi/backups/kiosk-ui -name "config_backup_*" -mtime +90 -delete
find /home/pi/backups/kiosk-ui -name "db_backup_*" -mtime +60 -delete
find /home/pi/backups/system -name "*" -mtime +30 -delete
```

## Rollback Decision Matrix

### When to Rollback vs. Fix Forward

#### Rollback Scenarios (Immediate Action Required)
- **Service completely down**: Rollback immediately
- **Critical security vulnerability**: Rollback and patch
- **Data corruption**: Rollback to last known good state
- **Hardware communication failure**: Rollback to working drivers
- **Performance degradation >50%**: Rollback and investigate

#### Fix Forward Scenarios (Can be addressed in place)
- **Minor UI glitches**: Fix CSS/JavaScript in place
- **Configuration tweaks needed**: Adjust config without rollback
- **Single feature not working**: Disable feature, fix later
- **Log file issues**: Clear logs, don't rollback
- **Minor performance issues**: Optimize without rollback

### Rollback Risk Assessment

#### Low Risk Rollbacks
- UI-only changes
- Configuration file changes
- Service restarts
- Log file resets

#### Medium Risk Rollbacks
- Database schema changes
- System configuration changes
- Package updates
- Service configuration changes

#### High Risk Rollbacks
- Kernel updates
- System-wide package changes
- Hardware driver changes
- Boot configuration changes

## Emergency Contact Procedures

### Escalation Path

#### Level 1: Automated Recovery
- Automatic service restart
- Health check alerts
- Basic rollback scripts

#### Level 2: Manual Intervention
- SSH access required
- Manual rollback procedures
- System administrator involvement

#### Level 3: Physical Access
- Console access required
- Hardware troubleshooting
- Potential hardware replacement

### Documentation Requirements

#### Incident Documentation
```bash
# Create incident report
INCIDENT_ID="INC_$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="/home/pi/logs/incidents/$INCIDENT_ID.md"

mkdir -p /home/pi/logs/incidents

cat > "$REPORT_FILE" << EOF
# Incident Report: $INCIDENT_ID

## Incident Details
- **Date/Time**: $(date)
- **Severity**: [Critical/High/Medium/Low]
- **Description**: [Brief description of the issue]

## Symptoms Observed
- [List symptoms that led to rollback decision]

## Rollback Actions Taken
- [List specific rollback steps performed]

## Verification Results
- [Results of post-rollback verification]

## Root Cause Analysis
- [Analysis of what caused the issue]

## Prevention Measures
- [Steps to prevent similar issues in future]

## Lessons Learned
- [Key takeaways from the incident]
EOF

echo "Incident report created: $REPORT_FILE"
```

## Testing Rollback Procedures

### Regular Rollback Drills

#### Monthly Rollback Test
```bash
# Test rollback procedures monthly
./scripts/test-rollback-procedures.sh

# This script:
# 1. Creates a test deployment
# 2. Simulates a failure
# 3. Performs rollback
# 4. Verifies system recovery
# 5. Documents results
```

#### Rollback Simulation
```bash
# Simulate different failure scenarios
./scripts/simulate-failure.sh ui_corruption
./scripts/simulate-failure.sh config_error
./scripts/simulate-failure.sh database_corruption
./scripts/simulate-failure.sh service_crash
```

### Rollback Performance Metrics

#### Target Recovery Times
- **UI Rollback**: < 5 minutes
- **Configuration Rollback**: < 3 minutes
- **Database Rollback**: < 10 minutes
- **Full System Rollback**: < 30 minutes

#### Success Criteria
- Service returns to operational state
- All functionality tests pass
- Performance metrics within acceptable range
- No data loss (except for period after last backup)

This comprehensive rollback procedure ensures quick recovery from any deployment or system issues while maintaining data integrity and minimizing downtime.