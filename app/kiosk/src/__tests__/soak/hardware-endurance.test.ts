/**
 * Hardware Soak Testing - 1000-cycle endurance tests
 * Tests hardware reliability under extended operation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModbusController } from '../../hardware/modbus-controller';
import { HardwareSoakTester } from '../../../../shared/services/hardware-soak-tester';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { EventLogger } from '../../../../shared/services/event-logger';

describe('Hardware Endurance Soak Testing', () => {
  let dbManager: DatabaseManager;
  let eventLogger: EventLogger;
  let modbusController: ModbusController;
  let soakTester: HardwareSoakTester;

  beforeEach(async () => {
    // Use in-memory database for testing
    dbManager = new DatabaseManager(':memory:');
    await dbManager.initialize();

    eventLogger = new EventLogger(dbManager.getEventRepository());

    // Mock ModbusController for testing
    modbusController = {
      openLocker: vi.fn(),
      performBurstOpening: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendPulse: vi.fn(),
      getConnectionStatus: vi.fn().mockReturnValue({ connected: true, errors: 0 })
    } as any;

    soakTester = new HardwareSoakTester(
      dbManager.getConnection(),
      eventLogger
    );
  });

  afterEach(async () => {
    await dbManager.close();
  });

  describe('1000-Cycle Endurance Testing', () => {
    it('should complete 1000 open-close cycles successfully', async () => {
      const lockerId = 1;
      const targetCycles = 1000;
      
      // Mock successful operations
      modbusController.openLocker = vi.fn().mockResolvedValue(true);

      const result = await soakTester.runSoakTest({
        lockerId,
        cycles: targetCycles,
        intervalMs: 10, // Fast for testing
        failureThreshold: 0.05 // 5% failure threshold
      });

      expect(result.completed).toBe(true);
      expect(result.totalCycles).toBe(targetCycles);
      expect(result.successfulCycles).toBeGreaterThan(targetCycles * 0.95);
      expect(result.failureRate).toBeLessThan(0.05);
    }, 60000); // 60 second timeout for long test

    it('should detect and report hardware failures', async () => {
      const lockerId = 2;
      const targetCycles = 100;
      
      // Mock intermittent failures (20% failure rate)
      let callCount = 0;
      modbusController.openLocker = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount % 5 !== 0); // Fail every 5th call
      });

      const result = await soakTester.runSoakTest({
        lockerId,
        cycles: targetCycles,
        intervalMs: 10,
        failureThreshold: 0.15 // 15% threshold
      });

      expect(result.completed).toBe(false); // Should stop due to high failure rate
      expect(result.failureRate).toBeGreaterThan(0.15);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it('should track cycle counters and maintenance scheduling', async () => {
      const lockerId = 3;
      const cycles = 500;
      
      modbusController.openLocker = vi.fn().mockResolvedValue(true);

      await soakTester.runSoakTest({
        lockerId,
        cycles,
        intervalMs: 5
      });

      // Check cycle counter was updated
      const stats = await soakTester.getLockerStats(lockerId);
      expect(stats.totalCycles).toBe(cycles);
      expect(stats.lastSoakTest).toBeDefined();
      
      // Check maintenance scheduling
      const maintenanceNeeded = await soakTester.checkMaintenanceSchedule();
      expect(Array.isArray(maintenanceNeeded)).toBe(true);
    });

    it('should automatically block locker after failure threshold', async () => {
      const lockerId = 4;
      const cycles = 50;
      
      // Mock high failure rate
      modbusController.openLocker = vi.fn().mockResolvedValue(false);

      const result = await soakTester.runSoakTest({
        lockerId,
        cycles,
        intervalMs: 5,
        failureThreshold: 0.1, // 10% threshold
        autoBlock: true
      });

      expect(result.completed).toBe(false);
      expect(result.lockerBlocked).toBe(true);
      
      // Verify locker was marked as blocked in database
      const lockerRepo = dbManager.getLockerRepository();
      const locker = await lockerRepo.findByKioskAndId('soak-test-kiosk', lockerId);
      expect(locker?.status).toBe('Blocked');
    });
  });

  describe('Relay and Lock Bench Rig Testing', () => {
    it('should test all relay channels sequentially', async () => {
      const totalChannels = 16; // Typical relay board
      
      modbusController.openLocker = vi.fn().mockResolvedValue(true);

      const results = await soakTester.testAllChannels({
        channelCount: totalChannels,
        cyclesPerChannel: 10,
        intervalMs: 50
      });

      expect(results.length).toBe(totalChannels);
      
      results.forEach((result, index) => {
        expect(result.channel).toBe(index + 1);
        expect(result.successfulCycles).toBe(10);
        expect(result.failureRate).toBe(0);
      });
    });

    it('should detect faulty relay channels', async () => {
      const totalChannels = 8;
      
      // Mock channel 3 and 7 as faulty
      modbusController.openLocker = vi.fn().mockImplementation((lockerId) => {
        return Promise.resolve(lockerId !== 3 && lockerId !== 7);
      });

      const results = await soakTester.testAllChannels({
        channelCount: totalChannels,
        cyclesPerChannel: 5,
        intervalMs: 10
      });

      const faultyChannels = results.filter(r => r.failureRate > 0);
      expect(faultyChannels.length).toBe(2);
      expect(faultyChannels.map(r => r.channel)).toContain(3);
      expect(faultyChannels.map(r => r.channel)).toContain(7);
    });

    it('should measure timing accuracy and consistency', async () => {
      const lockerId = 5;
      const expectedPulseMs = 400;
      
      const timings: number[] = [];
      modbusController.sendPulse = vi.fn().mockImplementation((channel, duration) => {
        timings.push(duration);
        return Promise.resolve();
      });

      await soakTester.runTimingTest({
        lockerId,
        cycles: 20,
        expectedPulseMs
      });

      expect(timings.length).toBe(20);
      
      // Check timing accuracy (within 10ms tolerance)
      timings.forEach(timing => {
        expect(Math.abs(timing - expectedPulseMs)).toBeLessThan(10);
      });

      // Check timing consistency (standard deviation < 5ms)
      const mean = timings.reduce((a, b) => a + b) / timings.length;
      const variance = timings.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / timings.length;
      const stdDev = Math.sqrt(variance);
      
      expect(stdDev).toBeLessThan(5);
    });
  });

  describe('Environmental and Stress Testing', () => {
    it('should handle rapid successive operations', async () => {
      const lockerId = 6;
      const rapidCycles = 100;
      
      modbusController.openLocker = vi.fn().mockResolvedValue(true);

      const startTime = Date.now();
      
      const result = await soakTester.runSoakTest({
        lockerId,
        cycles: rapidCycles,
        intervalMs: 1, // Very rapid
        failureThreshold: 0.05
      });

      const duration = Date.now() - startTime;
      
      expect(result.completed).toBe(true);
      expect(result.successfulCycles).toBe(rapidCycles);
      expect(duration).toBeLessThan(rapidCycles * 10); // Should complete quickly
    });

    it('should test burst opening reliability', async () => {
      const lockerId = 7;
      const burstCycles = 50;
      
      // Mock initial failure requiring burst opening
      let attemptCount = 0;
      modbusController.openLocker = vi.fn().mockImplementation(() => {
        attemptCount++;
        return Promise.resolve(attemptCount % 3 === 0); // Fail 2/3 attempts initially
      });
      
      modbusController.performBurstOpening = vi.fn().mockResolvedValue(true);

      const result = await soakTester.runBurstTest({
        lockerId,
        cycles: burstCycles,
        intervalMs: 100
      });

      expect(result.burstOperationsUsed).toBeGreaterThan(0);
      expect(result.finalSuccessRate).toBeGreaterThan(0.8); // Should recover with burst
    });

    it('should monitor power consumption patterns', async () => {
      const lockerId = 8;
      const monitoringCycles = 30;
      
      // Mock power consumption data
      const powerReadings: number[] = [];
      modbusController.openLocker = vi.fn().mockImplementation(() => {
        // Simulate varying power consumption (12V ± 2V)
        const powerReading = 12 + (Math.random() - 0.5) * 4;
        powerReadings.push(powerReading);
        return Promise.resolve(true);
      });

      await soakTester.runPowerMonitoringTest({
        lockerId,
        cycles: monitoringCycles,
        intervalMs: 50
      });

      expect(powerReadings.length).toBe(monitoringCycles);
      
      // Check power consumption is within expected range
      const avgPower = powerReadings.reduce((a, b) => a + b) / powerReadings.length;
      expect(avgPower).toBeGreaterThan(10);
      expect(avgPower).toBeLessThan(15);
      
      // Check for power spikes or drops
      const maxPower = Math.max(...powerReadings);
      const minPower = Math.min(...powerReadings);
      expect(maxPower - minPower).toBeLessThan(6); // Reasonable variation
    });
  });

  describe('Failure Analysis and Reporting', () => {
    it('should generate comprehensive failure reports', async () => {
      const lockerId = 9;
      const cycles = 20;
      
      // Mock various failure types
      let callCount = 0;
      modbusController.openLocker = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 5 === 0) return Promise.reject(new Error('Communication timeout'));
        if (callCount % 7 === 0) return Promise.resolve(false); // Hardware failure
        return Promise.resolve(true);
      });

      const result = await soakTester.runSoakTest({
        lockerId,
        cycles,
        intervalMs: 10,
        collectFailureDetails: true
      });

      expect(result.failures.length).toBeGreaterThan(0);
      
      // Check failure categorization
      const timeoutFailures = result.failures.filter(f => f.error?.includes('timeout'));
      const hardwareFailures = result.failures.filter(f => f.type === 'hardware_failure');
      
      expect(timeoutFailures.length).toBeGreaterThan(0);
      expect(hardwareFailures.length).toBeGreaterThan(0);
    });

    it('should track failure patterns over time', async () => {
      const lockerId = 10;
      
      // Run multiple soak tests to establish pattern
      const testResults = [];
      
      for (let i = 0; i < 3; i++) {
        modbusController.openLocker = vi.fn().mockImplementation(() => {
          // Simulate degrading performance over time
          const failureRate = 0.1 + (i * 0.05);
          return Promise.resolve(Math.random() > failureRate);
        });

        const result = await soakTester.runSoakTest({
          lockerId,
          cycles: 50,
          intervalMs: 5
        });
        
        testResults.push(result);
      }

      // Verify degradation pattern
      expect(testResults[0].failureRate).toBeLessThan(testResults[1].failureRate);
      expect(testResults[1].failureRate).toBeLessThan(testResults[2].failureRate);
      
      // Check maintenance recommendation
      const maintenanceRecommendation = await soakTester.analyzeFailurePattern(lockerId);
      expect(maintenanceRecommendation.maintenanceRequired).toBe(true);
      expect(maintenanceRecommendation.priority).toBe('high');
    });

    it('should export test results for analysis', async () => {
      const lockerId = 11;
      
      modbusController.openLocker = vi.fn().mockResolvedValue(true);

      await soakTester.runSoakTest({
        lockerId,
        cycles: 10,
        intervalMs: 10
      });

      const exportData = await soakTester.exportTestResults(lockerId);
      
      expect(exportData).toHaveProperty('lockerId', lockerId);
      expect(exportData).toHaveProperty('testHistory');
      expect(exportData).toHaveProperty('statistics');
      expect(exportData).toHaveProperty('recommendations');
      
      expect(Array.isArray(exportData.testHistory)).toBe(true);
      expect(exportData.statistics.totalCycles).toBeGreaterThan(0);
    });
  });
});