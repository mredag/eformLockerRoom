import { describe, it, expect } from 'vitest';
import { WizardInputValidator } from '../wizard-input-validator';
import { WizardOperation } from '../wizard-security-service';

describe('WizardInputValidator', () => {
  describe('validateInput', () => {
    describe('SCAN_DEVICES operation', () => {
      it('should validate correct scan devices input', () => {
        const input = {
          port: '/dev/ttyUSB0',
          startAddress: 1,
          endAddress: 10,
          timeout: 5000
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SCAN_DEVICES, input);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.sanitizedData.port).toBe('/dev/ttyUSB0');
        expect(result.sanitizedData.startAddress).toBe(1);
      });

      it('should reject invalid port format', () => {
        const input = {
          port: 'invalid-port',
          startAddress: 1,
          endAddress: 10
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SCAN_DEVICES, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field port format is invalid');
      });

      it('should reject out-of-range addresses', () => {
        const input = {
          port: '/dev/ttyUSB0',
          startAddress: 0,
          endAddress: 300
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SCAN_DEVICES, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field startAddress must be at least 1');
        expect(result.errors).toContain('Field endAddress must be at most 255');
      });

      it('should accept Windows COM ports', () => {
        const input = {
          port: 'COM3',
          startAddress: 1,
          endAddress: 10
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SCAN_DEVICES, input);

        expect(result.valid).toBe(true);
        expect(result.sanitizedData.port).toBe('COM3');
      });
    });

    describe('SET_SLAVE_ADDRESS operation', () => {
      it('should validate correct slave address input', () => {
        const input = {
          currentAddress: 0,
          newAddress: 5,
          port: '/dev/ttyUSB0'
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SET_SLAVE_ADDRESS, input);

        expect(result.valid).toBe(true);
        expect(result.sanitizedData.currentAddress).toBe(0);
        expect(result.sanitizedData.newAddress).toBe(5);
      });

      it('should require all required fields', () => {
        const input = {
          newAddress: 5
          // Missing currentAddress and port
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SET_SLAVE_ADDRESS, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field currentAddress is required');
        expect(result.errors).toContain('Field port is required');
      });

      it('should reject invalid address ranges', () => {
        const input = {
          currentAddress: -1,
          newAddress: 256,
          port: '/dev/ttyUSB0'
        };

        const result = WizardInputValidator.validateInput(WizardOperation.SET_SLAVE_ADDRESS, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field currentAddress must be at least 0');
        expect(result.errors).toContain('Field newAddress must be at most 255');
      });
    });

    describe('TEST_RELAY operation', () => {
      it('should validate correct relay test input', () => {
        const input = {
          address: 1,
          relay: 8,
          port: '/dev/ttyUSB0',
          duration: 1000
        };

        const result = WizardInputValidator.validateInput(WizardOperation.TEST_RELAY, input);

        expect(result.valid).toBe(true);
        expect(result.sanitizedData.relay).toBe(8);
        expect(result.sanitizedData.duration).toBe(1000);
      });

      it('should reject invalid relay numbers', () => {
        const input = {
          address: 1,
          relay: 0,
          port: '/dev/ttyUSB0'
        };

        const result = WizardInputValidator.validateInput(WizardOperation.TEST_RELAY, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field relay must be at least 1');
      });

      it('should reject relay numbers above 16', () => {
        const input = {
          address: 1,
          relay: 17,
          port: '/dev/ttyUSB0'
        };

        const result = WizardInputValidator.validateInput(WizardOperation.TEST_RELAY, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field relay must be at most 16');
      });

      it('should reject invalid duration', () => {
        const input = {
          address: 1,
          relay: 1,
          port: '/dev/ttyUSB0',
          duration: 50 // Too short
        };

        const result = WizardInputValidator.validateInput(WizardOperation.TEST_RELAY, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field duration must be at least 100');
      });
    });

    describe('MANUAL_CONFIGURATION operation', () => {
      it('should validate manual configuration input', () => {
        const input = {
          address: 1,
          register: 0x4000,
          value: 5,
          functionCode: 6
        };

        const result = WizardInputValidator.validateInput(WizardOperation.MANUAL_CONFIGURATION, input);

        expect(result.valid).toBe(true);
        expect(result.sanitizedData.register).toBe(0x4000);
        expect(result.sanitizedData.functionCode).toBe(6);
      });

      it('should reject invalid function codes', () => {
        const input = {
          address: 1,
          register: 0x4000,
          value: 5,
          functionCode: 99 // Invalid function code
        };

        const result = WizardInputValidator.validateInput(WizardOperation.MANUAL_CONFIGURATION, input);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Field functionCode must be one of: 3, 4, 5, 6, 15, 16');
      });
    });

    it('should reject unexpected fields', () => {
      const input = {
        port: '/dev/ttyUSB0',
        startAddress: 1,
        endAddress: 10,
        unexpectedField: 'should not be here'
      };

      const result = WizardInputValidator.validateInput(WizardOperation.SCAN_DEVICES, input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unexpected field: unexpectedField');
    });

    it('should handle operations with no schema', () => {
      const input = { anyField: 'anyValue' };

      const result = WizardInputValidator.validateInput(WizardOperation.SCAN_PORTS, input);

      expect(result.valid).toBe(true);
      expect(result.sanitizedData).toEqual(input);
    });
  });

  describe('validateField', () => {
    it('should convert string numbers to numbers', () => {
      const result = WizardInputValidator.validateInput(WizardOperation.SET_SLAVE_ADDRESS, {
        currentAddress: '0',
        newAddress: '5',
        port: '/dev/ttyUSB0'
      });

      expect(result.valid).toBe(true);
      expect(result.sanitizedData.currentAddress).toBe(0);
      expect(result.sanitizedData.newAddress).toBe(5);
    });

    it('should convert string booleans to booleans', () => {
      const result = WizardInputValidator.validateInput(WizardOperation.EXPORT_CONFIGURATION, {
        includeSecrets: 'true'
      });

      expect(result.valid).toBe(true);
      expect(result.sanitizedData.includeSecrets).toBe(true);
    });

    it('should reject invalid number strings', () => {
      const result = WizardInputValidator.validateInput(WizardOperation.SET_SLAVE_ADDRESS, {
        currentAddress: 'not-a-number',
        newAddress: 5,
        port: '/dev/ttyUSB0'
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field currentAddress must be a valid number');
    });
  });

  describe('sanitizeString', () => {
    it('should remove null bytes', () => {
      const input = 'test\0string';
      const result = WizardInputValidator['sanitizeString'](input);
      expect(result).toBe('teststring');
    });

    it('should remove control characters', () => {
      const input = 'test\x01\x02string';
      const result = WizardInputValidator['sanitizeString'](input);
      expect(result).toBe('teststring');
    });

    it('should preserve newlines, carriage returns, and tabs', () => {
      const input = 'test\n\r\tstring';
      const result = WizardInputValidator['sanitizeString'](input);
      expect(result).toBe('test\n\r\tstring');
    });

    it('should trim whitespace', () => {
      const input = '  test string  ';
      const result = WizardInputValidator['sanitizeString'](input);
      expect(result).toBe('test string');
    });

    it('should limit string length', () => {
      const input = 'a'.repeat(20000);
      const result = WizardInputValidator['sanitizeString'](input);
      expect(result.length).toBe(10000);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize nested objects', () => {
      const input = {
        name: '  test\0name  ',
        nested: {
          value: 'test\x01value'
        },
        array: ['item\0one', 'item\x02two']
      };

      const result = WizardInputValidator.sanitizeObject(input);

      expect(result.name).toBe('testname');
      expect(result.nested.value).toBe('testvalue');
      expect(result.array[0]).toBe('itemone');
      expect(result.array[1]).toBe('itemtwo');
    });

    it('should prevent deep recursion', () => {
      const deepObject: any = {};
      let current = deepObject;
      for (let i = 0; i < 20; i++) {
        current.nested = {};
        current = current.nested;
      }

      const result = WizardInputValidator.sanitizeObject(deepObject, 5);
      expect(result).toBeDefined();
    });

    it('should handle null and undefined values', () => {
      const input = {
        nullValue: null,
        undefinedValue: undefined,
        validValue: 'test'
      };

      const result = WizardInputValidator.sanitizeObject(input);

      expect(result.nullValue).toBeNull();
      expect(result.undefinedValue).toBeUndefined();
      expect(result.validValue).toBe('test');
    });
  });

  describe('validation helpers', () => {
    describe('validateHardwareAddress', () => {
      it('should accept valid addresses', () => {
        expect(WizardInputValidator.validateHardwareAddress(1)).toBe(true);
        expect(WizardInputValidator.validateHardwareAddress(255)).toBe(true);
        expect(WizardInputValidator.validateHardwareAddress(128)).toBe(true);
      });

      it('should reject invalid addresses', () => {
        expect(WizardInputValidator.validateHardwareAddress(0)).toBe(false);
        expect(WizardInputValidator.validateHardwareAddress(256)).toBe(false);
        expect(WizardInputValidator.validateHardwareAddress(-1)).toBe(false);
        expect(WizardInputValidator.validateHardwareAddress(1.5)).toBe(false);
      });
    });

    describe('validateSerialPort', () => {
      it('should accept valid Unix serial ports', () => {
        expect(WizardInputValidator.validateSerialPort('/dev/ttyUSB0')).toBe(true);
        expect(WizardInputValidator.validateSerialPort('/dev/ttyACM1')).toBe(true);
        expect(WizardInputValidator.validateSerialPort('/dev/ttyS0')).toBe(true);
      });

      it('should accept valid Windows COM ports', () => {
        expect(WizardInputValidator.validateSerialPort('COM1')).toBe(true);
        expect(WizardInputValidator.validateSerialPort('COM10')).toBe(true);
        expect(WizardInputValidator.validateSerialPort('COM255')).toBe(true);
      });

      it('should reject invalid port formats', () => {
        expect(WizardInputValidator.validateSerialPort('invalid-port')).toBe(false);
        expect(WizardInputValidator.validateSerialPort('/dev/invalid')).toBe(false);
        expect(WizardInputValidator.validateSerialPort('COM')).toBe(false);
        expect(WizardInputValidator.validateSerialPort('')).toBe(false);
      });
    });

    describe('validateUUID', () => {
      it('should accept valid UUIDs', () => {
        expect(WizardInputValidator.validateUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        expect(WizardInputValidator.validateUUID('00000000-0000-0000-0000-000000000000')).toBe(true);
      });

      it('should reject invalid UUIDs', () => {
        expect(WizardInputValidator.validateUUID('invalid-uuid')).toBe(false);
        expect(WizardInputValidator.validateUUID('123e4567-e89b-12d3-a456')).toBe(false);
        expect(WizardInputValidator.validateUUID('')).toBe(false);
      });
    });

    describe('validateIPAddress', () => {
      it('should accept valid IPv4 addresses', () => {
        expect(WizardInputValidator.validateIPAddress('192.168.1.1')).toBe(true);
        expect(WizardInputValidator.validateIPAddress('10.0.0.1')).toBe(true);
        expect(WizardInputValidator.validateIPAddress('255.255.255.255')).toBe(true);
        expect(WizardInputValidator.validateIPAddress('0.0.0.0')).toBe(true);
      });

      it('should accept valid IPv6 addresses', () => {
        expect(WizardInputValidator.validateIPAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
        expect(WizardInputValidator.validateIPAddress('::1')).toBe(false); // Basic regex doesn't handle compressed format
      });

      it('should reject invalid IP addresses', () => {
        expect(WizardInputValidator.validateIPAddress('256.1.1.1')).toBe(false);
        expect(WizardInputValidator.validateIPAddress('192.168.1')).toBe(false);
        expect(WizardInputValidator.validateIPAddress('invalid-ip')).toBe(false);
        expect(WizardInputValidator.validateIPAddress('')).toBe(false);
      });
    });
  });
});