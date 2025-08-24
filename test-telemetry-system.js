#!/usr/bin/env node

/**
 * Test script for the kiosk telemetry system
 * Tests the enhanced heartbeat endpoint with telemetry data
 */

const axios = require('axios');

const GATEWAY_URL = 'http://127.0.0.1:3000'; // Default gateway port

class TelemetrySystemTest {
  constructor() {
    this.testResults = [];
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async runTest(testName, testFn) {
    this.log(`🧪 Running test: ${testName}`);
    try {
      await testFn();
      this.log(`✅ ${testName} - PASSED`);
      this.testResults.push({ name: testName, status: 'PASSED' });
    } catch (error) {
      this.log(`❌ ${testName} - FAILED: ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
    }
  }

  async testBasicHeartbeatWithoutTelemetry() {
    // Register kiosk first
    await axios.post(`${GATEWAY_URL}/api/kiosk/register`, {
      kiosk_id: 'test-kiosk-telemetry-1',
      zone: 'test-zone',
      version: '1.0.0'
    });

    const response = await axios.post(`${GATEWAY_URL}/api/kiosk/heartbeat`, {
      kiosk_id: 'test-kiosk-telemetry-1',
      zone: 'test-zone',
      version: '1.0.0'
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error(`Heartbeat failed: ${response.data.error}`);
    }

    this.log('Basic heartbeat without telemetry successful');
  }

  async testHeartbeatWithValidTelemetry() {
    // Register kiosk first
    await axios.post(`${GATEWAY_URL}/api/kiosk/register`, {
      kiosk_id: 'test-kiosk-telemetry-2',
      zone: 'test-zone',
      version: '1.0.0'
    });

    const telemetryData = {
      voltage: {
        main_power: 12.5,
        backup_power: 12.0,
        rs485_line_a: 3.3,
        rs485_line_b: 1.2
      },
      system_status: {
        cpu_usage: 45,
        memory_usage: 60,
        disk_usage: 30,
        temperature: 35,
        uptime: 86400
      },
      hardware_status: {
        relay_board_connected: true,
        rfid_reader_connected: true,
        display_connected: true,
        network_connected: true
      },
      locker_status: {
        total_lockers: 20,
        available_lockers: 15,
        occupied_lockers: 4,
        error_lockers: 1
      }
    };

    const response = await axios.post(`${GATEWAY_URL}/api/kiosk/heartbeat`, {
      kiosk_id: 'test-kiosk-telemetry-2',
      zone: 'test-zone',
      version: '1.0.0',
      telemetry: telemetryData
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error(`Heartbeat with telemetry failed: ${response.data.error}`);
    }

    this.log('Heartbeat with valid telemetry successful');
  }

  async testHeartbeatWithInvalidTelemetry() {
    // Register kiosk first
    await axios.post(`${GATEWAY_URL}/api/kiosk/register`, {
      kiosk_id: 'test-kiosk-telemetry-3',
      zone: 'test-zone',
      version: '1.0.0'
    });

    const invalidTelemetryData = {
      voltage: {
        main_power: 'invalid_voltage', // Should be a number
        backup_power: -5 // Out of range
      },
      system_status: {
        cpu_usage: 150 // Out of range (0-100)
      }
    };

    try {
      const response = await axios.post(`${GATEWAY_URL}/api/kiosk/heartbeat`, {
        kiosk_id: 'test-kiosk-telemetry-3',
        zone: 'test-zone',
        version: '1.0.0',
        telemetry: invalidTelemetryData
      });

      if (response.status === 400 && !response.data.success) {
        this.log('Invalid telemetry correctly rejected');
        return;
      }

      throw new Error('Expected invalid telemetry to be rejected with 400 status');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        this.log('Invalid telemetry correctly rejected');
        return;
      }
      throw error;
    }
  }

  async testHeartbeatWithWarnings() {
    // Register kiosk first
    await axios.post(`${GATEWAY_URL}/api/kiosk/register`, {
      kiosk_id: 'test-kiosk-telemetry-4',
      zone: 'test-zone',
      version: '1.0.0'
    });

    const warningTelemetryData = {
      voltage: {
        main_power: 10.5 // Below normal range, should generate warning
      },
      system_status: {
        cpu_usage: 95, // High usage, should generate warning
        temperature: 75 // High temperature, should generate warning
      },
      hardware_status: {
        relay_board_connected: false // Disconnected, should generate warning
      }
    };

    const response = await axios.post(`${GATEWAY_URL}/api/kiosk/heartbeat`, {
      kiosk_id: 'test-kiosk-telemetry-4',
      zone: 'test-zone',
      version: '1.0.0',
      telemetry: warningTelemetryData
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error(`Heartbeat with warning telemetry failed: ${response.data.error}`);
    }

    if (!response.data.telemetry_warnings || response.data.telemetry_warnings.length === 0) {
      throw new Error('Expected telemetry warnings to be returned');
    }

    this.log(`Heartbeat with warnings successful. Warnings: ${response.data.telemetry_warnings.join(', ')}`);
  }

  async testTelemetryDataRetrieval() {
    const kioskId = 'test-kiosk-telemetry-2';
    
    const response = await axios.get(`${GATEWAY_URL}/api/kiosk/kiosks/${kioskId}/telemetry`);

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error(`Telemetry retrieval failed: ${response.data.error}`);
    }

    if (!response.data.data.current) {
      throw new Error('Expected current telemetry data to be present');
    }

    this.log('Telemetry data retrieval successful');
  }

  async testTelemetrySummary() {
    const response = await axios.get(`${GATEWAY_URL}/api/kiosk/telemetry/summary`);

    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    if (!response.data.success) {
      throw new Error(`Telemetry summary failed: ${response.data.error}`);
    }

    if (!Array.isArray(response.data.data)) {
      throw new Error('Expected telemetry summary to be an array');
    }

    this.log(`Telemetry summary successful. Found ${response.data.data.length} kiosks`);
  }

  async runAllTests() {
    this.log('🚀 Starting telemetry system tests...');
    this.log('');

    await this.runTest('Basic Heartbeat (No Telemetry)', () => this.testBasicHeartbeatWithoutTelemetry());
    await this.runTest('Heartbeat with Valid Telemetry', () => this.testHeartbeatWithValidTelemetry());
    await this.runTest('Heartbeat with Invalid Telemetry', () => this.testHeartbeatWithInvalidTelemetry());
    await this.runTest('Heartbeat with Warnings', () => this.testHeartbeatWithWarnings());
    await this.runTest('Telemetry Data Retrieval', () => this.testTelemetryDataRetrieval());
    await this.runTest('Telemetry Summary', () => this.testTelemetrySummary());

    this.log('');
    this.log('📊 Test Results Summary:');
    this.log('========================');

    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;

    this.testResults.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      this.log(`${icon} ${result.name}`);
      if (result.error) {
        this.log(`   Error: ${result.error}`);
      }
    });

    this.log('');
    this.log(`Total: ${this.testResults.length}, Passed: ${passed}, Failed: ${failed}`);

    if (failed > 0) {
      this.log('');
      this.log('❌ Some tests failed. Please check the gateway service and database.');
      process.exit(1);
    } else {
      this.log('');
      this.log('🎉 All telemetry system tests passed!');
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new TelemetrySystemTest();
  tester.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = TelemetrySystemTest;