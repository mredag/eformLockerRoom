#!/usr/bin/env node

/**
 * Fix All Status References Script
 * 
 * This script updates all remaining Turkish and inconsistent status references
 * to use the standardized English status names throughout the codebase.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing All Status References');
console.log('===============================');

// Status mapping from various forms to English
const statusMappings = {
  // Turkish to English
  'Boş': 'Free',
  'Dolu': 'Owned', 
  'Açılıyor': 'Opening',
  'Hata': 'Error',
  'Engelli': 'Blocked',
  
  // Alternative English forms to standard
  'Occupied': 'Owned',
  'Reserved': 'Owned',
  'Disabled': 'Blocked'
};

function findFilesToUpdate() {
  const filesToCheck = [
    'shared/database/__tests__/locker-repository.test.ts',
    'shared/database/locker-repository.ts',
    'shared/services/__tests__/locker-assignment-release.test.ts',
    'shared/services/__tests__/locker-state-manager-enhanced.test.ts',
    'shared/services/__tests__/locker-state-manager-simple.test.ts',
    'shared/services/__tests__/locker-state-manager.test.ts',
    'shared/services/__tests__/websocket-service.test.ts',
    'shared/services/locker-state-manager.ts'
  ];
  
  return filesToCheck.filter(file => {
    const fullPath = path.resolve(__dirname, '..', file);
    return fs.existsSync(fullPath);
  });
}

function updateFileContent(filePath) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let changed = false;
  
  // Replace status references
  Object.entries(statusMappings).forEach(([oldStatus, newStatus]) => {
    // Replace quoted status strings
    const quotedOldRegex = new RegExp(`'${oldStatus.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`, 'g');
    const doubleQuotedOldRegex = new RegExp(`"${oldStatus.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}"`, 'g');
    
    if (content.includes(`'${oldStatus}'`) || content.includes(`"${oldStatus}"`)) {
      content = content.replace(quotedOldRegex, `'${newStatus}'`);
      content = content.replace(doubleQuotedOldRegex, `"${newStatus}"`);
      changed = true;
      console.log(`   ✅ Replaced '${oldStatus}' with '${newStatus}'`);
    }
  });
  
  if (changed) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`📝 Updated: ${filePath}`);
    return true;
  }
  
  return false;
}

function main() {
  const filesToUpdate = findFilesToUpdate();
  
  console.log(`\\n🔍 Found ${filesToUpdate.length} files to check:`);
  filesToUpdate.forEach(file => console.log(`   - ${file}`));
  
  console.log('\\n🔄 Updating files...');
  
  let totalUpdated = 0;
  filesToUpdate.forEach(file => {
    console.log(`\\n📂 Processing: ${file}`);
    if (updateFileContent(file)) {
      totalUpdated++;
    } else {
      console.log(`   ℹ️  No changes needed`);
    }
  });
  
  console.log(`\\n🎯 Summary:`);
  console.log(`   📝 Files updated: ${totalUpdated}`);
  console.log(`   📂 Files checked: ${filesToUpdate.length}`);
  
  console.log('\\n📚 Status Mapping Applied:');
  Object.entries(statusMappings).forEach(([old, newStatus]) => {
    console.log(`   ${old} → ${newStatus}`);
  });
  
  console.log('\\n✅ All status references updated to English!');
  console.log('\\n📋 Next Steps:');
  console.log('1. Build shared library: npm run build');
  console.log('2. Test TypeScript compilation');
  console.log('3. Verify services still work');
}

main();