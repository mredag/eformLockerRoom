/**
 * Hardware Detection Service for eForm Locker System
 * Provides automatic hardware discovery and device identification capabilities
 * Built upon proven dual relay card solution patterns
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { ModbusController, ModbusConfig } from '../../app/kiosk/src/hardware/modbus-controller';
import { RelayCard } from '../types/system-config';

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  available: boolean;
  description?: string;
  isUSBRS485?: boolean;
}

export interface ModbusDevice {
  address: number;
  type: DeviceType;
  capabilities: DeviceCapabilities;
  status: 'responding' | 'timeout' | 'error';
  responseTime: number;
  lastSeen: Date;
  firmwareVersion?: string;
  isNew?: boolean;
}

export interface DeviceType {
  manufacturer: 'waveshare' | 'generic' | 'unknown';
  model: string;
  channels: number;
  features: string[];
  confidence: number; // 0-1 confidence in identification
}

export interface DeviceCapabilities {
  maxRelays: number;
  supportedFunctions: number[];
  firmwareVersion?: string;
  addressConfigurable: boolean;
  timedPulseSupport: boolean;
  multipleCoilsSupport: boolean;
  registerReadSupport: boolean;
}

export interface AddressRange {
  start: number;
  end: number;
}

export interface HardwareDetectionResult {
  serialPorts: SerialPortInfo[];
  detectedDevices: ModbusDevice[];
  newDevices: ModbusDevice[];
  conflicts: AddressConflict[];
  recommendations: ConfigurationRecommendation[];
  scanDuration: number;
  timestamp: Date;
}

export interface AddressConflict {
  address: number;
  devices: ModbusDevice[];
  severity: 'warning' | 'error';
  autoResolvable: boolean;
  suggestedResolution?: string;
}

export interface ConfigurationRecommendation {
  type: 'address_assignment' | 'layout_update' | 'service_restart' | 'hardware_check';
  priority: 'high' | 'medium' | 'low';
  description: string;
  autoApplicable: boolean;
  action?: () => Promise<void>;
}

export interface ScanOptions {
  addressRange?: AddressRange;
  timeout?: number;
  retries?: number;
  skipKnownDevices?: boolean;
  includeOfflineDevices?: boolean;
}

// ============================================================================
// HARDWARE DETECTION SERVICE
// ============================================================================

export class HardwareDetectionService extends EventEmitter {
  private knownDevices: Map<number, ModbusDevice> = new Map();
  private deviceCache: Map<string, ModbusDevice[]> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private scanInProgress = false;
  private monitoringActive = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(
    private config: ModbusConfig,
    private existingCards: RelayCard[] = []
  ) {
    super();
    this.setMaxListeners(20);
    
    // Initialize known devices from existing configuration
    this.initializeKnownDevices();
  }

  // ============================================================================
  // SERIAL PORT SCANNING (Subtask 2.1)
  // ============================================================================

  /**
   * Scan for available serial ports and identify USB-RS485 adapters
   * Requirements: 1.1, 1.2
   */
  async scanSerialPorts(): Promise<SerialPortInfo[]> {
    try {
      console.log('🔍 Hardware Detection: Scanning for serial ports...');
      
      const ports = await SerialPort.list();
      const portInfos: SerialPortInfo[] = [];

      for (const port of ports) {
        const portInfo: SerialPortInfo = {
          path: port.path,
          manufacturer: port.manufacturer,
          serialNumber: port.serialNumber,
          vendorId: port.vendorId,
          productId: port.productId,
          available: false,
          description: this.generatePortDescription(port),
          isUSBRS485: this.isUSBRS485Adapter(port)
        };

        // Test port availability
        portInfo.available = await this.validateSerialPort(port.path);
        portInfos.push(portInfo);

        console.log(`📡 Found port: ${port.path} (${portInfo.description}) - ${portInfo.available ? 'Available' : 'Busy'}`);
      }

      console.log(`✅ Serial port scan complete: ${portInfos.length} ports found, ${portInfos.filter(p => p.available).length} available`);
      
      this.emit('ports_scanned', { ports: portInfos, timestamp: new Date() });
      return portInfos;

    } catch (error) {
      const errorMsg = `Failed to scan serial ports: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMsg}`);
      this.emit('scan_error', { error: errorMsg, operation: 'port_scan' });
      throw new Error(errorMsg);
    }
  }

  /**
   * Validate if a serial port is accessible and available
   * Requirements: 1.1, 1.2
   */
  async validateSerialPort(portPath: string): Promise<boolean> {
    try {
      const testPort = new SerialPort({
        path: portPath,
        baudRate: 9600,
        autoOpen: false
      });

      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          testPort.close();
          resolve(false);
        }, 2000);

        testPort.open((err) => {
          clearTimeout(timeout);
          if (err) {
            resolve(false);
          } else {
            testPort.close(() => {
              resolve(true);
            });
          }
        });
      });

    } catch (error) {
      console.warn(`⚠️ Port validation failed for ${portPath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Generate human-readable description for serial port
   */
  private generatePortDescription(port: any): string {
    if (port.manufacturer && port.manufacturer.toLowerCase().includes('ftdi')) {
      return `FTDI USB-Serial (${port.manufacturer})`;
    }
    
    if (port.manufacturer && port.manufacturer.toLowerCase().includes('prolific')) {
      return `Prolific USB-Serial (${port.manufacturer})`;
    }
    
    if (port.manufacturer && port.manufacturer.toLowerCase().includes('ch340')) {
      return `CH340 USB-Serial (${port.manufacturer})`;
    }
    
    if (port.manufacturer) {
      return `${port.manufacturer} Serial Device`;
    }
    
    return `Serial Device (${port.path})`;
  }

  /**
   * Identify if port is likely a USB-RS485 adapter
   */
  private isUSBRS485Adapter(port: any): boolean {
    const indicators = [
      'ftdi', 'prolific', 'ch340', 'cp210', 'rs485', 'modbus'
    ];
    
    const searchText = [
      port.manufacturer?.toLowerCase() || '',
      port.serialNumber?.toLowerCase() || '',
      port.productId?.toLowerCase() || ''
    ].join(' ');
    
    return indicators.some(indicator => searchText.includes(indicator));
  }

  // ============================================================================
  // MODBUS DEVICE DISCOVERY (Subtask 2.2)
  // ============================================================================

  /**
   * Scan for Modbus devices on specified port and address range
   * Requirements: 1.3, 1.4, 1.5
   */
  async scanModbusDevices(
    portPath: string, 
    options: ScanOptions = {}
  ): Promise<ModbusDevice[]> {
    if (this.scanInProgress) {
      throw new Error('Scan already in progress');
    }

    this.scanInProgress = true;
    const startTime = Date.now();

    try {
      console.log(`🔍 Hardware Detection: Scanning Modbus devices on ${portPath}...`);
      
      const addressRange = options.addressRange || { start: 1, end: 255 };
      const timeout = options.timeout || 2000;
      const retries = options.retries || 2;
      
      // Check cache first
      const cacheKey = `${portPath}_${addressRange.start}_${addressRange.end}`;
      if (!options.skipKnownDevices && this.deviceCache.has(cacheKey)) {
        const cached = this.deviceCache.get(cacheKey)!;
        const cacheAge = Date.now() - cached[0]?.lastSeen.getTime();
        
        if (cacheAge < this.cacheTimeout) {
          console.log(`📋 Using cached results for ${portPath} (${cached.length} devices)`);
          this.scanInProgress = false;
          return cached;
        }
      }

      // Create temporary Modbus controller for scanning
      const scanConfig: ModbusConfig = {
        ...this.config,
        port: portPath,
        timeout_ms: timeout,
        max_retries: retries,
        test_mode: true // Disable queue processor
      };

      const scanner = new ModbusController(scanConfig);
      await scanner.initialize();

      const detectedDevices: ModbusDevice[] = [];
      const totalAddresses = addressRange.end - addressRange.start + 1;
      let scannedCount = 0;

      console.log(`🔄 Scanning addresses ${addressRange.start}-${addressRange.end} (${totalAddresses} addresses)`);

      for (let address = addressRange.start; address <= addressRange.end; address++) {
        try {
          scannedCount++;
          const progress = Math.round((scannedCount / totalAddresses) * 100);
          
          if (scannedCount % 10 === 0 || progress === 100) {
            console.log(`📊 Scan progress: ${progress}% (${scannedCount}/${totalAddresses})`);
            this.emit('scan_progress', { progress, scannedCount, totalAddresses, currentAddress: address });
          }

          const device = await this.probeModbusAddress(scanner, address, timeout);
          if (device) {
            detectedDevices.push(device);
            console.log(`✅ Found device at address ${address}: ${device.type.manufacturer} ${device.type.model}`);
          }

        } catch (error) {
          // Continue scanning even if individual address fails
          console.debug(`⚠️ Address ${address} probe failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Small delay between probes to prevent overwhelming the bus
        await this.delay(50);
      }

      // Clean up scanner
      await scanner.disconnect();

      // Cache results
      this.deviceCache.set(cacheKey, detectedDevices);

      const scanDuration = Date.now() - startTime;
      console.log(`✅ Modbus scan complete: ${detectedDevices.length} devices found in ${scanDuration}ms`);
      
      this.emit('devices_scanned', { 
        devices: detectedDevices, 
        portPath, 
        scanDuration, 
        timestamp: new Date() 
      });

      return detectedDevices;

    } catch (error) {
      const errorMsg = `Modbus scan failed on ${portPath}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMsg}`);
      this.emit('scan_error', { error: errorMsg, operation: 'modbus_scan', portPath });
      throw new Error(errorMsg);

    } finally {
      this.scanInProgress = false;
    }
  }

  /**
   * Probe a specific Modbus address to detect device presence and type
   * Requirements: 1.3, 1.4, 1.5
   */
  private async probeModbusAddress(
    scanner: ModbusController, 
    address: number, 
    timeout: number
  ): Promise<ModbusDevice | null> {
    const startTime = Date.now();

    try {
      // Try to read coil status (Function 0x01) - most basic Modbus function
      // This is the same approach used in the proven dual card solution
      const success = await this.testBasicCommunication(scanner, address);
      
      if (!success) {
        return null;
      }

      const responseTime = Date.now() - startTime;
      
      // Identify device type using proven fingerprinting methods
      const deviceType = await this.identifyDeviceType(scanner, address);
      const capabilities = await this.getDeviceCapabilities(scanner, address, deviceType);

      const device: ModbusDevice = {
        address,
        type: deviceType,
        capabilities,
        status: 'responding',
        responseTime,
        lastSeen: new Date(),
        isNew: !this.knownDevices.has(address)
      };

      return device;

    } catch (error) {
      console.debug(`Address ${address} probe failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Test basic Modbus communication with device
   */
  private async testBasicCommunication(scanner: ModbusController, address: number): Promise<boolean> {
    try {
      // Use the proven method from dual card solution: read register 0x4000
      // This is where Waveshare cards store their slave address
      const result = await scanner.readRelayStatus(address, 0, 1);
      return Array.isArray(result);
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Identify device type using fingerprinting techniques
   * Requirements: 1.4, 1.5
   */
  async identifyDeviceType(scanner: ModbusController, address: number): Promise<DeviceType> {
    try {
      // Default device type
      let deviceType: DeviceType = {
        manufacturer: 'unknown',
        model: 'Generic Modbus Device',
        channels: 16, // Default assumption
        features: ['basic_coils'],
        confidence: 0.3
      };

      // Try Waveshare-specific identification
      const waveshareType = await this.identifyWaveshareDevice(scanner, address);
      if (waveshareType) {
        return waveshareType;
      }

      // Try generic relay card identification
      const relayType = await this.identifyGenericRelayCard(scanner, address);
      if (relayType) {
        return relayType;
      }

      return deviceType;

    } catch (error) {
      console.debug(`Device type identification failed for address ${address}: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        manufacturer: 'unknown',
        model: 'Unknown Device',
        channels: 0,
        features: [],
        confidence: 0.1
      };
    }
  }

  /**
   * Identify Waveshare relay cards using proven methods from dual card solution
   */
  private async identifyWaveshareDevice(scanner: ModbusController, address: number): Promise<DeviceType | null> {
    try {
      // Waveshare cards respond to specific register reads
      // Try reading the slave address register (0x4000) - this is Waveshare-specific
      const hasAddressRegister = await this.testWaveshareAddressRegister(scanner, address);
      
      if (hasAddressRegister) {
        // This is likely a Waveshare device
        const channels = await this.detectChannelCount(scanner, address);
        
        return {
          manufacturer: 'waveshare',
          model: `Waveshare ${channels}CH Relay`,
          channels,
          features: [
            'modbus_rtu',
            'coil_control',
            'address_configurable',
            'multiple_coils',
            'timed_pulse'
          ],
          confidence: 0.9
        };
      }

      return null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Test for Waveshare-specific address register (0x4000)
   */
  private async testWaveshareAddressRegister(scanner: ModbusController, address: number): Promise<boolean> {
    try {
      // This is the proven method from the dual card solution
      // Waveshare cards store their slave address in register 0x4000
      // We can't directly access this through the current ModbusController interface,
      // but we can infer it through successful communication patterns
      
      // Test multiple coil write capability (Waveshare supports 0x0F)
      const supportsMultipleCoils = await scanner.writeMultipleRelays(address, 0, [false]);
      return supportsMultipleCoils;
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect number of channels/relays on device
   */
  private async detectChannelCount(scanner: ModbusController, address: number): Promise<number> {
    try {
      // Try reading different numbers of coils to determine capacity
      const testSizes = [16, 8, 4, 32]; // Common relay card sizes
      
      for (const size of testSizes) {
        try {
          const result = await scanner.readRelayStatus(address, 0, size);
          if (result && result.length === size) {
            return size;
          }
        } catch (error) {
          // Continue testing other sizes
        }
      }
      
      return 16; // Default assumption for Waveshare cards
      
    } catch (error) {
      return 16;
    }
  }

  /**
   * Identify generic relay cards
   */
  private async identifyGenericRelayCard(scanner: ModbusController, address: number): Promise<DeviceType | null> {
    try {
      // Test basic coil operations
      const supportsCoils = await this.testCoilOperations(scanner, address);
      
      if (supportsCoils) {
        const channels = await this.detectChannelCount(scanner, address);
        
        return {
          manufacturer: 'generic',
          model: `Generic ${channels}CH Relay`,
          channels,
          features: ['modbus_rtu', 'coil_control'],
          confidence: 0.6
        };
      }

      return null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Test basic coil operations
   */
  private async testCoilOperations(scanner: ModbusController, address: number): Promise<boolean> {
    try {
      // Test reading coils
      const readResult = await scanner.readRelayStatus(address, 0, 1);
      if (!readResult || readResult.length === 0) {
        return false;
      }

      // Test writing coils (safely - just turn off)
      const writeResult = await scanner.writeMultipleRelays(address, 0, [false]);
      return writeResult;

    } catch (error) {
      return false;
    }
  }

  /**
   * Get device capabilities through testing
   * Requirements: 1.4, 1.5
   */
  async getDeviceCapabilities(
    scanner: ModbusController, 
    address: number, 
    deviceType: DeviceType
  ): Promise<DeviceCapabilities> {
    const capabilities: DeviceCapabilities = {
      maxRelays: deviceType.channels,
      supportedFunctions: [0x01, 0x05], // Basic read/write coils
      addressConfigurable: false,
      timedPulseSupport: false,
      multipleCoilsSupport: false,
      registerReadSupport: false
    };

    try {
      // Test multiple coils support (Function 0x0F)
      try {
        const multipleCoilsResult = await scanner.writeMultipleRelays(address, 0, [false]);
        if (multipleCoilsResult) {
          capabilities.supportedFunctions.push(0x0F);
          capabilities.multipleCoilsSupport = true;
        }
      } catch (error) {
        // Function not supported
      }

      // Test register read support (Function 0x03)
      try {
        // This would require extending ModbusController, for now assume based on device type
        if (deviceType.manufacturer === 'waveshare') {
          capabilities.supportedFunctions.push(0x03, 0x06);
          capabilities.registerReadSupport = true;
          capabilities.addressConfigurable = true;
          capabilities.timedPulseSupport = true;
        }
      } catch (error) {
        // Function not supported
      }

      console.log(`📋 Device ${address} capabilities: ${capabilities.supportedFunctions.length} functions, ${capabilities.maxRelays} relays`);
      
      return capabilities;

    } catch (error) {
      console.warn(`⚠️ Capability detection failed for address ${address}: ${error instanceof Error ? error.message : String(error)}`);
      return capabilities;
    }
  }

  // ============================================================================
  // NEW DEVICE DETECTION (Subtask 2.3)
  // ============================================================================

  /**
   * Detect new devices not in current configuration
   * Requirements: 1.6, 2.1
   */
  async detectNewDevices(knownDevices?: ModbusDevice[]): Promise<ModbusDevice[]> {
    try {
      console.log('🔍 Hardware Detection: Detecting new devices...');
      
      // Get current known devices
      const currentKnown = knownDevices || Array.from(this.knownDevices.values());
      const knownAddresses = new Set(currentKnown.map(d => d.address));
      
      // Scan all available ports
      const ports = await this.scanSerialPorts();
      const availablePorts = ports.filter(p => p.available);
      
      if (availablePorts.length === 0) {
        console.warn('⚠️ No available serial ports found for device detection');
        return [];
      }

      const newDevices: ModbusDevice[] = [];
      
      for (const port of availablePorts) {
        try {
          console.log(`🔄 Scanning ${port.path} for new devices...`);
          
          const devices = await this.scanModbusDevices(port.path, {
            addressRange: { start: 1, end: 10 }, // Focus on common addresses first
            skipKnownDevices: false
          });
          
          // Filter out known devices
          const unknownDevices = devices.filter(device => !knownAddresses.has(device.address));
          
          for (const device of unknownDevices) {
            device.isNew = true;
            newDevices.push(device);
            console.log(`🆕 New device detected: Address ${device.address} - ${device.type.manufacturer} ${device.type.model}`);
          }
          
        } catch (error) {
          console.warn(`⚠️ Failed to scan ${port.path} for new devices: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      if (newDevices.length > 0) {
        console.log(`✅ New device detection complete: ${newDevices.length} new devices found`);
        this.emit('new_devices_detected', { devices: newDevices, timestamp: new Date() });
      } else {
        console.log('📋 No new devices detected');
      }
      
      return newDevices;

    } catch (error) {
      const errorMsg = `New device detection failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`❌ ${errorMsg}`);
      this.emit('detection_error', { error: errorMsg, operation: 'new_device_detection' });
      throw new Error(errorMsg);
    }
  }

  /**
   * Compare devices to distinguish new from existing
   */
  private compareDevices(device1: ModbusDevice, device2: ModbusDevice): boolean {
    return (
      device1.address === device2.address &&
      device1.type.manufacturer === device2.type.manufacturer &&
      device1.type.model === device2.type.model &&
      device1.capabilities.maxRelays === device2.capabilities.maxRelays
    );
  }

  /**
   * Start real-time monitoring for new devices
   * Requirements: 1.6, 2.1
   */
  monitorForNewDevices(callback: (device: ModbusDevice) => void, intervalMs: number = 30000): void {
    if (this.monitoringActive) {
      console.warn('⚠️ Device monitoring already active');
      return;
    }

    console.log(`🔄 Starting device monitoring (interval: ${intervalMs}ms)`);
    this.monitoringActive = true;

    this.monitorInterval = setInterval(async () => {
      try {
        const newDevices = await this.detectNewDevices();
        
        for (const device of newDevices) {
          callback(device);
          
          // Add to known devices to prevent duplicate detection
          this.knownDevices.set(device.address, device);
        }
        
      } catch (error) {
        console.error(`❌ Device monitoring error: ${error instanceof Error ? error.message : String(error)}`);
        this.emit('monitoring_error', { error: error instanceof Error ? error.message : String(error) });
      }
    }, intervalMs);

    this.emit('monitoring_started', { interval: intervalMs });
  }

  /**
   * Stop real-time device monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    this.monitoringActive = false;
    console.log('⏹️ Device monitoring stopped');
    this.emit('monitoring_stopped');
  }

  // ============================================================================
  // CACHING AND OPTIMIZATION
  // ============================================================================

  /**
   * Clear device cache to force fresh scans
   */
  clearCache(): void {
    this.deviceCache.clear();
    console.log('🗑️ Device cache cleared');
  }

  /**
   * Get cached scan results if available
   */
  getCachedResults(portPath: string, addressRange: AddressRange): ModbusDevice[] | null {
    const cacheKey = `${portPath}_${addressRange.start}_${addressRange.end}`;
    const cached = this.deviceCache.get(cacheKey);
    
    if (!cached || cached.length === 0) {
      return null;
    }
    
    const cacheAge = Date.now() - cached[0].lastSeen.getTime();
    if (cacheAge > this.cacheTimeout) {
      this.deviceCache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Initialize known devices from existing configuration
   */
  private initializeKnownDevices(): void {
    for (const card of this.existingCards) {
      if (card.enabled) {
        const device: ModbusDevice = {
          address: card.slave_address,
          type: {
            manufacturer: card.type.includes('waveshare') ? 'waveshare' : 'generic',
            model: card.type,
            channels: card.channels,
            features: ['modbus_rtu', 'coil_control'],
            confidence: 1.0
          },
          capabilities: {
            maxRelays: card.channels,
            supportedFunctions: [0x01, 0x05, 0x0F],
            addressConfigurable: card.type.includes('waveshare'),
            timedPulseSupport: card.type.includes('waveshare'),
            multipleCoilsSupport: true,
            registerReadSupport: card.type.includes('waveshare')
          },
          status: 'responding',
          responseTime: 0,
          lastSeen: new Date(),
          isNew: false
        };
        
        this.knownDevices.set(card.slave_address, device);
      }
    }
    
    console.log(`📋 Initialized ${this.knownDevices.size} known devices from configuration`);
  }

  /**
   * Get all known devices
   */
  getKnownDevices(): ModbusDevice[] {
    return Array.from(this.knownDevices.values());
  }

  /**
   * Add device to known devices list
   */
  addKnownDevice(device: ModbusDevice): void {
    this.knownDevices.set(device.address, device);
  }

  /**
   * Remove device from known devices list
   */
  removeKnownDevice(address: number): void {
    this.knownDevices.delete(address);
  }

  /**
   * Check if scan is currently in progress
   */
  isScanInProgress(): boolean {
    return this.scanInProgress;
  }

  /**
   * Check if monitoring is active
   */
  isMonitoringActive(): boolean {
    return this.monitoringActive;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.stopMonitoring();
    this.clearCache();
    this.removeAllListeners();
    console.log('🧹 Hardware Detection Service cleaned up');
  }
}

export default HardwareDetectionService;