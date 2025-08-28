#!/bin/bash

# End-to-End Test Runner for Admin Panel Relay Control
# This script runs all the comprehensive tests for the admin panel relay control feature

set -e

echo "🚀 Starting End-to-End Tests for Admin Panel Relay Control"
echo "============================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "🔍 Checking prerequisites..."

if ! command_exists node; then
    print_status $RED "❌ Node.js is not installed"
    exit 1
fi

if ! command_exists npm; then
    print_status $RED "❌ npm is not installed"
    exit 1
fi

print_status $GREEN "✅ Prerequisites check passed"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Run the comprehensive test suite
echo "🧪 Running comprehensive test suite..."

# Set test environment variables
export NODE_ENV=test
export LOG_LEVEL=info
export MODBUS_PORT=${MODBUS_PORT:-/dev/ttyUSB0}

echo "Using Modbus port: $MODBUS_PORT"

# Run the main test runner
if node scripts/run-e2e-admin-panel-tests.js; then
    print_status $GREEN "✅ All tests passed successfully!"
    
    echo ""
    echo "📋 Test Summary:"
    echo "- Hardware validation: Completed"
    echo "- Admin panel functionality: Verified"
    echo "- Service integration: Tested"
    echo "- Logging validation: Confirmed"
    echo "- UI feedback: Validated"
    
    echo ""
    print_status $GREEN "🎉 Admin Panel Relay Control is fully functional!"
    
else
    print_status $RED "❌ Some tests failed"
    
    echo ""
    echo "🔧 Troubleshooting steps:"
    echo "1. Check that all services are running:"
    echo "   - Gateway service (port 3000)"
    echo "   - Kiosk service (port 3001)"
    echo "   - Admin panel service (port 3003)"
    echo ""
    echo "2. Verify hardware connections:"
    echo "   - RS-485 converter connected to $MODBUS_PORT"
    echo "   - Relay cards powered and properly wired"
    echo "   - DIP switches configured correctly"
    echo ""
    echo "3. Set MODBUS_PORT environment variable if using different port:"
    echo "   export MODBUS_PORT=/dev/ttyAMA0"
    echo ""
    echo "4. Check log files in ./logs/ for detailed error information"
    echo ""
    echo "5. Review the test report: ./scripts/e2e-test-report.json"
    
    exit 1
fi