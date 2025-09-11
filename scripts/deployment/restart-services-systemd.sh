#!/bin/bash
set -Eeuo pipefail

echo "🚀 Restarting eForm Locker services via systemd..."
echo "====================================================="

sudo systemctl restart eform-locker.service

echo "✅ Restart command sent to systemd."
