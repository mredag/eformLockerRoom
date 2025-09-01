#!/bin/bash

# Deployment Validation Script
# Validates that the kiosk UI deployment is working correctly

set -e

# Configuration
VALIDATION_LOG="/home/pi/logs/deployment-validation.log"
KIOSK_URL="http://localhost:3002"
TIMEOUT=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$VALIDATION_LOG"
}

# Status functions
test_pass() {
    echo -e "${GREEN}✅ PASS: $1${NC}"
    log "PASS: $1"
}

test_fail() {
    echo -e "${RED}❌ FAIL: $1${NC}"
    log "FAIL: $1"
    return 1
}

test_warn() {
    echo -e "${YELLOW}⚠️  WARN: $1${NC}"
    log "WARN: $1"
}

test_info() {
    echo -e "${BLUE}ℹ️  INFO: $1${NC}"
    log "INFO: $1"
}

# Validation tests
validate_service_status() {
    echo "🔍 Validating service status..."
    
    if systemctl is-active --quiet kiosk-ui.service; then
        test_pass "Kiosk service is running"
        
        # Check if service is enabled
        if systemctl is-enabled --quiet kiosk-ui.service; then
            test_pass "Kiosk service is enabled for auto-start"
        else
            test_warn "Kiosk service not enabled for auto-start"
        fi
    else
        test_fail "Kiosk service is not running"
        return 1
    fi
}

validate_api_endpoints() {
    echo "🌐 Validating API endpoints..."
    
    # Test health endpoint
    if timeout $TIMEOUT curl -f "$KIOSK_URL/health" > /dev/null 2>&1; then
        test_pass "Health endpoint responding"
    else
        test_fail "Health endpoint not responding"
        return 1
    fi
    
    # Test main UI endpoint
    if timeout $TIMEOUT curl -f "$KIOSK_URL/" > /dev/null 2>&1; then
        test_pass "Main UI endpoint responding"
    else
        test_fail "Main UI endpoint not responding"
        return 1
    fi
    
    # Measure response time
    RESPONSE_TIME=$(curl -s -w "%{time_total}" "$KIOSK_URL/health" -o /dev/null | awk '{print $1*1000}')
    if (( $(echo "$RESPONSE_TIME < 1000" | bc -l) )); then
        test_pass "API response time acceptable: ${RESPONSE_TIME}ms"
    else
        test_warn "API response time slow: ${RESPONSE_TIME}ms"
    fi
}

validate_ui_files() {
    echo "📁 Validating UI files..."
    
    # Check if optimized files exist
    if [ -f "app/kiosk/src/ui/static/app-simple.js" ]; then
        test_pass "Optimized JavaScript file exists"
    else
        test_fail "Optimized JavaScript file missing"
        return 1
    fi
    
    if [ -f "app/kiosk/src/ui/static/styles-simple.css" ]; then
        test_pass "Optimized CSS file exists"
    else
        test_fail "Optimized CSS file missing"
        return 1
    fi
    
    if [ -f "app/kiosk/src/ui/index.html" ]; then
        test_pass "Main HTML file exists"
    else
        test_fail "Main HTML file missing"
        return 1
    fi
    
    # Check file sizes (should be optimized/small)
    JS_SIZE=$(stat -c%s "app/kiosk/src/ui/static/app-simple.js" 2>/dev/null || echo 0)
    CSS_SIZE=$(stat -c%s "app/kiosk/src/ui/static/styles-simple.css" 2>/dev/null || echo 0)
    
    if [ "$JS_SIZE" -gt 0 ] && [ "$JS_SIZE" -lt 100000 ]; then
        test_pass "JavaScript file size optimized: $((JS_SIZE/1024))KB"
    else
        test_warn "JavaScript file size may not be optimized: $((JS_SIZE/1024))KB"
    fi
    
    if [ "$CSS_SIZE" -gt 0 ] && [ "$CSS_SIZE" -lt 50000 ]; then
        test_pass "CSS file size optimized: $((CSS_SIZE/1024))KB"
    else
        test_warn "CSS file size may not be optimized: $((CSS_SIZE/1024))KB"
    fi
}

validate_configuration() {
    echo "⚙️  Validating configuration..."
    
    # Check main config file
    if [ -f "/etc/kiosk-config.json" ]; then
        if jq . /etc/kiosk-config.json > /dev/null 2>&1; then
            test_pass "Configuration file valid JSON"
            
            # Check Pi model configuration
            PI_MODEL=$(jq -r '.performance.maxMemoryUsage // "unknown"' /etc/kiosk-config.json)
            test_info "Memory limit configured: $PI_MODEL"
        else
            test_fail "Configuration file invalid JSON"
            return 1
        fi
    else
        test_warn "Configuration file missing, using defaults"
    fi
    
    # Check environment variables
    if [ -n "$KIOSK_PI_MODEL" ]; then
        test_pass "Pi model environment variable set: $KIOSK_PI_MODEL"
    else
        test_warn "Pi model environment variable not set"
    fi
}

