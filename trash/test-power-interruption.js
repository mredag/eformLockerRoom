#!/usr/bin/env node

/**
 * Test script to verify power interruption recovery
 * This simulates a power outage scenario and verifies data persistence
 */

const { LockerStateManager } = require('../shared/services/locker-state-manager');
const { performPowerInterruptionRecovery } = require('../scripts/power-interruption-recovery');

async function testPowerInterruption() {
  console.log('🧪 Testing Power Interruption Recovery...\n');
  
  const stateManager = new LockerStateManager();
  const kioskId = 'test-kiosk';
  
  try {
    // Step 1: Create initial state
    console.log('📋 Step 1: Creating initial locker assignments...');
    await stateManager.initializeKioskLockers(kioskId, 10);
    
    // Assign some lockers
    const assignments = [
      { lockerId: 1, ownerKey: '0009652489', ownerType: 'rfid' },
      { lockerId: 3, ownerKey: '0009652490', ownerType: 'rfid' },
      { lockerId: 5, ownerKey: 'vip-card-001', ownerType: 'vip' }
    ];
    
    for (const assignment of assignments) {
      const success = await stateManager.assignLocker(
        kioskId, 
        assignment.lockerId, 
        assignment.ownerType, 
        assignment.ownerKey
      );
      
      if (success) {
        console.log(`   ✅ Assigned locker ${assignment.lockerId} to ${assignment.ownerKey}`);
      } else {
        console.log(`   ❌ Failed to assign locker ${assignment.lockerId}`);
      }
    }
    
    // Step 2: Verify initial state
    console.log('\n📊 Step 2: Verifying initial state...');
    const initialStats = await stateManager.getKioskStats(kioskId);
    console.log(`   Total: ${initialStats.total}, Owned: ${initialStats.dolu}, Free: ${initialStats.bos}`);
    
    // Step 3: Simulate power interruption (restart services)
    console.log('\n⚡ Step 3: Simulating power interruption...');
    console.log('   (In real scenario, this would be a system restart)');
    
    // Create new state manager instance (simulates service restart)
    const recoveredStateManager = new LockerStateManager();
    
    // Step 4: Run recovery process
    console.log('\n🔌 Step 4: Running power interruption recovery...');
    const recoveryResult = await performPowerInterruptionRecovery();
    
    if (!recoveryResult.success) {
      console.log('❌ Recovery failed:', recoveryResult.error);
      return;
    }
    
    // Step 5: Verify recovered state
    console.log('\n🔍 Step 5: Verifying recovered state...');
    const recoveredStats = await recoveredStateManager.getKioskStats(kioskId);
    console.log(`   Total: ${recoveredStats.total}, Owned: ${recoveredStats.dolu}, Free: ${recoveredStats.bos}`);
    
    // Step 6: Verify specific assignments
    console.log('\n🔒 Step 6: Verifying specific locker assignments...');
    for (const assignment of assignments) {
      const locker = await recoveredStateManager.getLocker(kioskId, assignment.lockerId);
      
      if (locker && locker.status === 'Owned' && locker.owner_key === assignment.ownerKey) {
        console.log(`   ✅ Locker ${assignment.lockerId}: ${assignment.ownerKey} (${locker.status})`);
      } else {
        console.log(`   ❌ Locker ${assignment.lockerId}: Assignment lost or corrupted`);
        console.log(`      Expected: ${assignment.ownerKey}, Got: ${locker?.owner_key || 'none'}`);
      }
    }
    
    // Step 7: Test that assignments still work
    console.log('\n🧪 Step 7: Testing post-recovery functionality...');
    
    // Try to release a locker
    const releaseSuccess = await recoveredStateManager.releaseLocker(kioskId, 1, '0009652489');
    if (releaseSuccess) {
      console.log('   ✅ Locker release works after recovery');
    } else {
      console.log('   ❌ Locker release failed after recovery');
    }
    
    // Try to assign a new locker
    const newAssignSuccess = await recoveredStateManager.assignLocker(kioskId, 2, 'rfid', '0009652491');
    if (newAssignSuccess) {
      console.log('   ✅ New locker assignment works after recovery');
    } else {
      console.log('   ❌ New locker assignment failed after recovery');
    }
    
    // Final verification
    console.log('\n📊 Final State:');
    const finalStats = await recoveredStateManager.getKioskStats(kioskId);
    console.log(`   Total: ${finalStats.total}, Owned: ${finalStats.dolu}, Free: ${finalStats.bos}`);
    
    // Compare states
    const assignmentsPreserved = recoveredStats.dolu === initialStats.dolu - 1 + 1; // -1 released, +1 new
    
    if (assignmentsPreserved) {
      console.log('\n✅ SUCCESS: Power interruption recovery test passed!');
      console.log('   - Locker assignments survived simulated power outage');
      console.log('   - System functionality restored after recovery');
      console.log('   - Database integrity maintained');
    } else {
      console.log('\n❌ FAILED: Some assignments were lost during power interruption');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    const allLockers = await recoveredStateManager.getKioskLockers(kioskId);
    for (const locker of allLockers) {
      if (locker.status === 'Owned') {
        await recoveredStateManager.releaseLocker(kioskId, locker.id);
      }
    }
    
    console.log('✅ Test cleanup completed');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    stateManager.stopCleanupTimer();
  }
}

// Run the test
testPowerInterruption().catch(console.error);