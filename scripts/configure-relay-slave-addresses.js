#!/usr/bin/env node

/**
 * Configure Waveshare Modbus RTU Relay 16CH Slave Addresses
 * 
 * The Waveshare relay cards use software-based slave ID configuration.
 * Each device stores its ID in register 0x4000.
 * 
 * IMPORTANT: Connect only ONE relay card at a time when setting addresses!
 */

const { SerialPort } = require('serialport');

class WaveshareSlaveConfigurator {
  constructor(portPath = '/dev/ttyUSB0', baudRate = 9600) {
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.port = null;
  }

  /**
   * Calculate CRC16 for Modbus RTU
   */
  calculateCRC16(data) {
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
   * Build Write Single Register command (Function 0x06)
   * Format: [slave_id] [0x06] [reg_high] [reg_low] [value_high] [value_low] [crc_low] [crc_high]
   */
  buildWriteRegisterCommand(slaveId, register, value) {
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
   * Build Read Holding Registers command (Function 0x03)
   */
  buildReadRegisterCommand(slaveId, register, count = 1) {
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
   * Open serial port
   */
  async openPort() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false
      });

      this.port.open((err) => {
        if (err) {
          reject(new Error(`Failed to open port ${this.portPath}: ${err.message}`));
        } else {
          console.log(`✅ Serial port ${this.portPath} opened successfully`);
          resolve();
        }
      });
    });
  }

  /**
   * Close serial port
   */
  async closePort() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          console.log(`✅ Serial port closed`);
          resolve();
        });
      });
    }
  }

  /**
   * Send command and wait for response
   */
  async sendCommand(command, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        reject(new Error('Serial port not open'));
        return;
      }

      let responseData = Buffer.alloc(0);
      let timeout;

      const onData = (data) => {
        responseData = Buffer.concat([responseData, data]);
        
        // Check if we have a complete response (at least 8 bytes for register operations)
        if (responseData.length >= 8) {
          clearTimeout(timeout);
          this.port.removeListener('data', onData);
          resolve(responseData);
        }
      };

      const onTimeout = () => {
        this.port.removeListener('data', onData);
        reject(new Error(`Command timeout after ${timeoutMs}ms`));
      };

      timeout = setTimeout(onTimeout, timeoutMs);
      this.port.on('data', onData);
      
      console.log(`📡 Sending: ${command.toString('hex').toUpperCase()}`);
      this.port.write(command);
    });
  }

  /**
   * Set slave address for a relay card
   * IMPORTANT: Only one card should be connected when calling this!
   */
  async setSlaveAddress(newSlaveId) {
    console.log(`\n🔧 Setting slave address to ${newSlaveId}...`);
    
    // Use broadcast address (0x00) to set the slave ID
    const command = this.buildWriteRegisterCommand(0x00, 0x4000, newSlaveId);
    
    try {
      const response = await this.sendCommand(command);
      console.log(`📨 Response: ${response.toString('hex').toUpperCase()}`);
      
      // Verify the response
      if (response.length >= 8 && response[1] === 0x06) {
        console.log(`✅ Slave address set to ${newSlaveId} successfully`);
        return true;
      } else {
        console.error(`❌ Unexpected response format`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Failed to set slave address: ${error.message}`);
      return false;
    }
  }

  /**
   * Read current slave address from a card
   */
  async readSlaveAddress(slaveId) {
    console.log(`\n🔍 Reading slave address from device ${slaveId}...`);
    
    const command = this.buildReadRegisterCommand(slaveId, 0x4000, 1);
    
    try {
      const response = await this.sendCommand(command);
      console.log(`📨 Response: ${response.toString('hex').toUpperCase()}`);
      
      // Parse response: [slave_id] [0x03] [byte_count] [value_high] [value_low] [crc_low] [crc_high]
      if (response.length >= 7 && response[1] === 0x03 && response[2] === 0x02) {
        const currentAddress = (response[3] << 8) | response[4];
        console.log(`✅ Current slave address: ${currentAddress}`);
        return currentAddress;
      } else {
        console.error(`❌ Unexpected response format or device not responding`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Failed to read slave address: ${error.message}`);
      return null;
    }
  }

  /**
   * Test relay activation on a specific slave
   */
  async testRelay(slaveId, relayNumber = 1) {
    console.log(`\n🧪 Testing relay ${relayNumber} on slave ${slaveId}...`);
    
    // Build relay ON command (Function 0x05)
    const coilAddress = relayNumber - 1; // 0-based
    const onCommand = Buffer.alloc(8);
    onCommand[0] = slaveId;
    onCommand[1] = 0x05;
    onCommand[2] = (coilAddress >> 8) & 0xFF;
    onCommand[3] = coilAddress & 0xFF;
    onCommand[4] = 0xFF;  // ON value high
    onCommand[5] = 0x00;  // ON value low
    
    const crc = this.calculateCRC16(onCommand.subarray(0, 6));
    onCommand[6] = crc & 0xFF;
    onCommand[7] = (crc >> 8) & 0xFF;
    
    try {
      console.log(`🔛 Turning relay ON...`);
      await this.sendCommand(onCommand);
      
      // Wait 500ms
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Build relay OFF command
      const offCommand = Buffer.from(onCommand);
      offCommand[4] = 0x00;  // OFF value high
      offCommand[5] = 0x00;  // OFF value low
      
      const offCrc = this.calculateCRC16(offCommand.subarray(0, 6));
      offCommand[6] = offCrc & 0xFF;
      offCommand[7] = (offCrc >> 8) & 0xFF;
      
      console.log(`🔛 Turning relay OFF...`);
      await this.sendCommand(offCommand);
      
      console.log(`✅ Relay test completed`);
      return true;
    } catch (error) {
      console.error(`❌ Relay test failed: ${error.message}`);
      return false;
    }
  }
}