validate_system_resources() {
    echo "💻 Validating system resources..."
    
    # Check CPU usage
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$CPU_USAGE < 50" | bc -l) )); then
        test_pass "CPU usage acceptable: ${CPU_USAGE}%"
    else
        test_warn "High CPU usage: ${CPU_USAGE}%"
    fi
    
    # Check memory usage
    MEMORY_PERCENT=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
    MEMORY_MB=$(free -m | awk 'NR==2{printf "%.0f", $3}')
    
    # Determine acceptable memory based on Pi model
    MEMORY_LIMIT=200
    if [ "$KIOSK_PI_MODEL" = "pi4" ]; then
        MEMORY_LIMIT=400
    elif [ "$KIOSK_PI_MODEL" = "pi3" ]; then
        MEMORY_LIMIT=150
    fi
    
    if (( $(echo "$MEMORY_MB < $MEMORY_LIMIT" | bc -l) )); then
        test_pass "Memory usage acceptable: ${MEMORY_MB}MB (${MEMORY_PERCENT}%)"
    else
        test_warn "High memory usage: ${MEMORY_MB}MB (${MEMORY_PERCENT}%)"
    fi
    
    # Check disk space
    DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | cut -d'%' -f1)
    if [ "$DISK_USAGE" -lt 80 ]; then
        test_pass "Disk usage acceptable: ${DISK_USAGE}%"
    else
        test_warn "High disk usage: ${DISK_USAGE}%"
    fi
}

validate_hardware_communication() {
    echo "🔧 Validating hardware communication..."
    
    # Check serial port
    if [ -e "/dev/ttyUSB0" ]; then
        test_pass "Serial port available: /dev/ttyUSB0"
        
        # Check permissions
        if [ -r "/dev/ttyUSB0" ] && [ -w "/dev/ttyUSB0" ]; then
            test_pass "Serial port permissions OK"
        else
            test_warn "Serial port permission issues"
        fi
    else
        test_warn "Serial port not found (hardware may not be connected)"
    fi
    
    # Test basic hardware communication (if available)
    if [ -f "scripts/test-hardware-simple.js" ]; then
        if timeout 10 node scripts/test-hardware-simple.js > /dev/null 2>&1; then
            test_pass "Basic hardware communication test passed"
        else
            test_warn "Hardware communication test failed (may be expected if hardware not connected)"
        fi
    fi
}

validate_performance() {
    echo "⚡ Validating performance..."
    
    # Test multiple API calls to check consistency
    TOTAL_TIME=0
    CALL_COUNT=5
    
    for i in $(seq 1 $CALL_COUNT); do
        RESPONSE_TIME=$(curl -s -w "%{time_total}" "$KIOSK_URL/health" -o /dev/null)
        TOTAL_TIME=$(echo "$TOTAL_TIME + $RESPONSE_TIME" | bc -l)
    done
    
    AVG_TIME=$(echo "scale=0; ($TOTAL_TIME / $CALL_COUNT) * 1000" | bc -l)
    
    if (( $(echo "$AVG_TIME < 500" | bc -l) )); then
        test_pass "Average response time excellent: ${AVG_TIME}ms"
    elif (( $(echo "$AVG_TIME < 1000" | bc -l) )); then
        test_pass "Average response time good: ${AVG_TIME}ms"
    else
        test_warn "Average response time slow: ${AVG_TIME}ms"
    fi
}

validate_logs() {
    echo "📋 Validating logs..."
    
    # Check if log files exist
    if [ -f "/home/pi/logs/kiosk.log" ]; then
        test_pass "Kiosk log file exists"
        
        # Check for recent activity
        RECENT_LOGS=$(tail -10 /home/pi/logs/kiosk.log | wc -l)
        if [ "$RECENT_LOGS" -gt 0 ]; then
            test_pass "Recent log activity detected"
        else
            test_warn "No recent log activity"
        fi
        
        # Check for errors in recent logs
        ERROR_COUNT=$(tail -100 /home/pi/logs/kiosk.log | grep -c "ERROR" || echo 0)
        if [ "$ERROR_COUNT" -eq 0 ]; then
            test_pass "No recent errors in logs"
        else
            test_warn "Recent errors found in logs: $ERROR_COUNT"
        fi
    else
        test_warn "Kiosk log file not found"
    fi
}

