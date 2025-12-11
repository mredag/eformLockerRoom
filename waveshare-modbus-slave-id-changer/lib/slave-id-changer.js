/**
 * Waveshare Modbus Slave ID Changer
 * Core functionality for reading and writing slave addresses
 */

const SerialManager = require('./serial-manager');
const {
  buildReadRegisterCommand,
  buildWriteRegisterCommand,
  parseReadResponse,
  parseWriteResponse,
  formatHex,
  SLAVE_ADDRESS_REGISTER
} = require('./modbus-utils');

class SlaveIdChanger {
  constructor(options = {}) {
    this.serial = new SerialManager({
      baudRate: options.baudRate || 9600,
      responseTimeout: options.timeout || 1000,
      debug: options.debug || false
    });
    this.debug = options.debug || false;
  }

  /**
   * List available COM ports
   * @returns {Promise<Array>}
   */
  async listPorts() {
    return this.serial.listPorts();
  }

  /**
   * Connect to specified COM port
   * @param {string} portPath - COM port (e.g., 'COM3')
   */
  async connect(portPath) {
    await this.serial.open(portPath);
  }

  /**
   * Disconnect from COM port
   */
  async disconnect() {
    await this.serial.close();
  }

  /**
   * Read current slave address from a device
   * @param {number} slaveId - Current slave address to query (1-247)
   * @returns {Promise<object>} - Result with current address
   */
  async readSlaveAddress(slaveId) {
    const command = buildReadRegisterCommand(slaveId, SLAVE_ADDRESS_REGISTER, 1);
    
    if (this.debug) {
      console.log(`\n📖 Reading slave address from device ${slaveId}...`);
      console.log(`   Command: ${formatHex(command)}`);
    }

    const response = await this.serial.sendCommand(command, 7);

    if (!response) {
      return {
        success: false,
        slaveId,
        error: 'No response (device may not exist at this address)'
      };
    }

    if (this.debug) {
      console.log(`   Response: ${formatHex(response)}`);
    }

    const parsed = parseReadResponse(response);
    
    if (parsed.success) {
      return {
        success: true,
        slaveId,
        currentAddress: parsed.value,
        rawResponse: formatHex(response)
      };
    } else {
      return {
        success: false,
        slaveId,
        error: parsed.error,
        rawResponse: formatHex(response)
      };
    }
  }

  /**
   * Set new slave address on a device
   * @param {number} currentSlaveId - Current slave address (0 for broadcast)
   * @param {number} newSlaveId - New slave address to set (1-247)
   * @returns {Promise<object>} - Result of operation
   */
  async setSlaveAddress(currentSlaveId, newSlaveId) {
    // Validate new address
    if (newSlaveId < 1 || newSlaveId > 247) {
      return {
        success: false,
        error: 'New slave address must be between 1 and 247'
      };
    }

    const command = buildWriteRegisterCommand(currentSlaveId, SLAVE_ADDRESS_REGISTER, newSlaveId);
    
    if (this.debug) {
      console.log(`\n✏️  Setting slave address...`);
      console.log(`   From: ${currentSlaveId === 0 ? 'BROADCAST' : currentSlaveId}`);
      console.log(`   To: ${newSlaveId}`);
      console.log(`   Command: ${formatHex(command)}`);
    }

    // For broadcast (address 0), we don't expect a response
    const expectedLength = currentSlaveId === 0 ? 0 : 8;
    const response = await this.serial.sendCommand(command, expectedLength);

    // Broadcast mode - no response expected
    if (currentSlaveId === 0) {
      // Wait a bit for the device to process
      await this.delay(500);
      
      // Verify by reading from new address
      const verification = await this.readSlaveAddress(newSlaveId);
      
      if (verification.success && verification.currentAddress === newSlaveId) {
        return {
          success: true,
          previousAddress: 'broadcast',
          newAddress: newSlaveId,
          verified: true,
          message: `Successfully set slave address to ${newSlaveId} (verified)`
        };
      } else {
        return {
          success: true,
          previousAddress: 'broadcast',
          newAddress: newSlaveId,
          verified: false,
          message: `Command sent. Verification: ${verification.success ? 'passed' : 'failed'}`
        };
      }
    }

    // Normal mode - expect response
    if (!response) {
      return {
        success: false,
        error: 'No response from device'
      };
    }

    if (this.debug) {
      console.log(`   Response: ${formatHex(response)}`);
    }

    const parsed = parseWriteResponse(response);

    if (parsed.success) {
      return {
        success: true,
        previousAddress: currentSlaveId,
        newAddress: parsed.value,
        rawResponse: formatHex(response),
        message: `Successfully changed slave address from ${currentSlaveId} to ${parsed.value}`
      };
    } else {
      return {
        success: false,
        error: parsed.error,
        rawResponse: formatHex(response)
      };
    }
  }

  /**
   * Scan for devices on the bus
   * @param {number} startAddress - Start of scan range (default: 1)
   * @param {number} endAddress - End of scan range (default: 10)
   * @returns {Promise<Array>} - Array of found devices
   */
  async scanDevices(startAddress = 1, endAddress = 10) {
    const foundDevices = [];

    console.log(`\n🔍 Scanning for devices (addresses ${startAddress}-${endAddress})...`);

    for (let addr = startAddress; addr <= endAddress; addr++) {
      process.stdout.write(`   Checking address ${addr}... `);
      
      const result = await this.readSlaveAddress(addr);
      
      if (result.success) {
        console.log(`✅ Found! (Address: ${result.currentAddress})`);
        foundDevices.push({
          address: addr,
          reportedAddress: result.currentAddress
        });
      } else {
        console.log(`❌ No response`);
      }

      // Small delay between scans
      await this.delay(100);
    }

    return foundDevices;
  }

  /**
   * Test relay activation (optional verification)
   * @param {number} slaveId - Slave address
   * @param {number} relayNumber - Relay number (1-based)
   * @param {boolean} state - ON (true) or OFF (false)
   * @returns {Promise<object>}
   */
  async testRelay(slaveId, relayNumber, state) {
    const coilAddress = relayNumber - 1; // 0-based
    const value = state ? 0xFF00 : 0x0000;

    // Build Write Single Coil command (Function 0x05)
    const buffer = Buffer.alloc(8);
    buffer[0] = slaveId;
    buffer[1] = 0x05; // Write Single Coil
    buffer[2] = (coilAddress >> 8) & 0xFF;
    buffer[3] = coilAddress & 0xFF;
    buffer[4] = (value >> 8) & 0xFF;
    buffer[5] = value & 0xFF;

    const { calculateCRC16 } = require('./modbus-utils');
    const crc = calculateCRC16(buffer.subarray(0, 6));
    buffer[6] = crc & 0xFF;
    buffer[7] = (crc >> 8) & 0xFF;

    if (this.debug) {
      console.log(`\n⚡ Testing relay ${relayNumber} on device ${slaveId}...`);
      console.log(`   Command: ${formatHex(buffer)}`);
    }

    const response = await this.serial.sendCommand(buffer, 8);

    if (response) {
      return {
        success: true,
        slaveId,
        relay: relayNumber,
        state: state ? 'ON' : 'OFF',
        rawResponse: formatHex(response)
      };
    } else {
      return {
        success: false,
        error: 'No response from device'
      };
    }
  }

  /**
   * Helper delay function
   * @param {number} ms - Milliseconds to wait
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SlaveIdChanger;
