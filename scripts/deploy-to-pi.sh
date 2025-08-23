#!/bin/bash

echo "🚀 Deploying eForm Locker System to Raspberry Pi..."
echo "=================================================="

# Check if we're on the Pi
if [[ $(uname -m) != "armv7l" && $(uname -m) != "aarch64" ]]; then
    echo "⚠️  This script should be run on the Raspberry Pi"
    echo "   Current architecture: $(uname -m)"
    echo "   Expected: armv7l or aarch64"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main
if [ $? -ne 0 ]; then
    echo "❌ Failed to pull changes"
    exit 1
fi

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install root dependencies"
    exit 1
fi

# Install workspace dependencies
echo "📦 Installing workspace dependencies..."
npm install --workspaces
if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Some workspace dependencies failed to install"
fi

# Step 3: Run database migrations
echo "🗄️  Running database migrations..."
npm run migrate
if [ $? -ne 0 ]; then
    echo "❌ Failed to run migrations"
    exit 1
fi

# Step 4: Validate the fix
echo "🔍 Validating database fix..."
if command -v bcrypt >/dev/null 2>&1 && npm list bcrypt >/dev/null 2>&1; then
    echo "Using full validation with bcrypt..."
    node scripts/validate-complete-fix.js
else
    echo "Using simple validation (bcrypt not available)..."
    node scripts/validate-database-simple.js
fi

if [ $? -ne 0 ]; then
    echo "❌ Validation failed"
    exit 1
fi

# Step 5: Check for admin user
echo "👤 Checking for admin users..."
ADMIN_COUNT=$(sqlite3 data/eform.db "SELECT COUNT(*) FROM users WHERE role = 'admin';")

if [ "$ADMIN_COUNT" -eq 0 ]; then
    echo "⚠️  No admin users found. Creating one now..."
    node scripts/create-admin-directly.js
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create admin user"
        exit 1
    fi
fi

# Step 6: Build panel application
echo "🔨 Building panel application..."
cd app/panel
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build panel"
    exit 1
fi
cd ../..

# Step 7: Build gateway application
echo "🔨 Building gateway application..."
cd app/gateway
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build gateway"
    exit 1
fi
cd ../..

# Step 8: Build kiosk application
echo "🔨 Building kiosk application..."
cd app/kiosk
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build kiosk"
    exit 1
fi
cd ../..

echo "✅ Deployment completed successfully!"
echo ""
echo "🎯 Next steps:"
echo "1. Start the services:"
echo "   - Panel:  cd app/panel && npm run start"
echo "   - Gateway: cd app/gateway && npm run start"
echo "   - Kiosk:  cd app/kiosk && npm run start"
echo ""
echo "2. Access the web interface:"
echo "   http://$(hostname -I | awk '{print $1}'):3002/"
echo ""
echo "3. Use the admin credentials you just created to log in"
echo ""
echo "🔧 For troubleshooting, run:"
echo "   node scripts/validate-complete-fix.js"