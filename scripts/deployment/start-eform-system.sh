#!/bin/bash
set -Eeuo pipefail

echo "🚀 Starting eForm Locker System (Consolidated Service)..."
echo "=========================================================="

# Ensure we're in the right directory
cd /home/pi/eform-locker

# 1. Perform Hardware Initialization
echo "⚙️  Performing hardware initialization..."
bash /home/pi/eform-locker/scripts/deployment/hardware-init.sh
if [ $? -ne 0 ]; then
    echo "❌ Hardware initialization failed. Aborting startup."
    exit 1
fi
echo "✅ Hardware initialization complete."
echo ""

# 2. Build all services
echo "🔨 Building services (if necessary)..."
npm run build --if-present
echo "✅ Build complete."
echo ""

# 3. Start Application Services in the background
echo "🌐 Starting application services..."
npm run start:kiosk &
npm run start:panel &
echo "✅ Kiosk and Panel services started in the background."
echo ""

# 4. Start the System Monitor in the background
echo "📊 Starting system monitor..."
bash /home/pi/eform-locker/scripts/deployment/system-monitor.sh &
echo "✅ System monitor started."
echo ""

echo "🚀 Starting Gateway service in the foreground..."
# This will be the main process that systemd monitors.
exec npm run start:gateway
