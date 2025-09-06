#!/usr/bin/env node

/**
 * Test script for configuration seeding functionality
 * This script verifies that the configuration seeder works correctly
 */

const path = require('path');
const fs = require('fs').promises;

// Set up environment
process.env.NODE_ENV = 'test';
const testDbPath = path.join(__dirname, '..', 'data', 'test', `config-seeding-test-${Date.now()}.db`);

async function runTest() {
  console.log('🧪 Testing Configuration Seeding...');
  
  try {
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    
    // Set database path
    process.env.EFORM_DB_PATH = testDbPath;
    
    // Import modules after setting environment
    const { DatabaseManager } = await import('../shared/database/database-manager.js');
    const { getConfigurationSeeder } = await import('../shared/services/configuration-seeder.js');
    
    console.log('📁 Test database path:', testDbPath);
    
    // Initialize database manager
    const dbManager = DatabaseManager.getInstance({
      path: testDbPath,
      migrationsPath: './migrations'
    });
    
    console.log('🔧 Initializing database with migrations and seeding...');
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    
    // Test 1: Verify configuration was seeded
    console.log('\n✅ Test 1: Verify configuration seeding');
    const configCount = await connection.get('SELECT COUNT(*) as count FROM settings_global');
    console.log(`   Seeded ${configCount.count} configuration keys`);
    
    if (configCount.count === 0) {
      throw new Error('No configuration keys were seeded');
    }
    
    // Test 2: Verify critical configurations
    console.log('\n✅ Test 2: Verify critical configurations');
    
    const smartAssignmentEnabled = await connection.get(
      'SELECT value, data_type FROM settings_global WHERE key = ?',
      ['smart_assignment_enabled']
    );
    
    if (!smartAssignmentEnabled || smartAssignmentEnabled.value !== 'false') {
      throw new Error('smart_assignment_enabled not properly seeded');
    }
    console.log('   ✓ smart_assignment_enabled = false (correct default)');
    
    const sessionLimit = await connection.get(
      'SELECT value, data_type FROM settings_global WHERE key = ?',
      ['session_limit_minutes']
    );
    
    if (!sessionLimit || sessionLimit.value !== '180') {
      throw new Error('session_limit_minutes not properly seeded');
    }
    console.log('   ✓ session_limit_minutes = 180 (config-driven, not hardcoded 120)');
    
    // Test 3: Verify configuration version tracking
    console.log('\n✅ Test 3: Verify configuration version tracking');
    const version = await connection.get('SELECT version FROM config_version WHERE id = 1');
    
    if (!version || version.version < 1) {
      throw new Error('Configuration version not properly initialized');
    }
    console.log(`   ✓ Configuration version: ${version.version}`);
    
    // Test 4: Test seeder status
    console.log('\n✅ Test 4: Test seeder status');
    const seeder = getConfigurationSeeder(connection);
    const status = await seeder.getSeedingStatus();
    
    console.log(`   ✓ Is seeded: ${status.isSeeded}`);
    console.log(`   ✓ Total keys: ${status.totalKeys}`);
    console.log(`   ✓ Version: ${status.version}`);
    
    if (!status.isSeeded || status.totalKeys === 0) {
      throw new Error('Seeding status indicates failure');
    }
    
    // Test 5: Verify no duplicate seeding
    console.log('\n✅ Test 5: Verify no duplicate seeding');
    const initialCount = status.totalKeys;
    
    await seeder.initialize(); // Should not seed again
    
    const newStatus = await seeder.getSeedingStatus();
    if (newStatus.totalKeys !== initialCount) {
      throw new Error('Duplicate seeding occurred');
    }
    console.log('   ✓ No duplicate seeding on re-initialization');
    
    // Test 6: Verify specific configuration values
    console.log('\n✅ Test 6: Verify specific configuration values');
    
    const criticalConfigs = [
      { key: 'base_score', expectedValue: '100', dataType: 'number' },
      { key: 'score_factor_a', expectedValue: '2', dataType: 'number' },
      { key: 'top_k_candidates', expectedValue: '5', dataType: 'number' },
      { key: 'quarantine_minutes_base', expectedValue: '5', dataType: 'number' },
      { key: 'quarantine_minutes_ceiling', expectedValue: '20', dataType: 'number' },
      { key: 'reserve_ratio', expectedValue: '0.1', dataType: 'number' },
      { key: 'sensorless_pulse_ms', expectedValue: '800', dataType: 'number' },
      { key: 'card_rate_limit_seconds', expectedValue: '10', dataType: 'number' }
    ];
    
    for (const config of criticalConfigs) {
      const result = await connection.get(
        'SELECT value, data_type FROM settings_global WHERE key = ?',
        [config.key]
      );
      
      if (!result) {
        throw new Error(`Configuration key ${config.key} not found`);
      }
      
      if (result.data_type !== config.dataType) {
        throw new Error(`Configuration key ${config.key} has wrong data type: expected ${config.dataType}, got ${result.data_type}`);
      }
      
      if (result.value !== config.expectedValue) {
        throw new Error(`Configuration key ${config.key} has wrong value: expected ${config.expectedValue}, got ${result.value}`);
      }
      
      console.log(`   ✓ ${config.key} = ${result.value} (${result.data_type})`);
    }
    
    // Cleanup
    await dbManager.close();
    
    console.log('\n🎉 All configuration seeding tests passed!');
    console.log('📊 Configuration seeded: ' + configCount.count + ' keys');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Configuration seeding test failed:', error.message);
    console.error(error.stack);
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