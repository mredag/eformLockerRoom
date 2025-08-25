#!/bin/bash

# 🔍 Gateway Service Diagnostic Script
# Helps diagnose why the gateway service is failing to start

echo "🔍 Diagnosing Gateway Service Issue..."
echo "===================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check 1: Service Status
print_section "Service Status"
sudo systemctl status eform-gateway.service --no-pager

# Check 2: Recent Logs
print_section "Recent Error Logs"
sudo journalctl -u eform-gateway.service --since "10 minutes ago" --no-pager

# Check 3: Port Conflicts
print_section "Port Usage Check"
print_info "Checking if port 3001 is already in use..."
if netstat -tln | grep -q ":3001"; then
    print_warning "Port 3001 is already in use:"
    netstat -tln | grep ":3001"
    print_info "Process using port 3001:"
    sudo lsof -i :3001 2>/dev/null || print_info "Could not determine process"
else
    print_success "Port 3001 is available"
fi

# Check 4: Gateway Build Files
print_section "Gateway Build Files"
if [ -d "app/gateway/dist" ]; then
    print_success "Gateway dist directory exists"
    ls -la app/gateway/dist/ | head -10
else
    print_error "Gateway dist directory missing - build may have failed"
fi

if [ -f "app/gateway/dist/index.js" ]; then
    print_success "Gateway main file exists"
else
    print_error "Gateway main file missing"
fi

# Check 5: Dependencies
print_section "Dependencies Check"
if [ -f "app/gateway/package.json" ]; then
    print_success "Gateway package.json exists"
else
    print_error "Gateway package.json missing"
fi

if [ -d "node_modules" ]; then
    print_success "Node modules directory exists"
else
    print_error "Node modules missing - run npm install"
fi

# Check 6: Environment Variables
print_section "Environment Variables"
print_info "Checking for environment file..."
if [ -f ".env" ]; then
    print_success ".env file exists"
    print_info "Environment variables (sensitive values hidden):"
    grep -E "^[A-Z_]+" .env | sed 's/=.*/=***/' || print_info "No environment variables found"
else
    print_warning ".env file not found"
fi

# Check 7: Database Connection
print_section "Database Check"
if [ -f "database.db" ]; then
    print_success "Database file exists"
    ls -la database.db
else
    print_warning "Database file not found in current directory"
    find . -name "*.db" -type f 2>/dev/null | head -5
fi

# Check 8: File Permissions
print_section "File Permissions"
print_info "Gateway directory permissions:"
ls -la app/gateway/ | head -5

print_info "Current user and groups:"
id

# Check 9: System Resources
print_section "System Resources"
print_info "Memory usage:"
free -h

print_info "Disk space:"
df -h . | head -2

# Check 10: Node.js Version
print_section "Node.js Environment"
print_info "Node.js version:"
node --version

print_info "NPM version:"
npm --version

# Suggested fixes
print_section "Suggested Fixes"
echo "Based on the diagnostics above, try these fixes in order:"
echo ""
echo "1. 🔄 Kill any processes using port 3001:"
echo "   sudo lsof -ti:3001 | xargs sudo kill -9"
echo ""
echo "2. 🏗️  Rebuild the gateway:"
echo "   npm run build:gateway"
echo ""
echo "3. 🔧 Check gateway configuration:"
echo "   cat app/gateway/src/index.ts | head -20"
echo ""
echo "4. 🗂️  Verify database path:"
echo "   ls -la *.db"
echo ""
echo "5. 🔄 Restart with clean slate:"
echo "   sudo systemctl stop eform-*"
echo "   sleep 5"
echo "   sudo systemctl start eform-gateway"
echo ""
echo "6. 📋 Check service file:"
echo "   sudo systemctl cat eform-gateway.service"
echo ""
echo "7. 🧹 Clean and rebuild everything:"
echo "   npm run clean"
echo "   npm install"
echo "   npm run build"
echo ""

print_section "Next Steps"
echo "1. Review the diagnostics above"
echo "2. Try the suggested fixes"
echo "3. If still failing, share the output of this script"
echo "4. Check the service logs again: sudo journalctl -u eform-gateway.service -f"