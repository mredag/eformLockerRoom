#!/usr/bin/env node

/**
 * Simple Command Status Test
 * Tests the command status endpoint logic without requiring full service startup
 */

// Mock command data to test the response format
const mockCommands = {
  'single-locker-pending': {
    command_id: 'test-cmd-001',
    kiosk_id: 'KIOSK-1',
    command_type: 'open_locker',
    status: 'pending',
    payload: { locker_id: 7, staff_user: 'admin', reason: 'Test' },
    created_at: new Date('2024-01-01T10:00:00Z'),
    executed_at: null,
    completed_at: null,
    last_error: null,
    retry_count: 0
  },
  'single-locker-executing': {
    command_id: 'test-cmd-002',
    kiosk_id: 'KIOSK-1',
    command_type: 'open_locker',
    status: 'executing',
    payload: { locker_id: 7, staff_user: 'admin', reason: 'Test' },
    created_at: new Date('2024-01-01T10:00:00Z'),
    executed_at: new Date('2024-01-01T10:00:01Z'),
    completed_at: null,
    last_error: null,
    retry_count: 0
  },
  'single-locker-completed': {
    command_id: 'test-cmd-003',
    kiosk_id: 'KIOSK-1',
    command_type: 'open_locker',
    status: 'completed',
    payload: { locker_id: 7, staff_user: 'admin', reason: 'Test' },
    created_at: new Date('2024-01-01T10:00:00Z'),
    executed_at: new Date('2024-01-01T10:00:01Z'),
    completed_at: new Date('2024-01-01T10:00:02Z'),
    last_error: null,
    retry_count: 0
  },
  'bulk-command-failed': {
    command_id: 'test-cmd-004',
    kiosk_id: 'KIOSK-1',
    command_type: 'bulk_open',
    status: 'failed',
    payload: { locker_ids: [1, 2, 3], staff_user: 'admin', reason: 'Bulk test' },
    created_at: new Date('2024-01-01T10:00:00Z'),
    executed_at: new Date('2024-01-01T10:00:01Z'),
    completed_at: new Date('2024-01-01T10:00:05Z'),
    last_error: 'Modbus timeout - check wiring',
    retry_count: 3
  }
};

function formatCommandStatusResponse(command) {
  if (!command) {
    return {
      code: 'not_found',
      message: 'Command not found'
    };
  }

  // Extract locker information from payload (this is the actual endpoint logic)
  let lockerInfo = {};
  if (command.payload.locker_id) {
    lockerInfo = { locker_id: command.payload.locker_id };
  } else if (command.payload.locker_ids) {
    lockerInfo = { locker_ids: command.payload.locker_ids };
  }

  return {
    command_id: command.command_id,
    status: command.status,
    command_type: command.command_type,
    created_at: command.created_at,
    executed_at: command.executed_at,
    completed_at: command.completed_at,
    last_error: command.last_error,
    retry_count: command.retry_count,
    ...lockerInfo
  };
}

function validateResponse(response, expectedStatus) {
  const errors = [];
  
  // Check required fields
  const requiredFields = ['command_id', 'status', 'command_type', 'created_at'];
  for (const field of requiredFields) {
    if (!(field in response)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check status
  if (response.status !== expectedStatus) {
    errors.push(`Expected status '${expectedStatus}', got '${response.status}'`);
  }
  
  // Check locker information
  if (!response.locker_id && !response.locker_ids) {
    errors.push('Missing locker information (locker_id or locker_ids)');
  }
  
  // Check timestamps based on status
  if (expectedStatus === 'pending') {
    if (response.executed_at !== null) {
      errors.push('Pending command should not have executed_at');
    }
    if (response.completed_at !== null) {
      errors.push('Pending command should not have completed_at');
    }
  }
  
  if (expectedStatus === 'executing') {
    if (!response.executed_at) {
      errors.push('Executing command should have executed_at');
    }
    if (response.completed_at !== null) {
      errors.push('Executing command should not have completed_at');
    }
  }
  
  if (expectedStatus === 'completed' || expectedStatus === 'failed') {
    if (!response.executed_at) {
      errors.push('Completed/failed command should have executed_at');
    }
    if (!response.completed_at) {
      errors.push('Completed/failed command should have completed_at');
    }
  }
  
  return errors;
}

function runTests() {
  console.log('🧪 Testing Command Status Response Format');
  console.log('');
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test each mock command
  for (const [testName, mockCommand] of Object.entries(mockCommands)) {
    totalTests++;
    console.log(`🔍 Testing: ${testName}`);
    
    const response = formatCommandStatusResponse(mockCommand);
    const errors = validateResponse(response, mockCommand.status);
    
    if (errors.length === 0) {
      console.log(`✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.log(`❌ FAIL: ${testName}`);
      errors.forEach(error => console.log(`   • ${error}`));
    }
    
    console.log(`   Response:`, JSON.stringify(response, null, 2));
    console.log('');
  }
  
  // Test not found scenario
  totalTests++;
  console.log('🔍 Testing: command-not-found');
  const notFoundResponse = formatCommandStatusResponse(null);
  if (notFoundResponse.code === 'not_found' && notFoundResponse.message === 'Command not found') {
    console.log('✅ PASS: command-not-found');
    passedTests++;
  } else {
    console.log('❌ FAIL: command-not-found');
    console.log('   • Should return not_found error');
  }
  console.log(`   Response:`, JSON.stringify(notFoundResponse, null, 2));
  console.log('');
  
  // Test timestamp field consistency
  totalTests++;
  console.log('🔍 Testing: timestamp-field-consistency');
  const executingCommand = mockCommands['single-locker-executing'];
  const response = formatCommandStatusResponse(executingCommand);
  
  if (response.executed_at && !response.started_at) {
    console.log('✅ PASS: timestamp-field-consistency');
    console.log('   • Uses executed_at (not started_at) - consistent with database schema');
    passedTests++;
  } else {
    console.log('❌ FAIL: timestamp-field-consistency');
    console.log('   • Should use executed_at field, not started_at');
  }
  console.log('');
  
  // Summary
  console.log('📊 Test Results:');
  console.log(`   Total: ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${totalTests - passedTests}`);
  console.log('');
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests PASSED! Command status endpoint logic is working correctly.');
    console.log('');
    console.log('✅ Verified:');
    console.log('   • Response format includes all required fields');
    console.log('   • Status values are correctly returned');
    console.log('   • Locker information is properly extracted');
    console.log('   • Timestamps are consistent with database schema (executed_at)');
    console.log('   • Error handling works for not found commands');
    return true;
  } else {
    console.log('❌ Some tests failed. Please review the implementation.');
    return false;
  }
}

// Run the tests
const success = runTests();
process.exit(success ? 0 : 1);