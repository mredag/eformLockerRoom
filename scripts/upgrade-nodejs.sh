#!/bin/bash
# Node.js 20 LTS Upgrade Script
# This script upgrades Node.js from v18 to v20 LTS

set -e

echo "🚀 Starting Node.js 20 LTS upgrade..."

# Check current Node.js version
CURRENT_VERSION=$(node --version)
echo "📋 Current Node.js version: $CURRENT_VERSION"

# Check if already on Node.js 20
if [[ $CURRENT_VERSION == v20* ]]; then
    echo "✅ Already running Node.js 20 LTS"
    exit 0
fi

# Backup current Node.js version info
echo "💾 Backing up current environment info..."
node --version > /tmp/nodejs-backup-version.txt
npm --version > /tmp/npm-backup-version.txt

# Stop all eForm services
echo "🛑 Stopping eForm services..."
sudo systemctl stop eform-gateway || true
sudo systemctl stop eform-kiosk || true  
sudo systemctl stop eform-panel || true

# Install Node.js 20 LTS
echo "📦 Installing Node.js 20 LTS..."

# For Ubuntu/Debian
if command -v apt-get &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
# For CentOS/RHEL/Fedora
elif command -v yum &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo yum install -y nodejs
# For Alpine
elif command -v apk &> /dev/null; then
    sudo apk add --update nodejs npm
else
    echo "❌ Unsupported package manager. Please install Node.js 20 manually."
    exit 1
fi

# Verify installation
NEW_VERSION=$(node --version)
echo "✅ New Node.js version: $NEW_VERSION"

# Verify it's Node.js 20
if [[ $NEW_VERSION != v20* ]]; then
    echo "❌ Failed to install Node.js 20. Current version: $NEW_VERSION"
    exit 1
fi

# Update npm to latest compatible version
echo "📦 Updating npm..."
sudo npm install -g npm@latest

# Verify npm version
NPM_VERSION=$(npm --version)
echo "✅ npm version: $NPM_VERSION"

# Reinstall node_modules to ensure compatibility
echo "🔄 Reinstalling dependencies..."
cd /opt/eform-locker-system || cd /home/eform/eform-locker-system || {
    echo "❌ Could not find eForm installation directory"
    exit 1
}

# Clean and reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Run quick validation
echo "🧪 Running validation tests..."
npm run validate:nodejs || {
    echo "⚠️  Some validation checks failed. Please check the system manually."
}

# Start services
echo "🚀 Starting eForm services..."
sudo systemctl start eform-gateway
sudo systemctl start eform-kiosk
sudo systemctl start eform-panel

# Wait a moment for services to start
sleep 5

# Check service status
echo "📊 Checking service status..."
sudo systemctl status eform-gateway --no-pager -l
sudo systemctl status eform-kiosk --no-pager -l
sudo systemctl status eform-panel --no-pager -l

echo "✅ Node.js 20 LTS upgrade completed successfully!"
echo "📋 Previous version: $CURRENT_VERSION"
echo "📋 New version: $NEW_VERSION"
echo ""
echo "🔍 Next steps:"
echo "1. Monitor system logs for any issues"
echo "2. Run full integration tests"
echo "3. Test hardware communication"
echo "4. Verify all features are working correctly"