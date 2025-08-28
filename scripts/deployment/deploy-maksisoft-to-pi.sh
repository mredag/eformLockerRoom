#!/bin/bash

# Deploy Maksisoft Integration to Raspberry Pi
# This script deploys the Maksisoft integration to your Pi

echo "🚀 Deploying Maksisoft Integration to Raspberry Pi..."
echo ""

# Step 1: Deploy code to Pi
echo "📦 Step 1: Deploying code to Pi..."
if ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull origin main"; then
    echo "✅ Code deployed successfully"
else
    echo "❌ Failed to deploy code"
    exit 1
fi

# Step 2: Build panel service on Pi
echo "🔨 Step 2: Building panel service..."
if ssh pi@pi-eform-locker "cd /home/pi/eform-locker && npm run build:panel"; then
    echo "✅ Panel service built successfully"
else
    echo "❌ Failed to build panel service"
    exit 1
fi

# Step 3: Copy environment file to Pi
echo "⚙️ Step 3: Copying environment configuration..."
if scp .env pi@pi-eform-locker:/home/pi/eform-locker/.env; then
    echo "✅ Environment file copied successfully"
else
    echo "❌ Failed to copy environment file"
    exit 1
fi

# Step 4: Restart services on Pi
echo "🔄 Step 4: Restarting services..."
if ssh pi@pi-eform-locker "cd /home/pi/eform-locker && ./scripts/start-all-clean.sh"; then
    echo "✅ Services restarted successfully"
else
    echo "❌ Failed to restart services"
    exit 1
fi

# Step 5: Test the integration
echo "🧪 Step 5: Testing Maksisoft integration..."
sleep 5  # Wait for services to start

# Test the status endpoint
if curl -s "http://192.168.1.8:3001/api/maksi/status" | grep -q '"enabled":true'; then
    echo "✅ Maksisoft integration is enabled"
else
    echo "⚠️ Maksisoft integration may not be enabled"
fi

# Test the search endpoint
if curl -s "http://192.168.1.8:3001/api/maksi/search-by-rfid?rfid=0006851540" | grep -q '"success":true'; then
    echo "✅ Maksisoft search is working"
else
    echo "⚠️ Maksisoft search may need configuration"
fi

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Open admin panel: http://192.168.1.8:3001/lockers"
echo "2. Look for 'Maksisoft' buttons on locker cards"
echo "3. Click a button to test member search"
echo ""
echo "🔧 Manual Testing Commands:"
echo "curl http://192.168.1.8:3001/api/maksi/status"
echo "curl 'http://192.168.1.8:3001/api/maksi/search-by-rfid?rfid=0006851540'"