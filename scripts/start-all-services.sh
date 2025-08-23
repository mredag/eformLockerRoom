#!/bin/bash

# Eform Locker System - Complete Service Startup
# This script starts all required services in the correct order

echo "🚀 Eform Locker System - Service Startup"
echo "========================================"

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the project root directory"
    echo "Please run this script from the eform-locker project root"
    exit 1
fi

# Set database path
export EFORM_DB_PATH="$(pwd)/data/eform.db"
echo "📍 Database path: $EFORM_DB_PATH"

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to start a service in background
start_service() {
    local service_name=$1
    local service_dir=$2
    local port=$3
    
    echo ""
    echo "🔄 Starting $service_name service..."
    
    # Check if port is already in use
    if check_port $port; then
        echo "⚠️  Port $port is already in use - $service_name may already be running"
        return 0
    fi
    
    # Start the service
    cd "$service_dir"
    npm start &
    local pid=$!
    cd - > /dev/null
    
    # Wait a moment and check if service started
    sleep 3
    if kill -0 $pid 2>/dev/null; then
        echo "✅ $service_name started successfully (PID: $pid, Port: $port)"
        return 0
    else
        echo "❌ Failed to start $service_name"
        return 1
    fi
}

# Step 1: Start Gateway Service (required by kiosk)
echo "📡 Starting Gateway Service..."
if ! start_service "Gateway" "app/gateway" 3000; then
    echo "❌ Gateway service failed to start - this is required for kiosk"
    echo "Try starting it manually:"
    echo "  cd app/gateway"
    echo "  npm start"
    exit 1
fi

# Step 2: Start Panel Service (optional but recommended)
echo "🖥️  Starting Panel Service..."
start_service "Panel" "app/panel" 3001

# Step 3: Start Kiosk Service
echo "🏪 Starting Kiosk Service..."
if ! start_service "Kiosk" "app/kiosk" 3002; then
    echo "❌ Kiosk service failed to start"
    echo ""
    echo "🔧 Troubleshooting steps:"
    echo "1. Check if database exists: ls -la data/eform.db"
    echo "2. Run the comprehensive fix: node scripts/final-kiosk-fix.js"
    echo "3. Check gateway service is running: curl http://localhost:3000/health"
    echo "4. Try starting kiosk manually:"
    echo "   export EFORM_DB_PATH=\"$(pwd)/data/eform.db\""
    echo "   cd app/kiosk"
    echo "   npm start"
    exit 1
fi

# Step 4: Start Agent Service (optional)
echo "🤖 Starting Agent Service..."
start_service "Agent" "app/agent" 3003

echo ""
echo "🎉 Service Startup Complete!"
echo "=========================="
echo "✅ Gateway: http://localhost:3000"
echo "✅ Panel:   http://localhost:3001" 
echo "✅ Kiosk:   http://localhost:3002"
echo "✅ Agent:   http://localhost:3003"
echo ""
echo "📊 Service Status:"
echo "Gateway: $(check_port 3000 && echo "Running" || echo "Stopped")"
echo "Panel:   $(check_port 3001 && echo "Running" || echo "Stopped")"
echo "Kiosk:   $(check_port 3002 && echo "Running" || echo "Stopped")"
echo "Agent:   $(check_port 3003 && echo "Running" || echo "Stopped")"
echo ""
echo "🛑 To stop all services:"
echo "  pkill -f 'node.*dist/index.js'"
echo ""
echo "📋 To check logs:"
echo "  Gateway: cd app/gateway && npm start"
echo "  Kiosk:   cd app/kiosk && npm start"