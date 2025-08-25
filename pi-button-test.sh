#!/bin/bash

# Raspberry Pi Button Testing Helper Script
# Usage: ./pi-button-test.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if services are running
check_services() {
    print_status "Checking if services are running..."
    
    # Check for node processes
    if pgrep -f "node" > /dev/null; then
        print_success "Node.js processes are running"
        echo "Running processes:"
        ps aux | grep node | grep -v grep
    else
        print_warning "No Node.js processes found"
    fi
    
    # Check specific ports
    for port in 3001 3002 3003; do
        if netstat -tlnp 2>/dev/null | grep ":$port " > /dev/null; then
            print_success "Port $port is listening"
        else
            print_warning "Port $port is not listening"
        fi
    done
}

# Function to test API connectivity
test_apis() {
    print_status "Testing API connectivity..."
    
    # Test health endpoints
    for port in 3001 3002 3003; do
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            print_success "Health check passed for port $port"
        else
            print_warning "Health check failed for port $port"
        fi
    done
    
    # Test specific endpoints
    print_status "Testing locker API..."
    if curl -s -f "http://localhost:3001/api/lockers?kioskId=kiosk-1" > /dev/null 2>&1; then
        print_success "Locker API is accessible"
    else
        print_warning "Locker API is not accessible"
    fi
}

# Function to run button function tests
run_button_tests() {
    print_status "Running button function tests..."
    
    if [ -f "test-button-functions.js" ]; then
        node test-button-functions.js
    else
        print_error "test-button-functions.js not found"
        exit 1
    fi
}

# Function to add enhanced logging
add_logging() {
    print_status "Adding enhanced logging to locker page..."
    
    if [ -f "add-button-logging.js" ]; then
        node add-button-logging.js add
        print_success "Enhanced logging added"
    else
        print_error "add-button-logging.js not found"
        exit 1
    fi
}

# Function to remove enhanced logging
remove_logging() {
    print_status "Removing enhanced logging from locker page..."
    
    if [ -f "add-button-logging.js" ]; then
        node add-button-logging.js remove
        print_success "Enhanced logging removed"
    else
        print_error "add-button-logging.js not found"
        exit 1
    fi
}

# Function to build the project
build_project() {
    print_status "Building the project..."
    
    # Build shared components
    print_status "Building shared components..."
    npm run build:shared
    
    # Build all services
    print_status "Building all services..."
    npm run build
    
    print_success "Project build completed"
}

# Function to show system information
show_system_info() {
    print_status "System Information:"
    echo "===================="
    
    # OS Information
    echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
    echo "Kernel: $(uname -r)"
    
    # Hardware info
    echo "CPU: $(cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d':' -f2 | xargs)"
    echo "Memory: $(free -h | grep Mem | awk '{print $2}')"
    echo "Disk: $(df -h / | tail -1 | awk '{print $4}') available"
    
    # Node.js info
    echo "Node.js: $(node --version)"
    echo "NPM: $(npm --version)"
    
    # Network info
    echo "IP Address: $(hostname -I | awk '{print $1}')"
}

# Function to open browser (if desktop environment available)
open_browser() {
    print_status "Attempting to open browser..."
    
    # Get local IP
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    # Try to open browser
    if command -v chromium-browser > /dev/null; then
        print_status "Opening Chromium browser..."
        chromium-browser "http://localhost:3001/lockers" > /dev/null 2>&1 &
        print_success "Browser opened"
    elif command -v firefox > /dev/null; then
        print_status "Opening Firefox browser..."
        firefox "http://localhost:3001/lockers" > /dev/null 2>&1 &
        print_success "Browser opened"
    else
        print_warning "No browser found. Access manually:"
        echo "  Local: http://localhost:3001/lockers"
        echo "  Remote: http://$LOCAL_IP:3001/lockers"
    fi
}

# Function to show usage
show_usage() {
    echo "Raspberry Pi Button Testing Helper"
    echo "=================================="
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  check       - Check if services are running"
    echo "  test-api    - Test API connectivity"
    echo "  test-buttons - Run button function tests"
    echo "  add-logging - Add enhanced logging to locker page"
    echo "  remove-logging - Remove enhanced logging"
    echo "  build       - Build the project"
    echo "  info        - Show system information"
    echo "  browser     - Open browser to locker page"
    echo "  full-test   - Run complete testing sequence"
    echo "  help        - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 check"
    echo "  $0 full-test"
    echo "  $0 add-logging"
}

# Function to run full testing sequence
run_full_test() {
    print_status "Running full button testing sequence..."
    echo "========================================"
    
    # Step 1: System info
    show_system_info
    echo ""
    
    # Step 2: Check services
    check_services
    echo ""
    
    # Step 3: Test APIs
    test_apis
    echo ""
    
    # Step 4: Add logging
    add_logging
    echo ""
    
    # Step 5: Run button tests
    run_button_tests
    echo ""
    
    # Step 6: Show next steps
    print_success "Full test sequence completed!"
    echo ""
    print_status "Next steps:"
    echo "1. Open browser to: http://$(hostname -I | awk '{print $1}'):3001/lockers"
    echo "2. Open browser developer console (F12)"
    echo "3. Try clicking buttons and watch the console logs"
    echo "4. Use test page: http://$(hostname -I | awk '{print $1}'):3001/test-client-button-functions.html"
    echo ""
    print_status "When done testing, run: $0 remove-logging"
}

# Main script logic
case "${1:-help}" in
    "check")
        check_services
        ;;
    "test-api")
        test_apis
        ;;
    "test-buttons")
        run_button_tests
        ;;
    "add-logging")
        add_logging
        ;;
    "remove-logging")
        remove_logging
        ;;
    "build")
        build_project
        ;;
    "info")
        show_system_info
        ;;
    "browser")
        open_browser
        ;;
    "full-test")
        run_full_test
        ;;
    "help"|*)
        show_usage
        ;;
esac