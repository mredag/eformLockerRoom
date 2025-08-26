/**
 * Modbus Controller for Eform Locker System
 * Handles relay control with serial execution and command queuing
 * Requirements: 7.1, 7.2, 7.6
 */

import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

export interface ModbusConfig {
  port: string;
  baudrate: number;
  timeout_ms: number;
  pulse_duration_ms: number;
  burst_duration_seconds: number;
  burst_interval_ms: number;
  command_interval_ms: number;
  max_retries?: number;
  retry_delay_base_ms?: number;
  retry_delay_max_ms?: number;
  connection_retry_attempts?: number;
  health_check_interval_ms?: number;
  test_mode?: boolean; // Disable queue processor for testing
  use_multiple_coils?: boolean; // Use 0x0F instead of 0x05 for Waveshare compatibility
  verify_writes?: boolean; // Read back after write for verification
}

export interface RelayCard {
  slave_address: number;
  channels: number;
  type: string;
  dip_switches?: string;
}

export interface RelayCommand {
  command_id: string;
  channel: number;
  operation: 'pulse' | 'burst';
  duration_ms?: number;
  created_at: Date;
  retry_count: number;
}

export interface RelayStatus {
  channel: number;
  is_active: boolean;
  last_operation: Date;
  total_operations: number;
  failure_count: number;
}

export interface ModbusHealth {
  status: 'ok' | 'error' | 'degraded' | 'disconnected';
  port: string;
  last_successful_command: Date;
  total_commands: number;
  failed_commands: number;
  connection_errors: number;
  retry_attempts: number;
  last_connection_attempt: Date;
  uptime_seconds: number;
  error_rate_percent: number;
}

/**
 * Mutex implementation for ensuring serial execution of relay commands
 */
class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

/**
 * ModbusController class with mutex for single-channel operation
 * Implements 400ms pulse timing and burst opening with command queuing
 */
export class ModbusController extends EventEmitter {
  private serialPort: SerialPort | null = null;
  private config: ModbusConfig;
  private mutex = new Mutex();
  private commandQueue: RelayCommand[] = [];
  private isProcessingQueue = false;
  private relayStatus = new Map<number, RelayStatus>();
  private lockerMutexes = new Map<number, Mutex>(); // Per-locker concurrency guards
  private health: ModbusHealth;
  private lastCommandTime = 0;
  private connectionRetryCount = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  constructor(config: ModbusConfig) {
    super();
    
    // Validate config parameter
    if (!config) {
      throw new Error('ModbusController: config parameter is required');
    }
    
    if (!config.port) {
      throw new Error('ModbusController: config.port is required');
    }
    
    this.config = config;
    this.health = {
      status: 'disconnected',
      port: config.port,
      last_successful_command: new Date(0),
      total_commands: 0,
      failed_commands: 0,
      connection_errors: 0,
      retry_attempts: 0,
      last_connection_attempt: new Date(0),
      uptime_seconds: 0,
      error_rate_percent: 0
    };
    
    // Set max listeners to prevent warnings during testing
    this.setMaxListeners(20);
  }

