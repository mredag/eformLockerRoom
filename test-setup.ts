/**
 * Global Test Setup
 * Provides common utilities, mocks, and configuration for all tests
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as fsExtra from 'fs-extra';
import path from 'path';

// Global test configuration
declare global {
  var __TEST_DB_PATH__: string;
  var __TEST_CLEANUP_FUNCTIONS__: Array<() => Promise<void>>;
}

// Initialize global test state
globalThis.__TEST_CLEANUP_FUNCTIONS__ = [];

// Set test environment early
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
beforeAll(async () => {
  // Only show errors and warnings in tests
  console.log = vi.fn();
  console.info = vi.fn();
  console.debug = vi.fn();
  // Keep error and warn for debugging
  
  // Ensure test directories exist
  const testDirs = [
    'data/test',
    'logs/test',
    'config/test'
  ];
  
  for (const dir of testDirs) {
    await fsExtra.ensureDir(path.resolve(process.cwd(), dir));
  }
});

afterAll(async () => {
  // Restore console
  Object.assign(console, originalConsole);
  
  // Clean up test directories
  const testDirs = [
    'data/test',
    'logs/test'
  ];
  
  for (const dir of testDirs) {
    const fullPath = path.resolve(process.cwd(), dir);
    if (await fsExtra.pathExists(fullPath)) {
      await fsExtra.remove(fullPath);
    }
  }
});

// Database cleanup
beforeEach(() => {
  globalThis.__TEST_CLEANUP_FUNCTIONS__ = [];
});

afterEach(async () => {
  // Run all cleanup functions
  for (const cleanup of globalThis.__TEST_CLEANUP_FUNCTIONS__) {
    try {
      await cleanup();
    } catch (error) {
      console.error('Cleanup function failed:', error);
    }
  }
  globalThis.__TEST_CLEANUP_FUNCTIONS__ = [];
});

// Test utilities
export class TestUtils {
  /**
   * Create a temporary test database
   */
  static async createTestDatabase(name: string = 'test'): Promise<string> {
    const dbPath = path.join(process.cwd(), `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
    
    // Add cleanup function
    globalThis.__TEST_CLEANUP_FUNCTIONS__.push(async () => {
      try {
        await fs.unlink(dbPath);
      } catch (error) {
        // File might not exist, ignore
      }
    });
    
    return dbPath;
  }
  
  /**
   * Wait for a specified amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Create a mock function with call tracking
   */
  static createMockWithHistory<T extends (...args: any[]) => any>(
    implementation?: T
  ): T & { callHistory: Array<{ args: Parameters<T>; result: ReturnType<T>; timestamp: number }> } {
    const callHistory: Array<{ args: Parameters<T>; result: ReturnType<T>; timestamp: number }> = [];
    
    const mockFn = vi.fn((...args: Parameters<T>) => {
      const result = implementation ? implementation(...args) : undefined;
      callHistory.push({
        args,
        result,
        timestamp: Date.now()
      });
      return result;
    }) as T & { callHistory: typeof callHistory };
    
    mockFn.callHistory = callHistory;
    return mockFn;
  }
  
  /**
   * Generate test data for lockers
   */
  static generateTestLockers(kioskId: string, count: number = 10) {
    return Array.from({ length: count }, (_, i) => ({
      kiosk_id: kioskId,
      id: i + 1,
      status: 'Free' as const,
      version: 1,
      is_vip: false,
      owner_type: null,
      owner_key: null,
      reserved_at: null,
      owned_at: null,
      created_at: new Date(),
      updated_at: new Date()
    }));
  }
  
  /**
   * Generate test data for events
   */
  static generateTestEvents(kioskId: string, count: number = 5) {
    const eventTypes = ['rfid_assign', 'rfid_release', 'qr_assign', 'qr_release', 'staff_open'];
    
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      timestamp: new Date(Date.now() - (count - i) * 60000), // Spread over last N minutes
      kiosk_id: kioskId,
      locker_id: (i % 10) + 1,
      event_type: eventTypes[i % eventTypes.length],
      rfid_card: i % 2 === 0 ? `card-${i}` : null,
      device_id: i % 2 === 1 ? `device-${i}` : null,
      staff_user: eventTypes[i % eventTypes.length].startsWith('staff') ? 'test-staff' : null,
      details: JSON.stringify({ test: true, index: i })
    }));
  }
  
  /**
   * Create a mock hardware controller
   */
  static createMockModbusController() {
    return {
      openLocker: vi.fn().mockResolvedValue(true),
      performBurstOpening: vi.fn().mockResolvedValue(true),
      sendPulse: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getConnectionStatus: vi.fn().mockReturnValue({ connected: true, errors: 0 }),
      on: vi.fn(),
      emit: vi.fn()
    };
  }
  
  /**
   * Create a mock RFID handler
   */
  static createMockRfidHandler() {
    return {
      startScanning: vi.fn(),
      stopScanning: vi.fn(),
      isScanning: vi.fn().mockReturnValue(false),
      on: vi.fn(),
      emit: vi.fn(),
      removeAllListeners: vi.fn()
    };
  }
  
  /**
   * Create mock rate limiter
   */
  static createMockRateLimiter() {
    return {
      checkIpRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkCardRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkLockerRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkDeviceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      checkQrRateLimits: vi.fn().mockResolvedValue({ allowed: true }),
      checkRfidRateLimits: vi.fn().mockResolvedValue({ allowed: true }),
      isBlocked: vi.fn().mockReturnValue(false),
      resetLimits: vi.fn(),
      getStatistics: vi.fn().mockReturnValue({}),
      getAllViolations: vi.fn().mockReturnValue([]),
      getActiveBlocks: vi.fn().mockReturnValue([])
    };
  }
  
  /**
   * Validate test environment
   */
  static validateTestEnvironment() {
    const requiredEnvVars = ['NODE_ENV'];
    const missing = requiredEnvVars.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Warning: NODE_ENV is not set to "test"');
    }
  }
  
  /**
   * Create test configuration
   */
  static createTestConfig() {
    return {
      database: {
        path: ':memory:',
        wal_mode: true,
        timeout: 5000
      },
      hardware: {
        modbus: {
          port: '/dev/ttyUSB0',
          baudRate: 9600,
          timeout: 1000
        },
        rfid: {
          vendorId: 0x1234,
          productId: 0x5678
        }
      },
      security: {
        rate_limits: {
          ip_per_minute: 30,
          card_per_minute: 10,
          locker_per_minute: 6,
          device_per_20_seconds: 1
        },
        pin_rotation_days: 90,
        session_timeout_minutes: 30
      },
      system: {
        heartbeat_interval_seconds: 10,
        offline_threshold_seconds: 30,
        reserve_ttl_seconds: 90,
        bulk_operation_interval_ms: 300,
        log_retention_days: 30
      }
    };
  }
}

// Mock external dependencies
vi.mock('serialport', () => ({
  SerialPort: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    close: vi.fn(),
    write: vi.fn(),
    on: vi.fn(),
    isOpen: true
  }))
}));

vi.mock('node-hid', () => ({
  HID: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    read: vi.fn(),
    write: vi.fn()
  })),
  devices: vi.fn().mockReturnValue([])
}));

// Mock crypto for consistent test results
vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return {
    ...actual,
    randomBytes: vi.fn().mockImplementation((size: number) => {
      return Buffer.alloc(size, 0x42); // Consistent test data
    }),
    randomUUID: vi.fn().mockReturnValue('test-uuid-1234-5678-9abc-def0')
  };
});

// Mock file system operations for tests
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined)
  };
});

// Validate test environment on setup
TestUtils.validateTestEnvironment();

// Export for use in tests
export { vi };
export default TestUtils;