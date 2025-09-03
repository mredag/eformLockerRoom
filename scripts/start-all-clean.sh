#!/bin/bash

echo "🚀 Starting all eForm Locker services (Clean Start)..."
echo "====================================================="

# Ensure we're in the right directory
cd /home/pi/eform-locker

# Run IP management first
echo "🔍 Checking for IP changes..."
if [ -f "scripts/network/dynamic-ip-manager.js" ]; then
    node scripts/network/dynamic-ip-manager.js run
else
    echo "ℹ️  IP management not installed yet"
fi

# Kill any existing services
echo "🛑 Stopping existing services..."
sudo killall node 2>/dev/null || true
sleep 3

# Verify no processes are running
RUNNING=$(ps aux | grep "node.*dist/index.js" | grep -v grep | wc -l)
if [ "$RUNNING" -gt 0 ]; then
    echo "⚠️  Warning: $RUNNING processes still running, force killing..."
    sudo pkill -9 -f "node.*dist/index.js"
    sleep 2
fi

# Create logs directory
mkdir -p logs

# Run power interruption recovery
echo "🔌 Running power interruption recovery..."
if [ -f "scripts/power-interruption-recovery.js" ]; then
    node scripts/power-interruption-recovery.js
    if [ $? -eq 0 ]; then
        echo "✅ Power interruption recovery completed"
    else
        echo "⚠️  Power interruption recovery had issues - check logs"
    fi
else
    echo "ℹ️  Power interruption recovery script not found"
fi

# Build all services
echo "🔨 Building services..."
npm run build

echo ""
echo "🌐 Starting Gateway service (port 3000)..."
nohup npm run start:gateway > logs/gateway.log 2>&1 &
GATEWAY_PID=$!
echo "Gateway PID: $GATEWAY_PID"

# Wait for Gateway to start
echo "⏳ Waiting for Gateway to initialize..."
sleep 5

# Check if Gateway is running
if curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null; then
    echo "✅ Gateway started successfully"
else
    echo "❌ Gateway failed to start"
    exit 1
fi

echo ""
echo "🖥️  Starting Kiosk service (port 3002)..."
nohup npm run start:kiosk > logs/kiosk.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk PID: $KIOSK_PID"

# Wait for Kiosk to start
echo "⏳ Waiting for Kiosk to initialize..."
sleep 5

# Check if Kiosk is running
if curl -s http://localhost:3002/health --connect-timeout 3 > /dev/null; then
    echo "✅ Kiosk started successfully"
else
    echo "❌ Kiosk failed to start"
fi

echo ""
echo "📊 Starting Panel service (port 3001)..."
nohup npm run start:panel > logs/panel.log 2>&1 &
PANEL_PID=$!
echo "Panel PID: $PANEL_PID"

# Wait for Panel to start
echo "⏳ Waiting for Panel to initialize..."
sleep 5

# Final status check
echo ""
echo "🔍 Final Service Status:"
echo "========================"

# Check Gateway
if curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null; then
    echo "✅ Gateway (port 3000): Running"
else
    echo "❌ Gateway (port 3000): Not responding"
fi

# Check Panel  
if curl -s http://localhost:3001 --connect-timeout 3 > /dev/null; then
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
echo "🎯 Services Started! Access URLs:"
echo "================================="
CURRENT_IP=$(node scripts/network/dynamic-ip-manager.js current-ip 2>/dev/null || hostname -I | awk '{print $1}')
if [ -z "$CURRENT_IP" ]; then
  CURRENT_IP="localhost"
fi
echo "📊 Admin Panel:  http://$CURRENT_IP:3001"
echo "🔧 Relay Control: http://$CURRENT_IP:3001/relay"
echo "📋 Lockers:      http://$CURRENT_IP:3001/lockers"
echo "🌐 Gateway API:  http://$CURRENT_IP:3000"
echo "🖥️  Kiosk UI:     http://$CURRENT_IP:3002"
echo ""
echo "📝 View logs with:"
echo "tail -f logs/gateway.log"
echo "tail -f logs/kiosk.log"
echo "tail -f logs/panel.log"
