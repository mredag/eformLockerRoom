#!/bin/bash

echo "🚀 Starting all eForm Locker services (Clean Start)..."
echo "====================================================="

# Ensure we're in the right directory
cd /home/pi/eform-locker

# Get current IP address dynamically
get_current_ip() {
    # Try multiple methods to get IP address
    local ip=""
    
    # Method 1: hostname -I (most reliable on Pi)
    ip=$(hostname -I | awk '{print $1}' 2>/dev/null)
    
    # Method 2: ip route (fallback)
    if [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; then
        ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' | head -1)
    fi
    
    # Method 3: ifconfig (fallback)
    if [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; then
        ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
    fi
    
    # Default fallback
    if [ -z "$ip" ]; then
        ip="localhost"
    fi
    
    echo "$ip"
}

CURRENT_IP=$(get_current_ip)
echo "🌐 Detected IP Address: $CURRENT_IP"

# Run IP management first
echo "🔍 Checking for IP changes..."
if [ -f "scripts/network/dynamic-ip-manager.js" ]; then
    echo "🔍 Starting Dynamic IP Manager..."
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

# Wait for Gateway to start with better checking
echo "⏳ Waiting for Gateway to initialize..."
GATEWAY_READY=false
for i in {1..12}; do
    sleep 2
    if curl -s http://localhost:3000/health --connect-timeout 2 > /dev/null 2>&1; then
        GATEWAY_READY=true
        break
    fi
    echo "   Attempt $i/12..."
done

if [ "$GATEWAY_READY" = true ]; then
    echo "✅ Gateway started successfully"
else
    echo "❌ Gateway failed to start - check logs/gateway.log"
    tail -10 logs/gateway.log 2>/dev/null || echo "   No gateway log found"
    exit 1
fi

echo ""
echo "🖥️  Starting Kiosk service (port 3002)..."
nohup npm run start:kiosk > logs/kiosk.log 2>&1 &
KIOSK_PID=$!
echo "Kiosk PID: $KIOSK_PID"

# Wait for Kiosk to start with better checking
echo "⏳ Waiting for Kiosk to initialize..."
KIOSK_READY=false
for i in {1..15}; do
    sleep 2
    if curl -s http://localhost:3002/health --connect-timeout 2 > /dev/null 2>&1; then
        KIOSK_READY=true
        break
    fi
    echo "   Attempt $i/15..."
done

if [ "$KIOSK_READY" = true ]; then
    echo "✅ Kiosk started successfully"
else
    echo "⚠️  Kiosk taking longer to start - checking logs..."
    # Don't exit, just warn - Kiosk might need more time for hardware initialization
    tail -5 logs/kiosk.log 2>/dev/null || echo "   No kiosk log found yet"
fi

echo ""
echo "📊 Starting Panel service (port 3001)..."
nohup npm run start:panel > logs/panel.log 2>&1 &
PANEL_PID=$!
echo "Panel PID: $PANEL_PID"

# Wait for Panel to start with better checking
echo "⏳ Waiting for Panel to initialize..."
PANEL_READY=false
for i in {1..12}; do
    sleep 2
    if curl -s http://localhost:3001/health --connect-timeout 2 > /dev/null 2>&1; then
        PANEL_READY=true
        break
    fi
    echo "   Attempt $i/12..."
done

if [ "$PANEL_READY" = true ]; then
    echo "✅ Panel started successfully"
else
    echo "⚠️  Panel taking longer to start - checking logs..."
    tail -5 logs/panel.log 2>/dev/null || echo "   No panel log found yet"
fi

# Final comprehensive health check
echo ""
echo "🏥 Health check..."



# Check each service with simple curl tests
echo "Checking Gateway..."
if curl -s http://localhost:3000/health --connect-timeout 3 --max-time 5 >/dev/null 2>&1; then
    echo "✅ Gateway health: OK"
else
    echo "❌ Gateway health: Failed"
fi

echo "Checking Panel..."
if curl -s http://localhost:3001/health --connect-timeout 3 --max-time 5 >/dev/null 2>&1; then
    echo "✅ Panel health: OK"
else
    echo "❌ Panel health: Failed"
fi

echo "Checking Kiosk..."
if curl -s http://localhost:3002/health --connect-timeout 3 --max-time 5 >/dev/null 2>&1; then
    echo "✅ Kiosk health: OK"
else
    echo "❌ Kiosk health: Failed"
fi

echo ""
echo "🎉 All services started successfully!"
echo ""
echo "📋 Service URLs:"
echo "   - Gateway: http://$CURRENT_IP:3000"
echo "   - Panel:   http://$CURRENT_IP:3001"
echo "   - Kiosk:   http://$CURRENT_IP:3002"
echo ""
echo "📊 Process status:"
ps aux | grep "node.*dist/index.js" | grep -v grep | awk '{print $2 "        " $11 " " $12}'
echo ""
echo "✅ Clean startup complete!"
echo ""
echo "📝 Monitor logs:"
echo "   tail -f logs/gateway.log"
echo "   tail -f logs/kiosk.log"  
echo "   tail -f logs/panel.log"
echo ""
echo "🔧 Quick tests:"
echo "   curl http://$CURRENT_IP:3000/health  # Gateway"
echo "   curl http://$CURRENT_IP:3001/health  # Panel"
echo "   curl http://$CURRENT_IP:3002/health  # Kiosk"