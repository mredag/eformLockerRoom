#!/bin/bash

# Smart Locker Assignment System - Monitoring Setup
# Version: 1.0.0
# Description: Setup monitoring and alerting for smart assignment system

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$PROJECT_ROOT/logs/monitoring-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Create necessary directories
mkdir -p "$PROJECT_ROOT/logs"
mkdir -p "$PROJECT_ROOT/monitoring"
mkdir -p "$PROJECT_ROOT/monitoring/scripts"
mkdir -p "$PROJECT_ROOT/monitoring/config"

log "Setting up Smart Assignment System Monitoring"

# Step 1: Create health check script
log "Step 1: Creating health check scripts"

cat > "$PROJECT_ROOT/monitoring/scripts/health-check.sh" << 'EOF'
#!/bin/bash

# Smart Assignment System Health Check
# Checks all services and key metrics

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_FILE="$PROJECT_ROOT/logs/health-check.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_service() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-/health}
    
    if curl -s -f "http://localhost:$port$endpoint" > /dev/null 2>&1; then
        log "${GREEN}✓${NC} $service_name service (Port $port) - Running"
        return 0
    else
        log "${RED}✗${NC} $service_name service (Port $port) - Not responding"
        return 1
    fi
}

check_database() {
    if [ -f "$PROJECT_ROOT/data/eform.db" ]; then
        if sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT 1;" > /dev/null 2>&1; then
            log "${GREEN}✓${NC} Database - Accessible"
            
            # Check smart assignment tables
            local tables=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('settings_global', 'smart_sessions', 'assignment_metrics', 'alerts');" 2>/dev/null || echo "0")
            
            if [ "$tables" -eq 4 ]; then
                log "${GREEN}✓${NC} Smart assignment tables - Present"
            else
                log "${YELLOW}⚠${NC} Smart assignment tables - Missing ($tables/4 found)"
            fi
            
            return 0
        else
            log "${RED}✗${NC} Database - Not accessible"
            return 1
        fi
    else
        log "${RED}✗${NC} Database - File not found"
        return 1
    fi
}

check_configuration() {
    if [ -f "$PROJECT_ROOT/config/system.json" ]; then
        if python3 -m json.tool "$PROJECT_ROOT/config/system.json" > /dev/null 2>&1; then
            log "${GREEN}✓${NC} Configuration - Valid JSON"
            return 0
        else
            log "${RED}✗${NC} Configuration - Invalid JSON"
            return 1
        fi
    else
        log "${RED}✗${NC} Configuration - File not found"
        return 1
    fi
}

check_disk_space() {
    local usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt 80 ]; then
        log "${GREEN}✓${NC} Disk space - ${usage}% used"
        return 0
    elif [ "$usage" -lt 90 ]; then
        log "${YELLOW}⚠${NC} Disk space - ${usage}% used (Warning)"
        return 1
    else
        log "${RED}✗${NC} Disk space - ${usage}% used (Critical)"
        return 1
    fi
}

check_memory() {
    local mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [ "$mem_usage" -lt 80 ]; then
        log "${GREEN}✓${NC} Memory usage - ${mem_usage}%"
        return 0
    elif [ "$mem_usage" -lt 90 ]; then
        log "${YELLOW}⚠${NC} Memory usage - ${mem_usage}% (Warning)"
        return 1
    else
        log "${RED}✗${NC} Memory usage - ${mem_usage}% (Critical)"
        return 1
    fi
}

# Main health check
log "Starting health check..."

failed=0

check_service "Gateway" 3000 || ((failed++))
check_service "Kiosk" 3002 || ((failed++))
check_service "Panel" 3001 || ((failed++))

check_database || ((failed++))
check_configuration || ((failed++))
check_disk_space || ((failed++))
check_memory || ((failed++))

if [ $failed -eq 0 ]; then
    log "${GREEN}✓${NC} All health checks passed"
    exit 0
else
    log "${RED}✗${NC} $failed health checks failed"
    exit 1
fi
EOF

chmod +x "$PROJECT_ROOT/monitoring/scripts/health-check.sh"
success "Health check script created"

# Step 2: Create performance monitoring script
log "Step 2: Creating performance monitoring script"

cat > "$PROJECT_ROOT/monitoring/scripts/performance-monitor.sh" << 'EOF'
#!/bin/bash

