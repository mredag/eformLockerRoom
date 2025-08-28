#!/bin/bash

# Clean Kiosk Startup Script
# Ensures only one Kiosk process runs at a time

echo "🧹 Cleaning up any existing Kiosk processes..."

# Kill any existing node processes
sudo killall node 2>/dev/null || true
sleep 3

# Verify no processes are running
RUNNING=$(ps aux | grep "node dist/index.js" | grep -v grep | wc -l)
if [ "$RUNNING" -gt 0 ]; then
    echo "⚠️  Warning: $RUNNING processes still running, force killing..."
    sudo pkill -9 -f "node dist/index.js"
    sleep 2
fi

echo "✅ All processes cleaned up"

# Change to project directory
cd /home/pi/eform-locker

echo "🚀 Starting clean Kiosk service..."

# Start Kiosk service
npm run start:kiosk

echo "🔧 Kiosk service started"