/**
 * Serial Port Manager for Modbus Communication
 * Handles port listing, opening, and data transmission
 */

const { SerialPort } = require('serialport');
const { formatHex } = require('./modbus-utils');

class SerialManager {
  constructor(options = {}) {
    this.port = null;
    this.baudRate = options.baudRate || 9600;
    this.dataBits = options.dataBits || 8;
    this.stopBits = options.stopBits || 1;
    this.parity = options.parity || 'none';
    this.responseTimeout = options.responseTimeout || 1000;
    this.debug = options.debug || false;
  }

  /**
   * List available COM ports
   * @returns {Promise<Array>} - Array of port info objects
   */
  async listPorts() {
    const ports = await SerialPort.list();
    return ports.filter(p => p.path.startsWith('COM') || p.path.includes('ttyUSB'));
  }

  /**
   * Open serial port
   * @param {string} portPath - COM port path (e.g., 'COM3')
   * @returns {Promise<void>}
   */
  async open(portPath) {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: portPath,
        baudRate: this.baudRate,
        dataBits: this.dataBits,
        stopBits: this.stopBits,
        parity: this.parity,
        autoOpen: false
      });

      this.port.open((err) => {
        if (err) {
          reject(new Error(`Failed to open ${portPath}: ${err.message}`));
        } else {
          if (this.debug) console.log(`✅ Opened ${portPath} at ${this.baudRate} baud`);
          resolve();
        }
      });
    });
  }

  /**
   * Close serial port
   * @returns {Promise<void>}
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        resolve();
        return;
      }

      this.port.close((err) => {
        if (err) {
          reject(new Error(`Failed to close port: ${err.message}`));
        } else {
          if (this.debug) console.log('✅ Port closed');
          resolve();
        }
      });
    });
  }

  /**
   * Send command and wait for response
   * @param {Buffer} command - Command buffer to send
   * @param {number} expectedLength - Expected response length (0 for no response expected)
   * @returns {Promise<Buffer|null>} - Response buffer or null if timeout
   */
  async sendCommand(command, expectedLength = 8) {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        reject(new Error('Port not open'));
        return;
      }

      let responseBuffer = Buffer.alloc(0);
      let timeoutId;

      const onData = (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);
        
        if (this.debug) {
          console.log(`📥 Received: ${formatHex(data)}`);
        }

        // Check if we have enough data
        if (expectedLength > 0 && responseBuffer.length >= expectedLength) {
          clearTimeout(timeoutId);
          this.port.removeListener('data', onData);
          resolve(responseBuffer);
        }
      };

      const onTimeout = () => {
        this.port.removeListener('data', onData);
        if (responseBuffer.length > 0) {
          resolve(responseBuffer);
        } else {
          resolve(null); // No response (timeout)
        }
      };

      this.port.on('data', onData);
      timeoutId = setTimeout(onTimeout, this.responseTimeout);

      if (this.debug) {
        console.log(`📤 Sending: ${formatHex(command)}`);
      }

      this.port.write(command, (err) => {
        if (err) {
          clearTimeout(timeoutId);
          this.port.removeListener('data', onData);
          reject(new Error(`Write failed: ${err.message}`));
        }
      });
    });
  }

  /**
   * Drain the port (wait for all data to be transmitted)
   * @returns {Promise<void>}
   */
  async drain() {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        resolve();
        return;
      }

      this.port.drain((err) => {
        if (err) {
          reject(new Error(`Drain failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Flush input/output buffers
   * @returns {Promise<void>}
   */
  async flush() {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        resolve();
        return;
      }

      this.port.flush((err) => {
        if (err) {
          reject(new Error(`Flush failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Check if port is open
   * @returns {boolean}
   */
  isOpen() {
    return this.port && this.port.isOpen;
  }
}

module.exports = SerialManager;
