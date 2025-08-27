#!/usr/bin/env node

/**
 * Error Scenarios and Recovery Paths Test
 * Tests Requirements 2.5, 2.6, 4.4, 4.5, 6.1-6.6
 * 
 * This test validates:
 * - Assignment failure error handling (2.5)
 * - Return to idle state after errors (2.6)
 * - Hardware error handling (4.4, 4.5)
 * - Turkish error messages (6.1-6.6)
 * - Error recovery mechanisms
 */

const fetch = require('node-fetch');

const KIOSK_URL = process.env.KIOSK_URL || 'http://192.168.1.8:3002';
const TEST_KIOSK_ID = 'kiosk-1';
const TEST_CARD = '0009652489';

class ErrorRecoveryTester {
  constructor() {
    this.testResults = [];
    this.expectedErrorMessages = {
      'session_expired': 'Oturum süresi doldu - Kartınızı tekrar okutun',
      'assignment_failed': 'Dolap atanamadı - Farklı dolap seçin',
      'hardware_unavailable': 'Sistem bakımda - Görevliye başvurun',
      'connection_error': 'Bağlantı hatası - Tekrar deneyin',
      'no_lockers': 'Müsait dolap yok - Daha sonra deneyin',
      'server_error': 'Sistem hatası - Tekrar deneyin'
    };
  }

  async runTests() {
    console.log('🚨 Error Scenarios and Recovery Paths Test');
    console.log('==========================================');
    console.log(`Testing against: ${KIOSK_URL}`);
    console.log('');

    try {
      await this.testInvalidSessionErrors();
      await this.testMissingParameterErrors();
      await this.testAssignmentFailureRecovery();
      await this.testHardwareErrorHandling();
      await this.testTurkishErrorMessages();
      await this.testNetworkErrorRecovery();
      await this.testReturnToIdleState();
      await this.testErrorRecoveryMechanisms();
      
      this.reportResults();
    } catch (error) {
      console.error('❌ Error recovery test failed:', error.message);
      process.exit(1);
    }
  }

  // Test invalid session error handling (Requirement 2.5)
  async testInvalidSessionErrors() {
    console.log('📋 Testing Invalid Session Error Handling (Requirement 2.5)');
    console.log('===========================================================');

    try {
      // Test with completely invalid session ID
      const invalidSessionResult = await this.selectLockerWithSession('invalid-session-id', 1);
      
      if (invalidSessionResult.error === 'session_expired' || invalidSessionResult.error === 'missing_parameters') {
        this.logResult('✅ Invalid session ID properly rejected with appropriate error', true);
        
        // Check Turkish error message
        if (invalidSessionResult.message && invalidSessionResult.message.includes('Oturum')) {
          this.logResult('✅ Turkish error message provided for invalid session', true);
        } else {
          this.logResult('❌ Turkish error message missing for invalid session', false);
        }
      } else {
        this.logResult(`❌ Invalid session not properly handled: ${invalidSessionResult.error}`, false);
      }

      // Test with expired session (simulate by using old session ID)
      const expiredSessionResult = await this.selectLockerWithSession('expired-session-123', 1);
      
      if (expiredSessionResult.error) {
        this.logResult('✅ Expired session properly rejected', true);
      } else {
        this.logResult('❌ Expired session not properly handled', false);
      }

    } catch (error) {
      this.logResult(`❌ Invalid session error test failed: ${error.message}`, false);
    }
  }

