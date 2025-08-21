/**
 * RS485 Diagnostic Tools for Eform Locker System
 * Provides bus scanning, line validation, and troubleshooting capabilities
 * Requirements: 7.7, 10.5
 */

import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

export interface RS485Config {
  port: string;
  baudrate: number;
  timeout_ms: number;
  scan_timeout_ms?: number;
  termination_test_voltage?: number;
  failsafe_test_voltage?: number;
}

export interface SlaveDevice {
  address: number;
  responding: boolean;
  response_time_ms: number;
  signal_quality: 'excellent' | 'good' | 'poor' | 'failed';
  last_response: Date;
  error_count: number;
}

export interface LineTestResult {
  line: 'A' | 'B';
  voltage: number;
  expected_range: { min: number; max: number };
  status: 'ok' | 'warning' | 'error';
  description: string;
}

export interface TerminationTestResult {
  termination_present: boolean;
  resistance_ohms: number;
  expected_ohms: number;
  tolerance_percent: number;
  status: 'ok' | 'warning' | 'error';
  description: string;
}

export interface DiagnosticReport {
  timestamp: Date;
  port: string;
  baudrate: number;
  bus_scan: {
    total_addresses_scanned: number;
    responding_devices: SlaveDevice[];
    non_responding_addresses: number[];
    scan_duration_ms: number;
  };
  line_tests: LineTestResult[];
  termination_test: TerminationTestResult;
  failsafe_test: {
    a_line_pullup: LineTestResult;
    b_line_pulldown: LineTestResult;
  };
  recommendations: string[];
  overall_status: 'healthy' | 'warnings' | 'errors';
}

/**
 * RS485 Diagnostic Tool for bus scanning and validation
 */
export class RS485Diagnostics extends EventEmitter {
  private config: RS485Config;
  private serialPort: SerialPort | null = null;

  constructor(config: RS485Config) {
    super();
    this.config = {
      scan_timeout_ms: 500,
      termination_test_voltage: 5.0,
      failsafe_test_voltage: 5.0,
      ...config
    };
  }

  /**
   * Initialize the diagnostic connection
   */
  async initialize(): Promise<void> {
    this.serialPort = new SerialPort({
      path: this.config.port,
      baudRate: this.config.baudrate,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false
    });

    return new Promise<void>((resolve, reject) => {
      this.serialPort!.open((err) => {
        if (err) {
          reject(new Error(`Failed to open diagnostic port: ${err.message}`));
        } else {
          this.emit('connected');
          resolve();
        }
      });
    });
  }

  /**
   * Perform comprehensive RS485 bus diagnostics
   */
  async runDiagnostics(): Promise<DiagnosticReport> {
    const startTime = Date.now();
    
    this.emit('diagnostic_started');

    try {
      // Perform bus scan
      this.emit('scan_started');
      const busScanResult = await this.scanBus();
      this.emit('scan_completed', busScanResult);

      // Perform line tests
      this.emit('line_test_started');
      const lineTests = await this.performLineTests();
      this.emit('line_test_completed', lineTests);

      // Perform termination test
      this.emit('termination_test_started');
      const terminationTest = await this.testTermination();
      this.emit('termination_test_completed', terminationTest);

      // Perform failsafe test
      this.emit('failsafe_test_started');
      const failsafeTest = await this.testFailsafeResistors();
      this.emit('failsafe_test_completed', failsafeTest);

      // Generate report
      const report: DiagnosticReport = {
        timestamp: new Date(),
        port: this.config.port,
        baudrate: this.config.baudrate,
        bus_scan: busScanResult,
        line_tests: lineTests,
        termination_test: terminationTest,
        failsafe_test: failsafeTest,
        recommendations: this.generateRecommendations(busScanResult, lineTests, terminationTest, failsafeTest),
        overall_status: this.determineOverallStatus(lineTests, terminationTest, failsafeTest)
      };

      this.emit('diagnostic_completed', report);
      return report;

    } catch (error) {
      this.emit('diagnostic_error', error);
      throw error;
    }
  }

