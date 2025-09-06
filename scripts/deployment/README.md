# Smart Locker Assignment System - Deployment Artifacts

## Overview

This directory contains all deployment artifacts for the Smart Locker Assignment System, including migration scripts, deployment automation, monitoring setup, and rollback procedures.

## Deployment Artifacts

### Database Migration Scripts

#### `smart-assignment-migration.sql`
Complete database schema migration for smart assignment system.

**Features:**
- Extends lockers table with smart assignment columns
- Creates configuration management tables
- Sets up session tracking and metrics collection
- Includes performance optimization indexes
- Seeds default configuration values

**Usage:**
```bash
sqlite3 data/eform.db < scripts/deployment/smart-assignment-migration.sql
```

#### `smart-assignment-rollback.sql`
Complete rollback of smart assignment database changes.

**Features:**
- Removes all smart assignment tables
- Restores original lockers table schema
- Preserves original data integrity
- Creates backup before rollback

**Usage:**
```bash
sqlite3 data/eform.db < scripts/deployment/smart-assignment-rollback.sql
```

### Deployment Automation Scripts

#### `deploy-smart-assignment.sh`
Comprehensive automated deployment script.

**Features:**
- Pre-deployment validation
- Automatic backup creation
- Service management (stop/start)
- Database migration execution
- Configuration updates
- Dependency installation and building
- Post-deployment verification
- Deployment reporting

**Usage:**
```bash
./scripts/deployment/deploy-smart-assignment.sh
```

**Output:**
- Backup directory: `backups/smart-assignment-YYYYMMDD-HHMMSS/`
- Deployment log: `logs/smart-assignment-deployment.log`
- Deployment report: `backups/[backup-dir]/deployment-report.txt`

#### `rollback-smart-assignment.sh`
Automated rollback script for emergency recovery.

**Features:**
- Service shutdown
- Database restoration from backup
- Configuration restoration
- Service rebuild and restart
- Rollback verification
- Rollback reporting

**Usage:**
```bash
./scripts/deployment/rollback-smart-assignment.sh <backup_directory>
```

**Example:**
```bash
./scripts/deployment/rollback-smart-assignment.sh backups/smart-assignment-20250109-143022
```

### Validation and Verification Tools

#### `validate-smart-assignment-deployment.js`
Comprehensive deployment validation tool.

**Features:**
- Database schema validation
- Configuration file validation
- Service health checks
- File structure verification
- Performance testing
- JSON validation report generation

**Usage:**
```bash
node scripts/deployment/validate-smart-assignment-deployment.js
```

**Output:**
- Console validation results
- JSON report: `deployment-validation-report.json`
- Exit code 0 (success) or 1 (failure)

#### `verify-deployment.sh`
Post-deployment verification script.

**Features:**
- Service health verification
- Database integrity checks
- API endpoint testing
- Performance benchmarking
- Hardware integration testing
- Comprehensive reporting

**Usage:**
```bash
./scripts/deployment/verify-deployment.sh
```

**Output:**
- Verification log: `logs/deployment-verification.log`
- Verification report: `deployment-verification-report.txt`

### Monitoring and Alerting Setup

#### `setup-monitoring.sh`
Complete monitoring system setup.

**Features:**
- Health check script creation
- Performance monitoring setup
- Alert monitoring configuration
- Systemd service creation
- Cron job examples
- Monitoring dashboard
- Installation automation

**Usage:**
```bash
./scripts/deployment/setup-monitoring.sh
```

**Created Components:**
- `monitoring/scripts/health-check.sh`
- `monitoring/scripts/performance-monitor.sh`
- `monitoring/scripts/check-alerts.js`
- `monitoring/scripts/dashboard.sh`
- `monitoring/config/monitoring.json`
- Systemd service files
- Cron job examples

## Deployment Workflow

### 1. Pre-Deployment Preparation

```bash
# Verify system requirements
./scripts/deployment/validate-smart-assignment-deployment.js

# Create manual backup (optional)
mkdir -p backups/manual-$(date +%Y%m%d-%H%M%S)
cp data/eform.db backups/manual-$(date +%Y%m%d-%H%M%S)/
cp config/system.json backups/manual-$(date +%Y%m%d-%H%M%S)/
```

### 2. Automated Deployment

```bash
# Run complete deployment
./scripts/deployment/deploy-smart-assignment.sh

# Monitor deployment progress
tail -f logs/smart-assignment-deployment.log
```

### 3. Post-Deployment Verification

```bash
# Comprehensive verification
./scripts/deployment/verify-deployment.sh

# Setup monitoring (optional)
./scripts/deployment/setup-monitoring.sh
```

### 4. Monitoring and Maintenance

```bash
# Install monitoring system
./monitoring/install-monitoring.sh

# View real-time dashboard
./monitoring/scripts/dashboard.sh

# Manual health checks
./monitoring/scripts/health-check.sh
```

## Rollback Procedures

### Automatic Rollback

```bash
# List available backups
ls -la backups/

# Rollback to specific backup
./scripts/deployment/rollback-smart-assignment.sh backups/smart-assignment-20250109-143022
```

### Emergency Rollback

```bash
# Quick emergency rollback (uses latest backup)
LATEST_BACKUP=$(ls -t backups/ | head -n1)
./scripts/deployment/rollback-smart-assignment.sh "backups/$LATEST_BACKUP"
```

### Manual Rollback

If automated rollback fails:

```bash
# Stop services
sudo pkill -f "node"

# Restore database
cp backups/[backup-dir]/eform.db.backup data/eform.db

# Restore configuration
cp backups/[backup-dir]/system.json.backup config/system.json

# Restart services
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &
```

## Configuration Management

### Default Configuration

The deployment automatically seeds these default values:

