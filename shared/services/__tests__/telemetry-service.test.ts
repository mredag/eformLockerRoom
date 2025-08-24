import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryService, KioskTelemetryData } from '../telemetry-service';
import { DatabaseConnection } from '../../database/connection';

describe('TelemetryService', () => {
  let telemetryService: TelemetryService;
  let db: DatabaseConnection;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();
    
    // Create the required tables
    await db.run(`
      CREATE TABLE kiosk_heartbeat (
        kiosk_id TEXT PRIMARY KEY,
        last_seen DATETIME NOT NULL,
        zone TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'online',
        version TEXT NOT NULL,
        telemetry_data TEXT,
        last_telemetry_update DATETIME
      )
    `);
    
    await db.run(`
      CREATE TABLE telemetry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kiosk_id TEXT NOT NULL,
        telemetry_data TEXT NOT NULL,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert a test kiosk
    await db.run(
      `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, version) 
       VALUES (?, ?, ?, ?)`,
      ['test-kiosk-1', new Date().toISOString(), 'zone-a', '1.0.0']
    );
    
    telemetryService = new TelemetryService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('validateTelemetryData', () => {
    it('should validate valid telemetry data', () => {
      const validData: KioskTelemetryData = {
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

      const result = telemetryService.validateTelemetryData(validData);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitizedData).toEqual(validData);
    });

    it('should reject invalid voltage data', () => {
      const invalidData = {
        voltage: {
          main_power: 'invalid',
          backup_power: -5,
          rs485_line_a: 100
        }
      };

      const result = telemetryService.validateTelemetryData(invalidData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Main power voltage must be a number');
      expect(result.errors).toContain('Backup power voltage out of valid range (0-50V)');
      expect(result.errors).toContain('rs485_line_a voltage out of valid range (0-10V)');
    });

    it('should generate warnings for out-of-range values', () => {
      const warningData = {
        voltage: {
          main_power: 10.5 // Below normal range
        },
        system_status: {
          cpu_usage: 95, // High CPU usage
          temperature: 75 // High temperature
        }
      };

      const result = telemetryService.validateTelemetryData(warningData);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Main power voltage 10.5V is outside normal range (11-13V)');
      expect(result.warnings).toContain('High cpu_usage: 95%');
      expect(result.warnings).toContain('High temperature: 75°C');
    });

    it('should validate hardware status boolean fields', () => {
      const invalidHardwareData = {
        hardware_status: {
          relay_board_connected: 'yes', // Should be boolean
          rfid_reader_connected: false
        }
      };

      const result = telemetryService.validateTelemetryData(invalidHardwareData);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('relay_board_connected must be a boolean');
      expect(result.warnings).toContain('rfid_reader_connected is disconnected');
    });

    it('should validate locker status counts', () => {
      const invalidLockerData = {
        locker_status: {
          total_lockers: 20,
          available_lockers: 10,
          occupied_lockers: 5,
          error_lockers: 2 // 10 + 5 + 2 = 17, not 20
        }
      };

      const result = telemetryService.validateTelemetryData(invalidLockerData);
      
      expect(result.isValid).toBe(true); // Still valid, just a warning
      expect(result.warnings).toContain("Locker counts don't add up: 10 + 5 + 2 ≠ 20");
    });
  });

  describe('storeTelemetryData', () => {
    it('should store telemetry data successfully', async () => {
      const telemetryData: KioskTelemetryData = {
        voltage: {
          main_power: 12.5
        },
        system_status: {
          cpu_usage: 45
        }
      };

      await telemetryService.storeTelemetryData('test-kiosk-1', telemetryData);

      // Verify data was stored in heartbeat table
      const heartbeatRow = await db.get(
        'SELECT telemetry_data, last_telemetry_update FROM kiosk_heartbeat WHERE kiosk_id = ?',
        ['test-kiosk-1']
      );

      expect(heartbeatRow).toBeDefined();
      expect(heartbeatRow.telemetry_data).toBeDefined();
      expect(JSON.parse(heartbeatRow.telemetry_data)).toEqual(telemetryData);
      expect(heartbeatRow.last_telemetry_update).toBeDefined();

      // Verify data was stored in history table
      const historyRows = await db.all(
        'SELECT telemetry_data FROM telemetry_history WHERE kiosk_id = ?',
        ['test-kiosk-1']
      );

      expect(historyRows).toHaveLength(1);
      expect(JSON.parse(historyRows[0].telemetry_data)).toEqual(telemetryData);
    });
  });

  describe('getTelemetryData', () => {
    it('should retrieve stored telemetry data', async () => {
      const telemetryData: KioskTelemetryData = {
        voltage: {
          main_power: 12.5
        }
      };

      await telemetryService.storeTelemetryData('test-kiosk-1', telemetryData);
      const retrieved = await telemetryService.getTelemetryData('test-kiosk-1');

      expect(retrieved).toEqual(telemetryData);
    });

    it('should return null for non-existent kiosk', async () => {
      const retrieved = await telemetryService.getTelemetryData('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getTelemetryHistory', () => {
    it('should retrieve telemetry history', async () => {
      const telemetryData1: KioskTelemetryData = { voltage: { main_power: 12.5 } };
      const telemetryData2: KioskTelemetryData = { voltage: { main_power: 12.3 } };

      await telemetryService.storeTelemetryData('test-kiosk-1', telemetryData1);
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await telemetryService.storeTelemetryData('test-kiosk-1', telemetryData2);

      const history = await telemetryService.getTelemetryHistory('test-kiosk-1', 24);

      expect(history).toHaveLength(2);
      expect(history[0].recorded_at).toBeInstanceOf(Date);
      expect(history[1].recorded_at).toBeInstanceOf(Date);
      
      // Check that we have both data entries (order may vary due to timing)
      const dataEntries = history.map(h => h.data);
      expect(dataEntries).toContainEqual(telemetryData1);
      expect(dataEntries).toContainEqual(telemetryData2);
    });
  });

  describe('cleanupOldTelemetry', () => {
    it('should clean up old telemetry records', async () => {
      // Insert old record manually
      await db.run(
        `INSERT INTO telemetry_history (kiosk_id, telemetry_data, recorded_at) 
         VALUES (?, ?, datetime('now', '-10 days'))`,
        ['test-kiosk-1', JSON.stringify({ voltage: { main_power: 12.0 } })]
      );

      // Insert recent record
      await telemetryService.storeTelemetryData('test-kiosk-1', { voltage: { main_power: 12.5 } });

      const deletedCount = await telemetryService.cleanupOldTelemetry(7);

      expect(deletedCount).toBe(1);

      // Verify only recent record remains
      const remainingRecords = await db.all('SELECT * FROM telemetry_history');
      expect(remainingRecords).toHaveLength(1);
    });
  });
});