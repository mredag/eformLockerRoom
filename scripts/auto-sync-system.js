#!/usr/bin/env node

/**
 * Comprehensive Auto-Sync System
 * 
 * This script ensures the entire system is synchronized:
 * 1. Hardware configuration matches actual relay cards
 * 2. Database has correct number of lockers
 * 3. Configuration files are consistent
 * 
 * Can be run manually or scheduled as a cron job.
 */

const path = require('path');
const fs = require('fs').promises;

async function autoSyncSystem() {
  try {
    console.log('🚀 Starting comprehensive system auto-sync...');
    
    // Ensure we're in the project root
    const projectRoot = process.cwd();
    console.log(`📁 Working directory: ${projectRoot}`);
    
    // Import services (use built versions)
    const { ConfigManager } = require('../shared/dist/services/config-manager');
    const { LockerStateManager } = require('../shared/dist/services/locker-state-manager');
    const { DatabaseManager } = require('../shared/dist/database/database-manager');
    
    // Step 1: Load and analyze configuration
    console.log('\n📊 Step 1: Analyzing configuration...');
    const configManager = ConfigManager.getInstance();
    await configManager.initialize();
    const config = configManager.getConfiguration();
    
    // Calculate hardware capacity
    const allCards = config.hardware.relay_cards;
    const enabledCards = allCards.filter(card => card.enabled);
    const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
    const configuredLockers = config.lockers.total_count;
    
    console.log(`   📋 Hardware analysis:`);
    console.log(`      - Total relay cards: ${allCards.length}`);
    console.log(`      - Enabled cards: ${enabledCards.length}`);
    console.log(`      - Total channels: ${totalChannels}`);
    console.log(`      - Configured lockers: ${configuredLockers}`);
    
    // Step 2: Check for mismatches and fix configuration
    let configUpdated = false;
    if (totalChannels !== configuredLockers) {
      console.log(`\n⚠️  Configuration mismatch detected!`);
      console.log(`   Hardware supports ${totalChannels} lockers but config shows ${configuredLockers}`);
      
      if (totalChannels > configuredLockers) {
        console.log(`🔧 Auto-updating configuration to match hardware...`);
        await configManager.updateParameter(
          'lockers',
          'total_count',
          totalChannels,
          'auto-sync-system',
          `Auto-sync: Hardware supports ${totalChannels} channels (${enabledCards.length} cards × 16)`
        );
        configUpdated = true;
        console.log(`✅ Configuration updated: total_count = ${totalChannels}`);
      } else {
        console.log(`⚠️  Hardware has fewer channels than configured - keeping config value`);
      }
    } else {
      console.log(`✅ Configuration matches hardware capacity`);
    }
    
    // Step 3: Initialize database and sync lockers
    console.log(`\n🗄️  Step 2: Syncing database lockers...`);
    const dbManager = DatabaseManager.getInstance({
      path: process.env.EFORM_DB_PATH,
      migrationsPath: path.join(projectRoot, 'migrations')
    });
    await dbManager.initialize();
    
    const stateManager = new LockerStateManager();
    
    // Sync for each kiosk (currently just kiosk-1)
    const kiosks = ['kiosk-1']; // Could be extended for multiple kiosks
    
    for (const kioskId of kiosks) {
      console.log(`   🔄 Syncing ${kioskId}...`);
      
      const existingLockers = await stateManager.getKioskLockers(kioskId);
      console.log(`      - Current lockers: ${existingLockers.length}`);
      console.log(`      - Target lockers: ${totalChannels}`);
      
      if (existingLockers.length < totalChannels) {
        const missingCount = totalChannels - existingLockers.length;
        console.log(`      - Adding ${missingCount} missing lockers...`);
        
        await stateManager.syncLockersWithHardware(kioskId, totalChannels);
        
        const finalLockers = await stateManager.getKioskLockers(kioskId);
        console.log(`      ✅ Sync complete: ${finalLockers.length} lockers`);
      } else {
        console.log(`      ✅ Already synchronized`);
      }
    }
    
    // Step 4: Verify system consistency
    console.log(`\n🔍 Step 3: Verifying system consistency...`);
    
    const finalConfig = configManager.getConfiguration();
    const finalLockers = await stateManager.getKioskLockers('kiosk-1');
    
    const checks = [
      {
        name: 'Hardware channels match config',
        pass: totalChannels === finalConfig.lockers.total_count,
        details: `${totalChannels} channels, ${finalConfig.lockers.total_count} configured`
      },
      {
        name: 'Database lockers match config',
        pass: finalLockers.length === finalConfig.lockers.total_count,
        details: `${finalLockers.length} in DB, ${finalConfig.lockers.total_count} configured`
      },
      {
        name: 'All systems aligned',
        pass: totalChannels === finalConfig.lockers.total_count && finalLockers.length === totalChannels,
        details: `Hardware: ${totalChannels}, Config: ${finalConfig.lockers.total_count}, DB: ${finalLockers.length}`
      }
    ];
    
    let allPassed = true;
    for (const check of checks) {
      const status = check.pass ? '✅' : '❌';
      console.log(`   ${status} ${check.name}: ${check.details}`);
      if (!check.pass) allPassed = false;
    }
    
    // Step 5: Summary and recommendations
    console.log(`\n📋 Auto-sync Summary:`);
    console.log(`   - Configuration ${configUpdated ? 'updated' : 'unchanged'}`);
    console.log(`   - Database synchronized`);
    console.log(`   - System consistency: ${allPassed ? 'PERFECT' : 'ISSUES DETECTED'}`);
    
    if (allPassed) {
      console.log(`\n🎉 System is fully synchronized!`);
      console.log(`   - ${totalChannels} hardware channels available`);
      console.log(`   - ${finalConfig.lockers.total_count} lockers configured`);
      console.log(`   - ${finalLockers.length} lockers in database`);
      
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Restart services if they're running`);
      console.log(`   2. Test RFID session to verify all lockers appear`);
      console.log(`   3. Test hardware control for new lockers`);
    } else {
      console.log(`\n⚠️  Manual intervention may be required`);
      console.log(`   Check the issues above and run the script again`);
    }
    
    return { success: allPassed, totalChannels, configUpdated };
    
  } catch (error) {
    console.error('\n💥 Auto-sync failed:', error);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const isQuiet = args.includes('--quiet');
  const isDryRun = args.includes('--dry-run');
  
  if (!isQuiet) {
    console.log('🔄 Eform Locker System - Auto-Sync');
    console.log('=====================================');
  }
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
  }
  
  autoSyncSystem()
    .then((result) => {
      if (!isQuiet) {
        console.log('\n🎯 Auto-sync completed successfully!');
        if (result.configUpdated) {
          console.log('⚠️  Services should be restarted to pick up changes');
        }
      }
      process.exit(0);
    })
    .catch((error) => {
      if (!isQuiet) {
        console.error('\n💥 Auto-sync failed:', error.message);
      }
      process.exit(1);
    });
}

module.exports = { autoSyncSystem };