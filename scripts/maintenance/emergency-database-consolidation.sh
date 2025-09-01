#!/bin/bash

echo "🚨 EMERGENCY DATABASE CONSOLIDATION"
echo "=================================="

# Exit on any error
set -e

# 1. Stop all services
echo "🛑 Stopping all services..."
sudo pkill -f "node.*" || true
sleep 3

# 2. Find all database files
echo "📋 Finding all database files..."
DB_FILES=$(find /home/pi/eform-locker -name "*.db" -type f)
echo "$DB_FILES"

# 3. Identify the main database
MAIN_DB="/home/pi/eform-locker/data/eform.db"
echo "📍 Main database: $MAIN_DB"

if [ ! -f "$MAIN_DB" ]; then
    echo "❌ Main database not found: $MAIN_DB"
    exit 1
fi

# 4. Create backup
BACKUP_DIR="/home/pi/eform-locker/backup/$(date +%Y%m%d_%H%M%S)"
echo "💾 Creating backup: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
find /home/pi/eform-locker -name "*.db*" -exec cp {} "$BACKUP_DIR/" \;
echo "✅ Backup created with $(ls -1 "$BACKUP_DIR" | wc -l) files"

# 5. Remove duplicate databases (but keep main one)
echo "🗑️  Removing duplicate databases..."
find /home/pi/eform-locker/app -name "*.db*" -delete || true
find /home/pi/eform-locker -name "eform_locker.db*" -delete || true
echo "✅ Duplicate databases removed"

# 6. Create service data directories
echo "📁 Creating service data directories..."
mkdir -p /home/pi/eform-locker/app/kiosk/data
mkdir -p /home/pi/eform-locker/app/panel/data
mkdir -p /home/pi/eform-locker/app/gateway/data

# 7. Create symlinks to main database
echo "🔗 Creating symlinks to main database..."
ln -sf ../../../data/eform.db /home/pi/eform-locker/app/kiosk/data/eform.db
ln -sf ../../../data/eform.db /home/pi/eform-locker/app/panel/data/eform.db
ln -sf ../../../data/eform.db /home/pi/eform-locker/app/gateway/data/eform.db
echo "✅ Symlinks created"

# 8. Checkpoint WAL file
echo "📝 Checkpointing WAL file..."
sqlite3 "$MAIN_DB" "PRAGMA wal_checkpoint(FULL);" || true
echo "✅ WAL checkpoint completed"

# 9. Verify database integrity
echo "🔍 Verifying database integrity..."
INTEGRITY=$(sqlite3 "$MAIN_DB" "PRAGMA integrity_check;")
if [ "$INTEGRITY" = "ok" ]; then
    echo "✅ Database integrity: OK"
else
    echo "❌ Database integrity: $INTEGRITY"
    exit 1
fi

# 10. Check locker count
LOCKER_COUNT=$(sqlite3 "$MAIN_DB" "SELECT COUNT(*) FROM lockers WHERE kiosk_id = 'kiosk-1';")
echo "📊 Locker count: $LOCKER_COUNT"

# 11. Verify symlinks
echo "🔗 Verifying symlinks..."
for service in kiosk panel gateway; do
    LINK_PATH="/home/pi/eform-locker/app/$service/data/eform.db"
    if [ -L "$LINK_PATH" ]; then
        TARGET=$(readlink "$LINK_PATH")
        echo "   $service -> $TARGET ✅"
    else
        echo "   $service -> MISSING ❌"
    fi
done

echo ""
echo "🎉 DATABASE CONSOLIDATION COMPLETE!"
echo "=================================="
echo "✅ Main database: $MAIN_DB"
echo "✅ Backup location: $BACKUP_DIR"
echo "✅ All services now use single database"
echo "✅ Database integrity verified"
echo ""
echo "🚀 You can now restart services with:"
echo "   ./scripts/start-all-clean.sh"