# Smart Locker Assignment Operational Runbook

## Overview

This operational runbook provides comprehensive procedures for monitoring, maintaining, and operating the Smart Locker Assignment system. It serves as the primary reference for operations teams responsible for day-to-day system management.

## Daily Operations

### Morning Health Check (Start of Shift)

#### System Status Verification
```bash
# Run comprehensive health check
bash scripts/health-check-smart-assignment.sh

# Check service status
systemctl status eform-gateway
systemctl status eform-kiosk  
systemctl status eform-panel

# Verify smart assignment is enabled
curl -s http://localhost:3000/api/admin/feature-flags | \
  jq '.feature_flags.smart_assignment_enabled'
```

#### Performance Metrics Review
```bash
# Check overnight performance
curl -s http://localhost:3000/api/admin/metrics/dashboard?time_range=24h | \
  jq '{
    assignment_success_rate: .metrics.assignment_success_rate,
    average_assignment_time_ms: .metrics.average_assignment_time_ms,
    no_stock_events: .metrics.no_stock_events,
    total_assignments: .metrics.total_assignments
  }'

# Review active alerts
curl -s http://localhost:3000/api/admin/alerts/active | \
  jq '{total_active: .total_active, by_severity: .by_severity}'
```

#### Hardware Connectivity Test
```bash
# Test basic hardware functionality
node scripts/test-basic-relay-control.js

# Check for hardware errors in logs
tail -100 logs/kiosk.log | grep -i "modbus\|hardware\|error"
```

### Hourly Monitoring Tasks

#### Automated Monitoring Script
```bash
#!/bin/bash
# scripts/hourly-monitoring.sh

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="logs/hourly-monitoring.log"

echo "[$TIMESTAMP] Starting hourly monitoring check" >> "$LOG_FILE"

# Check assignment success rate
SUCCESS_RATE=$(curl -s http://localhost:3000/api/admin/metrics/dashboard | \
  jq -r '.metrics.assignment_success_rate // 0')

if (( $(echo "$SUCCESS_RATE < 0.95" | bc -l) )); then
  echo "[$TIMESTAMP] ALERT: Assignment success rate below threshold: $SUCCESS_RATE" >> "$LOG_FILE"
  # Send notification (implement based on your notification system)
  echo "Low success rate: $SUCCESS_RATE" | mail -s "Smart Locker Alert" ops@facility.com
fi

# Check for new alerts
NEW_ALERTS=$(curl -s http://localhost:3000/api/admin/alerts/active | jq '.total_active')
if [ "$NEW_ALERTS" -gt 0 ]; then
  echo "[$TIMESTAMP] Active alerts detected: $NEW_ALERTS" >> "$LOG_FILE"
fi

# Check stock levels
STOCK_STATUS=$(curl -s http://localhost:3000/api/admin/metrics/dashboard | \
  jq '.stock_status.free_ratio')
if (( $(echo "$STOCK_STATUS < 0.2" | bc -l) )); then
  echo "[$TIMESTAMP] WARNING: Low stock level: $STOCK_STATUS" >> "$LOG_FILE"
fi

echo "[$TIMESTAMP] Hourly monitoring check completed" >> "$LOG_FILE"
```

### End of Shift Review

#### Performance Summary
```bash
# Generate shift performance report
cat > reports/shift-report-$(date +%Y%m%d-%H%M).txt << EOF
Smart Locker Assignment - Shift Report
Generated: $(date)

Performance Metrics (Last 8 hours):
$(curl -s http://localhost:3000/api/admin/metrics/dashboard?time_range=8h | \
  jq '{
    assignments_completed: .metrics.total_assignments,
    success_rate: .metrics.assignment_success_rate,
    average_time_ms: .metrics.average_assignment_time_ms,
    no_stock_events: .metrics.no_stock_events,
    hardware_errors: .metrics.hardware_error_count
  }')

Active Sessions:
$(curl -s http://localhost:3000/api/admin/sessions/live | \
  jq '{total_sessions: (.sessions | length), overdue_sessions: (.sessions | map(select(.status == "overdue")) | length)}')

Alerts Summary:
$(curl -s http://localhost:3000/api/admin/alerts/active | jq '.by_severity')

Issues Resolved:
- [List any issues handled during shift]

Notes for Next Shift:
- [Any important information for incoming team]
EOF
```

## Weekly Operations

### Monday: System Performance Review

#### Weekly Metrics Analysis
```bash
# Generate weekly performance report
node scripts/generate-weekly-report.js --output=reports/weekly-$(date +%Y%m%d).json

# Key metrics to review:
# - Assignment success rate trend
# - Average assignment time trend  
# - Hardware reliability metrics
# - User satisfaction indicators
# - Capacity utilization patterns
```