# Smart Assignment System Performance Monitor
# Collects and logs performance metrics

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
METRICS_FILE="$PROJECT_ROOT/logs/performance-metrics.log"

collect_metrics() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # System metrics
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
    local mem_usage=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
    local disk_usage=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' | sed 's/%//')
    
    # Service metrics
    local gateway_pid=$(pgrep -f "node.*gateway" || echo "0")
    local kiosk_pid=$(pgrep -f "node.*kiosk" || echo "0")
    local panel_pid=$(pgrep -f "node.*panel" || echo "0")
    
    # Database metrics
    local db_size=$(du -k "$PROJECT_ROOT/data/eform.db" 2>/dev/null | cut -f1 || echo "0")
    
    # Smart assignment metrics (if available)
    local active_sessions=0
    local total_assignments=0
    
    if [ -f "$PROJECT_ROOT/data/eform.db" ]; then
        active_sessions=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM smart_sessions WHERE status='active';" 2>/dev/null || echo "0")
        total_assignments=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM assignment_metrics WHERE DATE(assignment_time) = DATE('now');" 2>/dev/null || echo "0")
    fi
    
    # Log metrics in JSON format
    echo "{\"timestamp\":\"$timestamp\",\"cpu_usage\":$cpu_usage,\"memory_usage\":$mem_usage,\"disk_usage\":$disk_usage,\"database_size_kb\":$db_size,\"active_sessions\":$active_sessions,\"daily_assignments\":$total_assignments,\"gateway_pid\":$gateway_pid,\"kiosk_pid\":$kiosk_pid,\"panel_pid\":$panel_pid}" >> "$METRICS_FILE"
}

# Collect metrics
collect_metrics

# Rotate log if it gets too large (keep last 1000 lines)
if [ -f "$METRICS_FILE" ] && [ $(wc -l < "$METRICS_FILE") -gt 1000 ]; then
    tail -n 1000 "$METRICS_FILE" > "$METRICS_FILE.tmp"
    mv "$METRICS_FILE.tmp" "$METRICS_FILE"
fi
EOF

chmod +x "$PROJECT_ROOT/monitoring/scripts/performance-monitor.sh"
success "Performance monitoring script created"

# Step 3: Create alert checking script
log "Step 3: Creating alert monitoring script"

cat > "$PROJECT_ROOT/monitoring/scripts/check-alerts.js" << 'EOF'
#!/usr/bin/env node

