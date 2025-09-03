/**
 * Hardware Testing Service for eForm Locker System
 * Provides comprehensive testing and validation of hardware setup
 * Integrates with existing ModbusController testing functionality
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { EventEmitter } from 'events';
import { ModbusController, ModbusConfig } from '../../app/kiosk/src/hardware/modbus-controller';

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

export interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  details: string;
  error?: string;
  timestamp: Date;
  responseTime?: number;
  retryCount?: number;
}

export interface TestSuite {
  address: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  overallSuccess: boolean;
  duration: number;
  timestamp: Date;
}

export interface ReliabilityResult {
  address: number;
  totalIterations: number;
  successfulIterations: number;
  failedIterations: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  errorRate: number;
  reliability: number; // 0-1 scale
  errors: string[];
}

export interface IntegrationResult {
  systemHealthy: boolean;
  servicesRunning: boolean;
  configurationValid: boolean;
  hardwareResponding: boolean;
  lockersAccessible: boolean;
  issues: string[];
  recommendations: string[];
}

export interface CommunicationTestOptions {
  timeout?: number;
  retries?: number;
  includeResponseTime?: boolean;
}

export interface RelayTestOptions {
  testRelays?: number[]; // Default: [1, 8, 16]
  pulseDuration?: number; // Default: 400ms
  confirmationRequired?: boolean; // Default: false for automated testing
  includeAllRelays?: boolean; // Default: false
}

export interface ReliabilityTestOptions {
  iterations?: number; // Default: 10
  delayBetweenTests?: number; // Default: 1000ms
  includeStressTest?: boolean; // Default: false
  maxConcurrentTests?: number; // Default: 1
}

// ============================================================================
// HARDWARE TESTING SERVICE
// ============================================================================

export class HardwareTestingService extends EventEmitter {
  private modbusController: ModbusController | null = null;
  private isInitialized = false;

  constructor() {
    super();
    this.setMaxListeners(20);
  }

  /**
   * Initialize the testing service with Modbus configuration
   * Requirements: 4.1
   */
  async initialize(config: ModbusConfig): Promise<void> {
    try {
      // Create ModbusController instance for testing
      this.modbusController = new ModbusController({
        ...config,
        test_mode: true // Enable test mode to prevent queue processor conflicts
      });

      await this.modbusController.initialize();
      this.isInitialized = true;

      this.emit('initialized', { config });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { operation: 'initialize', error: errorMessage });
      throw new Error(`Failed to initialize hardware testing service: ${errorMessage}`);
    }
  }

  /**
   * Test basic Modbus communication with a device
   * Requirements: 4.1, 4.2
   */
  async testCommunication(
    address: number, 
    options: CommunicationTestOptions = {}
  ): Promise<TestResult> {
    const testName = `Communication Test - Address ${address}`;
    const startTime = Date.now();

    if (!this.isInitialized || !this.modbusController) {
      return {
        testName,
        success: false,
        duration: 0,
        details: 'Testing service not initialized',
        error: 'Service not initialized',
        timestamp: new Date()
      };
    }

    const {
      timeout = 5000,
      retries = 3,
      includeResponseTime = true
    } = options;

    let lastError: string | undefined;
    let responseTime: number | undefined;

    // Attempt communication with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const attemptStartTime = Date.now();
        
        // Try to read coil status (basic communication test)
        const result = await this.modbusController.readRelayStatus(address, 0, 1);
        
        responseTime = Date.now() - attemptStartTime;
        const duration = Date.now() - startTime;

        this.emit('test_completed', {
          testName,
          address,
          success: true,
          attempt: attempt + 1,
          responseTime
        });

        return {
          testName,
          success: true,
          duration,
          details: `Communication successful on attempt ${attempt + 1}. Device responding at address ${address}.`,
          timestamp: new Date(),
          responseTime: includeResponseTime ? responseTime : undefined,
          retryCount: attempt
        };

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        
        if (attempt < retries) {
          // Wait before retry with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.delay(delay);
        }
      }
    }

    const duration = Date.now() - startTime;

    this.emit('test_failed', {
      testName,
      address,
      error: lastError,
      retries: retries + 1
    });

    return {
      testName,
      success: false,
      duration,
      details: `Communication failed after ${retries + 1} attempts. Device not responding at address ${address}.`,
      error: lastError,
      timestamp: new Date(),
      retryCount: retries
    };
  }

  /**
   * Measure response time for performance benchmarking
   * Requirements: 4.1, 4.2
   */
  async measureResponseTime(address: number): Promise<number> {
    if (!this.isInitialized || !this.modbusController) {
      throw new Error('Testing service not initialized');
    }

    const startTime = Date.now();
    
    try {
      await this.modbusController.readRelayStatus(address, 0, 1);
      return Date.now() - startTime;
    } catch (error) {
      throw new Error(`Failed to measure response time: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test individual relay activation
   * Requirements: 4.3, 4.4
   */
  async testRelayActivation(
    address: number, 
    relay: number, 
    options: RelayTestOptions = {}
  ): Promise<TestResult> {
    const testName = `Relay Activation Test - Address ${address}, Relay ${relay}`;
    const startTime = Date.now();

    if (!this.isInitialized || !this.modbusController) {
      return {
        testName,
        success: false,
        duration: 0,
        details: 'Testing service not initialized',
        error: 'Service not initialized',
        timestamp: new Date()
      };
    }

    const {
      pulseDuration = 400,
      confirmationRequired = false
    } = options;

    try {
      // Calculate the actual channel for the ModbusController
      const lockerId = ((address - 1) * 16) + relay;
      
      this.emit('relay_test_started', {
        address,
        relay,
        lockerId,
        pulseDuration
      });

      // Perform relay activation test
      const success = await this.modbusController.openLocker(lockerId, address);
      const duration = Date.now() - startTime;

      if (success) {
        let details = `Relay ${relay} activated successfully. `;
        
        if (confirmationRequired) {
          details += 'Please confirm you heard the relay click. ';
        } else {
          details += 'Physical click should be audible. ';
        }
        
        details += `Pulse duration: ${pulseDuration}ms.`;

        this.emit('relay_test_completed', {
          address,
          relay,
          success: true,
          duration
        });

        return {
          testName,
          success: true,
          duration,
          details,
          timestamp: new Date()
        };
      } else {
        const details = `Relay ${relay} activation failed. No physical response detected.`;
        
        this.emit('relay_test_failed', {
          address,
          relay,
          error: 'Activation failed'
        });

        return {
          testName,
          success: false,
          duration,
          details,
          error: 'Relay activation failed',
          timestamp: new Date()
        };
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit('relay_test_error', {
        address,
        relay,
        error: errorMessage
      });

      return {
        testName,
        success: false,
        duration,
        details: `Relay ${relay} test failed with error.`,
        error: errorMessage,
        timestamp: new Date()
      };
    }
  }

  /**
   * Test all relays on a card (comprehensive relay testing)
   * Requirements: 4.3, 4.4
   */
  async testAllRelays(
    address: number, 
    options: RelayTestOptions = {}
  ): Promise<TestResult[]> {
    const {
      testRelays = [1, 8, 16], // Default test relays as per requirements
      pulseDuration = 400,
      confirmationRequired = false,
      includeAllRelays = false
    } = options;

    const relaysToTest = includeAllRelays ? 
      Array.from({ length: 16 }, (_, i) => i + 1) : 
      testRelays;

    const results: TestResult[] = [];

    this.emit('all_relays_test_started', {
      address,
      relaysToTest,
      totalRelays: relaysToTest.length
    });

    for (const relay of relaysToTest) {
      const result = await this.testRelayActivation(address, relay, {
        pulseDuration,
        confirmationRequired
      });
      
      results.push(result);

      // Small delay between relay tests to prevent hardware conflicts
      await this.delay(500);

      // Emit progress update
      this.emit('relay_test_progress', {
        address,
        completedTests: results.length,
        totalTests: relaysToTest.length,
        currentRelay: relay,
        lastResult: result
      });
    }

    this.emit('all_relays_test_completed', {
      address,
      results,
      passedTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length
    });

    return results;
  }

  /**
   * Run comprehensive hardware test combining all test types
   * Requirements: 4.5, 4.6
   */
  async runFullHardwareTest(address: number): Promise<TestSuite> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    this.emit('full_test_started', { address });

    // Test 1: Basic Communication
    const commTest = await this.testCommunication(address);
    results.push(commTest);

    // Test 2: Response Time Measurement
    if (commTest.success) {
      try {
        const responseTime = await this.measureResponseTime(address);
        results.push({
          testName: `Response Time Test - Address ${address}`,
          success: true,
          duration: responseTime,
          details: `Average response time: ${responseTime}ms`,
          timestamp: new Date(),
          responseTime
        });
      } catch (error) {
        results.push({
          testName: `Response Time Test - Address ${address}`,
          success: false,
          duration: 0,
          details: 'Failed to measure response time',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date()
        });
      }
    }

    // Test 3: Relay Activation Tests (1, 8, 16 as per requirements)
    if (commTest.success) {
      const relayResults = await this.testAllRelays(address, {
        testRelays: [1, 8, 16],
        confirmationRequired: false
      });
      results.push(...relayResults);
    }

    const duration = Date.now() - startTime;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = results.filter(r => !r.success).length;
    const overallSuccess = failedTests === 0;

    const testSuite: TestSuite = {
      address,
      totalTests: results.length,
      passedTests,
      failedTests,
      results,
      overallSuccess,
      duration,
      timestamp: new Date()
    };

    this.emit('full_test_completed', testSuite);

    return testSuite;
  }

  /**
   * Validate system integration for end-to-end verification
   * Requirements: 4.5, 4.6
   */
  async validateSystemIntegration(): Promise<IntegrationResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    this.emit('integration_test_started');

    // Check 1: Service Health
    let servicesRunning = true;
    try {
      if (!this.isInitialized || !this.modbusController) {
        servicesRunning = false;
        issues.push('Hardware testing service not properly initialized');
        recommendations.push('Restart the hardware testing service');
      }
    } catch (error) {
      servicesRunning = false;
      issues.push('Service health check failed');
    }

    // Check 2: Hardware Connectivity
    let hardwareResponding = true;
    try {
      if (this.modbusController) {
        // Test communication with default address 1
        const commResult = await this.testCommunication(1, { timeout: 3000, retries: 1 });
        if (!commResult.success) {
          hardwareResponding = false;
          issues.push('Hardware not responding at default address');
          recommendations.push('Check serial port connection and power supply');
        }
      }
    } catch (error) {
      hardwareResponding = false;
      issues.push('Hardware connectivity test failed');
    }

    // Check 3: Configuration Validation
    let configurationValid = true;
    try {
      // Basic configuration checks
      if (!this.modbusController) {
        configurationValid = false;
        issues.push('Modbus controller configuration invalid');
      }
    } catch (error) {
      configurationValid = false;
      issues.push('Configuration validation failed');
    }

    // Check 4: Locker Accessibility (basic test)
    let lockersAccessible = true;
    try {
      if (this.modbusController && hardwareResponding) {
        // Test opening locker 1 (should map to card 1, relay 1)
        const testResult = await this.modbusController.openLocker(1, 1);
        if (!testResult) {
          lockersAccessible = false;
          issues.push('Locker control test failed');
          recommendations.push('Verify relay card configuration and wiring');
        }
      } else {
        lockersAccessible = false;
        issues.push('Cannot test locker accessibility - hardware not responding');
      }
    } catch (error) {
      lockersAccessible = false;
      issues.push('Locker accessibility test failed');
    }

    const systemHealthy = issues.length === 0;

    const result: IntegrationResult = {
      systemHealthy,
      servicesRunning,
      configurationValid,
      hardwareResponding,
      lockersAccessible,
      issues,
      recommendations
    };

    this.emit('integration_test_completed', result);

    return result;
  }

  /**
   * Test reliability with stress testing and endurance validation
   * Requirements: 4.5, 4.6
   */
  async testReliability(
    address: number, 
    iterations: number = 10,
    options: ReliabilityTestOptions = {}
  ): Promise<ReliabilityResult> {
    const {
      delayBetweenTests = 1000,
      includeStressTest = false,
      maxConcurrentTests = 1
    } = options;

    const startTime = Date.now();
    const responseTimes: number[] = [];
    const errors: string[] = [];
    let successfulIterations = 0;
    let failedIterations = 0;

    this.emit('reliability_test_started', {
      address,
      iterations,
      includeStressTest
    });

    // Sequential reliability testing
    for (let i = 0; i < iterations; i++) {
      try {
        const iterationStart = Date.now();
        
        // Test communication
        const commResult = await this.testCommunication(address, { 
          timeout: 3000, 
          retries: 0 // No retries for reliability testing
        });

        const responseTime = Date.now() - iterationStart;
        responseTimes.push(responseTime);

        if (commResult.success) {
          successfulIterations++;
        } else {
          failedIterations++;
          if (commResult.error) {
            errors.push(`Iteration ${i + 1}: ${commResult.error}`);
          }
        }

        // Progress reporting
        this.emit('reliability_test_progress', {
          address,
          iteration: i + 1,
          totalIterations: iterations,
          success: commResult.success,
          responseTime
        });

        // Delay between tests (except last iteration)
        if (i < iterations - 1) {
          await this.delay(delayBetweenTests);
        }

      } catch (error) {
        failedIterations++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Iteration ${i + 1}: ${errorMessage}`);
        responseTimes.push(0); // Add 0 for failed attempts
      }
    }

    // Stress testing (if enabled)
    if (includeStressTest && maxConcurrentTests > 1) {
      this.emit('stress_test_started', { address, concurrentTests: maxConcurrentTests });
      
      try {
        // Run concurrent tests
        const stressPromises = Array.from({ length: maxConcurrentTests }, async () => {
          return this.testCommunication(address, { timeout: 5000, retries: 0 });
        });

        const stressResults = await Promise.allSettled(stressPromises);
        
        stressResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            successfulIterations++;
          } else {
            failedIterations++;
            const error = result.status === 'rejected' ? 
              result.reason : 
              result.value.error || 'Unknown stress test error';
            errors.push(`Stress test ${index + 1}: ${error}`);
          }
        });

      } catch (error) {
        errors.push(`Stress test failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Calculate statistics
    const validResponseTimes = responseTimes.filter(rt => rt > 0);
    const averageResponseTime = validResponseTimes.length > 0 ? 
      validResponseTimes.reduce((sum, rt) => sum + rt, 0) / validResponseTimes.length : 0;
    const minResponseTime = validResponseTimes.length > 0 ? Math.min(...validResponseTimes) : 0;
    const maxResponseTime = validResponseTimes.length > 0 ? Math.max(...validResponseTimes) : 0;
    const totalTests = successfulIterations + failedIterations;
    const errorRate = totalTests > 0 ? failedIterations / totalTests : 1;
    const reliability = totalTests > 0 ? successfulIterations / totalTests : 0;

    const result: ReliabilityResult = {
      address,
      totalIterations: totalTests,
      successfulIterations,
      failedIterations,
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      errorRate,
      reliability,
      errors: errors.slice(0, 10) // Limit to first 10 errors
    };

    this.emit('reliability_test_completed', result);

    return result;
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.modbusController) {
      // Close the Modbus connection
      try {
        await this.modbusController.close();
      } catch (error) {
        // Ignore cleanup errors
      }
      this.modbusController = null;
    }
    
    this.isInitialized = false;
    this.emit('cleanup_completed');
  }
}