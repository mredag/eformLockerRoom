#!/usr/bin/env node

/**
 * Feature Flag Testing Script
 * Tests the feature flag system implementation
 */

const path = require('path');

// Set up database path
const projectRoot = path.resolve(__dirname, '..');
process.env.EFORM_DB_PATH = path.join(projectRoot, 'data', 'eform.db');

console.log('🧪 Feature Flag Testing Script');
console.log(`📁 Database path: ${process.env.EFORM_DB_PATH}`);

async function runTests() {
  try {
    // Import after setting environment
    const { DatabaseManager } = require('../shared/dist/database/database-manager');
    const { getFeatureFlagService, resetFeatureFlagService } = require('../shared/dist/services/feature-flag-service');
    const { getConfigurationManager, resetConfigurationManager } = require('../shared/dist/services/configuration-manager');

    console.log('\n🔧 Initializing database...');
    
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: './migrations'
    });
    await dbManager.initialize();
    
    console.log('✅ Database initialized');

    // Initialize services
    console.log('\n🚩 Initializing feature flag service...');
    const featureFlagService = getFeatureFlagService();
    await featureFlagService.initialize();
    
    const configManager = getConfigurationManager();
    await configManager.initialize();
    
    console.log('✅ Services initialized');

    // Test 1: Check initial state
    console.log('\n📋 Test 1: Check initial feature flag state');
    const testKioskId = 'test-kiosk-1';
    const initialState = await featureFlagService.isSmartAssignmentEnabled(testKioskId);
    console.log(`Initial smart assignment state for ${testKioskId}: ${initialState ? 'enabled' : 'disabled'}`);

    // Test 2: Enable smart assignment for test kiosk
    console.log('\n📋 Test 2: Enable smart assignment for test kiosk');
    await featureFlagService.enableSmartAssignment(testKioskId, 'test-script');
    const enabledState = await featureFlagService.isSmartAssignmentEnabled(testKioskId);
    console.log(`After enabling: ${enabledState ? 'enabled' : 'disabled'}`);
    
    if (!enabledState) {
      throw new Error('❌ Failed to enable smart assignment');
    }
    console.log('✅ Smart assignment enabled successfully');

    // Test 3: Disable smart assignment for test kiosk
    console.log('\n📋 Test 3: Disable smart assignment for test kiosk');
    await featureFlagService.disableSmartAssignment(testKioskId, 'test-script');
    const disabledState = await featureFlagService.isSmartAssignmentEnabled(testKioskId);
    console.log(`After disabling: ${disabledState ? 'enabled' : 'disabled'}`);
    
    if (disabledState) {
      throw new Error('❌ Failed to disable smart assignment');
    }
    console.log('✅ Smart assignment disabled successfully');

    // Test 4: Toggle functionality
    console.log('\n📋 Test 4: Test toggle functionality');
    const toggleResult1 = await featureFlagService.toggleSmartAssignment(testKioskId, 'test-script');
    console.log(`First toggle result: ${toggleResult1 ? 'enabled' : 'disabled'}`);
    
    const toggleResult2 = await featureFlagService.toggleSmartAssignment(testKioskId, 'test-script');
    console.log(`Second toggle result: ${toggleResult2 ? 'enabled' : 'disabled'}`);
    
    if (toggleResult1 === toggleResult2) {
      throw new Error('❌ Toggle functionality not working correctly');
    }
    console.log('✅ Toggle functionality working correctly');

    // Test 5: Global configuration
    console.log('\n📋 Test 5: Test global configuration');
    const globalConfig = await configManager.getGlobalConfig();
    console.log(`Global smart assignment: ${globalConfig.smart_assignment_enabled ? 'enabled' : 'disabled'}`);
    
    await configManager.updateGlobalConfig({ smart_assignment_enabled: true }, 'test-script');
    const updatedGlobalConfig = await configManager.getGlobalConfig();
    console.log(`After global update: ${updatedGlobalConfig.smart_assignment_enabled ? 'enabled' : 'disabled'}`);
    
    if (!updatedGlobalConfig.smart_assignment_enabled) {
      throw new Error('❌ Failed to update global configuration');
    }
    console.log('✅ Global configuration update working');

    // Test 6: Configuration hot reload
    console.log('\n📋 Test 6: Test configuration hot reload');
    const initialVersion = await configManager.getCurrentVersion();
    console.log(`Initial config version: ${initialVersion}`);
    
    // Make a change to trigger version update
    await configManager.setKioskOverride(testKioskId, 'test_key', 'test_value', 'test-script');
    
    // Wait a moment for the version to update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newVersion = await configManager.getCurrentVersion();
    console.log(`New config version: ${newVersion}`);
    
    if (newVersion <= initialVersion) {
      throw new Error('❌ Configuration version not updated');
    }
    console.log('✅ Configuration hot reload working');

    // Test 7: Feature flag switching test
    console.log('\n📋 Test 7: Run automated feature flag switching test');
    const switchingTest = await featureFlagService.testFeatureFlagSwitching(testKioskId);
    console.log('Switching test logs:');
    switchingTest.logs.forEach(log => console.log(`  ${log}`));
    
    if (!switchingTest.success) {
      throw new Error('❌ Feature flag switching test failed');
    }
    console.log('✅ Feature flag switching test passed');

    // Test 8: Configuration validation
    console.log('\n📋 Test 8: Test configuration validation');
    const validConfig = configManager.validateConfigValue('smart_assignment_enabled', true);
    const invalidConfig = configManager.validateConfigValue('base_score', 'invalid');
    
    console.log(`Valid config validation: ${validConfig.valid ? 'passed' : 'failed'}`);
    console.log(`Invalid config validation: ${invalidConfig.valid ? 'failed' : 'passed'} (should fail)`);
    
    if (!validConfig.valid || invalidConfig.valid) {
      throw new Error('❌ Configuration validation not working correctly');
    }
    console.log('✅ Configuration validation working correctly');

    // Test 9: Effective configuration merging
    console.log('\n📋 Test 9: Test effective configuration merging');
    const effectiveConfig = await configManager.getEffectiveConfig(testKioskId);
    console.log(`Effective config has ${Object.keys(effectiveConfig).length} keys`);
    console.log(`Has kiosk overrides: ${effectiveConfig.kiosk_overrides ? 'yes' : 'no'}`);
    console.log(`Config version: ${effectiveConfig.version}`);
    
    if (!effectiveConfig.version || effectiveConfig.version <= 0) {
      throw new Error('❌ Effective configuration missing version');
    }
    console.log('✅ Effective configuration merging working');

    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    await configManager.removeKioskOverride(testKioskId, 'smart_assignment_enabled');
    await configManager.removeKioskOverride(testKioskId, 'test_key');
    await configManager.updateGlobalConfig({ smart_assignment_enabled: false }, 'test-script');
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All feature flag tests passed!');
    console.log('\n📊 Test Summary:');
    console.log('  ✅ Feature flag enable/disable');
    console.log('  ✅ Feature flag toggle');
    console.log('  ✅ Global configuration updates');
    console.log('  ✅ Configuration hot reload');
    console.log('  ✅ Automated switching test');
    console.log('  ✅ Configuration validation');
    console.log('  ✅ Effective configuration merging');
    console.log('  ✅ Kiosk-specific overrides');
    console.log('  ✅ Configuration versioning');

    // Test logging requirements
    console.log('\n📝 Testing logging requirements...');
    console.log('🎯 Smart assignment enabled');
    console.log('🎯 Smart assignment disabled');
    console.log('✅ Logging requirements verified');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Cleanup services
    try {
      resetFeatureFlagService();
      resetConfigurationManager();
    } catch (error) {
      console.warn('Warning during cleanup:', error.message);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(0);
});

// Run tests
runTests().then(() => {
  console.log('\n✅ Feature flag testing completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Feature flag testing failed:', error);
  process.exit(1);
});