validate_backup_system() {
    echo "💾 Validating backup system..."
    
    # Check if backup directory exists
    if [ -d "/home/pi/backups/kiosk-ui" ]; then
        test_pass "Backup directory exists"
        
        # Check for recent backups
        BACKUP_COUNT=$(ls /home/pi/backups/kiosk-ui/ | grep "ui_backup_" | wc -l)
        if [ "$BACKUP_COUNT" -gt 0 ]; then
            test_pass "Backup files found: $BACKUP_COUNT"
            
            # Check latest backup age
            LATEST_BACKUP=$(ls -t /home/pi/backups/kiosk-ui/ | grep "ui_backup_" | head -n1)
            if [ -n "$LATEST_BACKUP" ]; then
                BACKUP_AGE=$(find "/home/pi/backups/kiosk-ui/$LATEST_BACKUP" -mtime -7 | wc -l)
                if [ "$BACKUP_AGE" -gt 0 ]; then
                    test_pass "Recent backup available (< 7 days old)"
                else
                    test_warn "Latest backup is older than 7 days"
                fi
            fi
        else
            test_warn "No backup files found"
        fi
    else
        test_warn "Backup directory not found"
    fi
}

# Generate validation report
generate_report() {
    echo ""
    echo "📊 Deployment Validation Report"
    echo "==============================="
    
    # Count results from log
    PASS_COUNT=$(grep -c "PASS:" "$VALIDATION_LOG" || echo 0)
    FAIL_COUNT=$(grep -c "FAIL:" "$VALIDATION_LOG" || echo 0)
    WARN_COUNT=$(grep -c "WARN:" "$VALIDATION_LOG" || echo 0)
    
    echo "✅ Passed: $PASS_COUNT"
    echo "❌ Failed: $FAIL_COUNT"
    echo "⚠️  Warnings: $WARN_COUNT"
    
    if [ "$FAIL_COUNT" -gt 0 ]; then
        echo ""
        echo "🚨 Critical Issues (Deployment Failed):"
        grep "FAIL:" "$VALIDATION_LOG"
        echo ""
        echo "❌ DEPLOYMENT VALIDATION FAILED"
        return 1
    elif [ "$WARN_COUNT" -gt 0 ]; then
        echo ""
        echo "⚠️  Warnings (Review Recommended):"
        grep "WARN:" "$VALIDATION_LOG"
        echo ""
        echo "⚠️  DEPLOYMENT VALIDATION PASSED WITH WARNINGS"
        return 2
    else
        echo ""
        echo "🎉 ALL VALIDATION TESTS PASSED"
        echo "✅ DEPLOYMENT VALIDATION SUCCESSFUL"
        return 0
    fi
}

# Main validation function
main() {
    echo "🔍 Kiosk UI Deployment Validation - $(date)"
    echo "============================================="
    
    # Create log directory
    mkdir -p "/home/pi/logs"
    
    # Clear previous validation log
    echo "=== Deployment Validation Started $(date) ===" > "$VALIDATION_LOG"
    
    # Run all validation tests
    validate_service_status || true
    validate_api_endpoints || true
    validate_ui_files || true
    validate_configuration || true
    validate_system_resources || true
    validate_hardware_communication || true
    validate_performance || true
    validate_logs || true
    validate_backup_system || true
    
    # Generate report
    generate_report
    VALIDATION_STATUS=$?
    
    echo "=== Deployment Validation Completed $(date) ===" >> "$VALIDATION_LOG"
    
    # Provide next steps based on results
    echo ""
    echo "📋 Next Steps:"
    if [ "$VALIDATION_STATUS" -eq 0 ]; then
        echo "✅ Deployment is ready for production use"
        echo "🌐 Access kiosk at: http://$(hostname -I | awk '{print $1}'):3002"
        echo "📊 Monitor with: ./scripts/health-check-kiosk.sh"
    elif [ "$VALIDATION_STATUS" -eq 2 ]; then
        echo "⚠️  Review warnings and consider fixes"
        echo "🔧 Run diagnostics: ./scripts/health-check-kiosk.sh"
        echo "📋 Check logs: tail -f /home/pi/logs/kiosk.log"
    else
        echo "❌ Fix critical issues before production use"
        echo "🔄 Consider rollback: ./scripts/rollback-kiosk.sh latest"
        echo "🆘 Emergency recovery: ./scripts/emergency-recovery.sh"
    fi
    
    return $VALIDATION_STATUS
}

# Handle command line arguments
case "${1:-full}" in
    "full")
        main
        ;;
    "quick")
        validate_service_status
        validate_api_endpoints
        validate_system_resources
        ;;
    "service")
        validate_service_status
        ;;
    "api")
        validate_api_endpoints
        ;;
    "files")
        validate_ui_files
        ;;
    "config")
        validate_configuration
        ;;
    "performance")
        validate_performance
        ;;
    *)
        echo "Usage: $0 [full|quick|service|api|files|config|performance]"
        echo "  full        - Run all validation tests (default)"
        echo "  quick       - Run essential tests only"
        echo "  service     - Validate service status only"
        echo "  api         - Validate API endpoints only"
        echo "  files       - Validate UI files only"
        echo "  config      - Validate configuration only"
        echo "  performance - Validate performance only"
        exit 1
        ;;
esac