#### Configuration Optimization Review
```bash
# Analyze configuration effectiveness
node scripts/analyze-config-performance.js --period=week

# Review and adjust if needed:
# - Scoring algorithm parameters
# - Quarantine durations
# - Session limits
# - Reserve capacity settings
```

### Tuesday: Hardware Maintenance

#### Hardware Health Assessment
```bash
# Comprehensive hardware test
node scripts/test-all-hardware.js

# Check relay wear patterns
node scripts/analyze-relay-usage.js --period=week

# Test backup hardware (if available)
node scripts/test-backup-hardware.js
```

#### Preventive Maintenance
```bash
# Clean relay contacts (if accessible)
# Check cable connections
# Verify power supply stability
# Test UPS backup system (if installed)

# Document maintenance in log
echo "$(date): Weekly hardware maintenance completed" >> logs/maintenance.log
```

### Wednesday: Database Maintenance

#### Database Health Check
```bash
# Check database integrity
sqlite3 data/eform.db "PRAGMA integrity_check;"

# Analyze database performance
sqlite3 data/eform.db "PRAGMA optimize;"

# Check database size and growth
du -h data/eform.db
sqlite3 data/eform.db "SELECT COUNT(*) FROM smart_sessions;"
sqlite3 data/eform.db "SELECT COUNT(*) FROM assignment_metrics;"
```

#### Database Cleanup
```bash
# Clean old session records (older than 30 days)
sqlite3 data/eform.db "
DELETE FROM smart_sessions 
WHERE created_at < datetime('now', '-30 days');"

# Clean old metrics (older than 90 days)
sqlite3 data/eform.db "
DELETE FROM assignment_metrics 
WHERE created_at < datetime('now', '-90 days');"

# Vacuum database to reclaim space
sqlite3 data/eform.db "VACUUM;"
```

### Thursday: Configuration Review

#### Configuration Audit
```bash
# Review current configuration
curl -s http://localhost:3000/api/admin/config/global | \
  jq '.' > config-audit/global-$(date +%Y%m%d).json

# Check for kiosk-specific overrides
curl -s http://localhost:3000/api/admin/config/overrides | \
  jq '.' > config-audit/overrides-$(date +%Y%m%d).json

# Review configuration change history
curl -s http://localhost:3000/api/admin/config/history?limit=50 | \
  jq '.' > config-audit/history-$(date +%Y%m%d).json
```

#### Performance-Based Tuning
```bash
# Analyze performance metrics for tuning opportunities
node scripts/recommend-config-changes.js --period=week

# Example tuning based on analysis:
if [ "$(curl -s http://localhost:3000/api/admin/metrics/dashboard | jq '.metrics.average_assignment_time_ms')" -gt 400 ]; then
  echo "Consider reducing top_k_candidates or simplifying scoring"
fi
```

### Friday: Security and Backup Review

#### Security Audit
```bash
# Check for unauthorized configuration changes
grep -i "unauthorized\|failed.*auth" logs/*.log

# Review admin access logs
curl -s http://localhost:3000/api/admin/audit/access?days=7

# Verify service permissions
ls -la /etc/systemd/system/eform-*.service
```

#### Backup Verification
```bash
# Verify database backups
ls -la backups/eform-db-*.backup
sqlite3 backups/eform-db-latest.backup "PRAGMA integrity_check;"

# Test backup restoration (on test system)
cp backups/eform-db-latest.backup test/eform-test.db
sqlite3 test/eform-test.db "SELECT COUNT(*) FROM lockers;"
```

## Monthly Operations

### First Monday: Capacity Planning Review

#### Usage Pattern Analysis
```bash
# Generate monthly usage report
node scripts/generate-monthly-usage-report.js

# Analyze peak usage times
node scripts/analyze-peak-usage.js --month=$(date +%m)

# Review capacity utilization
node scripts/capacity-utilization-report.js --period=month
```

#### Capacity Recommendations
```bash
# Based on analysis, consider:
# - Adjusting session limits during peak hours
# - Modifying reserve capacity ratios
# - Planning for additional hardware if needed
# - Optimizing locker assignment algorithms
```

### Second Monday: Performance Optimization

#### Algorithm Performance Review
```bash
# Analyze scoring algorithm effectiveness
node scripts/analyze-scoring-effectiveness.js --period=month

# Review selection distribution
node scripts/analyze-locker-distribution.js --period=month

# Assess wear leveling performance
node scripts/analyze-wear-leveling.js --period=month
```

#### Optimization Implementation
```bash
# Implement recommended optimizations
# Example: Adjust scoring factors based on analysis
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {
      "score_factor_a": 2.2,
      "score_factor_b": 0.8,
      "selection_temperature": 1.3
    },
    "updated_by": "monthly_optimization"
  }'
```

### Third Monday: System Updates and Maintenance