  /**
   * Scan RS485 bus for responding slave devices
   */
  async scanBus(startAddress: number = 1, endAddress: number = 10): Promise<DiagnosticReport['bus_scan']> {
    const startTime = Date.now();
    const respondingDevices: SlaveDevice[] = [];
    const nonRespondingAddresses: number[] = [];

    for (let address = startAddress; address <= endAddress; address++) {
      this.emit('scanning_address', address);
      
      try {
        const device = await this.testSlaveAddress(address);
        if (device.responding) {
          respondingDevices.push(device);
        } else {
          nonRespondingAddresses.push(address);
        }
      } catch (error) {
        nonRespondingAddresses.push(address);
      }

      // Small delay between scans to avoid overwhelming the bus
      await this.delay(10);
    }

    const scanDuration = Date.now() - startTime;

    return {
      total_addresses_scanned: endAddress - startAddress + 1,
      responding_devices: respondingDevices,
      non_responding_addresses: nonRespondingAddresses,
      scan_duration_ms: scanDuration
    };
  }

  /**
   * Test a specific slave address for response
   */
  async testSlaveAddress(address: number): Promise<SlaveDevice> {
    const startTime = Date.now();
    
    try {
      // Send a simple read holding registers command (function code 0x03)
      const command = this.buildModbusCommand(address, 0x03, 0x0000, 0x0001);
      const response = await this.sendCommandWithResponse(command);
      
      const responseTime = Date.now() - startTime;
      const signalQuality = this.assessSignalQuality(responseTime, response);

      return {
        address,
        responding: true,
        response_time_ms: responseTime,
        signal_quality: signalQuality,
        last_response: new Date(),
        error_count: 0
      };

    } catch (error) {
      return {
        address,
        responding: false,
        response_time_ms: Date.now() - startTime,
        signal_quality: 'failed',
        last_response: new Date(0),
        error_count: 1
      };
    }
  }

  /**
   * Perform A/B line direction control and validation tests
   */
  async performLineTests(): Promise<LineTestResult[]> {
    const results: LineTestResult[] = [];

    // Test A line (should be high when idle)
    const aLineTest = await this.testLine('A');
    results.push(aLineTest);

    // Test B line (should be low when idle)
    const bLineTest = await this.testLine('B');
    results.push(bLineTest);

    return results;
  }

  /**
   * Test individual RS485 line voltage
   */
  private async testLine(line: 'A' | 'B'): Promise<LineTestResult> {
    // Simulate voltage measurement (in real implementation, this would use ADC)
    const measuredVoltage = await this.measureLineVoltage(line);
    
    const expectedRange = line === 'A' 
      ? { min: 2.5, max: 5.0 }  // A line should be high (pulled up)
      : { min: 0.0, max: 2.5 }; // B line should be low (pulled down)

    const status = this.evaluateVoltageRange(measuredVoltage, expectedRange);
    const description = this.getLineTestDescription(line, measuredVoltage, status);

    return {
      line,
      voltage: measuredVoltage,
      expected_range: expectedRange,
      status,
      description
    };
  }

  /**
   * Test 120Ω termination resistors
   */
  async testTermination(): Promise<TerminationTestResult> {
    // Simulate termination resistance measurement
    const measuredResistance = await this.measureTerminationResistance();
    const expectedResistance = 120; // Ohms
    const tolerance = 5; // 5% tolerance
    
    const minResistance = expectedResistance * (1 - tolerance / 100);
    const maxResistance = expectedResistance * (1 + tolerance / 100);
    
    const terminationPresent = measuredResistance >= minResistance && measuredResistance <= maxResistance;
    const status = terminationPresent ? 'ok' : 
                  (measuredResistance > 0 ? 'warning' : 'error');
    
    const description = this.getTerminationDescription(measuredResistance, expectedResistance, terminationPresent);

    return {
      termination_present: terminationPresent,
      resistance_ohms: measuredResistance,
      expected_ohms: expectedResistance,
      tolerance_percent: tolerance,
      status,
      description
    };
  }

