#!/bin/bash

echo "🚀 Starting eForm Locker Services (Proper Order)"
echo "================================================"

# Kill any existing services
echo "🛑 Stopping existing services..."
pkill -f "node.*panel" 2>/dev/null || true
pkill -f "node.*gateway" 2>/dev/null || true  
pkill -f "node.*kiosk" 2>/dev/null || true
sleep 3

# Build all services
echo "🔨 Building all services..."
npm run build

# Create logs directory
mkdir -p logs

# Step 1: Start Gateway service FIRST (port 3000)
echo "🌐 Step 1: Starting Gateway service..."
npm run start:gateway > logs/gateway.log 2>&1 &
GATEWAY_PID=$!
echo "Gateway PID: $GATEWAY_PID"

# Wait for Gateway to be ready
echo "⏳ Waiting for Gateway to start..."
sleep 5

# Check if Gateway is running
if curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null; then
    echo "✅ Gateway service running on port 3000"
else
    echo "❌ Gateway service failed to start"
    exit 1
fi

# Step 2: Start Kiosk service (port 3002) - it will use the serial port
echo "🖥️  Step 2: Starting Kiosk service..."
npm run start:kiosk > logs/kiosk.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk PID: $KIOSK_PID"

# Wait for Kiosk to initialize
echo "⏳ Waiting for Kiosk to initialize..."
sleep 8

# Check if Kiosk is running
if curl -s http://localhost:3002/health --connect-timeout 3 > /dev/null; then
    echo "✅ Kiosk service running on port 3002"
else
    echo "⚠️  Kiosk service may have hardware issues (check logs/kiosk.log)"
fi

# Step 3: Start Panel service (port 3001) - it will detect Kiosk and use queue-based
echo "📊 Step 3: Starting Panel service..."
npm run start:panel > logs/panel.log 2>&1 &
PANEL_PID=$!
echo "Panel PID: $PANEL_PID"

# Wait for Panel to start
echo "⏳ Waiting for Panel to start..."
sleep 5

# Check if Panel is running
if curl -s http://localhost:3001/health --connect-timeout 3 > /dev/null; then
    echo "✅ Panel service running on port 3001"
else
    echo "❌ Panel service failed to start"
fi

echo ""
echo "🎯 Service Status Summary:"
echo "=========================="

# Final status check
echo "Gateway (port 3000):"
if curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null; then
    echo "  ✅ Running"
else
    echo "  ❌ Not responding"
fi

echo "Kiosk (port 3002):"
if curl -s http://localhost:3002/health --connect-timeout 3 > /dev/null; then
    echo "  ✅ Running"
else
    echo "  ❌ Not responding"
fi

echo "Panel (port 3001):"
if curl -s http://localhost:3001/health --connect-timeout 3 > /dev/null; then
    echo "  ✅ Running"
else
    echo "  ❌ Not responding"
fi

echo ""
echo "📋 Expected Behavior:"
echo "===================="
echo "✅ Queue-based (Open button): Gateway → Kiosk → Hardware"
echo "⚠️  Direct relay: Will show 'Port in use by Kiosk service' message"
echo ""
echo "🔧 To test:"
echo "node scripts/test-queue-vs-direct.js"
echo ""
echo "📝 To view logs:"
echo "tail -f logs/gateway.log"
echo "tail -f logs/kiosk.log"
echo "tail -f logs/panel.log"