#!/bin/bash
set -Eeuo pipefail

echo "🛑 Stopping all eForm Locker services..."
echo "====================================================="

# Find and kill all node processes related to the application.
# Using pkill is a reliable way to do this.
# The -f flag matches against the full command line.
pkill -f "node .*dist/index.js" || true

echo "✅ All services stopped."
