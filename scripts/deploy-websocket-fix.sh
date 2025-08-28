#!/bin/bash

# Deploy WebSocket fix to Raspberry Pi
# This script deploys the WebSocket connection fixes to the Pi

echo "🚀 Deploying WebSocket connection fix to Raspberry Pi..."

# Check if we're on the development machine
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "📝 Windows detected - use PowerShell commands instead"
    echo "Run: ssh pi@pi-eform-locker \"cd /home/pi/eform-locker && git pull origin main\""
    exit 1
fi

# SSH to Pi and deploy
echo "📡 Connecting to Raspberry Pi..."
ssh pi@pi-eform-locker << 'EOF'
    echo "📂 Navigating to project directory..."
    cd /home/pi/eform-locker
    
    echo "📥 Pulling latest changes..."
    git pull origin main
    
    echo "🛑 Stopping Panel service..."
    sudo pkill -f "node.*panel" || echo "Panel service not running"
    
    echo "⏳ Waiting for service to stop..."
    sleep 3
    
    echo "🚀 Starting Panel service with WebSocket support..."
    nohup npm run start:panel > logs/panel.log 2>&1 &
    
    echo "⏳ Waiting for service to start..."
    sleep 5
    
    echo "🔍 Checking service status..."
    if curl -s http://localhost:3001/health > /dev/null; then
        echo "✅ Panel service is running"
    else
        echo "❌ Panel service failed to start"
        echo "📋 Last 10 lines of log:"
        tail -10 logs/panel.log
        exit 1
    fi
    
    echo "🔌 Testing WebSocket server..."
    if nc -z localhost 8080; then
        echo "✅ WebSocket server is listening on port 8080"
    else
        echo "❌ WebSocket server is not responding on port 8080"
        echo "📋 Checking if port is in use:"
        netstat -tlnp | grep :8080 || echo "Port 8080 is not in use"
    fi
    
    echo "🎉 Deployment completed!"
    echo "🌐 Admin Panel: http://192.168.1.8:3001/lockers"
    echo "🔌 WebSocket: ws://192.168.1.8:8080"
EOF

echo "✅ Deployment script completed"
echo ""
echo "🧪 To test the WebSocket connection from your PC:"
echo "node scripts/test-websocket-connection.js"
echo ""
echo "🌐 Open the admin panel to verify no more WebSocket errors:"
echo "http://192.168.1.8:3001/lockers"