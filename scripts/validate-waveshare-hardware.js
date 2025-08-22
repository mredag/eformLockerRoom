#!/usr/bin/env node

/**
 * Waveshare Hardware Validation Script
 * Specifically tests Waveshare 16CH Modbus RTU Relay compatibility
 */

import { SerialPort } from 'serialport';
import { ModbusController } from '../app/kiosk/src/hardware/modbus-controller.ts';

class WaveshareValidator {
  constructor() {
    this.results = {
      port_detection: false,
      communication: false,
      address_scan: [],
      function_codes: {
        read_coils: false,
        write_single_coil: false,
        write_multiple_coils: false
      },
      timing_accuracy: [],
      multi_card_test: false
    };
  }

  async validate() {
    console.log('🔧 Waveshare 16CH Modbus RTU Relay Validation');
    console.log('=' .repeat(60));
    console.log('');

    try {
      await this.testPortDetection();
      await this.testCommunication();
      await this.testAddressScanning();
      await this.testFunctionCodes();
      await this.testTimingAccuracy();
      await this.testMultiCardOperation();
      
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  async testPortDetection() {
    console.log('1️⃣  Testing USB-RS485 Port Detection...');
    
    try {
      const ports = await SerialPort.list();
      const rs485Ports = ports.filter(port => 
        port.manufacturer?.toLowerCase().includes('ftdi') ||
        port.manufacturer?.toLowerCase().includes('prolific') ||
        port.manufacturer?.toLowerCase().includes('ch340') ||
        port.path.includes('ttyUSB')
      );

      if (rs485Ports.length > 0) {
        this.results.port_detection = true;
        console.log(`✅ Found ${rs485Ports.length} potential RS485 port(s):`);
        rs485Ports.forEach(port => {
          console.log(`   - ${port.path} (${port.manufacturer || 'Unknown'})`);
        });
      } else {
        console.log('❌ No RS485 ports detected');
        console.log('   Available ports:');
        ports.forEach(port => {
          console.log(`   - ${port.path} (${port.manufacturer || 'Unknown'})`);
        });
      }
      
    } catch (error) {
      console.log(`❌ Port detection failed: ${error.message}`);
    }
    
    console.log('');
  }

  async testCommunication() {
    console.log('2️⃣  Testing Basic Modbus Communication...');
    
    try {
      const ports = await SerialPort.list();
      const testPort = ports.find(p => p.path.includes('ttyUSB')) || ports[0];
      
      if (!testPort) {
        console.log('❌ No test port available');
        return;
      }

      console.log(`   Using port: ${testPort.path}`);
      
      const controller = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 2000,
        pulse_duration_ms: 400,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: true,
        test_mode: true
      });

      await controller.initialize();
      
      // Test basic communication with address 1
      const testResult = await controller.sendPulse(1, 200, 1);
      
      await controller.close();
      
      this.results.communication = testResult;
      console.log(`${testResult ? '✅' : '❌'} Basic communication: ${testResult ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      console.log(`❌ Communication test failed: ${error.message}`);
    }
    
    console.log('');
  }

  async testAddressScanning() {
    console.log('3️⃣  Scanning for Waveshare Relay Cards...');
    
    try {
      const ports = await SerialPort.list();
      const testPort = ports.find(p => p.path.includes('ttyUSB')) || ports[0];
      
      if (!testPort) {
        console.log('❌ No test port available');
        return;
      }

      const controller = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 1000,
        pulse_duration_ms: 400,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: true,
        test_mode: true
      });

      await controller.initialize();
      
      console.log('   Scanning addresses 1-10...');
      const activeSlaves = await controller.scanBus(1, 10);
      
      await controller.close();
      
      this.results.address_scan = activeSlaves;
      
      if (activeSlaves.length > 0) {
        console.log(`✅ Found ${activeSlaves.length} active relay card(s):`);
        activeSlaves.forEach(addr => {
          console.log(`   - Slave Address: ${addr}`);
        });
      } else {
        console.log('❌ No relay cards detected');
        console.log('   Check DIP switch configuration and wiring');
      }
      
    } catch (error) {
      console.log(`❌ Address scanning failed: ${error.message}`);
    }
    
    console.log('');
  }

  async testFunctionCodes() {
    console.log('4️⃣  Testing Modbus Function Codes...');
    
    try {
      const ports = await SerialPort.list();
      const testPort = ports.find(p => p.path.includes('ttyUSB')) || ports[0];
      
      if (!testPort) {
        console.log('❌ No test port available');
        return;
      }

      // Test Write Multiple Coils (0x0F) - Waveshare preferred
      console.log('   Testing Write Multiple Coils (0x0F)...');
      const controller1 = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 1000,
        pulse_duration_ms: 200,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: true,
        test_mode: true
      });

      await controller1.initialize();
      const multipleCoilsResult = await controller1.writeMultipleRelays(1, 0, [true]);
      await new Promise(resolve => setTimeout(resolve, 200));
      await controller1.writeMultipleRelays(1, 0, [false]);
      await controller1.close();

      this.results.function_codes.write_multiple_coils = multipleCoilsResult;
      console.log(`   ${multipleCoilsResult ? '✅' : '❌'} Write Multiple Coils: ${multipleCoilsResult ? 'SUCCESS' : 'FAILED'}`);

      // Test Write Single Coil (0x05) - fallback method
      console.log('   Testing Write Single Coil (0x05)...');
      const controller2 = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 1000,
        pulse_duration_ms: 200,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: false, // Force single coil mode
        test_mode: true
      });

      await controller2.initialize();
      const singleCoilResult = await controller2.sendPulse(1, 200, 1);
      await controller2.close();

      this.results.function_codes.write_single_coil = singleCoilResult;
      console.log(`   ${singleCoilResult ? '✅' : '❌'} Write Single Coil: ${singleCoilResult ? 'SUCCESS' : 'FAILED'}`);

      // Test Read Coils (0x01)
      console.log('   Testing Read Coils (0x01)...');
      const controller3 = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 1000,
        pulse_duration_ms: 200,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: true,
        test_mode: true
      });

      await controller3.initialize();
      const readResult = await controller3.readRelayStatus(1, 0, 1);
      await controller3.close();

      this.results.function_codes.read_coils = Array.isArray(readResult);
      console.log(`   ${this.results.function_codes.read_coils ? '✅' : '❌'} Read Coils: ${this.results.function_codes.read_coils ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      console.log(`❌ Function code testing failed: ${error.message}`);
    }
    
    console.log('');
  }

  async testTimingAccuracy() {
    console.log('5️⃣  Testing Pulse Timing Accuracy...');
    
    try {
      const ports = await SerialPort.list();
      const testPort = ports.find(p => p.path.includes('ttyUSB')) || ports[0];
      
      if (!testPort) {
        console.log('❌ No test port available');
        return;
      }

      const controller = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 2000,
        pulse_duration_ms: 400,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: true,
        test_mode: true
      });

      await controller.initialize();
      
      const testDurations = [200, 400, 800, 1000];
      
      for (const targetDuration of testDurations) {
        console.log(`   Testing ${targetDuration}ms pulse...`);
        
        const timings = [];
        for (let i = 0; i < 3; i++) {
          const startTime = Date.now();
          await controller.sendPulse(1, targetDuration, 1);
          const actualDuration = Date.now() - startTime;
          timings.push(actualDuration);
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const avgTiming = timings.reduce((a, b) => a + b) / timings.length;
        const accuracy = Math.abs(avgTiming - targetDuration);
        const isAccurate = accuracy < 100; // Within 100ms tolerance
        
        this.results.timing_accuracy.push({
          target: targetDuration,
          actual: avgTiming,
          accuracy: accuracy,
          passed: isAccurate
        });
        
        console.log(`   ${isAccurate ? '✅' : '❌'} ${targetDuration}ms → ${avgTiming.toFixed(1)}ms (±${accuracy.toFixed(1)}ms)`);
      }
      
      await controller.close();
      
    } catch (error) {
      console.log(`❌ Timing accuracy test failed: ${error.message}`);
    }
    
    console.log('');
  }

  async testMultiCardOperation() {
    console.log('6️⃣  Testing Multi-Card Operation...');
    
    try {
      const ports = await SerialPort.list();
      const testPort = ports.find(p => p.path.includes('ttyUSB')) || ports[0];
      
      if (!testPort) {
        console.log('❌ No test port available');
        return;
      }

      const controller = new ModbusController({
        port: testPort.path,
        baudrate: 9600,
        timeout_ms: 1000,
        pulse_duration_ms: 200,
        burst_duration_seconds: 10,
        burst_interval_ms: 2000,
        command_interval_ms: 300,
        use_multiple_coils: true,
        test_mode: true
      });

      await controller.initialize();
      
      // Test addresses 1 and 2 (typical setup)
      const testAddresses = [1, 2];
      let successCount = 0;
      
      for (const address of testAddresses) {
        console.log(`   Testing relay card at address ${address}...`);
        
        try {
          const result = await controller.sendPulse(1, 200, address);
          if (result) {
            successCount++;
            console.log(`   ✅ Address ${address}: SUCCESS`);
          } else {
            console.log(`   ❌ Address ${address}: FAILED`);
          }
        } catch (error) {
          console.log(`   ❌ Address ${address}: ERROR - ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await controller.close();
      
      this.results.multi_card_test = successCount > 1;
      console.log(`   Multi-card result: ${successCount}/${testAddresses.length} cards responding`);
      
    } catch (error) {
      console.log(`❌ Multi-card test failed: ${error.message}`);
    }
    
    console.log('');
  }

  printSummary() {
    console.log('📊 Waveshare Validation Summary');
    console.log('=' .repeat(40));
    
    console.log(`Port Detection: ${this.results.port_detection ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Communication: ${this.results.communication ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Address Scan: ${this.results.address_scan.length > 0 ? '✅ PASS' : '❌ FAIL'} (${this.results.address_scan.length} cards)`);
    
    console.log('Function Codes:');
    console.log(`  - Read Coils (0x01): ${this.results.function_codes.read_coils ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  - Write Single (0x05): ${this.results.function_codes.write_single_coil ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  - Write Multiple (0x0F): ${this.results.function_codes.write_multiple_coils ? '✅ PASS' : '❌ FAIL'}`);
    
    const timingPassed = this.results.timing_accuracy.filter(t => t.passed).length;
    console.log(`Timing Accuracy: ${timingPassed === this.results.timing_accuracy.length ? '✅ PASS' : '❌ FAIL'} (${timingPassed}/${this.results.timing_accuracy.length})`);
    
    console.log(`Multi-Card Test: ${this.results.multi_card_test ? '✅ PASS' : '❌ FAIL'}`);
    
    const totalTests = 6;
    const passedTests = [
      this.results.port_detection,
      this.results.communication,
      this.results.address_scan.length > 0,
      Object.values(this.results.function_codes).some(v => v),
      timingPassed > 0,
      this.results.multi_card_test
    ].filter(Boolean).length;
    
    console.log('');
    console.log(`Overall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
      console.log('🎉 All Waveshare compatibility tests passed!');
      console.log('Your hardware is ready for the eForm Locker System.');
    } else if (passedTests >= 4) {
      console.log('⚠️  Most tests passed - system should work with minor issues');
    } else {
      console.log('❌ Multiple test failures - check hardware configuration');
      console.log('');
      console.log('Troubleshooting Tips:');
      console.log('- Verify DIP switch settings on relay cards');
      console.log('- Check RS485 wiring (A+, B-, GND)');
      console.log('- Ensure 12V power supply is connected');
      console.log('- Try different USB-RS485 converter');
    }
  }
}

// Run validation if called directly
const validator = new WaveshareValidator();
validator.validate().catch(error => {
  console.error('Validation Error:', error);
  process.exit(1);
});

export { WaveshareValidator };