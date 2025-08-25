// Test script to verify console logs are in the lockers.html file
const fs = require('fs');

const filePath = 'app/panel/src/views/lockers.html';
const content = fs.readFileSync(filePath, 'utf8');

const logPatterns = [
  '🔓 openSelectedLockers called',
  '🚫 blockSelectedLockers called', 
  '✅ unblockSelectedLockers called',
  '🎯 toggleLocker called',
  '📊 updateSelectedCount called',
  '🔄 loadData called (Refresh button)',
  '⚡ performAction called',
  '📋 showActionModal called'
];

console.log('🔍 Checking for console logs in lockers.html...\n');

let foundLogs = 0;
logPatterns.forEach(pattern => {
  if (content.includes(pattern)) {
    console.log(`✅ Found: ${pattern}`);
    foundLogs++;
  } else {
    console.log(`❌ Missing: ${pattern}`);
  }
});

console.log(`\n📊 Summary: ${foundLogs}/${logPatterns.length} console logs found`);

if (foundLogs === logPatterns.length) {
  console.log('🎉 All console logs are present in the file!');
} else {
  console.log('⚠️ Some console logs are missing');
}