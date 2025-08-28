#!/usr/bin/env node

/**
 * Comprehensive System Validation Script
 * Consolidates all validation functionality into a single script
 * 
 * Validates:
 * - System requirements and dependencies
 * - Hardware integration and compatibility
 * - Test coverage and implementation
 * - Configuration and deployment readiness
 * - Integration requirements coverage
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { SerialPort } from 'serialport';

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

class SystemValidator {
  constructor() {
    this.results = {
      dependencies: { status: 'unknown', details: {} },
      hardware: { status: 'unknown', details: {} },
      requirements: { status: 'unknown', details: {} },
      tests: { status: 'unknown', details: {} },
      configuration: { status: 'unknown', details: {} },
      deployment: { status: 'unknown', details: {} }
    };
  }

  async validate(validationType = 'all') {
    logHeader('Comprehensive System Validation');
    
    log('🔍 Starting system validation...', 'INFO');
    log(`📋 Validation type: ${validationType}`, 'INFO');
    
    try {
      switch (validationType) {
        case 'dependencies':
          await this.validateDependencies();
          break;
        case 'hardware':
          await this.validateHardware();
          break;
        case 'requirements':
          await this.validateRequirements();
          break;
        case 'tests':
          await this.validateTests();
          break;
        case 'configuration':
          await this.validateConfiguration();
          break;
        case 'deployment':
          await this.validateDeployment();
          break;
        case 'all':
        default:
          await this.validateDependencies();
          await this.validateHardware();
          await this.validateRequirements();
          await this.validateTests();
          await this.validateConfiguration();
          await this.validateDeployment();
          break;
      }
      
      this.generateReport();
      
    } catch (error) {
      log(`❌ Validation failed: ${error.message}`, 'ERROR');
      process.exit(1);
    }
  }

  async validateDependencies() {
    logHeader('Dependencies Validation');
    
    try {
      // Check Node.js version
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      if (majorVersion >= 20) {
        log(`✅ Node.js version: ${nodeVersion} (compatible)`, 'SUCCESS');
        this.results.dependencies.details.nodejs = { version: nodeVersion, status: 'compatible' };
      } else {
        log(`❌ Node.js version: ${nodeVersion} (requires 20+)`, 'ERROR');
        this.results.dependencies.details.nodejs = { version: nodeVersion, status: 'incompatible' };
        this.results.dependencies.status = 'failed';
        return;
      }
      
      // Check critical dependencies
      const criticalDeps = [
        { name: 'serialport', path: 'app/kiosk/package.json' },
        { name: 'node-hid', path: 'app/kiosk/package.json' },
        { name: 'fastify', path: 'app/gateway/package.json' },
        { name: 'sqlite3', path: 'shared/package.json' }
      ];
      
      for (const dep of criticalDeps) {
        if (fs.existsSync(dep.path)) {
          const packageJson = JSON.parse(fs.readFileSync(dep.path, 'utf8'));
          const version = packageJson.dependencies?.[dep.name] || packageJson.devDependencies?.[dep.name];
          
          if (version) {
            log(`✅ ${dep.name}: ${version}`, 'SUCCESS');
            this.results.dependencies.details[dep.name] = { version, status: 'found' };
          } else {
            log(`❌ ${dep.name}: not found in ${dep.path}`, 'ERROR');
            this.results.dependencies.details[dep.name] = { status: 'missing' };
          }
        }
      }
      
      // Test serialport import
      try {
        const ports = await SerialPort.list();
        log(`✅ SerialPort module working (${ports.length} ports available)`, 'SUCCESS');
        this.results.dependencies.details.serialport_test = { ports: ports.length, status: 'working' };
        
        if (ports.length > 0) {
          log('   Available ports:', 'INFO');
          ports.forEach(port => {
            log(`     - ${port.path} (${port.manufacturer || 'Unknown'})`, 'INFO');
          });
        }
      } catch (error) {
        log(`❌ SerialPort module test failed: ${error.message}`, 'ERROR');
        this.results.dependencies.details.serialport_test = { status: 'failed', error: error.message };
      }
      
      this.results.dependencies.status = 'passed';
      
    } catch (error) {
      log(`❌ Dependencies validation failed: ${error.message}`, 'ERROR');
      this.results.dependencies.status = 'failed';
    }
  }

  async validateHardware() {
    logHeader('Hardware Integration Validation');
    
    try {
      // Check hardware-related files
      const hardwareFiles = [
        'app/kiosk/src/hardware/modbus-controller.ts',
        'app/kiosk/src/hardware/rfid-handler.ts',
        'shared/services/locker-state-manager.ts'
      ];
      
      let filesFound = 0;
      for (const file of hardwareFiles) {
        if (fs.existsSync(file)) {
          log(`✅ Hardware file found: ${file}`, 'SUCCESS');
          filesFound++;
        } else {
          log(`❌ Hardware file missing: ${file}`, 'ERROR');
        }
      }
      
      this.results.hardware.details.files = { found: filesFound, total: hardwareFiles.length };
      
      // Check for hardware test files
      const hardwareTestDirs = [
        'app/kiosk/src/hardware/__tests__',
        'app/kiosk/src/__tests__/hardware'
      ];
      
      let testDirsFound = 0;
      for (const dir of hardwareTestDirs) {
        if (fs.existsSync(dir)) {
          const testFiles = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));
          log(`✅ Hardware tests found: ${dir} (${testFiles.length} files)`, 'SUCCESS');
          testDirsFound++;
        }
      }
      
      this.results.hardware.details.tests = { dirs_found: testDirsFound };
      
      // Check hardware configuration
      const configFiles = [
        'config/system.json',
        'config/hardware.json'
      ];
      
      let configFound = 0;
      for (const config of configFiles) {
        if (fs.existsSync(config)) {
          log(`✅ Hardware config found: ${config}`, 'SUCCESS');
          configFound++;
        }
      }
      
      this.results.hardware.details.config = { found: configFound };
      
      if (filesFound >= hardwareFiles.length * 0.8) {
        this.results.hardware.status = 'passed';
      } else {
        this.results.hardware.status = 'partial';
      }
      
    } catch (error) {
      log(`❌ Hardware validation failed: ${error.message}`, 'ERROR');
      this.results.hardware.status = 'failed';
    }
  }

  async validateRequirements() {
    logHeader('Requirements Implementation Validation');
    
    const requirements = [
      {
        id: 'REQ-1',
        name: 'RFID-Based Locker Access',
        files: ['app/kiosk/src/hardware/rfid-handler.ts', 'shared/services/locker-state-manager.ts'],
        keywords: ['rfid', 'card', 'scan', 'assign', 'release']
      },
      {
        id: 'REQ-2',
        name: 'VIP Locker Management',
        files: ['shared/database/vip-contract-repository.ts', 'app/panel/src/routes/vip-routes.ts'],
        keywords: ['vip', 'contract', 'premium', 'dedicated']
      },
      {
        id: 'REQ-3',
        name: 'Staff Management Interface',
        files: ['app/panel/src/routes/locker-routes.ts', 'app/panel/src/services/auth-service.ts'],
        keywords: ['staff', 'panel', 'bulk', 'management']
      },
      {
        id: 'REQ-4',
        name: 'Master PIN Access',
        files: ['app/kiosk/src/controllers/ui-controller.ts'],
        keywords: ['master', 'pin', 'override', 'maintenance']
      },
      {
        id: 'REQ-5',
        name: 'QR Code Access',
        files: ['app/kiosk/src/controllers/qr-handler.ts'],
        keywords: ['qr', 'device', 'mobile', 'token']
      },
      {
        id: 'REQ-6',
        name: 'Multi-Room Architecture',
        files: ['shared/services/heartbeat-manager.ts', 'shared/services/command-queue-manager.ts'],
        keywords: ['multi-room', 'kiosk', 'heartbeat', 'coordination']
      }
    ];
    
    let passedReqs = 0;
    
    for (const req of requirements) {
      log(`\n📋 Checking ${req.id}: ${req.name}`, 'INFO');
      
      let reqScore = 0;
      let maxScore = req.files.length * 2; // 1 point for file existence, 1 for keywords
      
      for (const filePath of req.files) {
        if (fs.existsSync(filePath)) {
          log(`  ✅ Implementation file: ${filePath}`, 'SUCCESS');
          reqScore++;
          
          try {
            const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
            const foundKeywords = req.keywords.filter(keyword => 
              content.includes(keyword.toLowerCase())
            );
            
            if (foundKeywords.length >= req.keywords.length / 2) {
              log(`  ✅ Keywords found: ${foundKeywords.join(', ')}`, 'SUCCESS');
              reqScore++;
            } else {
              log(`  ⚠️ Limited keywords: ${foundKeywords.join(', ')}`, 'WARNING');
            }
          } catch (error) {
            log(`  ⚠️ Could not analyze content: ${error.message}`, 'WARNING');
          }
        } else {
          log(`  ❌ Missing file: ${filePath}`, 'ERROR');
        }
      }
      
      const reqPercentage = (reqScore / maxScore) * 100;
      if (reqPercentage >= 75) {
        log(`  ✅ ${req.id} implementation: ${reqPercentage.toFixed(0)}%`, 'SUCCESS');
        passedReqs++;
      } else if (reqPercentage >= 50) {
        log(`  ⚠️ ${req.id} implementation: ${reqPercentage.toFixed(0)}%`, 'WARNING');
      } else {
        log(`  ❌ ${req.id} implementation: ${reqPercentage.toFixed(0)}%`, 'ERROR');
      }
      
      this.results.requirements.details[req.id] = { 
        score: reqScore, 
        maxScore, 
        percentage: reqPercentage 
      };
    }
    
    const overallPercentage = (passedReqs / requirements.length) * 100;
    this.results.requirements.details.overall = {
      passed: passedReqs,
      total: requirements.length,
      percentage: overallPercentage
    };
    
    if (overallPercentage >= 80) {
      this.results.requirements.status = 'passed';
    } else if (overallPercentage >= 60) {
      this.results.requirements.status = 'partial';
    } else {
      this.results.requirements.status = 'failed';
    }
  }

  async validateTests() {
    logHeader('Test Coverage Validation');
    
    const testCategories = [
      {
        name: 'Unit Tests',
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
        directories: [
          'app/gateway/src/__tests__/integration',
          'app/panel/src/__tests__/integration',
          'app/kiosk/src/__tests__/integration'
        ]
      },
      {
        name: 'Hardware Tests',
        directories: [
          'app/kiosk/src/hardware/__tests__',
          'app/kiosk/src/__tests__/hardware'
        ]
      }
    ];
    
    let totalTestFiles = 0;
    
    for (const category of testCategories) {
      log(`\n🧪 Checking ${category.name}`, 'INFO');
      
      let categoryTestCount = 0;
      
      for (const dir of category.directories) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir, { recursive: true })
            .filter(file => file.endsWith('.test.ts') || file.endsWith('.test.js'));
          
          categoryTestCount += files.length;
          
          if (files.length > 0) {
            log(`  ✅ ${dir}: ${files.length} test files`, 'SUCCESS');
          } else {
            log(`  ⚠️ ${dir}: No test files`, 'WARNING');
          }
        } else {
          log(`  ❌ Missing directory: ${dir}`, 'ERROR');
        }
      }
      
      totalTestFiles += categoryTestCount;
      this.results.tests.details[category.name.toLowerCase().replace(' ', '_')] = {
        count: categoryTestCount
      };
      
      if (categoryTestCount > 0) {
        log(`  ✅ ${category.name}: ${categoryTestCount} total files`, 'SUCCESS');
      } else {
        log(`  ❌ ${category.name}: No test files found`, 'ERROR');
      }
    }
    
    this.results.tests.details.total = totalTestFiles;
    
    if (totalTestFiles >= 20) {
      this.results.tests.status = 'passed';
    } else if (totalTestFiles >= 10) {
      this.results.tests.status = 'partial';
    } else {
      this.results.tests.status = 'failed';
    }
  }

  async validateConfiguration() {
    logHeader('Configuration Validation');
    
    const configFiles = [
      { path: 'package.json', desc: 'Package Configuration', required: true },
      { path: 'tsconfig.json', desc: 'TypeScript Configuration', required: true },
      { path: 'vitest.config.ts', desc: 'Test Configuration', required: false },
      { path: 'config/system.json', desc: 'System Configuration', required: false }
    ];
    
    let validConfigs = 0;
    let requiredConfigs = 0;
    
    for (const config of configFiles) {
      if (config.required) requiredConfigs++;
      
      if (fs.existsSync(config.path)) {
        try {
          if (config.path.endsWith('.json')) {
            JSON.parse(fs.readFileSync(config.path, 'utf8'));
            log(`✅ ${config.desc}: Valid`, 'SUCCESS');
            validConfigs++;
          } else {
            log(`✅ ${config.desc}: Found`, 'SUCCESS');
            validConfigs++;
          }
        } catch (error) {
          log(`❌ ${config.desc}: Invalid JSON - ${error.message}`, 'ERROR');
        }
      } else {
        if (config.required) {
          log(`❌ ${config.desc}: Missing (required)`, 'ERROR');
        } else {
          log(`⚠️ ${config.desc}: Missing (optional)`, 'WARNING');
        }
      }
    }
    
    this.results.configuration.details = {
      valid: validConfigs,
      required: requiredConfigs,
      total: configFiles.length
    };
    
    if (validConfigs >= requiredConfigs) {
      this.results.configuration.status = 'passed';
    } else {
      this.results.configuration.status = 'failed';
    }
  }

  async validateDeployment() {
    logHeader('Deployment Readiness Validation');
    
    const deploymentFiles = [
      { path: 'scripts/install.sh', desc: 'Installation Script', required: true },
      { path: 'scripts/deploy.sh', desc: 'Deployment Script', required: true },
      { path: 'scripts/backup.sh', desc: 'Backup Script', required: false },
      { path: 'scripts/health-check.sh', desc: 'Health Check Script', required: false },
      { path: 'scripts/start-all-clean.sh', desc: 'Service Startup Script', required: true }
    ];
    
    let foundScripts = 0;
    let requiredScripts = 0;
    
    for (const script of deploymentFiles) {
      if (script.required) requiredScripts++;
      
      if (fs.existsSync(script.path)) {
        log(`✅ ${script.desc}: Found`, 'SUCCESS');
        foundScripts++;
        
        // Check if script is executable
        try {
          const stats = fs.statSync(script.path);
          if (stats.mode & parseInt('111', 8)) {
            log(`  ✅ Executable permissions set`, 'SUCCESS');
          } else {
            log(`  ⚠️ Not executable (may need chmod +x)`, 'WARNING');
          }
        } catch (error) {
          log(`  ⚠️ Could not check permissions: ${error.message}`, 'WARNING');
        }
      } else {
        if (script.required) {
          log(`❌ ${script.desc}: Missing (required)`, 'ERROR');
        } else {
          log(`⚠️ ${script.desc}: Missing (optional)`, 'WARNING');
        }
      }
    }
    
    this.results.deployment.details = {
      found: foundScripts,
      required: requiredScripts,
      total: deploymentFiles.length
    };
    
    if (foundScripts >= requiredScripts) {
      this.results.deployment.status = 'passed';
    } else {
      this.results.deployment.status = 'failed';
    }
  }

  generateReport() {
    logHeader('Validation Summary Report');
    
    const categories = Object.keys(this.results);
    const passed = categories.filter(cat => this.results[cat].status === 'passed').length;
    const partial = categories.filter(cat => this.results[cat].status === 'partial').length;
    const failed = categories.filter(cat => this.results[cat].status === 'failed').length;
    
    log(`📊 Validation Results:`, 'INFO');
    log(`   ✅ Passed: ${passed}/${categories.length}`, 'SUCCESS');
    log(`   ⚠️ Partial: ${partial}/${categories.length}`, partial > 0 ? 'WARNING' : 'INFO');
    log(`   ❌ Failed: ${failed}/${categories.length}`, failed > 0 ? 'ERROR' : 'SUCCESS');
    
    console.log('');
    log('📋 Category Details:', 'INFO');
    
    for (const [category, result] of Object.entries(this.results)) {
      const status = result.status;
      let statusIcon, color;
      
      switch (status) {
        case 'passed':
          statusIcon = '✅';
          color = 'SUCCESS';
          break;
        case 'partial':
          statusIcon = '⚠️';
          color = 'WARNING';
          break;
        case 'failed':
          statusIcon = '❌';
          color = 'ERROR';
          break;
        default:
          statusIcon = '❓';
          color = 'INFO';
      }
      
      log(`   ${statusIcon} ${category.charAt(0).toUpperCase() + category.slice(1)}: ${status}`, color);
      
      // Show key details
      if (result.details) {
        if (category === 'requirements' && result.details.overall) {
          log(`      Implementation: ${result.details.overall.percentage.toFixed(0)}% (${result.details.overall.passed}/${result.details.overall.total})`, 'INFO');
        }
        if (category === 'tests' && result.details.total !== undefined) {
          log(`      Test files: ${result.details.total}`, 'INFO');
        }
        if (category === 'dependencies' && result.details.serialport_test) {
          log(`      Serial ports: ${result.details.serialport_test.ports || 0}`, 'INFO');
        }
      }
    }
    
    console.log('');
    
    if (failed === 0 && partial <= 1) {
      log('🎉 SYSTEM VALIDATION PASSED!', 'SUCCESS');
      log('✅ System appears ready for deployment and testing', 'SUCCESS');
      
      log('\n💡 Next steps:', 'INFO');
      log('   1. Run comprehensive tests: npm run test', 'INFO');
      log('   2. Deploy to test environment', 'INFO');
      log('   3. Perform hardware integration testing', 'INFO');
      
      return true;
    } else {
      log('❌ SYSTEM VALIDATION FAILED', 'ERROR');
      log(`🔧 Please address ${failed} failed and ${partial} partial categories`, 'WARNING');
      
      log('\n🛠️ Recommended actions:', 'INFO');
      if (this.results.dependencies.status === 'failed') {
        log('   - Install missing dependencies', 'INFO');
        log('   - Verify Node.js version (20+)', 'INFO');
      }
      if (this.results.hardware.status === 'failed') {
        log('   - Implement missing hardware components', 'INFO');
        log('   - Add hardware test coverage', 'INFO');
      }
      if (this.results.requirements.status === 'failed') {
        log('   - Complete requirement implementations', 'INFO');
        log('   - Add missing functionality', 'INFO');
      }
      
      return false;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const validationType = args[0] || 'all';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/validate-system.js [type]');
    console.log('');
    console.log('Validation types:');
    console.log('  all           - Run all validations (default)');
    console.log('  dependencies  - Check dependencies and Node.js version');
    console.log('  hardware      - Validate hardware integration');
    console.log('  requirements  - Check requirement implementations');
    console.log('  tests         - Validate test coverage');
    console.log('  configuration - Check configuration files');
    console.log('  deployment    - Validate deployment readiness');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/validate-system.js');
    console.log('  node scripts/validate-system.js hardware');
    console.log('  node scripts/validate-system.js dependencies');
    return;
  }
  
  const validator = new SystemValidator();
  await validator.validate(validationType);
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  log(`Unhandled error: ${error}`, 'ERROR');
  process.exit(1);
});

// Run validation
main().catch((error) => {
  log(`Validation failed: ${error}`, 'ERROR');
  process.exit(1);
});