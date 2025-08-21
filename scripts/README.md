# Eform Locker System - Deployment Scripts

This directory contains installation, deployment, and maintenance scripts for the Eform Locker System.

## Scripts Overview

### Installation Scripts

#### `install.sh`
Complete system installation script for Ubuntu/Debian systems.

**Features:**
- Installs Node.js 20 LTS and system dependencies
- Creates system user and directories with proper permissions
- Installs and builds the application
- Sets up systemd services
- Configures hardware access (udev rules)
- Sets up log rotation and automated backups
- Generates secure secrets
- Performs installation verification

**Usage:**
```bash
sudo ./scripts/install.sh
```

**Requirements:**
- Ubuntu/Debian system
- Root privileges
- Internet connection for package downloads

#### `uninstall.sh`
Complete system removal script.

**Features:**
- Creates final backup before removal
- Stops and removes all services
- Removes application files and system user
- Cleans up configuration files
- Preserves backups in `/var/backups/eform`

**Usage:**
```bash
sudo ./scripts/uninstall.sh
```

### Deployment Scripts

#### `deploy.sh`
Application deployment and update script with rollback capability.

**Features:**
- Package verification and validation
- Pre-deployment backup creation
- Zero-downtime deployment process
- Database migration execution
- Health check validation
- Automatic rollback on failure

**Usage:**
```bash
# Deploy new version
sudo ./scripts/deploy.sh deploy /path/to/package.tar.gz

# Check deployment status
./scripts/deploy.sh status

# Rollback to previous version
sudo ./scripts/deploy.sh rollback /path/to/backup.tar.gz
```

### Backup and Restore Scripts

#### `backup.sh`
Automated backup system with retention policies.

**Features:**
- Daily, weekly, and monthly backup types
- Database integrity verification
- Configuration and log backup
- Automatic cleanup of old backups
- Email notifications (if configured)

**Usage:**
```bash
# Create daily backup (default)
./scripts/backup.sh backup daily

# Create full backup
./scripts/backup.sh backup weekly

# Show backup status
./scripts/backup.sh status

# Restore from backup
sudo ./scripts/backup.sh restore /path/to/backup.tar.gz
```

**Backup Types:**
- **Daily**: Database only (7 days retention)
- **Weekly**: Full system backup (4 weeks retention)
- **Monthly**: Full system backup (12 months retention)

#### `restore.sh`
System restore from backup files.

**Features:**
- Interactive backup selection
- Pre-restore backup creation
- Service management during restore
- Database and configuration restoration
- Health check after restore

**Usage:**
```bash
# Interactive restore
sudo ./scripts/restore.sh interactive

# Direct restore
sudo ./scripts/restore.sh restore /path/to/backup.tar.gz

# List available backups
./scripts/restore.sh list
```

### Maintenance Scripts

#### `health-check.sh`
Comprehensive system health monitoring.

**Features:**
- Service status monitoring
- HTTP endpoint health checks
- Database integrity verification
- Resource usage monitoring
- Hardware connectivity checks
- Log file analysis
- Configuration validation

**Usage:**
```bash
# Run health check
./scripts/health-check.sh
```

**Exit Codes:**
- `0`: System healthy
- `1`: Issues detected

### Systemd Service Files

Located in `scripts/systemd/`:

#### `eform-gateway.service`
Central coordination service with database access.

#### `eform-kiosk.service`
Room-level service with hardware access (requires `dialout` group).

#### `eform-panel.service`
Web-based management interface.

#### `eform-agent.service`
Update and monitoring service with system restart privileges.

**Service Dependencies:**
```
eform-gateway (base service)
├── eform-agent (independent)
├── eform-kiosk (depends on gateway)
└── eform-panel (depends on gateway)
```

## Installation Process

### 1. System Preparation
```bash
# Download and extract the application
tar -xzf eform-locker-system.tar.gz
cd eform-locker-system

# Make scripts executable (Linux/macOS)
chmod +x scripts/*.sh
```

### 2. Installation
```bash
# Run installation script
sudo ./scripts/install.sh
```

### 3. Post-Installation Configuration
1. Edit `/opt/eform/config/system.json` for hardware settings
2. Access panel at `http://localhost:3002`
3. Create admin user and configure kiosks
4. Test hardware connections

### 4. Verification
```bash
# Check system health
./scripts/health-check.sh

# Check service status
systemctl status eform-gateway eform-kiosk eform-panel eform-agent
```

## Deployment Process

