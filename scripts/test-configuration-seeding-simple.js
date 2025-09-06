#!/usr/bin/env node

/**
 * Simple test script for configuration seeding functionality
 * This script tests the configuration seeder without requiring full build
 */

const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();

// Set up environment
process.env.NODE_ENV = 'test';
const testDbPath = path.join(__dirname, '..', 'data', 'test', `config-seeding-simple-${Date.now()}.db`);

// Simple database wrapper
class SimpleDatabase {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  async get(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async run(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Configuration seed data (simplified version)
const configSeedData = [
  { key: 'smart_assignment_enabled', value: 'false', data_type: 'boolean', description: 'Enable smart locker assignment system' },
  { key: 'session_limit_minutes', value: '180', data_type: 'number', description: 'Smart session limit in minutes (config-driven, not hardcoded 120)' },
  { key: 'base_score', value: '100', data_type: 'number', description: 'Base score for locker selection algorithm' },
  { key: 'score_factor_a', value: '2.0', data_type: 'number', description: 'Free hours multiplier in scoring formula' },
  { key: 'top_k_candidates', value: '5', data_type: 'number', description: 'Number of top candidates for weighted selection' },
  { key: 'quarantine_minutes_base', value: '5', data_type: 'number', description: 'Minimum quarantine duration in minutes' },
  { key: 'quarantine_minutes_ceiling', value: '20', data_type: 'number', description: 'Maximum quarantine duration in minutes' },
  { key: 'reserve_ratio', value: '0.1', data_type: 'number', description: 'Percentage of lockers to reserve' },
  { key: 'sensorless_pulse_ms', value: '800', data_type: 'number', description: 'Pulse duration for sensorless operation' },
  { key: 'card_rate_limit_seconds', value: '10', data_type: 'number', description: 'Rate limit per card in seconds' }
];

async function createTables(db) {
  // Create configuration tables
  await db.run(`
    CREATE TABLE IF NOT EXISTS settings_global (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      data_type TEXT NOT NULL DEFAULT 'string',
      description TEXT,
      updated_by TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (data_type IN ('string', 'number', 'boolean', 'json'))
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS config_version (
      id INTEGER PRIMARY KEY DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CHECK (id = 1)
    )
  `);

  console.log('✅ Created configuration tables');
}

async function seedConfiguration(db) {
  console.log('🌱 Seeding configuration...');
  
  let seededCount = 0;
  
  for (const config of configSeedData) {
    try {
      // Check if key already exists
      const existing = await db.get('SELECT key FROM settings_global WHERE key = ?', [config.key]);
      
      if (existing) {
        console.log(`   ⏭️  Skipped existing: ${config.key}`);
        continue;
      }

      // Insert configuration
      await db.run(
        'INSERT INTO settings_global (key, value, data_type, description, updated_by) VALUES (?, ?, ?, ?, ?)',
        [config.key, config.value, config.data_type, config.description, 'configuration-seeder']
      );

      seededCount++;
      
      if (['smart_assignment_enabled', 'session_limit_minutes'].includes(config.key)) {
        console.log(`   ✅ Seeded critical config: ${config.key} = ${config.value}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to seed ${config.key}:`, error.message);
    }
  }

  // Initialize config version
  await db.run('INSERT OR IGNORE INTO config_version (id, version) VALUES (1, 1)');

  console.log(`📊 Configuration seeded: ${seededCount} keys`);
  return seededCount;
}

async function validateConfiguration(db) {
  console.log('🔍 Validating configuration...');
  
  // Test 1: Check total count
  const countResult = await db.get('SELECT COUNT(*) as count FROM settings_global');
  console.log(`   ✓ Total configuration keys: ${countResult.count}`);
  
  if (countResult.count === 0) {
    throw new Error('No configuration keys found');
  }

  // Test 2: Check critical configurations
  const criticalConfigs = [
    { key: 'smart_assignment_enabled', expectedValue: 'false', dataType: 'boolean' },
    { key: 'session_limit_minutes', expectedValue: '180', dataType: 'number' },
    { key: 'base_score', expectedValue: '100', dataType: 'number' }
  ];

  for (const config of criticalConfigs) {
    const result = await db.get(
      'SELECT value, data_type FROM settings_global WHERE key = ?',
      [config.key]
    );

    if (!result) {
      throw new Error(`Critical configuration missing: ${config.key}`);
    }

    if (result.data_type !== config.dataType) {
      throw new Error(`Wrong data type for ${config.key}: expected ${config.dataType}, got ${result.data_type}`);
    }

    if (result.value !== config.expectedValue) {
      throw new Error(`Wrong value for ${config.key}: expected ${config.expectedValue}, got ${result.value}`);
    }

    console.log(`   ✓ ${config.key} = ${result.value} (${result.data_type})`);
  }

  // Test 3: Check version tracking
  const version = await db.get('SELECT version FROM config_version WHERE id = 1');
  if (!version || version.version < 1) {
    throw new Error('Configuration version not properly initialized');
  }
  console.log(`   ✓ Configuration version: ${version.version}`);

  return true;
}

async function testDuplicateSeeding(db) {
  console.log('🔄 Testing duplicate seeding prevention...');
  
  const initialCount = await db.get('SELECT COUNT(*) as count FROM settings_global');
  
  // Try to seed again
  const seededCount = await seedConfiguration(db);
  
  const finalCount = await db.get('SELECT COUNT(*) as count FROM settings_global');
  
  if (finalCount.count !== initialCount.count) {
    throw new Error('Duplicate seeding occurred');
  }
  
  if (seededCount !== 0) {
    throw new Error('Seeder should have skipped all existing keys');
  }
  
  console.log('   ✓ No duplicate seeding occurred');
  return true;
}

async function runTest() {
  console.log('🧪 Testing Configuration Seeding (Simple)...');
  
  try {
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    
    console.log('📁 Test database path:', testDbPath);
    
    // Create database connection
    const db = new SimpleDatabase(testDbPath);
    
    // Create tables
    await createTables(db);
    
    // Test initial seeding
    console.log('\n✅ Test 1: Initial configuration seeding');
    const seededCount = await seedConfiguration(db);
    
    if (seededCount === 0) {
      throw new Error('No configuration keys were seeded');
    }
    
    // Validate seeded configuration
    console.log('\n✅ Test 2: Validate seeded configuration');
    await validateConfiguration(db);
    
    // Test duplicate seeding prevention
    console.log('\n✅ Test 3: Duplicate seeding prevention');
    await testDuplicateSeeding(db);
    
    // Test configuration retrieval
    console.log('\n✅ Test 4: Configuration retrieval');
    const allConfigs = await db.all('SELECT key, value, data_type FROM settings_global ORDER BY key');
    console.log(`   ✓ Retrieved ${allConfigs.length} configuration keys`);
    
    // Display some key configurations
    const keyConfigs = allConfigs.filter(c => 
      ['smart_assignment_enabled', 'session_limit_minutes', 'base_score'].includes(c.key)
    );
    
    for (const config of keyConfigs) {
      console.log(`   ✓ ${config.key}: ${config.value} (${config.data_type})`);
    }
    
    // Cleanup
    await db.close();
    
    console.log('\n🎉 All configuration seeding tests passed!');
    console.log(`📊 Configuration seeded: ${seededCount} keys`);
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Configuration seeding test failed:', error.message);
    return false;
  } finally {
    // Cleanup test database
    try {
      await fs.unlink(testDbPath);
      console.log('🧹 Cleaned up test database');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Run the test
runTest().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});