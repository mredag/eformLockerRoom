# Smart Locker Assignment System - Deployment Procedures

## Overview

This document provides comprehensive procedures for deploying, monitoring, and rolling back the Smart Locker Assignment System. These procedures ensure safe deployment with minimal downtime and reliable rollback capabilities.

## Pre-Deployment Checklist

### System Requirements
- [ ] Raspberry Pi 4 with minimum 4GB RAM
- [ ] Node.js 16+ installed
- [ ] SQLite3 command-line tools available
- [ ] Sufficient disk space (minimum 2GB free)
- [ ] Network connectivity for service health checks
- [ ] Serial port access for hardware control (`/dev/ttyUSB0`)

### Backup Verification
- [ ] Current database backup created
- [ ] Configuration files backed up
- [ ] Service logs archived
- [ ] Rollback scripts tested on staging environment
- [ ] Emergency contact information available

### Service Preparation
- [ ] All existing services stopped gracefully
- [ ] No active RFID sessions in progress
- [ ] Hardware connections verified
- [ ] Admin panel access confirmed

## Deployment Procedure

### Step 1: Automated Deployment

```bash
# Navigate to project directory
cd /home/pi/eform-locker

# Run automated deployment script
./scripts/deployment/deploy-smart-assignment.sh
```

The deployment script will:
1. Create automatic backups
2. Stop all services safely
3. Apply database migrations
4. Update configuration files
5. Install dependencies and build services
6. Start services with health checks
7. Generate deployment report

### Step 2: Manual Deployment (Alternative)

If automated deployment fails, follow these manual steps:

```bash
# 1. Stop services
sudo pkill -f "node.*gateway"
sudo pkill -f "node.*kiosk"
sudo pkill -f "node.*panel"

# 2. Create backup
mkdir -p backups/manual-$(date +%Y%m%d-%H%M%S)
cp data/eform.db backups/manual-$(date +%Y%m%d-%H%M%S)/
cp config/system.json backups/manual-$(date +%Y%m%d-%H%M%S)/

# 3. Apply database migration
sqlite3 data/eform.db < scripts/deployment/smart-assignment-migration.sql

# 4. Update configuration
cp config/system.json config/system.json.backup
# Edit config/system.json to add smart_assignment section

# 5. Build services
npm run build:all

# 6. Start services
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &
```

### Step 3: Deployment Verification

```bash
# Run comprehensive verification
./scripts/deployment/verify-deployment.sh

# Check individual components
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk
curl http://localhost:3001/health  # Panel (may require auth)

# Verify database schema
sqlite3 data/eform.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%smart%';"

# Check feature flag status
sqlite3 data/eform.db "SELECT value FROM settings_global WHERE key='smart_assignment_enabled';"
```

## Post-Deployment Monitoring

### Immediate Monitoring (First 24 Hours)

1. **Service Health Monitoring**
   ```bash
   # Continuous health monitoring
   watch -n 30 './monitoring/scripts/health-check.sh'
   
   # Real-time dashboard
   ./monitoring/scripts/dashboard.sh
   ```

2. **Log Monitoring**
   ```bash
   # Monitor all service logs
   tail -f logs/*.log
   
   # Monitor specific events
   tail -f logs/*.log | grep -i "error\|smart\|assignment"
   ```

3. **Performance Monitoring**
   ```bash
   # Check system resources
   htop
   
   # Monitor database performance
   sqlite3 data/eform.db "PRAGMA integrity_check;"
   
   # Check API response times
   time curl http://localhost:3000/health
   ```

### Ongoing Monitoring (Daily/Weekly)

1. **Automated Health Checks**
   - Install systemd timers or cron jobs
   - Monitor alert notifications
   - Review performance metrics

2. **Database Maintenance**
   ```bash
   # Weekly database optimization
   sqlite3 data/eform.db "VACUUM;"
   sqlite3 data/eform.db "ANALYZE;"
   
   # Check database size growth
   du -h data/eform.db
   ```

3. **Log Rotation**
   ```bash
   # Rotate large log files
   find logs/ -name "*.log" -size +10M -exec logrotate {} \;
   ```

## Rollback Procedures

### Automatic Rollback

```bash
# Use automated rollback script with backup directory
./scripts/deployment/rollback-smart-assignment.sh /path/to/backup/directory

# Example with specific backup
./scripts/deployment/rollback-smart-assignment.sh backups/smart-assignment-20250109-143022
```

### Manual Rollback

If automated rollback fails:

```bash
# 1. Stop all services immediately
sudo pkill -9 -f "node"

# 2. Restore database from backup
cp backups/[backup-dir]/eform.db.backup data/eform.db

# 3. Restore configuration
cp backups/[backup-dir]/system.json.backup config/system.json

# 4. Alternative: Use SQL rollback
sqlite3 data/eform.db < scripts/deployment/smart-assignment-rollback.sql

# 5. Rebuild services with original code
git checkout HEAD~1  # If needed
npm run build:all

# 6. Start services
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &

# 7. Verify rollback
./scripts/deployment/verify-deployment.sh
```

### Emergency Rollback (Critical Issues)

For immediate system recovery:

