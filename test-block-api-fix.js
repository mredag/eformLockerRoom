#!/usr/bin/env node

console.log('🧪 Testing Block API Fix - Complete Flow');
console.log('=========================================');

// Simulate the fixed parsing and API call logic
function simulateBlockOperation(selectedLockers, reason) {
    console.log('\n🔍 Input Data:');
    console.log(`Selected Lockers: ${Array.from(selectedLockers).join(', ')}`);
    console.log(`Reason: "${reason}"`);
    
    const selectedArray = Array.from(selectedLockers).map(key => {
        // Fixed parsing logic
        const lastDashIndex = key.lastIndexOf('-');
        const kioskId = key.substring(0, lastDashIndex);
        const lockerId = key.substring(lastDashIndex + 1);
        return { kioskId, lockerId: parseInt(lockerId) };
    });
    
    console.log('\n📊 Parsed Data:');
    selectedArray.forEach((item, index) => {
        console.log(`  ${index + 1}. kioskId: "${item.kioskId}", lockerId: ${item.lockerId}`);
    });
    
    console.log('\n🌐 API Calls that would be made:');
    selectedArray.forEach((item, index) => {
        const url = `/api/lockers/${item.kioskId}/${item.lockerId}/block`;
        console.log(`  ${index + 1}. POST ${url}`);
        console.log(`     Body: { reason: "${reason}" }`);
    });
    
    return selectedArray;
}

// Test with the problematic case from the debug logs
console.log('\n🎯 Testing the exact case that was failing:');
const selectedLockers = new Set(['kiosk-1-1']);
const reason = 'Test blocking reason';

const result = simulateBlockOperation(selectedLockers, reason);

console.log('\n✅ Expected vs Previous Behavior:');
console.log('==================================');
console.log('❌ BEFORE (broken): POST /api/lockers/kiosk/1/block');
console.log('✅ AFTER (fixed):   POST /api/lockers/kiosk-1/1/block');

console.log('\n🚀 The fix should resolve the 400 Bad Request error!');
console.log('💡 Next step: Test this on the Raspberry Pi to confirm the fix works.');