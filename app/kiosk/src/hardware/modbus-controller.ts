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
   * Open a locker with the specified ID with enhanced retry logic and error handling
   * Maps locker_id to cardId and relayId using the correct formulas
   * Returns true if successful, false if failed
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
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
      const maxRetries = this.config.max_retries || 3; // Increased from 2 to 3 for better reliability
      
      // Map locker_id to cardId and relayId using the specified formulas
      const cardId = Math.ceil(lockerId / 16);
      const relayId = ((lockerId - 1) % 16) + 1;
      
      // Use cardId as slaveAddress if not provided
      const targetSlaveAddress = slaveAddress || cardId;

      // Log hardware communication attempt (Requirement 4.6)
      console.log(`🔧 Hardware: Opening locker ${lockerId} (card=${cardId}, relay=${relayId}, slave=${targetSlaveAddress})`);
      
      // Check hardware availability before attempting operation (Requirement 4.4)
      if (!this.isHardwareAvailable()) {
        const errorMsg = `Hardware unavailable for locker ${lockerId}`;
        console.error(`❌ ${errorMsg}`);
        this.emit('hardware_unavailable', { lockerId, cardId, relayId, error: errorMsg });
        return false;
      }

      try {
        // Enhanced retry logic with exponential backoff (Requirement 4.2)
        let pulseSuccess = false;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries && !pulseSuccess; attempt++) {
          try {
            console.log(`🔄 Hardware: Pulse attempt ${attempt + 1}/${maxRetries + 1} for locker ${lockerId}`);
            
            pulseSuccess = await this.executeCommand({
              command_id: `${commandId}_pulse_${attempt}`,
              channel: relayId,
              operation: 'pulse',
              duration_ms: this.config.pulse_duration_ms,
              created_at: new Date(),
              retry_count: attempt
            }, targetSlaveAddress);
            
            if (pulseSuccess) {
              console.log(`✅ Hardware: Pulse successful for locker ${lockerId} on attempt ${attempt + 1}`);
              break;
            }
            
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`⚠️ Hardware: Pulse attempt ${attempt + 1} failed for locker ${lockerId}: ${lastError.message}`);
          }
          
          // Apply exponential backoff between retries (Requirement 4.2)
          if (attempt < maxRetries) {
            const retryDelay = this.calculateRetryDelay(attempt);
            console.log(`⏳ Hardware: Waiting ${retryDelay}ms before retry ${attempt + 2}`);
            await this.delay(retryDelay);
          }
        }

        if (pulseSuccess) {
          console.log(`✅ Hardware: Locker ${lockerId} opened successfully with pulse`);
          return true;
        }

        // If pulse fails after all retries, attempt burst opening with retries (Requirement 4.2)
        console.log(`🔄 Hardware: Pulse failed for locker ${lockerId}, attempting burst opening`);
        let burstSuccess = false;

        for (let attempt = 0; attempt <= maxRetries && !burstSuccess; attempt++) {
          try {
            console.log(`🔄 Hardware: Burst attempt ${attempt + 1}/${maxRetries + 1} for locker ${lockerId}`);
            
            burstSuccess = await this.executeCommand({
              command_id: `${commandId}_burst_${attempt}`,
              channel: relayId,
              operation: 'burst',
              created_at: new Date(),
              retry_count: attempt
            }, targetSlaveAddress);
            
            if (burstSuccess) {
              console.log(`✅ Hardware: Burst successful for locker ${lockerId} on attempt ${attempt + 1}`);
              break;
            }
            
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`⚠️ Hardware: Burst attempt ${attempt + 1} failed for locker ${lockerId}: ${lastError.message}`);
          }
          
          // Apply exponential backoff between retries
          if (attempt < maxRetries) {
            const retryDelay = this.calculateRetryDelay(attempt);
            console.log(`⏳ Hardware: Waiting ${retryDelay}ms before burst retry ${attempt + 2}`);
            await this.delay(retryDelay);
          }
        }

        if (burstSuccess) {
          console.log(`✅ Hardware: Locker ${lockerId} opened successfully with burst`);
          return true;
        }

        // All attempts failed - log comprehensive error (Requirement 4.6)
        const finalError = lastError || new Error('All hardware communication attempts failed');
        console.error(`❌ Hardware: Failed to open locker ${lockerId} after ${maxRetries + 1} pulse and ${maxRetries + 1} burst attempts`);
        console.error(`❌ Hardware: Final error: ${finalError.message}`);
        
        this.emit('hardware_operation_failed', { 
          lockerId, 
          cardId, 
          relayId, 
          targetSlaveAddress,
          totalAttempts: (maxRetries + 1) * 2, // pulse + burst attempts
          error: finalError.message,
          operation: 'open_locker'
        });
        
        return false;

      } catch (error) {
        // Catch-all error handler (Requirement 4.3)
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Hardware: Unexpected error opening locker ${lockerId}: ${errorMsg}`);
        
        this.emit('error', { 
          lockerId, 
          cardId, 
          relayId, 
          targetSlaveAddress,
          error: errorMsg,
          operation: 'open_locker'
        });
        
        return false;
      }
    } finally {
      // Always release the per-locker mutex
      lockerMutex.release();
    }
  }

  /**
   * Execute a relay command with enhanced mutex protection and error handling
   * Requirements: 4.1, 4.2, 4.3, 4.6
   */
  private async executeCommand(command: RelayCommand, slaveAddress?: number): Promise<boolean> {
    await this.mutex.acquire();
    
    try {
      // Enhanced logging for hardware communication (Requirement 4.6)
      console.log(`🔧 Hardware: Executing ${command.operation} command ${command.command_id} on channel ${command.channel} (attempt ${command.retry_count + 1})`);
      
      // Check hardware availability before command execution (Requirement 4.4)
      if (!this.isHardwareAvailable()) {
        const errorMsg = `Hardware unavailable for command ${command.command_id}`;
        console.error(`❌ Hardware: ${errorMsg}`);
        this.emit('hardware_unavailable', { 
          commandId: command.command_id,
          channel: command.channel,
          operation: command.operation,
          error: errorMsg 
        });
        return false;
      }

      // Ensure minimum interval between commands (300ms)
      const now = Date.now();
      const timeSinceLastCommand = now - this.lastCommandTime;
      if (timeSinceLastCommand < this.config.command_interval_ms) {
        const waitTime = this.config.command_interval_ms - timeSinceLastCommand;
        console.log(`⏳ Hardware: Waiting ${waitTime}ms for command interval`);
        await this.delay(waitTime);
      }

      let success = false;
      let operationError: Error | null = null;
      
      try {
        const startTime = Date.now();
        
        if (command.operation === 'pulse') {
          success = await this.sendPulse(command.channel, command.duration_ms, slaveAddress);
        } else if (command.operation === 'burst') {
          success = await this.performBurstOpening(command.channel, slaveAddress);
        } else {
          throw new Error(`Unknown operation: ${command.operation}`);
        }
        
        const duration = Date.now() - startTime;
        
        if (success) {
          console.log(`✅ Hardware: Command ${command.command_id} completed successfully in ${duration}ms`);
        } else {
          console.warn(`⚠️ Hardware: Command ${command.command_id} failed after ${duration}ms`);
        }
        
      } catch (error) {
        // Enhanced error handling with detailed logging (Requirement 4.3, 4.6)
        operationError = error instanceof Error ? error : new Error(String(error));
        success = false;
        
        console.error(`❌ Hardware: Command ${command.command_id} threw error: ${operationError.message}`);
        
        // Emit specific error event for monitoring
        this.emit('command_error', {
          commandId: command.command_id,
          channel: command.channel,
          operation: command.operation,
          slaveAddress,
          retryCount: command.retry_count,
          error: operationError.message,
          timestamp: new Date()
        });
      }

      // Update timing and status tracking
      this.lastCommandTime = Date.now();
      this.updateRelayStatus(command.channel, success);
      this.updateHealth(success);

      // Log final result for monitoring (Requirement 4.6)
      if (success) {
        console.log(`📊 Hardware: Channel ${command.channel} operation successful (total: ${this.health.total_commands}, errors: ${this.health.failed_commands})`);
      } else {
        console.error(`📊 Hardware: Channel ${command.channel} operation failed (total: ${this.health.total_commands}, errors: ${this.health.failed_commands + 1})`);
        
        // If we have an operation error, include it in the final error event
        if (operationError) {
          this.emit('operation_failed', {
            commandId: command.command_id,
            channel: command.channel,
            operation: command.operation,
            error: operationError.message,
            retryCount: command.retry_count
          });
        }
      }

      return success;

    } finally {
      this.mutex.release();
    }
  }

  /**
   * Send hardware-based timed pulse to Waveshare relay (PREFERRED METHOD)
   * Uses built-in pulse functionality: Function 0x05 with timed pulse command
   * Hardware automatically turns relay OFF after specified duration - NO SOFTWARE TIMING NEEDED!
   */
  private async sendPulse(channel: number, duration: number = 400, slaveAddress: number = 1): Promise<boolean> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Modbus port not connected');
    }

    try {
      // SKIP Waveshare timed pulse - use WORKING software pulse method directly
      console.log(`🔄 Using WORKING software pulse method for channel ${channel} (skipping Waveshare)`);
      
      // Use software-based pulse (KNOWN TO WORK from test script)
      return await this.sendSoftwarePulse(channel, duration, slaveAddress);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { channel, slaveAddress, operation: 'pulse', error: errorMessage });
      return false;
    }
  }

  /**
   * Waveshare hardware timed pulse - uses built-in relay auto-close
   * Command format: 01 05 02 00 [coil] 00 [duration] [crc]
   * Duration is in 100ms units, hardware handles the timing
   */
  private async sendWaveshareTimedPulse(channel: number, duration: number, slaveAddress: number): Promise<boolean> {
    // Convert duration from milliseconds to hardware units (100ms increments)
    const hardwareDuration = Math.max(1, Math.round(duration / 100));
    const coilAddress = channel - 1; // Convert to 0-based
    
    console.log(`🔓 Sending Waveshare timed pulse to relay ${channel} for ${hardwareDuration * 100}ms`);
    
    // Build Waveshare timed pulse command
    // Format: [slave] [0x05] [0x02] [coil_high] [coil_low] [duration_high] [duration_low] [crc_low] [crc_high]
    const command = Buffer.alloc(8);
    command[0] = slaveAddress;           // Slave address
    command[1] = 0x05;                   // Function: Write Single Coil
    command[2] = 0x02;                   // Special command: Timed pulse (on-then-off)
    command[3] = 0x00;                   // Coil address high byte
    command[4] = coilAddress;            // Coil address low byte
    command[5] = 0x00;                   // Duration high byte
    command[6] = hardwareDuration;       // Duration low byte (× 100ms)
    
    // Calculate CRC16 for Modbus RTU
    const crc = this.calculateCRC16(command.slice(0, 7));
    command[7] = crc & 0xFF;             // CRC low byte (correct index for 8-byte buffer)
    
    console.log(`📡 Waveshare timed pulse command: ${command.toString('hex').toUpperCase()}`);
    
    // Send command to hardware
    await this.writeCommand(command);
    
    console.log(`✅ Hardware timed pulse sent - relay ${channel} will auto-close after ${hardwareDuration * 100}ms`);
    console.log(`🔊 Listen for TWO clicks: open (now) + close (after ${hardwareDuration * 100}ms)`);
    
    return true;
  }

  /**
   * Software-based pulse fallback (original implementation)
   * Used only if hardware timed pulse fails
   */
  private async sendSoftwarePulse(channel: number, duration: number, slaveAddress: number): Promise<boolean> {
    console.log(`🔄 Using software pulse fallback for relay ${channel}`);
    
    let success = false;
    
    // First try Write Multiple Coils (0x0F)
    try {
      const turnOnCommand = this.buildWriteMultipleCoilsCommand(slaveAddress, channel - 1, 1, [true]);
      await this.writeCommand(turnOnCommand);
      await this.delay(duration);
      
      const turnOffCommand = this.buildWriteMultipleCoilsCommand(slaveAddress, channel - 1, 1, [false]);
      await this.writeCommand(turnOffCommand);
      
      success = true;
      
    } catch (multipleCoilsError) {
      console.warn(`⚠️  0x0F failed for channel ${channel}, trying 0x05 fallback`);
      
      try {
        const turnOnCommand = this.buildModbusCommand(slaveAddress, 0x05, channel - 1, 0xFF00);
        await this.writeCommand(turnOnCommand);
        await this.delay(duration);
        
        const turnOffCommand = this.buildModbusCommand(slaveAddress, 0x05, channel - 1, 0x0000);
        await this.writeCommand(turnOffCommand);
        
        success = true;
        
      } catch (singleCoilError) {
        throw new Error(`Both 0x0F and 0x05 commands failed for channel ${channel}`);
      }
    }
    
    return success;
  }

  /**
   * Calculate CRC16 for Modbus RTU protocol
   * Used for Waveshare timed pulse commands
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
   * Send close relay command (turn OFF only)
   * Used to ensure relay is closed after burst operations
   * Made public for emergency close API access
   */
  async sendCloseRelay(channel: number, slaveAddress: number = 1): Promise<boolean> {
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
   * Build Modbus RTU command with CRC (using WORKING test script method)
   * This matches the exact working commands from our successful test
   */
  private buildModbusCommand(slaveId: number, functionCode: number, address: number, data: number): Buffer {
    const buffer = Buffer.alloc(8);
    buffer[0] = slaveId;
    buffer[1] = functionCode;
    buffer[2] = (address >> 8) & 0xFF;  // Address high byte
    buffer[3] = address & 0xFF;         // Address low byte
    buffer[4] = (data >> 8) & 0xFF;     // Data high byte
    buffer[5] = data & 0xFF;            // Data low byte
    
    // Calculate CRC16 using the SAME method as working test script
    const crc = this.calculateCRC16(buffer.subarray(0, 6));
    buffer[6] = crc & 0xFF;             // CRC low byte
    buffer[7] = (crc >> 8) & 0xFF;      // CRC high byte
    
    console.log(`🔧 Built Modbus command: ${buffer.toString('hex').toUpperCase()}`);
    
    return buffer;
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
   * Check if hardware is available for operations (Requirement 4.4)
   */
  isHardwareAvailable(): boolean {
    // Check if serial port is connected
    if (!this.serialPort || !this.serialPort.isOpen) {
      return false;
    }
    
    // Check if health status indicates hardware is operational
    if (this.health.status === 'error' || this.health.status === 'disconnected') {
      return false;
    }
    
    // Check if error rate is too high (over 75% failure rate indicates hardware issues)
    if (this.health.error_rate_percent > 75) {
      return false;
    }
    
    // Check if we haven't had a successful command in the last 10 minutes
    const timeSinceLastSuccess = Date.now() - this.health.last_successful_command.getTime();
    if (timeSinceLastSuccess > 600000 && this.health.total_commands > 0) { // 10 minutes
      return false;
    }
    
    return true;
  }

  /**
   * Get detailed hardware status for diagnostics (Requirement 4.6)
   */
  getHardwareStatus(): {
    available: boolean;
    connected: boolean;
    health: ModbusHealth;
    diagnostics: {
      portOpen: boolean;
      errorRate: number;
      timeSinceLastSuccess: number;
      connectionErrors: number;
      retryAttempts: number;
    };
  } {
    const timeSinceLastSuccess = Date.now() - this.health.last_successful_command.getTime();
    
    return {
      available: this.isHardwareAvailable(),
      connected: this.serialPort?.isOpen || false,
      health: this.getHealth(),
      diagnostics: {
        portOpen: this.serialPort?.isOpen || false,
        errorRate: this.health.error_rate_percent,
        timeSinceLastSuccess,
        connectionErrors: this.health.connection_errors,
        retryAttempts: this.health.retry_attempts
      }
    };
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
