#!/usr/bin/env node

/**
 * Test Reserve Capacity System
 * 
 * This script tests the reserve capacity implementation with various scenarios
 * to validate Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Import the compiled JavaScript modules
const { ReserveCapacityManager } = require('../shared/dist/services/reserve-capacity-manager');
const { ConfigurationManager } = require('../shared/dist/services/configuration-manager');
const { DatabaseConnection } = require('../shared/dist/database/connection');

class ReserveCapacityTester {
  constructor() {
    this.testDbPath = path.join(__dirname, 'test-reserve-capacity.db');
    this.db = null;
    this.dbConnection = null;
    this.configManager = null;
    this.reserveManager = null;
  }

  async setup() {
    console.log('🔧 Setting up test environment...');
    
    // Clean up existing test database
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }

    // Create test database
    this.db = new Database(this.testDbPath);
    this.dbConnection = new DatabaseConnection(this.db);
    
    // Create tables
    await this.createTables();
    
    // Initialize managers
    this.configManager = new ConfigurationManager(this.dbConnection);
    this.reserveManager = new ReserveCapacityManager(this.dbConnection, this.configManager);
    
    // Seed configuration
    await this.seedConfiguration();
    
    console.log('✅ Test environment ready');
  }

  async createTables() {
    // Create lockers table
    this.db.exec(`
      CREATE TABLE lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        reserved_at DATETIME,
        owned_at DATETIME,
        version INTEGER NOT NULL DEFAULT 1,
        is_vip BOOLEAN NOT NULL DEFAULT 0,
        display_name TEXT,
        name_updated_at DATETIME,
        name_updated_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        free_since DATETIME,
        recent_owner TEXT,
        recent_owner_time DATETIME,
        quarantine_until DATETIME,
        wear_count INTEGER DEFAULT 0,
        overdue_from DATETIME,
        overdue_reason TEXT,
        suspected_occupied BOOLEAN DEFAULT 0,
        cleared_by TEXT,
        cleared_at DATETIME,
        return_hold_until DATETIME,
        owner_hot_until DATETIME,
        PRIMARY KEY (kiosk_id, id)
      );
    `);

    // Create configuration tables
    this.db.exec(`
      CREATE TABLE settings_global (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE settings_kiosk (
        kiosk_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL DEFAULT 'string',
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, key)
      );
      
      CREATE TABLE config_version (
        id INTEGER PRIMARY KEY DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async seedConfiguration() {
    // Seed global configuration
    const globalConfig = [
      ['reserve_ratio', '0.1', 'number'],
      ['reserve_minimum', '2', 'number']
    ];

    for (const [key, value, dataType] of globalConfig) {
      this.db.prepare(`
        INSERT INTO settings_global (key, value, data_type) 
        VALUES (?, ?, ?)
      `).run(key, value, dataType);
    }

    // Initialize config version
    this.db.prepare(`INSERT INTO config_version (version) VALUES (1)`).run();
  }

  async createTestLockers(kioskId, totalCount, freeCount) {
    console.log(`📦 Creating ${totalCount} lockers (${freeCount} free) for ${kioskId}...`);
    
    for (let i = 1; i <= totalCount; i++) {
      const isVip = i <= 2; // First 2 are VIP
      const status = i <= freeCount ? 'Free' : 'Owned';
      
      this.db.prepare(`
        INSERT INTO lockers (
          kiosk_id, id, status, is_vip, free_since, wear_count
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(kioskId, i, status, isVip, new Date().toISOString(), Math.floor(Math.random() * 10));
    }
  }

  async testBasicReserveCapacity() {
    console.log('\n🧪 Test 1: Basic Reserve Capacity (Requirement 13.1)');
    
    const kioskId = 'test-kiosk-1';
    await this.createTestLockers(kioskId, 30, 20); // 30 total, 20 free
    
    // Get available lockers (should be 18: 20 free - 2 VIP)
    const availableLockers = await this.dbConnection.all(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0
       ORDER BY id ASC`,
      [kioskId]
    );
    
    console.log(`   Available lockers: ${availableLockers.length}`);
    
    // Apply reserve capacity
    const result = await this.reserveManager.applyReserveCapacity(kioskId, availableLockers);
    
    console.log(`   Reserve calculation:`);
    console.log(`     Total available: ${result.totalAvailable}`);
    console.log(`     Reserve required: ${result.reserveRequired}`);
    console.log(`     Assignable count: ${result.assignableCount}`);
    console.log(`     Reserve disabled: ${result.reserveDisabled}`);
    
    // Validate results
    const expectedReserve = Math.max(Math.ceil(18 * 0.1), 2); // Math.max(2, 2) = 2
    const expectedAssignable = 18 - expectedReserve; // 16
    
    if (result.reserveRequired === expectedReserve && result.assignableCount === expectedAssignable) {
      console.log('   ✅ Basic reserve capacity test PASSED');
    } else {
      console.log('   ❌ Basic reserve capacity test FAILED');
      console.log(`      Expected reserve: ${expectedReserve}, got: ${result.reserveRequired}`);
      console.log(`      Expected assignable: ${expectedAssignable}, got: ${result.assignableCount}`);
    }
  }

  async testLowStockDisabling() {
    console.log('\n🧪 Test 2: Low Stock Reserve Disabling (Requirement 13.3)');
    
    const kioskId = 'test-kiosk-2';
    await this.createTestLockers(kioskId, 30, 6); // 30 total, 6 free
    
    // Get available lockers (should be 4: 6 free - 2 VIP)
    const availableLockers = await this.dbConnection.all(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0
       ORDER BY id ASC`,
      [kioskId]
    );
    
    console.log(`   Available lockers: ${availableLockers.length}`);
    
    // Apply reserve capacity
    const result = await this.reserveManager.applyReserveCapacity(kioskId, availableLockers);
    
    console.log(`   Low stock scenario:`);
    console.log(`     Total available: ${result.totalAvailable}`);
    console.log(`     Reserve disabled: ${result.reserveDisabled}`);
    console.log(`     Assignable count: ${result.assignableCount}`);
    console.log(`     Reason: ${result.reason || 'none'}`);
    
    // Validate low stock disabling
    // Reserve required = 2, threshold = 2 * 2 = 4, available = 4, so 4 <= 4 should disable
    if (result.reserveDisabled && result.assignableCount === 4 && result.reason === 'low_stock') {
      console.log('   ✅ Low stock disabling test PASSED');
    } else {
      console.log('   ❌ Low stock disabling test FAILED');
      console.log(`      Expected disabled: true, got: ${result.reserveDisabled}`);
      console.log(`      Expected reason: low_stock, got: ${result.reason}`);
    }
  }

  async testLowStockAlert() {
    console.log('\n🧪 Test 3: Low Stock Alert (Requirement 13.2)');
    
    const kioskId = 'test-kiosk-3';
    await this.createTestLockers(kioskId, 30, 3); // 30 total, 3 free
    
    // Check low stock alert (should be 1: 3 free - 2 VIP)
    const alertResult = await this.reserveManager.checkLowStockAlert(kioskId);
    
    console.log(`   Alert check:`);
    console.log(`     Should alert: ${alertResult.shouldAlert}`);
    console.log(`     Reason: ${alertResult.reason}`);
    console.log(`     Available: ${alertResult.metrics.totalAvailable}`);
    console.log(`     Reserve required: ${alertResult.metrics.reserveRequired}`);
    
    // Should alert because 1 < 2 (reserve minimum)
    if (alertResult.shouldAlert && alertResult.reason === 'reserve_capacity_below_minimum') {
      console.log('   ✅ Low stock alert test PASSED');
    } else {
      console.log('   ❌ Low stock alert test FAILED');
    }
  }

  async testReserveCapacityStatus() {
    console.log('\n🧪 Test 4: Reserve Capacity Status (Requirements 13.4, 13.5)');
    
    const kioskId = 'test-kiosk-4';
    await this.createTestLockers(kioskId, 30, 20); // 30 total, 20 free
    
    const status = await this.reserveManager.getReserveCapacityStatus(kioskId);
    
    console.log(`   Status report:`);
    console.log(`     Total lockers: ${status.totalLockers}`);
    console.log(`     Available lockers: ${status.availableLockers}`);
    console.log(`     Reserve required: ${status.reserveRequired}`);
    console.log(`     Assignable lockers: ${status.assignableLockers}`);
    console.log(`     Reserve ratio: ${status.reserveRatio}`);
    console.log(`     Reserve minimum: ${status.reserveMinimum}`);
    console.log(`     Reserve disabled: ${status.reserveDisabled}`);
    console.log(`     Low stock alert: ${status.lowStockAlert}`);
    
    // Validate status
    const expectedTotal = 28; // 30 - 2 VIP
    const expectedAvailable = 18; // 20 - 2 VIP
    const expectedReserve = 2;
    const expectedAssignable = 16; // 18 - 2
    
    if (status.totalLockers === expectedTotal && 
        status.availableLockers === expectedAvailable &&
        status.reserveRequired === expectedReserve &&
        status.assignableLockers === expectedAssignable) {
      console.log('   ✅ Reserve capacity status test PASSED');
    } else {
      console.log('   ❌ Reserve capacity status test FAILED');
    }
  }

  async testMonitoringAndAlerts() {
    console.log('\n🧪 Test 5: Monitoring and Alerts (Requirements 13.2, 13.4)');
    
    const kioskId = 'test-kiosk-5';
    await this.createTestLockers(kioskId, 30, 3); // 30 total, 3 free (critical low stock)
    
    const monitoring = await this.reserveManager.monitorReserveCapacity(kioskId);
    
    console.log(`   Monitoring results:`);
    console.log(`     Number of alerts: ${monitoring.alerts.length}`);
    
    monitoring.alerts.forEach((alert, index) => {
      console.log(`     Alert ${index + 1}:`);
      console.log(`       Type: ${alert.type}`);
      console.log(`       Severity: ${alert.severity}`);
      console.log(`       Message: ${alert.message}`);
    });
    
    // Should have multiple alerts for critical low stock
    const hasLowStockAlert = monitoring.alerts.some(a => a.type === 'low_stock');
    const hasReserveDisabledAlert = monitoring.alerts.some(a => a.type === 'reserve_disabled');
    
    if (monitoring.alerts.length > 0 && (hasLowStockAlert || hasReserveDisabledAlert)) {
      console.log('   ✅ Monitoring and alerts test PASSED');
    } else {
      console.log('   ❌ Monitoring and alerts test FAILED');
    }
  }

  async testConfigurationManagement() {
    console.log('\n🧪 Test 6: Configuration Management (Requirements 13.4, 13.5)');
    
    const kioskId = 'test-kiosk-6';
    await this.createTestLockers(kioskId, 30, 20); // 30 total, 20 free
    
    // Test configuration update
    console.log('   Updating reserve configuration...');
    await this.reserveManager.updateReserveConfig(kioskId, {
      reserve_ratio: 0.2, // 20%
      reserve_minimum: 5
    });
    
    const statusAfterUpdate = await this.reserveManager.getReserveCapacityStatus(kioskId);
    
    console.log(`   After config update:`);
    console.log(`     Reserve ratio: ${statusAfterUpdate.reserveRatio}`);
    console.log(`     Reserve minimum: ${statusAfterUpdate.reserveMinimum}`);
    console.log(`     Reserve required: ${statusAfterUpdate.reserveRequired}`);
    
    // Test configuration reset
    console.log('   Resetting to defaults...');
    await this.reserveManager.resetReserveConfig(kioskId);
    
    const statusAfterReset = await this.reserveManager.getReserveCapacityStatus(kioskId);
    
    console.log(`   After reset:`);
    console.log(`     Reserve ratio: ${statusAfterReset.reserveRatio}`);
    console.log(`     Reserve minimum: ${statusAfterReset.reserveMinimum}`);
    
    // Validate configuration changes
    if (statusAfterUpdate.reserveRatio === 0.2 && 
        statusAfterUpdate.reserveMinimum === 5 &&
        statusAfterReset.reserveRatio === 0.1 &&
        statusAfterReset.reserveMinimum === 2) {
      console.log('   ✅ Configuration management test PASSED');
    } else {
      console.log('   ❌ Configuration management test FAILED');
    }
  }

  async testScenarios() {
    console.log('\n🧪 Test 7: Multiple Scenarios Testing');
    
    const kioskId = 'test-kiosk-7';
    await this.createTestLockers(kioskId, 30, 20); // Base scenario
    
    const scenarios = [
      { availableCount: 30, description: 'High capacity' },
      { availableCount: 10, description: 'Medium capacity' },
      { availableCount: 4, description: 'Low capacity' },
      { availableCount: 1, description: 'Critical capacity' }
    ];
    
    const results = await this.reserveManager.testReserveCapacity(kioskId, scenarios);
    
    console.log('   Scenario test results:');
    results.forEach((result, index) => {
      console.log(`     ${result.scenario}:`);
      console.log(`       Reserve required: ${result.result.reserveRequired}`);
      console.log(`       Assignable: ${result.result.assignableCount}`);
      console.log(`       Disabled: ${result.result.reserveDisabled}`);
    });
    
    // Validate scenario results
    const highCapacity = results[0].result;
    const criticalCapacity = results[3].result;
    
    if (highCapacity.reserveRequired === 3 && // Math.ceil(30 * 0.1) = 3
        highCapacity.assignableCount === 27 &&
        !highCapacity.reserveDisabled &&
        criticalCapacity.reserveDisabled &&
        criticalCapacity.assignableCount === 1) {
      console.log('   ✅ Scenario testing PASSED');
    } else {
      console.log('   ❌ Scenario testing FAILED');
    }
  }

  async testLoggingFormat() {
    console.log('\n🧪 Test 8: Logging Format Validation (Acceptance Criteria)');
    
    const kioskId = 'test-kiosk-8';
    await this.createTestLockers(kioskId, 30, 15); // 30 total, 15 free
    
    // Capture console.log output
    const originalLog = console.log;
    let logOutput = '';
    console.log = (...args) => {
      logOutput += args.join(' ') + '\n';
      originalLog(...args);
    };
    
    // Get available lockers and apply reserve capacity
    const availableLockers = await this.dbConnection.all(
      `SELECT * FROM lockers 
       WHERE kiosk_id = ? AND status = 'Free' AND is_vip = 0
       ORDER BY id ASC`,
      [kioskId]
    );
    
    await this.reserveManager.applyReserveCapacity(kioskId, availableLockers);
    
    // Restore console.log
    console.log = originalLog;
    
    // Check for exact logging format
    const expectedLogPattern = /Reserve: kept=\d+, assignable=\d+/;
    const hasCorrectLog = expectedLogPattern.test(logOutput);
    
    console.log(`   Log output check:`);
    console.log(`     Expected pattern: "Reserve: kept=X, assignable=Y"`);
    console.log(`     Found correct format: ${hasCorrectLog}`);
    
    if (hasCorrectLog) {
      console.log('   ✅ Logging format test PASSED');
    } else {
      console.log('   ❌ Logging format test FAILED');
      console.log(`     Actual log: ${logOutput.trim()}`);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test environment...');
    
    if (this.db) {
      this.db.close();
    }
    
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }
    
    console.log('✅ Cleanup complete');
  }

  async runAllTests() {
    try {
      await this.setup();
      
      console.log('\n🚀 Starting Reserve Capacity System Tests');
      console.log('=' .repeat(60));
      
      await this.testBasicReserveCapacity();
      await this.testLowStockDisabling();
      await this.testLowStockAlert();
      await this.testReserveCapacityStatus();
      await this.testMonitoringAndAlerts();
      await this.testConfigurationManagement();
      await this.testScenarios();
      await this.testLoggingFormat();
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 All Reserve Capacity Tests Completed!');
      
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new ReserveCapacityTester();
  tester.runAllTests()
    .then(() => {
      console.log('\n✅ Reserve Capacity System validation complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Reserve Capacity System validation failed:', error);
      process.exit(1);
    });
}

module.exports = { ReserveCapacityTester };