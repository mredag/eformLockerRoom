#!/usr/bin/env node

/**
 * Hardware Configuration Script
 * 
 * This script helps configure the eForm Locker System for your specific hardware setup.
 * It automatically calculates the total locker count based on your relay cards.
 */

const fs = require('fs').promises;
const path = require('path');

async function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'system.json');
  const configData = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(configData);
}

async function saveConfig(config) {
  const configPath = path.join(__dirname, '..', 'config', 'system.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

async function configureHardware() {
  console.log('🔧 eForm Locker System - Hardware Configuration');
  console.log('================================================');

  try {
    const config = await loadConfig();
    
    // Display current configuration
    console.log('\n📋 Current Hardware Configuration:');
    console.log(`   Total Lockers: ${config.lockers.total_count}`);
    console.log(`   Relay Cards: ${config.hardware.relay_cards.length}`);
    
    config.hardware.relay_cards.forEach((card, index) => {
      console.log(`   Card ${index + 1}: Slave ${card.slave_address}, ${card.channels} channels, ${card.enabled ? 'Enabled' : 'Disabled'}`);
    });

    // Calculate total channels from enabled cards
    const totalChannels = config.hardware.relay_cards
      .filter(card => card.enabled)
      .reduce((sum, card) => sum + card.channels, 0);

    console.log(`\n🔍 Analysis:`);
    console.log(`   Enabled Cards: ${config.hardware.relay_cards.filter(card => card.enabled).length}`);
    console.log(`   Total Available Channels: ${totalChannels}`);
    console.log(`   Configured Lockers: ${config.lockers.total_count}`);

    // Check if configuration is optimal
    if (config.lockers.total_count !== totalChannels) {
      console.log(`\n⚠️  Configuration Mismatch Detected!`);
      console.log(`   You have ${totalChannels} relay channels but ${config.lockers.total_count} lockers configured.`);
      console.log(`   Recommendation: Set total_count to ${totalChannels} for optimal hardware usage.`);
      
      // Auto-fix option
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question('\n🔧 Auto-fix configuration? (y/N): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        config.lockers.total_count = totalChannels;
        
        // Update layout for better UI
        const columns = Math.ceil(Math.sqrt(totalChannels));
        const rows = Math.ceil(totalChannels / columns);
        config.lockers.layout.columns = columns;
        config.lockers.layout.rows = rows;
        
        await saveConfig(config);
        console.log(`✅ Configuration updated!`);
        console.log(`   Total Lockers: ${totalChannels}`);
        console.log(`   Layout: ${rows} rows × ${columns} columns`);
      }
    } else {
      console.log(`\n✅ Configuration is optimal!`);
      console.log(`   All ${totalChannels} relay channels are configured as lockers.`);
    }

    // Display hardware mapping
    console.log(`\n🗺️  Hardware Mapping:`);
    config.hardware.relay_cards.forEach((card, cardIndex) => {
      if (!card.enabled) return;
      
      const startLocker = (cardIndex * 16) + 1;
      const endLocker = Math.min(startLocker + card.channels - 1, config.lockers.total_count);
      
      console.log(`   Card ${card.slave_address} (${card.description}):`);
      console.log(`     Lockers ${startLocker}-${endLocker} → Relays 1-${card.channels}`);
      console.log(`     DIP Switches: ${card.dip_switches}`);
    });

    console.log(`\n📖 Next Steps:`);
    console.log(`   1. Verify DIP switch settings on your relay cards`);
    console.log(`   2. Rebuild and restart services: npm run build:kiosk && ./scripts/start-all-clean.sh`);
    console.log(`   3. Test hardware: node scripts/test-basic-relay-control.js`);
    console.log(`   4. Check UI: http://192.168.1.8:3002`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Add new relay card function
async function addRelayCard() {
  const config = await loadConfig();
  const nextSlaveAddress = Math.max(...config.hardware.relay_cards.map(c => c.slave_address)) + 1;
  
  const newCard = {
    slave_address: nextSlaveAddress,
    channels: 16,
    type: "waveshare_16ch",
    dip_switches: nextSlaveAddress.toString(2).padStart(8, '0'),
    description: `Locker Bank ${(nextSlaveAddress - 1) * 16 + 1}-${nextSlaveAddress * 16}`,
    enabled: true
  };

  config.hardware.relay_cards.push(newCard);
  
  // Update total count
  const totalChannels = config.hardware.relay_cards
    .filter(card => card.enabled)
    .reduce((sum, card) => sum + card.channels, 0);
  config.lockers.total_count = totalChannels;

  await saveConfig(config);
  console.log(`✅ Added relay card ${nextSlaveAddress} with ${newCard.channels} channels`);
  console.log(`   DIP Switches: ${newCard.dip_switches}`);
  console.log(`   Total Lockers: ${totalChannels}`);
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case 'add-card':
    addRelayCard();
    break;
  case 'configure':
  default:
    configureHardware();
    break;
}