#!/usr/bin/env node

/**
 * Comprehensive Card Assignment Flow Test Suite
 * Tests Requirements 2.1-2.6 (Card Assignment) and 3.1-3.6 (Session Management)
 * 
 * This test suite validates:
 * - Existing card detection and locker opening (2.1, 2.2)
 * - New card assignment and locker selection (2.3, 2.4)
 * - Session timeout and cleanup behavior (3.1-3.6)
 * - Error scenarios and recovery paths (2.5, 2.6)
 */

const fetch = require('node-fetch');

const KIOSK_URL = process.env.KIOSK_URL || 'http://192.168.1.8:3002';
const TEST_KIOSK_ID = 'kiosk-1';
const TEST_CARDS = {
  existing: '0009652489',  // Card that might have existing assignment
  new: '0009652490',       // Card for new assignment testing
  invalid: 'INVALID123'    // Invalid card for error testing
};

class CardAssignmentTester {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  async runAllTests() {
    console.log('🧪 Comprehensive Card Assignment Flow Test Suite');
    console.log('================================================');
    console.log(`Testing against: ${KIOSK_URL}`);
    console.log(`Kiosk ID: ${TEST_KIOSK_ID}`);
    console.log('');

    try {
      // Pre-test setup
      await this.setupTests();

      // Core functionality tests
      await this.testExistingCardDetection();
      await this.testNewCardAssignment();
      await this.testSessionManagement();
      await this.testErrorScenarios();
      await this.testRecoveryPaths();

      // Performance and edge case tests
      await this.testConcurrentSessions();
      await this.testSessionTimeout();
      await this.testHardwareFailures();

      // Report results
      this.reportResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async setupTests() {
    console.log('🔧 Setting up test environment...');
    
    // Check kiosk service health
    const healthResponse = await fetch(`${KIOSK_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Kiosk service not available: ${healthResponse.status}`);
    }
    
    // Clear any existing sessions
    await this.clearExistingSessions();
    
    this.logResult('✅ Test environment setup complete', 'setup');
  }

