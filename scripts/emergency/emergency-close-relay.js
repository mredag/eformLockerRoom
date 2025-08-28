#!/usr/bin/env node

/**
 * EMERGENCY: Close all relays immediately
 * Use this if relays are stuck open to prevent hardware damage
 */

const axios = require('axios').default;

const KIOSK_URL = 'http://localhost:3002';

async function emergencyCloseAllRelays() {
  console.log('🚨 EMERGENCY: Closing all relays to prevent hardware damage');
  console.log('============================================================');
  
  try {
    // Try to close relays 1-16 (first card)
    for (let lockerId = 1; lockerId <= 16; lockerId++) {
      try {
        console.log(`🔧 Attempting to close relay ${lockerId}...`);
        
        const response = await axios.post(`${KIOSK_URL}/api/locker/close`, {
          locker_id: lockerId,
          staff_user: 'emergency-close',
          reason: 'Emergency relay close to prevent damage'
        });
        
        console.log(`✅ Relay ${lockerId}: ${response.data.message || 'Closed'}`);
        
      } catch (error) {
        console.log(`❌ Relay ${lockerId}: ${error.response?.data?.message || error.message}`);
      }
      
      // Small delay between commands
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('\n🎯 Emergency close completed');
    console.log('Check hardware to verify all relays are OFF');
    
  } catch (error) {
    console.error('❌ Emergency close failed:', error.message);
    console.log('\n🚨 MANUAL ACTION REQUIRED:');
    console.log('1. Physically disconnect power to relay cards');
    console.log('2. Check hardware connections');
    console.log('3. Restart Kiosk service');
  }
}

// Run emergency close
emergencyCloseAllRelays().catch(console.error);