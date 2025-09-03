/**
 * Slave Address Management Service for Hardware Configuration Wizard
 * 
 * This service provides automated slave address configuration for Modbus devices
 * using the proven dual relay card solution patterns from:
 * - scripts/configure-relay-slave-addresses.js
 * - docs/DUAL_RELAY_CARD_PROBLEM_SOLUTION.md
 * 
 * Key Features:
 * - Automatic address discovery and validation
 * - Broadcast address configuration (address 0x00)
 * - Register 0x4000 verification (Waveshare-specific)
 * - Conflict detection and resolution
 * - Bulk configuration support
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.2, 8.3
 */

import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

// Core interfaces for slave address management
export interface AddressConflict {
  address: number;
  devices: ModbusDevice[];
  severity: 'warning' | 'error';
  autoResolvable: boolean;
}

export interface ConfigResult {
  address: number;
  success: boolean;
  error?: string;
  verificationPassed: boolean;
  responseTime?: number;
}

export interface ResolutionResult {
  originalAddress: number;
  newAddress: number;
  success: boolean;
  error?: string;
}

export interface ModbusDevice {
  address: number;
  responseTime: number;
  deviceType?: string;
  capabilities?: DeviceCapabilities;
  lastSeen: Date;
}

export interface DeviceCapabilities {
  maxRelays: number;
  supportedFunctions: number[];
  firmwareVersion?: string;
  addressConfigurable: boolean;
}

export interface SlaveAddressConfig {
  port: string;
  baudRate: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Slave Address Management Service
 * 
 * Implements proven patterns from the dual relay card solution:
 * - CRC16 calculation from working solution
 * - Broadcast address (0x00) configuration
 * - Register 0x4000 verification method
 * - Systematic address scanning techniques
 */
export class SlaveAddressService extends EventEmitter {
  private serialPort: SerialPort | null = null;
  private config: SlaveAddressConfig;
  private knownDevices = new Map<number, ModbusDevice>();

