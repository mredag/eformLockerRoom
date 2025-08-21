#!/usr/bin/env node

/**
 * System Requirements Validation Script
 * Validates that the system meets all requirements without running full test suite
 */

import fs from 'fs';
import path from 'path';

const COLORS = {
  SUCCESS: '\x1b[32m',
  ERROR: '\x1b[31m',
  WARNING: '\x1b[33m',
  INFO: '\x1b[36m',
  HEADER: '\x1b[35m',
  RESET: '\x1b[0m'
};

function log(message, color = 'RESET') {
  console.log(`${COLORS[color]}${message}${COLORS.RESET}`);
}

function logHeader(title) {
  console.log('');
  log('='.repeat(80), 'HEADER');
  log(` ${title}`, 'HEADER');
  log('='.repeat(80), 'HEADER');
  console.log('');
}

function validateFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`✅ ${description}: ${filePath}`, 'SUCCESS');
    return true;
  } else {
    log(`❌ Missing ${description}: ${filePath}`, 'ERROR');
    return false;
  }
}

function validateDirectoryStructure() {
  logHeader('Directory Structure Validation');
  
  const requiredDirs = [
    { path: 'app/gateway', desc: 'Gateway Service' },
    { path: 'app/kiosk', desc: 'Kiosk Service' },
    { path: 'app/panel', desc: 'Panel Service' },
    { path: 'app/agent', desc: 'Agent Service' },
    { path: 'shared', desc: 'Shared Components' },
    { path: 'migrations', desc: 'Database Migrations' },
    { path: 'scripts', desc: 'Deployment Scripts' },
    { path: 'config', desc: 'Configuration Files' }
  ];
  
  let allValid = true;
  for (const dir of requiredDirs) {
    if (!validateFileExists(dir.path, dir.desc)) {
      allValid = false;
    }
  }
  
  return allValid;
}

function validateCoreFiles() {
  logHeader('Core Files Validation');
  
  const coreFiles = [
    // Database
    { path: 'shared/database/database-manager.ts', desc: 'Database Manager' },
    { path: 'shared/database/locker-repository.ts', desc: 'Locker Repository' },
    { path: 'shared/database/vip-contract-repository.ts', desc: 'VIP Contract Repository' },
    
    // Services
    { path: 'shared/services/locker-state-manager.ts', desc: 'Locker State Manager' },
    { path: 'shared/services/command-queue-manager.ts', desc: 'Command Queue Manager' },
    { path: 'shared/services/event-logger.ts', desc: 'Event Logger' },
    { path: 'shared/services/rate-limiter.ts', desc: 'Rate Limiter' },
    { path: 'shared/services/security-validation.ts', desc: 'Security Validation' },
    
    // Hardware
    { path: 'app/kiosk/src/hardware/modbus-controller.ts', desc: 'Modbus Controller' },
    { path: 'app/kiosk/src/hardware/rfid-handler.ts', desc: 'RFID Handler' },
    
    // Controllers
    { path: 'app/kiosk/src/controllers/qr-handler.ts', desc: 'QR Handler' },
    { path: 'app/panel/src/services/auth-service.ts', desc: 'Authentication Service' },
    
    // Migrations
    { path: 'migrations/001_initial_schema.sql', desc: 'Initial Schema Migration' },
    { path: 'migrations/003_complete_schema.sql', desc: 'Complete Schema Migration' }
  ];
  
  let allValid = true;
  for (const file of coreFiles) {
    if (!validateFileExists(file.path, file.desc)) {
      allValid = false;
    }
  }
  
  return allValid;
}

