#!/usr/bin/env node

/**
 * Initialize Development Database
 * Creates a clean development database with test data
 */

const path = require('path');
const fs = require('fs');

async function initDevDatabase() {
  try {
    console.log('🚀 Initializing development database...');
    
    // Set environment for development
    process.env.NODE_ENV = 'development';
    process.env.EFORM_DB_PATH = './data/eform-dev.db';
    
    // Create data directory
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }
    
    // Remove existing dev database
    const dbPath = path.join(process.cwd(), 'data', 'eform-dev.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('🗑️  Removed existing development database');
    }
    
    // Import and initialize database
    const { DatabaseManager } = require('../shared/dist/database/database-manager');
    const { LockerStateManager } = require('../shared/dist/services/locker-state-manager');
    
    console.log('🔧 Initializing database manager...');
    const dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    console.log('🔧 Initializing locker state manager...');
    const stateManager = new LockerStateManager();
    
    // Initialize 48 lockers for development
    console.log('🔧 Creating 48 development lockers...');
    await stateManager.syncLockersWithHardware('kiosk-dev-1', 48);
    
    // Add some test RFID cards
    console.log('🔧 Adding test RFID cards...');
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath);
    
    // Insert test RFID cards
    const testCards = [
      { card_id: '0009652489', user_name: 'Test User 1', is_active: 1 },
      { card_id: '0009652490', user_name: 'Test User 2', is_active: 1 },
      { card_id: '1234567890', user_name: 'Dev User', is_active: 1 },
      { card_id: 'TESTCARD01', user_name: 'Demo User', is_active: 1 }
    ];
    
    for (const card of testCards) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO rfid_cards (card_id, user_name, is_active, created_at, updated_at) 
           VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
          [card.card_id, card.user_name, card.is_active],
          (err) => {
            if (err) reject(err);
            else {
              console.log(`   ✅ Added RFID card: ${card.card_id} (${card.user_name})`);
              resolve();
            }
          }
        );
      });
    }
    
    db.close();
    
    console.log('');
    console.log('🎉 Development database initialized successfully!');
    console.log('');
    console.log('📋 Test Data Created:');
    console.log('   - 48 lockers (kiosk-dev-1)');
    console.log('   - 4 test RFID cards');
    console.log('');
    console.log('🔑 Test RFID Cards:');
    testCards.forEach(card => {
      console.log(`   - ${card.card_id}: ${card.user_name}`);
    });
    console.log('');
    console.log('💡 Usage:');
    console.log('   1. Start services: npm run start:dev');
    console.log('   2. Open Kiosk UI: http://localhost:3002');
    console.log('   3. Type any test card ID to simulate RFID scan');
    console.log('   4. Open Admin Panel: http://localhost:3001');
    
  } catch (error) {
    console.error('💥 Failed to initialize development database:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initDevDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { initDevDatabase };