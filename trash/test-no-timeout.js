#!/usr/bin/env node

/**
 * Test script to verify that automatic locker timeout has been disabled
 * This script will assign a locker and wait to confirm it doesn't automatically reset
 */

const { LockerStateManager } = require('../shared/services/locker-state-manager');

async function testNoTimeout() {
  console.log('🧪 Testing that automatic locker timeout is disabled...\n');
  
  const stateManager = new LockerStateManager();
  const kioskId = 'test-kiosk';
  const lockerId = 1;
  const ownerKey = '0009652489';
  const ownerType = 'rfid';
  
  try {
    // Initialize test locker
    await stateManager.initializeKioskLockers(kioskId, 5);
    
    // Assign locker
    console.log('📋 Assigning locker...');
    const assigned = await stateManager.assignLocker(kioskId, lockerId, ownerType, ownerKey);
    
    if (!assigned) {
      console.log('❌ Failed to assign locker');
      return;
    }
    
    console.log('✅ Locker assigned successfully');
    
    // Check initial state
    let locker = await stateManager.getLocker(kioskId, lockerId);
    console.log(`📊 Initial state: ${locker.status} (owner: ${locker.owner_key})`);
    
    // Wait for 2 minutes (longer than old 90-second timeout)
    console.log('⏰ Waiting 2 minutes to verify no automatic timeout...');
    
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      locker = await stateManager.getLocker(kioskId, lockerId);
      const elapsed = Math.floor((Date.now() - new Date(locker.reserved_at).getTime()) / 1000);
      
      console.log(`   ${elapsed}s elapsed - Status: ${locker.status} (owner: ${locker.owner_key || 'none'})`);
      
      if (locker.status === 'Free') {
        console.log('❌ FAILED: Locker was automatically released!');
        return;
      }
    }
    
    console.log('\n✅ SUCCESS: Locker remained assigned after 2 minutes');
    console.log('🔒 Automatic timeout is properly disabled');
    
    // Clean up - manually release the locker
    await stateManager.releaseLocker(kioskId, lockerId, ownerKey);
    console.log('🧹 Test cleanup completed');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    stateManager.stopCleanupTimer();
  }
}

// Run the test
testNoTimeout().catch(console.error);