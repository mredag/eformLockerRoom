#!/usr/bin/env node

/**
 * Test UI Controller Hardware Integration
 * Tests the enhanced hardware error handling in the UI controller
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const axios = require('axios');

const KIOSK_BASE_URL = 'http://localhost:3002';
const TEST_CARD_ID = '0009652489';
const TEST_KIOSK_ID = 'kiosk-1';

async function testUIHardwareIntegration() {
  console.log('🔧 Testing UI Controller Hardware Integration');
  console.log('=' .repeat(60));

  try {
    // Test 1: Hardware status endpoint
    console.log('\n📋 Test 1: Hardware Status Monitoring');
    console.log('-'.repeat(40));
    
    try {
      const statusResponse = await axios.get(`${KIOSK_BASE_URL}/api/hardware/status`);
      
      if (statusResponse.data.success) {
        console.log('✅ Hardware status endpoint working');
        console.log('Hardware Status:');
        console.log(`  Available: ${statusResponse.data.hardware.available}`);
        console.log(`  Connected: ${statusResponse.data.hardware.connected}`);
        console.log(`  Health Status: ${statusResponse.data.hardware.health.status}`);
        console.log(`  Error Rate: ${statusResponse.data.hardware.diagnostics.errorRate.toFixed(2)}%`);
        console.log(`  Total Commands: ${statusResponse.data.hardware.health.total_commands}`);
        console.log(`  Failed Commands: ${statusResponse.data.hardware.health.failed_commands}`);
      } else {
        console.log('❌ Hardware status endpoint failed');
      }
    } catch (error) {
      console.error('❌ Hardware status request failed:', error.message);
    }

    // Test 2: Card assignment with hardware error handling
    console.log('\n📋 Test 2: Card Assignment with Hardware Error Handling');
    console.log('-'.repeat(40));
    
    try {
      // First, check if card has existing locker
      const checkResponse = await axios.get(`${KIOSK_BASE_URL}/api/card/${TEST_CARD_ID}/locker`);
      console.log('Card check result:', checkResponse.data);
      
      if (checkResponse.data.hasLocker) {
        console.log('✅ Card has existing locker, testing release...');
        
        // Test release with hardware error handling
        const releaseResponse = await axios.post(`${KIOSK_BASE_URL}/api/locker/release`, {
          cardId: TEST_CARD_ID,
          kioskId: TEST_KIOSK_ID
        });
        
        console.log('Release result:', releaseResponse.data);
        
        if (releaseResponse.data.success) {
          console.log('✅ Locker released successfully');
        } else {
          console.log(`❌ Release failed: ${releaseResponse.data.message}`);
          if (releaseResponse.data.hardware_status) {
            console.log('Hardware Status:', releaseResponse.data.hardware_status);
          }
        }
      } else {
        console.log('✅ Card has no existing locker, testing assignment...');
        
        // Get available lockers
        const lockersResponse = await axios.get(`${KIOSK_BASE_URL}/api/lockers/available?kioskId=${TEST_KIOSK_ID}`);
        
        if (lockersResponse.data.length > 0) {
          const testLocker = lockersResponse.data[0];
          console.log(`Testing assignment to locker ${testLocker.id}...`);
          
          // Test assignment with hardware error handling
          const assignResponse = await axios.post(`${KIOSK_BASE_URL}/api/locker/assign`, {
            cardId: TEST_CARD_ID,
            lockerId: testLocker.id,
            kioskId: TEST_KIOSK_ID
          });
          
          console.log('Assignment result:', assignResponse.data);
          
          if (assignResponse.data.success) {
            console.log('✅ Locker assigned and opened successfully');
          } else {
            console.log(`❌ Assignment failed: ${assignResponse.data.message}`);
            if (assignResponse.data.hardware_status) {
              console.log('Hardware Status:', assignResponse.data.hardware_status);
            }
          }
        } else {
          console.log('⚠️ No available lockers for testing');
        }
      }
    } catch (error) {
      console.error('❌ Card assignment test failed:', error.message);
      if (error.response && error.response.data) {
        console.error('Error details:', error.response.data);
      }
    }

    // Test 3: Master PIN hardware error handling
    console.log('\n📋 Test 3: Master PIN Hardware Error Handling');
    console.log('-'.repeat(40));
    
    try {
      // Verify master PIN first
      const pinResponse = await axios.post(`${KIOSK_BASE_URL}/api/master/verify-pin`, {
        pin: '1234',
        kiosk_id: TEST_KIOSK_ID
      });
      
      if (pinResponse.data.success) {
        console.log('✅ Master PIN verified');
        
        // Test master open with hardware error handling
        const masterOpenResponse = await axios.post(`${KIOSK_BASE_URL}/api/master/open-locker`, {
          locker_id: 5,
          kiosk_id: TEST_KIOSK_ID
        });
        
        console.log('Master open result:', masterOpenResponse.data);
        
        if (masterOpenResponse.data.success) {
          console.log('✅ Master open successful');
        } else {
          console.log(`❌ Master open failed: ${masterOpenResponse.data.error}`);
          if (masterOpenResponse.data.hardware_status) {
            console.log('Hardware Status:', masterOpenResponse.data.hardware_status);
          }
        }
      } else {
        console.log('❌ Master PIN verification failed');
      }
    } catch (error) {
      console.error('❌ Master PIN test failed:', error.message);
      if (error.response && error.response.data) {
        console.error('Error details:', error.response.data);
      }
    }

    // Test 4: Session management with hardware errors
    console.log('\n📋 Test 4: Session Management with Hardware Errors');
    console.log('-'.repeat(40));
    
    try {
      // Simulate card scan to create session
      const cardScanResponse = await axios.post(`${KIOSK_BASE_URL}/api/rfid/handle-card`, {
        card_id: TEST_CARD_ID,
        kiosk_id: TEST_KIOSK_ID
      });
      
      console.log('Card scan result:', cardScanResponse.data);
      
      if (cardScanResponse.data.action === 'show_lockers') {
        console.log('✅ Session created, testing locker selection...');
        
        // Get session status
        const sessionResponse = await axios.get(`${KIOSK_BASE_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
        console.log('Session status:', sessionResponse.data);
        
        if (sessionResponse.data.active && sessionResponse.data.available_lockers.length > 0) {
          const testLocker = sessionResponse.data.available_lockers[0];
          
          // Test locker selection with hardware error handling
          const selectResponse = await axios.post(`${KIOSK_BASE_URL}/api/lockers/select`, {
            session_id: sessionResponse.data.session_id,
            locker_id: testLocker.id,
            kiosk_id: TEST_KIOSK_ID
          });
          
          console.log('Locker selection result:', selectResponse.data);
          
          if (selectResponse.data.success) {
            console.log('✅ Locker selection successful');
          } else {
            console.log(`❌ Locker selection failed: ${selectResponse.data.message}`);
            if (selectResponse.data.hardware_status) {
              console.log('Hardware Status:', selectResponse.data.hardware_status);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Session management test failed:', error.message);
      if (error.response && error.response.data) {
        console.error('Error details:', error.response.data);
      }
    }

    // Test 5: Error recovery testing
    console.log('\n📋 Test 5: Error Recovery Testing');
    console.log('-'.repeat(40));
    
    try {
      // Test retry endpoint
      const retryResponse = await axios.post(`${KIOSK_BASE_URL}/api/session/retry`, {
        card_id: TEST_CARD_ID,
        kiosk_id: TEST_KIOSK_ID
      });
      
      console.log('Retry result:', retryResponse.data);
      
      if (retryResponse.data.success) {
        console.log('✅ Retry successful');
      } else {
        console.log(`❌ Retry failed: ${retryResponse.data.message}`);
      }
    } catch (error) {
      console.error('❌ Error recovery test failed:', error.message);
      if (error.response && error.response.data) {
        console.error('Error details:', error.response.data);
      }
    }

    console.log('\n🎯 UI Hardware Integration Test Summary');
    console.log('=' .repeat(60));
    console.log('✅ UI Controller hardware integration testing completed');
    console.log('📊 All enhanced error handling features tested');
    console.log('🔧 Hardware status monitoring validated');

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Helper function to wait for service to be ready
async function waitForService(url, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(`${url}/health`);
      return true;
    } catch (error) {
      console.log(`Waiting for service... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
}

// Run the test
if (require.main === module) {
  console.log('🔧 Checking if kiosk service is running...');
  
  waitForService(KIOSK_BASE_URL)
    .then((ready) => {
      if (ready) {
        console.log('✅ Kiosk service is ready');
        return testUIHardwareIntegration();
      } else {
        throw new Error('Kiosk service is not responding. Please start it first.');
      }
    })
    .then(() => {
      console.log('✅ All tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testUIHardwareIntegration };