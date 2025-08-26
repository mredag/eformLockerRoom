#!/usr/bin/env node

/**
 * Smoke Test: Command Status Polling Endpoint
 * 
 * Tests the complete flow:
 * 1. Queue a command via POST /api/lockers/KIOSK-1/7/open
 * 2. Poll status via GET /api/lockers/commands/<command_id>
 * 3. Verify status transitions: pending → executing → completed/failed
 */

let fetch;

const PANEL_URL = process.env.PANEL_URL || 'http://localhost:3003';
const KIOSK_ID = 'KIOSK-1';
const LOCKER_ID = 7;

// Mock session cookie for testing (in production, get this from login)
const SESSION_COOKIE = 'session=test-session-token';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queueCommand() {
  console.log('🚀 Queuing locker open command...');
  
  try {
    const response = await fetch(`${PANEL_URL}/api/lockers/${KIOSK_ID}/${LOCKER_ID}/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test-token', // Mock CSRF token
        'Cookie': SESSION_COOKIE
      },
      body: JSON.stringify({
        reason: 'Smoke test - command status polling',
        override: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to queue command: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      return null;
    }

    const result = await response.json();
    console.log(`✅ Command queued successfully: ${result.command_id}`);
    return result.command_id;
    
  } catch (error) {
    console.error('❌ Error queuing command:', error.message);
    return null;
  }
}

async function pollCommandStatus(commandId) {
  console.log(`🔍 Polling command status: ${commandId}`);
  
  const maxAttempts = 10;
  const pollInterval = 1000; // 1 second
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${PANEL_URL}/api/lockers/commands/${commandId}`, {
        headers: {
          'Cookie': SESSION_COOKIE
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`⚠️  Command not found (attempt ${attempt}/${maxAttempts})`);
        } else {
          const errorText = await response.text();
          console.error(`❌ Error polling status: ${response.status} ${response.statusText}`);
          console.error(`Response: ${errorText}`);
        }
        
        if (attempt < maxAttempts) {
          await sleep(pollInterval);
          continue;
        }
        return null;
      }

      const status = await response.json();
      
      console.log(`📊 Status (attempt ${attempt}):`, {
        command_id: status.command_id,
        status: status.status,
        command_type: status.command_type,
        locker_id: status.locker_id,
        created_at: status.created_at,
        executed_at: status.executed_at,
        completed_at: status.completed_at,
        last_error: status.last_error,
        retry_count: status.retry_count
      });

      // Check if command is in final state
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        console.log(`🏁 Command reached final state: ${status.status}`);
        return status;
      }

      // Continue polling if still pending or executing
      if (attempt < maxAttempts) {
        console.log(`⏳ Command still ${status.status}, polling again in ${pollInterval}ms...`);
        await sleep(pollInterval);
      }
      
    } catch (error) {
      console.error(`❌ Error polling command status (attempt ${attempt}):`, error.message);
      if (attempt < maxAttempts) {
        await sleep(pollInterval);
      }
    }
  }
  
  console.log(`⏰ Polling timeout after ${maxAttempts} attempts`);
  return null;
}

function validateStatusResponse(status) {
  console.log('🔍 Validating status response format...');
  
  const requiredFields = [
    'command_id', 'status', 'command_type', 'created_at'
  ];
  
  const validStatuses = ['pending', 'executing', 'completed', 'failed', 'cancelled'];
  
  let isValid = true;
  
  // Check required fields
  for (const field of requiredFields) {
    if (!(field in status)) {
      console.error(`❌ Missing required field: ${field}`);
      isValid = false;
    }
  }
  
  // Check status value
  if (!validStatuses.includes(status.status)) {
    console.error(`❌ Invalid status value: ${status.status}`);
    isValid = false;
  }
  
  // Check locker information
  if (!status.locker_id && !status.locker_ids) {
    console.error('❌ Missing locker information (locker_id or locker_ids)');
    isValid = false;
  }
  
  // Check timestamps
  if (status.created_at && !Date.parse(status.created_at)) {
    console.error('❌ Invalid created_at timestamp');
    isValid = false;
  }
  
  if (status.executed_at && !Date.parse(status.executed_at)) {
    console.error('❌ Invalid executed_at timestamp');
    isValid = false;
  }
  
  if (status.completed_at && !Date.parse(status.completed_at)) {
    console.error('❌ Invalid completed_at timestamp');
    isValid = false;
  }
  
  if (isValid) {
    console.log('✅ Status response format is valid');
  }
  
  return isValid;
}

async function main() {
  // Import fetch dynamically
  const { default: fetchModule } = await import('node-fetch');
  fetch = fetchModule;
  
  console.log('🧪 Starting Command Status Polling Smoke Test');
  console.log(`📍 Panel URL: ${PANEL_URL}`);
  console.log(`🏢 Kiosk ID: ${KIOSK_ID}`);
  console.log(`🔒 Locker ID: ${LOCKER_ID}`);
  console.log('');
  
  // Step 1: Queue a command
  const commandId = await queueCommand();
  if (!commandId) {
    console.error('❌ Failed to queue command, aborting test');
    process.exit(1);
  }
  
  console.log('');
  
  // Step 2: Poll command status
  const finalStatus = await pollCommandStatus(commandId);
  if (!finalStatus) {
    console.error('❌ Failed to get final command status');
    process.exit(1);
  }
  
  console.log('');
  
  // Step 3: Validate response format
  const isValid = validateStatusResponse(finalStatus);
  if (!isValid) {
    console.error('❌ Status response validation failed');
    process.exit(1);
  }
  
  console.log('');
  console.log('🎉 Command Status Polling Smoke Test PASSED');
  console.log('');
  console.log('📋 Test Summary:');
  console.log(`   • Command ID: ${finalStatus.command_id}`);
  console.log(`   • Final Status: ${finalStatus.status}`);
  console.log(`   • Command Type: ${finalStatus.command_type}`);
  console.log(`   • Locker ID: ${finalStatus.locker_id}`);
  console.log(`   • Created: ${finalStatus.created_at}`);
  console.log(`   • Executed: ${finalStatus.executed_at || 'N/A'}`);
  console.log(`   • Completed: ${finalStatus.completed_at || 'N/A'}`);
  console.log(`   • Error: ${finalStatus.last_error || 'None'}`);
  console.log(`   • Retries: ${finalStatus.retry_count}`);
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run the test
main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});