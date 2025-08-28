# Repository Maintenance System

Automated tools and procedures for maintaining a clean and organized eForm Locker System repository.

## Overview

This maintenance system provides comprehensive automation for:
- **File cleanup**: Removes temporary and obsolete files
- **Organization**: Ensures proper directory structure and file placement
- **Health monitoring**: Tracks repository health metrics
- **Automation**: Scheduled maintenance tasks via cron jobs
- **Quality gates**: Git hooks to prevent accumulation of unwanted files

## Quick Start

### 1. Install Git Hooks
```bash
bash scripts/maintenance/install-git-hooks.sh
```

### 2. Setup Automated Schedule
```bash
bash scripts/maintenance/setup-maintenance-schedule.sh
```

### 3. Run Manual Maintenance
```bash
# Daily cleanup
bash scripts/maintenance/daily-cleanup.sh

# Health check
bash scripts/maintenance/repository-health-check.sh

# File organization check
node scripts/maintenance/file-organization-checker.js

# Comprehensive maintenance
node scripts/maintenance/automated-maintenance.js
```

## Available Tools

### Core Scripts

| Script | Purpose | Frequency |
|--------|---------|-----------|
| `daily-cleanup.sh` | Remove temporary files, rotate logs | Daily |
| `repository-health-check.sh` | Comprehensive health analysis | Weekly |
| `file-organization-checker.js` | Verify file organization compliance | Every 3 days |
| `automated-maintenance.js` | Full automated maintenance | Monthly |

### Setup & Management

| Script | Purpose |
|--------|---------|
| `install-git-hooks.sh` | Install Git hooks for quality gates |
| `setup-maintenance-schedule.sh` | Configure automated cron jobs |
| `maintenance-dashboard.sh` | View maintenance status |
| `uninstall-maintenance-schedule.sh` | Remove automated schedule |

### Configuration

| File | Purpose |
|------|---------|
| `maintenance-config.json` | Central configuration for all tools |
| `README.md` | This documentation |

## Maintenance Schedule

### Automated (Cron Jobs)
- **Daily 2:00 AM**: Cleanup temporary files, rotate logs
- **Weekly Sunday 3:00 AM**: Repository health check
- **Monthly 1st 4:00 AM**: Comprehensive maintenance
- **Every 3 days 1:00 AM**: File organization check

### Manual (As Needed)
- Before major releases
- After large feature merges
- When repository health score drops below 75
- When temporary file count exceeds 10

## Git Hooks

### Pre-commit
- Prevents temporary file commits
- Enforces naming conventions
- Checks for large files
- Validates documentation links

### Pre-push
- Runs health check
- Verifies file organization
- Ensures repository quality

### Commit-msg
- Enforces commit message format
- Requires proper type prefixes

### Post-commit
- Logs commit information
- Triggers cleanup for large commits

## Health Metrics

### Scoring System
- **90-100**: Excellent health
- **75-89**: Good health
- **50-74**: Needs attention
- **25-49**: Poor health
- **0-24**: Critical issues

### Key Indicators
- Total file count
- Temporary file count
- Large file count (>10MB)
- Root-level file count
- Directory organization compliance
- Broken documentation links

## File Organization Rules

### Directory Structure
```
eform-locker-system/
├── app/                    # Core services
├── docs/                   # Essential documentation
├── scripts/                # Operational scripts
│   ├── deployment/         # Deployment scripts
│   ├── testing/           # Test scripts
│   ├── maintenance/       # Maintenance tools
│   └── emergency/         # Emergency procedures
├── tests/                  # Test suites
├── shared/                # Common utilities
├── config/                # Configuration files
└── migrations/            # Database migrations
```

### Naming Conventions
- **Files**: kebab-case, max 50 characters
- **Directories**: kebab-case, max 5 levels deep
- **No spaces**: Use hyphens instead
- **Lowercase extensions**: .js not .JS

### File Categories
- **Temporary**: *.tmp, *.temp, *.bak, *debug*, timestamp patterns
- **Documentation**: *.md files (should be in docs/)
- **Scripts**: *.sh, *.js, *.py (should be in scripts/)
- **Tests**: *.test.* (should be in test directories)
- **Large**: >10MB (consider Git LFS)

## Usage Examples

### Check Repository Health
```bash
bash scripts/maintenance/repository-health-check.sh
```

### Clean Temporary Files
```bash
bash scripts/maintenance/daily-cleanup.sh
```

### Dry Run Maintenance
```bash
node scripts/maintenance/automated-maintenance.js --dry-run --verbose
```

### View Maintenance Dashboard
```bash
bash scripts/maintenance/maintenance-dashboard.sh
```

### Check File Organization
```bash
node scripts/maintenance/file-organization-checker.js
```

## Troubleshooting

### Common Issues

#### "Permission denied" errors
```bash
# On Linux/Mac
chmod +x scripts/maintenance/*.sh

# On Windows (PowerShell)
Get-ChildItem scripts/maintenance/*.sh | ForEach-Object { $_.IsReadOnly = $false }
```

#### Cron jobs not running
```bash
# Check cron service
sudo systemctl status cron

# View cron logs
sudo tail -f /var/log/cron

# List current cron jobs
crontab -l
```

#### Large repository size
```bash
# Find large files
find . -size +10M -not -path "./node_modules/*" -ls

# Check repository size
du -sh . --exclude=node_modules --exclude=.git
```

### Recovery Procedures

#### Restore accidentally removed files
```bash
# Check git history
git log --diff-filter=D --summary

# Restore specific file
git checkout <commit-hash>~1 -- <file-path>
```

#### Reset maintenance configuration
```bash
# Reinstall git hooks
bash scripts/maintenance/install-git-hooks.sh

# Reset cron schedule
bash scripts/maintenance/uninstall-maintenance-schedule.sh
bash scripts/maintenance/setup-maintenance-schedule.sh
```

## Configuration

### Customizing Maintenance Rules

Edit `maintenance-config.json` to customize:
- File patterns for cleanup
- Directory structure requirements
- Naming convention rules
- Health score thresholds
- Automation schedules

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAINTENANCE_DRY_RUN` | false | Enable dry run mode |
| `MAINTENANCE_VERBOSE` | false | Enable verbose logging |
| `MAINTENANCE_LOG_LEVEL` | info | Log level (debug, info, warn, error) |

## Monitoring

### Log Files
- `logs/maintenance.log`: All maintenance activity
- `scripts/maintenance/cleanup.log`: Daily cleanup results
- `scripts/maintenance/health-check.log`: Health check history
- `scripts/maintenance/commit-log.txt`: Git commit tracking

### Reports
- Daily: Cleanup summary
- Weekly: Health check report
- Monthly: Comprehensive maintenance report
- On-demand: File organization analysis

## Best Practices

### For Developers
1. Run health check before major commits
2. Clean up temporary files regularly
3. Follow naming conventions
4. Update documentation when changing structure

### For Maintainers
1. Monitor health scores weekly
2. Review maintenance logs monthly
3. Update automation rules as needed
4. Test recovery procedures quarterly

### For CI/CD
1. Include health checks in pipeline
2. Fail builds on critical issues
3. Generate maintenance reports
4. Archive old maintenance data

## Support

For issues or questions about the maintenance system:
1. Check this README
2. Review maintenance logs
3. Run diagnostic commands
4. Consult the main project documentation

## Changelog

### v1.0.0 (2025-08-28)
- Initial maintenance system implementation
- Automated cleanup and health checking
- Git hooks for quality gates
- Comprehensive documentation and configuration