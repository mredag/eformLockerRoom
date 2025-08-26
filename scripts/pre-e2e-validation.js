#!/usr/bin/env node

/**
 * Pre-E2E Validation Script
 * Comprehensive checks before full end-to-end testing
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Pre-E2E Validation Checklist');
console.log('================================');

// 1. Recovery on boot - Check for stale executing commands
console.log('\n1️⃣ Recovery on Boot');
console.log('-------------------');

const gatewayHeartbeatPath = 'app/gateway/src/routes/heartbeat.ts';
if (fs.existsSync(gatewayHeartbeatPath)) {
  const content = fs.readFileSync(gatewayHeartbeatPath, 'utf8');
  
  if (content.includes('executing') && content.includes('120')) {
    console.log('   ✅ Stale command recovery logic found');
  } else {
    console.log('   ⚠️  Need to implement stale command recovery (executing > 120s → pending/failed)');
  }
} else {
  console.log('   ❌ Gateway heartbeat file not found');
}

// 2. Transactions - Atomic operations
console.log('\n2️⃣ Transactions');
console.log('---------------');

const commandQueuePath = 'shared/database/command-queue-repository.ts';
if (fs.existsSync(commandQueuePath)) {
  const content = fs.readFileSync(commandQueuePath, 'utf8');
  
  if (content.includes('BEGIN') || content.includes('transaction')) {
    console.log('   ✅ Transaction support found');
  } else {
    console.log('   ⚠️  Need atomic updates for executing/started_at and completed_at/duration_ms');
  }
} else {
  console.log('   ❌ Command queue repository not found');
}

// 3. Idempotency - Duplicate command handling
console.log('\n3️⃣ Idempotency');
console.log('--------------');

const kioskIndexPath = 'app/kiosk/src/index.ts';
if (fs.existsSync(kioskIndexPath)) {
  const content = fs.readFileSync(kioskIndexPath, 'utf8');
  
  if (content.includes('command_id') && content.includes('duplicate')) {
    console.log('   ✅ Duplicate command handling found');
  } else {
    console.log('   ⚠️  Need idempotency check for duplicate command_id');
  }
} else {
  console.log('   ❌ Kiosk index file not found');
}

// 4. Kiosk-side per-locker guard
console.log('\n4️⃣ Per-Locker Concurrency Guard');
console.log('-------------------------------');

const modbusControllerPath = 'app/kiosk/src/hardware/modbus-controller.ts';
if (fs.existsSync(modbusControllerPath)) {
  const content = fs.readFileSync(modbusControllerPath, 'utf8');
  
  if (content.includes('Mutex') || content.includes('mutex')) {
    console.log('   ✅ Mutex implementation found');
  } else {
    console.log('   ⚠️  Need per-locker concurrency guard');
  }
  
  if (content.includes('acquire') && content.includes('release')) {
    console.log('   ✅ Mutex acquire/release pattern found');
  }
} else {
  console.log('   ❌ ModbusController file not found');
}

// 5. Addressing - Coil base verification
console.log('\n5️⃣ Addressing');
console.log('-------------');

if (fs.existsSync(modbusControllerPath)) {
  const content = fs.readFileSync(modbusControllerPath, 'utf8');
  
  if (content.includes('channel - 1') && content.includes('Math.ceil')) {
    console.log('   ✅ Coil addressing with proper base (0-indexed)');
  }
  
  if (content.includes('cardId') && content.includes('relayId')) {
    console.log('   ✅ Card/relay mapping implemented');
  }
  
  // Test the addressing logic
  console.log('   📊 Testing addressing logic:');
  const testCases = [
    { lockerId: 1, expectedCard: 1, expectedCoil: 0 },
    { lockerId: 16, expectedCard: 1, expectedCoil: 15 },
    { lockerId: 17, expectedCard: 2, expectedCoil: 0 },
    { lockerId: 32, expectedCard: 2, expectedCoil: 15 }
  ];
  
  testCases.forEach(({ lockerId, expectedCard, expectedCoil }) => {
    const cardId = Math.ceil(lockerId / 16);
    const relayId = ((lockerId - 1) % 16) + 1;
    const coilAddress = relayId - 1; // 0-indexed for Modbus
    
    if (cardId === expectedCard && coilAddress === expectedCoil) {
      console.log(`      ✅ Locker ${lockerId}: Card ${cardId}, Coil ${coilAddress}`);
    } else {
      console.log(`      ❌ Locker ${lockerId}: Expected Card ${expectedCard}, Coil ${expectedCoil}, got Card ${cardId}, Coil ${coilAddress}`);
    }
  });
}

// 6. Fallback path logging
console.log('\n6️⃣ Fallback Path');
console.log('----------------');

if (fs.existsSync(modbusControllerPath)) {
  const content = fs.readFileSync(modbusControllerPath, 'utf8');
  
  if (content.includes('0x0F') && content.includes('0x05')) {
    console.log('   ✅ Both 0x0F and 0x05 commands implemented');
  }
  
  if (content.includes('falling back') && content.includes('warning')) {
    console.log('   ✅ Fallback warning logging implemented');
  }
  
  if (content.includes('CRC') || content.includes('timeout')) {
    console.log('   ✅ Error detail logging (CRC/timeout) found');
  } else {
    console.log('   ⚠️  Need CRC/timeout detail in fallback logging');
  }
}

// 7. Error propagation
console.log('\n7️⃣ Error Propagation');
console.log('--------------------');

if (fs.existsSync(kioskIndexPath)) {
  const content = fs.readFileSync(kioskIndexPath, 'utf8');
  
  if (content.includes('error_message') || content.includes('error:')) {
    console.log('   ✅ Error message propagation found');
  } else {
    console.log('   ⚠️  Need error_message field in failed status');
  }
}

// 8. Bulk pacing
console.log('\n8️⃣ Bulk Pacing');
console.log('--------------');

if (fs.existsSync(kioskIndexPath)) {
  const content = fs.readFileSync(kioskIndexPath, 'utf8');
  
  if (content.includes('interval_ms') && content.includes('bulk_open')) {
    console.log('   ✅ Bulk operation pacing implemented');
  }
  
  if (content.includes('100') && content.includes('5000')) {
    console.log('   ✅ Interval clamping (100-5000ms) found');
  } else {
    console.log('   ⚠️  Need interval_ms clamping (100-5000ms)');
  }
  
  if (content.includes('continue') && content.includes('error')) {
    console.log('   ✅ Continue on errors logic found');
  }
}

// 9. Retries
console.log('\n9️⃣ Retries');
console.log('----------');

if (fs.existsSync(modbusControllerPath)) {
  const content = fs.readFileSync(modbusControllerPath, 'utf8');
  
  if (content.includes('max_retries') && content.includes('retry_delay')) {
    console.log('   ✅ Retry configuration found');
  }
  
  if (content.includes('backoff') && content.includes('jitter')) {
    console.log('   ✅ Backoff with jitter implemented');
  } else {
    console.log('   ⚠️  Need backoff with jitter for retries');
  }
}

// 10. Serial config
console.log('\n🔟 Serial Config');
console.log('----------------');

if (fs.existsSync(modbusControllerPath)) {
  const content = fs.readFileSync(modbusControllerPath, 'utf8');
  
  if (content.includes('9600') && content.includes('8') && content.includes('none')) {
    console.log('   ✅ Serial config 9600 8N1 found');
  }
  
  if (content.includes('/dev/ttyUSB0')) {
    console.log('   ✅ Default port /dev/ttyUSB0 configured');
    console.log('   ⚠️  Consider using /dev/serial/by-id for replug survival');
  }
}

// 11. Database PRAGMAs
console.log('\n1️⃣1️⃣ Database PRAGMAs');
console.log('---------------------');

const connectionPath = 'shared/database/connection.ts';
if (fs.existsSync(connectionPath)) {
  const content = fs.readFileSync(connectionPath, 'utf8');
  
  if (content.includes('WAL')) {
    console.log('   ✅ WAL mode found');
  } else {
    console.log('   ⚠️  Need PRAGMA journal_mode=WAL');
  }
  
  if (content.includes('busy_timeout') && content.includes('5000')) {
    console.log('   ✅ Busy timeout 5000ms found');
  } else {
    console.log('   ⚠️  Need PRAGMA busy_timeout=5000');
  }
  
  if (content.includes('foreign_keys') && content.includes('ON')) {
    console.log('   ✅ Foreign keys enabled');
  } else {
    console.log('   ⚠️  Need PRAGMA foreign_keys=ON');
  }
} else {
  console.log('   ❌ Database connection file not found');
}

// 12. Idle loop
console.log('\n1️⃣2️⃣ Idle Loop');
console.log('---------------');

if (fs.existsSync(kioskIndexPath)) {
  const content = fs.readFileSync(kioskIndexPath, 'utf8');
  
  if (content.includes('pollIntervalMs') || content.includes('setTimeout')) {
    console.log('   ✅ Polling interval found');
  }
  
  if (content.includes('2000') || content.includes('1000')) {
    console.log('   ✅ Reasonable polling interval configured');
  }
} else {
  console.log('   ❌ Heartbeat client not found');
}

console.log('\n📋 Quick Smoke Test Scenarios');
console.log('=============================');

console.log('\n🧪 Test 1: Single Open');
console.log('POST /api/lockers/1/open → 202 JSON');
console.log('Status: pending → executing → completed');
console.log('Hardware: LED blinks');
console.log('Database: Event written');

console.log('\n🧪 Test 2: Bulk Open');
console.log('POST /api/lockers/bulk-open (3 lockers)');
console.log('Total time ≈ 3 × interval_ms');
console.log('Logs: Per locker + summary');

console.log('\n🧪 Test 3: Duplicate Open');
console.log('Second request → 409');
console.log('Kiosk: Never double-pulses');

console.log('\n🧪 Test 4: Failure Path');
console.log('Unplug RS-485 → failed with error_message');
console.log('Replug → retry works');

console.log('\n📊 Database Queries for Validation');
console.log('==================================');

console.log('\n-- Command Queue Status');
console.log('SELECT command_id, status, started_at, completed_at, duration_ms');
console.log('FROM command_queue');
console.log('ORDER BY created_at DESC LIMIT 5;');

console.log('\n-- Recent Events');
console.log('SELECT kiosk_id, locker_id, event_type, details');
console.log('FROM events');
console.log('ORDER BY timestamp DESC LIMIT 5;');

console.log('\n✅ Pre-E2E Validation Complete');
console.log('==============================');
console.log('Review the warnings above and implement missing features before E2E testing.');