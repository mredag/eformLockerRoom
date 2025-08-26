#!/bin/bash

echo "🔧 Raspberry Pi Database Fix Script"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the project root directory"
    echo "Please run this script from the eform-locker project root"
    exit 1
fi

echo "📋 Checking current directory: $(pwd)"
echo ""

# Step 1: Fix duplicate migrations
echo "🔄 Step 1: Fixing duplicate migrations..."
npm run migrate:fix-duplicates
echo ""

# Step 2: Check migration status
echo "🔍 Step 2: Checking migration status..."
npm run migrate:status
echo ""

# Step 3: Run migrations if needed
echo "🔄 Step 3: Running migrations..."
npm run migrate
echo ""

# Step 4: Check if kiosk database exists and has tables
echo "🔍 Step 4: Checking kiosk database..."
KIOSK_DB="./app/kiosk/data/eform.db"
if [ -f "$KIOSK_DB" ]; then
    echo "✅ Kiosk database exists at: $KIOSK_DB"
    echo "📊 Checking tables in kiosk database..."
    sqlite3 "$KIOSK_DB" ".tables"
else
    echo "❌ Kiosk database not found at: $KIOSK_DB"
    echo "🔧 Creating kiosk database directory..."
    mkdir -p ./app/kiosk/data
    echo "📋 Copying main database to kiosk location..."
    cp ./data/eform.db "$KIOSK_DB"
    echo "✅ Kiosk database created"
fi

echo ""
echo "🎉 Database fix completed!"
echo ""
echo "🚀 You can now try starting the services:"
echo "  npm run start"