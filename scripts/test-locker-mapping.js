#!/usr/bin/env node

/**
 * Test script to verify locker ID to card/relay mapping
 * Requirements: 7.2 - Verify locker_id is correctly mapped to cardId and relayId
 */

console.log('🧪 Testing Locker ID to Card/Relay Mapping');
console.log('===========================================');

function mapLockerToCardRelay(lockerId) {
  const cardId = Math.ceil(lockerId / 16);
  const relayId = ((lockerId - 1) % 16) + 1;
  return { cardId, relayId };
}

// Test cases based on the expected mapping
const testCases = [
  // Card 1 (lockers 1-16)
  { lockerId: 1, expectedCard: 1, expectedRelay: 1 },
  { lockerId: 8, expectedCard: 1, expectedRelay: 8 },
  { lockerId: 16, expectedCard: 1, expectedRelay: 16 },
  
  // Card 2 (lockers 17-32)
  { lockerId: 17, expectedCard: 2, expectedRelay: 1 },
  { lockerId: 24, expectedCard: 2, expectedRelay: 8 },
  { lockerId: 32, expectedCard: 2, expectedRelay: 16 },
  
  // Card 3 (lockers 33-48) - if system expands
  { lockerId: 33, expectedCard: 3, expectedRelay: 1 },
  { lockerId: 48, expectedCard: 3, expectedRelay: 16 },
];

let allTestsPassed = true;

console.log('Locker ID | Expected Card | Expected Relay | Actual Card | Actual Relay | Status');
console.log('----------|---------------|----------------|-------------|--------------|--------');

testCases.forEach(({ lockerId, expectedCard, expectedRelay }) => {
  const { cardId, relayId } = mapLockerToCardRelay(lockerId);
  const passed = cardId === expectedCard && relayId === expectedRelay;
  const status = passed ? '✅ PASS' : '❌ FAIL';
  
  if (!passed) {
    allTestsPassed = false;
  }
  
  console.log(`${lockerId.toString().padStart(9)} | ${expectedCard.toString().padStart(13)} | ${expectedRelay.toString().padStart(14)} | ${cardId.toString().padStart(11)} | ${relayId.toString().padStart(12)} | ${status}`);
});

console.log('\n📊 Test Summary');
console.log('================');

if (allTestsPassed) {
  console.log('✅ All mapping tests passed!');
  console.log('The locker ID to card/relay mapping formulas are working correctly:');
  console.log('  - cardId = Math.ceil(locker_id / 16)');
  console.log('  - relayId = ((locker_id - 1) % 16) + 1');
} else {
  console.log('❌ Some mapping tests failed!');
  console.log('Please check the mapping formulas in the ModbusController.');
  process.exit(1);
}

console.log('\n🔧 Hardware Configuration Verification');
console.log('======================================');
console.log('Based on the mapping, ensure your hardware is configured as follows:');
console.log('- Waveshare Relay Card 1: DIP switches set to address 1 (handles lockers 1-16)');
console.log('- Waveshare Relay Card 2: DIP switches set to address 2 (handles lockers 17-32)');
console.log('- DIP switch 9: OFF (9600 baud rate)');
console.log('- DIP switch 10: OFF (no parity)');
console.log('- RS-485 converter connected to /dev/ttyUSB0');