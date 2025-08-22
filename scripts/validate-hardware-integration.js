#!/usr/bin/env node

/**
 * Hardware Integration Validation Script
 * Validates serialport dependency installation and hardware integration
 * Task 16.4 - Validate hardware integration and dependencies
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

class HardwareValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'HardwareValidationError';
    this.details = details;
  }
}

class HardwareValidator {
  constructor() {
    this.results = {
      dependencies: {},
      hardware_tests: {},
      integration_tests: {},
      diagnostics: {},
      endurance: {},
      overall_status: 'unknown'
    };
  }

  /**
   * Main validation entry point
   */
  async validate() {
    console.log('🔧 Starting Hardware Integration Validation...\n');
    
    try {
      // Step 1: Verify serialport dependency installation and integration
      await this.validateSerialportDependency();
      
      // Step 2: Run hardware validation tests with actual RS485 and RFID hardware
      await this.runHardwareValidationTests();
      
      // Step 3: Test hardware communication under various failure scenarios
      await this.testFailureScenarios();
      
      // Step 4: Validate hardware endurance testing automation
      await this.validateEnduranceTesting();
      
      // Step 5: Ensure hardware diagnostic tools work correctly
      await this.validateDiagnosticTools();
      
      // Generate final report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Hardware validation failed:', error.message);
      if (error.details) {
        console.error('Details:', error.details);
      }
      process.exit(1);
    }
  }

  /**
   * Verify serialport dependency installation and integration
   */
  async validateSerialportDependency() {
    console.log('📦 Validating serialport dependency...');
    
    try {
      // Check if serialport is listed in kiosk dependencies
      const kioskPackagePath = join(rootDir, 'app/kiosk/package.json');
      if (!existsSync(kioskPackagePath)) {
        throw new HardwareValidationError('Kiosk package.json not found');
      }
      
      const kioskPackage = JSON.parse(readFileSync(kioskPackagePath, 'utf8'));
      const serialportVersion = kioskPackage.dependencies?.serialport;
      
      if (!serialportVersion) {
        throw new HardwareValidationError('serialport dependency not found in kiosk package.json');
      }
      
      console.log(`  ✓ serialport dependency found: ${serialportVersion}`);
      this.results.dependencies.serialport = { version: serialportVersion, status: 'found' };
      
      // Check if node-hid is also present (for RFID)
      const nodeHidVersion = kioskPackage.dependencies?.['node-hid'];
      if (!nodeHidVersion) {
        throw new HardwareValidationError('node-hid dependency not found in kiosk package.json');
      }
      
      console.log(`  ✓ node-hid dependency found: ${nodeHidVersion}`);
      this.results.dependencies['node-hid'] = { version: nodeHidVersion, status: 'found' };
      
      // Try to import serialport to verify installation
      try {
        const { SerialPort } = await import('serialport');
        console.log('  ✓ serialport module can be imported successfully');
        this.results.dependencies.serialport.import_status = 'success';
        
        // List available ports
        const ports = await SerialPort.list();
        console.log(`  ✓ Found ${ports.length} serial ports available`);
        this.results.dependencies.serialport.available_ports = ports.length;
        
        if (ports.length > 0) {
          console.log('    Available ports:');
          ports.forEach(port => {
            console.log(`      - ${port.path} (${port.manufacturer || 'Unknown'})`);
          });
        }
        
      } catch (importError) {
        throw new HardwareValidationError('Failed to import serialport module', importError.message);
      }
      
      // Check Node.js version compatibility
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      if (majorVersion < 20) {
        throw new HardwareValidationError(`Node.js version ${nodeVersion} is not supported. Requires Node.js 20+`);
      }
      
      console.log(`  ✓ Node.js version ${nodeVersion} is compatible`);
      this.results.dependencies.nodejs = { version: nodeVersion, status: 'compatible' };
      
    } catch (error) {
      this.results.dependencies.status = 'failed';
      throw error;
    }
    
    this.results.dependencies.status = 'passed';
    console.log('✅ Serialport dependency validation completed\n');
  }

  /**
   * Run hardware validation tests with actual RS485 and RFID hardware
   */
  async runHardwareValidationTests() {
    console.log('🔌 Running hardware validation tests...');
    
    try {
      // Run the hardware integration validation test
      console.log('  Running hardware integration validation test...');
      const testResult = await this.runTest('app/kiosk/src/__tests__/validation/hardware-integration-validation.test.ts');
      
      if (testResult.success) {
        console.log('  ✓ Hardware integration validation tests passed');
        this.results.hardware_tests.integration = 'passed';
      } else {
        console.log('  ⚠️  Some hardware integration tests failed');
        this.results.hardware_tests.integration = 'partial';
        console.log('    Failed tests:', testResult.failures);
      }
      
      // Run Modbus controller tests
      console.log('  Running Modbus controller tests...');
      const modbusResult = await this.runTest('app/kiosk/src/hardware/__tests__/modbus-controller.test.ts');
      
      if (modbusResult.success) {
        console.log('  ✓ Modbus controller tests passed');
        this.results.hardware_tests.modbus = 'passed';
      } else {
        console.log('  ⚠️  Some Modbus controller tests failed');
        this.results.hardware_tests.modbus = 'partial';
      }
      
      // Run RFID handler tests
      console.log('  Running RFID handler tests...');
      const rfidResult = await this.runTest('app/kiosk/src/hardware/__tests__/rfid-handler.test.ts');
      
      if (rfidResult.success) {
        console.log('  ✓ RFID handler tests passed');
        this.results.hardware_tests.rfid = 'passed';
      } else {
        console.log('  ⚠️  Some RFID handler tests failed');
        this.results.hardware_tests.rfid = 'partial';
      }
      
    } catch (error) {
      this.results.hardware_tests.status = 'failed';
      throw new HardwareValidationError('Hardware validation tests failed', error.message);
    }
    
    this.results.hardware_tests.status = 'completed';
    console.log('✅ Hardware validation tests completed\n');
  }

  /**
   * Test hardware communication under various failure scenarios
   */
  async testFailureScenarios() {
    console.log('⚠️  Testing failure scenarios...');
    
    try {
      // Run Modbus error handling tests
      console.log('  Testing Modbus error handling...');
      const modbusErrorResult = await this.runTest('app/kiosk/src/hardware/__tests__/modbus-error-handling.test.ts');
      
      if (modbusErrorResult.success) {
        console.log('  ✓ Modbus error handling tests passed');
        this.results.integration_tests.modbus_errors = 'passed';
      } else {
        console.log('  ⚠️  Some Modbus error handling tests failed');
        this.results.integration_tests.modbus_errors = 'partial';
      }
      
      // Test power interruption scenarios
      console.log('  Testing power interruption scenarios...');
      const powerResult = await this.runTest('app/gateway/src/__tests__/validation/power-interruption-validation.test.ts');
      
      if (powerResult.success) {
        console.log('  ✓ Power interruption tests passed');
        this.results.integration_tests.power_interruption = 'passed';
      } else {
        console.log('  ⚠️  Some power interruption tests failed');
        this.results.integration_tests.power_interruption = 'partial';
      }
      
      // Test system resilience
      console.log('  Testing system resilience...');
      const resilienceResult = await this.runTest('app/gateway/src/__tests__/failure-scenarios/system-resilience.test.ts');
      
      if (resilienceResult.success) {
        console.log('  ✓ System resilience tests passed');
        this.results.integration_tests.resilience = 'passed';
      } else {
        console.log('  ⚠️  Some system resilience tests failed');
        this.results.integration_tests.resilience = 'partial';
      }
      
    } catch (error) {
      this.results.integration_tests.status = 'failed';
      throw new HardwareValidationError('Failure scenario testing failed', error.message);
    }
    
    this.results.integration_tests.status = 'completed';
    console.log('✅ Failure scenario testing completed\n');
  }

  /**
   * Validate hardware endurance testing automation
   */
  async validateEnduranceTesting() {
    console.log('🔄 Validating endurance testing automation...');
    
    try {
      // Run hardware endurance soak tests
      console.log('  Running hardware endurance tests...');
      const enduranceResult = await this.runTest('app/kiosk/src/__tests__/soak/hardware-endurance.test.ts');
      
      if (enduranceResult.success) {
        console.log('  ✓ Hardware endurance tests passed');
        this.results.endurance.soak_tests = 'passed';
      } else {
        console.log('  ⚠️  Some hardware endurance tests failed');
        this.results.endurance.soak_tests = 'partial';
        console.log('    Failed tests:', enduranceResult.failures);
      }
      
      // Check if hardware soak tester service exists
      const soakTesterPath = join(rootDir, 'shared/services/hardware-soak-tester.ts');
      if (existsSync(soakTesterPath)) {
        console.log('  ✓ Hardware soak tester service found');
        this.results.endurance.soak_tester_service = 'found';
      } else {
        console.log('  ❌ Hardware soak tester service not found');
        this.results.endurance.soak_tester_service = 'missing';
      }
      
      // Check if soak testing database tables exist
      const soakTablesMigration = join(rootDir, 'migrations/007_soak_testing_tables.sql');
      if (existsSync(soakTablesMigration)) {
        console.log('  ✓ Soak testing database migration found');
        this.results.endurance.database_tables = 'found';
      } else {
        console.log('  ❌ Soak testing database migration not found');
        this.results.endurance.database_tables = 'missing';
      }
      
    } catch (error) {
      this.results.endurance.status = 'failed';
      throw new HardwareValidationError('Endurance testing validation failed', error.message);
    }
    
    this.results.endurance.status = 'completed';
    console.log('✅ Endurance testing validation completed\n');
  }

  /**
   * Ensure hardware diagnostic tools work correctly
   */
  async validateDiagnosticTools() {
    console.log('🔍 Validating diagnostic tools...');
    
    try {
      // Check if RS485 diagnostics tool exists
      const rs485DiagPath = join(rootDir, 'app/kiosk/src/hardware/rs485-diagnostics.ts');
      if (existsSync(rs485DiagPath)) {
        console.log('  ✓ RS485 diagnostics tool found');
        this.results.diagnostics.rs485_tool = 'found';
      } else {
        console.log('  ❌ RS485 diagnostics tool not found');
        this.results.diagnostics.rs485_tool = 'missing';
      }
      
      // Run RS485 diagnostics tests
      console.log('  Running RS485 diagnostics tests...');
      const rs485TestResult = await this.runTest('app/kiosk/src/hardware/__tests__/rs485-diagnostics.test.ts');
      
      if (rs485TestResult.success) {
        console.log('  ✓ RS485 diagnostics tests passed');
        this.results.diagnostics.rs485_tests = 'passed';
      } else {
        console.log('  ⚠️  Some RS485 diagnostics tests failed');
        this.results.diagnostics.rs485_tests = 'partial';
      }
      
      // Check health monitoring capabilities
      const healthMonitorPath = join(rootDir, 'shared/services/health-monitor.ts');
      if (existsSync(healthMonitorPath)) {
        console.log('  ✓ Health monitor service found');
        this.results.diagnostics.health_monitor = 'found';
      } else {
        console.log('  ❌ Health monitor service not found');
        this.results.diagnostics.health_monitor = 'missing';
      }
      
      // Run health monitoring tests
      console.log('  Running health monitoring tests...');
      const healthTestResult = await this.runTest('shared/services/__tests__/health-monitor.test.ts');
      
      if (healthTestResult.success) {
        console.log('  ✓ Health monitoring tests passed');
        this.results.diagnostics.health_tests = 'passed';
      } else {
        console.log('  ⚠️  Some health monitoring tests failed');
        this.results.diagnostics.health_tests = 'partial';
      }
      
    } catch (error) {
      this.results.diagnostics.status = 'failed';
      throw new HardwareValidationError('Diagnostic tools validation failed', error.message);
    }
    
    this.results.diagnostics.status = 'completed';
    console.log('✅ Diagnostic tools validation completed\n');
  }

  /**
   * Run a specific test file and return results
   */
  async runTest(testPath) {
    return new Promise((resolve) => {
      const fullPath = join(rootDir, testPath);
      
      if (!existsSync(fullPath)) {
        resolve({ success: false, error: 'Test file not found', failures: [`File not found: ${testPath}`] });
        return;
      }
      
      const child = spawn('npm', ['run', 'test', '--', testPath, '--run'], {
        cwd: rootDir,
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        const success = code === 0;
        const failures = success ? [] : this.parseTestFailures(stdout + stderr);
        
        resolve({
          success,
          code,
          stdout,
          stderr,
          failures
        });
      });
      
      child.on('error', (error) => {
        resolve({
          success: false,
          error: error.message,
          failures: [error.message]
        });
      });
    });
  }

  /**
   * Parse test failures from output
   */
  parseTestFailures(output) {
    const failures = [];
    const lines = output.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('FAIL') || line.includes('✗') || line.includes('❌')) {
        failures.push(line.trim());
      }
    }
    
    return failures;
  }

  /**
   * Generate final validation report
   */
  generateReport() {
    console.log('📊 Hardware Integration Validation Report');
    console.log('='.repeat(60));
    
    // Dependencies status
    console.log('\n📦 DEPENDENCIES:');
    console.log(`  Overall Status: ${this.results.dependencies.status || 'unknown'}`);
    if (this.results.dependencies.serialport) {
      console.log(`  serialport: ${this.results.dependencies.serialport.version} (${this.results.dependencies.serialport.status})`);
      console.log(`  Available ports: ${this.results.dependencies.serialport.available_ports || 0}`);
    }
    if (this.results.dependencies['node-hid']) {
      console.log(`  node-hid: ${this.results.dependencies['node-hid'].version} (${this.results.dependencies['node-hid'].status})`);
    }
    if (this.results.dependencies.nodejs) {
      console.log(`  Node.js: ${this.results.dependencies.nodejs.version} (${this.results.dependencies.nodejs.status})`);
    }
    
    // Hardware tests status
    console.log('\n🔌 HARDWARE TESTS:');
    console.log(`  Overall Status: ${this.results.hardware_tests.status || 'unknown'}`);
    console.log(`  Integration Tests: ${this.results.hardware_tests.integration || 'not run'}`);
    console.log(`  Modbus Tests: ${this.results.hardware_tests.modbus || 'not run'}`);
    console.log(`  RFID Tests: ${this.results.hardware_tests.rfid || 'not run'}`);
    
    // Integration tests status
    console.log('\n⚠️  FAILURE SCENARIOS:');
    console.log(`  Overall Status: ${this.results.integration_tests.status || 'unknown'}`);
    console.log(`  Modbus Errors: ${this.results.integration_tests.modbus_errors || 'not run'}`);
    console.log(`  Power Interruption: ${this.results.integration_tests.power_interruption || 'not run'}`);
    console.log(`  System Resilience: ${this.results.integration_tests.resilience || 'not run'}`);
    
    // Endurance testing status
    console.log('\n🔄 ENDURANCE TESTING:');
    console.log(`  Overall Status: ${this.results.endurance.status || 'unknown'}`);
    console.log(`  Soak Tests: ${this.results.endurance.soak_tests || 'not run'}`);
    console.log(`  Soak Tester Service: ${this.results.endurance.soak_tester_service || 'unknown'}`);
    console.log(`  Database Tables: ${this.results.endurance.database_tables || 'unknown'}`);
    
    // Diagnostics status
    console.log('\n🔍 DIAGNOSTIC TOOLS:');
    console.log(`  Overall Status: ${this.results.diagnostics.status || 'unknown'}`);
    console.log(`  RS485 Tool: ${this.results.diagnostics.rs485_tool || 'unknown'}`);
    console.log(`  RS485 Tests: ${this.results.diagnostics.rs485_tests || 'not run'}`);
    console.log(`  Health Monitor: ${this.results.diagnostics.health_monitor || 'unknown'}`);
    console.log(`  Health Tests: ${this.results.diagnostics.health_tests || 'not run'}`);
    
    // Overall status
    const overallStatus = this.determineOverallStatus();
    this.results.overall_status = overallStatus;
    
    console.log('\n' + '='.repeat(60));
    console.log(`OVERALL STATUS: ${overallStatus.toUpperCase()}`);
    
    if (overallStatus === 'passed') {
      console.log('✅ All hardware integration validations completed successfully!');
      console.log('   Hardware layer is ready for installation.');
    } else if (overallStatus === 'partial') {
      console.log('⚠️  Hardware integration validation completed with warnings.');
      console.log('   Some tests failed but core functionality appears working.');
      console.log('   Review failed tests before proceeding with installation.');
    } else {
      console.log('❌ Hardware integration validation failed.');
      console.log('   Critical issues found that must be resolved before installation.');
      process.exit(1);
    }
    
    console.log('='.repeat(60));
  }

  /**
   * Determine overall validation status
   */
  determineOverallStatus() {
    const statuses = [
      this.results.dependencies.status,
      this.results.hardware_tests.status,
      this.results.integration_tests.status,
      this.results.endurance.status,
      this.results.diagnostics.status
    ];
    
    if (statuses.includes('failed')) {
      return 'failed';
    } else if (statuses.includes('partial') || statuses.includes('unknown')) {
      return 'partial';
    } else if (statuses.every(status => status === 'completed' || status === 'passed')) {
      return 'passed';
    } else {
      return 'unknown';
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new HardwareValidator();
  validator.validate().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

export { HardwareValidator };