/**
 * Smart Assignment System Alert Monitor
 * Checks for system alerts and sends notifications
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(PROJECT_ROOT, 'data/eform.db');
const ALERT_LOG = path.join(PROJECT_ROOT, 'logs/alerts.log');

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${level}: ${message}\n`;
    
    console.log(logEntry.trim());
    
    try {
        fs.appendFileSync(ALERT_LOG, logEntry);
    } catch (error) {
        console.error('Failed to write to alert log:', error.message);
    }
}

function checkAlerts() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(new Error(`Database connection failed: ${err.message}`));
                return;
            }
            
            // Check for active alerts
            db.all("SELECT * FROM alerts WHERE cleared_at IS NULL ORDER BY triggered_at DESC", (err, alerts) => {
                if (err) {
                    db.close();
                    reject(new Error(`Failed to query alerts: ${err.message}`));
                    return;
                }
                
                if (alerts.length === 0) {
                    log('No active alerts');
                } else {
                    log(`Found ${alerts.length} active alerts`);
                    
                    alerts.forEach(alert => {
                        const age = Math.round((Date.now() - new Date(alert.triggered_at).getTime()) / 60000);
                        log(`ALERT: ${alert.type} (${alert.severity}) - ${alert.message} [Age: ${age}min]`, 'ALERT');
                    });
                }
                
                // Check for alerts that should auto-clear
                db.all("SELECT * FROM alerts WHERE cleared_at IS NULL AND auto_clear_condition IS NOT NULL", (err, autoClearAlerts) => {
                    if (err) {
                        log(`Failed to check auto-clear alerts: ${err.message}`, 'ERROR');
                    } else if (autoClearAlerts.length > 0) {
                        log(`${autoClearAlerts.length} alerts eligible for auto-clear check`);
                    }
                    
                    db.close();
                    resolve(alerts);
                });
            });
        });
    });
}

function checkSystemHealth() {
    const checks = [];
    
    // Check service health
    const services = [
        { name: 'Gateway', port: 3000 },
        { name: 'Kiosk', port: 3002 },
        { name: 'Panel', port: 3001 }
    ];
    
    services.forEach(service => {
        const http = require('http');
        const options = {
            hostname: 'localhost',
            port: service.port,
            path: '/health',
            method: 'GET',
            timeout: 5000
        };
        
        const req = http.request(options, (res) => {
            if (res.statusCode !== 200) {
                log(`Service ${service.name} health check failed: HTTP ${res.statusCode}`, 'WARNING');
            }
        });
        
        req.on('error', (err) => {
            log(`Service ${service.name} not responding: ${err.message}`, 'ERROR');
        });
        
        req.on('timeout', () => {
            log(`Service ${service.name} health check timed out`, 'WARNING');
        });
        
        req.end();
    });
    
    // Check disk space
    const { execSync } = require('child_process');
    try {
        const diskUsage = execSync(`df "${PROJECT_ROOT}" | awk 'NR==2 {print $5}' | sed 's/%//'`, { encoding: 'utf8' }).trim();
        const usage = parseInt(diskUsage);
        
        if (usage > 90) {
            log(`Disk usage critical: ${usage}%`, 'ERROR');
        } else if (usage > 80) {
            log(`Disk usage warning: ${usage}%`, 'WARNING');
        }
    } catch (error) {
        log(`Failed to check disk usage: ${error.message}`, 'ERROR');
    }
}

async function main() {
    try {
        log('Starting alert monitoring check');
        
        await checkAlerts();
        checkSystemHealth();
        
        log('Alert monitoring check completed');
    } catch (error) {
        log(`Alert monitoring failed: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
EOF

chmod +x "$PROJECT_ROOT/monitoring/scripts/check-alerts.js"
success "Alert monitoring script created"

# Step 4: Create monitoring configuration
log "Step 4: Creating monitoring configuration"

cat > "$PROJECT_ROOT/monitoring/config/monitoring.json" << 'EOF'
{
  "health_check": {
    "interval_minutes": 5,
    "enabled": true,
    "alert_on_failure": true,
    "max_failures": 3
  },
  "performance_monitoring": {
    "interval_minutes": 1,
    "enabled": true,
    "metrics_retention_hours": 168,
    "thresholds": {
      "cpu_usage_warning": 80,
      "cpu_usage_critical": 95,
      "memory_usage_warning": 80,
      "memory_usage_critical": 95,
      "disk_usage_warning": 80,
      "disk_usage_critical": 90
    }
  },
  "alert_monitoring": {
    "interval_minutes": 2,
    "enabled": true,
    "notification_methods": ["log", "console"],
    "escalation_minutes": 30
  },
  "log_rotation": {
    "enabled": true,
    "max_size_mb": 10,
    "keep_files": 5
  }
}
EOF

success "Monitoring configuration created"

# Step 5: Create systemd service files (for Linux systems)
log "Step 5: Creating systemd service files"

if command -v systemctl &> /dev/null; then
    # Health check service
    cat > "$PROJECT_ROOT/monitoring/config/smart-assignment-health.service" << EOF
[Unit]
Description=Smart Assignment Health Check
After=network.target

[Service]
Type=oneshot
User=pi
WorkingDirectory=$PROJECT_ROOT
ExecStart=$PROJECT_ROOT/monitoring/scripts/health-check.sh
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Health check timer
    cat > "$PROJECT_ROOT/monitoring/config/smart-assignment-health.timer" << 'EOF'
[Unit]
Description=Run Smart Assignment Health Check every 5 minutes
Requires=smart-assignment-health.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # Performance monitoring service
    cat > "$PROJECT_ROOT/monitoring/config/smart-assignment-performance.service" << EOF
[Unit]
Description=Smart Assignment Performance Monitor
After=network.target

[Service]
Type=oneshot
User=pi
WorkingDirectory=$PROJECT_ROOT
ExecStart=$PROJECT_ROOT/monitoring/scripts/performance-monitor.sh
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Performance monitoring timer
    cat > "$PROJECT_ROOT/monitoring/config/smart-assignment-performance.timer" << 'EOF'
[Unit]
Description=Run Smart Assignment Performance Monitor every minute
Requires=smart-assignment-performance.service

[Timer]
OnCalendar=*:*:0
Persistent=true

[Install]
WantedBy=timers.target
EOF

    success "Systemd service files created"
    
    log "To install systemd services, run:"
    log "sudo cp $PROJECT_ROOT/monitoring/config/*.service /etc/systemd/system/"
    log "sudo cp $PROJECT_ROOT/monitoring/config/*.timer /etc/systemd/system/"
    log "sudo systemctl daemon-reload"
    log "sudo systemctl enable smart-assignment-health.timer"
    log "sudo systemctl enable smart-assignment-performance.timer"
    log "sudo systemctl start smart-assignment-health.timer"
    log "sudo systemctl start smart-assignment-performance.timer"
else
    warning "systemctl not found - systemd services not created"
fi

# Step 6: Create cron jobs (alternative to systemd)
log "Step 6: Creating cron job examples"

cat > "$PROJECT_ROOT/monitoring/config/crontab-example" << EOF
# Smart Assignment System Monitoring Cron Jobs
# Add these to your crontab with: crontab -e

# Health check every 5 minutes
*/5 * * * * $PROJECT_ROOT/monitoring/scripts/health-check.sh