### 1. Package Preparation
Create deployment package:
```bash
# Build application
npm run build

# Create deployment package
tar -czf eform-v1.1.0.tar.gz app/ shared/ package.json migrations/
```

### 2. Deployment
```bash
# Deploy new version
sudo ./scripts/deploy.sh deploy eform-v1.1.0.tar.gz
```

### 3. Verification
```bash
# Check deployment status
./scripts/deploy.sh status

# Run health check
./scripts/health-check.sh
```

### 4. Rollback (if needed)
```bash
# List available backups
./scripts/restore.sh list

# Rollback to previous version
sudo ./scripts/deploy.sh rollback /opt/eform/backups/pre_deploy_20231201_120000.tar.gz
```

## Backup Strategy

### Automated Backups
- **Daily**: 2:00 AM (database only)
- **Weekly**: Sunday 2:00 AM (full system)
- **Monthly**: 1st of month 2:00 AM (full system)

### Manual Backups
```bash
# Before major changes
./scripts/backup.sh backup weekly

# Before deployment (automatic)
sudo ./scripts/deploy.sh deploy package.tar.gz
```

### Backup Locations
- **Local**: `/opt/eform/backups/`
- **Preserved**: `/var/backups/eform/` (after uninstall)

## Monitoring and Maintenance

### Health Monitoring
```bash
# Manual health check
./scripts/health-check.sh

# Add to cron for automated monitoring
echo "*/15 * * * * root /opt/eform/scripts/health-check.sh >/dev/null 2>&1 || logger 'Eform health check failed'" >> /etc/crontab
```

### Log Management
- **Location**: `/var/log/eform/`
- **Rotation**: Daily, 30 days retention
- **Size Limit**: 100MB per file

### Service Management
```bash
# Start/stop services
systemctl start eform-gateway
systemctl stop eform-kiosk

# View logs
journalctl -u eform-gateway -f
journalctl -u eform-kiosk --since "1 hour ago"

# Restart all services
systemctl restart eform-gateway eform-kiosk eform-panel eform-agent
```

## Troubleshooting

### Common Issues

#### Services Not Starting
```bash
# Check service status
systemctl status eform-gateway

# Check logs
journalctl -u eform-gateway -n 50

# Check configuration
./scripts/health-check.sh
```

#### Database Issues
```bash
# Check database integrity
sudo -u eform sqlite3 /opt/eform/data/eform.db "PRAGMA integrity_check;"

# Restore from backup
sudo ./scripts/restore.sh interactive
```

#### Hardware Issues
```bash
# Check hardware connectivity
./scripts/health-check.sh

# Check udev rules
udevadm control --reload-rules
udevadm trigger

# Check permissions
ls -la /dev/ttyUSB* /dev/hidraw*
```

#### Network Issues
```bash
# Check port availability
netstat -tuln | grep -E ":(3000|3001|3002) "

# Check firewall
ufw status
iptables -L
```

### Recovery Procedures

#### Complete System Recovery
```bash
# 1. Stop all services
sudo systemctl stop eform-*

# 2. Restore from backup
sudo ./scripts/restore.sh interactive

# 3. Verify system health
./scripts/health-check.sh
```

#### Database Recovery
```bash
# 1. Stop services
sudo systemctl stop eform-gateway eform-kiosk eform-panel

# 2. Backup current database
sudo -u eform cp /opt/eform/data/eform.db /opt/eform/data/eform.db.corrupt

# 3. Restore database from backup
sudo ./scripts/restore.sh restore /path/to/backup.tar.gz

# 4. Start services
sudo systemctl start eform-gateway eform-kiosk eform-panel
```

## Security Considerations

### File Permissions
- Application files: `eform:eform` ownership
- Configuration: `640` permissions
- Database: `640` permissions
- Logs: `644` permissions

### Service Security
- Services run as `eform` user (non-root)
- Restricted file system access
- Hardware access via group membership
- Network access limited to required ports

### Update Security
- Package verification with SHA256 checksums
- Signature verification (when implemented)
- Automatic rollback on failure
- Pre-deployment backups

## Support

### Log Locations
- **System logs**: `/var/log/eform/`
- **Application logs**: `/opt/eform/logs/`
- **Service logs**: `journalctl -u eform-*`

### Configuration Files
- **Main config**: `/opt/eform/config/system.json`
- **Service configs**: `/etc/systemd/system/eform-*.service`

### Backup Locations
- **Active backups**: `/opt/eform/backups/`
- **Preserved backups**: `/var/backups/eform/`

For additional support, check the system logs and run the health check script to identify specific issues.