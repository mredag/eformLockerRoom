import { DatabaseConnection } from '../database/connection';

export interface LockerStatusData {
  total_lockers?: number;
  available_lockers?: number;
  occupied_lockers?: number;
  error_lockers?: number;
}

export interface KioskTelemetryData {
  voltage?: {
    main_power?: number;      // Main power supply voltage (V)
    backup_power?: number;    // Backup power voltage (V)
    rs485_line_a?: number;    // RS485 A line voltage (V)
    rs485_line_b?: number;    // RS485 B line voltage (V)
  };
  system_status?: {
    cpu_usage?: number;       // CPU usage percentage
    memory_usage?: number;    // Memory usage percentage
    disk_usage?: number;      // Disk usage percentage
    temperature?: number;     // System temperature (°C)
    uptime?: number;          // System uptime in seconds
  };
  hardware_status?: {
    relay_board_connected?: boolean;
    rfid_reader_connected?: boolean;
    display_connected?: boolean;
    network_connected?: boolean;
  };
  locker_status?: LockerStatusData;
}

export interface TelemetryValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedData: KioskTelemetryData;
}

export class TelemetryService {
  private db: DatabaseConnection;

  constructor(db?: DatabaseConnection) {
    this.db = db || DatabaseConnection.getInstance();
  }

  /**
   * Validate telemetry data from kiosk
   */
  validateTelemetryData(data: any): TelemetryValidationResult {
    const result: TelemetryValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      sanitizedData: {}
    };

    if (!data || typeof data !== 'object') {
      result.isValid = false;
      result.errors.push('Telemetry data must be an object');
      return result;
    }

    // Validate voltage data
    if (data.voltage) {
      const voltageResult = this.validateVoltageData(data.voltage);
      result.errors.push(...voltageResult.errors);
      result.warnings.push(...voltageResult.warnings);
      if (voltageResult.sanitizedData) {
        result.sanitizedData.voltage = voltageResult.sanitizedData;
      }
    }

    // Validate system status
    if (data.system_status) {
      const systemResult = this.validateSystemStatus(data.system_status);
      result.errors.push(...systemResult.errors);
      result.warnings.push(...systemResult.warnings);
      if (systemResult.sanitizedData) {
        result.sanitizedData.system_status = systemResult.sanitizedData;
      }
    }

    // Validate hardware status
    if (data.hardware_status) {
      const hardwareResult = this.validateHardwareStatus(data.hardware_status);
      result.errors.push(...hardwareResult.errors);
      result.warnings.push(...hardwareResult.warnings);
      if (hardwareResult.sanitizedData) {
        result.sanitizedData.hardware_status = hardwareResult.sanitizedData;
      }
    }

