#!/bin/bash

echo "🚀 Complete eForm Locker System Setup"
echo "====================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the project root."
    exit 1
fi

echo "📍 Current directory: $(pwd)"
echo ""

# Step 1: Install dependencies
echo "1️⃣  Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"
echo ""

# Step 2: Initialize database
echo "2️⃣  Initializing database..."
node scripts/initialize-database.js
if [ $? -ne 0 ]; then
    echo "❌ Database initialization failed"
    exit 1
fi
echo "✅ Database initialized"
echo ""

# Step 3: Verify database setup
echo "3️⃣  Verifying database setup..."
node scripts/fix-database-setup.js
if [ $? -ne 0 ]; then
    echo "❌ Database verification failed"
    exit 1
fi
echo "✅ Database verified"
echo ""

# Step 4: Create admin user
echo "4️⃣  Creating admin user..."
echo "You will now be prompted to create an admin user."
echo ""
node scripts/create-admin-directly.js
if [ $? -ne 0 ]; then
    echo "❌ Admin user creation failed"
    exit 1
fi
echo "✅ Admin user created"
echo ""

# Step 5: Test authentication
echo "5️⃣  Testing authentication..."
echo "Running authentication test..."
node scripts/debug-authentication.js
echo ""

# Step 6: Build applications
echo "6️⃣  Building applications..."

echo "   Building panel..."
cd app/panel
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Panel build failed"
    exit 1
fi
cd ../..

echo "   Building gateway..."
cd app/gateway
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Gateway build failed"
    exit 1
fi
cd ../..

echo "   Building kiosk..."
cd app/kiosk
npm install
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Kiosk build failed"
    exit 1
fi
cd ../..

echo "✅ All applications built successfully"
echo ""

# Step 7: Final system check
echo "7️⃣  Final system check..."
node scripts/check-system-status.js
echo ""

echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Your eForm Locker System is now ready!"
echo ""
echo "🚀 To start the services:"
echo "   Panel:  cd app/panel && npm run start"
echo "   Gateway: cd app/gateway && npm run start"
echo "   Kiosk:  cd app/kiosk && npm run start"
echo ""
echo "🌐 Access URLs:"
echo "   Panel:  http://$(hostname -I | awk '{print $1}'):3002/"
echo "   Kiosk:  http://$(hostname -I | awk '{print $1}'):3000/"
echo ""
echo "🔑 Use the admin credentials you just created to log in!"
echo ""
echo "📋 For troubleshooting:"
echo "   Database: node scripts/debug-authentication.js"
echo "   Status:   node scripts/check-system-status.js"