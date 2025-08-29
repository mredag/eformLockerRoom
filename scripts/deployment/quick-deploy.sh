#!/bin/bash

# Quick deployment script for eForm Locker System
# Usage: ./scripts/deployment/quick-deploy.sh ["commit message"]

set -e

# Configuration
PI_HOST="pi@pi-eform-locker"
PI_PROJECT_PATH="/home/pi/eform-locker"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get commit message
COMMIT_MESSAGE="${1:-chore: quick deployment update}"

echo -e "${BLUE}🚀 Quick Deployment Started${NC}"

# Step 1: Git operations
echo "📝 Adding and committing changes..."
git add .
git commit -m "$COMMIT_MESSAGE"

echo "🚀 Pushing to remote..."
git push origin main

echo -e "${GREEN}✅ Local Git operations completed${NC}"

# Step 2: Deploy to Pi
echo "📥 Pulling changes on Pi and restarting services..."

ssh "$PI_HOST" "cd $PI_PROJECT_PATH && git pull origin main && ./scripts/start-all-clean.sh"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✅ 🎉 Deployment completed successfully!${NC}"
    echo ""
    echo "📊 Access Points:"
    echo "  • Admin Panel: http://192.168.1.8:3001"
    echo "  • Kiosk UI:    http://192.168.1.8:3002"
    echo "  • Gateway API: http://192.168.1.8:3000"
else
    echo -e "${RED}❌ Deployment failed on Pi${NC}"
    exit 1
fi