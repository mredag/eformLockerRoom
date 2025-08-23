#!/bin/bash

# Manual Database Initialization Script
# Creates the database and tables manually if the TypeScript migration fails

echo "🗄️  Manual Database Initialization"
echo "================================="

DB_FILE="eform_locker.db"

echo "📋 Creating database file: $DB_FILE"

# Create the database and run all migration files
sqlite3 $DB_FILE << 'EOF'
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Run all migrations in order
.read migrations/001_initial_schema.sql
.read migrations/002_provisioning_and_config.sql
.read migrations/003_complete_schema.sql
.read migrations/004_staff_users.sql
.read migrations/005_vip_transfer_audit.sql
.read migrations/006_pin_rotation_system.sql
.read migrations/007_soak_testing_tables.sql

-- Show created tables
.tables

-- Show table info for lockers
.schema lockers
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database initialized successfully!"
    echo ""
    echo "📊 Database info:"
    sqlite3 $DB_FILE "SELECT name FROM sqlite_master WHERE type='table';"
    echo ""
    echo "🚀 You can now start the kiosk service:"
    echo "  cd app/kiosk"
    echo "  npm start"
else
    echo ""
    echo "❌ Manual database initialization failed!"
    echo "Please check the migration files and SQLite installation"
    exit 1
fi