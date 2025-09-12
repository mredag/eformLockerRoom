#!/usr/bin/env node

/**
 * Sync Database Lockers with Hardware Configuration
 * 
 * This script reads the hardware configuration and ensures the database
 * has the correct number of lockers to match the available relay channels.
 */

const path = require('path');
const fs = require('fs').promises;

// Import the services (assuming we're running from project root)
const { DatabaseManager } = require('./shared/database/database-manager');
const { LockerStateManager } = require('./shared/services/locker-state-manager');
const { ConfigManager } = require('./shared/services/config-manager');

async function syncLockersWithHardware() {
  try {
    console.log('🚀 Starting locker-hardware sync...');
    
    // Initialize configuration
    const configManager = ConfigManager.getInstance();
    await configManager.initialize();
    const config = configManager.getConfiguration();
    
    // Calculate total channels from hardware configuration
    const enabledCards = config.hardware.relay_cards.filter(card => card.enabled);
    const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
    const configuredLockers = config.lockers.total_count;
    
    console.log('📊 Hardware Configuration:');
    console.log(`   - Total relay cards: ${config.hardware.relay_cards.length}`);
    console.log(`   - Enabled cards: ${enabledCards.length}`);
    console.log(`   - Total channels: ${totalChannels}`);
    console.log(`   - Configured lockers: ${configuredLockers}`);
    
    // Check for mismatch
    if (totalChannels !== configuredLockers) {
      console.log(`⚠️  Configuration mismatch detected!`);
      console.log(`   Hardware has ${totalChannels} channels but config shows ${configuredLockers} lockers`);
      
      // Update configuration to match hardware
      console.log(`🔧 Updating configuration to match hardware (${totalChannels} lockers)...`);
      await configManager.updateParameter(
        'lockers',
        'total_count',
        totalChannels,
        'system-sync',
        'Auto-sync with hardware configuration'
      );
      console.log(`✅ Configuration updated: total_count = ${totalChannels}`);
    }
    
    // Initialize database
    const dbManager = DatabaseManager.getInstance({
      path: process.env.EFORM_DB_PATH,
      migrationsPath: path.join(process.cwd(), 'migrations')
    });
    await dbManager.initialize();
    
    // Initialize locker state manager
    const stateManager = new LockerStateManager(dbManager.getConnection());
    
    // Sync lockers for each kiosk (assuming kiosk-1 for now)
    const kioskId = 'kiosk-1';
    console.log(`\n🔄 Syncing lockers for ${kioskId}...`);
    
    await stateManager.syncLockersWithHardware(kioskId, totalChannels);
    
    // Verify the sync
    const finalLockers = await stateManager.getKioskLockers(kioskId);
    console.log(`\n✅ Sync completed successfully!`);
    console.log(`   - Database now has ${finalLockers.length} lockers`);
    console.log(`   - Hardware supports ${totalChannels} channels`);
    console.log(`   - Configuration shows ${totalChannels} lockers`);
    
    if (finalLockers.length === totalChannels) {
      console.log(`🎉 Perfect match! System is now synchronized.`);
    } else {
      console.log(`⚠️  Still mismatched - manual intervention may be needed.`);
    }
    
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Restart kiosk service: npm run start:kiosk`);
    console.log(`   2. Test RFID session to verify all ${totalChannels} lockers appear`);
    console.log(`   3. Test hardware control for lockers 33-48`);
    
  } catch (error) {
    console.error('💥 Sync failed:', error);
    throw error;
  }
}

// Run the script
if (require.main === module) {
  syncLockersWithHardware()
    .then(() => {
      console.log('\n🎯 Sync script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Sync script failed:', error);
      process.exit(1);
    });
}

module.exports = { syncLockersWithHardware };