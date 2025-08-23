#!/bin/bash

echo "🔍 Running Complete Cookie Diagnostics"
echo "======================================"
echo ""

echo "1️⃣ Checking Configuration..."
node scripts/check-cookie-config.js

echo ""
echo "2️⃣ Testing Cookie Behavior..."
node scripts/debug-cookie-issue.js

echo ""
echo "3️⃣ Validating Fix Implementation..."
node scripts/validate-auth-fix-quick.js

echo ""
echo "🎯 Diagnostics Complete!"
echo "Review the output above to identify the issue."