```json
{
  "base_score": 100,
  "score_factor_a": 2.0,
  "score_factor_b": 1.0,
  "score_factor_g": 0.1,
  "score_factor_d": 0.5,
  "top_k_candidates": 5,
  "selection_temperature": 1.0,
  "quarantine_min_floor": 5,
  "quarantine_min_ceiling": 20,
  "exit_quarantine_minutes": 20,
  "return_hold_trigger_seconds": 120,
  "return_hold_minutes": 15,
  "session_limit_minutes": 180,
  "retrieve_window_minutes": 10,
  "reserve_ratio": 0.1,
  "reserve_minimum": 2,
  "pulse_ms": 800,
  "open_window_sec": 10,
  "retry_backoff_ms": 500,
  "card_rate_limit_seconds": 10,
  "locker_rate_limit_per_minute": 3,
  "command_cooldown_seconds": 3,
  "user_report_daily_cap": 2,
  "smart_assignment_enabled": false,
  "allow_reclaim_during_quarantine": false
}
```

### Feature Flag Management

Smart assignment is **disabled by default** for safe deployment:

```bash
# Check feature flag status
sqlite3 data/eform.db "SELECT value FROM settings_global WHERE key='smart_assignment_enabled';"

# Enable smart assignment (when ready)
sqlite3 data/eform.db "UPDATE settings_global SET value='true' WHERE key='smart_assignment_enabled';"

# Disable smart assignment (emergency)
sqlite3 data/eform.db "UPDATE settings_global SET value='false' WHERE key='smart_assignment_enabled';"
```

## Monitoring and Health Checks

### Service Health

```bash
# Check all services
curl http://localhost:3000/health  # Gateway
curl http://localhost:3002/health  # Kiosk
curl http://localhost:3001/health  # Panel

# Automated health check
./monitoring/scripts/health-check.sh
```

### Database Health

```bash
# Database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"

# Smart assignment tables
sqlite3 data/eform.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('settings_global', 'smart_sessions', 'assignment_metrics', 'alerts');"

# Configuration status
sqlite3 data/eform.db "SELECT COUNT(*) FROM settings_global;"
```

### Performance Monitoring

```bash
# System resources
./monitoring/scripts/performance-monitor.sh

# Real-time dashboard
./monitoring/scripts/dashboard.sh

# Alert checking
node ./monitoring/scripts/check-alerts.js
```

## Troubleshooting

### Common Issues

#### Deployment Fails
```bash
# Check logs
tail -50 logs/smart-assignment-deployment.log

# Validate prerequisites
node scripts/deployment/validate-smart-assignment-deployment.js

# Manual deployment steps
# See docs/smart-assignment-system/deployment-procedures.md
```

#### Services Won't Start
```bash
# Check for port conflicts
sudo netstat -tulpn | grep -E ":(3000|3001|3002)"

# Check build status
npm run build:all

# Check dependencies
cd app/gateway && npm install
cd app/kiosk && npm install
cd app/panel && npm install
```

#### Database Issues
```bash
# Check database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"

# Restore from backup
cp backups/[latest]/eform.db.backup data/eform.db

# Re-run migration
sqlite3 data/eform.db < scripts/deployment/smart-assignment-migration.sql
```

### Emergency Procedures

For critical issues, see:
- `docs/smart-assignment-system/emergency-procedures.md`
- `docs/smart-assignment-system/deployment-procedures.md`

## File Structure

```
scripts/deployment/
├── README.md                                    # This file
├── smart-assignment-migration.sql               # Database migration
├── smart-assignment-rollback.sql                # Database rollback
├── deploy-smart-assignment.sh                   # Automated deployment
├── rollback-smart-assignment.sh                 # Automated rollback
├── validate-smart-assignment-deployment.js      # Deployment validation
├── verify-deployment.sh                         # Post-deployment verification
└── setup-monitoring.sh                          # Monitoring setup

monitoring/
├── scripts/
│   ├── health-check.sh                         # Service health checks
│   ├── performance-monitor.sh                  # Performance monitoring
│   ├── check-alerts.js                         # Alert monitoring
│   └── dashboard.sh                            # Real-time dashboard
├── config/
│   ├── monitoring.json                         # Monitoring configuration
│   ├── *.service                              # Systemd service files
│   ├── *.timer                                # Systemd timer files
│   └── crontab-example                        # Cron job examples
└── install-monitoring.sh                       # Monitoring installation

docs/smart-assignment-system/
├── deployment-procedures.md                     # Comprehensive deployment guide
└── emergency-procedures.md                      # Emergency response procedures
```

## Security Considerations

### Backup Security
- Backups contain sensitive data (RFID card IDs, user sessions)
- Store backups in secure location with appropriate permissions
- Consider encryption for long-term backup storage

### Configuration Security
- Configuration contains system parameters
- Restrict access to configuration files
- Audit configuration changes

### Database Security
- Database contains user data and system state
- Use appropriate file permissions (600 or 640)
- Regular integrity checks and backups

## Support and Documentation

### Additional Documentation
- `docs/smart-assignment-system/deployment-procedures.md` - Detailed deployment procedures
- `docs/smart-assignment-system/emergency-procedures.md` - Emergency response procedures
- `.kiro/specs/smart-locker-assignment/` - Complete system specifications

### Getting Help
1. Check deployment logs: `logs/smart-assignment-deployment.log`
2. Run validation: `node scripts/deployment/validate-smart-assignment-deployment.js`
3. Review troubleshooting section above
4. Consult emergency procedures for critical issues

### Reporting Issues
When reporting deployment issues, include:
- Deployment log file
- Validation report
- System information (OS, Node.js version, available disk space)
- Steps to reproduce the issue
- Expected vs actual behavior

This deployment artifacts package provides comprehensive tools for safe, reliable deployment and management of the Smart Locker Assignment System.