  /**
   * Initialize the Modbus connection with retry logic
   */
  async initialize(): Promise<void> {
    const maxRetries = this.config.connection_retry_attempts || 3;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.attemptConnection();
        
        // Start processing command queue and health monitoring (unless in test mode)
        if (!this.config.test_mode) {
          this.startQueueProcessor();
          this.startHealthMonitoring();
        }
        
        this.connectionRetryCount = 0;
        this.health.status = 'ok';
        this.health.last_connection_attempt = new Date();
        this.emit('connected');
        return;
        
      } catch (error) {
        this.connectionRetryCount++;
        this.health.connection_errors++;
        this.health.retry_attempts++;
        this.health.last_connection_attempt = new Date();
        
        if (attempt === maxRetries) {
          this.health.status = 'error';
          throw new Error(`Failed to initialize Modbus after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Exponential backoff
        const delay = this.calculateRetryDelay(attempt);
        await this.delay(delay);
      }
    }
  }

  /**
   * Attempt to establish connection
   */
  private async attemptConnection(): Promise<void> {
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
          reject(new Error(`Failed to open Modbus port: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retry_delay_base_ms || 1000;
    const maxDelay = this.config.retry_delay_max_ms || 30000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }

  /**
   * Open a locker with the specified ID with retry logic
   * Maps locker_id to cardId and relayId using the correct formulas
   * Returns true if successful, false if failed
   */
  async openLocker(lockerId: number, slaveAddress?: number): Promise<boolean> {
    // Get or create per-locker mutex to prevent concurrent operations on same locker
    if (!this.lockerMutexes.has(lockerId)) {
      this.lockerMutexes.set(lockerId, new Mutex());
    }
    const lockerMutex = this.lockerMutexes.get(lockerId)!;
    
    // Acquire per-locker lock
    await lockerMutex.acquire();
    
    try {
      const commandId = `open_${lockerId}_${Date.now()}`;
      const maxRetries = this.config.max_retries || 2;
      
      // Map locker_id to cardId and relayId using the specified formulas
      const cardId = Math.ceil(lockerId / 16);
      const relayId = ((lockerId - 1) % 16) + 1;
      
      // Use cardId as slaveAddress if not provided
      const targetSlaveAddress = slaveAddress || cardId;
    
    try {
      // First attempt with single pulse
      let pulseSuccess = false;
      for (let attempt = 0; attempt <= maxRetries && !pulseSuccess; attempt++) {
        pulseSuccess = await this.executeCommand({
          command_id: `${commandId}_pulse_${attempt}`,
          channel: relayId, // Use mapped relayId instead of lockerId
          operation: 'pulse',
          duration_ms: this.config.pulse_duration_ms,
          created_at: new Date(),
          retry_count: attempt
        }, targetSlaveAddress);
        
        if (!pulseSuccess && attempt < maxRetries) {
          await this.delay(this.calculateRetryDelay(attempt));
        }
      }

      if (pulseSuccess) {
        return true;
      }

      // If pulse fails after retries, attempt burst opening with retries
      let burstSuccess = false;
      for (let attempt = 0; attempt <= maxRetries && !burstSuccess; attempt++) {
        burstSuccess = await this.executeCommand({
          command_id: `${commandId}_burst_${attempt}`,
          channel: relayId, // Use mapped relayId instead of lockerId
          operation: 'burst',
          created_at: new Date(),
          retry_count: attempt
        }, targetSlaveAddress);
        
        if (!burstSuccess && attempt < maxRetries) {
          await this.delay(this.calculateRetryDelay(attempt));
        }
      }

        return burstSuccess;

      } catch (error) {
        this.emit('error', { 
          lockerId, 
          cardId, 
          relayId, 
          error: error instanceof Error ? error.message : String(error) 
        });
        return false;
      }
    } finally {
      // Always release the per-locker mutex
      lockerMutex.release();
    }
  }

  /**
   * Execute a relay command with mutex protection
   */
  private async executeCommand(command: RelayCommand, slaveAddress?: number): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      // Ensure minimum interval between commands (300ms)
      const now = Date.now();
      const timeSinceLastCommand = now - this.lastCommandTime;
      if (timeSinceLastCommand < this.config.command_interval_ms) {
        await this.delay(this.config.command_interval_ms - timeSinceLastCommand);
      }

      let success = false;
      
      try {
        if (command.operation === 'pulse') {
          success = await this.sendPulse(command.channel, command.duration_ms, slaveAddress);
        } else if (command.operation === 'burst') {
          success = await this.performBurstOpening(command.channel, slaveAddress);
        }
      } catch (error) {
        // Handle errors from sendPulse/performBurstOpening
        success = false;
      }

      this.lastCommandTime = Date.now();
      this.updateRelayStatus(command.channel, success);
      this.updateHealth(success);

      return success;

    } finally {
      this.mutex.release();
    }
  }

