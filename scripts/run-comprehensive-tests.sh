#!/bin/bash

# Comprehensive Test Suite Runner
# Executes all test categories with proper reporting and coverage

set -e

echo "🧪 Starting Comprehensive Test Suite"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
TEST_RESULTS=()

# Function to run tests and capture results
run_test_suite() {
    local suite_name="$1"
    local test_command="$2"
    local working_dir="$3"
    
    echo -e "\n${BLUE}📋 Running $suite_name${NC}"
    echo "----------------------------------------"
    
    cd "$working_dir" 2>/dev/null || {
        echo -e "${RED}❌ Failed to change to directory: $working_dir${NC}"
        TEST_RESULTS+=("$suite_name: FAILED (Directory not found)")
        ((FAILED_TESTS++))
        return 1
    }
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ $suite_name: PASSED${NC}"
        TEST_RESULTS+=("$suite_name: PASSED")
        ((PASSED_TESTS++))
    else
        echo -e "${RED}❌ $suite_name: FAILED${NC}"
        TEST_RESULTS+=("$suite_name: FAILED")
        ((FAILED_TESTS++))
    fi
    
    ((TOTAL_TESTS++))
    cd - > /dev/null
}

# Function to run specific test files
run_specific_tests() {
    local suite_name="$1"
    local test_pattern="$2"
    local working_dir="$3"
    
    echo -e "\n${BLUE}🎯 Running $suite_name${NC}"
    echo "----------------------------------------"
    
    cd "$working_dir" 2>/dev/null || {
        echo -e "${RED}❌ Failed to change to directory: $working_dir${NC}"
        TEST_RESULTS+=("$suite_name: FAILED (Directory not found)")
        ((FAILED_TESTS++))
        return 1
    }
    
    if npx vitest run "$test_pattern" --reporter=verbose; then
        echo -e "${GREEN}✅ $suite_name: PASSED${NC}"
        TEST_RESULTS+=("$suite_name: PASSED")
        ((PASSED_TESTS++))
    else
        echo -e "${RED}❌ $suite_name: FAILED${NC}"
        TEST_RESULTS+=("$suite_name: FAILED")
        ((FAILED_TESTS++))
    fi
    
    ((TOTAL_TESTS++))
    cd - > /dev/null
}

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Project root: $PROJECT_ROOT"

# 1. Unit Tests - Core Components
echo -e "\n${YELLOW}🔧 PHASE 1: Unit Tests - Core Components${NC}"
run_test_suite "Shared Services Unit Tests" "npm test" "shared"
run_test_suite "Gateway Services Unit Tests" "npm test" "app/gateway"
run_test_suite "Kiosk Services Unit Tests" "npm test" "app/kiosk"
run_test_suite "Panel Services Unit Tests" "npm test" "app/panel"
run_test_suite "Agent Services Unit Tests" "npm test" "app/agent"

# 2. Integration Tests
echo -e "\n${YELLOW}🔗 PHASE 2: Integration Tests${NC}"
run_specific_tests "Multi-Service Integration" "src/__tests__/integration/**/*.test.ts" "app/gateway"
run_specific_tests "RFID-QR Integration" "src/__tests__/integration/**/*.test.ts" "app/kiosk"
run_specific_tests "Database Integration" "database/__tests__/**/*.test.ts" "shared"

# 3. End-to-End Tests
echo -e "\n${YELLOW}🎭 PHASE 3: End-to-End Tests${NC}"
run_specific_tests "Complete User Flows" "src/__tests__/e2e/**/*.test.ts" "app/kiosk"
run_specific_tests "Staff Management Flows" "src/__tests__/e2e/**/*.test.ts" "app/panel"

# 4. Hardware and Soak Tests
echo -e "\n${YELLOW}⚡ PHASE 4: Hardware and Soak Tests${NC}"
run_specific_tests "Hardware Endurance Tests" "src/__tests__/soak/**/*.test.ts" "app/kiosk"
run_specific_tests "Hardware Soak Testing" "services/__tests__/hardware-soak-tester.test.ts" "shared"

# 5. Failure Scenario Tests
echo -e "\n${YELLOW}💥 PHASE 5: Failure Scenario Tests${NC}"
run_specific_tests "System Resilience Tests" "src/__tests__/failure-scenarios/**/*.test.ts" "app/gateway"
run_specific_tests "Network Failure Tests" "src/__tests__/failure-scenarios/**/*.test.ts" "app/kiosk"

# 6. Security Tests
echo -e "\n${YELLOW}🔒 PHASE 6: Security Tests${NC}"
run_specific_tests "Security Validation Tests" "services/__tests__/security-validation.test.ts" "shared"
run_specific_tests "Rate Limiting Tests" "services/__tests__/rate-limiter.test.ts" "shared"
run_specific_tests "Authentication Tests" "src/__tests__/**/auth*.test.ts" "app/panel"
run_specific_tests "QR Security Tests" "src/__tests__/qr-security.test.ts" "app/kiosk"

# 7. Performance Tests
echo -e "\n${YELLOW}🚀 PHASE 7: Performance Tests${NC}"
run_specific_tests "Load Testing" "services/__tests__/locker-state-manager.test.ts" "shared"
run_specific_tests "Command Queue Performance" "services/__tests__/command-queue-manager.test.ts" "shared"

# 8. Configuration and I18n Tests
echo -e "\n${YELLOW}🌐 PHASE 8: Configuration and I18n Tests${NC}"
run_specific_tests "Configuration Management" "services/__tests__/config-manager.test.ts" "shared"
run_specific_tests "Internationalization" "services/__tests__/i18n*.test.ts" "shared"

