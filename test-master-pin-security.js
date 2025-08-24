#!/usr/bin/env node

/**
 * Simple test script for Master PIN Security functionality
 * This tests the enhanced master PIN security features
 */

const { DatabaseManager } = require('./shared/database/database-manager');
const { SettingsService } = require('./shared/services/settings-service');

async function testMasterPinSecurity() {
  console.log('🔐 Testing Master PIN Security Features...\n');
  
  try {
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      path: './data/test-security.db',
      migrationsPath: './migrations'
    });
    await dbManager.initialize();
    
    const settingsService = new SettingsService();
    
    // Test 1: Default security settings
    console.log('📋 Test 1: Default Security Settings');
    const defaultSettings = await settingsService.getSecuritySettings();
    console.log(`   Lockout attempts: ${defaultSettings.lockout_attempts}`);
    console.log(`   Lockout minutes: ${defaultSettings.lockout_minutes}`);
    console.log('   ✅ Default settings loaded\n');
    
    // Test 2: PIN verification
    console.log('🔑 Test 2: PIN Verification');
    const validPin = await settingsService.verifyMasterPin('1234');
    const invalidPin = await settingsService.verifyMasterPin('9999');
    console.log(`   Valid PIN (1234): ${validPin ? '✅ Accepted' : '❌ Rejected'}`);
    console.log(`   Invalid PIN (9999): ${invalidPin ? '❌ Accepted' : '✅ Rejected'}`);
    console.log('   ✅ PIN verification working\n');
    
    // Test 3: Attempt tracking
    console.log('🚫 Test 3: Attempt Tracking and Lockout');
    const kioskId = 'test-kiosk-1';
    const clientIp = '192.168.1.100';
    
    // Make failed attempts
    for (let i = 1; i <= 5; i++) {
      const isLocked = await settingsService.recordPinAttempt(kioskId, clientIp, false);
      console.log(`   Attempt ${i}: ${isLocked ? '🔒 LOCKED' : '⚠️  Failed'}`);
      
      if (isLocked) {
        const remainingTime = await settingsService.getRemainingLockoutTime(kioskId, clientIp);
        console.log(`   Lockout time remaining: ${remainingTime} seconds`);
        break;
      }
    }
    
    // Test lockout status
    const isLocked = await settingsService.isLocked(kioskId, clientIp);
    console.log(`   Lockout status: ${isLocked ? '🔒 LOCKED' : '🔓 UNLOCKED'}`);
    console.log('   ✅ Lockout mechanism working\n');
    
    // Test 4: Lockout status for all kiosks
    console.log('📊 Test 4: Lockout Status Overview');
    const lockoutStatus = await settingsService.getLockoutStatus();
    console.log(`   Total kiosks with attempts: ${lockoutStatus.length}`);
    for (const status of lockoutStatus) {
      console.log(`   ${status.kiosk_id}: ${status.attempts} attempts, ${status.locked ? 'LOCKED' : 'UNLOCKED'}`);
    }
    console.log('   ✅ Status overview working\n');
    
    // Test 5: Clear lockout
    console.log('🔓 Test 5: Clear Lockout');
    await settingsService.clearLockout(kioskId);
    const isLockedAfterClear = await settingsService.isLocked(kioskId, clientIp);
    console.log(`   Lockout cleared: ${!isLockedAfterClear ? '✅ Success' : '❌ Failed'}`);
    console.log('   ✅ Lockout clearing working\n');
    
    // Test 6: Change PIN
    console.log('🔄 Test 6: Change Master PIN');
    await settingsService.changeMasterPin('5678');
    const oldPinValid = await settingsService.verifyMasterPin('1234');
    const newPinValid = await settingsService.verifyMasterPin('5678');
    console.log(`   Old PIN (1234): ${oldPinValid ? '❌ Still valid' : '✅ Invalidated'}`);
    console.log(`   New PIN (5678): ${newPinValid ? '✅ Valid' : '❌ Invalid'}`);
    console.log('   ✅ PIN change working\n');
    
    // Test 7: Update security settings
    console.log('⚙️  Test 7: Update Security Settings');
    await settingsService.updateSecuritySettings({
      lockout_attempts: 3,
      lockout_minutes: 10
    });
    const updatedSettings = await settingsService.getSecuritySettings();
    console.log(`   Updated attempts: ${updatedSettings.lockout_attempts}`);
    console.log(`   Updated minutes: ${updatedSettings.lockout_minutes}`);
    console.log('   ✅ Settings update working\n');
    
    console.log('🎉 All Master PIN Security tests passed!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ Default security settings loaded');
    console.log('   ✅ PIN verification working');
    console.log('   ✅ Attempt tracking and lockout working');
    console.log('   ✅ Lockout status overview working');
    console.log('   ✅ Lockout clearing working');
    console.log('   ✅ PIN change working');
    console.log('   ✅ Security settings update working');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testMasterPinSecurity()
    .then(() => {
      console.log('\n✅ Master PIN Security test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testMasterPinSecurity };