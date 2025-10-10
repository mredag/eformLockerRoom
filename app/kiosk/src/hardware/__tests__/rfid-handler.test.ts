/**
 * Tests for RFID Handler
 * Covers both HID and keyboard input modes with debouncing and standardization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { RfidHandler, RfidConfig } from '../rfid-handler';

// Mock node-hid
const mockHidDevice = {
  on: vi.fn(),
  close: vi.fn(),
  write: vi.fn(),
  read: vi.fn()
};

const mockHidDevices = [
  {
    vendorId: 0x08ff,
    productId: 0x0009,
    path: '/dev/hidraw0',
    manufacturer: 'RFID Reader Co',
    product: 'RFID Reader Model X'
  },
  {
    vendorId: 0x1234,
    productId: 0x5678,
    path: '/dev/hidraw1',
    manufacturer: 'Other Device',
    product: 'Not RFID'
  }
];

vi.mock('node-hid', () => ({
  default: {
    HID: vi.fn(() => mockHidDevice),
    devices: vi.fn(() => mockHidDevices)
  }
}));

// Mock process.stdin for keyboard mode
const mockStdin = {
  setRawMode: vi.fn(),
  resume: vi.fn(),
  pause: vi.fn(),
  setEncoding: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn()
};

Object.defineProperty(process, 'stdin', {
  value: mockStdin,
  writable: true
});

describe('RfidHandler', () => {
  let rfidHandler: RfidHandler;
  let config: RfidConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      reader_type: 'hid',
      debounce_ms: 500,
      vendor_id: 0x08ff,
      product_id: 0x0009
    };
  });

  afterEach(async () => {
    if (rfidHandler) {
      await rfidHandler.disconnect();
    }
  });

  describe('HID Mode Initialization', () => {
    it('should initialize HID reader with specific vendor/product ID', async () => {
      rfidHandler = new RfidHandler(config);
      
      const connectPromise = new Promise(resolve => {
        rfidHandler.on('connected', resolve);
      });
      
      await rfidHandler.initialize();
      await connectPromise;
      
      expect(rfidHandler.isReaderConnected()).toBe(true);
      expect(mockHidDevice.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockHidDevice.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should auto-detect RFID reader when no specific IDs provided', async () => {
      config.vendor_id = undefined;
      config.product_id = undefined;
      rfidHandler = new RfidHandler(config);
      
      await rfidHandler.initialize();
      
      expect(rfidHandler.isReaderConnected()).toBe(true);
    });

    it('should emit error when RFID reader not found', async () => {
      config.vendor_id = 0x9999;
      config.product_id = 0x9999;
      rfidHandler = new RfidHandler(config);
      
      const errorPromise = new Promise(resolve => {
        rfidHandler.on('error', resolve);
      });
      
      await rfidHandler.initialize();
      const error = await errorPromise;
      
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('RFID reader not found');
    });
  });

  describe('Keyboard Mode Initialization', () => {
    beforeEach(() => {
      config.reader_type = 'keyboard';
    });

    it('should initialize keyboard reader mode', async () => {
      rfidHandler = new RfidHandler(config);
      
      await rfidHandler.initialize();
      
      expect(rfidHandler.isReaderConnected()).toBe(true);
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(mockStdin.resume).toHaveBeenCalled();
      expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf8');
      expect(mockStdin.on).toHaveBeenCalledWith('data', expect.any(Function));
    });
  });

  describe('Card Scanning and Processing', () => {
    beforeEach(async () => {
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();
    });

    it('should process HID data and emit card_scanned event', async () => {
      const testCardData = Buffer.from([0x12, 0x34, 0x56, 0x78]);

      const scanPromise = new Promise((resolve) => {
        rfidHandler.on('card_scanned', (event) => {
          expect(event.card_id).toBeDefined();
          expect(event.scan_time).toBeInstanceOf(Date);
          expect(event.reader_id).toBe('hid-reader');
          expect(event.card_id).toHaveLength(16); // Hashed card ID length
          resolve(event);
        });
      });
      
      // Simulate HID data reception
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      dataHandler(testCardData);
      
      await scanPromise;
    });

    it('should apply debouncing to prevent duplicate scans', async () => {
      const testCardData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      let scanCount = 0;
      
      rfidHandler.on('card_scanned', () => {
        scanCount++;
      });
      
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // Send same card data multiple times quickly
      dataHandler(testCardData);
      dataHandler(testCardData);
      dataHandler(testCardData);
      
      // Check after debounce period
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(scanCount).toBe(1);
    });

    it('should allow new scan after debounce period', async () => {
      const testCardData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      let scanCount = 0;
      
      const scanPromise = new Promise((resolve) => {
        rfidHandler.on('card_scanned', () => {
          scanCount++;
          if (scanCount === 2) {
            resolve(scanCount);
          }
        });
      });
      
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // First scan
      dataHandler(testCardData);
      
      // Second scan after debounce period
      setTimeout(() => {
        dataHandler(testCardData);
      }, config.debounce_ms + 100);
      
      await scanPromise;
      expect(scanCount).toBe(2);
    });

    it('should process keyboard input and emit card_scanned event', async () => {
      config.reader_type = 'keyboard';
      rfidHandler = new RfidHandler(config);
      
      const scanPromise = new Promise((resolve) => {
        rfidHandler.on('card_scanned', (event) => {
          expect(event.card_id).toBeDefined();
          expect(event.reader_id).toBe('keyboard-reader');
          resolve(event);
        });
      });
      
      await rfidHandler.initialize();
      const keyboardHandler = mockStdin.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // Simulate keyboard input with card ID and Enter
      keyboardHandler('1234567890ABCDEF\r');
      
      await scanPromise;
    });

    it('should assemble HID keyboard digits and emit one scan on enter', async () => {
      const digits = '0013966892';
      const expectedHash = createHash('sha256')
        .update(digits)
        .digest('hex')
        .substring(0, 16);

      const scanPromise = new Promise(resolve => {
        rfidHandler.on('card_scanned', event => {
          expect(event.card_id).toBe(expectedHash);
          resolve(event);
        });
      });

      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];

      const keyMap: Record<string, number> = {
        '0': 39,
        '1': 30,
        '2': 31,
        '3': 32,
        '4': 33,
        '5': 34,
        '6': 35,
        '7': 36,
        '8': 37,
        '9': 38
      };

      for (const digit of digits) {
        dataHandler(Buffer.from([0x00, 0x00, keyMap[digit], 0x00, 0x00, 0x00, 0x00, 0x00]));
        // Simulate key release
        dataHandler(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
      }

      // Press enter
      dataHandler(Buffer.from([0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00]));
      dataHandler(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

      await scanPromise;
    });

    it('should ignore HID keyboard fragments shorter than minimum length', async () => {
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];

      let scanEmitted = false;
      rfidHandler.on('card_scanned', () => {
        scanEmitted = true;
      });

      const keyMap: Record<string, number> = {
        '0': 39,
        '1': 30,
        '2': 31,
        '3': 32,
        '4': 33,
        '5': 34,
        '6': 35,
        '7': 36,
        '8': 37,
        '9': 38
      };

      for (const digit of '5236') {
        dataHandler(Buffer.from([0x00, 0x00, keyMap[digit], 0x00, 0x00, 0x00, 0x00, 0x00]));
        dataHandler(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
      }

      dataHandler(Buffer.from([0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00]));
      dataHandler(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

      await new Promise(resolve => setTimeout(resolve, config.debounce_ms + 50));

      expect(scanEmitted).toBe(false);
    });
  });

  describe('Card ID Standardization and Hashing', () => {
    beforeEach(async () => {
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();
    });

    it('should standardize card IDs consistently', async () => {
      const testCases = [
        Buffer.from([0x12, 0x34, 0x56, 0x78]), // Standard 4-byte
        Buffer.from([0x00, 0x12, 0x34, 0x56]), // With leading zeros
        Buffer.from([0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56]) // 6-byte
      ];
      
      const cardIds: string[] = [];
      
      const scanPromise = new Promise((resolve) => {
        rfidHandler.on('card_scanned', (event) => {
          cardIds.push(event.card_id);
          
          if (cardIds.length === testCases.length) {
            resolve(cardIds);
          }
        });
      });
      
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      
      testCases.forEach((testData, index) => {
        setTimeout(() => {
          dataHandler(testData);
        }, index * (config.debounce_ms + 100));
      });
      
      await scanPromise;
      
      // All card IDs should be 16 characters (hashed)
      cardIds.forEach(id => {
        expect(id).toHaveLength(16);
        expect(id).toMatch(/^[0-9a-f]+$/);
      });
    });

    it('should produce same hash for same standardized card ID', async () => {
      const testCardData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      const cardIds: string[] = [];
      
      const scanPromise = new Promise((resolve) => {
        rfidHandler.on('card_scanned', (event) => {
          cardIds.push(event.card_id);
          
          if (cardIds.length === 2) {
            resolve(cardIds);
          }
        });
      });
      
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // Send same card data twice with debounce gap
      dataHandler(testCardData);
      setTimeout(() => {
        dataHandler(testCardData);
      }, config.debounce_ms + 100);
      
      await scanPromise;
      expect(cardIds[0]).toBe(cardIds[1]);
    });
  });

  describe('Error Handling and Reconnection', () => {
    beforeEach(async () => {
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();
    });

    it('should handle device errors and attempt reconnection', async () => {
      vi.useFakeTimers();
      let errorEmitted = false;

      const reconnectPromise = new Promise((resolve) => {
        rfidHandler.on('error', () => {
          errorEmitted = true;
        });

        rfidHandler.on('connected', () => {
          if (errorEmitted) {
            // Reconnection successful
            expect(rfidHandler.isReaderConnected()).toBe(true);
            resolve(true);
          }
        });
      });

      // Simulate device error
      const errorHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'error')[1];
      errorHandler(new Error('Device disconnected'));

      expect(rfidHandler.isReaderConnected()).toBe(false);

      try {
        await vi.runOnlyPendingTimersAsync();
        await reconnectPromise;
      } finally {
        vi.useRealTimers();
      }
    });

    it('should ignore invalid HID data gracefully', () => {
      const invalidData = [
        Buffer.alloc(0), // Empty buffer
        Buffer.from([0x00]), // Too short
        Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]) // Invalid pattern
      ];
      
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // Should not throw errors
      invalidData.forEach(data => {
        expect(() => dataHandler(data)).not.toThrow();
      });
    });
  });

  describe('Status and Information', () => {
    beforeEach(async () => {
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();
    });

    it('should provide accurate status information', () => {
      const status = rfidHandler.getStatus();
      
      expect(status.connected).toBe(true);
      expect(status.reader_type).toBe('hid');
      expect(status.last_scan).toBe(0); // No scans yet
      expect(status.device_info).toBeDefined();
      expect(status.device_info.vendor_id).toBe(config.vendor_id);
      expect(status.device_info.product_id).toBe(config.product_id);
    });

    it('should update last_scan time after card scan', async () => {
      const testCardData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      
      const scanPromise = new Promise((resolve) => {
        rfidHandler.on('card_scanned', () => {
          const status = rfidHandler.getStatus();
          expect(status.last_scan).toBeGreaterThan(0);
          resolve(status);
        });
      });
      
      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      dataHandler(testCardData);
      
      await scanPromise;
    });
  });

  describe('Cleanup and Disconnection', () => {
    it('should cleanup HID resources on disconnect', async () => {
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();
      
      expect(rfidHandler.isReaderConnected()).toBe(true);
      
      await rfidHandler.disconnect();
      
      expect(rfidHandler.isReaderConnected()).toBe(false);
      expect(mockHidDevice.close).toHaveBeenCalled();
    });

    it('should cleanup keyboard resources on disconnect', async () => {
      config.reader_type = 'keyboard';
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();
      
      await rfidHandler.disconnect();
      
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should emit disconnected event', async () => {
      rfidHandler = new RfidHandler(config);
      
      const disconnectPromise = new Promise((resolve) => {
        rfidHandler.on('disconnected', () => {
          resolve(true);
        });
      });
      
      await rfidHandler.initialize();
      await rfidHandler.disconnect();
      
      await disconnectPromise;
    });
  });

  describe('Configuration Validation', () => {
    it('should work with minimal configuration', async () => {
      const minimalConfig: RfidConfig = {
        reader_type: 'hid',
        debounce_ms: 100
      };
      
      rfidHandler = new RfidHandler(minimalConfig);
      await rfidHandler.initialize();
      
      expect(rfidHandler.isReaderConnected()).toBe(true);
    });

    it('should work with device path configuration', async () => {
      config.device_path = '/dev/hidraw0';
      config.vendor_id = undefined;
      config.product_id = undefined;
      
      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();

      expect(rfidHandler.isReaderConnected()).toBe(true);
    });
  });

  describe('Feature flag behaviours', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('merges HID multi-packet reports when enabled', async () => {
      vi.useFakeTimers();
      config.feature_flags = {
        hidMultiPacketEnabled: true,
        hidAggregationWindowMs: 20
      };

      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();

      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      const scanSpy = vi.fn();
      rfidHandler.on('card_scanned', scanSpy);

      dataHandler(Buffer.from('0012', 'hex'));
      dataHandler(Buffer.from('3456', 'hex'));

      expect(scanSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(25);

      expect(scanSpy).toHaveBeenCalledTimes(1);
    });

    it('flushes keyboard buffer after timeout when enabled', async () => {
      vi.useFakeTimers();
      config.reader_type = 'keyboard';
      config.feature_flags = {
        keyboardTimeoutEnabled: true,
        keyboardTimeoutMs: 500
      };

      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();

      const dataHandler = mockStdin.on.mock.calls.find(call => call[0] === 'data')[1];
      const scanSpy = vi.fn();
      rfidHandler.on('card_scanned', scanSpy);

      dataHandler('1234');

      await vi.advanceTimersByTimeAsync(600);

      expect(scanSpy).not.toHaveBeenCalled();
    });

    it('requires confirmation for short UIDs when strict length enabled', async () => {
      config.feature_flags = {
        strictMinLengthEnabled: true,
        minSignificantLength: 8,
        confirmationWindowMs: 500
      };

      rfidHandler = new RfidHandler(config);
      await rfidHandler.initialize();

      const dataHandler = mockHidDevice.on.mock.calls.find(call => call[0] === 'data')[1];
      const scanSpy = vi.fn();
      rfidHandler.on('card_scanned', scanSpy);

      const shortBuffer = Buffer.from('00123456', 'hex');

      dataHandler(shortBuffer);
      expect(scanSpy).not.toHaveBeenCalled();

      dataHandler(shortBuffer);
      expect(scanSpy).toHaveBeenCalledTimes(1);
    });
  });
});
