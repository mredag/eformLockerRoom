#!/bin/bash

# Start Services with Auto-Sync
# This script ensures the system is synchronized before starting services

echo "🚀 Starting Eform Locker System with Auto-Sync..."
echo "=================================================="

# Change to project root
cd "$(dirname "$0")/.."

# Step 1: Run auto-sync
echo "🔄 Step 1: Running system auto-sync..."
node scripts/auto-sync-system.js --quiet

if [ $? -ne 0 ]; then
    echo "❌ Auto-sync failed! Aborting startup."
    exit 1
fi

echo "✅ Auto-sync completed successfully"

# Step 2: Stop any existing services
echo "🛑 Step 2: Stopping existing services..."
sudo pkill -f "node.*gateway" 2>/dev/null || true
sudo pkill -f "node.*kiosk" 2>/dev/null || true  
sudo pkill -f "node.*panel" 2>/dev/null || true
sleep 2

# Step 3: Start services in order
echo "🚀 Step 3: Starting services..."

# Start Gateway
echo "   Starting Gateway (port 3000)..."
npm run start:gateway > logs/gateway.log 2>&1 &
GATEWAY_PID=$!
sleep 3

# Check if Gateway started successfully
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "❌ Gateway failed to start"
    exit 1
fi
echo "   ✅ Gateway started (PID: $GATEWAY_PID)"

# Start Kiosk (with auto-sync built-in)
echo "   Starting Kiosk (port 3002)..."
npm run start:kiosk > logs/kiosk.log 2>&1 &
KIOSK_PID=$!
sleep 5

# Check if Kiosk started successfully
if ! curl -s http://localhost:3002/health > /dev/null; then
    echo "❌ Kiosk failed to start"
    exit 1
fi
echo "   ✅ Kiosk started (PID: $KIOSK_PID)"

# Start Panel
echo "   Starting Panel (port 3001)..."
npm run start:panel > logs/panel.log 2>&1 &
PANEL_PID=$!
sleep 3

# Check if Panel started successfully
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "⚠️  Panel health check failed (may require auth)"
fi
echo "   ✅ Panel started (PID: $PANEL_PID)"

# Step 4: Final verification
echo "🔍 Step 4: Final system verification..."

# Check service health
echo "   Checking service health..."
GATEWAY_HEALTH=$(curl -s http://localhost:3000/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
KIOSK_HEALTH=$(curl -s http://localhost:3002/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

echo "   - Gateway: $GATEWAY_HEALTH"
echo "   - Kiosk: $KIOSK_HEALTH"
echo "   - Panel: Running (PID: $PANEL_PID)"

# Check locker count
LOCKER_COUNT=$(curl -s 'http://localhost:3002/api/ui/layout?kioskId=kiosk-1' | grep -o '"totalLockers":[0-9]*' | cut -d':' -f2)
echo "   - Available lockers: $LOCKER_COUNT"

echo ""
echo "🎉 System startup completed successfully!"
echo "======================================"
echo "Services:"
echo "  - Gateway: http://localhost:3000 (PID: $GATEWAY_PID)"
echo "  - Kiosk UI: http://localhost:3002 (PID: $KIOSK_PID)" 
echo "  - Admin Panel: http://localhost:3001 (PID: $PANEL_PID)"
echo ""
echo "Logs:"
echo "  - Gateway: tail -f logs/gateway.log"
echo "  - Kiosk: tail -f logs/kiosk.log"
echo "  - Panel: tail -f logs/panel.log"
echo ""
echo "To stop all services: sudo pkill -f 'node.*'"

# Save PIDs for easy management
echo "$GATEWAY_PID" > .gateway.pid
echo "$KIOSK_PID" > .kiosk.pid  
echo "$PANEL_PID" > .panel.pid

echo "PIDs saved to .*.pid files for easy management"