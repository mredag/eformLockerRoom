#!/bin/bash

# Database Setup Script for Raspberry Pi
# This script initializes the database with all required tables

echo "🗄️  Eform Locker - Database Setup"
echo "================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the project root directory"
    echo "Please run this script from the eform-locker project root"
    exit 1
fi

echo "📋 Checking database status..."

# Check if tsx is available
if ! command -v tsx &> /dev/null; then
    echo "📦 Installing tsx globally..."
    npm install -g tsx
fi

echo "🔍 Checking current migration status..."
npm run migrate:status

echo ""
echo "🔄 Running database migrations..."
npm run migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database setup completed successfully!"
    echo ""
    echo "📊 Final migration status:"
    npm run migrate:status
    echo ""
    echo "🚀 You can now start the kiosk service:"
    echo "  cd app/kiosk"
    echo "  npm start"
else
    echo ""
    echo "❌ Database setup failed!"
    echo ""
    echo "Manual steps to try:"
    echo "1. Check if SQLite is installed: sqlite3 --version"
    echo "2. Check database file permissions: ls -la *.db"
    echo "3. Run migration manually: tsx scripts/migrate.ts"
    exit 1
fi