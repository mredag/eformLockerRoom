#!/bin/bash

# Smart Locker Assignment System - Deployment Verification
# Version: 1.0.0
# Description: Comprehensive verification of deployment success

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$PROJECT_ROOT/logs/deployment-verification.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

test_pass() {
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
    success "✓ $1"
}

test_fail() {
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
    error "✗ $1"
}

test_warn() {
    ((TESTS_TOTAL++))
    warning "⚠ $1"
}

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

log "Starting Smart Assignment System Deployment Verification"
log "Project Root: $PROJECT_ROOT"

# Test 1: Service Health Checks
log "Test 1: Service Health Checks"

check_service() {
    local service_name=$1
    local port=$2
    local timeout=${3:-10}
    
    if timeout $timeout curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
        test_pass "$service_name service responding on port $port"
        return 0
    else
        test_fail "$service_name service not responding on port $port"
        return 1
    fi
}

check_service "Gateway" 3000
check_service "Kiosk" 3002  
check_service "Panel" 3001

# Test 2: Database Schema Verification
log "Test 2: Database Schema Verification"

if [ -f "$PROJECT_ROOT/data/eform.db" ]; then
    test_pass "Database file exists"
    
    # Check database accessibility
    if sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT 1;" > /dev/null 2>&1; then
        test_pass "Database is accessible"
        
        # Check smart assignment tables
        REQUIRED_TABLES=("settings_global" "settings_kiosk" "config_version" "config_history" "smart_sessions" "assignment_metrics" "alerts")
        
        for table in "${REQUIRED_TABLES[@]}"; do
            if sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | grep -q "$table"; then
                test_pass "Table '$table' exists"
            else
                test_fail "Table '$table' missing"
            fi
        done
        
        # Check lockers table has smart assignment columns
        SMART_COLUMNS=("free_since" "recent_owner" "quarantine_until" "wear_count" "overdue_from" "suspected_occupied" "return_hold_until" "owner_hot_until")
        
        for column in "${SMART_COLUMNS[@]}"; do
            if sqlite3 "$PROJECT_ROOT/data/eform.db" "PRAGMA table_info(lockers);" | grep -q "$column"; then
                test_pass "Lockers table has column '$column'"
            else
                test_fail "Lockers table missing column '$column'"
            fi
        done
        
        # Check configuration seeding
        CONFIG_COUNT=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM settings_global;" 2>/dev/null || echo "0")
        if [ "$CONFIG_COUNT" -ge 20 ]; then
            test_pass "Configuration seeded ($CONFIG_COUNT entries)"
        else
            test_fail "Configuration incomplete ($CONFIG_COUNT entries)"
        fi
        
        # Check feature flag default
        FEATURE_FLAG=$(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT value FROM settings_global WHERE key='smart_assignment_enabled';" 2>/dev/null || echo "")
        if [ "$FEATURE_FLAG" = "false" ]; then
            test_pass "Smart assignment disabled by default (safe)"
        else
            test_warn "Smart assignment feature flag: '$FEATURE_FLAG'"
        fi
        
    else
        test_fail "Database not accessible"
    fi
else
    test_fail "Database file not found"
fi

# Test 3: Configuration Verification
log "Test 3: Configuration Verification"

if [ -f "$PROJECT_ROOT/config/system.json" ]; then
    test_pass "Configuration file exists"
    
    # Validate JSON syntax
    if python3 -m json.tool "$PROJECT_ROOT/config/system.json" > /dev/null 2>&1; then
        test_pass "Configuration is valid JSON"
        
        # Check required sections
        REQUIRED_SECTIONS=("lockers" "hardware" "rate_limits")
        for section in "${REQUIRED_SECTIONS[@]}"; do
            if grep -q "\"$section\"" "$PROJECT_ROOT/config/system.json"; then
                test_pass "Configuration has '$section' section"
            else
                test_fail "Configuration missing '$section' section"
            fi
        done
        
        # Check smart assignment section
        if grep -q "\"smart_assignment\"" "$PROJECT_ROOT/config/system.json"; then
            test_pass "Configuration has smart_assignment section"
        else
            test_warn "Configuration missing smart_assignment section"
        fi
        
    else
        test_fail "Configuration has invalid JSON syntax"
    fi
else
    test_fail "Configuration file not found"
fi

# Test 4: API Endpoint Testing
log "Test 4: API Endpoint Testing"

test_api_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local expected_status=${4:-200}
    
    local response=$(curl -s -w "%{http_code}" -X "$method" "$url" -o /dev/null 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        test_pass "API endpoint $name ($method $url) returns $expected_status"
    else
        test_fail "API endpoint $name ($method $url) returns $response, expected $expected_status"
    fi
}

# Test basic health endpoints
test_api_endpoint "Gateway Health" "GET" "http://localhost:3000/health"
test_api_endpoint "Kiosk Health" "GET" "http://localhost:3002/health"

# Test RFID endpoint (should accept POST)
test_api_endpoint "RFID Handler" "POST" "http://localhost:3002/api/rfid/handle-card" "400"  # 400 expected without proper data

# Test admin endpoints (may require auth, so 401/403 is acceptable)
ADMIN_RESPONSE=$(curl -s -w "%{http_code}" -X "GET" "http://localhost:3001/health" -o /dev/null 2>/dev/null || echo "000")
if [[ "$ADMIN_RESPONSE" =~ ^(200|401|403)$ ]]; then
    test_pass "Panel service responding (status: $ADMIN_RESPONSE)"
else
    test_fail "Panel service not responding properly (status: $ADMIN_RESPONSE)"
fi

# Test 5: File Structure Verification
log "Test 5: File Structure Verification"

REQUIRED_FILES=(
    "package.json"
    "app/gateway/package.json"
    "app/kiosk/package.json"
    "app/panel/package.json"
    "shared/package.json"
    "config/system.json"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
        test_pass "Required file exists: $file"
    else
        test_fail "Required file missing: $file"
    fi
done

REQUIRED_DIRS=(
    "app/gateway/dist"
    "app/kiosk/dist"
    "app/panel/dist"
    "shared/dist"
    "logs"
    "data"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$PROJECT_ROOT/$dir" ]; then
        test_pass "Required directory exists: $dir"
    else
        test_fail "Required directory missing: $dir"
    fi
done

# Test 6: Process Verification
log "Test 6: Process Verification"

check_process() {
    local process_name=$1
    local pattern=$2
    
    if pgrep -f "$pattern" > /dev/null; then
        local pid=$(pgrep -f "$pattern")
        test_pass "$process_name process running (PID: $pid)"
    else
        test_fail "$process_name process not running"
    fi
}

check_process "Gateway" "node.*gateway"
check_process "Kiosk" "node.*kiosk"
check_process "Panel" "node.*panel"

# Test 7: Hardware Integration Test (if available)
log "Test 7: Hardware Integration Test"

if [ -c "/dev/ttyUSB0" ]; then
    test_pass "Serial port /dev/ttyUSB0 available"
    
    # Check port permissions
    if [ -r "/dev/ttyUSB0" ] && [ -w "/dev/ttyUSB0" ]; then
        test_pass "Serial port has read/write permissions"
    else
        test_warn "Serial port permissions may need adjustment"
    fi
else
    test_warn "Serial port /dev/ttyUSB0 not available (hardware may not be connected)"
fi

# Test 8: Log File Verification
log "Test 8: Log File Verification"

LOG_FILES=("gateway.log" "kiosk.log" "panel.log")

for logfile in "${LOG_FILES[@]}"; do
    if [ -f "$PROJECT_ROOT/logs/$logfile" ]; then
        test_pass "Log file exists: $logfile"
        
        # Check if log file has recent entries (within last hour)
        if find "$PROJECT_ROOT/logs/$logfile" -mmin -60 | grep -q .; then
            test_pass "Log file $logfile has recent entries"
        else
            test_warn "Log file $logfile has no recent entries"
        fi
    else
        test_warn "Log file missing: $logfile (may be created after first activity)"
    fi
done

# Test 9: Backup Verification
log "Test 9: Backup Verification"

DEPLOYMENT_SCRIPTS=(
    "scripts/deployment/smart-assignment-migration.sql"
    "scripts/deployment/smart-assignment-rollback.sql"
    "scripts/deployment/deploy-smart-assignment.sh"
    "scripts/deployment/rollback-smart-assignment.sh"
)

for script in "${DEPLOYMENT_SCRIPTS[@]}"; do
    if [ -f "$PROJECT_ROOT/$script" ]; then
        test_pass "Deployment script exists: $script"
    else
        test_fail "Deployment script missing: $script"
    fi
done

# Check if backup was created during deployment
if ls "$PROJECT_ROOT/backups/smart-assignment-"* 1> /dev/null 2>&1; then
    test_pass "Deployment backup found"
else
    test_warn "No deployment backup found"
fi

# Test 10: Performance Test
log "Test 10: Basic Performance Test"

# Test database query performance
DB_QUERY_START=$(date +%s%N)
sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM lockers;" > /dev/null 2>&1
DB_QUERY_END=$(date +%s%N)
DB_QUERY_TIME=$(( (DB_QUERY_END - DB_QUERY_START) / 1000000 ))  # Convert to milliseconds

if [ "$DB_QUERY_TIME" -lt 100 ]; then
    test_pass "Database query performance good (${DB_QUERY_TIME}ms)"
elif [ "$DB_QUERY_TIME" -lt 500 ]; then
    test_warn "Database query performance acceptable (${DB_QUERY_TIME}ms)"
else
    test_fail "Database query performance poor (${DB_QUERY_TIME}ms)"
fi

# Test API response time
API_START=$(date +%s%N)
curl -s "http://localhost:3000/health" > /dev/null 2>&1
API_END=$(date +%s%N)
API_TIME=$(( (API_END - API_START) / 1000000 ))  # Convert to milliseconds

if [ "$API_TIME" -lt 200 ]; then
    test_pass "API response time good (${API_TIME}ms)"
elif [ "$API_TIME" -lt 1000 ]; then
    test_warn "API response time acceptable (${API_TIME}ms)"
else
    test_fail "API response time poor (${API_TIME}ms)"
fi

# Generate verification report
log "Generating verification report..."

REPORT_FILE="$PROJECT_ROOT/deployment-verification-report.txt"
cat > "$REPORT_FILE" << EOF
Smart Locker Assignment System - Deployment Verification Report
==============================================================

Verification Date: $(date)
Project Root: $PROJECT_ROOT

Test Results Summary:
- Total Tests: $TESTS_TOTAL
- Passed: $TESTS_PASSED
- Failed: $TESTS_FAILED
- Success Rate: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%

Service Status:
- Gateway (Port 3000): $(curl -s http://localhost:3000/health > /dev/null && echo "Running" || echo "Not responding")
- Kiosk (Port 3002): $(curl -s http://localhost:3002/health > /dev/null && echo "Running" || echo "Not responding")
- Panel (Port 3001): $(curl -s http://localhost:3001/health > /dev/null 2>&1 && echo "Running" || echo "Not responding")

Database Status:
- Smart Assignment Tables: $(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('settings_global', 'smart_sessions', 'assignment_metrics', 'alerts');" 2>/dev/null || echo "0")/4
- Configuration Entries: $(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT COUNT(*) FROM settings_global;" 2>/dev/null || echo "0")
- Feature Flag Status: $(sqlite3 "$PROJECT_ROOT/data/eform.db" "SELECT value FROM settings_global WHERE key='smart_assignment_enabled';" 2>/dev/null || echo "unknown")

Performance Metrics:
- Database Query Time: ${DB_QUERY_TIME}ms
- API Response Time: ${API_TIME}ms

Next Steps:
$(if [ $TESTS_FAILED -eq 0 ]; then
    echo "✓ All critical tests passed - deployment successful"
    echo "✓ System ready for smart assignment feature activation"
    echo "✓ Monitor system logs and performance"
else
    echo "✗ $TESTS_FAILED tests failed - review and fix issues"
    echo "✗ Do not enable smart assignment until all issues resolved"
    echo "✗ Check deployment logs for detailed error information"
fi)

Monitoring:
- View logs: tail -f $PROJECT_ROOT/logs/*.log
- Health check: $PROJECT_ROOT/monitoring/scripts/health-check.sh
- Dashboard: $PROJECT_ROOT/monitoring/scripts/dashboard.sh

Rollback (if needed):
- Emergency rollback: $PROJECT_ROOT/scripts/deployment/rollback-smart-assignment.sh <backup_dir>
EOF

log "Verification report saved: $REPORT_FILE"

# Final summary
log ""
log "Deployment Verification Summary:"
log "Total Tests: $TESTS_TOTAL"
log "Passed: $TESTS_PASSED"
log "Failed: $TESTS_FAILED"
log "Success Rate: $(( TESTS_PASSED * 100 / TESTS_TOTAL ))%"

if [ $TESTS_FAILED -eq 0 ]; then
    success "✓ Deployment verification PASSED - System ready for use"
    exit 0
else
    error "✗ Deployment verification FAILED - $TESTS_FAILED issues found"
    exit 1
fi