    // Validate locker status
    if (data.locker_status) {
      const lockerResult = this.validateLockerStatus(data.locker_status);
      result.errors.push(...lockerResult.errors);
      result.warnings.push(...lockerResult.warnings);
      if (lockerResult.sanitizedData) {
        result.sanitizedData.locker_status = lockerResult.sanitizedData;
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Store telemetry data for a kiosk
   */
  async storeTelemetryData(kioskId: string, telemetryData: KioskTelemetryData): Promise<void> {
    try {
      // Update the main heartbeat table with latest telemetry
      await this.db.run(
        `UPDATE kiosk_heartbeat 
         SET telemetry_data = ?, last_telemetry_update = CURRENT_TIMESTAMP 
         WHERE kiosk_id = ?`,
        [JSON.stringify(telemetryData), kioskId]
      );

      // Optionally store in history table for trend analysis
      await this.db.run(
        `INSERT INTO telemetry_history (kiosk_id, telemetry_data) 
         VALUES (?, ?)`,
        [kioskId, JSON.stringify(telemetryData)]
      );
    } catch (error) {
      console.error(`Failed to store telemetry data for kiosk ${kioskId}:`, error);
      throw error;
    }
  }

  /**
   * Get latest telemetry data for a kiosk
   */
  async getTelemetryData(kioskId: string): Promise<KioskTelemetryData | null> {
    try {
      const row = await this.db.get<{ telemetry_data: string }>(
        `SELECT telemetry_data FROM kiosk_heartbeat WHERE kiosk_id = ?`,
        [kioskId]
      );

      if (row?.telemetry_data) {
        return JSON.parse(row.telemetry_data);
      }
      return null;
    } catch (error) {
      console.error(`Failed to get telemetry data for kiosk ${kioskId}:`, error);
      return null;
    }
  }

  /**
   * Get telemetry history for a kiosk
   */
  async getTelemetryHistory(
    kioskId: string, 
    hours: number = 24
  ): Promise<Array<{ recorded_at: Date; data: KioskTelemetryData }>> {
    try {
      const rows = await this.db.all<{ telemetry_data: string; recorded_at: string }>(
        `SELECT telemetry_data, recorded_at 
         FROM telemetry_history 
         WHERE kiosk_id = ? AND recorded_at > datetime('now', '-${hours} hours')
         ORDER BY recorded_at DESC`,
        [kioskId]
      );

      return rows.map(row => ({
        recorded_at: new Date(row.recorded_at),
        data: JSON.parse(row.telemetry_data)
      }));
    } catch (error) {
      console.error(`Failed to get telemetry history for kiosk ${kioskId}:`, error);
      return [];
    }
  }

  /**
   * Clean up old telemetry history
   */
  async cleanupOldTelemetry(retentionDays: number = 7): Promise<number> {
    try {
      const result = await this.db.run(
        `DELETE FROM telemetry_history 
         WHERE recorded_at < datetime('now', '-${retentionDays} days')`
      );
      return result.changes || 0;
    } catch (error) {
      console.error('Failed to cleanup old telemetry data:', error);
      return 0;
    }
  }

  private validateVoltageData(voltage: any): {
    errors: string[];
    warnings: string[];
    sanitizedData?: any;
  } {
    const result = { errors: [], warnings: [], sanitizedData: {} };

    if (typeof voltage !== 'object') {
      result.errors.push('Voltage data must be an object');
      return result;
    }

    // Validate main power voltage (typical range: 11-13V for 12V systems)
    if (voltage.main_power !== undefined) {
      const mainPower = Number(voltage.main_power);
      if (isNaN(mainPower)) {
        result.errors.push('Main power voltage must be a number');
      } else if (mainPower < 0 || mainPower > 50) {
        result.errors.push('Main power voltage out of valid range (0-50V)');
      } else {
        result.sanitizedData.main_power = mainPower;
        if (mainPower < 11 || mainPower > 13) {
          result.warnings.push(`Main power voltage ${mainPower}V is outside normal range (11-13V)`);
        }
      }
    }

    // Validate backup power voltage
    if (voltage.backup_power !== undefined) {
      const backupPower = Number(voltage.backup_power);
      if (isNaN(backupPower)) {
        result.errors.push('Backup power voltage must be a number');
      } else if (backupPower < 0 || backupPower > 50) {
        result.errors.push('Backup power voltage out of valid range (0-50V)');
      } else {
        result.sanitizedData.backup_power = backupPower;
      }
    }

    // Validate RS485 line voltages (typical range: 0-5V)
    ['rs485_line_a', 'rs485_line_b'].forEach(field => {
      if (voltage[field] !== undefined) {
        const lineVoltage = Number(voltage[field]);
        if (isNaN(lineVoltage)) {
          result.errors.push(`${field} voltage must be a number`);
        } else if (lineVoltage < 0 || lineVoltage > 10) {
          result.errors.push(`${field} voltage out of valid range (0-10V)`);
        } else {
          result.sanitizedData[field] = lineVoltage;
        }
      }
    });

    return result;
  }

  private validateSystemStatus(systemStatus: any): {
    errors: string[];
    warnings: string[];
    sanitizedData?: any;
  } {
    const result = { errors: [], warnings: [], sanitizedData: {} };

    if (typeof systemStatus !== 'object') {
      result.errors.push('System status must be an object');
      return result;
    }

    // Validate percentage fields (0-100)
    ['cpu_usage', 'memory_usage', 'disk_usage'].forEach(field => {
      if (systemStatus[field] !== undefined) {
        const value = Number(systemStatus[field]);
        if (isNaN(value)) {
          result.errors.push(`${field} must be a number`);
        } else if (value < 0 || value > 100) {
          result.errors.push(`${field} must be between 0 and 100`);
        } else {
          result.sanitizedData[field] = value;
          if (value > 90) {
            result.warnings.push(`High ${field}: ${value}%`);
          }
        }
      }
    });

    // Validate temperature (reasonable range: -10 to 80°C)
    if (systemStatus.temperature !== undefined) {
      const temp = Number(systemStatus.temperature);
      if (isNaN(temp)) {
        result.errors.push('Temperature must be a number');
      } else if (temp < -20 || temp > 100) {
        result.errors.push('Temperature out of valid range (-20 to 100°C)');
      } else {
        result.sanitizedData.temperature = temp;
        if (temp > 70) {
          result.warnings.push(`High temperature: ${temp}°C`);
        }
      }
    }

    // Validate uptime (must be positive)
    if (systemStatus.uptime !== undefined) {
      const uptime = Number(systemStatus.uptime);
      if (isNaN(uptime)) {
        result.errors.push('Uptime must be a number');
      } else if (uptime < 0) {
        result.errors.push('Uptime must be positive');
      } else {
        result.sanitizedData.uptime = uptime;
      }
    }

    return result;
  }

  private validateHardwareStatus(hardwareStatus: any): {
    errors: string[];
    warnings: string[];
    sanitizedData?: any;
  } {
    const result = { errors: [], warnings: [], sanitizedData: {} };

    if (typeof hardwareStatus !== 'object') {
      result.errors.push('Hardware status must be an object');
      return result;
    }

    // Validate boolean fields
    ['relay_board_connected', 'rfid_reader_connected', 'display_connected', 'network_connected'].forEach(field => {
      if (hardwareStatus[field] !== undefined) {
        if (typeof hardwareStatus[field] !== 'boolean') {
          result.errors.push(`${field} must be a boolean`);
        } else {
          result.sanitizedData[field] = hardwareStatus[field];
          if (!hardwareStatus[field]) {
            result.warnings.push(`${field} is disconnected`);
          }
        }
      }
    });

    return result;
  }

  private validateLockerStatus(lockerStatus: any): {
    errors: string[];
    warnings: string[];
    sanitizedData: LockerStatusData;
  } {
    const result: { errors: string[]; warnings: string[]; sanitizedData: LockerStatusData } = {
      errors: [],
      warnings: [],
      sanitizedData: {},
    };

    if (typeof lockerStatus !== 'object') {
      result.errors.push('Locker status must be an object');
      return result;
    }

    // Validate integer fields
    (['total_lockers', 'available_lockers', 'occupied_lockers', 'error_lockers'] as Array<keyof LockerStatusData>).forEach(field => {
      if (lockerStatus[field] !== undefined) {
        const value = Number(lockerStatus[field]);
        if (isNaN(value) || !Number.isInteger(value)) {
          result.errors.push(`${field} must be an integer`);
        } else if (value < 0) {
          result.errors.push(`${field} must be non-negative`);
        } else {
          result.sanitizedData[field] = value;
        }
      }
    });

    // Validate that counts make sense
    const { total_lockers, available_lockers, occupied_lockers, error_lockers } = result.sanitizedData;
    if (total_lockers !== undefined && available_lockers !== undefined && occupied_lockers !== undefined) {
      const sum = available_lockers + occupied_lockers + (error_lockers || 0);
      if (sum !== total_lockers) {
        result.warnings.push(`Locker counts don't add up: ${available_lockers} + ${occupied_lockers} + ${error_lockers || 0} ≠ ${total_lockers}`);
      }
    }

    return result;
  }
}