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
GATEWAY_ATTEMPTS=0
while [ $GATEWAY_ATTEMPTS -lt 6 ]; do
    if curl -s http://localhost:3000/health --connect-timeout 3 > /dev/null; then
        echo "✅ Gateway started successfully"
        break
    else
        GATEWAY_ATTEMPTS=$((GATEWAY_ATTEMPTS + 1))
        if [ $GATEWAY_ATTEMPTS -lt 6 ]; then
            echo "⏳ Gateway not ready yet, waiting... (attempt $GATEWAY_ATTEMPTS/6)"
            sleep 2
        else
            echo "❌ Gateway failed to start after 6 attempts"
            echo "📝 Check logs: tail -10 logs/gateway.log"
        fi
    fi
done

echo ""
echo "🖥️  Starting Kiosk service (port 3002)..."
# Ensure kiosk WebSocket uses 8080 (default)
WEBSOCKET_PORT=8080 nohup npm run start:kiosk > logs/kiosk.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk PID: $KIOSK_PID"

# Wait for Kiosk to start (needs extra time for hardware initialization)
echo "⏳ Waiting for Kiosk to initialize (hardware + WebSocket setup)..."
sleep 8

# Check if Kiosk is running (Kiosk needs more time due to hardware initialization)
KIOSK_ATTEMPTS=0
while [ $KIOSK_ATTEMPTS -lt 10 ]; do
    if curl -s http://localhost:3002/health --connect-timeout 5 > /dev/null; then
        echo "✅ Kiosk started successfully"
        break
    else
        KIOSK_ATTEMPTS=$((KIOSK_ATTEMPTS + 1))
        if [ $KIOSK_ATTEMPTS -lt 10 ]; then
            echo "⏳ Kiosk not ready yet, waiting... (attempt $KIOSK_ATTEMPTS/10)"
            sleep 3
        else
            echo "❌ Kiosk failed to start after 10 attempts"
            echo "📝 Check logs: tail -10 logs/kiosk.log"
            # Don't exit - continue with other services
        fi
    fi
done

echo ""
echo "📊 Starting Panel service (port 3001)..."
# Avoid WebSocket port conflict with Kiosk by using 8081 for Panel
WEBSOCKET_PORT=8081 nohup npm run start:panel > logs/panel.log 2>&1 &
PANEL_PID=$!
echo "Panel PID: $PANEL_PID"

# Wait for Panel to start
echo "⏳ Waiting for Panel to initialize..."
PANEL_ATTEMPTS=0
while [ $PANEL_ATTEMPTS -lt 6 ]; do
    if curl -s http://localhost:3001/health --connect-timeout 3 > /dev/null; then
        echo "✅ Panel started successfully"
        break
    else
        PANEL_ATTEMPTS=$((PANEL_ATTEMPTS + 1))
        if [ $PANEL_ATTEMPTS -lt 6 ]; then
            echo "⏳ Panel not ready yet, waiting... (attempt $PANEL_ATTEMPTS/6)"
            sleep 2
        else
            echo "❌ Panel failed to start after 6 attempts"
            echo "📝 Check logs: tail -10 logs/panel.log"
        fi
    fi
done

# Final status check
echo ""
echo "🔍 Final Service Status:"
echo "========================"

# Give services a moment to fully initialize
sleep 3

# Function to check service health
check_service() {
    local service_name=$1
    local port=$2
    local endpoint=$3
    
    if curl -s "http://localhost:$port$endpoint" --connect-timeout 10 --max-time 15 >/dev/null 2>&1; then
        echo "✅ $service_name (port $port): Running"
        return 0
    else
        echo "❌ $service_name (port $port): Not responding"
        return 1
    fi
}

# Check all services
check_service "Gateway" "3000" "/health"
check_service "Panel" "3001" "/health"  
check_service "Kiosk" "3002" "/health"

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
