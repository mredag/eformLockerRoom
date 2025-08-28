# Repository Maintenance Guide

## Overview

This guide provides comprehensive procedures for maintaining a clean and organized repository structure for the eForm Locker System. Following these guidelines ensures the repository remains maintainable, navigable, and free from accumulating temporary files.

## File Organization Principles

### Directory Structure Standards

```
eform-locker-system/
├── app/                    # Core application services
│   ├── gateway/           # API gateway service
│   ├── kiosk/            # Hardware control service
│   ├── panel/            # Admin web interface
│   └── agent/            # Background task processing
├── shared/               # Common utilities and types
├── docs/                 # Essential documentation only
├── scripts/              # Operational scripts organized by purpose
│   ├── deployment/       # Deployment automation
│   ├── testing/          # Test execution scripts
│   ├── maintenance/      # System maintenance scripts
│   └── emergency/        # Emergency response scripts
├── tests/                # Test suites
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── e2e/             # End-to-end tests
├── migrations/           # Database migrations
├── config/              # Configuration files
└── data/                # Runtime data (gitignored)
```

### File Naming Conventions

#### Documentation Files
- Use kebab-case: `deployment-guide.md`, `api-reference.md`
- Include purpose in name: `troubleshooting-guide.md`, `performance-monitoring-guide.md`
- Avoid version numbers in filenames: Use git history for versioning
- Maximum 50 characters for readability

#### Script Files
- Use kebab-case with action prefix: `deploy-kiosk-ui.sh`, `test-basic-relay-control.js`
- Include purpose category: `emergency-relay-reset.js`, `maintenance-cleanup.sh`
- Use descriptive names: `validate-deployment.sh` not `validate.sh`

#### Test Files
- Follow pattern: `{component}.test.{ext}` or `{feature}-integration.test.{ext}`
- Use descriptive names: `maksi-integration.test.ts`, `session-management-lifecycle.test.ts`
- Group related tests in subdirectories when needed

#### Configuration Files
- Use environment-specific suffixes: `development.json`, `production.json`
- Keep base configuration generic: `system.json`
- Document configuration options in README files

## Maintenance Procedures

### Daily Maintenance (Automated)

1. **Temporary File Cleanup**
   - Remove files with timestamp patterns in names
   - Clean up `.tmp`, `.temp`, `.bak` files
   - Remove debug output files older than 24 hours

2. **Log File Management**
   - Rotate logs older than 7 days
   - Compress archived logs
   - Remove debug logs older than 3 days

3. **Build Artifact Cleanup**
   - Clean `dist/` directories not in use
   - Remove `node_modules/.cache` contents
   - Clear temporary build files

### Weekly Maintenance (Manual Review)

1. **Documentation Review**
   - Check for outdated information in docs/
   - Verify all links are functional
   - Update version-specific information

2. **Script Audit**
   - Review scripts/ directory for unused files
   - Verify script documentation is current
   - Test critical operational scripts

3. **Test Suite Maintenance**
   - Remove obsolete test files
   - Update test documentation
   - Verify test coverage remains adequate

### Monthly Maintenance (Comprehensive)

1. **Dependency Audit**
   - Review package.json for unused dependencies
   - Update security-critical packages
   - Remove deprecated dependencies

2. **Code Quality Review**
   - Run static analysis tools
   - Review TODO comments and technical debt
   - Update coding standards documentation

3. **Repository Structure Review**
   - Assess directory organization effectiveness
   - Identify files that should be moved or removed
   - Update .gitignore patterns as needed

## File Lifecycle Management

### File Categories and Retention

#### Permanent Files
- Core application code
- Essential documentation
- Production configuration
- Database migrations
- **Retention**: Indefinite

#### Temporary Files
- Debug output with timestamps
- Test artifacts from specific sessions
- Build logs and temporary configs
- **Retention**: 24-48 hours

#### Historical Files
- Legacy documentation with historical value
- Deprecated but referenced code
- Migration artifacts
- **Retention**: Archive after 6 months, remove after 2 years

#### Development Files
- Feature branch artifacts
- Development-specific configs
- Experimental code
- **Retention**: Remove when feature complete or abandoned

### Automated Cleanup Rules

1. **Pattern-Based Removal**
   ```bash
   # Files with timestamp patterns (older than 24 hours)
   find . -name "*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*" -mtime +1 -delete
   
   # Temporary extensions
   find . -name "*.tmp" -o -name "*.temp" -o -name "*.bak" -mtime +1 -delete
   
   # Debug and test artifacts
   find . -name "*debug*" -name "*.log" -mtime +3 -delete
   ```

2. **Size-Based Cleanup**
   ```bash
   # Large files that shouldn't be in repository
   find . -size +10M -not -path "./node_modules/*" -not -path "./data/*"
   ```

3. **Age-Based Cleanup**
   ```bash
   # Files not modified in 90 days (excluding core directories)
   find . -mtime +90 -not -path "./app/*" -not -path "./shared/*" -not -path "./migrations/*"
   ```

## Quality Gates

### Pre-Commit Checks
- No files larger than 10MB (except in data/)
- No temporary file patterns in commit
- All documentation links functional
- No TODO comments without issue references

### Pre-Release Checks
- All scripts have proper documentation
- No debug or development-specific files
- Documentation is up-to-date
- Test coverage meets minimum requirements

### Repository Health Metrics
- Total file count trend (should not grow indefinitely)
- Documentation-to-code ratio (maintain 1:10 ratio)
- Script organization compliance (>90% in proper directories)
- Broken link count (should be 0)

