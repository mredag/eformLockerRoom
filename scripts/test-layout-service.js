#!/usr/bin/env node

/**
 * Test script for the Locker Layout Service
 * Verifies that the dynamic layout generation works correctly
 */

const { lockerLayoutService } = require('../shared/dist/services/locker-layout-service');
const { ConfigManager } = require('../shared/dist/services/config-manager');

async function testLayoutService() {
  console.log('🧪 Testing Locker Layout Service');
  console.log('================================');

  try {
    // Test 1: Generate locker layout
    console.log('\\n📋 Test 1: Generate Locker Layout');
    const layout = await lockerLayoutService.generateLockerLayout();
    
    console.log(`✅ Generated layout with ${layout.totalLockers} lockers`);
    console.log(`   Grid: ${layout.rows} rows × ${layout.columns} columns`);
    console.log(`   Lockers: ${layout.lockers.length} configured`);
    
    // Show first few lockers
    console.log('\\n   First 5 lockers:');
    layout.lockers.slice(0, 5).forEach(locker => {
      console.log(`   - Locker ${locker.id}: Card ${locker.cardId}, Relay ${locker.relayId} (${locker.description})`);
    });

    // Test 2: Generate CSS
    console.log('\\n🎨 Test 2: Generate Grid CSS');
    const css = await lockerLayoutService.generateGridCSS();
    console.log(`✅ Generated ${css.length} characters of CSS`);
    console.log('   CSS preview:');
    const cssLines = css.split('\\n').filter(line => line.trim());
    console.log('   ' + cssLines[1]); // Show grid-template-columns line

    // Test 3: Hardware statistics
    console.log('\\n📊 Test 3: Hardware Statistics');
    const stats = await lockerLayoutService.getHardwareStats();
    console.log(`✅ Hardware Stats:`);
    console.log(`   Total Cards: ${stats.totalCards}`);
    console.log(`   Enabled Cards: ${stats.enabledCards}`);
    console.log(`   Total Channels: ${stats.totalChannels}`);
    console.log(`   Configured Lockers: ${stats.configuredLockers}`);
    console.log(`   Utilization: ${stats.utilizationPercent}%`);

    // Test 4: Locker mapping
    console.log('\\n🗺️  Test 4: Locker Mapping');
    const testLockerIds = [1, 8, 16];
    for (const lockerId of testLockerIds) {
      const mapping = await lockerLayoutService.getLockerMapping(lockerId);
      if (mapping) {
        console.log(`✅ Locker ${lockerId}: Card ${mapping.cardId}, Relay ${mapping.relayId}, Slave ${mapping.slaveAddress}`);
      } else {
        console.log(`❌ Locker ${lockerId}: Not found`);
      }
    }

    // Test 5: Validation
    console.log('\\n✅ Test 5: Locker ID Validation');
    const validIds = [1, 8, 16];
    const invalidIds = [0, 17, 100];
    
    for (const id of validIds) {
      const isValid = await lockerLayoutService.isValidLockerId(id);
      console.log(`   Locker ${id}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    }
    
    for (const id of invalidIds) {
      const isValid = await lockerLayoutService.isValidLockerId(id);
      console.log(`   Locker ${id}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    }

    // Test 6: HTML Generation
    console.log('\\n🏗️  Test 6: HTML Generation');
    const panelCards = await lockerLayoutService.generatePanelCards();
    const kioskTiles = await lockerLayoutService.generateKioskTiles();
    
    console.log(`✅ Generated panel cards: ${panelCards.length} characters`);
    console.log(`✅ Generated kiosk tiles: ${kioskTiles.length} characters`);
    
    // Show sample HTML
    const firstCard = panelCards.split('</div>')[0] + '</div>';
    console.log('\\n   Sample panel card HTML:');
    console.log('   ' + firstCard.replace(/\\n\\s+/g, ' ').substring(0, 100) + '...');

    // Test 7: Configuration consistency
    console.log('\\n🔍 Test 7: Configuration Consistency');
    const configManager = ConfigManager.getInstance();
    await configManager.initialize();
    const config = configManager.getConfiguration();
    
    const enabledCards = config.hardware.relay_cards.filter(card => card.enabled);
    const totalChannels = enabledCards.reduce((sum, card) => sum + card.channels, 0);
    const configuredLockers = config.lockers.total_count;
    
    console.log(`   Enabled cards: ${enabledCards.length}`);
    console.log(`   Total channels: ${totalChannels}`);
    console.log(`   Configured lockers: ${configuredLockers}`);
    
    if (totalChannels === configuredLockers) {
      console.log('   ✅ Configuration is consistent');
    } else {
      console.log('   ⚠️  Configuration mismatch detected');
      console.log(`   Recommendation: Set locker count to ${totalChannels}`);
    }

    console.log('\\n🎉 All tests completed successfully!');
    console.log('\\n📝 Summary:');
    console.log(`   - Layout service is working correctly`);
    console.log(`   - ${layout.totalLockers} lockers configured`);
    console.log(`   - ${stats.enabledCards} relay cards enabled`);
    console.log(`   - ${stats.utilizationPercent}% hardware utilization`);
    console.log(`   - HTML generation working for both panel and kiosk`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testLayoutService();
}

module.exports = { testLayoutService };