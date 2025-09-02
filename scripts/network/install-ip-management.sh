#!/bin/bash
# Install IP Management System
# Sets up automatic IP detection and management

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔧 Installing IP Management System..."

# Make scripts executable
chmod +x "$SCRIPT_DIR/startup-ip-check.sh"
chmod +x "$SCRIPT_DIR/dynamic-ip-manager.js"

# Create systemd service for IP management
SERVICE_FILE="/etc/systemd/system/eform-ip-manager.service"

echo "📝 Creating systemd service..."
sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=eForm IP Management Service
After=network.target
Wants=network.target

[Service]
Type=oneshot
User=pi
WorkingDirectory=$PROJECT_ROOT
ExecStart=$SCRIPT_DIR/startup-ip-check.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
echo "🚀 Enabling IP management service..."
sudo systemctl daemon-reload
sudo systemctl enable eform-ip-manager.service

# Add to existing startup script
STARTUP_SCRIPT="$PROJECT_ROOT/scripts/start-all-clean.sh"
if [ -f "$STARTUP_SCRIPT" ]; then
    echo "🔄 Integrating with startup script..."
    
    # Check if IP management is already integrated
    if ! grep -q "dynamic-ip-manager" "$STARTUP_SCRIPT"; then
        # Add IP management to the beginning of the startup script
        sed -i '2i\\n# Run IP management\necho "🔍 Checking for IP changes..."\nnode scripts/network/dynamic-ip-manager.js run\n' "$STARTUP_SCRIPT"
        echo "✅ Integrated with startup script"
    else
        echo "ℹ️  Already integrated with startup script"
    fi
fi

# Create cron job for periodic IP checks
echo "⏰ Setting up periodic IP checks..."
CRON_JOB="*/5 * * * * cd $PROJECT_ROOT && node scripts/network/dynamic-ip-manager.js run > /dev/null 2>&1"

# Add to crontab if not already present
(crontab -l 2>/dev/null | grep -v "dynamic-ip-manager"; echo "$CRON_JOB") | crontab -

echo ""
echo "✅ IP Management System installed successfully!"
echo ""
echo "📋 What was installed:"
echo "   • Systemd service: eform-ip-manager.service"
echo "   • Startup integration: Added to start-all-clean.sh"
echo "   • Periodic checks: Every 5 minutes via cron"
echo ""
echo "🔧 Manual commands:"
echo "   • Check IP: node scripts/network/dynamic-ip-manager.js current-ip"
echo "   • Full update: node scripts/network/dynamic-ip-manager.js run"
echo "   • View status: node scripts/network/dynamic-ip-manager.js status"
echo ""
echo "📊 Service management:"
echo "   • Start: sudo systemctl start eform-ip-manager"
echo "   • Status: sudo systemctl status eform-ip-manager"
echo "   • Logs: journalctl -u eform-ip-manager"