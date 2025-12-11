/**
 * Modbus RTU Utilities for Waveshare Relay Cards
 * Handles CRC calculation and command building
 */

/**
 * Calculate CRC16 checksum for Modbus RTU
 * @param {Buffer} data - Data buffer to calculate CRC for
 * @returns {number} - 16-bit CRC value
 */
function calculateCRC16(data) {
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
 * Build Read Holding Register command (Function 0x03)
 * Used to read current slave address from register 0x4000
 * @param {number} slaveId - Target slave address (0 for broadcast)
 * @param {number} register - Register address to read
 * @param {number} count - Number of registers to read
 * @returns {Buffer} - Complete Modbus RTU command
 */
function buildReadRegisterCommand(slaveId, register = 0x4000, count = 1) {
  const buffer = Buffer.alloc(8);

  buffer[0] = slaveId;                    // Slave ID
  buffer[1] = 0x03;                       // Function: Read Holding Registers
  buffer[2] = (register >> 8) & 0xFF;     // Register high byte
  buffer[3] = register & 0xFF;            // Register low byte
  buffer[4] = (count >> 8) & 0xFF;        // Count high byte
  buffer[5] = count & 0xFF;               // Count low byte

  const crc = calculateCRC16(buffer.subarray(0, 6));
  buffer[6] = crc & 0xFF;                 // CRC low byte
  buffer[7] = (crc >> 8) & 0xFF;          // CRC high byte

  return buffer;
}

/**
 * Build Write Single Register command (Function 0x06)
 * Used to write new slave address to register 0x4000
 * @param {number} slaveId - Target slave address (0 for broadcast)
 * @param {number} register - Register address to write
 * @param {number} value - Value to write
 * @returns {Buffer} - Complete Modbus RTU command
 */
function buildWriteRegisterCommand(slaveId, register, value) {
  const buffer = Buffer.alloc(8);

  buffer[0] = slaveId;                    // Slave ID
  buffer[1] = 0x06;                       // Function: Write Single Register
  buffer[2] = (register >> 8) & 0xFF;     // Register high byte
  buffer[3] = register & 0xFF;            // Register low byte
  buffer[4] = (value >> 8) & 0xFF;        // Value high byte
  buffer[5] = value & 0xFF;               // Value low byte

  const crc = calculateCRC16(buffer.subarray(0, 6));
  buffer[6] = crc & 0xFF;                 // CRC low byte
  buffer[7] = (crc >> 8) & 0xFF;          // CRC high byte

  return buffer;
}

/**
 * Parse Read Holding Register response
 * @param {Buffer} response - Response buffer from device
 * @returns {object} - Parsed response with slave address value
 */
function parseReadResponse(response) {
  if (response.length < 5) {
    return { success: false, error: 'Response too short' };
  }

  const slaveId = response[0];
  const functionCode = response[1];
  const byteCount = response[2];

  if (functionCode === 0x83) {
    // Error response
    const errorCode = response[2];
    return { success: false, error: `Modbus error: ${getErrorDescription(errorCode)}` };
  }

  if (functionCode !== 0x03) {
    return { success: false, error: `Unexpected function code: 0x${functionCode.toString(16)}` };
  }

  // Extract register value (big-endian)
  const value = (response[3] << 8) | response[4];

  return {
    success: true,
    slaveId,
    functionCode,
    byteCount,
    value
  };
}

/**
 * Parse Write Single Register response
 * @param {Buffer} response - Response buffer from device
 * @returns {object} - Parsed response
 */
function parseWriteResponse(response) {
  if (response.length < 8) {
    return { success: false, error: 'Response too short' };
  }

  const slaveId = response[0];
  const functionCode = response[1];

  if (functionCode === 0x86) {
    // Error response
    const errorCode = response[2];
    return { success: false, error: `Modbus error: ${getErrorDescription(errorCode)}` };
  }

  if (functionCode !== 0x06) {
    return { success: false, error: `Unexpected function code: 0x${functionCode.toString(16)}` };
  }

  const register = (response[2] << 8) | response[3];
  const value = (response[4] << 8) | response[5];

  return {
    success: true,
    slaveId,
    functionCode,
    register,
    value
  };
}

/**
 * Get human-readable error description
 * @param {number} errorCode - Modbus error code
 * @returns {string} - Error description
 */
function getErrorDescription(errorCode) {
  const errors = {
    0x01: 'Illegal Function',
    0x02: 'Illegal Data Address',
    0x03: 'Illegal Data Value',
    0x04: 'Slave Device Failure',
    0x05: 'Acknowledge',
    0x06: 'Slave Device Busy',
    0x08: 'Memory Parity Error',
    0x0A: 'Gateway Path Unavailable',
    0x0B: 'Gateway Target Device Failed to Respond'
  };
  return errors[errorCode] || `Unknown error (0x${errorCode.toString(16)})`;
}

/**
 * Format buffer as hex string for display
 * @param {Buffer} buffer - Buffer to format
 * @returns {string} - Hex string representation
 */
function formatHex(buffer) {
  return Array.from(buffer).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

module.exports = {
  calculateCRC16,
  buildReadRegisterCommand,
  buildWriteRegisterCommand,
  parseReadResponse,
  parseWriteResponse,
  formatHex,
  SLAVE_ADDRESS_REGISTER: 0x4000
};