#### Software Updates
```bash
# Check for system updates
npm audit --audit-level moderate

# Update dependencies (in staging first)
npm update --save

# Test updates in staging environment
npm run test:all

# Deploy to production if tests pass
git tag monthly-update-$(date +%Y%m)
```

#### System Maintenance
```bash
# Clean log files
find logs/ -name "*.log" -mtime +30 -delete

# Clean temporary files
find /tmp -name "eform-*" -mtime +7 -delete

# Update system packages (if applicable)
sudo apt update && sudo apt upgrade -y
```

### Fourth Monday: Documentation and Training Review

#### Documentation Updates
```bash
# Review and update operational procedures
# Update troubleshooting guides based on recent issues
# Refresh configuration documentation
# Update performance benchmarks
```

#### Training Assessment
```bash
# Review team knowledge and skills
# Plan training sessions for new features
# Update training materials
# Schedule refresher training if needed
```

## Alert Response Procedures

### Critical Alerts (Immediate Response Required)

#### No Stock Alert (Critical)
```bash
# Immediate actions:
# 1. Check actual locker availability
curl -s http://localhost:3000/api/admin/metrics/dashboard | jq '.stock_status'

# 2. Clear any stuck quarantines (if safe)
sqlite3 data/eform.db "
UPDATE lockers 
SET quarantine_until = NULL 
WHERE quarantine_until < datetime('now', '-1 hour');"

# 3. Reduce reserve capacity temporarily
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"reserve_ratio": 0.02}, "updated_by": "emergency_response"}'

# 4. Force clear overdue lockers if necessary
curl http://localhost:3000/api/admin/lockers/overdue
# Manually clear each overdue locker after verification
```

#### Hardware Failure Alert (Critical)
```bash
# Immediate actions:
# 1. Test hardware connectivity
node scripts/test-basic-relay-control.js

# 2. Check for hardware conflicts
sudo lsof /dev/ttyUSB0

# 3. Restart hardware service if needed
sudo systemctl restart eform-kiosk

# 4. Switch to manual mode if hardware issues persist
curl -X PUT http://localhost:3000/api/admin/feature-flags/smart_assignment_enabled \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "admin_user": "emergency_response"}'
```

### High Priority Alerts (Response within 30 minutes)

#### High Conflict Rate Alert
```bash
# Investigation steps:
# 1. Check concurrent usage patterns
curl -s http://localhost:3000/api/admin/metrics/dashboard | jq '.metrics.conflict_rate'

# 2. Review recent assignment logs
tail -100 logs/kiosk.log | grep -i "conflict\|retry"

# 3. Adjust rate limiting if needed
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"card_rate_limit_seconds": 15}, "updated_by": "conflict_mitigation"}'
```

#### High Retry Rate Alert
```bash
# Investigation steps:
# 1. Check hardware performance
node scripts/test-hardware-timing.js

# 2. Review retry patterns
tail -100 logs/kiosk.log | grep -i "retry\|sensorless"

# 3. Adjust retry parameters if needed
curl -X PUT http://localhost:3000/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{"updates": {"retry_backoff_ms": 800, "open_window_sec": 15}, "updated_by": "retry_optimization"}'
```

### Medium Priority Alerts (Response within 2 hours)

#### Performance Degradation Alert
```bash
# Investigation and response:
# 1. Analyze performance trends
node scripts/analyze-performance-degradation.js

# 2. Check system resources
top -p $(pgrep -f "node.*")
df -h

# 3. Optimize configuration if needed
# 4. Plan for system maintenance if required
```

## Maintenance Procedures

### Scheduled Maintenance Windows

#### Monthly Maintenance (First Sunday 2-4 AM)
```bash
# Maintenance checklist:
# 1. Stop services
sudo systemctl stop eform-gateway eform-kiosk eform-panel

# 2. Backup database
cp data/eform.db backups/eform-db-maintenance-$(date +%Y%m%d).backup

# 3. Database maintenance
sqlite3 data/eform.db "PRAGMA optimize; VACUUM;"

# 4. Clean logs
find logs/ -name "*.log" -mtime +7 -exec gzip {} \;

# 5. Update system
sudo apt update && sudo apt upgrade -y

# 6. Restart services
sudo systemctl start eform-gateway eform-kiosk eform-panel

# 7. Verify functionality
bash scripts/health-check-smart-assignment.sh
```

#### Quarterly Maintenance (First Sunday of Quarter 1-5 AM)
```bash
# Extended maintenance:
# 1. Full system backup
tar -czf backups/full-system-$(date +%Y%m%d).tar.gz \
  data/ config/ logs/ app/ shared/

# 2. Hardware deep cleaning (if accessible)
# 3. Performance benchmarking
node scripts/run-performance-benchmarks.js

# 4. Security audit
node scripts/security-audit.js

# 5. Documentation review and updates
# 6. Training material updates
```

### Emergency Maintenance Procedures

