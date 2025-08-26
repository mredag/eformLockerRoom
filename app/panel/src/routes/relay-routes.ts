/**
 * Relay Control Routes for Admin Panel
 * Provides direct hardware relay control endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Use SerialPort with working commands (same as Kiosk fix)
const { SerialPort } = require('serialport');

class SimpleRelayService {
  private serialPort: any;
  private isConnected: boolean = false;
  private config = {
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    slaveId: 1,
    timeout: 2000,
    pulseDuration: 500
  };

  constructor() {
    this.serialPort = null;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      // Check if Kiosk service is using the port first
      const kioskRunning = await this.isKioskServiceRunning();
      if (kioskRunning) {
        throw new Error(`Port ${this.config.port} is in use by Kiosk service. Direct relay control disabled. Use queue-based commands instead.`);
      }

      // Use SerialPort directly (same as working Kiosk method)
      this.serialPort = new SerialPort({
        path: this.config.port,
        baudRate: this.config.baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false
      });

      await new Promise<void>((resolve, reject) => {
        this.serialPort.open((err: any) => {
          if (err) {
            reject(new Error(`Failed to open relay port: ${err.message}`));
          } else {
            resolve();
          }
        });
      });

      this.isConnected = true;
      console.log(`✅ Relay service connected to ${this.config.port}`);
    } catch (error) {
      console.error('❌ Failed to connect to relay hardware:', error.message);
      throw new Error(`Relay connection failed: ${error.message}`);
    }
  }

  private async isKioskServiceRunning(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:3002/health', { 
        method: 'GET',
        signal: AbortSignal.timeout(1000)
      });
      
      if (response.ok) {
        console.log('🔍 Kiosk service detected - port conflict likely');
        return true;
      }
    } catch (error) {
      // Kiosk not responding, probably not running
    }
    
    return false;
  }

  async disconnect(): Promise<void> {
    if (this.isConnected && this.serialPort) {
      this.serialPort.close();
      this.isConnected = false;
      console.log('🔌 Relay service disconnected');
    }
  }

  // CRC16 calculation (same as working Kiosk method)
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

  // Build basic ON/OFF command (same as working Kiosk method)
  private buildModbusCommand(slaveId: number, functionCode: number, startAddress: number, value: number): Buffer {
    const buffer = Buffer.alloc(8);
    
    buffer[0] = slaveId;
    buffer[1] = functionCode;
    buffer[2] = (startAddress >> 8) & 0xFF;  // Start address high
    buffer[3] = startAddress & 0xFF;         // Start address low
    buffer[4] = (value >> 8) & 0xFF;         // Value high
    buffer[5] = value & 0xFF;                // Value low
    
    // Calculate CRC16 using the SAME method as working Kiosk
    const crc = this.calculateCRC16(buffer.subarray(0, 6));
    buffer[6] = crc & 0xFF;                  // CRC low byte
    buffer[7] = (crc >> 8) & 0xFF;           // CRC high byte
    
    return buffer;
  }

  // Send command to hardware
  private async writeCommand(command: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serialPort.write(command, (err: any) => {
        if (err) {
          reject(new Error(`Write failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async activateRelay(relayNumber: number): Promise<boolean> {
    if (!this.isConnected) {
      await this.connect();
    }

    // Map locker ID to card and relay using the same formula as ModbusController
    const cardId = Math.ceil(relayNumber / 16);
    const relayId = ((relayNumber - 1) % 16) + 1;
    const coilAddress = relayId - 1;
    
    console.log(`🔌 Activating locker ${relayNumber} -> Card ${cardId}, Relay ${relayId} (coil ${coilAddress})`);
    console.log(`🔄 Using WORKING software pulse method (same as Kiosk fix)`);
    
    try {
      // Use the SAME working method as Kiosk: basic ON/OFF commands (0x05)
      const turnOnCommand = this.buildModbusCommand(cardId, 0x05, coilAddress, 0xFF00);
      console.log(`📡 ON command: ${turnOnCommand.toString('hex').toUpperCase()}`);
      
      await this.writeCommand(turnOnCommand);
      console.log(`🔌 Relay ${relayNumber} turned ON`);
      
      // Wait for pulse duration
      await new Promise(resolve => setTimeout(resolve, this.config.pulseDuration));
      
      const turnOffCommand = this.buildModbusCommand(cardId, 0x05, coilAddress, 0x0000);
      console.log(`📡 OFF command: ${turnOffCommand.toString('hex').toUpperCase()}`);
      
      await this.writeCommand(turnOffCommand);
      console.log(`🔌 Relay ${relayNumber} turned OFF (safety)`);
      
    } catch (error) {
      console.error(`❌ Error during relay ${relayNumber} activation:`, error.message);
      return false;
    }
    
    console.log(`✅ Locker ${relayNumber} activated successfully (Card ${cardId}, Relay ${relayId})`);
    return true;
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
      // If we're already connected, that's a good sign
      if (this.isConnected) {
        console.log('✅ Relay service already connected');
        return true;
      }
      
      // Try to establish connection
      await this.connect();
      console.log('✅ Relay service connection test passed');
      return true;
    } catch (error) {
      console.error('❌ Relay service connection test failed:', error.message);
      return false;
    }
  }

  getConfig() {
    return { ...this.config };
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let relayService: SimpleRelayService | null = null;

function getRelayService(): SimpleRelayService {
  if (!relayService) {
    relayService = new SimpleRelayService();
  }
  return relayService;
}

interface RelayActivationRequest {
  Body: {
    relay_number: number;
    staff_user?: string;
    reason?: string;
  };
}

interface BulkRelayActivationRequest {
  Body: {
    relay_numbers: number[];
    interval_ms?: number;
    staff_user?: string;
    reason?: string;
  };
}

interface RelayTestRequest {
  Body: {
    test_type: 'single' | 'sequence' | 'connection';
    relay_numbers?: number[];
  };
}

export async function registerRelayRoutes(fastify: FastifyInstance) {
  const relayService = getRelayService();

  // Test relay connection
  fastify.post('/api/relay/test', async (request: FastifyRequest<RelayTestRequest>, reply: FastifyReply) => {
    try {
      const { test_type, relay_numbers } = request.body;
      
      console.log(`🧪 Relay test requested: ${test_type}`);
      
      switch (test_type) {
        case 'connection':
          const connectionOk = await relayService.testConnection();
          return reply.send({
            success: connectionOk,
            message: connectionOk ? 'Relay connection successful' : 'Relay connection failed',
            test_type: 'connection'
          });
          
        case 'single':
          const testRelay = relay_numbers?.[0] || 1;
          const singleResult = await relayService.activateRelay(testRelay);
          return reply.send({
            success: singleResult,
            message: singleResult ? `Relay ${testRelay} activated` : `Relay ${testRelay} failed`,
            test_type: 'single',
            relay_number: testRelay
          });
          
        case 'sequence':
          const testRelays = relay_numbers || [1, 2, 3];
          const sequenceResult = await relayService.activateMultipleRelays(testRelays, 1000);
          return reply.send({
            success: sequenceResult.failed.length === 0,
            message: `Sequence test: ${sequenceResult.success.length} success, ${sequenceResult.failed.length} failed`,
            test_type: 'sequence',
            results: sequenceResult
          });
          
        default:
          return reply.status(400).send({
            success: false,
            error: 'Invalid test type. Use: connection, single, or sequence'
          });
      }
      
    } catch (error) {
      console.error('❌ Relay test error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Activate single relay
  fastify.post('/api/relay/activate', async (request: FastifyRequest<RelayActivationRequest>, reply: FastifyReply) => {
    try {
      const { relay_number, staff_user, reason } = request.body;
      
      if (!relay_number || relay_number < 1 || relay_number > 30) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid relay number. Must be between 1 and 30.'
        });
      }
      
      console.log(`🔌 Single relay activation: ${relay_number} by ${staff_user || 'unknown'}`);
      
      const success = await relayService.activateRelay(relay_number);
      
      if (success) {
        return reply.send({
          success: true,
          message: `Relay ${relay_number} activated successfully`,
          relay_number,
          staff_user,
          reason,
          timestamp: new Date().toISOString()
        });
      } else {
        return reply.status(500).send({
          success: false,
          error: `Failed to activate relay ${relay_number}`,
          relay_number,
          suggestion: 'Try using queue-based locker opening instead of direct relay activation'
        });
      }
      
    } catch (error) {
      console.error('❌ Single relay activation error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isPortConflict = errorMessage.includes('Resource temporarily unavailable') || 
                            errorMessage.includes('Cannot lock port') ||
                            errorMessage.includes('in use by Kiosk service');
      
      return reply.status(500).send({
        success: false,
        error: errorMessage,
        suggestion: isPortConflict ? 
          'Port conflict detected. Use queue-based locker opening from the Lockers page instead.' :
          'Check hardware connections and try again.'
      });
    }
  });

  // Activate multiple relays
  fastify.post('/api/relay/activate-bulk', async (request: FastifyRequest<BulkRelayActivationRequest>, reply: FastifyReply) => {
    try {
      const { relay_numbers, interval_ms = 1000, staff_user, reason } = request.body;
      
      if (!relay_numbers || !Array.isArray(relay_numbers) || relay_numbers.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid relay_numbers. Must be a non-empty array.'
        });
      }
      
      // Validate relay numbers
      const invalidRelays = relay_numbers.filter(num => num < 1 || num > 30);
      if (invalidRelays.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Invalid relay numbers: ${invalidRelays.join(', ')}. Must be between 1 and 30.`
        });
      }
      
      // Clamp interval to safe range
      const safeInterval = Math.max(100, Math.min(interval_ms, 5000));
      
      console.log(`🔌 Bulk relay activation: ${relay_numbers.join(', ')} by ${staff_user || 'unknown'}`);
      
      const results = await relayService.activateMultipleRelays(relay_numbers, safeInterval);
      
      return reply.send({
        success: results.failed.length === 0,
        message: `Bulk activation: ${results.success.length} success, ${results.failed.length} failed`,
        results,
        staff_user,
        reason,
        interval_ms: safeInterval,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Bulk relay activation error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get relay service status
  fastify.get('/api/relay/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = relayService.getConfig();
      const isReady = relayService.isReady();
      
      return reply.send({
        success: true,
        status: {
          connected: isReady,
          config: {
            port: config.port,
            baudRate: config.baudRate,
            slaveId: config.slaveId,
            timeout: config.timeout,
            pulseDuration: config.pulseDuration
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Relay status error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  console.log('✅ Relay control routes registered');
}