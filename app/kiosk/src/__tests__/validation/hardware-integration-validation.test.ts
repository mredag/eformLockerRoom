import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModbusController } from '../../hardware/modbus-controller';
import { RfidHandler } from '../../hardware/rfid-handler';
import { RS485Diagnostics } from '../../hardware/rs485-diagnostics';

describe('Hardware Integration Validation', () => {
  let modbusController: ModbusController;
  let rfidHandler: RfidHandler;
  let rs485Diagnostics: RS485Diagnostics;

  beforeEach(async () => {
    // Use mock implementations for testing
    modbusController = new ModbusController({
      port: '/dev/ttyUSB0',
      baudRate: 9600,
      timeout: 1000,
      mock: true // Enable mock mode for testing
    });

    rfidHandler = new RfidHandler({
      mode: 'hid',
      mock: true // Enable mock mode for testing
    });

    rs485Diagnostics = new RS485Diagnostics({
      port: '/dev/ttyUSB0',
      baudrate: 9600,
      timeout_ms: 1000,
      mock: true
    });

    await modbusController.initialize();
    await rfidHandler.initialize();
  });

  afterEach(async () => {
    if (modbusController && typeof modbusController.close === 'function') {
      await modbusController.close();
    }
    if (rfidHandler && typeof rfidHandler.close === 'function') {
      await rfidHandler.close();
    }
  });

  describe('Modbus Hardware Integration (Requirement 7)', () => {
    it('should validate 400ms pulse timing (Req 7.1)', async () => {
      const channel = 1;
      const startTime = Date.now();

      const result = await modbusController.sendPulse(channel, 400);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).toBe(true);
      // Allow some tolerance for timing (±50ms)
      expect(duration).toBeGreaterThanOrEqual(350);
      expect(duration).toBeLessThanOrEqual(450);

      console.log(`Pulse timing: ${duration}ms (target: 400ms)`);
    });

    it('should validate burst opening sequence (Req 7.2)', async () => {
      const channel = 2;
      const startTime = Date.now();

      const result = await modbusController.performBurstOpening(channel);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).toBe(true);
      // Burst opening: 10 seconds with 2-second intervals
      // Should take approximately 10 seconds
      expect(duration).toBeGreaterThanOrEqual(9000);
      expect(duration).toBeLessThanOrEqual(11000);

      console.log(`Burst opening duration: ${duration}ms (target: ~10000ms)`);
    });

    it('should validate command serialization (Req 7.3)', async () => {
      const commands = [
        { channel: 1, duration: 400 },
        { channel: 2, duration: 400 },
        { channel: 3, duration: 400 }
      ];

      const startTime = Date.now();
      const results = [];

      // Execute commands sequentially
      for (const cmd of commands) {
        const cmdStart = Date.now();
        const result = await modbusController.sendPulse(cmd.channel, cmd.duration);
        const cmdEnd = Date.now();
        
        results.push({
          result,
          duration: cmdEnd - cmdStart,
          timestamp: cmdStart
        });

        // Ensure minimum 300ms interval between commands
        if (commands.indexOf(cmd) < commands.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      const totalDuration = Date.now() - startTime;

      // All commands should succeed
      expect(results.every(r => r.result === true)).toBe(true);

      // Total duration should account for intervals
      // 3 commands × 400ms + 2 intervals × 300ms = 1800ms minimum
      expect(totalDuration).toBeGreaterThanOrEqual(1800);

      // Verify intervals between commands
      for (let i = 1; i < results.length; i++) {
        const interval = results[i].timestamp - (results[i-1].timestamp + results[i-1].duration);
        expect(interval).toBeGreaterThanOrEqual(250); // Allow some tolerance
      }

      console.log(`Command serialization: ${totalDuration}ms for ${commands.length} commands`);
    });

    it('should validate error handling and retry logic (Req 7.4)', async () => {
      // Simulate communication error
      modbusController.simulateError('TIMEOUT');

      const channel = 4;
      const result = await modbusController.sendPulse(channel, 400);

      // Should attempt retry and eventually succeed or fail gracefully
      expect(typeof result).toBe('boolean');

      // Check error was logged
      const errors = modbusController.getErrorLog();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].type).toBe('TIMEOUT');

      console.log(`Error handling test: ${result ? 'recovered' : 'failed gracefully'}`);
    });

    it('should validate RS485 bus configuration (Req 7.7)', async () => {
      const diagnostics = await rs485Diagnostics.runFullDiagnostics();

      expect(diagnostics.bus_scan).toBeDefined();
      expect(diagnostics.termination_check).toBeDefined();
      expect(diagnostics.failsafe_resistors).toBeDefined();

      // Verify termination (120Ω at endpoints)
      expect(diagnostics.termination_check.status).toBe('ok');
      expect(diagnostics.termination_check.resistance).toBeCloseTo(120, 10);

      // Verify failsafe resistors
      expect(diagnostics.failsafe_resistors.a_line.status).toBe('ok');
      expect(diagnostics.failsafe_resistors.a_line.resistance).toBeCloseTo(680, 50);
      expect(diagnostics.failsafe_resistors.b_line.status).toBe('ok');
      expect(diagnostics.failsafe_resistors.b_line.resistance).toBeCloseTo(680, 50);

      console.log('RS485 Diagnostics:', {
        termination: `${diagnostics.termination_check.resistance}Ω`,
        failsafe_a: `${diagnostics.failsafe_resistors.a_line.resistance}Ω`,
        failsafe_b: `${diagnostics.failsafe_resistors.b_line.resistance}Ω`
      });
    });

    it('should validate relay channel isolation', async () => {
      // Test that only one relay operates at a time
      const channels = [1, 2, 3, 4];
      const activeChannels = [];

      // Start multiple operations simultaneously
      const operations = channels.map(async (channel) => {
        const start = Date.now();
        await modbusController.sendPulse(channel, 400);
        const end = Date.now();
        
        activeChannels.push({
          channel,
          start,
          end,
          duration: end - start
        });
      });

      await Promise.all(operations);

      // Sort by start time
      activeChannels.sort((a, b) => a.start - b.start);

      // Verify no overlap (serialized execution)
      for (let i = 1; i < activeChannels.length; i++) {
        const prev = activeChannels[i - 1];
        const curr = activeChannels[i];
        
        // Current operation should start after previous ends
        expect(curr.start).toBeGreaterThanOrEqual(prev.end);
      }

      console.log('Relay isolation verified - operations serialized correctly');
    });
  });

  describe('RFID Hardware Integration', () => {
    it('should validate card scanning and debouncing', async () => {
      const cardId = 'test-card-001';
      const scannedCards = [];

      // Set up card scan handler
      rfidHandler.onCardScanned = async (card) => {
        scannedCards.push({
          card,
          timestamp: Date.now()
        });
      };

      // Simulate rapid card scans (should be debounced)
      await rfidHandler.simulateCardScan(cardId);
      await new Promise(resolve => setTimeout(resolve, 100));
      await rfidHandler.simulateCardScan(cardId); // Should be debounced
      await new Promise(resolve => setTimeout(resolve, 1100));
      await rfidHandler.simulateCardScan(cardId); // Should be accepted

      // Should have 2 scans (first and third, second debounced)
      expect(scannedCards.length).toBe(2);
      expect(scannedCards[0].card).toBe(cardId);
      expect(scannedCards[1].card).toBe(cardId);

      // Verify debouncing interval (1 second)
      const interval = scannedCards[1].timestamp - scannedCards[0].timestamp;
      expect(interval).toBeGreaterThanOrEqual(1000);

      console.log(`RFID debouncing: ${interval}ms interval between accepted scans`);
    });

    it('should validate UID hashing and standardization', async () => {
      const rawUIDs = [
        '04:52:7A:B2:3C:80',
        '04527AB23C80',
        '04 52 7A B2 3C 80',
        '04-52-7A-B2-3C-80'
      ];

      const hashedUIDs = rawUIDs.map(uid => rfidHandler.standardizeUID(uid));

      // All variations should produce the same standardized UID
      const uniqueUIDs = [...new Set(hashedUIDs)];
      expect(uniqueUIDs.length).toBe(1);

      // Should be consistent format
      expect(uniqueUIDs[0]).toMatch(/^[A-F0-9]{12}$/);

      console.log(`UID standardization: ${rawUIDs.length} formats → "${uniqueUIDs[0]}"`);
    });

    it('should validate multiple reader support', async () => {
      // Test both HID and keyboard input modes
      const hidReader = new RfidHandler({ mode: 'hid', mock: true });
      const keyboardReader = new RfidHandler({ mode: 'keyboard', mock: true });

      await hidReader.initialize();
      await keyboardReader.initialize();

      const testCard = 'multi-reader-test';
      const hidResult = await hidReader.simulateCardScan(testCard);
      const keyboardResult = await keyboardReader.simulateCardScan(testCard);

      expect(hidResult).toBe(true);
      expect(keyboardResult).toBe(true);

      await hidReader.close();
      await keyboardReader.close();

      console.log('Multiple RFID reader modes validated');
    });
  });

  describe('Hardware Health Monitoring', () => {
    it('should validate hardware health checks', async () => {
      const modbusHealth = await modbusController.getHealthStatus();
      const rfidHealth = await rfidHandler.getHealthStatus();

      // Modbus health
      expect(modbusHealth.status).toBe('ok');
      expect(modbusHealth.port).toBeDefined();
      expect(modbusHealth.last_successful_command).toBeDefined();
      expect(modbusHealth.error_count).toBeGreaterThanOrEqual(0);

      // RFID health
      expect(rfidHealth.status).toBe('ok');
      expect(rfidHealth.last_scan).toBeDefined();
      expect(rfidHealth.scan_count).toBeGreaterThanOrEqual(0);

      console.log('Hardware Health:', {
        modbus: modbusHealth.status,
        rfid: rfidHealth.status
      });
    });

    it('should validate hardware failure detection', async () => {
      // Simulate hardware failures
      modbusController.simulateFailure('CONNECTION_LOST');
      rfidHandler.simulateFailure('DEVICE_DISCONNECTED');

      const modbusHealth = await modbusController.getHealthStatus();
      const rfidHealth = await rfidHandler.getHealthStatus();

      expect(modbusHealth.status).toBe('error');
      expect(modbusHealth.last_error).toBe('CONNECTION_LOST');

      expect(rfidHealth.status).toBe('error');
      expect(rfidHealth.last_error).toBe('DEVICE_DISCONNECTED');

      // Test recovery
      modbusController.clearFailure();
      rfidHandler.clearFailure();

      const recoveredModbusHealth = await modbusController.getHealthStatus();
      const recoveredRfidHealth = await rfidHandler.getHealthStatus();

      expect(recoveredModbusHealth.status).toBe('ok');
      expect(recoveredRfidHealth.status).toBe('ok');

      console.log('Hardware failure detection and recovery validated');
    });
  });

  describe('Environmental and Stress Testing', () => {
    it('should validate operation under temperature variations', async () => {
      // Simulate different temperature conditions
      const temperatures = [-10, 0, 25, 40, 60]; // Celsius
      const results = [];

      for (const temp of temperatures) {
        modbusController.setEnvironmentalCondition('temperature', temp);
        
        const startTime = Date.now();
        const result = await modbusController.sendPulse(1, 400);
        const duration = Date.now() - startTime;

        results.push({
          temperature: temp,
          success: result,
          duration
        });
      }

      // All operations should succeed within reasonable temperature range
      const normalTempResults = results.filter(r => r.temperature >= 0 && r.temperature <= 50);
      expect(normalTempResults.every(r => r.success)).toBe(true);

      // Performance should remain consistent
      const durations = normalTempResults.map(r => r.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxVariation = Math.max(...durations) - Math.min(...durations);
      
      expect(maxVariation).toBeLessThan(200); // Less than 200ms variation

      console.log(`Temperature testing: avg ${avgDuration.toFixed(1)}ms, variation ${maxVariation}ms`);
    });

    it('should validate extended operation endurance', async () => {
      const cycles = 100;
      const results = [];
      let consecutiveFailures = 0;

      for (let i = 0; i < cycles; i++) {
        const channel = (i % 4) + 1; // Rotate through channels 1-4
        const startTime = Date.now();
        
        try {
          const result = await modbusController.sendPulse(channel, 400);
          const duration = Date.now() - startTime;
          
          results.push({
            cycle: i + 1,
            channel,
            success: result,
            duration
          });

          if (result) {
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }

          // Fail if too many consecutive failures
          if (consecutiveFailures > 5) {
            throw new Error(`Too many consecutive failures: ${consecutiveFailures}`);
          }

        } catch (error) {
          console.error(`Cycle ${i + 1} failed:`, error);
          break;
        }

        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const successRate = results.filter(r => r.success).length / results.length;
      const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

      // Should maintain high success rate
      expect(successRate).toBeGreaterThan(0.95); // 95% success rate

      // Performance should remain consistent
      expect(avgDuration).toBeLessThan(500);

      console.log(`Endurance test: ${results.length} cycles, ${(successRate * 100).toFixed(1)}% success, avg ${avgDuration.toFixed(1)}ms`);
    });

    it('should validate power interruption recovery', async () => {
      // Simulate power interruption
      await modbusController.simulatePowerInterruption();
      await rfidHandler.simulatePowerInterruption();

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test functionality after recovery
      const modbusRecovery = await modbusController.sendPulse(1, 400);
      const rfidRecovery = await rfidHandler.simulateCardScan('recovery-test');

      expect(modbusRecovery).toBe(true);
      expect(rfidRecovery).toBe(true);

      // Verify systems are fully operational
      const modbusHealth = await modbusController.getHealthStatus();
      const rfidHealth = await rfidHandler.getHealthStatus();

      expect(modbusHealth.status).toBe('ok');
      expect(rfidHealth.status).toBe('ok');

      console.log('Power interruption recovery validated');
    });
  });

  describe('Integration with System Components', () => {
    it('should validate hardware-software integration', async () => {
      // Test complete hardware-software flow
      const testCard = 'integration-test-001';
      const lockerId = 15;

      // Simulate RFID scan
      let cardScanned = false;
      rfidHandler.onCardScanned = async (card) => {
        expect(card).toBe(testCard);
        cardScanned = true;
        
        // Trigger locker opening
        const openResult = await modbusController.sendPulse(lockerId, 400);
        expect(openResult).toBe(true);
      };

      await rfidHandler.simulateCardScan(testCard);

      // Verify complete flow
      expect(cardScanned).toBe(true);

      console.log('Hardware-software integration validated');
    });

    it('should validate error propagation to system', async () => {
      const errors = [];

      // Set up error handlers
      modbusController.onError = (error) => {
        errors.push({ component: 'modbus', error });
      };

      rfidHandler.onError = (error) => {
        errors.push({ component: 'rfid', error });
      };

      // Trigger errors
      modbusController.simulateError('COMMUNICATION_FAILURE');
      rfidHandler.simulateError('READ_ERROR');

      // Wait for error propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(errors.length).toBe(2);
      expect(errors.find(e => e.component === 'modbus')).toBeDefined();
      expect(errors.find(e => e.component === 'rfid')).toBeDefined();

      console.log('Error propagation validated:', errors.map(e => `${e.component}: ${e.error.type}`));
    });
  });
});