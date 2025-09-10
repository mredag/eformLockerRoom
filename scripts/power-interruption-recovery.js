#!/usr/bin/env node

/**
 * Power Interruption Recovery Script
 * 
 * This script runs on system startup to ensure locker states are properly
 * restored after power outages or system restarts. It validates database
 * integrity and reports on recovered locker assignments.
 */

const { DatabaseConnection } = require('../shared/dist/database/connection');
const { LockerStateManager } = require('../shared/dist/services/locker-state-manager');

async function performPowerInterruptionRecovery() {
  console.log('🔌 Power Interruption Recovery - Starting...\n');
  
  try {
    // Initialize database connection
    const db = DatabaseConnection.getInstance();
    await db.waitForInitialization();
    
    const stateManager = new LockerStateManager();
    
    // Get all lockers from database
    const allLockers = await stateManager.getAllLockers();
    
    // Categorize locker states
    const stats = {
      total: allLockers.length,
      free: 0,
      owned: 0,
      opening: 0,
      blocked: 0,
      error: 0,
      vip: 0
    };
    
    const ownedLockers = [];
    const problematicLockers = [];
    
    for (const locker of allLockers) {
      stats[locker.status.toLowerCase()]++;
      
      if (locker.is_vip) {
        stats.vip++;
      }
      
      if (locker.status === 'Owned') {
        ownedLockers.push({
          kiosk: locker.kiosk_id,
          id: locker.id,
          owner: locker.owner_key,
          type: locker.owner_type,
          since: locker.reserved_at || locker.owned_at
        });
      }
      
      // Check for potentially problematic states
      if (locker.status === 'Opening') {
        // Opening state after restart might indicate interrupted operation
        problematicLockers.push({
          kiosk: locker.kiosk_id,
          id: locker.id,
          issue: 'Stuck in Opening state - may need manual intervention',
          status: locker.status
        });
      }
      
      if (locker.owner_key && locker.status === 'Free') {
        // Free locker with owner key is inconsistent
        problematicLockers.push({
          kiosk: locker.kiosk_id,
          id: locker.id,
          issue: 'Free status but has owner key - data inconsistency',
          status: locker.status,
          owner: locker.owner_key
        });
      }
    }
    
    // Report recovery status
    console.log('📊 System Recovery Status:');
    console.log(`   Total Lockers: ${stats.total}`);
    console.log(`   Free: ${stats.free}`);
    console.log(`   Owned: ${stats.owned}`);
    console.log(`   Opening: ${stats.opening}`);
    console.log(`   Blocked: ${stats.blocked}`);
    console.log(`   Error: ${stats.error}`);
    console.log(`   VIP: ${stats.vip}`);
    console.log('');
    
    // Report owned lockers (these survived the power interruption)
    if (ownedLockers.length > 0) {
      console.log('🔒 Recovered Locker Assignments:');
      ownedLockers.forEach(locker => {
        const since = locker.since ? new Date(locker.since).toLocaleString() : 'Unknown';
        console.log(`   ${locker.kiosk}-${locker.id}: ${locker.owner} (${locker.type}) since ${since}`);
      });
      console.log('');
    } else {
      console.log('✅ No active locker assignments to recover\n');
    }
    
    // Report any problematic states
    if (problematicLockers.length > 0) {
      console.log('⚠️  Potential Issues Found:');
      problematicLockers.forEach(locker => {
        console.log(`   ${locker.kiosk}-${locker.id}: ${locker.issue}`);
      });
      console.log('');
      console.log('💡 Recommendation: Review these lockers in the admin panel');
    } else {
      console.log('✅ No data inconsistencies detected');
    }
    
    // Log recovery event
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO events (kiosk_id, event_type, details, timestamp) 
       VALUES (?, ?, ?, ?)`,
      [
        'system',
        'power_recovery',
        JSON.stringify({
          recovered_assignments: ownedLockers.length,
          total_lockers: stats.total,
          issues_found: problematicLockers.length,
          recovery_time: now
        }),
        now
      ]
    );
    
    console.log('✅ Power interruption recovery completed successfully');
    console.log(`📝 Recovery logged to database at ${now}`);
    
    // Return summary for potential use by startup scripts
    return {
      success: true,
      stats,
      recoveredAssignments: ownedLockers.length,
      issuesFound: problematicLockers.length,
      problematicLockers
    };
    
  } catch (error) {
    console.error('❌ Power interruption recovery failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run recovery if called directly
if (require.main === module) {
  performPowerInterruptionRecovery()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 System ready for normal operation');
        process.exit(0);
      } else {
        console.log('\n💥 Recovery failed - manual intervention may be required');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error during recovery:', error);
      process.exit(1);
    });
}

module.exports = { performPowerInterruptionRecovery };