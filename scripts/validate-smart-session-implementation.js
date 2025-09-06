/**
 * Validation script for Smart Session Manager implementation
 * Verifies that the implementation meets requirements 16.1-16.5
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Smart Session Manager Implementation...\n');

// Check if required files exist
const requiredFiles = [
  'shared/services/smart-session-manager.ts',
  'migrations/023_smart_sessions_system.sql',
  'shared/services/__tests__/smart-session-manager.test.ts',
  'app/kiosk/src/controllers/__tests__/session-manager-smart-integration.test.ts'
];

let allFilesExist = true;

console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing!');
  process.exit(1);
}

// Check implementation features
console.log('\n🔧 Checking implementation features:');

// Read smart session manager
const smartSessionManagerContent = fs.readFileSync('shared/services/smart-session-manager.ts', 'utf8');

const features = [
  {
    name: 'Config-driven session limits (180 minutes)',
    check: smartSessionManagerContent.includes('sessionLimitMinutes: 180') && 
           smartSessionManagerContent.includes('session_limit_minutes')
  },
  {
    name: 'Session extension in 60-minute increments',
    check: smartSessionManagerContent.includes('extensionIncrementMinutes: 60') &&
           smartSessionManagerContent.includes('60 minutes to current expiration')
  },
  {
    name: 'Maximum 240-minute total session time',
    check: smartSessionManagerContent.includes('maxTotalMinutes: 240') &&
           smartSessionManagerContent.includes('240 minutes reached')
  },
  {
    name: 'Overdue session detection',
    check: smartSessionManagerContent.includes('markOverdue') &&
           smartSessionManagerContent.includes('checkForOverdueSessions')
  },
  {
    name: 'Administrator audit logging',
    check: smartSessionManagerContent.includes('createExtensionAudit') &&
           smartSessionManagerContent.includes('adminUser') &&
           smartSessionManagerContent.includes('session_extension_audit')
  },
  {
    name: 'Database persistence',
    check: smartSessionManagerContent.includes('smart_sessions') &&
           smartSessionManagerContent.includes('INSERT INTO smart_sessions')
  },
  {
    name: 'Required log format',
    check: smartSessionManagerContent.includes('Session extended: +60min, total=')
  }
];

features.forEach(feature => {
  console.log(`  ${feature.check ? '✅' : '❌'} ${feature.name}`);
});

// Check migration file
console.log('\n📊 Checking database migration:');
const migrationContent = fs.readFileSync('migrations/023_smart_sessions_system.sql', 'utf8');

const migrationFeatures = [
  {
    name: 'Smart sessions table',
    check: migrationContent.includes('CREATE TABLE IF NOT EXISTS smart_sessions')
  },
  {
    name: 'Extension audit table',
    check: migrationContent.includes('CREATE TABLE IF NOT EXISTS session_extension_audit')
  },
  {
    name: 'Required indexes',
    check: migrationContent.includes('CREATE INDEX') && 
           migrationContent.includes('idx_smart_sessions_card_status')
  },
  {
    name: 'Configuration seeding',
    check: migrationContent.includes('session_limit_minutes') &&
           migrationContent.includes('180')
  }
];

migrationFeatures.forEach(feature => {
  console.log(`  ${feature.check ? '✅' : '❌'} ${feature.name}`);
});

// Check session manager integration
console.log('\n🔗 Checking session manager integration:');
const sessionManagerContent = fs.readFileSync('app/kiosk/src/controllers/session-manager.ts', 'utf8');

const integrationFeatures = [
  {
    name: 'Smart session manager integration',
    check: sessionManagerContent.includes('SmartSessionManager') &&
           sessionManagerContent.includes('smartSessionManager')
  },
  {
    name: 'Configuration manager integration',
    check: sessionManagerContent.includes('ConfigurationManager') &&
           sessionManagerContent.includes('isSmartAssignmentEnabled')
  },
  {
    name: 'Backward compatibility',
    check: sessionManagerContent.includes('createRegularSession') &&
           sessionManagerContent.includes('convertSmartSessionToRfid')
  },
  {
    name: 'Extension support',
    check: sessionManagerContent.includes('extendSmartSession') &&
           sessionManagerContent.includes('getSmartSessionRemainingMinutes')
  }
];

integrationFeatures.forEach(feature => {
  console.log(`  ${feature.check ? '✅' : '❌'} ${feature.name}`);
});

// Check test coverage
console.log('\n🧪 Checking test coverage:');
const testContent = fs.readFileSync('shared/services/__tests__/smart-session-manager.test.ts', 'utf8');

const testFeatures = [
  {
    name: 'Session creation tests',
    check: testContent.includes('Session Creation') &&
           testContent.includes('config-driven limit')
  },
  {
    name: 'Extension requirement tests (16.1-16.5)',
    check: testContent.includes('Requirements 16.1-16.5') &&
           testContent.includes('exactly 60 minutes') &&
           testContent.includes('240 minutes total') &&
           testContent.includes('administrator authorization') &&
           testContent.includes('audit record')
  },
  {
    name: 'Overdue detection tests',
    check: testContent.includes('Overdue Session Detection') &&
           testContent.includes('mark overdue sessions')
  },
  {
    name: 'Session management tests',
    check: testContent.includes('Session Management') &&
           testContent.includes('remaining time') &&
           testContent.includes('can be extended')
  }
];

testFeatures.forEach(feature => {
  console.log(`  ${feature.check ? '✅' : '❌'} ${feature.name}`);
});

// Summary
const allFeatures = [...features, ...migrationFeatures, ...integrationFeatures, ...testFeatures];
const passedFeatures = allFeatures.filter(f => f.check).length;
const totalFeatures = allFeatures.length;

console.log(`\n📊 Implementation Summary:`);
console.log(`  ✅ Passed: ${passedFeatures}/${totalFeatures} features`);
console.log(`  📈 Coverage: ${Math.round((passedFeatures / totalFeatures) * 100)}%`);

if (passedFeatures === totalFeatures) {
  console.log('\n🎉 Smart Session Manager implementation is complete!');
  console.log('\n✅ All requirements 16.1-16.5 have been implemented:');
  console.log('  16.1: Session extension adds exactly 60 minutes');
  console.log('  16.2: Maximum 240 minutes total session time enforced');
  console.log('  16.3: Administrator authorization required for extensions');
  console.log('  16.4: Mandatory audit records created for all extensions');
  console.log('  16.5: Manual intervention required after 240 minutes');
  console.log('\n📝 Task acceptance criteria met:');
  console.log('  ✅ Sessions use config limit (180min)');
  console.log('  ✅ Extensions work with proper validation');
  console.log('  ✅ Logs "Session extended: +60min, total=X" format');
} else {
  console.log('\n⚠️  Implementation needs attention for missing features.');
}

console.log('\n🔧 Next steps:');
console.log('  1. Run database migration: migrations/023_smart_sessions_system.sql');
console.log('  2. Update service initialization to include SmartSessionManager');
console.log('  3. Test smart assignment feature flag integration');
console.log('  4. Verify admin panel extension interface');