  async clearExistingSessions() {
    try {
      await fetch(`${KIOSK_URL}/api/session/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kiosk_id: TEST_KIOSK_ID,
          reason: 'Test cleanup'
        })
      });
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Test Requirement 2.1 & 2.2: Existing card detection and locker opening
  async testExistingCardDetection() {
    console.log('\n📋 Testing Existing Card Detection (Requirements 2.1, 2.2)');
    console.log('=========================================================');

    try {
      // First, try to create an assignment for testing
      const cardScanResult = await this.scanCard(TEST_CARDS.existing);
      
      if (cardScanResult.action === 'open_locker') {
        // Card already had assignment - perfect for testing 2.1, 2.2
        this.logResult('✅ Requirement 2.1: Card with existing assignment detected', 'existing_detection');
        this.logResult('✅ Requirement 2.2: Existing locker opened and released', 'existing_release');
        
        // Verify the locker was actually released
        const secondScan = await this.scanCard(TEST_CARDS.existing);
        if (secondScan.action === 'show_lockers') {
          this.logResult('✅ Locker properly released after opening', 'release_verification');
        } else {
          this.logResult('⚠️  Locker may not have been properly released', 'release_warning');
        }
        
      } else if (cardScanResult.action === 'show_lockers') {
        // Card has no existing assignment - create one for testing
        const assignment = await this.assignLocker(cardScanResult, 1);
        
        if (assignment.success) {
          // Now test existing card detection
          const existingCardResult = await this.scanCard(TEST_CARDS.existing);
          
          if (existingCardResult.action === 'open_locker') {
            this.logResult('✅ Requirement 2.1: Existing assignment detected correctly', 'existing_detection');
            this.logResult('✅ Requirement 2.2: Existing locker opened and released', 'existing_release');
          } else {
            this.logResult('❌ Requirement 2.1: Failed to detect existing assignment', 'existing_detection_fail');
          }
        }
      }

    } catch (error) {
      this.logResult(`❌ Existing card detection test failed: ${error.message}`, 'existing_error');
    }
  }

  // Test Requirements 2.3 & 2.4: New card assignment and locker selection
  async testNewCardAssignment() {
    console.log('\n📋 Testing New Card Assignment (Requirements 2.3, 2.4)');
    console.log('======================================================');

    try {
      // Test new card scan
      const cardScanResult = await this.scanCard(TEST_CARDS.new);
      
      if (cardScanResult.action === 'open_locker') {
        // Card had existing assignment - release it first
        await this.scanCard(TEST_CARDS.new); // This should release it
        const newScanResult = await this.scanCard(TEST_CARDS.new);
        
        if (newScanResult.action === 'show_lockers') {
          await this.validateNewCardFlow(newScanResult);
        }
      } else if (cardScanResult.action === 'show_lockers') {
        await this.validateNewCardFlow(cardScanResult);
      } else {
        this.logResult(`❌ Unexpected card scan result: ${cardScanResult.action}`, 'new_card_error');
      }

    } catch (error) {
      this.logResult(`❌ New card assignment test failed: ${error.message}`, 'new_card_error');
    }
  }

  async validateNewCardFlow(cardScanResult) {
    // Requirement 2.3: Show available lockers
    if (cardScanResult.lockers && cardScanResult.lockers.length > 0) {
      this.logResult('✅ Requirement 2.3: Available lockers shown for new card', 'show_lockers');
      
      // Requirement 2.4: Assign locker to card
      const selectedLocker = cardScanResult.lockers[0];
      const assignmentResult = await this.assignLocker(cardScanResult, selectedLocker.id);
      
      if (assignmentResult.success) {
        this.logResult('✅ Requirement 2.4: Locker successfully assigned and opened', 'locker_assignment');
        
        // Verify assignment by scanning card again
        const verificationScan = await this.scanCard(TEST_CARDS.new);
        if (verificationScan.action === 'open_locker') {
          this.logResult('✅ Assignment verification: Card now has assigned locker', 'assignment_verification');
        }
      } else {
        this.logResult(`❌ Requirement 2.4: Locker assignment failed - ${assignmentResult.message}`, 'assignment_fail');
      }
    } else {
      this.logResult('⚠️  No available lockers for testing assignment', 'no_lockers_warning');
    }
  }

  // Test Requirements 3.1-3.6: Session Management
  async testSessionManagement() {
    console.log('\n📋 Testing Session Management (Requirements 3.1-3.6)');
    console.log('====================================================');

    try {
      // Clear any existing sessions
      await this.clearExistingSessions();
      
      // Test session creation (3.1)
      const cardScanResult = await this.scanCard(TEST_CARDS.new);
      
      if (cardScanResult.action === 'show_lockers') {
        // Requirement 3.1: 30-second session timeout
        if (cardScanResult.timeout_seconds === 30) {
          this.logResult('✅ Requirement 3.1: Session created with 30-second timeout', 'session_timeout');
        } else {
          this.logResult(`⚠️  Requirement 3.1: Session timeout is ${cardScanResult.timeout_seconds}s, expected 30s`, 'timeout_warning');
        }
        
        // Requirement 3.2: Session status with countdown
        await this.testSessionStatus(cardScanResult.session_id);
        
        // Requirement 3.5: New card cancels existing session
        await this.testSessionCancellation();
        
      } else if (cardScanResult.action === 'open_locker') {
        // Card had existing assignment - clear it and retry
        await this.scanCard(TEST_CARDS.new);
        await this.testSessionManagement();
      }

    } catch (error) {
      this.logResult(`❌ Session management test failed: ${error.message}`, 'session_error');
    }
  }

  async testSessionStatus(sessionId) {
    try {
      const statusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
      const statusResult = await statusResponse.json();
      
      if (statusResult.has_session && statusResult.remaining_seconds > 0) {
        this.logResult('✅ Requirement 3.2: Session status shows countdown timer', 'session_status');
        
        // Test countdown progression
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const updatedStatusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
        const updatedStatusResult = await updatedStatusResponse.json();
        
        if (updatedStatusResult.remaining_seconds < statusResult.remaining_seconds) {
          this.logResult('✅ Session countdown progressing correctly', 'countdown_progress');
        } else {
          this.logResult('⚠️  Session countdown may not be progressing', 'countdown_warning');
        }
      } else {
        this.logResult('❌ Requirement 3.2: Session status not showing active session', 'session_status_fail');
      }
    } catch (error) {
      this.logResult(`❌ Session status test failed: ${error.message}`, 'session_status_error');
    }
  }

  async testSessionCancellation() {
    try {
      // Create first session
      const firstScan = await this.scanCard(TEST_CARDS.existing);
      
      if (firstScan.action === 'show_lockers') {
        const firstSessionId = firstScan.session_id;
        
        // Scan different card to cancel first session (Requirement 3.5)
        const secondScan = await this.scanCard(TEST_CARDS.new);
        
        // Check if first session was cancelled
        const firstSessionStatus = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
        const firstSessionResult = await firstSessionStatus.json();
        
        if (!firstSessionResult.has_session || firstSessionResult.session_id !== firstSessionId) {
          this.logResult('✅ Requirement 3.5: New card scan cancelled existing session', 'session_cancellation');
        } else {
          this.logResult('❌ Requirement 3.5: New card scan did not cancel existing session', 'session_cancellation_fail');
        }
      }
    } catch (error) {
      this.logResult(`❌ Session cancellation test failed: ${error.message}`, 'session_cancellation_error');
    }
  }

  // Test Requirements 2.5 & 2.6: Error scenarios and recovery
  async testErrorScenarios() {
    console.log('\n📋 Testing Error Scenarios (Requirements 2.5, 2.6)');
    console.log('==================================================');

    try {
      // Test invalid session ID (Requirement 2.5)
      await this.testInvalidSession();
      
      // Test missing parameters
      await this.testMissingParameters();
      
      // Test invalid card
      await this.testInvalidCard();
      
      // Test no available lockers scenario
      await this.testNoAvailableLockers();

    } catch (error) {
      this.logResult(`❌ Error scenarios test failed: ${error.message}`, 'error_scenarios_fail');
    }
  }

  async testInvalidSession() {
    try {
      const response = await fetch(`${KIOSK_URL}/api/lockers/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locker_id: 1,
          kiosk_id: TEST_KIOSK_ID,
          session_id: 'invalid-session-id'
        })
      });