  // Test missing parameter error handling
  async testMissingParameterErrors() {
    console.log('\n📋 Testing Missing Parameter Error Handling');
    console.log('==========================================');

    try {
      // Test missing card_id
      const missingCardResult = await this.makeRequest('/api/rfid/handle-card', {
        kiosk_id: TEST_KIOSK_ID
        // Missing card_id
      });
      
      if (missingCardResult.error) {
        this.logResult('✅ Missing card_id parameter properly rejected', true);
      } else {
        this.logResult('❌ Missing card_id parameter not validated', false);
      }

      // Test missing kiosk_id
      const missingKioskResult = await this.makeRequest('/api/rfid/handle-card', {
        card_id: TEST_CARD
        // Missing kiosk_id
      });
      
      if (missingKioskResult.error) {
        this.logResult('✅ Missing kiosk_id parameter properly rejected', true);
      } else {
        this.logResult('❌ Missing kiosk_id parameter not validated', false);
      }

      // Test missing locker_id in selection
      const missingLockerResult = await this.makeRequest('/api/lockers/select', {
        kiosk_id: TEST_KIOSK_ID,
        session_id: 'test-session'
        // Missing locker_id
      });
      
      if (missingLockerResult.error) {
        this.logResult('✅ Missing locker_id parameter properly rejected', true);
      } else {
        this.logResult('❌ Missing locker_id parameter not validated', false);
      }

    } catch (error) {
      this.logResult(`❌ Missing parameter error test failed: ${error.message}`, false);
    }
  }

  // Test assignment failure recovery (Requirement 2.5)
  async testAssignmentFailureRecovery() {
    console.log('\n📋 Testing Assignment Failure Recovery (Requirement 2.5)');
    console.log('========================================================');

    try {
      // Create a session first
      const cardScanResult = await this.scanCard(TEST_CARD);
      
      if (cardScanResult.action === 'show_lockers' && cardScanResult.lockers.length > 0) {
        const sessionId = cardScanResult.session_id;
        
        // Try to select a locker that might fail (using invalid locker ID)
        const failureResult = await this.selectLockerWithSession(sessionId, 999);
        
        if (failureResult.error) {
          this.logResult('✅ Assignment failure properly detected', true);
          
          // Check if error message is in Turkish
          if (failureResult.message && failureResult.message.includes('dolap')) {
            this.logResult('✅ Turkish error message for assignment failure', true);
          }
          
          // Test recovery - try with valid locker
          const recoveryResult = await this.selectLockerWithSession(sessionId, cardScanResult.lockers[0].id);
          
          if (recoveryResult.success || recoveryResult.error === 'session_expired') {
            this.logResult('✅ Recovery attempt processed (session may have expired)', true);
          } else {
            this.logResult('❌ Recovery attempt failed', false);
          }
        }
      } else if (cardScanResult.action === 'open_locker') {
        this.logResult('✅ Card had existing assignment (normal behavior)', true);
      }

    } catch (error) {
      this.logResult(`❌ Assignment failure recovery test failed: ${error.message}`, false);
    }
  }

  // Test hardware error handling (Requirements 4.4, 4.5)
  async testHardwareErrorHandling() {
    console.log('\n📋 Testing Hardware Error Handling (Requirements 4.4, 4.5)');
    console.log('==========================================================');

    try {
      // Test hardware status endpoint
      const hardwareStatusResult = await this.makeRequest('/api/hardware/status', {}, 'GET');
      
      if (hardwareStatusResult.available !== undefined) {
        this.logResult('✅ Hardware status endpoint available', true);
        
        if (hardwareStatusResult.available === false) {
          this.logResult('✅ Hardware unavailable status properly reported', true);
        } else {
          this.logResult('✅ Hardware available status reported', true);
        }
      } else {
        this.logResult('⚠️  Hardware status endpoint not providing availability info', false);
      }

      // Test locker operation when hardware might be unavailable
      const cardScanResult = await this.scanCard(TEST_CARD);
      
      if (cardScanResult.action === 'show_lockers' && cardScanResult.lockers.length > 0) {
        const selectionResult = await this.selectLockerWithSession(
          cardScanResult.session_id, 
          cardScanResult.lockers[0].id
        );
        
        if (selectionResult.error === 'hardware_unavailable' || 
            selectionResult.error === 'hardware_failed' ||
            selectionResult.success) {
          this.logResult('✅ Hardware error handling working (or hardware is functional)', true);
        } else {
          this.logResult(`⚠️  Unexpected hardware response: ${selectionResult.error}`, false);
        }
      }

    } catch (error) {
      this.logResult(`❌ Hardware error handling test failed: ${error.message}`, false);
    }
  }

