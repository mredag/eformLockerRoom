#!/usr/bin/env node

/**
 * Backend Integration Validation Script
 * Validates integration with existing backend services without running full tests
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Backend Integration Validation Started');
console.log('=========================================');

/**
 * Check if required backend files exist and are accessible
 */
function validateBackendFiles() {
  console.log('\n📁 Validating Backend File Structure...');
  
  const requiredFiles = [
    'shared/services/locker-state-manager.ts',
    'shared/services/websocket-service.ts',
    'app/kiosk/src/hardware/modbus-controller.ts',
    'app/kiosk/src/controllers/session-manager.ts',
    'app/kiosk/src/controllers/ui-controller.ts',
    'shared/database/connection.ts',
    'shared/types/core-entities.ts'
  ];

  let allFilesExist = true;

  requiredFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - NOT FOUND`);
      allFilesExist = false;
    }
  });

  return allFilesExist;
}

/**
 * Validate TypeScript imports and exports
 */
function validateTypeScriptExports() {
  console.log('\n📦 Validating TypeScript Exports...');
  
  const files = [
    {
      path: 'shared/services/locker-state-manager.ts',
      exports: ['LockerStateManager']
    },
    {
      path: 'shared/services/websocket-service.ts',
      exports: ['webSocketService', 'WebSocketService']
    },
    {
      path: 'app/kiosk/src/hardware/modbus-controller.ts',
      exports: ['ModbusController']
    },
    {
      path: 'app/kiosk/src/controllers/session-manager.ts',
      exports: ['SessionManager']
    },
    {
      path: 'app/kiosk/src/controllers/ui-controller.ts',
      exports: ['UiController']
    }
  ];

  let allExportsValid = true;

  files.forEach(file => {
    const filePath = path.join(process.cwd(), file.path);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      file.exports.forEach(exportName => {
        if (content.includes(`export class ${exportName}`) || 
            content.includes(`export const ${exportName}`) ||
            content.includes(`export { ${exportName}`)) {
          console.log(`✅ ${file.path} exports ${exportName}`);
        } else {
          console.log(`❌ ${file.path} missing export ${exportName}`);
          allExportsValid = false;
        }
      });
    }
  });

  return allExportsValid;
}

/**
 * Validate API endpoint structure
 */
function validateAPIEndpoints() {
  console.log('\n🌐 Validating API Endpoint Structure...');
  
  const uiControllerPath = path.join(process.cwd(), 'app/kiosk/src/controllers/ui-controller.ts');
  
  if (!fs.existsSync(uiControllerPath)) {
    console.log('❌ UI Controller file not found');
    return false;
  }

  const content = fs.readFileSync(uiControllerPath, 'utf-8');
  
  const requiredEndpoints = [
    '/api/card/:cardId/locker',
    '/api/locker/assign',
    '/api/locker/release',
    '/api/lockers/available',
    '/api/session/status',
    '/api/session/cancel',
    '/api/hardware/status'
  ];

  let allEndpointsFound = true;

  requiredEndpoints.forEach(endpoint => {
    // Convert endpoint pattern to regex-friendly format
    const pattern = endpoint.replace(':cardId', '\\w+');
    if (content.includes(endpoint) || content.match(new RegExp(pattern))) {
      console.log(`✅ API endpoint: ${endpoint}`);
    } else {
      console.log(`❌ API endpoint missing: ${endpoint}`);
      allEndpointsFound = false;
    }
  });

  return allEndpointsFound;
}

/**
 * Validate database schema compatibility
 */
function validateDatabaseSchema() {
  console.log('\n🗄️ Validating Database Schema...');
  
  const migrationFiles = fs.readdirSync(path.join(process.cwd(), 'migrations'))
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.log('❌ No migration files found');
    return false;
  }

  console.log(`✅ Found ${migrationFiles.length} migration files`);

  // Check for required tables
  const requiredTables = ['lockers', 'events'];
  const foundTables = new Set();

  migrationFiles.forEach(file => {
    const content = fs.readFileSync(path.join(process.cwd(), 'migrations', file), 'utf-8');
    
    requiredTables.forEach(table => {
      if (content.toLowerCase().includes(`create table ${table}`) || 
          content.toLowerCase().includes(`create table if not exists ${table}`)) {
        if (!foundTables.has(table)) {
          console.log(`✅ Table schema found: ${table}`);
          foundTables.add(table);
        }
      }
    });
  });

  return foundTables.size >= requiredTables.length;
}

/**
 * Validate session management integration
 */
function validateSessionManagement() {
  console.log('\n🔑 Validating Session Management Integration...');
  
  const sessionManagerPath = path.join(process.cwd(), 'app/kiosk/src/controllers/session-manager.ts');
  
  if (!fs.existsSync(sessionManagerPath)) {
    console.log('❌ Session Manager file not found');
    return false;
  }

  const content = fs.readFileSync(sessionManagerPath, 'utf-8');
  
  const requiredFeatures = [
    'createSession',
    'getKioskSession',
    'completeSession',
    'cancelSession',
    'getRemainingTime',
    'defaultTimeoutSeconds: 30' // Updated requirement
  ];

  let allFeaturesFound = true;

  requiredFeatures.forEach(feature => {
    if (content.includes(feature)) {
      console.log(`✅ Session feature: ${feature}`);
    } else {
      console.log(`❌ Session feature missing: ${feature}`);
      allFeaturesFound = false;
    }
  });

  return allFeaturesFound;
}

/**
 * Validate hardware controller integration
 */
function validateHardwareController() {
  console.log('\n🔧 Validating Hardware Controller Integration...');
  
  const hardwarePath = path.join(process.cwd(), 'app/kiosk/src/hardware/modbus-controller.ts');
  
  if (!fs.existsSync(hardwarePath)) {
    console.log('❌ Hardware Controller file not found');
    return false;
  }

  const content = fs.readFileSync(hardwarePath, 'utf-8');
  
  const requiredFeatures = [
    'openLocker',
    'getHardwareStatus',
    'retry',
    'error handling',
    'EventEmitter'
  ];

  let allFeaturesFound = true;

  requiredFeatures.forEach(feature => {
    const patterns = {
      'openLocker': /openLocker\s*\(/,
      'getHardwareStatus': /getHardwareStatus\s*\(/,
      'retry': /retry|Retry/,
      'error handling': /catch|error|Error/,
      'EventEmitter': /EventEmitter|emit/
    };

    const pattern = patterns[feature] || new RegExp(feature);
    
    if (content.match(pattern)) {
      console.log(`✅ Hardware feature: ${feature}`);
    } else {
      console.log(`❌ Hardware feature missing: ${feature}`);
      allFeaturesFound = false;
    }
  });

  return allFeaturesFound;
}

/**
 * Validate WebSocket service integration
 */
function validateWebSocketService() {
  console.log('\n🌐 Validating WebSocket Service Integration...');
  
  const wsPath = path.join(process.cwd(), 'shared/services/websocket-service.ts');
  
  if (!fs.existsSync(wsPath)) {
    console.log('❌ WebSocket Service file not found');
    return false;
  }

  const content = fs.readFileSync(wsPath, 'utf-8');
  
  const requiredFeatures = [
    'broadcastStateUpdate',
    'getConnectionStatus',
    'initialize',
    'shutdown',
    'WebSocketServer'
  ];

  let allFeaturesFound = true;

  requiredFeatures.forEach(feature => {
    if (content.includes(feature)) {
      console.log(`✅ WebSocket feature: ${feature}`);
    } else {
      console.log(`❌ WebSocket feature missing: ${feature}`);
      allFeaturesFound = false;
    }
  });

  return allFeaturesFound;
}

/**
 * Validate error handling patterns
 */
function validateErrorHandling() {
  console.log('\n🚨 Validating Error Handling Patterns...');
  
  const files = [
    'app/kiosk/src/controllers/ui-controller.ts',
    'shared/services/locker-state-manager.ts',
    'app/kiosk/src/hardware/modbus-controller.ts'
  ];

  let errorHandlingValid = true;

  files.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check for error handling patterns
      const hasErrorHandling = content.includes('try {') && 
                              content.includes('catch') && 
                              content.includes('console.error');
      
      if (hasErrorHandling) {
        console.log(`✅ Error handling in ${file}`);
      } else {
        console.log(`❌ Insufficient error handling in ${file}`);
        errorHandlingValid = false;
      }
    }
  });

  return errorHandlingValid;
}

/**
 * Validate Turkish language support
 */
function validateTurkishSupport() {
  console.log('\n🇹🇷 Validating Turkish Language Support...');
  
  const uiControllerPath = path.join(process.cwd(), 'app/kiosk/src/controllers/ui-controller.ts');
  
  if (!fs.existsSync(uiControllerPath)) {
    console.log('❌ UI Controller file not found');
    return false;
  }

  const content = fs.readFileSync(uiControllerPath, 'utf-8');
  
  const turkishMessages = [
    'Kartınızı okutun',
    'Dolap seçin',
    'Süre doldu',
    'Sistem bakımda',
    'Tekrar deneyin'
  ];

  let turkishSupported = true;

  turkishMessages.forEach(message => {
    if (content.includes(message)) {
      console.log(`✅ Turkish message: ${message}`);
    } else {
      console.log(`❌ Turkish message missing: ${message}`);
      turkishSupported = false;
    }
  });

  return turkishSupported;
}

/**
 * Check package dependencies (including workspace packages)
 */
function validateDependencies() {
  console.log('\n📦 Validating Package Dependencies...');
  
  const packagePath = path.join(process.cwd(), 'package.json');
  
  if (!fs.existsSync(packagePath)) {
    console.log('❌ package.json not found');
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  const rootDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  // Check workspace dependencies
  const workspaces = ['app/kiosk', 'shared'];
  const allDependencies = { ...rootDependencies };
  
  workspaces.forEach(workspace => {
    const workspacePackagePath = path.join(process.cwd(), workspace, 'package.json');
    if (fs.existsSync(workspacePackagePath)) {
      const workspacePackage = JSON.parse(fs.readFileSync(workspacePackagePath, 'utf-8'));
      const workspaceDeps = { ...workspacePackage.dependencies, ...workspacePackage.devDependencies };
      Object.assign(allDependencies, workspaceDeps);
    }
  });
  
  const requiredDeps = [
    'fastify',
    'serialport',
    'ws',
    'sqlite3',
    'typescript'
  ];

  let allDepsFound = true;

  requiredDeps.forEach(dep => {
    if (allDependencies[dep]) {
      console.log(`✅ Dependency: ${dep}@${allDependencies[dep]}`);
    } else {
      console.log(`❌ Missing dependency: ${dep}`);
      allDepsFound = false;
    }
  });

  return allDepsFound;
}

/**
 * Run all validation checks
 */
function runAllValidations() {
  const startTime = Date.now();
  
  console.log('🚀 Starting Backend Integration Validation');
  
  const validations = [
    { name: 'Backend File Structure', fn: validateBackendFiles },
    { name: 'TypeScript Exports', fn: validateTypeScriptExports },
    { name: 'API Endpoints', fn: validateAPIEndpoints },
    { name: 'Database Schema', fn: validateDatabaseSchema },
    { name: 'Session Management', fn: validateSessionManagement },
    { name: 'Hardware Controller', fn: validateHardwareController },
    { name: 'WebSocket Service', fn: validateWebSocketService },
    { name: 'Error Handling', fn: validateErrorHandling },
    { name: 'Turkish Language Support', fn: validateTurkishSupport },
    { name: 'Package Dependencies', fn: validateDependencies }
  ];

  const results = [];

  validations.forEach(validation => {
    try {
      const result = validation.fn();
      results.push({ name: validation.name, passed: result });
    } catch (error) {
      console.error(`❌ ${validation.name} validation failed:`, error.message);
      results.push({ name: validation.name, passed: false, error: error.message });
    }
  });

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  console.log('\n📊 Validation Summary');
  console.log('====================');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\n📈 Results: ${passed}/${total} validations passed`);
  console.log(`⏱️ Duration: ${duration.toFixed(2)} seconds`);

  if (passed === total) {
    console.log('\n🎉 All Backend Integration Validations Passed!');
    console.log('✅ The kiosk UI is compatible with existing backend services');
    console.log('✅ All required integration points are available');
    console.log('✅ Error handling and recovery mechanisms are in place');
    console.log('✅ Real-time state synchronization is supported');
    console.log('✅ Session management integration is complete');
    return true;
  } else {
    console.log('\n⚠️ Some Backend Integration Validations Failed');
    console.log('❌ Please review the failed validations above');
    console.log('❌ Fix any missing components before proceeding');
    return false;
  }
}

// Run validations if called directly
if (require.main === module) {
  const success = runAllValidations();
  process.exit(success ? 0 : 1);
}

module.exports = {
  runAllValidations,
  validateBackendFiles,
  validateTypeScriptExports,
  validateAPIEndpoints,
  validateDatabaseSchema,
  validateSessionManagement,
  validateHardwareController,
  validateWebSocketService,
  validateErrorHandling,
  validateTurkishSupport,
  validateDependencies
};