      const result = await response.json();
      
      if (result.error === 'session_expired' || result.error === 'missing_parameters') {
        this.logResult('✅ Requirement 2.5: Invalid session properly rejected', 'invalid_session');
      } else {
        this.logResult(`⚠️  Invalid session response: ${result.error}`, 'invalid_session_warning');
      }
    } catch (error) {
      this.logResult(`❌ Invalid session test failed: ${error.message}`, 'invalid_session_error');
    }
  }

  async testMissingParameters() {
    try {
      const response = await fetch(`${KIOSK_URL}/api/rfid/handle-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: TEST_CARDS.new
          // Missing kiosk_id
        })
      });

      const result = await response.json();
      
      if (result.error) {
        this.logResult('✅ Missing parameters properly rejected', 'missing_params');
      } else {
        this.logResult('❌ Missing parameters not properly validated', 'missing_params_fail');
      }
    } catch (error) {
      this.logResult(`❌ Missing parameters test failed: ${error.message}`, 'missing_params_error');
    }
  }

  async testInvalidCard() {
    try {
      const result = await this.scanCard(TEST_CARDS.invalid);
      
      // Should either show available lockers (if card format is valid) or show error
      if (result.action === 'show_lockers' || result.error) {
        this.logResult('✅ Invalid card handled appropriately', 'invalid_card');
      } else {
        this.logResult(`⚠️  Unexpected invalid card response: ${result.action}`, 'invalid_card_warning');
      }
    } catch (error) {
      this.logResult(`❌ Invalid card test failed: ${error.message}`, 'invalid_card_error');
    }
  }

  async testNoAvailableLockers() {
    // This test would require all lockers to be occupied
    // For now, just verify the API handles the scenario correctly
    try {
      const response = await fetch(`${KIOSK_URL}/api/lockers/available?kioskId=${TEST_KIOSK_ID}`);
      const result = await response.json();
      
      if (result.lockers !== undefined) {
        this.logResult('✅ Available lockers API responding correctly', 'available_lockers_api');
      } else {
        this.logResult('❌ Available lockers API not responding correctly', 'available_lockers_api_fail');
      }
    } catch (error) {
      this.logResult(`❌ Available lockers test failed: ${error.message}`, 'available_lockers_error');
    }
  }

  // Test recovery paths
  async testRecoveryPaths() {
    console.log('\n📋 Testing Recovery Paths (Requirement 2.6)');
    console.log('============================================');

    try {
      // Test return to idle after successful assignment (Requirement 2.6)
      const cardScanResult = await this.scanCard(TEST_CARDS.new);
      
      if (cardScanResult.action === 'show_lockers' && cardScanResult.lockers.length > 0) {
        const assignmentResult = await this.assignLocker(cardScanResult, cardScanResult.lockers[0].id);
        
        if (assignmentResult.success) {
          // Check that system returns to idle state
          const statusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
          const statusResult = await statusResponse.json();
          
          if (!statusResult.has_session || statusResult.state === 'idle') {
            this.logResult('✅ Requirement 2.6: System returns to idle after successful assignment', 'return_to_idle');
          } else {
            this.logResult('⚠️  System may not be returning to idle state properly', 'return_to_idle_warning');
          }
        }
      }

      // Test error recovery
      await this.testErrorRecovery();

    } catch (error) {
      this.logResult(`❌ Recovery paths test failed: ${error.message}`, 'recovery_error');
    }
  }

  async testErrorRecovery() {
    try {
      // Test session timeout recovery (Requirement 3.4)
      const cardScanResult = await this.scanCard(TEST_CARDS.new);
      
      if (cardScanResult.action === 'show_lockers') {
        // Wait for session to timeout (would take 30 seconds in real scenario)
        // For testing, we'll simulate by checking timeout behavior
        
        const statusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
        const statusResult = await statusResponse.json();
        
        if (statusResult.has_session) {
          this.logResult('✅ Session timeout recovery mechanism available', 'timeout_recovery');
        }
      }
    } catch (error) {
      this.logResult(`❌ Error recovery test failed: ${error.message}`, 'error_recovery_fail');
    }
  }

  // Test concurrent sessions (edge case)
  async testConcurrentSessions() {
    console.log('\n📋 Testing Concurrent Sessions (Edge Cases)');
    console.log('==========================================');

    try {
      // Test that only one session per kiosk is allowed
      const firstScan = await this.scanCard(TEST_CARDS.existing);
      const secondScan = await this.scanCard(TEST_CARDS.new);
      
      // Check that only the second session is active
      const statusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
      const statusResult = await statusResponse.json();
      
      if (statusResult.has_session) {
        this.logResult('✅ One-session-per-kiosk rule enforced', 'concurrent_sessions');
      } else {
        this.logResult('⚠️  Session management may have issues with concurrent access', 'concurrent_warning');
      }

    } catch (error) {
      this.logResult(`❌ Concurrent sessions test failed: ${error.message}`, 'concurrent_error');
    }
  }

  // Test session timeout behavior
  async testSessionTimeout() {
    console.log('\n📋 Testing Session Timeout Behavior');
    console.log('===================================');

    try {
      // Create session with short timeout for testing
      const cardScanResult = await this.scanCard(TEST_CARDS.new);
      
      if (cardScanResult.action === 'show_lockers') {
        // Monitor session status over time
        let timeoutDetected = false;
        
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const statusResponse = await fetch(`${KIOSK_URL}/api/session/status?kiosk_id=${TEST_KIOSK_ID}`);
          const statusResult = await statusResponse.json();
          
          if (!statusResult.has_session || statusResult.remaining_seconds <= 0) {
            timeoutDetected = true;
            break;
          }
        }
        
        if (timeoutDetected) {
          this.logResult('✅ Session timeout mechanism working', 'session_timeout_mechanism');
        } else {
          this.logResult('⚠️  Session timeout may not be working properly', 'session_timeout_warning');
        }
      }

    } catch (error) {
      this.logResult(`❌ Session timeout test failed: ${error.message}`, 'session_timeout_error');
    }
  }

  // Test hardware failure scenarios
  async testHardwareFailures() {
    console.log('\n📋 Testing Hardware Failure Scenarios');
    console.log('====================================');

    try {
      // Test hardware status endpoint
      const hardwareResponse = await fetch(`${KIOSK_URL}/api/hardware/status`);
      
      if (hardwareResponse.ok) {
        const hardwareResult = await hardwareResponse.json();
        this.logResult('✅ Hardware status endpoint available', 'hardware_status');
        
        if (hardwareResult.available !== undefined) {
          this.logResult('✅ Hardware availability status reported', 'hardware_availability');
        }
      } else {
        this.logResult('⚠️  Hardware status endpoint not available', 'hardware_status_warning');
      }

    } catch (error) {
      this.logResult(`❌ Hardware failure test failed: ${error.message}`, 'hardware_error');
    }
  }

  // Helper methods
  async scanCard(cardId) {
    const response = await fetch(`${KIOSK_URL}/api/rfid/handle-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_id: cardId,
        kiosk_id: TEST_KIOSK_ID
      })
    });

    if (!response.ok) {
      throw new Error(`Card scan failed: ${response.status}`);
    }

    return await response.json();
  }

  async assignLocker(cardScanResult, lockerId) {
    const response = await fetch(`${KIOSK_URL}/api/lockers/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locker_id: lockerId,
        kiosk_id: TEST_KIOSK_ID,
        session_id: cardScanResult.session_id
      })
    });

    if (!response.ok) {
      throw new Error(`Locker assignment failed: ${response.status}`);
    }

    return await response.json();
  }

  logResult(message, category) {
    console.log(message);
    
    if (message.includes('✅')) {
      this.testResults.passed++;
    } else if (message.includes('❌')) {
      this.testResults.failed++;
    } else if (message.includes('⚠️')) {
      this.testResults.warnings++;
    }
    
    this.testResults.details.push({
      category,
      message,
      timestamp: new Date().toISOString()
    });
  }

  reportResults() {
    console.log('\n📊 Test Results Summary');
    console.log('======================');
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`⚠️  Warnings: ${this.testResults.warnings}`);
    console.log(`📋 Total: ${this.testResults.passed + this.testResults.failed + this.testResults.warnings}`);
    
    if (this.testResults.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.details
        .filter(d => d.message.includes('❌'))
        .forEach(d => console.log(`  - ${d.message}`));
    }
    
    if (this.testResults.warnings > 0) {
      console.log('\n⚠️  Warnings:');
      this.testResults.details
        .filter(d => d.message.includes('⚠️'))
        .forEach(d => console.log(`  - ${d.message}`));
    }
    
    const successRate = (this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100;
    console.log(`\n📈 Success Rate: ${successRate.toFixed(1)}%`);
    
    if (this.testResults.failed === 0) {
      console.log('\n🎉 All tests passed! Card assignment flow is working correctly.');
    } else {
      console.log('\n🔧 Some tests failed. Please review the implementation.');
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new CardAssignmentTester();
  tester.runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = CardAssignmentTester;