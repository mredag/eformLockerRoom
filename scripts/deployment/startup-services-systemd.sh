#!/bin/bash
set -Eeuo pipefail

echo "🚀 Starting all eForm Locker services for systemd..."
echo "====================================================="

# Ensure we're in the right directory
cd /home/pi/eform-locker

# Build all services if needed
echo "🔨 Building services (if necessary)..."
npm run build --if-present

# Start all services in parallel.
# systemd will manage the processes, so we just need to start them.
# The logs will be captured by systemd's journal.
npm run start:gateway &
npm run start:kiosk &
npm run start:panel &

# Wait for all background processes to finish.
# This is important for systemd to know that the script has completed
# its startup task and the services are now running.
wait
