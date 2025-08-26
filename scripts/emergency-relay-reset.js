#!/usr/bin/env node

/**
 * EMERGENCY RELAY RESET
 * Turns off all relays that are stuck in ON position
 * Use this when relays remain active after service shutdown
 */

const ModbusRTU = require("modbus-serial");

async function emergencyRelayReset() {
  console.log("🚨 EMERGENCY RELAY RESET");
  console.log("=".repeat(50));
  console.log("⚠️  This will turn OFF all relays on all cards");
  console.log("🔧 Use this when relays are stuck ON after service shutdown");
  console.log("");

  const client = new ModbusRTU();
  
  try {
    // Connect to Modbus
    console.log("📡 Connecting to Modbus...");
    await client.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600 });
    console.log("✅ Connected to /dev/ttyUSB0");

    // Reset all relays on cards 1-3 (covers 48 relays total)
    for (let cardId = 1; cardId <= 3; cardId++) {
      console.log(`\n🔌 Resetting Card ${cardId} (Slave Address ${cardId})`);
      
      try {
        client.setID(cardId);
        
        // Turn off all 16 relays on this card using Write Multiple Coils (0x0F)
        const relayStates = new Array(16).fill(false); // All OFF
        
        // Convert boolean array to byte array for Modbus
        const byteCount = Math.ceil(16 / 8); // 2 bytes for 16 relays
        const dataBytes = new Array(byteCount).fill(0);
        
        for (let i = 0; i < 16; i++) {
          const byteIndex = Math.floor(i / 8);
          const bitIndex = i % 8;
          if (relayStates[i]) {
            dataBytes[byteIndex] |= (1 << bitIndex);
          }
        }
        
        // Write multiple coils command
        await client.writeFC15(0, 16, dataBytes);
        console.log(`   ✅ Card ${cardId}: All 16 relays turned OFF`);
        
        // Verify by reading back the status
        const status = await client.readCoils(0, 16);
        const activeCount = status.data.filter(Boolean).length;
        console.log(`   📊 Card ${cardId}: ${activeCount} relays still active`);
        
      } catch (cardError) {
        console.log(`   ❌ Card ${cardId}: Error - ${cardError.message}`);
        
        // Try individual relay reset as fallback
        console.log(`   🔄 Card ${cardId}: Trying individual relay reset...`);
        for (let relay = 1; relay <= 16; relay++) {
          try {
            await client.writeCoil(relay - 1, false);
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
          } catch (relayError) {
            console.log(`   ❌ Card ${cardId}, Relay ${relay}: ${relayError.message}`);
          }
        }
      }
      
      // Small delay between cards
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log("\n🔍 Final Status Check");
    console.log("-".repeat(30));
    
    // Check final status of all cards
    for (let cardId = 1; cardId <= 3; cardId++) {
      try {
        client.setID(cardId);
        const status = await client.readCoils(0, 16);
        const activeRelays = [];
        
        status.data.forEach((isActive, index) => {
          if (isActive) activeRelays.push(index + 1);
        });
        
        if (activeRelays.length === 0) {
          console.log(`✅ Card ${cardId}: All relays OFF`);
        } else {
          console.log(`⚠️  Card ${cardId}: Relays still ON: ${activeRelays.join(', ')}`);
        }
      } catch (error) {
        console.log(`❌ Card ${cardId}: Cannot read status - ${error.message}`);
      }
    }

  } catch (error) {
    console.error("❌ Emergency reset failed:", error.message);
    
    if (error.message.includes("ENOENT") || error.message.includes("cannot open")) {
      console.log("\n🔍 Troubleshooting:");
      console.log("   - Check USB-RS485 connection");
      console.log("   - Verify /dev/ttyUSB0 exists: ls -la /dev/ttyUSB*");
      console.log("   - Check permissions: sudo chmod 666 /dev/ttyUSB0");
      console.log("   - Try different port: /dev/ttyUSB1, /dev/ttyAMA0");
    }
    
    if (error.message.includes("timeout")) {
      console.log("\n🔍 Troubleshooting:");
      console.log("   - Check relay card power (12V)");
      console.log("   - Verify RS485 wiring (A+, B-, GND)");
      console.log("   - Check DIP switch addresses on cards");
    }
  } finally {
    if (client.isOpen) {
      client.close(() => {
        console.log("\n🔌 Modbus connection closed");
      });
    }
  }

  console.log("\n⚠️  IMPORTANT: If relays are still ON after this script:");
  console.log("   1. Power cycle the relay cards (unplug 12V power)");
  console.log("   2. Check for hardware faults");
  console.log("   3. Verify relay card firmware/settings");
  console.log("   4. Consider manual relay card reset button");
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Run the emergency reset
emergencyRelayReset().catch((error) => {
  console.error('Emergency reset failed:', error);
  process.exit(1);
});