# Performance monitoring every minute
* * * * * $PROJECT_ROOT/monitoring/scripts/performance-monitor.sh

# Alert checking every 2 minutes
*/2 * * * * node $PROJECT_ROOT/monitoring/scripts/check-alerts.js

# Log rotation daily at 2 AM
0 2 * * * find $PROJECT_ROOT/logs -name "*.log" -size +10M -exec logrotate {} \;
EOF

success "Cron job examples created"

# Step 7: Create monitoring dashboard script
log "Step 7: Creating monitoring dashboard"

cat > "$PROJECT_ROOT/monitoring/scripts/dashboard.sh" << 'EOF'
#!/bin/bash

# Smart Assignment System Monitoring Dashboard
# Real-time system status display

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear_screen() {
    clear
    echo -e "${CYAN}Smart Assignment System - Monitoring Dashboard${NC}"
    echo -e "${CYAN}===============================================${NC}"
    echo ""
}

show_services() {
    echo -e "${BLUE}Services Status:${NC}"
    
    for service in "Gateway:3000" "Kiosk:3002" "Panel:3001"; do
        name=$(echo $service | cut -d: -f1)
        port=$(echo $service | cut -d: -f2)
        
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $name (Port $port)"
        else
            echo -e "  ${RED}✗${NC} $name (Port $port)"
        fi
    done
    echo ""
}

show_system_metrics() {
    echo -e "${BLUE}System Metrics:${NC}"
    
    # CPU Usage
    local cpu=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' || echo "N/A")
    echo -e "  CPU Usage: $cpu"
    
    # Memory Usage
    local mem=$(free | awk 'NR==2{printf "%.1f%%", $3*100/$2}' || echo "N/A")
    echo -e "  Memory Usage: $mem"
    
    # Disk Usage
    local disk=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $5}' || echo "N/A")
    echo -e "  Disk Usage: $disk"
    
    echo ""
}

show_smart_assignment() {
    echo -e "${BLUE}Smart Assignment:${NC}"
    
    if [ -f "$PROJECT_ROOT/data/eform.db" ]; then
        local enabled=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT value FROM settings_global WHERE key='smart_assignment_enabled';" 2>/dev/null || echo "unknown")
        local sessions=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM smart_sessions WHERE status='active';" 2>/dev/null || echo "0")
        local assignments=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM assignment_metrics WHERE DATE(assignment_time) = DATE('now');" 2>/dev/null || echo "0")
        
        echo -e "  Feature Enabled: $enabled"
        echo -e "  Active Sessions: $sessions"
        echo -e "  Today's Assignments: $assignments"
    else
        echo -e "  ${RED}Database not accessible${NC}"
    fi
    
    echo ""
}