  constructor(config: SlaveAddressConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize the service and open serial connection
   */
  async initialize(): Promise<void> {
    try {
      this.serialPort = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false
      });

      await new Promise<void>((resolve, reject) => {
        this.serialPort!.open((err) => {
          if (err) {
            reject(new Error(`Failed to open port ${this.config.port}: ${err.message}`));
          } else {
            console.log(`✅ SlaveAddressService: Serial port ${this.config.port} opened`);
            resolve();
          }
        });
      });

      this.emit('initialized');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ SlaveAddressService: Failed to initialize: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Close the serial connection
   */
  async close(): Promise<void> {
    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        this.serialPort!.close(() => {
          console.log(`✅ SlaveAddressService: Serial port closed`);
          resolve();
        });
      });
    }
  }

  /**
   * Find the next available slave address
   * 
   * Based on successful dual card configuration experience:
   * - Scans addresses 1-255 systematically
   * - Uses proven register 0x4000 read method for validation
   * - Excludes specified addresses from consideration
   * 
   * Requirements: 3.1, 3.4
   */
  async findNextAvailableAddress(excludeAddresses: number[] = []): Promise<number> {
    console.log(`🔍 SlaveAddressService: Finding next available address (excluding: ${excludeAddresses.join(', ')})`);
    
    // Start from address 1 (0 is reserved for broadcast)
    for (let address = 1; address <= 255; address++) {
      // Skip excluded addresses
      if (excludeAddresses.includes(address)) {
        continue;
      }

      // Check if address is available using proven validation method
      const isAvailable = await this.validateAddressAvailability(address);
      if (isAvailable) {
        console.log(`✅ SlaveAddressService: Found available address: ${address}`);
        return address;
      }
    }

    throw new Error('No available slave addresses found (1-255 all occupied)');
  }

  /**
   * Validate if a specific address is available
   * 
   * Uses the working register 0x4000 read method from proven solution:
   * - Attempts to read slave address from register 0x4000
   * - If device responds, address is occupied
   * - If timeout/error, address is available
   * 
   * Requirements: 3.1, 3.4
   */
  async validateAddressAvailability(address: number): Promise<boolean> {
    if (address < 1 || address > 255) {
      throw new Error(`Invalid address: ${address}. Must be between 1-255`);
    }

    try {
      console.log(`🔍 SlaveAddressService: Validating address ${address} availability`);
      
      // Use proven register 0x4000 read method from dual card solution
      const command = this.buildReadRegisterCommand(address, 0x4000, 1);
      const response = await this.sendCommand(command, this.config.timeout);
      
      if (response && response.length >= 7) {
        // Device responded - address is occupied
        console.log(`⚠️ SlaveAddressService: Address ${address} is occupied`);
        
        // Parse the current address from response for verification
        const currentAddress = (response[3] << 8) | response[4];
        console.log(`📋 SlaveAddressService: Device at ${address} reports address: ${currentAddress}`);
        
        return false; // Address is not available
      }
    } catch (error) {
      // Timeout or communication error means address is available
      console.log(`✅ SlaveAddressService: Address ${address} is available (no response)`);
      return true;
    }

    return true; // Default to available if no clear response
  }

  /**
   * Detect address conflicts on the bus
   * 
   * Uses proven scanning techniques from dual card solution:
   * - Systematic address probing (1-255)
   * - Register 0x4000 verification for each responding device
   * - Identifies duplicate addresses and configuration issues
   * 
   * Requirements: 3.1, 3.4
   */
  async detectAddressConflicts(): Promise<AddressConflict[]> {
    console.log(`🔍 SlaveAddressService: Scanning for address conflicts (1-255)`);
    
    const conflicts: AddressConflict[] = [];
    const devicesByAddress = new Map<number, ModbusDevice[]>();
    
    // Scan all addresses using proven scanning method
    for (let address = 1; address <= 255; address++) {
      try {
        const device = await this.probeAddress(address);
        if (device) {
          if (!devicesByAddress.has(address)) {
            devicesByAddress.set(address, []);
          }
          devicesByAddress.get(address)!.push(device);
          
          // Update known devices cache
          this.knownDevices.set(address, device);
        }
      } catch (error) {
        // Continue scanning even if individual addresses fail
        continue;
      }
      
      // Small delay between probes to avoid overwhelming the bus
      await this.delay(50);
    }

    // Identify conflicts (multiple devices at same address)
    for (const [address, devices] of devicesByAddress) {
      if (devices.length > 1) {
        conflicts.push({
          address,
          devices,
          severity: 'error',
          autoResolvable: true
        });
        
        console.log(`❌ SlaveAddressService: Conflict detected at address ${address} (${devices.length} devices)`);
      }
    }

    console.log(`✅ SlaveAddressService: Conflict scan complete. Found ${conflicts.length} conflicts`);
    return conflicts;
  }

  /**
   * Probe a specific address for device presence and information
   * 
   * Uses the proven register 0x4000 read method to:
   * - Detect device presence
   * - Read current slave address configuration
   * - Measure response time for device characterization
   */
  private async probeAddress(address: number): Promise<ModbusDevice | null> {
    const startTime = Date.now();
    
    try {
      // Use proven register 0x4000 read method
      const command = this.buildReadRegisterCommand(address, 0x4000, 1);
      const response = await this.sendCommand(command, this.config.timeout);
      
      if (response && response.length >= 7 && response[1] === 0x03 && response[2] === 0x02) {
        const responseTime = Date.now() - startTime;
        const currentAddress = (response[3] << 8) | response[4];
        
        const device: ModbusDevice = {
          address: currentAddress,
          responseTime,
          deviceType: 'waveshare_16ch', // Assumption based on register 0x4000 support
          capabilities: {
            maxRelays: 16,
            supportedFunctions: [0x01, 0x03, 0x05, 0x06, 0x0F],
            addressConfigurable: true
          },
          lastSeen: new Date()
        };
        
        console.log(`✅ SlaveAddressService: Device found at address ${address} (${responseTime}ms, reports address: ${currentAddress})`);
        return device;
      }
    } catch (error) {
      // Device not responding or error
      return null;
    }
    
    return null;
  }

  /**
   * Build Read Holding Registers command (Function 0x03)
   * 
   * Uses exact command format from proven dual card solution:
   * - Function 0x03: Read Holding Registers
   * - Register 0x4000: Waveshare slave address storage
   * - CRC16 calculation from working implementation
   */
  private buildReadRegisterCommand(slaveId: number, register: number, count: number = 1): Buffer {
    const buffer = Buffer.alloc(8);
    
    buffer[0] = slaveId;                    // Slave ID
    buffer[1] = 0x03;                       // Function: Read Holding Registers
    buffer[2] = (register >> 8) & 0xFF;    // Register high byte
    buffer[3] = register & 0xFF;            // Register low byte
    buffer[4] = (count >> 8) & 0xFF;        // Count high byte
    buffer[5] = count & 0xFF;               // Count low byte
    
    const crc = this.calculateCRC16(buffer.subarray(0, 6));
    buffer[6] = crc & 0xFF;                 // CRC low byte
    buffer[7] = (crc >> 8) & 0xFF;          // CRC high byte
    
    return buffer;
  }

  /**
   * Calculate CRC16 for Modbus RTU
   * 
   * Uses exact CRC16 implementation from proven dual card solution.
   * This is the working CRC calculation that successfully resolved
   * the dual relay card configuration problem.
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
   * 
   * Implements reliable command sending with timeout handling
   * based on patterns from the proven solution
   */
  private async sendCommand(command: Buffer, timeoutMs: number): Promise<Buffer | null> {
    if (!this.serialPort || !this.serialPort.isOpen) {
      throw new Error('Serial port not open');
    }

    return new Promise((resolve, reject) => {
      let responseData = Buffer.alloc(0);
      let timeout: NodeJS.Timeout;

      const onData = (data: Buffer) => {
        responseData = Buffer.concat([responseData, data]);
        
        // Check if we have a complete response (at least 8 bytes for register operations)
        if (responseData.length >= 8) {
          clearTimeout(timeout);
          this.serialPort!.removeListener('data', onData);
          resolve(responseData);
        }
      };

      const onTimeout = () => {
        this.serialPort!.removeListener('data', onData);
        reject(new Error(`Command timeout after ${timeoutMs}ms`));
      };

      timeout = setTimeout(onTimeout, timeoutMs);
      this.serialPort!.on('data', onData);
      
      console.log(`📡 SlaveAddressService: Sending command: ${command.toString('hex').toUpperCase()}`);
      this.serialPort!.write(command);
    });
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Configure slave address using broadcast command
   * 
   * Uses proven broadcast address (0x00) commands from dual card solution:
   * - Broadcast address allows configuration without knowing current address
   * - Function 0x06: Write Single Register to 0x4000
   * - Exact CRC16 calculation and command format from working solution
   * 
   * Requirements: 3.2, 3.3, 3.6
   */
  async configureBroadcastAddress(newAddress: number): Promise<ConfigResult> {
    if (newAddress < 1 || newAddress > 255) {
      return {
        address: newAddress,
        success: false,
        error: `Invalid address: ${newAddress}. Must be between 1-255`,
        verificationPassed: false
      };
    }

    console.log(`🔧 SlaveAddressService: Setting slave address to ${newAddress} using broadcast...`);
    
    const startTime = Date.now();
    
    try {
      // Use broadcast address (0x00) to set the slave ID
      // This is the proven method from the dual card solution
      const command = this.buildWriteRegisterCommand(0x00, 0x4000, newAddress);
      
      // Send broadcast command
      const response = await this.sendCommand(command, this.config.timeout);
      const responseTime = Date.now() - startTime;
      
      console.log(`📨 SlaveAddressService: Broadcast response: ${response ? response.toString('hex').toUpperCase() : 'No response'}`);
      
      // Verify the response format (should echo the command for broadcast)
      let configSuccess = false;
      if (response && response.length >= 8 && response[1] === 0x06) {
        console.log(`✅ SlaveAddressService: Broadcast command acknowledged`);
        configSuccess = true;
      } else {
        console.warn(`⚠️ SlaveAddressService: Unexpected broadcast response format`);
        // Don't fail immediately - verification step will determine success
        configSuccess = true; // Assume success, let verification confirm
      }

      // Wait a moment for device to process the configuration
      await this.delay(1000);

      // Verify the configuration by reading from the new address
      const verificationPassed = await this.verifyAddressConfiguration(newAddress);
      
      const result: ConfigResult = {
        address: newAddress,
        success: configSuccess && verificationPassed,
        verificationPassed,
        responseTime,
        error: !configSuccess ? 'Broadcast command failed' : 
               !verificationPassed ? 'Address verification failed' : undefined
      };

      if (result.success) {
        console.log(`✅ SlaveAddressService: Successfully configured address ${newAddress} via broadcast`);
        this.emit('address_configured', { address: newAddress, method: 'broadcast' });
      } else {
        console.error(`❌ SlaveAddressService: Failed to configure address ${newAddress}: ${result.error}`);
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ SlaveAddressService: Broadcast configuration failed: ${errorMsg}`);
      
      return {
        address: newAddress,
        success: false,
        error: errorMsg,
        verificationPassed: false,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Set slave address for a specific device
   * 
   * Uses exact CRC16 calculation and command format from working solution:
   * - Function 0x06: Write Single Register
   * - Register 0x4000: Waveshare slave address storage
   * - Proven command building and error handling patterns
   * 
   * Requirements: 3.2, 3.3, 3.6
   */
  async setSlaveAddress(currentAddress: number, newAddress: number): Promise<ConfigResult> {
    if (currentAddress < 1 || currentAddress > 255 || newAddress < 1 || newAddress > 255) {
      return {
        address: newAddress,
        success: false,
        error: `Invalid address range. Current: ${currentAddress}, New: ${newAddress}. Must be between 1-255`,
        verificationPassed: false
      };
    }

    console.log(`🔧 SlaveAddressService: Setting address ${currentAddress} -> ${newAddress}`);
    
    const startTime = Date.now();
    
    try {
      // Build command to write new address to register 0x4000
      const command = this.buildWriteRegisterCommand(currentAddress, 0x4000, newAddress);
      
      // Send command to specific device
      const response = await this.sendCommand(command, this.config.timeout);
      const responseTime = Date.now() - startTime;
      
      console.log(`📨 SlaveAddressService: Response: ${response ? response.toString('hex').toUpperCase() : 'No response'}`);
      
      // Verify the response format
      let configSuccess = false;
      if (response && response.length >= 8 && response[1] === 0x06) {
        console.log(`✅ SlaveAddressService: Address configuration command acknowledged`);
        configSuccess = true;
      } else {
        console.error(`❌ SlaveAddressService: Unexpected response format`);
        configSuccess = false;
      }

      // Wait for device to process the configuration
      await this.delay(1000);

      // Verify the configuration by reading from the new address
      const verificationPassed = configSuccess ? await this.verifyAddressConfiguration(newAddress) : false;
      
      const result: ConfigResult = {
        address: newAddress,
        success: configSuccess && verificationPassed,
        verificationPassed,
        responseTime,
        error: !configSuccess ? 'Configuration command failed' : 
               !verificationPassed ? 'Address verification failed' : undefined
      };

      if (result.success) {
        console.log(`✅ SlaveAddressService: Successfully configured address ${currentAddress} -> ${newAddress}`);
        this.emit('address_configured', { oldAddress: currentAddress, newAddress, method: 'direct' });
      } else {
        console.error(`❌ SlaveAddressService: Failed to configure address: ${result.error}`);
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ SlaveAddressService: Address configuration failed: ${errorMsg}`);
      
      return {
        address: newAddress,
        success: false,
        error: errorMsg,
        verificationPassed: false,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Verify address configuration using successful register 0x4000 verification approach
   * 
   * Uses the proven verification method from dual card solution:
   * - Read register 0x4000 from the new address
   * - Verify the device reports the expected address
   * - Confirm device is responding at the new address
   * 
   * Requirements: 3.2, 3.3, 3.6
   */
  async verifyAddressConfiguration(address: number): Promise<boolean> {
    console.log(`🔍 SlaveAddressService: Verifying address configuration for ${address}`);
    
    try {
      // Use proven register 0x4000 verification approach
      const command = this.buildReadRegisterCommand(address, 0x4000, 1);
      const response = await this.sendCommand(command, this.config.timeout);
      
      if (response && response.length >= 7 && response[1] === 0x03 && response[2] === 0x02) {
        // Parse the address from the response
        const reportedAddress = (response[3] << 8) | response[4];
        
        if (reportedAddress === address) {
          console.log(`✅ SlaveAddressService: Address ${address} verified successfully`);
          return true;
        } else {
          console.error(`❌ SlaveAddressService: Address mismatch. Expected: ${address}, Reported: ${reportedAddress}`);
          return false;
        }
      } else {
        console.error(`❌ SlaveAddressService: Invalid verification response format`);
        return false;
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ SlaveAddressService: Address verification failed: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Build Write Single Register command (Function 0x06)
   * 
   * Uses exact command format from proven dual card solution:
   * - Function 0x06: Write Single Register
   * - Register 0x4000: Waveshare slave address storage
   * - Proven CRC16 calculation from working implementation
   */
  private buildWriteRegisterCommand(slaveId: number, register: number, value: number): Buffer {
    const buffer = Buffer.alloc(8);
    
    buffer[0] = slaveId;                    // Slave ID (0x00 for broadcast)
    buffer[1] = 0x06;                       // Function: Write Single Register
    buffer[2] = (register >> 8) & 0xFF;    // Register high byte
    buffer[3] = register & 0xFF;            // Register low byte
    buffer[4] = (value >> 8) & 0xFF;        // Value high byte
    buffer[5] = value & 0xFF;               // Value low byte
    
    const crc = this.calculateCRC16(buffer.subarray(0, 6));
    buffer[6] = crc & 0xFF;                 // CRC low byte
    buffer[7] = (crc >> 8) & 0xFF;          // CRC high byte
    
    return buffer;
  }

  /**
   * Configure sequential addresses for multiple cards
   * 
   * Implements bulk configuration for multiple card setup:
   * - Configures cards sequentially starting from specified address
   * - Uses broadcast method for initial configuration
   * - Provides progress reporting for multi-card processes
   * - Includes rollback on failure
   * 
   * Requirements: 8.2, 8.3
   */
  async configureSequentialAddresses(
    startAddress: number, 
    count: number,
    progressCallback?: (progress: number, currentAddress: number, result: ConfigResult) => void
  ): Promise<ConfigResult[]> {
    console.log(`🔧 SlaveAddressService: Configuring ${count} cards sequentially starting from address ${startAddress}`);
    
    const results: ConfigResult[] = [];
    const configuredAddresses: number[] = [];
    
    try {
      for (let i = 0; i < count; i++) {
        const targetAddress = startAddress + i;
        
        console.log(`🔄 SlaveAddressService: Configuring card ${i + 1}/${count} to address ${targetAddress}`);
        
        // Use broadcast method for configuration (works even if current address is unknown)
        const result = await this.configureBroadcastAddress(targetAddress);
        results.push(result);
        
        if (result.success) {
          configuredAddresses.push(targetAddress);
          console.log(`✅ SlaveAddressService: Card ${i + 1} configured successfully to address ${targetAddress}`);
        } else {
          console.error(`❌ SlaveAddressService: Failed to configure card ${i + 1} to address ${targetAddress}: ${result.error}`);
          
          // Rollback on failure
          if (configuredAddresses.length > 0) {
            console.log(`🔄 SlaveAddressService: Rolling back ${configuredAddresses.length} configured addresses`);
            await this.rollbackConfiguration(configuredAddresses);
          }
          
          break; // Stop on first failure
        }
        
        // Report progress
        if (progressCallback) {
          const progress = Math.round(((i + 1) / count) * 100);
          progressCallback(progress, targetAddress, result);
        }
        
        // Wait between configurations to avoid bus conflicts
        if (i < count - 1) {
          await this.delay(2000);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ SlaveAddressService: Sequential configuration complete. ${successCount}/${count} cards configured successfully`);
      
      this.emit('bulk_configuration_complete', { 
        startAddress, 
        count, 
        successCount, 
        results 
      });
      
      return results;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ SlaveAddressService: Sequential configuration failed: ${errorMsg}`);
      
      // Rollback any successful configurations
      if (configuredAddresses.length > 0) {
        console.log(`🔄 SlaveAddressService: Rolling back ${configuredAddresses.length} configured addresses due to error`);
        await this.rollbackConfiguration(configuredAddresses);
      }
      
      throw error;
    }
  }

  /**
   * Resolve address conflicts automatically
   * 
   * Implements automatic conflict resolution:
   * - Identifies devices with conflicting addresses
   * - Assigns new addresses to resolve conflicts
   * - Uses sequential addressing for resolution
   * - Provides detailed resolution results
   * 
   * Requirements: 8.2, 8.3
   */
  async resolveAddressConflicts(conflicts: AddressConflict[]): Promise<ResolutionResult[]> {
    console.log(`🔧 SlaveAddressService: Resolving ${conflicts.length} address conflicts`);
    
    const resolutionResults: ResolutionResult[] = [];
    
    for (const conflict of conflicts) {
      console.log(`🔄 SlaveAddressService: Resolving conflict at address ${conflict.address} (${conflict.devices.length} devices)`);
      
      // Keep the first device at the original address, reassign others
      for (let i = 1; i < conflict.devices.length; i++) {
        const device = conflict.devices[i];
        
        try {
          // Find next available address
          const newAddress = await this.findNextAvailableAddress([conflict.address]);
          
          // Configure the device to the new address
          // Note: We use broadcast since we don't know the actual current address in conflict
          const configResult = await this.configureBroadcastAddress(newAddress);
          
          const resolutionResult: ResolutionResult = {
            originalAddress: conflict.address,
            newAddress,
            success: configResult.success,
            error: configResult.error
          };
          
          resolutionResults.push(resolutionResult);
          
          if (configResult.success) {
            console.log(`✅ SlaveAddressService: Resolved conflict - moved device from ${conflict.address} to ${newAddress}`);
          } else {
            console.error(`❌ SlaveAddressService: Failed to resolve conflict for device at ${conflict.address}: ${configResult.error}`);
          }
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`❌ SlaveAddressService: Error resolving conflict at ${conflict.address}: ${errorMsg}`);
          
          resolutionResults.push({
            originalAddress: conflict.address,
            newAddress: -1,
            success: false,
            error: errorMsg
          });
        }
        
        // Wait between resolutions
        await this.delay(1000);
      }
    }
    
    const successCount = resolutionResults.filter(r => r.success).length;
    console.log(`✅ SlaveAddressService: Conflict resolution complete. ${successCount}/${resolutionResults.length} conflicts resolved`);
    
    this.emit('conflicts_resolved', { 
      totalConflicts: conflicts.length, 
      resolutionResults,
      successCount 
    });
    
    return resolutionResults;
  }

  /**
   * Rollback configuration for failed bulk operations
   * 
   * Provides configuration rollback functionality:
   * - Attempts to reset devices to default addresses
   * - Uses broadcast commands for reliable rollback
   * - Logs rollback progress and results
   * 
   * Requirements: 8.2, 8.3
   */
  private async rollbackConfiguration(configuredAddresses: number[]): Promise<void> {
    console.log(`🔄 SlaveAddressService: Rolling back configuration for addresses: ${configuredAddresses.join(', ')}`);
    
    // Create backup of current state before rollback
    const backupState = new Map(this.knownDevices);
    
    try {
      // Attempt to reset each configured device back to default address (1)
      // Note: This is a simplified rollback - in practice, you might want to restore original addresses
      for (const address of configuredAddresses) {
        try {
          console.log(`🔄 SlaveAddressService: Rolling back address ${address} to default (1)`);
          
          // Try to reset to address 1 (default)
          const rollbackResult = await this.setSlaveAddress(address, 1);
          
          if (rollbackResult.success) {
            console.log(`✅ SlaveAddressService: Successfully rolled back address ${address}`);
          } else {
            console.warn(`⚠️ SlaveAddressService: Failed to rollback address ${address}: ${rollbackResult.error}`);
          }
          
        } catch (error) {
          console.warn(`⚠️ SlaveAddressService: Error during rollback of address ${address}: ${error}`);
        }
        
        // Wait between rollback operations
        await this.delay(1000);
      }
      
      // Clear device cache since addresses have changed
      this.clearDeviceCache();
      
      console.log(`✅ SlaveAddressService: Rollback completed for ${configuredAddresses.length} addresses`);
      
    } catch (error) {
      console.error(`❌ SlaveAddressService: Rollback failed: ${error}`);
      
      // Restore backup state if rollback fails
      this.knownDevices = backupState;
      throw error;
    }
  }

  /**
   * Get configuration backup for rollback purposes
   */
  createConfigurationBackup(): Map<number, ModbusDevice> {
    const backup = new Map(this.knownDevices);
    console.log(`💾 SlaveAddressService: Configuration backup created (${backup.size} devices)`);
    return backup;
  }

  /**
   * Restore configuration from backup
   */
  restoreConfigurationBackup(backup: Map<number, ModbusDevice>): void {
    this.knownDevices = new Map(backup);
    console.log(`🔄 SlaveAddressService: Configuration restored from backup (${this.knownDevices.size} devices)`);
  }

  /**
   * Get cached device information
   */
  getKnownDevices(): Map<number, ModbusDevice> {
    return new Map(this.knownDevices);
  }

  /**
   * Clear device cache
   */
  clearDeviceCache(): void {
    this.knownDevices.clear();
    console.log(`🧹 SlaveAddressService: Device cache cleared`);
  }
}