  /**
   * Test failsafe resistors (680Ω pull-up/pull-down)
   */
  async testFailsafeResistors(): Promise<DiagnosticReport['failsafe_test']> {
    // Test A line pull-up (680Ω to +5V)
    const aLinePullup = await this.testFailsafeResistor('A', 'pullup');
    
    // Test B line pull-down (680Ω to GND)
    const bLinePulldown = await this.testFailsafeResistor('B', 'pulldown');

    return {
      a_line_pullup: aLinePullup,
      b_line_pulldown: bLinePulldown
    };
  }

  /**
   * Test individual failsafe resistor
   */
  private async testFailsafeResistor(line: 'A' | 'B', type: 'pullup' | 'pulldown'): Promise<LineTestResult> {
    // Simulate failsafe resistor test
    const measuredVoltage = await this.measureFailsafeVoltage(line, type);
    
    const expectedRange = type === 'pullup'
      ? { min: 3.0, max: 5.0 }  // Pull-up should bring line high
      : { min: 0.0, max: 2.0 }; // Pull-down should bring line low

    const status = this.evaluateVoltageRange(measuredVoltage, expectedRange);
    const description = this.getFailsafeDescription(line, type, measuredVoltage, status);

    return {
      line,
      voltage: measuredVoltage,
      expected_range: expectedRange,
      status,
      description
    };
  }

  /**
   * Build Modbus RTU command with CRC
   */
  private buildModbusCommand(slaveId: number, functionCode: number, address: number, data: number): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(slaveId, 0);
    buffer.writeUInt8(functionCode, 1);
    buffer.writeUInt16BE(address, 2);
    buffer.writeUInt16BE(data, 4);
    
    // Calculate CRC16
    const crc = this.calculateCRC16(buffer.subarray(0, 6));
    buffer.writeUInt16LE(crc, 6);
    