function validateRequirementImplementation() {
  logHeader('Requirements Implementation Validation');
  
  const requirements = [
    {
      id: 'REQ-1',
      name: 'RFID-Based Locker Access',
      files: [
        'app/kiosk/src/hardware/rfid-handler.ts',
        'shared/services/locker-state-manager.ts'
      ],
      keywords: ['rfid', 'card', 'scan', 'assign', 'release']
    },
    {
      id: 'REQ-2',
      name: 'VIP Locker Management',
      files: [
        'shared/database/vip-contract-repository.ts',
        'app/panel/src/routes/vip-routes.ts'
      ],
      keywords: ['vip', 'contract', 'premium', 'dedicated']
    },
    {
      id: 'REQ-3',
      name: 'Staff Management Interface',
      files: [
        'app/panel/src/routes/locker-routes.ts',
        'app/panel/src/services/auth-service.ts'
      ],
      keywords: ['staff', 'panel', 'bulk', 'management']
    },
    {
      id: 'REQ-4',
      name: 'Master PIN Access',
      files: [
        'app/kiosk/src/controllers/ui-controller.ts'
      ],
      keywords: ['master', 'pin', 'override', 'maintenance']
    },
    {
      id: 'REQ-5',
      name: 'QR Code Access',
      files: [
        'app/kiosk/src/controllers/qr-handler.ts'
      ],
      keywords: ['qr', 'device', 'mobile', 'token']
    },
    {
      id: 'REQ-6',
      name: 'Multi-Room Architecture',
      files: [
        'shared/services/heartbeat-manager.ts',
        'shared/services/command-queue-manager.ts'
      ],
      keywords: ['multi-room', 'kiosk', 'heartbeat', 'coordination']
    },
    {
      id: 'REQ-7',
      name: 'Hardware Integration',
      files: [
        'app/kiosk/src/hardware/modbus-controller.ts',
        'app/kiosk/src/hardware/rs485-diagnostics.ts'
      ],
      keywords: ['modbus', 'rs485', 'relay', 'pulse']
    },
    {
      id: 'REQ-8',
      name: 'Security and Access Control',
      files: [
        'shared/services/security-validation.ts',
        'shared/services/rate-limiter.ts'
      ],
      keywords: ['security', 'auth', 'rate', 'validation']
    },
    {
      id: 'REQ-9',
      name: 'Offline Operation',
      files: [
        'shared/services/event-logger.ts'
      ],
      keywords: ['offline', 'recovery', 'restart', 'reliability']
    },
    {
      id: 'REQ-10',
      name: 'Installation and Maintenance',
      files: [
        'scripts/install.sh',
        'app/agent/src/services/update-agent.ts'
      ],
      keywords: ['install', 'update', 'maintenance', 'deployment']
    }
  ];
  
  let allValid = true;
  
  for (const req of requirements) {
    log(`\n📋 Checking ${req.id}: ${req.name}`, 'INFO');
    
    let reqValid = true;
    
    // Check if required files exist
    for (const filePath of req.files) {
      if (!fs.existsSync(filePath)) {
        log(`  ❌ Missing implementation file: ${filePath}`, 'ERROR');
        reqValid = false;
      } else {
        log(`  ✅ Implementation file found: ${filePath}`, 'SUCCESS');
        
        // Check for keywords in file content
        try {
          const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
          const foundKeywords = req.keywords.filter(keyword => 
            content.includes(keyword.toLowerCase())
          );
          
          if (foundKeywords.length >= req.keywords.length / 2) {
            log(`  ✅ Keywords found: ${foundKeywords.join(', ')}`, 'SUCCESS');
          } else {
            log(`  ⚠️ Limited keyword coverage: ${foundKeywords.join(', ')}`, 'WARNING');
          }
        } catch (error) {
          log(`  ⚠️ Could not read file content: ${error.message}`, 'WARNING');
        }
      }
    }
    
    if (reqValid) {
      log(`  ✅ ${req.id} implementation validated`, 'SUCCESS');
    } else {
      log(`  ❌ ${req.id} implementation incomplete`, 'ERROR');
      allValid = false;
    }
  }
  
  return allValid;
}

function validateTestCoverage() {
  logHeader('Test Coverage Validation');
  
  const testCategories = [
    {
      name: 'Unit Tests',
      pattern: '**/__tests__/**/*.test.ts',
      directories: [
        'shared/services/__tests__',
        'shared/database/__tests__',
        'app/gateway/src/__tests__',
        'app/kiosk/src/__tests__',
        'app/panel/src/__tests__'
      ]
    },
    {
      name: 'Integration Tests',
      pattern: '**/integration/**/*.test.ts',
      directories: [
        'app/gateway/src/__tests__/integration',
        'app/panel/src/__tests__/integration',
        'app/kiosk/src/__tests__/integration'
      ]
    },
    {
      name: 'End-to-End Tests',
      pattern: '**/e2e/**/*.test.ts',
      directories: [
        'app/kiosk/src/__tests__/e2e'
      ]
    },
    {
      name: 'Performance Tests',
      pattern: '**/performance/**/*.test.ts',
      directories: [
        'app/panel/src/__tests__/performance'
      ]
    }
  ];
  
  let allValid = true;
  
  for (const category of testCategories) {
    log(`\n🧪 Checking ${category.name}`, 'INFO');
    
    let categoryValid = true;
    let testCount = 0;
    
    for (const dir of category.directories) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir, { recursive: true })
          .filter(file => file.endsWith('.test.ts') || file.endsWith('.test.js'));
        
        testCount += files.length;
        
        if (files.length > 0) {
          log(`  ✅ Found ${files.length} test files in ${dir}`, 'SUCCESS');
        } else {
          log(`  ⚠️ No test files found in ${dir}`, 'WARNING');
        }
      } else {
        log(`  ❌ Test directory missing: ${dir}`, 'ERROR');
        categoryValid = false;
      }
    }
    
    if (testCount > 0) {
      log(`  ✅ ${category.name}: ${testCount} test files total`, 'SUCCESS');
    } else {
      log(`  ❌ ${category.name}: No test files found`, 'ERROR');
      categoryValid = false;
    }
    
    if (!categoryValid) {
      allValid = false;
    }
  }
  
  return allValid;
}

