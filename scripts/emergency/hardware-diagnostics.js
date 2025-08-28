#!/usr/bin/env node

/**
 * Hardware Diagnostics CLI Tool
 * Interactive tool for validating RS485 and RFID hardware
 * Task 16.4 - Hardware diagnostic tools validation
 */

import { SerialPort } from 'serialport';
import { createInterface } from 'readline';
import { RS485Diagnostics } from '../app/kiosk/src/hardware/rs485-diagnostics.js';
import { ModbusController } from '../app/kiosk/src/hardware/modbus-controller.js';
import { RfidHandler } from '../app/kiosk/src/hardware/rfid-handler.js';

class HardwareDiagnosticsCLI {
  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.rs485Diagnostics = null;
    this.modbusController = null;
    this.rfidHandler = null;
  }

  /**
   * Main CLI entry point
   */
  async run() {
    console.log('🔧 Hardware Diagnostics Tool');
    console.log('=' .repeat(50));
    console.log('This tool helps validate RS485 and RFID hardware integration');
    console.log('');

    try {
      while (true) {
        await this.showMainMenu();
      }
    } catch (error) {
      if (error.message !== 'EXIT') {
        console.error('Error:', error.message);
      }
    } finally {
      await this.cleanup();
      this.rl.close();
    }
  }

  /**
   * Show main menu and handle user selection
   */
  async showMainMenu() {
    console.log('\n📋 Main Menu:');
    console.log('1. List Serial Ports');
    console.log('2. RS485 Diagnostics');
    console.log('3. Modbus Testing');
    console.log('4. RFID Testing');
    console.log('5. Full Hardware Validation');
    console.log('6. Exit');
    console.log('');

    const choice = await this.prompt('Select option (1-6): ');

    switch (choice.trim()) {
      case '1':
        await this.listSerialPorts();
        break;
      case '2':
        await this.runRS485Diagnostics();
        break;
      case '3':
        await this.runModbusTesting();
        break;
      case '4':
        await this.runRFIDTesting();
        break;
      case '5':
        await this.runFullValidation();
        break;
      case '6':
        console.log('Goodbye!');
        throw new Error('EXIT');
      default:
        console.log('Invalid option. Please select 1-6.');
    }
  }

  /**
   * List available serial ports
   */
  async listSerialPorts() {
    console.log('\n📡 Scanning for Serial Ports...');
    
    try {
      const ports = await SerialPort.list();
      
      if (ports.length === 0) {
        console.log('❌ No serial ports found');
        return;
      }

      console.log(`✅ Found ${ports.length} serial port(s):`);
      console.log('');

      ports.forEach((port, index) => {
        console.log(`${index + 1}. ${port.path}`);
        if (port.manufacturer) console.log(`   Manufacturer: ${port.manufacturer}`);
        if (port.serialNumber) console.log(`   Serial Number: ${port.serialNumber}`);
        if (port.vendorId) console.log(`   Vendor ID: ${port.vendorId}`);
        if (port.productId) console.log(`   Product ID: ${port.productId}`);
        console.log('');
      });

    } catch (error) {
      console.error('❌ Failed to list serial ports:', error.message);
    }
  }

  /**
   * Run RS485 diagnostics
   */
  async runRS485Diagnostics() {
    console.log('\n🔍 RS485 Diagnostics');
    console.log('-'.repeat(30));

    try {
      // Get port selection
      const ports = await SerialPort.list();
      if (ports.length === 0) {
        console.log('❌ No serial ports available for RS485 testing');
        return;
      }

      console.log('Available ports:');
      ports.forEach((port, index) => {
        console.log(`${index + 1}. ${port.path}`);
      });

      const portChoice = await this.prompt('Select port number: ');
      const portIndex = parseInt(portChoice) - 1;

      if (portIndex < 0 || portIndex >= ports.length) {
        console.log('❌ Invalid port selection');
        return;
      }

      const selectedPort = ports[portIndex];
      console.log(`\nUsing port: ${selectedPort.path}`);

      // Initialize RS485 diagnostics
      this.rs485Diagnostics = new RS485Diagnostics({
        port: selectedPort.path,
        baudrate: 9600,
        timeout_ms: 2000
      });

      console.log('Initializing RS485 connection...');
      await this.rs485Diagnostics.initialize();

      // Run diagnostics
      console.log('Running comprehensive diagnostics...');
      const report = await this.rs485Diagnostics.runDiagnostics();

      // Display formatted report
      console.log('\n' + this.rs485Diagnostics.formatReport(report));

      // Save report option
      const saveReport = await this.prompt('Save report to file? (y/n): ');
      if (saveReport.toLowerCase() === 'y') {
        const fs = await import('fs');
        const filename = `rs485-diagnostics-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        fs.writeFileSync(filename, this.rs485Diagnostics.formatReport(report));
        console.log(`Report saved to: ${filename}`);
      }

    } catch (error) {
      console.error('❌ RS485 diagnostics failed:', error.message);
    } finally {
      if (this.rs485Diagnostics) {
        await this.rs485Diagnostics.close();
        this.rs485Diagnostics = null;
      }
    }
  }

  /**
   * Run Modbus testing
   */
  async runModbusTesting() {
    console.log('\n⚡ Modbus Testing');
    console.log('-'.repeat(30));

    try {
      // Get port selection
      const ports = await SerialPort.list();
      if (ports.length === 0) {
        console.log('❌ No serial ports available for Modbus testing');
        return;
      }

      console.log('Available ports:');
      ports.forEach((port, index) => {
        console.log(`${index + 1}. ${port.path}`);
      });

      const portChoice = await this.prompt('Select port number: ');
      const portIndex = parseInt(portChoice) - 1;

      if (portIndex < 0 || portIndex >= ports.length) {
        console.log('❌ Invalid port selection');
        return;
      }

      const selectedPort = ports[portIndex];
      console.log(`\nUsing port: ${selectedPort.path}`);

      // Initialize Modbus controller
      this.modbusController = new ModbusController({
        port: selectedPort.path,
        baudRate: 9600,
        timeout: 2000,
        mock: false
      });

      console.log('Initializing Modbus controller...');
      await this.modbusController.initialize();

      // Modbus testing menu
      while (true) {
        console.log('\nModbus Test Options:');
        console.log('1. Test Single Channel');
        console.log('2. Test All Channels (1-16)');
        console.log('3. Test Pulse Timing');
        console.log('4. Test Burst Opening');
        console.log('5. Connection Status');
        console.log('6. Back to Main Menu');

        const testChoice = await this.prompt('Select test (1-6): ');

        switch (testChoice.trim()) {
          case '1':
            await this.testSingleChannel();
            break;
          case '2':
            await this.testAllChannels();
            break;
          case '3':
            await this.testPulseTiming();
            break;
          case '4':
            await this.testBurstOpening();
            break;
          case '5':
            await this.showConnectionStatus();
            break;
          case '6':
            return;
          default:
            console.log('Invalid option. Please select 1-6.');
        }
      }

    } catch (error) {
      console.error('❌ Modbus testing failed:', error.message);
    } finally {
      if (this.modbusController) {
        await this.modbusController.close();
        this.modbusController = null;
      }
    }
  }

  /**
   * Test single Modbus channel
   */
  async testSingleChannel() {
    const channel = await this.prompt('Enter channel number (1-30): ');
    const channelNum = parseInt(channel);

    if (channelNum < 1 || channelNum > 30) {
      console.log('❌ Invalid channel number. Must be 1-30.');
      return;
    }

    console.log(`Testing channel ${channelNum}...`);
    const startTime = Date.now();

    try {
      const result = await this.modbusController.sendPulse(channelNum, 400);
      const duration = Date.now() - startTime;

      if (result) {
        console.log(`✅ Channel ${channelNum} test successful (${duration}ms)`);
      } else {
        console.log(`❌ Channel ${channelNum} test failed (${duration}ms)`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ Channel ${channelNum} error: ${error.message} (${duration}ms)`);
    }
  }

  /**
   * Test all Modbus channels
   */
  async testAllChannels() {
    const channelCount = await this.prompt('Enter number of channels to test (1-30): ');
    const count = parseInt(channelCount);

    if (count < 1 || count > 30) {
      console.log('❌ Invalid channel count. Must be 1-30.');
      return;
    }

    console.log(`Testing channels 1-${count}...`);
    const results = [];

    for (let channel = 1; channel <= count; channel++) {
      console.log(`Testing channel ${channel}/${count}...`);
      const startTime = Date.now();

      try {
        const result = await this.modbusController.sendPulse(channel, 400);
        const duration = Date.now() - startTime;
        
        results.push({
          channel,
          success: result,
          duration,
          error: null
        });

        console.log(`  ${result ? '✅' : '❌'} Channel ${channel}: ${result} (${duration}ms)`);

      } catch (error) {
        const duration = Date.now() - startTime;
        results.push({
          channel,
          success: false,
          duration,
          error: error.message
        });

        console.log(`  ❌ Channel ${channel}: ${error.message} (${duration}ms)`);
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    console.log('\n📊 Test Summary:');
    console.log(`  Successful: ${successful}/${results.length}`);
    console.log(`  Failed: ${failed}/${results.length}`);
    console.log(`  Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`);
    console.log(`  Average Duration: ${avgDuration.toFixed(1)}ms`);
  }

  /**
   * Test pulse timing accuracy
   */
  async testPulseTiming() {
    const channel = await this.prompt('Enter channel number (1-30): ');
    const channelNum = parseInt(channel);

    if (channelNum < 1 || channelNum > 30) {
      console.log('❌ Invalid channel number. Must be 1-30.');
      return;
    }

    const pulseMs = await this.prompt('Enter pulse duration in ms (100-2000): ');
    const pulseDuration = parseInt(pulseMs);

    if (pulseDuration < 100 || pulseDuration > 2000) {
      console.log('❌ Invalid pulse duration. Must be 100-2000ms.');
      return;
    }

    console.log(`Testing pulse timing: ${pulseDuration}ms on channel ${channelNum}...`);
    const timings = [];

    for (let i = 0; i < 5; i++) {
      console.log(`Test ${i + 1}/5...`);
      const startTime = Date.now();

      try {
        await this.modbusController.sendPulse(channelNum, pulseDuration);
        const actualDuration = Date.now() - startTime;
        timings.push(actualDuration);
        
        const accuracy = Math.abs(actualDuration - pulseDuration);
        console.log(`  Actual: ${actualDuration}ms, Accuracy: ±${accuracy}ms`);

      } catch (error) {
        console.log(`  ❌ Test ${i + 1} failed: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (timings.length > 0) {
      const avgTiming = timings.reduce((a, b) => a + b) / timings.length;
      const minTiming = Math.min(...timings);
      const maxTiming = Math.max(...timings);
      const avgAccuracy = Math.abs(avgTiming - pulseDuration);

      console.log('\n📊 Timing Analysis:');
      console.log(`  Target Duration: ${pulseDuration}ms`);
      console.log(`  Average Actual: ${avgTiming.toFixed(1)}ms`);
      console.log(`  Range: ${minTiming}ms - ${maxTiming}ms`);
      console.log(`  Average Accuracy: ±${avgAccuracy.toFixed(1)}ms`);
    }
  }

  /**
   * Test burst opening functionality
   */
  async testBurstOpening() {
    const channel = await this.prompt('Enter channel number (1-30): ');
    const channelNum = parseInt(channel);

    if (channelNum < 1 || channelNum > 30) {
      console.log('❌ Invalid channel number. Must be 1-30.');
      return;
    }

    console.log(`Testing burst opening on channel ${channelNum}...`);
    console.log('This will perform 10 seconds of burst opening with 2-second intervals');
    
    const confirm = await this.prompt('Continue? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      return;
    }

    const startTime = Date.now();

    try {
      const result = await this.modbusController.performBurstOpening(channelNum);
      const duration = Date.now() - startTime;

      if (result) {
        console.log(`✅ Burst opening successful (${duration}ms)`);
      } else {
        console.log(`❌ Burst opening failed (${duration}ms)`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ Burst opening error: ${error.message} (${duration}ms)`);
    }
  }

  /**
   * Show Modbus connection status
   */
  async showConnectionStatus() {
    try {
      const status = this.modbusController.getConnectionStatus();
      
      console.log('\n📡 Connection Status:');
      console.log(`  Connected: ${status.connected ? '✅' : '❌'}`);
      console.log(`  Port: ${status.port || 'Unknown'}`);
      console.log(`  Baud Rate: ${status.baudRate || 'Unknown'}`);
      console.log(`  Error Count: ${status.errors || 0}`);
      
      if (status.lastError) {
        console.log(`  Last Error: ${status.lastError}`);
      }
      
      if (status.lastSuccessfulCommand) {
        console.log(`  Last Successful Command: ${status.lastSuccessfulCommand}`);
      }

    } catch (error) {
      console.log(`❌ Failed to get connection status: ${error.message}`);
    }
  }

  /**
   * Run RFID testing
   */
  async runRFIDTesting() {
    console.log('\n📱 RFID Testing');
    console.log('-'.repeat(30));

    try {
      // RFID mode selection
      console.log('RFID Reader Modes:');
      console.log('1. HID Mode (USB HID device)');
      console.log('2. Keyboard Mode (keyboard input simulation)');
      console.log('3. Mock Mode (for testing without hardware)');

      const modeChoice = await this.prompt('Select mode (1-3): ');
      let mode = 'hid';
      let mock = false;

      switch (modeChoice.trim()) {
        case '1':
          mode = 'hid';
          break;
        case '2':
          mode = 'keyboard';
          break;
        case '3':
          mode = 'hid';
          mock = true;
          break;
        default:
          console.log('❌ Invalid mode selection');
          return;
      }

      // Initialize RFID handler
      this.rfidHandler = new RfidHandler({
        mode: mode,
        mock: mock
      });

      console.log(`Initializing RFID handler in ${mock ? 'mock' : mode} mode...`);
      await this.rfidHandler.initialize();

      // Set up card scan handler
      const scannedCards = [];
      this.rfidHandler.onCardScanned = async (cardId) => {
        scannedCards.push({
          id: cardId,
          timestamp: new Date()
        });
        console.log(`📱 Card scanned: ${cardId} at ${new Date().toLocaleTimeString()}`);
      };

      // RFID testing menu
      while (true) {
        console.log('\nRFID Test Options:');
        console.log('1. Wait for Card Scan');
        console.log('2. Simulate Card Scan (mock mode only)');
        console.log('3. Test UID Standardization');
        console.log('4. Show Scan History');
        console.log('5. RFID Health Status');
        console.log('6. Back to Main Menu');

        const testChoice = await this.prompt('Select test (1-6): ');

        switch (testChoice.trim()) {
          case '1':
            await this.waitForCardScan();
            break;
          case '2':
            if (mock) {
              await this.simulateCardScan();
            } else {
              console.log('❌ Simulation only available in mock mode');
            }
            break;
          case '3':
            await this.testUIDStandardization();
            break;
          case '4':
            this.showScanHistory(scannedCards);
            break;
          case '5':
            await this.showRFIDHealth();
            break;
          case '6':
            return;
          default:
            console.log('Invalid option. Please select 1-6.');
        }
      }

    } catch (error) {
      console.error('❌ RFID testing failed:', error.message);
    } finally {
      if (this.rfidHandler) {
        await this.rfidHandler.close();
        this.rfidHandler = null;
      }
    }
  }

  /**
   * Wait for RFID card scan
   */
  async waitForCardScan() {
    console.log('\n📱 Waiting for RFID card scan...');
    console.log('Please scan an RFID card (press Enter to cancel)');

    let scanReceived = false;
    const originalHandler = this.rfidHandler.onCardScanned;

    // Temporary handler to detect scan
    this.rfidHandler.onCardScanned = async (cardId) => {
      scanReceived = true;
      console.log(`✅ Card detected: ${cardId}`);
      
      // Call original handler
      if (originalHandler) {
        await originalHandler(cardId);
      }
    };

    // Wait for scan or user cancellation
    await new Promise((resolve) => {
      const checkForInput = () => {
        process.stdin.once('data', () => {
          if (!scanReceived) {
            console.log('Scan cancelled by user');
          }
          resolve();
        });
      };

      const checkForScan = setInterval(() => {
        if (scanReceived) {
          clearInterval(checkForScan);
          resolve();
        }
      }, 100);

      checkForInput();
    });

    // Restore original handler
    this.rfidHandler.onCardScanned = originalHandler;
  }

  /**
   * Simulate RFID card scan (mock mode only)
   */
  async simulateCardScan() {
    const cardId = await this.prompt('Enter card ID to simulate: ');
    
    if (!cardId.trim()) {
      console.log('❌ Invalid card ID');
      return;
    }

    console.log(`Simulating card scan: ${cardId}`);
    
    try {
      await this.rfidHandler.simulateCardScan(cardId);
      console.log('✅ Card scan simulation completed');
    } catch (error) {
      console.log(`❌ Simulation failed: ${error.message}`);
    }
  }

  /**
   * Test UID standardization
   */
  async testUIDStandardization() {
    console.log('\n🔧 Testing UID Standardization');
    
    const testUIDs = [
      '04:52:7A:B2:3C:80',
      '04527AB23C80',
      '04 52 7A B2 3C 80',
      '04-52-7A-B2-3C-80',
      '0452:7AB2:3C80'
    ];

    console.log('Testing various UID formats:');
    
    testUIDs.forEach(uid => {
      const standardized = this.rfidHandler.standardizeUID(uid);
      console.log(`  ${uid.padEnd(20)} → ${standardized}`);
    });

    // Test custom UID
    const customUID = await this.prompt('\nEnter custom UID to test (or press Enter to skip): ');
    if (customUID.trim()) {
      try {
        const standardized = this.rfidHandler.standardizeUID(customUID);
        console.log(`  ${customUID.padEnd(20)} → ${standardized}`);
      } catch (error) {
        console.log(`❌ Invalid UID format: ${error.message}`);
      }
    }
  }

  /**
   * Show RFID scan history
   */
  showScanHistory(scannedCards) {
    console.log('\n📋 RFID Scan History');
    
    if (scannedCards.length === 0) {
      console.log('No cards scanned yet');
      return;
    }

    console.log(`Total scans: ${scannedCards.length}`);
    console.log('');

    scannedCards.slice(-10).forEach((scan, index) => {
      console.log(`${index + 1}. ${scan.id} at ${scan.timestamp.toLocaleString()}`);
    });

    if (scannedCards.length > 10) {
      console.log(`... and ${scannedCards.length - 10} more`);
    }
  }

  /**
   * Show RFID health status
   */
  async showRFIDHealth() {
    try {
      const health = await this.rfidHandler.getHealthStatus();
      
      console.log('\n🏥 RFID Health Status:');
      console.log(`  Status: ${health.status === 'ok' ? '✅' : '❌'} ${health.status}`);
      console.log(`  Mode: ${health.mode || 'Unknown'}`);
      console.log(`  Scan Count: ${health.scan_count || 0}`);
      
      if (health.last_scan) {
        console.log(`  Last Scan: ${new Date(health.last_scan).toLocaleString()}`);
      }
      
      if (health.last_error) {
        console.log(`  Last Error: ${health.last_error}`);
      }

    } catch (error) {
      console.log(`❌ Failed to get RFID health status: ${error.message}`);
    }
  }

  /**
   * Run full hardware validation
   */
  async runFullValidation() {
    console.log('\n🔍 Full Hardware Validation');
    console.log('=' .repeat(50));
    console.log('This will run comprehensive tests on all hardware components');
    console.log('');

    const confirm = await this.prompt('Continue with full validation? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      return;
    }

    const results = {
      serialPorts: false,
      rs485: false,
      modbus: false,
      rfid: false
    };

    // Test 1: Serial Ports
    console.log('\n1️⃣  Testing Serial Port Detection...');
    try {
      const ports = await SerialPort.list();
      results.serialPorts = ports.length > 0;
      console.log(`${results.serialPorts ? '✅' : '❌'} Found ${ports.length} serial ports`);
    } catch (error) {
      console.log(`❌ Serial port detection failed: ${error.message}`);
    }

    // Test 2: RS485 (if ports available)
    if (results.serialPorts) {
      console.log('\n2️⃣  Testing RS485 Communication...');
      try {
        const ports = await SerialPort.list();
        const testPort = ports[0];
        
        const rs485 = new RS485Diagnostics({
          port: testPort.path,
          baudrate: 9600,
          timeout_ms: 1000
        });

        await rs485.initialize();
        const scanResult = await rs485.scanBus(1, 3); // Quick scan
        await rs485.close();

        results.rs485 = true;
        console.log(`✅ RS485 communication test completed`);
        console.log(`   Scanned ${scanResult.total_addresses_scanned} addresses in ${scanResult.scan_duration_ms}ms`);
        
      } catch (error) {
        console.log(`❌ RS485 test failed: ${error.message}`);
      }
    }

    // Test 3: Modbus (if RS485 works)
    if (results.rs485) {
      console.log('\n3️⃣  Testing Modbus Controller...');
      try {
        const ports = await SerialPort.list();
        const testPort = ports[0];
        
        const modbus = new ModbusController({
          port: testPort.path,
          baudRate: 9600,
          timeout: 1000,
          mock: false
        });

        await modbus.initialize();
        
        // Test a single channel
        const testResult = await modbus.sendPulse(1, 200);
        await modbus.close();

        results.modbus = true;
        console.log(`✅ Modbus controller test completed`);
        console.log(`   Test pulse result: ${testResult}`);
        
      } catch (error) {
        console.log(`❌ Modbus test failed: ${error.message}`);
      }
    }

    // Test 4: RFID
    console.log('\n4️⃣  Testing RFID Handler...');
    try {
      const rfid = new RfidHandler({
        mode: 'hid',
        mock: true // Use mock for validation
      });

      await rfid.initialize();
      
      // Test UID standardization
      const testUID = '04:52:7A:B2:3C:80';
      const standardized = rfid.standardizeUID(testUID);
      
      await rfid.close();

      results.rfid = standardized.length === 12;
      console.log(`✅ RFID handler test completed`);
      console.log(`   UID standardization: ${testUID} → ${standardized}`);
      
    } catch (error) {
      console.log(`❌ RFID test failed: ${error.message}`);
    }

    // Summary
    console.log('\n📊 Validation Summary:');
    console.log('=' .repeat(30));
    console.log(`Serial Ports: ${results.serialPorts ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`RS485 Communication: ${results.rs485 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Modbus Controller: ${results.modbus ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`RFID Handler: ${results.rfid ? '✅ PASS' : '❌ FAIL'}`);

    const passCount = Object.values(results).filter(r => r).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`\nOverall: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
      console.log('🎉 All hardware validation tests passed!');
    } else if (passCount > 0) {
      console.log('⚠️  Some hardware validation tests failed');
    } else {
      console.log('❌ All hardware validation tests failed');
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.rs485Diagnostics) {
      await this.rs485Diagnostics.close();
    }
    if (this.modbusController) {
      await this.modbusController.close();
    }
    if (this.rfidHandler) {
      await this.rfidHandler.close();
    }
  }

  /**
   * Prompt user for input
   */
  prompt(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new HardwareDiagnosticsCLI();
  cli.run().catch(error => {
    if (error.message !== 'EXIT') {
      console.error('CLI Error:', error);
      process.exit(1);
    }
  });
}

export { HardwareDiagnosticsCLI };