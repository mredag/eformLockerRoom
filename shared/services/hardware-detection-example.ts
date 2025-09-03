/**
 * Hardware Detection Service Usage Example
 * Demonstrates how to use the HardwareDetectionService for hardware wizard functionality
 */

import { HardwareDetectionService } from './hardware-detection-service';
import { ModbusConfig } from '../../app/kiosk/src/hardware/modbus-controller';
import { RelayCard } from '../types/system-config';

/**
 * Example usage of HardwareDetectionService
 * This shows how the service would be integrated into the hardware configuration wizard
 */
export class HardwareDetectionExample {
  private detectionService: HardwareDetectionService;

  constructor(config: ModbusConfig, existingCards: RelayCard[] = []) {
    this.detectionService = new HardwareDetectionService(config, existingCards);
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for hardware detection events
   */
  private setupEventHandlers(): void {
    // Handle port scanning results
    this.detectionService.on('ports_scanned', (data) => {
      console.log(`📡 Found ${data.ports.length} serial ports:`);
      data.ports.forEach(port => {
        const status = port.available ? '✅ Available' : '❌ Busy';
        const type = port.isUSBRS485 ? '(USB-RS485)' : '';
        console.log(`  ${port.path}: ${port.description} ${type} - ${status}`);
      });
    });

    // Handle device scanning progress
    this.detectionService.on('scan_progress', (data) => {
      console.log(`🔄 Scan progress: ${data.progress}% (${data.scannedCount}/${data.totalAddresses}) - Address ${data.currentAddress}`);
    });

    // Handle detected devices
    this.detectionService.on('devices_scanned', (data) => {
      console.log(`✅ Device scan complete on ${data.portPath}:`);
      console.log(`  Found ${data.devices.length} devices in ${data.scanDuration}ms`);
      
      data.devices.forEach(device => {
        console.log(`  Address ${device.address}: ${device.type.manufacturer} ${device.type.model} (${device.responseTime}ms)`);
        console.log(`    Channels: ${device.capabilities.maxRelays}, Functions: ${device.capabilities.supportedFunctions.join(', ')}`);
      });
    });

    // Handle new device detection
    this.detectionService.on('new_devices_detected', (data) => {
      console.log(`🆕 New devices detected: ${data.devices.length}`);
      data.devices.forEach(device => {
        console.log(`  NEW: Address ${device.address} - ${device.type.manufacturer} ${device.type.model}`);
      });
    });

    // Handle errors
    this.detectionService.on('scan_error', (data) => {
      console.error(`❌ Scan error in ${data.operation}: ${data.error}`);
    });

    this.detectionService.on('detection_error', (data) => {
      console.error(`❌ Detection error in ${data.operation}: ${data.error}`);
    });
  }

  /**
   * Example: Complete hardware discovery workflow
   * This demonstrates the typical wizard flow for hardware detection
   */
  async performCompleteHardwareDiscovery(): Promise<void> {
    try {
      console.log('🚀 Starting complete hardware discovery...');

      // Step 1: Scan for available serial ports
      console.log('\n📡 Step 1: Scanning serial ports...');
      const ports = await this.detectionService.scanSerialPorts();
      const availablePorts = ports.filter(p => p.available && p.isUSBRS485);

      if (availablePorts.length === 0) {
        console.warn('⚠️ No available USB-RS485 adapters found!');
        return;
      }

      console.log(`✅ Found ${availablePorts.length} available USB-RS485 adapter(s)`);

      // Step 2: Scan each port for Modbus devices
      console.log('\n🔍 Step 2: Scanning for Modbus devices...');
      const allDevices = [];

      for (const port of availablePorts) {
        console.log(`\n🔄 Scanning ${port.path}...`);
        
        try {
          const devices = await this.detectionService.scanModbusDevices(port.path, {
            addressRange: { start: 1, end: 10 }, // Scan common addresses first
            timeout: 2000,
            retries: 2
          });

          allDevices.push(...devices);
          
        } catch (error) {
          console.error(`❌ Failed to scan ${port.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Step 3: Identify new devices
      console.log('\n🆕 Step 3: Detecting new devices...');
      const newDevices = await this.detectionService.detectNewDevices();

      // Step 4: Generate recommendations
      console.log('\n📋 Step 4: Generating recommendations...');
      this.generateRecommendations(allDevices, newDevices);

      console.log('\n✅ Hardware discovery complete!');

    } catch (error) {
      console.error(`❌ Hardware discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Example: Monitor for new devices in real-time
   */
  startRealTimeMonitoring(): void {
    console.log('🔄 Starting real-time device monitoring...');

    this.detectionService.monitorForNewDevices((device) => {
      console.log(`🆕 REAL-TIME: New device detected at address ${device.address}`);
      console.log(`   Type: ${device.type.manufacturer} ${device.type.model}`);
      console.log(`   Capabilities: ${device.capabilities.maxRelays} relays`);
      
      // In a real wizard, this would trigger UI updates
      this.handleNewDeviceDetected(device);
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop real-time monitoring
   */
  stopRealTimeMonitoring(): void {
    console.log('⏹️ Stopping real-time device monitoring...');
    this.detectionService.stopMonitoring();
  }

  /**
   * Example: Handle new device detection in wizard context
   */
  private handleNewDeviceDetected(device: any): void {
    // In a real implementation, this would:
    // 1. Update the wizard UI to show the new device
    // 2. Offer to configure the device automatically
    // 3. Update the system configuration
    
    console.log(`🔧 Would configure new device: Address ${device.address}`);
    
    // Add to known devices to prevent duplicate detection
    this.detectionService.addKnownDevice(device);
  }

  /**
   * Generate configuration recommendations based on detected devices
   */
  private generateRecommendations(allDevices: any[], newDevices: any[]): void {
    console.log('\n💡 Configuration Recommendations:');

    if (newDevices.length > 0) {
      console.log(`  • ${newDevices.length} new device(s) detected - consider adding to configuration`);
      
      newDevices.forEach(device => {
        const nextAddress = this.findNextAvailableAddress(allDevices);
        console.log(`    - Device at address ${device.address} could be configured as address ${nextAddress}`);
      });
    }

    if (allDevices.length === 0) {
      console.log('  • No devices detected - check connections and power');
    }

    const waveshareDevices = allDevices.filter(d => d.type.manufacturer === 'waveshare');
    if (waveshareDevices.length > 0) {
      console.log(`  • ${waveshareDevices.length} Waveshare device(s) detected - full wizard features available`);
    }

    const conflicts = this.detectAddressConflicts(allDevices);
    if (conflicts.length > 0) {
      console.log(`  • ${conflicts.length} address conflict(s) detected - automatic resolution available`);
    }
  }

  /**
   * Find next available address for new device
   */
  private findNextAvailableAddress(devices: any[]): number {
    const usedAddresses = new Set(devices.map(d => d.address));
    
    for (let addr = 1; addr <= 255; addr++) {
      if (!usedAddresses.has(addr)) {
        return addr;
      }
    }
    
    return 1; // Fallback
  }

  /**
   * Detect address conflicts
   */
  private detectAddressConflicts(devices: any[]): any[] {
    const addressCounts = new Map<number, number>();
    
    devices.forEach(device => {
      const count = addressCounts.get(device.address) || 0;
      addressCounts.set(device.address, count + 1);
    });
    
    return Array.from(addressCounts.entries())
      .filter(([address, count]) => count > 1)
      .map(([address, count]) => ({ address, count }));
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.stopRealTimeMonitoring();
    await this.detectionService.cleanup();
    console.log('🧹 Hardware detection example cleaned up');
  }
}

/**
 * Example usage function
 */
export async function runHardwareDetectionExample(): Promise<void> {
  const config: ModbusConfig = {
    port: '/dev/ttyUSB0',
    baudrate: 9600,
    timeout_ms: 2000,
    pulse_duration_ms: 400,
    burst_duration_seconds: 10,
    burst_interval_ms: 2000,
    command_interval_ms: 300,
    test_mode: false
  };

  const existingCards: RelayCard[] = [
    {
      slave_address: 1,
      channels: 16,
      type: 'waveshare_16ch',
      description: 'Existing Card 1',
      enabled: true
    }
  ];

  const example = new HardwareDetectionExample(config, existingCards);

  try {
    // Run complete discovery
    await example.performCompleteHardwareDiscovery();

    // Start monitoring for 60 seconds
    example.startRealTimeMonitoring();
    
    console.log('\n⏳ Monitoring for new devices for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));
    
  } catch (error) {
    console.error('Example failed:', error);
  } finally {
    await example.cleanup();
  }
}

// Export for use in other modules
export default HardwareDetectionExample;