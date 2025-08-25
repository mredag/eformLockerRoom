#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filePath = 'app/panel/src/views/lockers.html';

console.log('🔧 Fixing kioskId parsing issue in lockers.html...');

try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find and replace the problematic split operation
    const oldPattern = /const \[kioskId, lockerId\] = key\.split\('-'\);/g;
    const newCode = `// Split from the right to handle kiosk IDs with dashes (e.g., 'kiosk-1-1' -> kioskId='kiosk-1', lockerId='1')
                const lastDashIndex = key.lastIndexOf('-');
                const kioskId = key.substring(0, lastDashIndex);
                const lockerId = key.substring(lastDashIndex + 1);`;
    
    if (content.match(oldPattern)) {
        content = content.replace(oldPattern, newCode);
        
        fs.writeFileSync(filePath, content);
        console.log('✅ Successfully fixed kioskId parsing issue!');
        console.log('🎯 The fix ensures that:');
        console.log('   - Key "kiosk-1-1" -> kioskId="kiosk-1", lockerId="1"');
        console.log('   - Key "kiosk-2-5" -> kioskId="kiosk-2", lockerId="5"');
        console.log('   - This will fix the 400 Bad Request error!');
    } else {
        console.log('❌ Pattern not found. The code may have already been fixed or changed.');
    }
    
} catch (error) {
    console.error('❌ Error fixing file:', error.message);
}