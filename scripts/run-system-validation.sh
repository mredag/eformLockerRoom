#!/bin/bash

# Comprehensive System Validation Test Runner
# Runs complete system validation and performance testing for the Eform Locker System

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_TYPE="${1:-all}"
VERBOSE="${2:-false}"
GENERATE_REPORT="${3:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test configuration
TIMEOUT=300000  # 5 minutes
RETRIES=2

# Logging functions
log_header() {
    echo ""
    echo -e "${PURPLE}$(printf '=%.0s' {1..80})${NC}"
    echo -e "${PURPLE} $1${NC}"
    echo -e "${PURPLE}$(printf '=%.0s' {1..80})${NC}"
    echo ""
}

log_info() {
    echo -e "${CYAN}$1${NC}"
}

log_success() {
    echo -e "${GREEN}$1${NC}"
}

log_warning() {
    echo -e "${YELLOW}$1${NC}"
}

log_error() {
    echo -e "${RED}$1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "🔍 Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "❌ Node.js not found"
        return 1
    fi
    
    NODE_VERSION=$(node --version)
    MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
    
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        log_error "❌ Node.js version $NODE_VERSION is too old. Requires v18 or higher."
        return 1
    fi
    
    log_success "✅ Node.js: $NODE_VERSION"
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        log_info "📦 Installing dependencies..."
        npm install
    fi
    
    # Check database migrations
    log_info "🗄️ Checking database schema..."
    if [ -d "migrations" ]; then
        MIGRATION_COUNT=$(find migrations -name "*.sql" | wc -l)
        log_success "✅ Found $MIGRATION_COUNT migration files"
    fi
    
    # Check test files exist
    TEST_FILES=(
        "app/gateway/src/__tests__/validation/system-validation.test.ts"
        "app/gateway/src/__tests__/validation/comprehensive-system-validation.test.ts"
        "app/panel/src/__tests__/performance/panel-performance.test.ts"
        "app/kiosk/src/__tests__/validation/hardware-integration-validation.test.ts"
    )
    
    for test_file in "${TEST_FILES[@]}"; do
        if [ -f "$test_file" ]; then
            log_success "✅ Test file: $test_file"
        else
            log_warning "⚠️ Missing test file: $test_file"
        fi
    done
    
    return 0
}

# Run a test suite
run_test_suite() {
    local suite_name="$1"
    local test_pattern="$2"
    local description="$3"
    
    log_header "$suite_name"
    log_info "$description"
    echo ""
    
    local start_time=$(date +%s.%N)
    local status="PASSED"
    local output=""
    local exit_code=0
    
    # Build test command
    local verbose_flag=""
    if [ "$VERBOSE" = "true" ]; then
        verbose_flag="--reporter=verbose"
    else
        verbose_flag="--reporter=default"
    fi
    
    local test_command="npx vitest run $test_pattern $verbose_flag --timeout=$TIMEOUT"
    
    log_info "🧪 Running: $test_command"
    
    # Run test and capture output
    if output=$(eval "$test_command" 2>&1); then
        exit_code=0
        status="PASSED"
    else
        exit_code=$?
        status="FAILED"
    fi
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc -l)
    
    if [ "$status" = "PASSED" ]; then
        log_success "✅ $suite_name completed successfully in ${duration}s"
    else
        log_error "❌ $suite_name failed after ${duration}s"
        if [ "$VERBOSE" = "true" ]; then
            echo "$output"
        fi
    fi
    
    # Store result for reporting
    echo "$suite_name|$status|$duration|$exit_code" >> "/tmp/test_results_$$"
}

