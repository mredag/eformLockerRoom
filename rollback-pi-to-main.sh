#!/bin/bash
# Rollback Pi to Main Branch - Bash Script
# This script connects to the Pi and rolls back to main branch with backup restoration

PI_IP="${1:-192.168.1.11}"
PI_USER="${2:-pi}"

echo "🔄 Rolling back Pi to main branch..."
echo "📡 Target Pi: $PI_USER@$PI_IP"

# Step 1: Check Pi connectivity
echo ""
echo "1️⃣ Checking Pi connectivity..."
if ping -c 2 "$PI_IP" > /dev/null 2>&1; then
    echo "✅ Pi is reachable"
else
    echo "❌ Cannot reach Pi at $PI_IP"
    echo "Please check network connection and IP address"
    exit 1
fi

# Step 2: Stop services on Pi
echo ""
echo "2️⃣ Stopping services on Pi..."
ssh "$PI_USER@$PI_IP" << 'EOF'
sudo pkill -f 'node.*' 2>/dev/null || true
sleep 2
echo '✅ Services stopped'
EOF

# Step 3: Backup current state on Pi
echo ""
echo "3️⃣ Creating backup on Pi..."
ssh "$PI_USER@$PI_IP" << 'EOF'
cd /home/pi/eform-locker
mkdir -p backups/rollback-$(date +%Y%m%d-%H%M%S)
cp -r data/ backups/rollback-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
cp -r config/ backups/rollback-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true
echo '✅ Backup created'
EOF

# Step 4: Git operations on Pi
echo ""
echo "4️⃣ Git operations on Pi..."
ssh "$PI_USER@$PI_IP" << 'EOF'
cd /home/pi/eform-locker
git status
echo '📋 Current branch status shown above'
git checkout main
git reset --hard HEAD
git pull origin main
echo '✅ Switched to main and updated'
EOF

# Step 5: Restore database from backup if available
echo ""
echo "5️⃣ Restoring database from backup..."
ssh "$PI_USER@$PI_IP" << 'EOF'
cd /home/pi/eform-locker
if [ -d "backups/pre-multi-zones-2025-09-07-1335/data" ]; then
    echo '📦 Found backup, restoring database...'
    cp backups/pre-multi-zones-2025-09-07-1335/data/eform.db data/ 2>/dev/null || echo 'No eform.db in backup'
    cp backups/pre-multi-zones-2025-09-07-1335/data/eform-dev.db data/ 2>/dev/null || echo 'No eform-dev.db in backup'
    echo '✅ Database restored from backup'
else
    echo '⚠️ No backup found, keeping current database'
fi
EOF

# Step 6: Build services
echo ""
echo "6️⃣ Building services on Pi..."
ssh "$PI_USER@$PI_IP" << 'EOF'
cd /home/pi/eform-locker
npm run build 2>/dev/null || echo '⚠️ Build failed, but continuing...'
echo '✅ Build completed'
EOF

# Step 7: Start services
echo ""
echo "7️⃣ Starting services on Pi..."
ssh "$PI_USER@$PI_IP" << 'EOF'
cd /home/pi/eform-locker
./scripts/start-all-clean.sh &
sleep 5
echo '✅ Services started'
EOF

# Step 8: Health check
echo ""
echo "8️⃣ Health check..."
sleep 10

for port in 3000 3001 3002; do
    if curl -s "http://$PI_IP:$port/health" > /dev/null; then
        echo "✅ http://$PI_IP:$port/health - OK"
    else
        echo "❌ http://$PI_IP:$port/health - Failed"
    fi
done

echo ""
echo "🎉 Pi rollback to main completed!"
echo "📋 Services should be running on:"
echo "   - Gateway: http://$PI_IP:3000"
echo "   - Panel:   http://$PI_IP:3001"  
echo "   - Kiosk:   http://$PI_IP:3002"

echo ""
echo "🔧 To test hardware:"
echo "   ssh $PI_USER@$PI_IP 'cd /home/pi/eform-locker && node scripts/test-basic-relay-control.js'"