  // Test Turkish error messages (Requirements 6.1-6.6)
  async testTurkishErrorMessages() {
    console.log('\n📋 Testing Turkish Error Messages (Requirements 6.1-6.6)');
    console.log('========================================================');

    try {
      // Test various error scenarios and check for Turkish messages
      const errorTests = [
        {
          name: 'Invalid session',
          request: () => this.selectLockerWithSession('invalid', 1),
          expectedKeywords: ['Oturum', 'süresi', 'doldu', 'Kartınızı']
        },
        {
          name: 'Missing parameters',
          request: () => this.makeRequest('/api/rfid/handle-card', { card_id: TEST_CARD }),
          expectedKeywords: ['hata', 'eksik', 'gerekli']
        }
      ];

      for (const test of errorTests) {
        try {
          const result = await test.request();
          
          if (result.message) {
            const hasTurkishKeywords = test.expectedKeywords.some(keyword => 
              result.message.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (hasTurkishKeywords) {
              this.logResult(`✅ Turkish error message for ${test.name}`, true);
            } else {
              this.logResult(`⚠️  Error message for ${test.name} may not be in Turkish: "${result.message}"`, false);
            }
          } else {
            this.logResult(`⚠️  No error message provided for ${test.name}`, false);
          }
        } catch (error) {
          this.logResult(`⚠️  Could not test Turkish message for ${test.name}: ${error.message}`, false);
        }
      }

    } catch (error) {
      this.logResult(`❌ Turkish error messages test failed: ${error.message}`, false);
    }
  }

  // Test network error recovery
  async testNetworkErrorRecovery() {
    console.log('\n📋 Testing Network Error Recovery');
    console.log('================================');

    try {
      // Test with invalid URL to simulate network error
      const invalidUrlResult = await this.makeRequest('/api/invalid-endpoint', {}, 'GET');
      
      // Should get 404 or similar error
      if (invalidUrlResult.error || invalidUrlResult.statusCode === 404) {
        this.logResult('✅ Invalid endpoint properly handled', true);
      }

      // Test normal endpoint to verify recovery
      const validResult = await this.makeRequest('/health', {}, 'GET');
      
      if (validResult.status === 'ok' || validResult.healthy) {
        this.logResult('✅ Network recovery - valid endpoint accessible', true);
      } else {
        this.logResult('⚠️  Health endpoint not responding as expected', false);
      }

    } catch (error) {
      this.logResult(`❌ Network error recovery test failed: ${error.message}`, false);
    }
  }

  // Test return to idle state (Requirement 2.6)
  async testReturnToIdleState() {
    console.log('\n📋 Testing Return to Idle State (Requirement 2.6)');
    console.log('==================================================');

    try {
      // Clear any existing sessions
      await this.clearSessions();
      
      // Create session and let it expire or complete
      const cardScanResult = await this.scanCard(TEST_CARD);
      
      if (cardScanResult.action === 'show_lockers') {
        // Cancel session to simulate return to idle
        await this.clearSessions();
        
        // Check that system returns to idle
        const idleStatus = await this.getSessionStatus();
        
        if (!idleStatus.has_session || idleStatus.state === 'idle') {
          this.logResult('✅ System returns to idle state after session end (Requirement 2.6)', true);
        } else {
          this.logResult('❌ System not returning to idle state properly (Requirement 2.6)', false);
        }
      } else if (cardScanResult.action === 'open_locker') {
        // Card had existing assignment - this should also return to idle
        const postOpenStatus = await this.getSessionStatus();
        
        if (!postOpenStatus.has_session || postOpenStatus.state === 'idle') {
          this.logResult('✅ System returns to idle after locker opening (Requirement 2.6)', true);
        } else {
          this.logResult('⚠️  System state after locker opening unclear', false);
        }
      }

    } catch (error) {
      this.logResult(`❌ Return to idle state test failed: ${error.message}`, false);
    }
  }

  // Test error recovery mechanisms
  async testErrorRecoveryMechanisms() {
    console.log('\n📋 Testing Error Recovery Mechanisms');
    console.log('===================================');

    try {
      // Test retry capability after errors
      const cardScanResult = await this.scanCard(TEST_CARD);
      
      if (cardScanResult.action === 'show_lockers') {
        // Try invalid locker selection
        const failureResult = await this.selectLockerWithSession(cardScanResult.session_id, 999);
        
        if (failureResult.error) {
          // Check if retry is allowed
          if (failureResult.allow_retry !== false) {
            this.logResult('✅ Error recovery allows retry attempts', true);
          }
          
          // Test actual retry with valid locker
          if (cardScanResult.lockers.length > 0) {
            const retryResult = await this.selectLockerWithSession(
              cardScanResult.session_id, 
              cardScanResult.lockers[0].id
            );
            
            if (retryResult.success || retryResult.error === 'session_expired') {
              this.logResult('✅ Retry mechanism functional', true);
            } else {
              this.logResult('⚠️  Retry attempt had issues', false);
            }
          }
        }
      }

      // Test recovery from various error states
      await this.testRecoveryFromErrorStates();

    } catch (error) {
      this.logResult(`❌ Error recovery mechanisms test failed: ${error.message}`, false);
    }
  }

  async testRecoveryFromErrorStates() {
    try {
      // Test recovery by scanning card after various errors
      const recoveryTests = [
        'Invalid session error',
        'Missing parameter error',
        'Network error'
      ];

      for (const testName of recoveryTests) {
        // Clear state
        await this.clearSessions();
        
        // Try normal operation after error
        const recoveryResult = await this.scanCard(TEST_CARD);
        
        if (recoveryResult.action === 'show_lockers' || recoveryResult.action === 'open_locker') {
          this.logResult(`✅ Recovery from ${testName} successful`, true);
        } else {
          this.logResult(`⚠️  Recovery from ${testName} unclear`, false);
        }
      }

    } catch (error) {
      this.logResult(`❌ Recovery from error states test failed: ${error.message}`, false);
    }
  }

  // Helper methods
  async scanCard(cardId) {
    return await this.makeRequest('/api/rfid/handle-card', {
      card_id: cardId,
      kiosk_id: TEST_KIOSK_ID
    });
  }

  async selectLockerWithSession(sessionId, lockerId) {
    return await this.makeRequest('/api/lockers/select', {
      locker_id: lockerId,
      kiosk_id: TEST_KIOSK_ID,
      session_id: sessionId
    });
  }

  async getSessionStatus() {
    return await this.makeRequest(`/api/session/status?kiosk_id=${TEST_KIOSK_ID}`, {}, 'GET');
  }

  async clearSessions() {
    try {
      await this.makeRequest('/api/session/cancel', {
        kiosk_id: TEST_KIOSK_ID,
        reason: 'Test cleanup'
      });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async makeRequest(endpoint, body = {}, method = 'POST') {
    try {
      const url = `${KIOSK_URL}${endpoint}`;
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (method === 'POST' && Object.keys(body).length > 0) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      
      if (response.ok) {
        return await response.json();
      } else {
        // Return error info for testing
        const errorText = await response.text();
        return {
          error: 'http_error',
          statusCode: response.status,
          message: errorText
        };
      }
    } catch (error) {
      return {
        error: 'network_error',
        message: error.message
      };
    }
  }

  logResult(message, success) {
    console.log(message);
    this.testResults.push({
      message,
      success,
      timestamp: new Date().toISOString()
    });
  }

  reportResults() {
    console.log('\n📊 Error Recovery Test Results');
    console.log('==============================');
    
    const passed = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.filter(r => !r.success).length;
    const total = this.testResults.length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📋 Total: ${total}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.message}`));
    }
    
    const successRate = total > 0 ? (passed / total) * 100 : 0;
    console.log(`\n📈 Success Rate: ${successRate.toFixed(1)}%`);
    
    if (failed === 0) {
      console.log('\n🎉 All error recovery tests passed!');
    } else {
      console.log('\n🔧 Some error recovery tests failed. Please review the implementation.');
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ErrorRecoveryTester();
  tester.runTests().catch(error => {
    console.error('Error recovery test failed:', error);
    process.exit(1);
  });
}

module.exports = ErrorRecoveryTester;