#### Service Recovery
```bash
# If services become unresponsive:
# 1. Check system resources
free -h
df -h
ps aux | grep node

# 2. Kill hung processes
sudo pkill -f "node.*"

# 3. Check for port conflicts
sudo netstat -tulpn | grep -E ":300[0-2]"

# 4. Restart services
./scripts/start-all-clean.sh

# 5. Verify recovery
bash scripts/health-check-smart-assignment.sh
```

#### Database Recovery
```bash
# If database corruption detected:
# 1. Stop all services
sudo systemctl stop eform-gateway eform-kiosk eform-panel

# 2. Backup corrupted database
cp data/eform.db data/eform-corrupted-$(date +%s).db

# 3. Attempt repair
sqlite3 data/eform.db "PRAGMA integrity_check;"
sqlite3 data/eform.db ".recover" | sqlite3 data/eform-recovered.db

# 4. Restore from backup if repair fails
cp backups/eform-db-latest.backup data/eform.db

# 5. Restart services and verify
sudo systemctl start eform-gateway eform-kiosk eform-panel
bash scripts/health-check-smart-assignment.sh
```

## Performance Monitoring

### Key Performance Indicators (KPIs)

#### System Performance Targets
- **Assignment Success Rate**: >95%
- **Average Assignment Time**: <500ms
- **Hardware Reliability**: >99%
- **System Uptime**: >99.5%
- **Database Response Time**: <100ms

#### User Experience Targets
- **No Stock Events**: <5 per day
- **Retry Rate**: <5%
- **Session Extension Rate**: <10%
- **User Complaints**: <1 per week

### Monitoring Dashboard Setup

#### Grafana Dashboard Configuration
```json
{
  "dashboard": {
    "title": "Smart Locker Assignment Operations",
    "panels": [
      {
        "title": "Assignment Success Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "assignment_success_rate",
            "legendFormat": "Success Rate"
          }
        ],
        "thresholds": [
          {"color": "red", "value": 0.90},
          {"color": "yellow", "value": 0.95},
          {"color": "green", "value": 0.98}
        ]
      },
      {
        "title": "Average Assignment Time",
        "type": "graph",
        "targets": [
          {
            "expr": "avg_assignment_time_ms",
            "legendFormat": "Assignment Time (ms)"
          }
        ]
      },
      {
        "title": "Stock Levels",
        "type": "graph",
        "targets": [
          {
            "expr": "available_lockers",
            "legendFormat": "Available"
          },
          {
            "expr": "occupied_lockers", 
            "legendFormat": "Occupied"
          }
        ]
      }
    ]
  }
}
```

### Automated Reporting

#### Daily Report Generation
```bash
#!/bin/bash
# scripts/generate-daily-report.sh

REPORT_DATE=$(date +%Y-%m-%d)
REPORT_FILE="reports/daily-report-$REPORT_DATE.html"

cat > "$REPORT_FILE" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Smart Locker Assignment Daily Report - $REPORT_DATE</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { background: #f5f5f5; padding: 10px; margin: 10px 0; }
        .good { color: green; }
        .warning { color: orange; }
        .critical { color: red; }
    </style>
</head>
<body>
    <h1>Smart Locker Assignment Daily Report</h1>
    <h2>Date: $REPORT_DATE</h2>
    
    <div class="metric">
        <h3>Performance Metrics</h3>
        <pre>$(curl -s http://localhost:3000/api/admin/metrics/dashboard?time_range=24h | jq '.')</pre>
    </div>
    
    <div class="metric">
        <h3>Active Alerts</h3>
        <pre>$(curl -s http://localhost:3000/api/admin/alerts/active | jq '.')</pre>
    </div>
    
    <div class="metric">
        <h3>System Health</h3>
        <pre>$(bash scripts/health-check-smart-assignment.sh)</pre>
    </div>
</body>
</html>
EOF

echo "Daily report generated: $REPORT_FILE"
```

## Contact Information and Escalation

### Primary Contacts
- **Operations Team Lead**: [Name] - [Phone] - [Email]
- **System Administrator**: [Name] - [Phone] - [Email]  
- **Hardware Technician**: [Name] - [Phone] - [Email]
- **Facility Manager**: [Name] - [Phone] - [Email]

### Escalation Matrix
1. **Level 1** (Operations Team): Handle routine monitoring and basic issues
2. **Level 2** (System Admin): Handle configuration changes and system issues
3. **Level 3** (Technical Lead): Handle complex technical problems
4. **Level 4** (Vendor Support): Handle hardware failures and critical system issues

### Emergency Contacts
- **24/7 Operations**: [Phone Number]
- **Emergency Technical Support**: [Phone Number]
- **Facility Emergency**: [Phone Number]

This operational runbook provides comprehensive guidance for the day-to-day operation, monitoring, and maintenance of the Smart Locker Assignment system, ensuring reliable and efficient operation.