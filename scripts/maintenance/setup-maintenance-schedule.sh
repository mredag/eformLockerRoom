#!/bin/bash
# Setup Automated Maintenance Schedule
# Configures cron jobs for regular repository maintenance

set -e

echo "⏰ Setting up Automated Maintenance Schedule"
echo "==========================================="

# Configuration
REPO_PATH=$(pwd)
USER=$(whoami)
CRON_FILE="/tmp/eform-maintenance-cron"

# Function to add cron job safely
add_cron_job() {
    local schedule="$1"
    local command="$2"
    local description="$3"
    
    echo "📅 Adding cron job: $description"
    echo "   Schedule: $schedule"
    echo "   Command: $command"
    
    # Check if job already exists
    if crontab -l 2>/dev/null | grep -q "$command"; then
        echo "   ⚠️  Cron job already exists, skipping..."
        return 0
    fi
    
    # Add to cron file
    echo "$schedule $command # $description" >> "$CRON_FILE"
    echo "   ✓ Added to cron schedule"
}

# Create temporary cron file with existing jobs
echo "📋 Backing up existing cron jobs..."
crontab -l 2>/dev/null > "$CRON_FILE" || touch "$CRON_FILE"

# Ensure scripts are executable
echo "🔧 Making maintenance scripts executable..."
chmod +x scripts/maintenance/*.sh 2>/dev/null || true
chmod +x scripts/maintenance/*.js 2>/dev/null || true

# Add maintenance jobs
echo ""
echo "📅 Configuring maintenance schedule..."

# Daily cleanup (every day at 2 AM)
add_cron_job \
    "0 2 * * *" \
    "cd $REPO_PATH && bash scripts/maintenance/daily-cleanup.sh >> logs/maintenance.log 2>&1" \
    "Daily repository cleanup"

# Weekly health check (every Sunday at 3 AM)
add_cron_job \
    "0 3 * * 0" \
    "cd $REPO_PATH && bash scripts/maintenance/repository-health-check.sh >> logs/maintenance.log 2>&1" \
    "Weekly repository health check"

# Monthly comprehensive maintenance (first day of month at 4 AM)
add_cron_job \
    "0 4 1 * *" \
    "cd $REPO_PATH && node scripts/maintenance/automated-maintenance.js --schedule=monthly >> logs/maintenance.log 2>&1" \
    "Monthly comprehensive maintenance"

# File organization check (every 3 days at 1 AM)
add_cron_job \
    "0 1 */3 * *" \
    "cd $REPO_PATH && node scripts/maintenance/file-organization-checker.js >> logs/maintenance.log 2>&1" \
    "File organization check"

# Log rotation (every day at 1:30 AM)
add_cron_job \
    "30 1 * * *" \
    "cd $REPO_PATH && find logs/ -name '*.log' -size +10M -exec gzip {} \; && find logs/ -name '*.log.gz' -mtime +30 -delete" \
    "Log rotation and cleanup"

# Install the cron jobs
echo ""
echo "💾 Installing cron jobs..."
if crontab "$CRON_FILE"; then
    echo "✅ Cron jobs installed successfully!"
else
    echo "❌ Failed to install cron jobs"
    rm -f "$CRON_FILE"
    exit 1
fi

# Clean up temporary file
rm -f "$CRON_FILE"

# Create logs directory if it doesn't exist
mkdir -p logs

