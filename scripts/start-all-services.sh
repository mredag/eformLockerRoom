#!/bin/bash

echo "🚀 Starting all eForm Locker services..."
echo "========================================"

# Kill any existing services
echo "🛑 Stopping existing services..."
pkill -f "node.*panel" 2>/dev/null || true
pkill -f "node.*gateway" 2>/dev/null || true  
pkill -f "node.*kiosk" 2>/dev/null || true
sleep 2

# Build all services
echo "🔨 Building services..."
npm run build

# Start Gateway service (port 3000)
echo "🌐 Starting Gateway service..."
cd ~/eform-locker
npm run start:gateway > logs/gateway.log 2>&1 &
GATEWAY_PID=$!
echo "Gateway PID: $GATEWAY_PID"

# Wait for Gateway to start
sleep 3

# Start Kiosk service (port 3002)  
echo "🖥️  Starting Kiosk service..."
npm run start:kiosk > logs/kiosk.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk PID: $KIOSK_PID"

# Wait for Kiosk to start
sleep 3

# Start Panel service (port 3001)
echo "📊 Starting Panel service..."
npm run start:panel > logs/panel.log 2>&1 &
PANEL_PID=$!
echo "Panel PID: $PANEL_PID"

# Wait for all services to initialize
echo "⏳ Waiting for services to initialize..."
sleep 5

# Check service status
echo ""
echo "🔍 Service Status Check:"
echo "========================"

# Check Gateway
if curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null; then
    echo "✅ Gateway (port 3000): Running"
else
    echo "❌ Gateway (port 3000): Not responding"
fi

# Check Panel  
if curl -s http://localhost:3001/health --connect-timeout 3 > /dev/null; then
    echo "✅ Panel (port 3001): Running"
else
    echo "❌ Panel (port 3001): Not responding"
fi

# Check Kiosk
if curl -s http://localhost:3002/health --connect-timeout 3 > /dev/null; then
    echo "✅ Kiosk (port 3002): Running"
else
    echo "❌ Kiosk (port 3002): Not responding"
fi

echo ""
echo "🎯 All services started! PIDs:"
echo "Gateway: $GATEWAY_PID"
echo "Kiosk: $KIOSK_PID" 
echo "Panel: $PANEL_PID"
echo ""
echo "📋 To test the system, run:"
echo "node scripts/test-queue-vs-direct.js"
echo ""
echo "📝 To view logs:"
echo "tail -f logs/gateway.log"
echo "tail -f logs/kiosk.log"
echo "tail -f logs/panel.log"