  /**
   * Send a pulse to the specified relay channel (Waveshare compatible)
   * Implements fallback: try 0x0F (write multiple coils), fall back to 0x05 (single coil) if it fails
   */
  private async sendPulse(channel: number, duration: number = 400, slaveAddress: number = 1): Promise<boolean> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Modbus port not connected');
    }

    try {
      let success = false;
      
      // First try Write Multiple Coils (0x0F) - Waveshare preferred method
      try {
        const turnOnCommand = this.buildWriteMultipleCoilsCommand(slaveAddress, channel - 1, 1, [true]);
        await this.writeCommand(turnOnCommand);
        await this.delay(duration);
        
        const turnOffCommand = this.buildWriteMultipleCoilsCommand(slaveAddress, channel - 1, 1, [false]);
        await this.writeCommand(turnOffCommand);
        
        success = true;
        
      } catch (multipleCoilsError) {
        // Enhanced fallback logging with error details
        const errorMessage = multipleCoilsError instanceof Error ? multipleCoilsError.message : String(multipleCoilsError);
        const isTimeoutError = errorMessage.toLowerCase().includes('timeout');
        const isCrcError = errorMessage.toLowerCase().includes('crc');
        
        console.warn(`⚠️  0x0F (Write Multiple Coils) failed for channel ${channel}, slave ${slaveAddress}: ${errorMessage}`);
        
        this.emit('warning', { 
          channel, 
          slaveAddress, 
          message: 'Multiple coils (0x0F) command failed, falling back to single coil (0x05)',
          error: errorMessage,
          error_type: isTimeoutError ? 'timeout' : isCrcError ? 'crc' : 'unknown',
          fallback_attempted: true
        });
        
        try {
          const turnOnCommand = this.buildModbusCommand(slaveAddress, 0x05, channel - 1, 0xFF00);
          await this.writeCommand(turnOnCommand);
          await this.delay(duration);
          
          const turnOffCommand = this.buildModbusCommand(slaveAddress, 0x05, channel - 1, 0x0000);
          await this.writeCommand(turnOffCommand);
          
          success = true;
          
        } catch (singleCoilError) {
          throw new Error(`Both multiple coils (0x0F) and single coil (0x05) commands failed. Multiple: ${multipleCoilsError instanceof Error ? multipleCoilsError.message : String(multipleCoilsError)}, Single: ${singleCoilError instanceof Error ? singleCoilError.message : String(singleCoilError)}`);
        }
      }
      
      // Verify write if enabled and command was successful
      if (success && this.config.verify_writes) {
        try {
          const status = await this.readRelayStatus(slaveAddress, channel - 1, 1);
          if (status.length > 0 && status[0]) {
            // Relay is still on, which might indicate a problem
            this.emit('warning', { channel, slaveAddress, message: 'Relay verification shows unexpected state - relay still active' });
          }
        } catch (verifyError) {
          // Don't fail the operation if verification fails, just warn
          this.emit('warning', { 
            channel, 
            slaveAddress, 
            message: 'Relay verification failed',
            error: verifyError instanceof Error ? verifyError.message : String(verifyError)
          });
        }
      }
      
      return success;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { channel, slaveAddress, operation: 'pulse', error: errorMessage });
      return false;
    }
  }

  /**
   * Send close relay command (turn OFF only)
   * Used to ensure relay is closed after burst operations
   */
  private async sendCloseRelay(channel: number, slaveAddress: number = 1): Promise<boolean> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Modbus port not connected');
    }

    try {
      let success = false;
      
      // First try Write Multiple Coils (0x0F) to turn OFF
      try {
        const turnOffCommand = this.buildWriteMultipleCoilsCommand(slaveAddress, channel - 1, 1, [false]);
        await this.writeCommand(turnOffCommand);
        success = true;
        
      } catch (multipleCoilsError) {
        // Fallback to single coil command (0x05)
        try {
          const turnOffCommand = this.buildModbusCommand(slaveAddress, 0x05, channel - 1, 0x0000);
          await this.writeCommand(turnOffCommand);
          success = true;
          
        } catch (singleCoilError) {
          throw new Error(`Failed to close relay ${channel}: Multiple coils (0x0F) failed: ${multipleCoilsError instanceof Error ? multipleCoilsError.message : String(multipleCoilsError)}, Single coil (0x05) failed: ${singleCoilError instanceof Error ? singleCoilError.message : String(singleCoilError)}`);
        }
      }
      
      return success;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { channel, slaveAddress, operation: 'close', error: errorMessage });
      return false;
    }
  }

  /**
   * Perform burst opening (2 seconds with 100ms intervals, then ensure relay closes)
   */
  private async performBurstOpening(channel: number, slaveAddress: number = 1): Promise<boolean> {
    const startTime = Date.now();
    const endTime = startTime + (this.config.burst_duration_seconds * 1000);
    let success = false;

    try {
      while (Date.now() < endTime) {
        try {
          const pulseSuccess = await this.sendPulse(channel, this.config.pulse_duration_ms, slaveAddress);
          if (pulseSuccess) {
            success = true;
          }
        } catch (pulseError) {
          // Continue with burst even if individual pulses fail
        }
        
        // Check if we have enough time for another cycle
        if (Date.now() + this.config.burst_interval_ms >= endTime) {
          break;
        }
        
        // Wait for burst interval before next pulse
        await this.delay(this.config.burst_interval_ms);
      }

      // Ensure relay is closed after burst by sending a close command
      try {
        await this.delay(100); // Small delay before closing
        await this.sendCloseRelay(channel, slaveAddress);
      } catch (closeError) {
        // Log but don't fail the operation if close fails
        console.warn(`Warning: Failed to close relay ${channel} after burst:`, closeError);
      }

      return success;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { channel, operation: 'burst', error: errorMessage });
      return false;
    }
  }

  /**
   * Read relay status using Modbus function 0x01 (Read Coils)
   */
  async readRelayStatus(slaveId: number, startChannel: number, count: number): Promise<boolean[]> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Modbus port not connected');
    }

    try {
      const command = this.buildReadCoilsCommand(slaveId, startChannel, count);
      await this.writeCommand(command);
      
      // Read response (implementation would need response parsing)
      // For now, return empty array as placeholder
      return new Array(count).fill(false);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { slaveId, startChannel, count, operation: 'read_status', error: errorMessage });
      return [];
    }
  }

  /**
   * Write multiple relays using Modbus function 0x0F (Write Multiple Coils)
   */
  async writeMultipleRelays(slaveId: number, startChannel: number, values: boolean[]): Promise<boolean> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Modbus port not connected');
    }

    try {
      const command = this.buildWriteMultipleCoilsCommand(slaveId, startChannel, values.length, values);
      await this.writeCommand(command);
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { slaveId, startChannel, values, operation: 'write_multiple', error: errorMessage });
      return false;
    }
  }

  /**
   * Scan Modbus bus for active slave devices (Waveshare relay cards)
   */
  async scanBus(startAddress: number = 1, endAddress: number = 10): Promise<number[]> {
    const activeSlaves: number[] = [];
    
    for (let address = startAddress; address <= endAddress; address++) {
      try {
        // Try to read coil status from each potential slave
        const command = this.buildReadCoilsCommand(address, 0, 1);
        await this.writeCommand(command);
        
        // If no exception, slave is present
        activeSlaves.push(address);
        
      } catch (error) {
        // Slave not responding or error - continue scanning
      }
      
      // Small delay between scan attempts
      await this.delay(100);
    }
    
    return activeSlaves;
  }

  /**
   * Build Read Coils command (Function 0x01)
   */
  private buildReadCoilsCommand(slaveId: number, startAddress: number, count: number): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt8(slaveId, 0);
    buffer.writeUInt8(0x01, 1); // Function code: Read Coils
    buffer.writeUInt16BE(startAddress, 2);
    buffer.writeUInt16BE(count, 4);
    
    const crc = this.calculateCRC16(buffer.subarray(0, 6));
    buffer.writeUInt16LE(crc, 6);
    
    return buffer;
  }

  /**
   * Build Write Multiple Coils command (Function 0x0F) - Waveshare preferred
   */
  private buildWriteMultipleCoilsCommand(slaveId: number, startAddress: number, count: number, values: boolean[]): Buffer {
    const byteCount = Math.ceil(count / 8);
    const buffer = Buffer.alloc(9 + byteCount);
    
    buffer.writeUInt8(slaveId, 0);
    buffer.writeUInt8(0x0F, 1); // Function code: Write Multiple Coils
    buffer.writeUInt16BE(startAddress, 2);
    buffer.writeUInt16BE(count, 4);
    buffer.writeUInt8(byteCount, 6);
    
    // Pack boolean values into bytes
    for (let i = 0; i < count; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      
      if (values[i]) {
        buffer[7 + byteIndex] |= (1 << bitIndex);
      }
    }
    
    const crc = this.calculateCRC16(buffer.subarray(0, buffer.length - 2));
    buffer.writeUInt16LE(crc, buffer.length - 2);
    
    return buffer;
  }

  /**
   * Build Modbus RTU command with CRC (legacy single coil method)
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
   * Write command to serial port with timeout
   */
  private async writeCommand(command: Buffer): Promise<void> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Modbus port not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Modbus command timeout'));
      }, this.config.timeout_ms);

      try {
        this.serialPort!.write(command, (err) => {
          clearTimeout(timeout);
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (syncError) {
        clearTimeout(timeout);
        reject(syncError);
      }
    });
  }

  /**
   * Start the command queue processor
   */
  private startQueueProcessor(): void {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    this.processQueue().catch(error => {
      this.emit('error', { source: 'queue_processor', error: error.message });
    });
  }

  /**
   * Process queued commands with minimum intervals
   */
  private async processQueue(): Promise<void> {
    while (this.isProcessingQueue) {
      try {
        if (this.commandQueue.length > 0) {
          const command = this.commandQueue.shift()!;
          await this.executeCommand(command);
        } else {
          // Wait before checking queue again
          await this.delay(100);
        }
      } catch (error) {
        this.emit('error', { source: 'queue_processor', error: error instanceof Error ? error.message : String(error) });
        // Continue processing other commands
      }
    }
  }

  /**
   * Add command to queue for serial execution
   */
  enqueueCommand(command: RelayCommand): void {
    this.commandQueue.push(command);
  }

  /**
   * Update relay status tracking
   */
  private updateRelayStatus(channel: number, success: boolean): void {
    const status = this.relayStatus.get(channel) || {
      channel,
      is_active: false,
      last_operation: new Date(),
      total_operations: 0,
      failure_count: 0
    };

    status.last_operation = new Date();
    status.total_operations++;
    if (!success) {
      status.failure_count++;
    }

    this.relayStatus.set(channel, status);
  }

  /**
   * Update health monitoring
   */
  private updateHealth(success: boolean): void {
    this.health.total_commands++;
    this.health.uptime_seconds = Math.floor((Date.now() - this.startTime) / 1000);
    
    if (success) {
      this.health.last_successful_command = new Date();
      
      // Determine status based on error rate
      const errorRate = this.health.total_commands > 0 ? 
        (this.health.failed_commands / this.health.total_commands) * 100 : 0;
      this.health.error_rate_percent = errorRate;
      
      if (errorRate < 5) {
        this.health.status = 'ok';
      } else if (errorRate < 25) {
        this.health.status = 'degraded';
      } else {
        this.health.status = 'error';
      }
    } else {
      this.health.failed_commands++;
      
      const errorRate = (this.health.failed_commands / this.health.total_commands) * 100;
      this.health.error_rate_percent = errorRate;
      
      if (errorRate > 50) {
        this.health.status = 'error';
      } else if (errorRate > 25) {
        this.health.status = 'degraded';
      }
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    const interval = this.config.health_check_interval_ms || 30000; // 30 seconds default
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, interval);
  }

  /**
   * Perform periodic health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Check if connection is still alive
      if (!this.serialPort || !this.serialPort.isOpen) {
        this.health.status = 'disconnected';
        this.emit('health_degraded', { reason: 'connection_lost', health: this.getHealth() });
        
        // Attempt reconnection
        await this.attemptReconnection();
        return;
      }

      // Check error rate trends
      const errorRate = this.health.error_rate_percent;
      if (errorRate > 25 && this.health.status !== 'error') {
        this.emit('health_degraded', { reason: 'high_error_rate', health: this.getHealth() });
      }

      // Check if we haven't had a successful command in a while
      const timeSinceLastSuccess = Date.now() - this.health.last_successful_command.getTime();
      if (timeSinceLastSuccess > 300000) { // 5 minutes
        this.health.status = 'degraded';
        this.emit('health_degraded', { reason: 'no_recent_success', health: this.getHealth() });
      }

    } catch (error) {
      this.emit('error', { source: 'health_check', error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Attempt to reconnect when connection is lost
   */
  private async attemptReconnection(): Promise<void> {
    const maxRetries = this.config.connection_retry_attempts || 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.attemptConnection();
        this.health.status = 'ok';
        this.emit('reconnected');
        return;
      } catch (error) {
        this.health.connection_errors++;
        this.health.retry_attempts++;
        
        if (attempt < maxRetries - 1) {
          const delay = this.calculateRetryDelay(attempt);
          await this.delay(delay);
        }
      }
    }
    
    this.health.status = 'error';
    this.emit('reconnection_failed');
  }

  /**
   * Get relay status for a specific channel
   */
  getRelayStatus(channel: number): RelayStatus | undefined {
    return this.relayStatus.get(channel);
  }

  /**
   * Get all relay statuses
   */
  getAllRelayStatuses(): RelayStatus[] {
    return Array.from(this.relayStatus.values());
  }

  /**
   * Get health status
   */
  getHealth(): ModbusHealth {
    return { ...this.health };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close the Modbus connection
   */
  async close(): Promise<void> {
    this.isProcessingQueue = false;
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => {
          this.health.status = 'disconnected';
          this.emit('disconnected');
          resolve();
        });
      });
    } else {
      // If port is not open, still emit disconnected event
      this.health.status = 'disconnected';
      this.emit('disconnected');
    }
  }
}
