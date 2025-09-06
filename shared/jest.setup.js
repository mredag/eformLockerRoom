// Jest setup file for comprehensive unit tests
// Provides global test utilities and mocks

// Mock console methods to capture logs for testing
global.mockConsole = () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const logs = [];
  const errors = [];
  const warnings = [];
  
  console.log = jest.fn((...args) => {
    logs.push(args.join(' '));
  });
  
  console.error = jest.fn((...args) => {
    errors.push(args.join(' '));
  });
  
  console.warn = jest.fn((...args) => {
    warnings.push(args.join(' '));
  });
  
  return {
    logs,
    errors,
    warnings,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  };
};

// PII detection utility
global.assertNoPII = (logMessages, sensitiveData = []) => {
  logMessages.forEach(message => {
    sensitiveData.forEach(sensitive => {
      expect(message).not.toContain(sensitive);
    });
    
    // Check for common PII patterns
    expect(message).not.toMatch(/\b\d{10,}\b/); // Long numbers (card IDs)
    expect(message).not.toMatch(/seed.*\d+/); // Seed values
    expect(message).not.toMatch(/hash.*[a-f0-9]{8,}/); // Hash values
  });
};