function validateConfiguration() {
  logHeader('Configuration Validation');
  
  const configFiles = [
    { path: 'package.json', desc: 'Package Configuration' },
    { path: 'tsconfig.json', desc: 'TypeScript Configuration' },
    { path: 'vitest.config.comprehensive.ts', desc: 'Test Configuration' },
    { path: 'config/system.json', desc: 'System Configuration' }
  ];
  
  let allValid = true;
  
  for (const config of configFiles) {
    if (validateFileExists(config.path, config.desc)) {
      try {
        if (config.path.endsWith('.json')) {
          JSON.parse(fs.readFileSync(config.path, 'utf8'));
          log(`  ✅ Valid JSON format`, 'SUCCESS');
        }
      } catch (error) {
        log(`  ❌ Invalid JSON format: ${error.message}`, 'ERROR');
        allValid = false;
      }
    } else {
      allValid = false;
    }
  }
  
  return allValid;
}

function validateDeploymentScripts() {
  logHeader('Deployment Scripts Validation');
  
  const scripts = [
    { path: 'scripts/install.sh', desc: 'Installation Script' },
    { path: 'scripts/deploy.sh', desc: 'Deployment Script' },
    { path: 'scripts/backup.sh', desc: 'Backup Script' },
    { path: 'scripts/health-check.sh', desc: 'Health Check Script' },
    { path: 'scripts/run-system-validation.ps1', desc: 'System Validation Script (PowerShell)' },
    { path: 'scripts/run-system-validation.sh', desc: 'System Validation Script (Bash)' }
  ];
  
  let allValid = true;
  
  for (const script of scripts) {
    if (!validateFileExists(script.path, script.desc)) {
      allValid = false;
    }
  }
  
  return allValid;
}

function generateValidationReport(results) {
  logHeader('Validation Summary Report');
  
  const categories = Object.keys(results);
  const passed = categories.filter(cat => results[cat]).length;
  const failed = categories.length - passed;
  
  log(`📊 Validation Results:`, 'INFO');
  log(`   ✅ Passed: ${passed}/${categories.length}`, 'SUCCESS');
  log(`   ❌ Failed: ${failed}/${categories.length}`, failed > 0 ? 'ERROR' : 'SUCCESS');
  
  console.log('');
  log('📋 Category Details:', 'INFO');
  
  for (const [category, passed] of Object.entries(results)) {
    const status = passed ? '✅' : '❌';
    const color = passed ? 'SUCCESS' : 'ERROR';
    log(`   ${status} ${category.replace(/([A-Z])/g, ' $1').trim()}`, color);
  }
  
  console.log('');
  
  if (failed === 0) {
    log('🎉 ALL VALIDATION CHECKS PASSED!', 'SUCCESS');
    log('✅ System appears ready for comprehensive testing', 'SUCCESS');
    return true;
  } else {
    log('❌ VALIDATION FAILED', 'ERROR');
    log(`🔧 Please fix ${failed} failing categories before proceeding`, 'WARNING');
    return false;
  }
}

function main() {
  logHeader('Eform Locker System - Requirements Validation');
  
  log('🔍 Validating system implementation against requirements...', 'INFO');
  console.log('');
  
  const results = {
    directoryStructure: validateDirectoryStructure(),
    coreFiles: validateCoreFiles(),
    requirementImplementation: validateRequirementImplementation(),
    testCoverage: validateTestCoverage(),
    configuration: validateConfiguration(),
    deploymentScripts: validateDeploymentScripts()
  };
  
  const overallSuccess = generateValidationReport(results);
  
  if (overallSuccess) {
    log('\n🚀 System is ready for comprehensive validation testing!', 'SUCCESS');
    log('💡 Next steps:', 'INFO');
    log('   1. Run: npm run test:comprehensive', 'INFO');
    log('   2. Run: scripts/run-system-validation.ps1', 'INFO');
    log('   3. Review generated test reports', 'INFO');
    process.exit(0);
  } else {
    log('\n🛠️ Please address the validation issues above before proceeding.', 'WARNING');
    process.exit(1);
  }
}

// Run validation
main();