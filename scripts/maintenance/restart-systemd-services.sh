#!/bin/bash
set -Eeuo pipefail

echo "🚀 Restarting all eForm Locker services via systemd..."
echo "====================================================="

# Check if the eform-locker service exists
if ! systemctl list-units --type=service --all | grep -q 'eform-locker.service'; then
    echo "❌ Error: The 'eform-locker.service' does not seem to be installed."
    echo "   Please run the installation script first:"
    echo "   sudo bash scripts/deployment/install-startup-system.sh"
    exit 1
fi

# Restart the main service
# Using sudo because systemctl requires root privileges
sudo systemctl restart eform-locker.service

echo "⏳ Waiting for services to come back online..."
sleep 5 # Give services a moment to initialize

# Perform a quick health check
HEALTH_OK=true
SERVICES=("gateway:3000" "panel:3001" "kiosk:3002")

for service in "${SERVICES[@]}"; do
    NAME=$(echo "$service" | cut -d: -f1)
    PORT=$(echo "$service" | cut -d: -f2)

    if curl -s --head --fail --connect-timeout 5 http://localhost:$PORT/health > /dev/null; then
        echo "✅ $NAME service is responsive."
    else
        echo "❌ $NAME service failed to become responsive."
        HEALTH_OK=false
    fi
done

echo "====================================================="
if [ "$HEALTH_OK" = true ]; then
    echo "🎉 All services restarted successfully and are healthy."
    exit 0
else
    echo "⚠️  Some services did not come back online correctly. Please check the logs."
    echo "   - sudo journalctl -u eform-locker -f"
    echo "   - tail -f /home/pi/eform-locker/logs/*.log"
    exit 1
fi
