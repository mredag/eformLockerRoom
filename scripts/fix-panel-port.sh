#!/bin/bash

echo "🔍 Checking port usage..."
echo "=========================="

# Check what's using port 3003
echo "Port 3003 usage:"
sudo netstat -tlnp | grep :3003 || echo "Port 3003 is free"

# Check what's using port 3001  
echo "Port 3001 usage:"
sudo netstat -tlnp | grep :3001 || echo "Port 3001 is free"

# Kill any processes using these ports
echo ""
echo "🛑 Killing processes on ports 3001 and 3003..."
sudo pkill -f "node.*panel" 2>/dev/null || true
sudo fuser -k 3001/tcp 2>/dev/null || true
sudo fuser -k 3003/tcp 2>/dev/null || true

sleep 2

echo ""
echo "✅ Ports cleared. Starting Panel on port 3001..."

# Set the correct port and start Panel
export PANEL_PORT=3001
cd ~/eform-locker
npm run build:panel
npm run start:panel &

echo "Panel PID: $!"
echo ""
echo "⏳ Waiting for Panel to start..."
sleep 5

# Check if Panel is running
if curl -s http://localhost:3001/health --connect-timeout 3 > /dev/null; then
    echo "✅ Panel service running on port 3001"
else
    echo "❌ Panel service failed to start on port 3001"
fi