    return buffer;
  }

  /**
   * Calculate CRC16 for Modbus RTU
   */
  private calculateCRC16(data: Buffer): number {
    let crc = 0xFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    
    return crc;
  }

  /**
   * Send command and wait for response
   */
  private async sendCommandWithResponse(command: Buffer): Promise<Buffer> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Diagnostic port not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, this.config.scan_timeout_ms);

      let responseBuffer = Buffer.alloc(0);

      const onData = (data: Buffer) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);
        
        // Check if we have a complete response (minimum 5 bytes for error response)
        if (responseBuffer.length >= 5) {
          clearTimeout(timeout);
          this.serialPort!.removeListener('data', onData);
          resolve(responseBuffer);
        }
      };

      this.serialPort!.on('data', onData);
      
      this.serialPort!.write(command, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.serialPort!.removeListener('data', onData);
          reject(err);
        }
      });
    });
  }

  /**
   * Assess signal quality based on response time and data
   */
  private assessSignalQuality(responseTime: number, response: Buffer): SlaveDevice['signal_quality'] {
    if (responseTime < 50 && response.length > 0) {
      return 'excellent';
    } else if (responseTime < 100 && response.length > 0) {
      return 'good';
    } else if (responseTime < 200 && response.length > 0) {
      return 'poor';
    } else {
      return 'failed';
    }
  }

  /**
   * Simulate line voltage measurement
   */
  private async measureLineVoltage(line: 'A' | 'B'): Promise<number> {
    // In real implementation, this would interface with ADC
    // For simulation, return typical values
    await this.delay(10);
    return line === 'A' ? 3.3 : 1.2; // Typical idle voltages
  }

  /**
   * Simulate termination resistance measurement
   */
  private async measureTerminationResistance(): Promise<number> {
    // In real implementation, this would measure actual resistance
    await this.delay(50);
    return 120; // Simulate proper termination
  }

  /**
   * Simulate failsafe voltage measurement
   */
  private async measureFailsafeVoltage(line: 'A' | 'B', type: 'pullup' | 'pulldown'): Promise<number> {
    await this.delay(10);
    if (line === 'A' && type === 'pullup') {
      return 4.2; // Pulled up through 680Ω
    } else if (line === 'B' && type === 'pulldown') {
      return 0.8; // Pulled down through 680Ω
    }
    return 2.5; // Unexpected configuration
  }

  /**
   * Evaluate if voltage is within expected range
   */
  private evaluateVoltageRange(voltage: number, range: { min: number; max: number }): LineTestResult['status'] {
    if (voltage >= range.min && voltage <= range.max) {
      return 'ok';
    } else if (Math.abs(voltage - range.min) < 0.5 || Math.abs(voltage - range.max) < 0.5) {
      return 'warning';
    } else {
      return 'error';
    }
  }

  /**
   * Generate description for line test results
   */
  private getLineTestDescription(line: 'A' | 'B', voltage: number, status: LineTestResult['status']): string {
    const lineType = line === 'A' ? 'positive' : 'negative';
    
    switch (status) {
      case 'ok':
        return `${line} line (${lineType}) voltage is normal at ${voltage.toFixed(2)}V`;
      case 'warning':
        return `${line} line (${lineType}) voltage is marginal at ${voltage.toFixed(2)}V - check connections`;
      case 'error':
        return `${line} line (${lineType}) voltage is abnormal at ${voltage.toFixed(2)}V - check wiring and termination`;
      default:
        return `${line} line test failed`;
    }
  }

  /**
   * Generate description for termination test results
   */
  private getTerminationDescription(measured: number, expected: number, present: boolean): string {
    if (present) {
      return `Termination resistor present: ${measured.toFixed(1)}Ω (expected ${expected}Ω)`;
    } else if (measured > expected * 2) {
      return `Termination resistor missing or open circuit: ${measured.toFixed(1)}Ω`;
    } else if (measured < expected / 2) {
      return `Termination resistor short circuit or wrong value: ${measured.toFixed(1)}Ω`;
    } else {
      return `Termination resistor value incorrect: ${measured.toFixed(1)}Ω (expected ${expected}Ω)`;
    }
  }

  /**
   * Generate description for failsafe test results
   */
  private getFailsafeDescription(line: 'A' | 'B', type: 'pullup' | 'pulldown', voltage: number, status: LineTestResult['status']): string {
    const resistorType = type === 'pullup' ? 'pull-up' : 'pull-down';
    
    switch (status) {
      case 'ok':
        return `${line} line ${resistorType} resistor working correctly at ${voltage.toFixed(2)}V`;
      case 'warning':
        return `${line} line ${resistorType} resistor marginal at ${voltage.toFixed(2)}V - check resistor value`;
      case 'error':
        return `${line} line ${resistorType} resistor failed at ${voltage.toFixed(2)}V - check resistor and connections`;
      default:
        return `${line} line ${resistorType} test failed`;
    }
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(
    busScan: DiagnosticReport['bus_scan'],
    lineTests: LineTestResult[],
    terminationTest: TerminationTestResult,
    failsafeTest: DiagnosticReport['failsafe_test']
  ): string[] {
    const recommendations: string[] = [];

    // Bus scan recommendations
    if (busScan.responding_devices.length === 0) {
      recommendations.push('No devices found on bus - check wiring and power supply');
    } else if (busScan.responding_devices.length < 5) {
      recommendations.push('Few devices responding - verify device addresses and network topology');
    }

    // Line test recommendations
    const errorLines = lineTests.filter(test => test.status === 'error');
    if (errorLines.length > 0) {
      recommendations.push(`Line voltage errors detected on ${errorLines.map(t => t.line).join(', ')} - check wiring polarity and connections`);
    }

    // Termination recommendations
    if (!terminationTest.termination_present) {
      recommendations.push('Install 120Ω termination resistors at both ends of the RS485 bus');
    } else if (terminationTest.status === 'warning') {
      recommendations.push('Check termination resistor values - should be 120Ω ±5%');
    }

    // Failsafe recommendations
    if (failsafeTest.a_line_pullup.status !== 'ok') {
      recommendations.push('Install or check 680Ω pull-up resistor on A line to +5V');
    }
    if (failsafeTest.b_line_pulldown.status !== 'ok') {
      recommendations.push('Install or check 680Ω pull-down resistor on B line to GND');
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('RS485 bus appears to be properly configured');
    } else {
      recommendations.push('Use daisy-chain topology only - avoid star or stub connections');
      recommendations.push('Keep cable lengths under 1200m total for reliable operation');
    }

    return recommendations;
  }

  /**
   * Determine overall diagnostic status
   */
  private determineOverallStatus(
    lineTests: LineTestResult[],
    terminationTest: TerminationTestResult,
    failsafeTest: DiagnosticReport['failsafe_test']
  ): DiagnosticReport['overall_status'] {
    const allTests = [
      ...lineTests,
      terminationTest,
      failsafeTest.a_line_pullup,
      failsafeTest.b_line_pulldown
    ];

    const hasErrors = allTests.some(test => test.status === 'error');
    const hasWarnings = allTests.some(test => test.status === 'warning');

    if (hasErrors) {
      return 'errors';
    } else if (hasWarnings) {
      return 'warnings';
    } else {
      return 'healthy';
    }
  }

  /**
   * Generate formatted diagnostic report
   */
  formatReport(report: DiagnosticReport): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(60));
    lines.push('RS485 DIAGNOSTIC REPORT');
    lines.push('='.repeat(60));
    lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
    lines.push(`Port: ${report.port} @ ${report.baudrate} baud`);
    lines.push(`Overall Status: ${report.overall_status.toUpperCase()}`);
    lines.push('');

    // Bus scan results
    lines.push('BUS SCAN RESULTS:');
    lines.push('-'.repeat(40));
    lines.push(`Addresses scanned: ${report.bus_scan.total_addresses_scanned}`);
    lines.push(`Responding devices: ${report.bus_scan.responding_devices.length}`);
    lines.push(`Scan duration: ${report.bus_scan.scan_duration_ms}ms`);
    lines.push('');

    if (report.bus_scan.responding_devices.length > 0) {
      lines.push('Responding devices:');
      report.bus_scan.responding_devices.forEach(device => {
        lines.push(`  Address ${device.address}: ${device.signal_quality} (${device.response_time_ms}ms)`);
      });
      lines.push('');
    }

    // Line tests
    lines.push('LINE TESTS:');
    lines.push('-'.repeat(40));
    report.line_tests.forEach(test => {
      lines.push(`${test.line} Line: ${test.status.toUpperCase()} - ${test.description}`);
    });
    lines.push('');

    // Termination test
    lines.push('TERMINATION TEST:');
    lines.push('-'.repeat(40));
    lines.push(`Status: ${report.termination_test.status.toUpperCase()}`);
    lines.push(`Description: ${report.termination_test.description}`);
    lines.push('');

    // Failsafe tests
    lines.push('FAILSAFE TESTS:');
    lines.push('-'.repeat(40));
    lines.push(`A Line Pull-up: ${report.failsafe_test.a_line_pullup.status.toUpperCase()} - ${report.failsafe_test.a_line_pullup.description}`);
    lines.push(`B Line Pull-down: ${report.failsafe_test.b_line_pulldown.status.toUpperCase()} - ${report.failsafe_test.b_line_pulldown.description}`);
    lines.push('');

    // Recommendations
    lines.push('RECOMMENDATIONS:');
    lines.push('-'.repeat(40));
    report.recommendations.forEach((rec, index) => {
      lines.push(`${index + 1}. ${rec}`);
    });
    lines.push('');

    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close the diagnostic connection
   */
  async close(): Promise<void> {
    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => {
          this.emit('disconnected');
          resolve();
        });
      });
    }
  }
}