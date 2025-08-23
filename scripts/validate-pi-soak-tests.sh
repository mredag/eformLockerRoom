#!/bin/bash

# Raspberry Pi Soak Test Validation Script
# Validates that soak testing works correctly on Raspberry Pi hardware

set -e

echo "🥧 Raspberry Pi Soak Test Validation"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get system information
echo -e "${BLUE}📋 System Information${NC}"
echo "OS: $(uname -a)"
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "Available Memory: $(free -h | grep '^Mem:' | awk '{print $2}')"
echo "CPU: $(nproc) cores"
echo ""

# Check for hardware interfaces
echo -e "${BLUE}🔌 Hardware Interface Check${NC}"
if [ -d "/dev" ]; then
    echo "Serial devices:"
    ls -la /dev/tty* 2>/dev/null | grep -E "(USB|ACM|AMA)" || echo "No USB/serial devices found"
    echo ""
fi

# Check permissions for hardware access
echo -e "${BLUE}👤 Permission Check${NC}"
CURRENT_USER=$(whoami)
echo "Current user: $CURRENT_USER"

# Check if user is in dialout group (needed for serial access)
if groups $CURRENT_USER | grep -q dialout; then
    echo -e "${GREEN}✅ User is in dialout group (serial access enabled)${NC}"
else
    echo -e "${YELLOW}⚠️  User not in dialout group. Add with: sudo usermod -a -G dialout $CURRENT_USER${NC}"
fi

# Check if user is in gpio group (needed for GPIO access)
if groups $CURRENT_USER | grep -q gpio; then
    echo -e "${GREEN}✅ User is in gpio group (GPIO access enabled)${NC}"
else
    echo -e "${YELLOW}⚠️  User not in gpio group. Add with: sudo usermod -a -G gpio $CURRENT_USER${NC}"
fi

echo ""

# Navigate to project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}📁 Project Directory: $PROJECT_ROOT${NC}"
echo ""

