#!/usr/bin/env node

const { DatabaseManager } = require('../shared/database/database-manager');
const path = require('path');

async function checkSetupStatus() {
  try {
    console.log('🔍 Checking setup status...');
    
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: path.resolve(__dirname, '../migrations'),
    });
    await dbManager.initialize();
    
    const db = dbManager.getConnection().getDatabase();
    
    // Check if staff_users table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='staff_users'
    `).get();
    
    if (!tableExists) {
      console.log('❌ staff_users table does not exist');
      return;
    }
    
    console.log('✅ staff_users table exists');
    
    // Check existing users
    const users = db.prepare(`
      SELECT id, username, role, active, created_at 
      FROM staff_users 
      ORDER BY id
    `).all();
    
    console.log(`📊 Found ${users.length} users in database:`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}, Username: ${user.username}, Role: ${user.role}, Active: ${user.active}`);
    });
    
    // Check active users only
    const activeUsers = db.prepare(`
      SELECT COUNT(*) as count FROM staff_users WHERE active = 1
    `).get();
    
    console.log(`👥 Active users: ${activeUsers.count}`);
    
    if (activeUsers.count === 0) {
      console.log('🚀 Setup is needed - no active users found');
    } else {
      console.log('✅ Setup is complete - active users exist');
    }
    
  } catch (error) {
    console.error('❌ Error checking setup status:', error);
  }
}

checkSetupStatus();