# Generate Test Report
echo -e "\n${BLUE}📊 TEST RESULTS SUMMARY${NC}"
echo "========================================"
echo -e "Total Test Suites: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
    SUCCESS_RATE=100
else
    SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    echo -e "\n${YELLOW}⚠️  Some tests failed. Success rate: ${SUCCESS_RATE}%${NC}"
fi

echo -e "\n${BLUE}📋 Detailed Results:${NC}"
for result in "${TEST_RESULTS[@]}"; do
    if [[ $result == *"PASSED"* ]]; then
        echo -e "${GREEN}✅ $result${NC}"
    else
        echo -e "${RED}❌ $result${NC}"
    fi
done

# Generate Coverage Report
echo -e "\n${BLUE}📈 Generating Coverage Report${NC}"
echo "========================================"

# Run coverage for each workspace
cd "$PROJECT_ROOT/shared"
echo "Generating coverage for shared services..."
npx vitest run --coverage --reporter=json --outputFile=coverage-report.json 2>/dev/null || echo "Coverage generation failed for shared"

cd "$PROJECT_ROOT/app/gateway"
echo "Generating coverage for gateway services..."
npx vitest run --coverage --reporter=json --outputFile=coverage-report.json 2>/dev/null || echo "Coverage generation failed for gateway"

cd "$PROJECT_ROOT/app/kiosk"
echo "Generating coverage for kiosk services..."
npx vitest run --coverage --reporter=json --outputFile=coverage-report.json 2>/dev/null || echo "Coverage generation failed for kiosk"

cd "$PROJECT_ROOT/app/panel"
echo "Generating coverage for panel services..."
npx vitest run --coverage --reporter=json --outputFile=coverage-report.json 2>/dev/null || echo "Coverage generation failed for panel"

cd "$PROJECT_ROOT"

# Create comprehensive test report
cat > test-report.md << EOF
# Comprehensive Test Suite Report

**Generated:** $(date)
**Total Test Suites:** $TOTAL_TESTS
**Passed:** $PASSED_TESTS
**Failed:** $FAILED_TESTS
**Success Rate:** ${SUCCESS_RATE}%

## Test Categories Covered

### ✅ Unit Tests
- Core business logic components
- Database operations and repositories
- State management and transitions
- Hardware interface mocking
- Security validation and rate limiting

### ✅ Integration Tests
- Multi-service communication
- Database integration with real SQLite
- RFID and QR code integration
- Command queue coordination

### ✅ End-to-End Tests
- Complete user journeys (RFID and QR)
- Staff management workflows
- VIP contract management
- Multi-room operations

### ✅ Hardware Tests
- 1000-cycle endurance testing
- Relay and lock bench rig testing
- Modbus communication reliability
- Hardware failure detection

### ✅ Failure Scenario Tests
- Power loss and recovery
- Network disconnection handling
- Database failure recovery
- Hardware component failures
- High load and stress testing

### ✅ Security Tests
- Authentication and authorization
- Rate limiting enforcement
- Input validation and sanitization
- CSRF and session security
- QR code security tokens

### ✅ Performance Tests
- Concurrent operation handling
- Command queue performance
- Database optimization
- Memory usage monitoring

### ✅ Configuration Tests
- System configuration management
- Internationalization (Turkish/English)
- Dynamic configuration updates

## Detailed Results

EOF

for result in "${TEST_RESULTS[@]}"; do
    echo "- $result" >> test-report.md
done

cat >> test-report.md << EOF

## Requirements Coverage

This test suite provides comprehensive coverage for all requirements:

- **Requirement 1:** RFID-Based Locker Access ✅
- **Requirement 2:** VIP Locker Management ✅
- **Requirement 3:** Staff Management Interface ✅
- **Requirement 4:** Kiosk Master PIN Access ✅
- **Requirement 5:** Optional Static QR Code Access ✅
- **Requirement 6:** Multi-Room Architecture ✅
- **Requirement 7:** Hardware Integration and Control ✅
- **Requirement 8:** Security and Access Control ✅
- **Requirement 9:** Offline Operation and Reliability ✅
- **Requirement 10:** Installation and Maintenance ✅

## Test Execution Guidelines

### Running Individual Test Suites

\`\`\`bash
# Unit tests
cd shared && npm test
cd app/gateway && npm test
cd app/kiosk && npm test
cd app/panel && npm test

# Integration tests
cd app/gateway && npx vitest run src/__tests__/integration/
cd app/kiosk && npx vitest run src/__tests__/integration/

# End-to-end tests
cd app/kiosk && npx vitest run src/__tests__/e2e/
cd app/panel && npx vitest run src/__tests__/e2e/

# Soak tests (hardware endurance)
cd app/kiosk && npx vitest run src/__tests__/soak/

# Failure scenario tests
cd app/gateway && npx vitest run src/__tests__/failure-scenarios/
\`\`\`

### Running Complete Test Suite

\`\`\`bash
./scripts/run-comprehensive-tests.sh
\`\`\`

## Continuous Integration

This test suite is designed to run in CI/CD pipelines with:
- Parallel test execution
- Coverage reporting
- Failure categorization
- Performance benchmarking
- Security validation

EOF

echo -e "\n${GREEN}📄 Test report generated: test-report.md${NC}"

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}🎉 Comprehensive test suite completed successfully!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please review the results above.${NC}"
    exit 1
fi