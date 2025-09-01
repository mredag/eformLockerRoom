#!/bin/bash

# Pull Updates Script for eForm Locker Pi
# Run this script on the Pi to pull latest changes and set permissions

echo "🔄 Pulling Latest eForm Locker Updates"
echo "====================================="

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d ".git" ]; then
    echo "❌ Error: Not in eForm Locker directory"
    echo "Please run this script from /home/pi/eform-locker"
    exit 1
fi

echo "📍 Current directory: $(pwd)"
echo "🌿 Current branch: $(git branch --show-current)"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pulled latest changes"
else
    echo "❌ Failed to pull changes"
    exit 1
fi

echo ""

# Make scripts executable
echo "🔧 Setting script permissions..."
chmod +x scripts/deployment/*.sh
chmod +x scripts/maintenance/*.sh
chmod +x scripts/testing/*.sh

echo "✅ Script permissions updated"
echo ""

# Verify key files exist
echo "🔍 Verifying new files..."

key_files=(
    "scripts/deployment/network-setup.sh"
    "scripts/deployment/health-check.sh"
    "docs/COMPLETE_MULTI_PI_SOLUTION.md"
    "docs/ip-conflicts-and-multi-pi-solutions.md"
    "docs/how-to-manage-pi.md"
)

all_good=true
for file in "${key_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ Missing: $file"
        all_good=false
    fi
done

echo ""

if [ "$all_good" = true ]; then
    echo "🎉 All files successfully updated!"
    echo ""
    echo "🚀 New Features Available:"
    echo "  • Automated network setup with IP conflict resolution"
    echo "  • Comprehensive health monitoring"
    echo "  • Multi-Pi deployment support"
    echo "  • Location-based configuration (mens, womens, staff, vip)"
    echo ""
    echo "📖 Quick Start:"
    echo "  • Run health check: bash scripts/deployment/health-check.sh"
    echo "  • Network setup: sudo bash scripts/deployment/network-setup.sh [location]"
    echo "  • Read docs: cat docs/COMPLETE_MULTI_PI_SOLUTION.md"
    echo ""
else
    echo "⚠️  Some files are missing. Check the git pull output above."
fi

echo "✨ Update complete!"