show_alerts() {
    echo -e "${BLUE}Active Alerts:${NC}"
    
    if [ -f "$PROJECT_ROOT/data/eform.db" ]; then
        local alert_count=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM alerts WHERE cleared_at IS NULL;" 2>/dev/null || echo "0")
        
        if [ "$alert_count" -eq 0 ]; then
            echo -e "  ${GREEN}No active alerts${NC}"
        else
            echo -e "  ${YELLOW}$alert_count active alerts${NC}"
            
            # Show recent alerts
            sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT type, severity, message FROM alerts WHERE cleared_at IS NULL ORDER BY triggered_at DESC LIMIT 3;" 2>/dev/null | while read -r line; do
                echo -e "    ${YELLOW}•${NC} $line"
            done
        fi
    else
        echo -e "  ${RED}Cannot check alerts - database not accessible${NC}"
    fi
    
    echo ""
}

show_recent_logs() {
    echo -e "${BLUE}Recent Log Entries:${NC}"
    
    if [ -f "$PROJECT_ROOT/logs/kiosk.log" ]; then
        tail -n 3 "$PROJECT_ROOT/logs/kiosk.log" | while read -r line; do
            echo -e "  ${CYAN}•${NC} $line"
        done
    else
        echo -e "  ${YELLOW}No recent log entries${NC}"
    fi
    
    echo ""
}

# Main dashboard loop
while true; do
    clear_screen
    show_services
    show_system_metrics
    show_smart_assignment
    show_alerts
    show_recent_logs
    
    echo -e "${CYAN}Press Ctrl+C to exit | Refreshing every 10 seconds...${NC}"
    sleep 10
done
EOF

chmod +x "$PROJECT_ROOT/monitoring/scripts/dashboard.sh"
success "Monitoring dashboard created"

# Step 8: Create installation script
log "Step 8: Creating monitoring installation script"

cat > "$PROJECT_ROOT/monitoring/install-monitoring.sh" << 'EOF'
#!/bin/bash

# Install Smart Assignment System Monitoring
# Run this script to set up automated monitoring

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Installing Smart Assignment System Monitoring..."

# Make scripts executable
chmod +x "$SCRIPT_DIR/scripts/"*.sh
chmod +x "$SCRIPT_DIR/scripts/"*.js

# Create log directory
mkdir -p "$PROJECT_ROOT/logs"

# Install systemd services (if available)
if command -v systemctl &> /dev/null && [ "$EUID" -eq 0 ]; then
    echo "Installing systemd services..."
    
    cp "$SCRIPT_DIR/config/"*.service /etc/systemd/system/
    cp "$SCRIPT_DIR/config/"*.timer /etc/systemd/system/
    
    systemctl daemon-reload
    systemctl enable smart-assignment-health.timer
    systemctl enable smart-assignment-performance.timer
    systemctl start smart-assignment-health.timer
    systemctl start smart-assignment-performance.timer
    
    echo "Systemd services installed and started"
else
    echo "Systemd not available or not running as root"
    echo "Add cron jobs manually from: $SCRIPT_DIR/config/crontab-example"
fi

# Run initial health check
echo "Running initial health check..."
"$SCRIPT_DIR/scripts/health-check.sh"

echo "Monitoring installation completed!"
echo ""
echo "Available commands:"
echo "  Health Check: $SCRIPT_DIR/scripts/health-check.sh"
echo "  Performance Monitor: $SCRIPT_DIR/scripts/performance-monitor.sh"
echo "  Alert Check: node $SCRIPT_DIR/scripts/check-alerts.js"
echo "  Dashboard: $SCRIPT_DIR/scripts/dashboard.sh"
EOF

chmod +x "$PROJECT_ROOT/monitoring/install-monitoring.sh"
success "Monitoring installation script created"

# Final summary
log "Monitoring setup completed successfully!"
log ""
log "Created monitoring components:"
log "  - Health check script: monitoring/scripts/health-check.sh"
log "  - Performance monitor: monitoring/scripts/performance-monitor.sh"
log "  - Alert checker: monitoring/scripts/check-alerts.js"
log "  - Monitoring dashboard: monitoring/scripts/dashboard.sh"
log "  - Installation script: monitoring/install-monitoring.sh"
log ""
log "To install monitoring:"
log "  cd $PROJECT_ROOT && ./monitoring/install-monitoring.sh"
log ""
log "To view dashboard:"
log "  ./monitoring/scripts/dashboard.sh"

exit 0