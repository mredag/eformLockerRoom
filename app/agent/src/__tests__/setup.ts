// Global test setup for UpdateAgent tests

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Mock timers for update interval testing
jest.mock('timers', () => ({
  setTimeout: jest.fn(),
  setInterval: jest.fn(),
  clearTimeout: jest.fn(),
  clearInterval: jest.fn()
}));

// Set test timeout
jest.setTimeout(10000);
