/**
 * Relay Service for Direct Hardware Control
 * Uses proven working modbus-serial approach for relay activation
 */

const ModbusRTU = require('modbus-serial');

export interface RelayConfig {
  port: string;
  baudRate: number;
  slaveId: number;
  timeout: number;
  pulseDuration: number;
}

export class RelayService {
  private client: any;
  private config: RelayConfig;
  private isConnected: boolean = false;

  constructor(config: Partial<RelayConfig> = {}) {
    this.config = {
      port: config.port || '/dev/ttyUSB0',
      baudRate: config.baudRate || 9600,
      slaveId: config.slaveId || 1,
      timeout: config.timeout || 2000,
      pulseDuration: config.pulseDuration || 400
    };
    this.client = new ModbusRTU();
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.client.connectRTUBuffered(this.config.port, { 
        baudRate: this.config.baudRate 
      });
      this.client.setID(this.config.slaveId);
      this.client.setTimeout(this.config.timeout);
      this.isConnected = true;
      console.log(`✅ Relay service connected to ${this.config.port}`);
    } catch (error) {
      console.error('❌ Failed to connect to relay hardware:', error.message);
      throw new Error(`Relay connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected && this.client) {
      this.client.close();
      this.isConnected = false;
      console.log('🔌 Relay service disconnected');
    }
  }

  async activateRelay(relayNumber: number): Promise<boolean> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const coilAddress = relayNumber - 1; // Convert 1-based to 0-based
      
      console.log(`🔌 Activating relay ${relayNumber} (coil ${coilAddress})`);
      
      // Turn on relay
      await this.client.writeCoil(coilAddress, true);
      
      // Wait for pulse duration
      await new Promise(resolve => setTimeout(resolve, this.config.pulseDuration));
      
      // Turn off relay
      await this.client.writeCoil(coilAddress, false);
      
      console.log(`✅ Relay ${relayNumber} activated successfully`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to activate relay ${relayNumber}:`, error.message);
      return false;
    }
  }

  async activateMultipleRelays(relayNumbers: number[], intervalMs: number = 1000): Promise<{ success: number[], failed: number[] }> {
    const results = { success: [], failed: [] };
    
    if (!this.isConnected) {
      await this.connect();
    }

    console.log(`🔌 Activating ${relayNumbers.length} relays with ${intervalMs}ms intervals`);
    
    for (let i = 0; i < relayNumbers.length; i++) {
      const relayNumber = relayNumbers[i];
      
      try {
        const success = await this.activateRelay(relayNumber);
        if (success) {
          results.success.push(relayNumber);
        } else {
          results.failed.push(relayNumber);
        }
        
        // Wait between activations (except for last one)
        if (i < relayNumbers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        
      } catch (error) {
        console.error(`❌ Error activating relay ${relayNumber}:`, error.message);
        results.failed.push(relayNumber);
      }
    }
    
    console.log(`✅ Bulk activation complete: ${results.success.length} success, ${results.failed.length} failed`);
    return results;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      console.log('✅ Relay service connection test passed');
      return true;
    } catch (error) {
      console.error('❌ Relay service connection test failed:', error.message);
      return false;
    }
  }

  getConfig(): RelayConfig {
    return { ...this.config };
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

// Singleton instance for the application
let relayServiceInstance: RelayService | null = null;

export function getRelayService(config?: Partial<RelayConfig>): RelayService {
  if (!relayServiceInstance) {
    relayServiceInstance = new RelayService(config);
  }
  return relayServiceInstance;
}

export function resetRelayService(): void {
  if (relayServiceInstance) {
    relayServiceInstance.disconnect();
    relayServiceInstance = null;
  }
}