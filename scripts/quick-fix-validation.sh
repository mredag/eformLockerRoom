#!/bin/bash

echo "🔧 Quick Fix for Validation Dependencies..."

# Install bcrypt if missing
echo "📦 Installing bcrypt..."
npm install bcrypt

if [ $? -eq 0 ]; then
    echo "✅ bcrypt installed successfully"
    
    # Run the full validation
    echo "🔍 Running full database validation..."
    node scripts/validate-complete-fix.js
else
    echo "⚠️  bcrypt installation failed, using simple validation..."
    node scripts/validate-database-simple.js
fi

echo ""
echo "🎯 Next steps:"
echo "1. Create admin user: node scripts/create-admin-directly.js"
echo "2. Build panel: cd app/panel && npm run build"
echo "3. Start panel: npm run start"
echo "4. Visit: http://192.168.1.8:3002/"