/**
 * Main configuration process
 */
async function main() {
  console.log('🚀 Waveshare Relay Card Slave Address Configurator');
  console.log('==================================================');
  console.log('');
  console.log('⚠️  IMPORTANT: Connect only ONE relay card at a time!');
  console.log('');

  const configurator = new WaveshareSlaveConfigurator();

  try {
    await configurator.openPort();

    // Check if there's a device responding on default address (1)
    console.log('\n📋 Step 1: Checking for device on default address (1)...');
    const currentAddress = await configurator.readSlaveAddress(1);
    
    if (currentAddress !== null) {
      console.log(`\n🎯 Found device with slave address: ${currentAddress}`);
      
      // Ask user what to do
      console.log('\n📋 Configuration Options:');
      console.log('1. Set this card to slave address 1 (for Card 1)');
      console.log('2. Set this card to slave address 2 (for Card 2)');
      console.log('3. Test relay on current address');
      console.log('4. Exit');
      
      // For automation, let's provide command line arguments
      const args = process.argv.slice(2);
      let choice = args[0];
      
      if (!choice) {
        console.log('\nUsage: node configure-relay-slave-addresses.js [1|2|test]');
        console.log('  1    - Set to slave address 1 (Card 1)');
        console.log('  2    - Set to slave address 2 (Card 2)');
        console.log('  test - Test relay on current address');
        process.exit(1);
      }
      
      switch (choice) {
        case '1':
          console.log('\n🔧 Setting card to slave address 1...');
          await configurator.setSlaveAddress(1);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await configurator.readSlaveAddress(1);
          await configurator.testRelay(1, 1);
          break;
          
        case '2':
          console.log('\n🔧 Setting card to slave address 2...');
          await configurator.setSlaveAddress(2);
          await new Promise(resolve => setTimeout(resolve, 1000));
          await configurator.readSlaveAddress(2);
          await configurator.testRelay(2, 1);
          break;
          
        case 'test':
          console.log('\n🧪 Testing relay on current address...');
          await configurator.testRelay(currentAddress, 1);
          break;
          
        default:
          console.log('❌ Invalid choice');
          break;
      }
    } else {
      console.log('\n❌ No device found on default address (1)');
      console.log('   - Check connections (A-A, B-B)');
      console.log('   - Verify power to relay card');
      console.log('   - Ensure only ONE card is connected');
    }

  } catch (error) {
    console.error(`❌ Configuration failed: ${error.message}`);
  } finally {
    await configurator.closePort();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WaveshareSlaveConfigurator };