# Get test suites based on test type
get_test_suites() {
    local test_suites=()
    
    case "$TEST_TYPE" in
        "all"|"unit")
            test_suites+=(
                "Unit Tests - Core Services|shared/services/__tests__/**/*.test.ts|Testing core business logic and services"
                "Unit Tests - Database Layer|shared/database/__tests__/**/*.test.ts|Testing database operations and repositories"
            )
            ;&
        "all"|"integration")
            test_suites+=(
                "Integration Tests - Multi-Service|app/gateway/src/__tests__/integration/**/*.test.ts|Testing service integration and coordination"
                "Integration Tests - VIP Workflows|app/panel/src/__tests__/integration/**/*.test.ts|Testing VIP management workflows"
                "Integration Tests - User Flows|app/kiosk/src/__tests__/e2e/**/*.test.ts|Testing complete user journeys"
            )
            ;&
        "all"|"performance")
            test_suites+=(
                "Performance Tests - Panel|app/panel/src/__tests__/performance/**/*.test.ts|Testing panel performance with 500 lockers and 3 kiosks"
                "Performance Tests - System Load|app/gateway/src/__tests__/validation/system-validation.test.ts|Testing system under realistic load"
            )
            ;&
        "all"|"hardware")
            test_suites+=(
                "Hardware Integration - Modbus|app/kiosk/src/__tests__/validation/hardware-integration-validation.test.ts|Testing Modbus relay control and RS485 communication"
                "Hardware Integration - RFID|app/kiosk/src/__tests__/integration/rfid-qr-integration.test.ts|Testing RFID reader integration"
                "Hardware Endurance - Soak Testing|app/kiosk/src/__tests__/soak/hardware-endurance.test.ts|Testing 1000-cycle hardware endurance"
            )
            ;&
        "all"|"security")
            test_suites+=(
                "Security Validation - Authentication|app/panel/src/__tests__/auth-*.test.ts|Testing authentication and authorization"
                "Security Validation - Rate Limiting|shared/services/__tests__/rate-limiter.test.ts|Testing rate limiting and security measures"
                "Security Validation - Input Validation|shared/services/__tests__/security-validation.test.ts|Testing input sanitization and validation"
            )
            ;;
    esac
    
    # Add comprehensive validation for 'all' type
    if [ "$TEST_TYPE" = "all" ]; then
        test_suites+=(
            "Comprehensive System Validation|app/gateway/src/__tests__/validation/comprehensive-system-validation.test.ts|Complete system acceptance testing against all requirements"
        )
    fi
    
    printf '%s\n' "${test_suites[@]}"
}