## Automation Tools

### Maintenance Scripts

#### Daily Cleanup Script
```bash
#!/bin/bash
# scripts/maintenance/daily-cleanup.sh
# Automated daily repository maintenance

echo "Starting daily repository cleanup..."

# Remove temporary files
find . -name "*.tmp" -o -name "*.temp" -o -name "*.bak" -mtime +1 -delete
echo "Removed temporary files"

# Clean old debug files
find . -name "*debug*" -name "*.log" -mtime +3 -delete
echo "Cleaned debug files"

# Rotate logs
if [ -d "logs" ]; then
    find logs/ -name "*.log" -mtime +7 -exec gzip {} \;
    find logs/ -name "*.log.gz" -mtime +30 -delete
    echo "Rotated log files"
fi

echo "Daily cleanup completed"
```

#### Repository Health Check
```bash
#!/bin/bash
# scripts/maintenance/health-check.sh
# Check repository health metrics

echo "Repository Health Report - $(date)"
echo "========================================"

# File count by directory
echo "File counts:"
find app/ -type f | wc -l | xargs echo "  app/:"
find docs/ -type f | wc -l | xargs echo "  docs/:"
find scripts/ -type f | wc -l | xargs echo "  scripts/:"
find tests/ -type f | wc -l | xargs echo "  tests/:"

# Large files
echo -e "\nLarge files (>1MB):"
find . -size +1M -not -path "./node_modules/*" -not -path "./data/*" -ls

# Temporary patterns
echo -e "\nTemporary file patterns:"
find . -name "*.tmp" -o -name "*.temp" -o -name "*.bak" -o -name "*debug*"

# Broken symlinks
echo -e "\nBroken symlinks:"
find . -type l ! -exec test -e {} \; -print

echo -e "\nHealth check completed"
```

### Git Hooks

#### Pre-commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit
# Prevent commits of temporary files and enforce naming conventions

# Check for temporary file patterns
if git diff --cached --name-only | grep -E '\.(tmp|temp|bak)$|debug|test-[0-9]'; then
    echo "Error: Attempting to commit temporary files"
    echo "Please remove temporary files before committing"
    exit 1
fi

# Check for large files
if git diff --cached --name-only | xargs ls -la | awk '$5 > 10485760 { print $9, $5 }' | grep -v '^$'; then
    echo "Error: Large files detected (>10MB)"
    echo "Please use Git LFS or exclude from repository"
    exit 1
fi

# Check documentation links (for .md files)
for file in $(git diff --cached --name-only | grep '\.md$'); do
    if [ -f "$file" ]; then
        # Simple check for broken internal links
        grep -n '\[.*\](\./' "$file" | while read -r line; do
            link=$(echo "$line" | sed -n 's/.*\[\([^]]*\)\](\([^)]*\)).*/\2/p')
            if [ -n "$link" ] && [ ! -f "$link" ]; then
                echo "Warning: Broken link in $file: $link"
            fi
        done
    fi
done

exit 0
```

## Monitoring and Alerts

### Repository Metrics Dashboard

Track these key metrics:
- Total repository size
- File count by category
- Documentation coverage
- Script organization compliance
- Temporary file accumulation rate

### Alert Conditions

Set up alerts for:
- Repository size growth >20% in 30 days
- >50 temporary files detected
- Documentation-to-code ratio drops below 1:15
- >5 broken links in documentation
- Critical scripts missing documentation

## Best Practices

### For Developers

1. **Before Creating Files**
   - Choose appropriate directory based on file purpose
   - Use established naming conventions
   - Consider file lifecycle and retention needs

2. **During Development**
   - Clean up temporary files regularly
   - Update documentation when changing functionality
   - Use descriptive commit messages for file operations

3. **Before Committing**
   - Run repository health check
   - Remove debug and temporary files
   - Verify documentation links are functional

### For Maintainers

1. **Regular Reviews**
   - Weekly script and documentation audits
   - Monthly repository structure assessments
   - Quarterly cleanup procedure updates

2. **Automation Management**
   - Monitor cleanup script effectiveness
   - Update automation rules based on new patterns
   - Maintain and test backup procedures

3. **Documentation Maintenance**
   - Keep this guide updated with new procedures
   - Document exceptions and special cases
   - Maintain change log for maintenance procedures

## Troubleshooting

### Common Issues

#### Repository Size Growing Rapidly
- Check for large binary files in commits
- Review log file retention policies
- Audit node_modules and build artifacts

#### Broken Links in Documentation
- Run link checker tools regularly
- Update references after file moves
- Maintain redirect mappings for moved content

#### Script Organization Degradation
- Regular audits of scripts/ directory
- Enforce naming conventions in reviews
- Automated categorization checks

#### Temporary File Accumulation
- Review and update cleanup patterns
- Check automation script execution
- Identify sources of temporary file creation

### Recovery Procedures

#### Restore Accidentally Removed Files
```bash
# Check git history for removed files
git log --diff-filter=D --summary

# Restore specific file
git checkout <commit-hash>~1 -- <file-path>
```

#### Clean Up After Bulk Operations
```bash
# Reset to clean state (use with caution)
git clean -fd

# Remove untracked files interactively
git clean -i
```

## Conclusion

Maintaining a clean repository structure requires consistent application of these guidelines and regular use of the provided automation tools. The investment in maintenance procedures pays dividends in developer productivity, system reliability, and project maintainability.

Regular adherence to these practices ensures the eForm Locker System repository remains a model of organization and efficiency.