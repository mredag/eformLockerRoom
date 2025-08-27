#!/usr/bin/env node

/**
 * Fix Locker State Manager - Convert to English Status Values
 * 
 * This script updates the locker-state-manager.ts file to use English status values
 * instead of Turkish ones, to match our database normalization.
 * 
 * Mappings:
 * - Boş → Free
 * - Dolu → Owned  
 * - Engelli → Blocked
 * - Açılıyor → Opening
 * - Hata → Error
 */

const fs = require('fs');
const path = require('path');

const STATE_MANAGER_PATH = path.resolve(__dirname, '../shared/services/locker-state-manager.ts');

console.log('🔧 Locker State Manager English Conversion');
console.log('==========================================');

// Read the current file
let content = fs.readFileSync(STATE_MANAGER_PATH, 'utf8');

console.log('📝 Original file size:', content.length, 'characters');

// Define the replacements
const replacements = [
  // Status values in strings
  { from: "'Boş'", to: "'Free'" },
  { from: '"Boş"', to: '"Free"' },
  { from: "'Dolu'", to: "'Owned'" },
  { from: '"Dolu"', to: '"Owned"' },
  { from: "'Engelli'", to: "'Blocked'" },
  { from: '"Engelli"', to: '"Blocked"' },
  { from: "'Açılıyor'", to: "'Opening'" },
  { from: '"Açılıyor"', to: '"Opening"' },
  { from: "'Hata'", to: "'Error'" },
  { from: '"Hata"', to: '"Error"' },
  
  // Status values in SQL queries and conditions
  { from: "status !== 'Blocked'", to: "status !== 'Blocked'" }, // Already correct
  { from: "status === 'Boş'", to: "status === 'Free'" },
  { from: "status === 'Dolu'", to: "status === 'Owned'" },
  { from: "status === 'Engelli'", to: "status === 'Blocked'" },
  { from: "status === 'Açılıyor'", to: "status === 'Opening'" },
  { from: "status === 'Hata'", to: "status === 'Error'" },
  
  // Comments and documentation
  { from: "Boş ->", to: "Free ->" },
  { from: "-> Boş", to: "-> Free" },
  { from: "Dolu ->", to: "Owned ->" },
  { from: "-> Dolu", to: "-> Owned" },
  { from: "Engelli ->", to: "Blocked ->" },
  { from: "-> Engelli", to: "-> Blocked" },
  { from: "Açılıyor ->", to: "Opening ->" },
  { from: "-> Açılıyor", to: "-> Opening" },
  { from: "Hata ->", to: "Error ->" },
  { from: "-> Hata", to: "-> Error" },
  
  // Function documentation
  { from: "(Boş)", to: "(Free)" },
  { from: "(Dolu)", to: "(Owned)" },
  { from: "(Engelli)", to: "(Blocked)" },
  { from: "(Açılıyor)", to: "(Opening)" },
  { from: "(Hata)", to: "(Error)" },
  
  // SQL IN clauses
  { from: "IN ('Boş', 'Free')", to: "IN ('Free')" },
  { from: "IN ('Dolu', 'Açılıyor')", to: "IN ('Owned', 'Opening')" },
  { from: "IN (?, ?)", to: "IN (?, ?)" }, // Keep parameterized queries as-is
];

let changeCount = 0;

// Apply replacements
replacements.forEach(({ from, to }) => {
  const beforeLength = content.length;
  content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
  const afterLength = content.length;
  
  if (beforeLength !== afterLength) {
    const matches = (beforeLength - afterLength) / (from.length - to.length);
    console.log(`✅ Replaced "${from}" → "${to}" (${matches} occurrences)`);
    changeCount += matches;
  }
});

// Write the updated file
fs.writeFileSync(STATE_MANAGER_PATH, content, 'utf8');

console.log('\n📊 Summary:');
console.log(`   Total replacements: ${changeCount}`);
console.log(`   Updated file size: ${content.length} characters`);
console.log(`   File updated: ${STATE_MANAGER_PATH}`);

console.log('\n🎯 Next Steps:');
console.log('1. Build the shared services: npm run build --workspace=shared');
console.log('2. Restart all services to apply changes');
console.log('3. Test unblocking functionality in admin panel');

console.log('\n✅ Locker State Manager conversion completed!');