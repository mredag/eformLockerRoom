#!/bin/bash

# Fix Kiosk Startup Issues
# This script helps diagnose and fix common kiosk startup problems

echo "🔧 Eform Locker - Kiosk Startup Fix Script"
echo "=========================================="

# Check Node.js version
echo "📋 Checking Node.js version..."
node --version
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the project root directory"
    echo "Please run this script from the eform-locker project root"
    exit 1
fi

# Check if kiosk directory exists
if [ ! -d "app/kiosk" ]; then
    echo "❌ Error: app/kiosk directory not found"
    exit 1
fi

echo "🧹 Cleaning old build artifacts..."
rm -rf app/kiosk/dist
rm -rf app/kiosk/node_modules/.cache
echo "✅ Cleaned build artifacts"

echo "📦 Installing dependencies..."
cd app/kiosk
npm install
echo "✅ Dependencies installed"

echo "🔨 Building kiosk service..."
npm run build
echo "✅ Build completed"

# Check if dist/index.js exists
if [ ! -f "dist/index.js" ]; then
    echo "❌ Error: Build failed - dist/index.js not found"
    exit 1
fi

echo "🔍 Checking build output..."
ls -la dist/
echo ""

# Test the built file for syntax errors
echo "🧪 Testing built file for syntax errors..."
node -c dist/index.js
if [ $? -eq 0 ]; then
    echo "✅ No syntax errors found"
else
    echo "❌ Syntax errors found in built file"
    exit 1
fi

echo "🚀 Testing kiosk startup (will exit after 5 seconds)..."
timeout 5s npm start || true
echo ""

echo "✅ Kiosk startup fix completed!"
echo ""
echo "To start the kiosk service:"
echo "  cd app/kiosk"
echo "  npm start"
echo ""
echo "If you still get errors, check:"
echo "  1. Serial port permissions: sudo usermod -a -G dialout $USER"
echo "  2. USB device permissions: ls -la /dev/ttyUSB*"
echo "  3. Environment variables: echo \$MODBUS_PORT"