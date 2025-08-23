#!/usr/bin/env node

const { DatabaseManager } = require('../shared/database/database-manager');
const path = require('path');

async function resetUsers() {
  try {
    console.log('🔄 Resetting users table...');
    
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: path.resolve(__dirname, '../migrations'),
    });
    await dbManager.initialize();
    
    const db = dbManager.getConnection().getDatabase();
    
    // Delete all users
    const result = db.prepare(`DELETE FROM staff_users`).run();
    console.log(`🗑️  Deleted ${result.changes} users`);
    
    // Reset auto-increment
    db.prepare(`DELETE FROM sqlite_sequence WHERE name='staff_users'`).run();
    console.log('🔄 Reset auto-increment counter');
    
    console.log('✅ Users table reset complete');
    console.log('🚀 You can now access /setup to create the first admin user');
    
  } catch (error) {
    console.error('❌ Error resetting users:', error);
  }
}

resetUsers();