# Generate test report
generate_report() {
    local results_file="/tmp/test_results_$$"
    
    if [ ! -f "$results_file" ]; then
        log_warning "⚠️ No test results found for reporting"
        return
    fi
    
    local timestamp=$(date -Iseconds)
    local report_dir="test-results"
    local json_report="$report_dir/system-validation-report-$(date +%Y%m%d-%H%M%S).json"
    local html_report="$report_dir/system-validation-report-$(date +%Y%m%d-%H%M%S).html"
    
    # Create report directory
    mkdir -p "$report_dir"
    
    # Count results
    local total_suites=0
    local passed=0
    local failed=0
    local crashed=0
    local total_duration=0
    
    while IFS='|' read -r name status duration exit_code; do
        ((total_suites++))
        case "$status" in
            "PASSED") ((passed++)) ;;
            "FAILED") ((failed++)) ;;
            "CRASHED") ((crashed++)) ;;
        esac
        total_duration=$(echo "$total_duration + $duration" | bc -l)
    done < "$results_file"
    
    # Generate JSON report
    cat > "$json_report" << EOF
{
    "timestamp": "$timestamp",
    "test_type": "$TEST_TYPE",
    "total_suites": $total_suites,
    "passed": $passed,
    "failed": $failed,
    "crashed": $crashed,
    "total_duration": $total_duration,
    "results": [
EOF
    
    local first=true
    while IFS='|' read -r name status duration exit_code; do
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$json_report"
        fi
        cat >> "$json_report" << EOF
        {
            "name": "$name",
            "status": "$status",
            "duration": $duration,
            "exit_code": $exit_code
        }
EOF
    done < "$results_file"
    
    echo "    ]" >> "$json_report"
    echo "}" >> "$json_report"
    
    # Generate HTML report
    cat > "$html_report" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Eform Locker System - Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #ecf0f1; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.passed { background: #d5f4e6; }
        .metric.failed { background: #ffeaa7; }
        .metric.crashed { background: #fab1a0; }
        .suite { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.passed { border-left: 5px solid #00b894; }
        .suite.failed { border-left: 5px solid #e17055; }
        .suite.crashed { border-left: 5px solid #d63031; }
        .duration { color: #636e72; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Eform Locker System - Validation Report</h1>
        <p>Generated: $timestamp | Test Type: ${TEST_TYPE^^}</p>
    </div>
    
    <div class="summary">
        <div class="metric passed">
            <h3>$passed</h3>
            <p>Passed</p>
        </div>
        <div class="metric failed">
            <h3>$failed</h3>
            <p>Failed</p>
        </div>
        <div class="metric crashed">
            <h3>$crashed</h3>
            <p>Crashed</p>
        </div>
        <div class="metric">
            <h3>$(printf "%.1f" "$total_duration")s</h3>
            <p>Total Duration</p>
        </div>
    </div>
    
    <h2>Test Results</h2>
EOF
    
    while IFS='|' read -r name status duration exit_code; do
        local status_class=$(echo "$status" | tr '[:upper:]' '[:lower:]')
        local status_icon=""
        case "$status" in
            "PASSED") status_icon="✅" ;;
            "FAILED") status_icon="❌" ;;
            "CRASHED") status_icon="💥" ;;
        esac
        
        cat >> "$html_report" << EOF
    <div class="suite $status_class">
        <h3>$status_icon $name</h3>
        <p class="duration">Duration: $(printf "%.2f" "$duration")s</p>
    </div>
EOF
    done < "$results_file"
    
    echo "</body></html>" >> "$html_report"
    
    log_info "📊 Reports generated:"
    log_info "   JSON: $json_report"
    log_info "   HTML: $html_report"
    
    # Cleanup
    rm -f "$results_file"
}

# Main execution
main() {
    cd "$PROJECT_ROOT"
    
    log_header "Eform Locker System - Comprehensive Validation"
    
    log_info "🎯 Test Type: ${TEST_TYPE^^}"
    log_info "📝 Verbose: $VERBOSE"
    log_info "📊 Generate Report: $GENERATE_REPORT"
    echo ""
    
    # Check prerequisites
    if ! check_prerequisites; then
        log_error "❌ Prerequisites check failed. Aborting."
        exit 1
    fi
    
    # Initialize results file
    rm -f "/tmp/test_results_$$"
    
    # Get and run test suites
    local test_suites
    mapfile -t test_suites < <(get_test_suites)
    
    log_info "🧪 Found ${#test_suites[@]} test suites to run"
    
    local total_start_time=$(date +%s.%N)
    
    for suite in "${test_suites[@]}"; do
        IFS='|' read -r name pattern description <<< "$suite"
        run_test_suite "$name" "$pattern" "$description"
    done
    
    local total_end_time=$(date +%s.%N)
    local total_duration=$(echo "$total_end_time - $total_start_time" | bc -l)
    
    # Summary
    log_header "Validation Summary"
    
    local passed=0
    local failed=0
    local crashed=0
    
    if [ -f "/tmp/test_results_$$" ]; then
        while IFS='|' read -r name status duration exit_code; do
            case "$status" in
                "PASSED") ((passed++)) ;;
                "FAILED") ((failed++)) ;;
                "CRASHED") ((crashed++)) ;;
            esac
        done < "/tmp/test_results_$$"
    fi
    
    log_info "📊 Test Results:"
    log_success "   ✅ Passed: $passed"
    log_error "   ❌ Failed: $failed"
    log_error "   💥 Crashed: $crashed"
    log_info "   ⏱️ Total Duration: $(printf "%.2f" "$total_duration")s"
    echo ""
    
    # Generate report if requested
    if [ "$GENERATE_REPORT" = "true" ]; then
        generate_report
    fi
    
    # Final status
    if [ $failed -eq 0 ] && [ $crashed -eq 0 ]; then
        log_success "🎉 ALL VALIDATION TESTS PASSED!"
        log_success "✅ System is ready for deployment"
        exit 0
    else
        log_error "❌ VALIDATION FAILED"
        log_warning "🔧 Please fix failing tests before deployment"
        exit 1
    fi
}

# Show usage if help requested
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Usage: $0 [TEST_TYPE] [VERBOSE] [GENERATE_REPORT]"
    echo ""
    echo "TEST_TYPE: all, unit, integration, performance, hardware, security (default: all)"
    echo "VERBOSE: true/false (default: false)"
    echo "GENERATE_REPORT: true/false (default: false)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Run all tests"
    echo "  $0 performance               # Run only performance tests"
    echo "  $0 all true                  # Run all tests with verbose output"
    echo "  $0 integration false true    # Run integration tests and generate report"
    exit 0
fi

# Run main function
main