```bash
# 1. Emergency stop all services
sudo pkill -9 -f "node"
sudo systemctl stop smart-assignment-* 2>/dev/null || true

# 2. Restore from most recent backup
LATEST_BACKUP=$(ls -t backups/ | head -n1)
cp "backups/$LATEST_BACKUP/eform.db.backup" data/eform.db
cp "backups/$LATEST_BACKUP/system.json.backup" config/system.json

# 3. Start with minimal configuration
cat > config/system.json << 'EOF'
{
  "lockers": {"total_count": 32},
  "hardware": {"modbus": {"pulse_duration_ms": 400}},
  "rate_limits": {"ip_per_minute": 20}
}
EOF

# 4. Start essential services only
npm run start:kiosk &  # Hardware control priority
sleep 5
npm run start:gateway &

# 5. Verify basic functionality
curl http://localhost:3002/health
```

## Troubleshooting Common Issues

### Service Startup Failures

**Symptom**: Services fail to start after deployment

**Solutions**:
```bash
# Check for port conflicts
sudo netstat -tulpn | grep -E ":(3000|3001|3002)"

# Check for missing dependencies
cd app/gateway && npm install
cd app/kiosk && npm install
cd app/panel && npm install

# Check for build errors
npm run build:gateway 2>&1 | tee build-errors.log

# Check file permissions
chmod +x scripts/deployment/*.sh
```

### Database Migration Failures

**Symptom**: Migration script fails or database corruption

**Solutions**:
```bash
# Check database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"

# Restore from backup and retry
cp backups/[latest]/eform.db.backup data/eform.db
sqlite3 data/eform.db < scripts/deployment/smart-assignment-migration.sql

# Manual table creation if needed
sqlite3 data/eform.db
.read scripts/deployment/smart-assignment-migration.sql
.quit
```

### Configuration Issues

**Symptom**: Invalid configuration or feature flag problems

**Solutions**:
```bash
# Validate JSON syntax
python3 -m json.tool config/system.json

# Reset to minimal configuration
cp config/system.json config/system.json.broken
cat > config/system.json << 'EOF'
{
  "lockers": {"total_count": 32},
  "hardware": {"modbus": {"pulse_duration_ms": 800}},
  "smart_assignment": {"enabled": false}
}
EOF

# Check feature flag in database
sqlite3 data/eform.db "UPDATE settings_global SET value='false' WHERE key='smart_assignment_enabled';"
```

### Hardware Communication Issues

**Symptom**: Relay control not working after deployment

**Solutions**:
```bash
# Check serial port availability
ls -la /dev/ttyUSB*

# Test basic hardware communication
node scripts/test-basic-relay-control.js

# Check for port conflicts
sudo lsof /dev/ttyUSB0

# Reset hardware configuration
sudo chmod 666 /dev/ttyUSB0
```

## Emergency Contacts and Escalation

### Immediate Response (Critical Issues)
1. **Stop all services**: `sudo pkill -9 -f "node"`
2. **Restore from backup**: Use latest known-good backup
3. **Contact system administrator**: [Contact information]
4. **Document incident**: Record all actions taken

### Escalation Procedures
1. **Level 1**: Automated rollback using provided scripts
2. **Level 2**: Manual rollback following documented procedures
3. **Level 3**: Emergency restore from backup with minimal configuration
4. **Level 4**: Complete system rebuild from clean state

## Validation Checklist

### Pre-Production Validation
- [ ] All deployment scripts tested on staging environment
- [ ] Rollback procedures verified with test data
- [ ] Performance benchmarks established
- [ ] Monitoring systems configured and tested
- [ ] Emergency procedures documented and rehearsed

### Post-Deployment Validation
- [ ] All services responding to health checks
- [ ] Database schema correctly migrated
- [ ] Configuration properly applied
- [ ] Feature flags in correct state (disabled by default)
- [ ] Backup and rollback procedures verified
- [ ] Monitoring systems active and alerting
- [ ] Performance within acceptable parameters

### Go-Live Checklist
- [ ] Smart assignment feature flag remains disabled
- [ ] All existing functionality working normally
- [ ] RFID card scanning operational
- [ ] Admin panel accessible
- [ ] Hardware control functional
- [ ] Logs showing normal operation
- [ ] No active alerts or errors

## Documentation and Reporting

### Deployment Report Template
```
Smart Assignment Deployment Report
Date: [DATE]
Deployed By: [NAME]
Backup Location: [PATH]

Pre-Deployment Status:
- Services: [STATUS]
- Database: [STATUS]
- Configuration: [STATUS]

Deployment Actions:
- Migration Applied: [YES/NO]
- Services Restarted: [YES/NO]
- Configuration Updated: [YES/NO]

Post-Deployment Status:
- All Services Running: [YES/NO]
- Health Checks Passing: [YES/NO]
- Feature Flag Status: [DISABLED/ENABLED]

Issues Encountered: [NONE/DESCRIPTION]
Rollback Required: [YES/NO]
Next Steps: [DESCRIPTION]
```

### Incident Report Template
```
Smart Assignment Incident Report
Date/Time: [TIMESTAMP]
Severity: [LOW/MEDIUM/HIGH/CRITICAL]
Reporter: [NAME]

Issue Description: [DESCRIPTION]
Impact: [USER IMPACT]
Root Cause: [ANALYSIS]

Actions Taken:
1. [ACTION]
2. [ACTION]

Resolution: [DESCRIPTION]
Rollback Required: [YES/NO]
Lessons Learned: [NOTES]
Prevention Measures: [RECOMMENDATIONS]
```

This comprehensive deployment procedure ensures safe, reliable deployment of the Smart Locker Assignment System with robust rollback capabilities and thorough monitoring.