# Create maintenance status tracking
echo "📊 Setting up maintenance tracking..."
cat > scripts/maintenance/maintenance-status.json << EOF
{
  "setupDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "lastUpdate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "schedule": {
    "dailyCleanup": "0 2 * * *",
    "weeklyHealthCheck": "0 3 * * 0",
    "monthlyMaintenance": "0 4 1 * *",
    "organizationCheck": "0 1 */3 * *",
    "logRotation": "30 1 * * *"
  },
  "status": "active",
  "nextRuns": {
    "dailyCleanup": "$(date -d 'tomorrow 2:00' -u +"%Y-%m-%dT%H:%M:%SZ")",
    "weeklyHealthCheck": "$(date -d 'next Sunday 3:00' -u +"%Y-%m-%dT%H:%M:%SZ")",
    "monthlyMaintenance": "$(date -d 'first day of next month 4:00' -u +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
EOF

# Create maintenance dashboard script
echo "📈 Creating maintenance dashboard..."
cat > scripts/maintenance/maintenance-dashboard.sh << 'EOF'
#!/bin/bash
# Maintenance Dashboard
# Shows current status of automated maintenance

echo "🔧 Repository Maintenance Dashboard"
echo "=================================="
echo ""

# Check if cron jobs are active
echo "📅 Scheduled Jobs Status:"
if crontab -l 2>/dev/null | grep -q "repository cleanup"; then
    echo "  ✅ Daily cleanup: Active"
else
    echo "  ❌ Daily cleanup: Not scheduled"
fi

if crontab -l 2>/dev/null | grep -q "health check"; then
    echo "  ✅ Weekly health check: Active"
else
    echo "  ❌ Weekly health check: Not scheduled"
fi

if crontab -l 2>/dev/null | grep -q "comprehensive maintenance"; then
    echo "  ✅ Monthly maintenance: Active"
else
    echo "  ❌ Monthly maintenance: Not scheduled"
fi

echo ""

# Show recent maintenance activity
echo "📊 Recent Maintenance Activity:"
if [ -f "logs/maintenance.log" ]; then
    echo "  Last 5 maintenance runs:"
    tail -5 logs/maintenance.log | sed 's/^/    /'
else
    echo "  No maintenance log found"
fi

echo ""

# Show repository health summary
echo "🏥 Repository Health Summary:"
total_files=$(find . -type f -not -path "./.git/*" -not -path "./node_modules/*" | wc -l)
temp_files=$(find . -name "*.tmp" -o -name "*.temp" -o -name "*.bak" | wc -l)
large_files=$(find . -size +10M -not -path "./node_modules/*" -not -path "./data/*" | wc -l)

echo "  Total files: $total_files"
echo "  Temporary files: $temp_files"
echo "  Large files (>10MB): $large_files"

if [ $temp_files -eq 0 ] && [ $large_files -eq 0 ]; then
    echo "  Status: ✅ Healthy"
elif [ $temp_files -lt 5 ] && [ $large_files -lt 3 ]; then
    echo "  Status: ⚠️  Needs attention"
else
    echo "  Status: ❌ Requires maintenance"
fi

echo ""

# Show next scheduled runs
echo "⏰ Next Scheduled Runs:"
echo "  Daily cleanup: Tomorrow at 2:00 AM"
echo "  Weekly health check: Next Sunday at 3:00 AM"
echo "  Monthly maintenance: 1st of next month at 4:00 AM"

echo ""
echo "💡 Manual Commands:"
echo "  Run cleanup now: bash scripts/maintenance/daily-cleanup.sh"
echo "  Check health: bash scripts/maintenance/repository-health-check.sh"
echo "  Full maintenance: node scripts/maintenance/automated-maintenance.js"
EOF

chmod +x scripts/maintenance/maintenance-dashboard.sh

# Create uninstall script
echo "🗑️  Creating uninstall script..."
cat > scripts/maintenance/uninstall-maintenance-schedule.sh << 'EOF'
#!/bin/bash
# Uninstall Automated Maintenance Schedule
# Removes all maintenance-related cron jobs

echo "🗑️  Uninstalling Automated Maintenance Schedule"
echo "=============================================="

# Remove maintenance cron jobs
echo "📅 Removing maintenance cron jobs..."
crontab -l 2>/dev/null | grep -v "repository cleanup" | \
grep -v "health check" | \
grep -v "comprehensive maintenance" | \
grep -v "organization check" | \
grep -v "Log rotation" | \
crontab -

echo "✅ Maintenance cron jobs removed"

# Update status
if [ -f "scripts/maintenance/maintenance-status.json" ]; then
    sed -i 's/"status": "active"/"status": "inactive"/' scripts/maintenance/maintenance-status.json
    echo "📊 Maintenance status updated to inactive"
fi

echo ""
echo "💡 To reinstall maintenance schedule:"
echo "  bash scripts/maintenance/setup-maintenance-schedule.sh"
EOF

chmod +x scripts/maintenance/uninstall-maintenance-schedule.sh

# Display current cron jobs
echo ""
echo "📋 Current Cron Jobs:"
crontab -l 2>/dev/null | grep -E "(cleanup|health|maintenance|organization)" | sed 's/^/  /'

echo ""
echo "✅ Automated Maintenance Schedule Setup Complete!"
echo ""
echo "📊 Dashboard: bash scripts/maintenance/maintenance-dashboard.sh"
echo "🗑️  Uninstall: bash scripts/maintenance/uninstall-maintenance-schedule.sh"
echo "📝 Logs: tail -f logs/maintenance.log"
echo ""
echo "🔔 Maintenance will run automatically according to the schedule."
echo "   Check logs/maintenance.log for execution results."