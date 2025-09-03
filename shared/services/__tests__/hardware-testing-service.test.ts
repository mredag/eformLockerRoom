/**
 * Hardware Testing Service Tests
 * Tests for comprehensive hardware validation and verification
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HardwareTestingService } from '../hardware-testing-service';
import { ModbusConfig } from '../../../app/kiosk/src/hardware/modbus-controller';

// Mock the ModbusController
vi.mock('../../../app/kiosk/src/hardware/modbus-controller', () => ({
  ModbusController: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    readRelayStatus: vi.fn().mockResolvedValue([false]),
    openLocker: vi.fn().mockResolvedValue(true)
  }))
}));

describe('HardwareTestingService', () => {
  let service: HardwareTestingService;
  let mockConfig: ModbusConfig;

  beforeEach(() => {
    service = new HardwareTestingService();
    mockConfig = {
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 5000,
      pulse_duration_ms: 400,
      burst_duration_seconds: 2,
      burst_interval_ms: 100,
      command_interval_ms: 300,
      test_mode: true
    };
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      await expect(service.initialize(mockConfig)).resolves.not.toThrow();
    });

    it('should emit initialized event on successful initialization', async () => {
      const initPromise = new Promise((resolve) => {
        service.once('initialized', resolve);
      });

      await service.initialize(mockConfig);
      await expect(initPromise).resolves.toBeDefined();
    });
  });

  describe('Communication Testing', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should test communication successfully', async () => {
      const result = await service.testCommunication(1);

      expect(result).toMatchObject({
        testName: 'Communication Test - Address 1',
        success: true,
        details: expect.stringContaining('Communication successful'),
        timestamp: expect.any(Date)
      });
    });

    it('should measure response time', async () => {
      const responseTime = await service.measureResponseTime(1);
      expect(responseTime).toBeGreaterThan(0);
    });

    it('should include response time in test results when requested', async () => {
      const result = await service.testCommunication(1, { includeResponseTime: true });
      expect(result.responseTime).toBeGreaterThan(0);
    });
  });

  describe('Relay Activation Testing', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should test individual relay activation', async () => {
      const result = await service.testRelayActivation(1, 5);

      expect(result).toMatchObject({
        testName: 'Relay Activation Test - Address 1, Relay 5',
        success: true,
        details: expect.stringContaining('Relay 5 activated successfully'),
        timestamp: expect.any(Date)
      });
    });

    it('should test all default relays (1, 8, 16)', async () => {
      const results = await service.testAllRelays(1);

      expect(results).toHaveLength(3);
      expect(results[0].testName).toContain('Relay 1');
      expect(results[1].testName).toContain('Relay 8');
      expect(results[2].testName).toContain('Relay 16');
    });

    it('should test all 16 relays when includeAllRelays is true', async () => {
      const results = await service.testAllRelays(1, { includeAllRelays: true });
      expect(results).toHaveLength(16);
    });
  });

  describe('Comprehensive Test Suites', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should run full hardware test suite', async () => {
      const testSuite = await service.runFullHardwareTest(1);

      expect(testSuite).toMatchObject({
        address: 1,
        totalTests: expect.any(Number),
        passedTests: expect.any(Number),
        failedTests: expect.any(Number),
        results: expect.any(Array),
        overallSuccess: expect.any(Boolean),
        duration: expect.any(Number),
        timestamp: expect.any(Date)
      });

      expect(testSuite.totalTests).toBeGreaterThan(0);
      expect(testSuite.results.length).toBe(testSuite.totalTests);
    });

    it('should validate system integration', async () => {
      const result = await service.validateSystemIntegration();

      expect(result).toMatchObject({
        systemHealthy: expect.any(Boolean),
        servicesRunning: expect.any(Boolean),
        configurationValid: expect.any(Boolean),
        hardwareResponding: expect.any(Boolean),
        lockersAccessible: expect.any(Boolean),
        issues: expect.any(Array),
        recommendations: expect.any(Array)
      });
    });

    it('should perform reliability testing', async () => {
      const result = await service.testReliability(1, 5);

      expect(result).toMatchObject({
        address: 1,
        totalIterations: 5,
        successfulIterations: expect.any(Number),
        failedIterations: expect.any(Number),
        averageResponseTime: expect.any(Number),
        minResponseTime: expect.any(Number),
        maxResponseTime: expect.any(Number),
        errorRate: expect.any(Number),
        reliability: expect.any(Number),
        errors: expect.any(Array)
      });

      expect(result.reliability).toBeGreaterThanOrEqual(0);
      expect(result.reliability).toBeLessThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle uninitialized service gracefully', async () => {
      const uninitializedService = new HardwareTestingService();
      
      const result = await uninitializedService.testCommunication(1);
      
      expect(result).toMatchObject({
        success: false,
        error: 'Service not initialized'
      });
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await service.initialize(mockConfig);
    });

    it('should emit test completion events', async () => {
      const completionEvents: any[] = [];
      service.on('test_completed', (event) => completionEvents.push(event));

      await service.testCommunication(1);

      expect(completionEvents.length).toBeGreaterThan(0);
      expect(completionEvents[0]).toMatchObject({
        testName: expect.any(String),
        address: 1,
        success: true
      });
    });

    it('should emit reliability test progress events', async () => {
      const progressEvents: any[] = [];
      service.on('reliability_test_progress', (event) => progressEvents.push(event));

      await service.testReliability(1, 3);

      expect(progressEvents.length).toBe(3);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources properly', async () => {
      await service.initialize(mockConfig);
      
      const cleanupPromise = new Promise((resolve) => {
        service.once('cleanup_completed', resolve);
      });

      await service.cleanup();
      await expect(cleanupPromise).resolves.toBeDefined();
    });

    it('should handle cleanup when not initialized', async () => {
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});