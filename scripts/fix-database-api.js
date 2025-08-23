#!/usr/bin/env node

/**
 * Fix Database API calls
 * Replace dbManager.getDatabase() with dbManager.getConnection().getDatabase()
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Fixing Database API calls');
console.log('============================\n');

// Files that need fixing
const filesToFix = [
  'shared/services/locker-state-manager.ts',
  'shared/database/vip-contract-repository.ts',
  'app/panel/src/services/auth-service.ts',
  'app/panel/src/services/pin-rotation-service.ts',
  'app/panel/src/routes/vip-routes.ts'
];

let totalReplacements = 0;

filesToFix.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    console.log(`📄 Processing ${filePath}...`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace all occurrences of dbManager.getDatabase() with dbManager.getConnection().getDatabase()
    content = content.replace(/(\w+\.)?dbManager\.getDatabase\(\)/g, '$1dbManager.getConnection().getDatabase()');
    
    // Also fix this.dbManager.getDatabase()
    content = content.replace(/this\.dbManager\.getDatabase\(\)/g, 'this.dbManager.getConnection().getDatabase()');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      const replacements = (originalContent.match(/\.getDatabase\(\)/g) || []).length;
      console.log(`  ✅ Fixed ${replacements} occurrences`);
      totalReplacements += replacements;
    } else {
      console.log(`  ✅ No changes needed`);
    }
  } else {
    console.log(`  ⚠️  File not found: ${filePath}`);
  }
});

console.log(`\n🎉 Database API Fix Completed!`);
console.log(`Total replacements: ${totalReplacements}`);

// Rebuild the panel service
console.log('\n🔨 Rebuilding panel service...');
try {
  execSync('npm run build', { cwd: 'app/panel', stdio: 'inherit' });
  console.log('✅ Panel service rebuilt successfully');
} catch (error) {
  console.error('❌ Panel rebuild failed:', error.message);
}

console.log('\n🚀 Ready to test the panel service!');