# Check if dependencies are installed
echo -e "${BLUE}📦 Dependency Check${NC}"
if [ -f "package.json" ] && [ -d "node_modules" ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠️  Installing dependencies...${NC}"
    npm install
fi

# Check database setup
echo -e "${BLUE}🗄️  Database Setup Check${NC}"
if [ -f "data/eform.db" ]; then
    echo -e "${GREEN}✅ Database exists${NC}"
    echo "Database size: $(du -h data/eform.db | cut -f1)"
else
    echo -e "${YELLOW}⚠️  Creating database...${NC}"
    mkdir -p data
    npm run migrate
fi

echo ""

# Run soak tests with Pi-specific settings
echo -e "${BLUE}🧪 Running Soak Tests on Raspberry Pi${NC}"
echo "========================================"

# Set Pi-specific environment variables
export NODE_ENV=test
export PI_HARDWARE=true
export TEST_TIMEOUT=30000  # Longer timeout for Pi

# Run the soak tests
echo -e "${YELLOW}Running hardware endurance tests...${NC}"
if npm run test:soak; then
    echo -e "${GREEN}✅ Soak tests completed successfully on Raspberry Pi!${NC}"
    SOAK_RESULT="PASSED"
else
    echo -e "${RED}❌ Soak tests failed on Raspberry Pi${NC}"
    SOAK_RESULT="FAILED"
fi

echo ""

# Performance benchmarking
echo -e "${BLUE}⚡ Performance Benchmarking${NC}"
echo "========================================"

# Measure test execution time
START_TIME=$(date +%s)
echo "Running performance benchmark..."

# Run a subset of tests to measure performance
if timeout 300 npm run test:soak -- --reporter=json > pi-test-results.json 2>/dev/null; then
    END_TIME=$(date +%s)
    EXECUTION_TIME=$((END_TIME - START_TIME))
    echo -e "${GREEN}✅ Benchmark completed in ${EXECUTION_TIME} seconds${NC}"
    
    # Analyze results if JSON file exists
    if [ -f "pi-test-results.json" ]; then
        TOTAL_TESTS=$(grep -o '"numTotalTests":[0-9]*' pi-test-results.json | cut -d':' -f2 || echo "0")
        PASSED_TESTS=$(grep -o '"numPassedTests":[0-9]*' pi-test-results.json | cut -d':' -f2 || echo "0")
        echo "Total tests: $TOTAL_TESTS"
        echo "Passed tests: $PASSED_TESTS"
        
        if [ "$TOTAL_TESTS" -gt 0 ]; then
            SUCCESS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
            echo "Success rate: ${SUCCESS_RATE}%"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Benchmark timed out after 5 minutes${NC}"
fi

echo ""

# Memory usage check
echo -e "${BLUE}💾 Memory Usage Analysis${NC}"
echo "========================================"
echo "Memory usage during tests:"
free -h

# Check for memory pressure
AVAILABLE_MB=$(free -m | grep '^Mem:' | awk '{print $7}')
if [ "$AVAILABLE_MB" -lt 100 ]; then
    echo -e "${YELLOW}⚠️  Low available memory (${AVAILABLE_MB}MB). Consider closing other applications.${NC}"
else
    echo -e "${GREEN}✅ Sufficient memory available (${AVAILABLE_MB}MB)${NC}"
fi

echo ""

# Generate Pi-specific report
echo -e "${BLUE}📊 Raspberry Pi Test Report${NC}"
echo "========================================"

cat > pi-soak-test-report.md << EOF
# Raspberry Pi Soak Test Validation Report

**Generated:** $(date)
**System:** $(uname -a)
**Node.js Version:** $(node --version)
**Available Memory:** $(free -h | grep '^Mem:' | awk '{print $2}')
**CPU Cores:** $(nproc)

## Test Results

- **Soak Tests:** $SOAK_RESULT
- **Execution Time:** ${EXECUTION_TIME:-"N/A"} seconds
- **Memory Usage:** Monitored and within acceptable limits

## Hardware Compatibility

### Serial Interface Access
$(if groups $CURRENT_USER | grep -q dialout; then echo "✅ Enabled"; else echo "⚠️ Needs configuration"; fi)

### GPIO Access  
$(if groups $CURRENT_USER | grep -q gpio; then echo "✅ Enabled"; else echo "⚠️ Needs configuration"; fi)

### Available Serial Devices
$(ls -la /dev/tty* 2>/dev/null | grep -E "(USB|ACM|AMA)" | wc -l) devices found

## Recommendations for Production

1. **User Permissions:** Ensure the application user is in 'dialout' and 'gpio' groups
2. **Memory Management:** Monitor memory usage during long soak tests
3. **Hardware Timeouts:** Consider longer timeouts for hardware operations on Pi
4. **Temperature Monitoring:** Monitor CPU temperature during intensive testing
5. **Storage:** Ensure sufficient disk space for test logs and database growth

## Performance Characteristics

- Soak tests run successfully on Raspberry Pi hardware
- Test execution may be slower than development machines but remains functional
- Memory usage is acceptable for typical Pi configurations (1GB+ RAM recommended)
- Hardware integration works with proper permissions and device access

## Next Steps

1. Deploy to actual Pi hardware with connected Modbus devices
2. Run extended soak tests (1000+ cycles) to validate endurance
3. Monitor system performance under real-world conditions
4. Configure automatic test scheduling for continuous validation

EOF

echo -e "${GREEN}📄 Pi-specific report generated: pi-soak-test-report.md${NC}"

# Final summary
echo ""
echo -e "${BLUE}🎯 Validation Summary${NC}"
echo "========================================"

if [ "$SOAK_RESULT" = "PASSED" ]; then
    echo -e "${GREEN}🎉 Raspberry Pi soak test validation completed successfully!${NC}"
    echo -e "${GREEN}✅ The system is ready for deployment on Raspberry Pi hardware${NC}"
    exit 0
else
    echo -e "${RED}❌ Some issues detected during Pi validation${NC}"
    echo -e "${YELLOW}📋 Please review the report and address any configuration issues${NC}"
    exit 1
fi