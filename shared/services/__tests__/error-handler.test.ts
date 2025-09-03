/**
 * Unit tests for ErrorHandler service
 * Tests error classification, recovery actions, and troubleshooting steps
 */

import { 
  ErrorHandler, 
  ErrorSeverity, 
  ErrorCategory, 
  ERROR_CODES,
  WizardError,
  RecoveryAction,
  TroubleshootingStep
} from '../error-handler';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
  });

  describe('Error Classification', () => {
    test('should classify serial port not found error', () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.code).toBe(ERROR_CODES.SP_NOT_FOUND);
      expect(wizardError.category).toBe(ErrorCategory.SERIAL_PORT);
      expect(wizardError.severity).toBe(ErrorSeverity.CRITICAL);
      expect(wizardError.recoverable).toBe(true);
    });

    test('should classify permission denied error', () => {
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.code).toBe(ERROR_CODES.SP_PERMISSION_DENIED);
      expect(wizardError.category).toBe(ErrorCategory.SERIAL_PORT);
      expect(wizardError.severity).toBe(ErrorSeverity.ERROR);
    });

    test('should classify device busy error', () => {
      const error = new Error('Resource busy');
      (error as any).code = 'EBUSY';

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.code).toBe(ERROR_CODES.SP_DEVICE_BUSY);
      expect(wizardError.category).toBe(ErrorCategory.SERIAL_PORT);
    });

    test('should classify timeout error', () => {
      const error = new Error('Operation timed out');

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.code).toBe(ERROR_CODES.COM_TIMEOUT);
      expect(wizardError.category).toBe(ErrorCategory.COMMUNICATION);
      expect(wizardError.severity).toBe(ErrorSeverity.WARNING);
    });

    test('should classify CRC error', () => {
      const error = new Error('CRC check failed');

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.code).toBe(ERROR_CODES.COM_CRC_ERROR);
      expect(wizardError.category).toBe(ErrorCategory.COMMUNICATION);
    });

    test('should classify unknown error', () => {
      const error = new Error('Something went wrong');

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.code).toBe(ERROR_CODES.GEN_UNKNOWN);
      expect(wizardError.category).toBe(ErrorCategory.CONFIGURATION);
      expect(wizardError.severity).toBe(ErrorSeverity.ERROR);
    });

    test('should include context in classified error', () => {
      const error = new Error('Test error');
      const context = {
        step: 2,
        sessionId: 'test-session',
        deviceAddress: 1
      };

      const wizardError = errorHandler.classifyError(error, context);

      expect(wizardError.context).toEqual(context);
      expect(wizardError.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('User-Friendly Messages', () => {
    test('should format user-friendly message', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found. Please check the connection.',
        recoverable: true,
        suggestedAction: 'Check USB-RS485 adapter connection and try scanning again.',
        documentationUrl: '/docs/troubleshooting/serial-port-issues',
        timestamp: new Date()
      };

      const formatted = errorHandler.formatUserFriendlyMessage(wizardError);

      expect(formatted).toContain('USB-RS485 adapter not found');
      expect(formatted).toContain('Suggested action:');
      expect(formatted).toContain('For more help, see:');
    });

    test('should format message without optional fields', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.GEN_UNKNOWN,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.ERROR,
        message: 'Unknown error',
        userMessage: 'An unexpected error occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const formatted = errorHandler.formatUserFriendlyMessage(wizardError);

      expect(formatted).toBe('An unexpected error occurred');
    });
  });

  describe('Recovery Actions', () => {
    test('should suggest recovery actions for serial port errors', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const actions = errorHandler.suggestRecoveryAction(wizardError);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('automatic_fix');
      expect(actions[0].description).toContain('Scan for available serial ports');
      expect(actions[0].automatic).toBe(true);
    });

    test('should suggest recovery actions for communication errors', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const actions = errorHandler.suggestRecoveryAction(wizardError);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('retry');
      expect(actions[0].description).toContain('Retry communication');
    });

    test('should suggest manual intervention for permission errors', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.SP_PERMISSION_DENIED,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.ERROR,
        message: 'Permission denied',
        userMessage: 'Permission denied accessing serial port',
        recoverable: true,
        timestamp: new Date()
      };

      const actions = errorHandler.suggestRecoveryAction(wizardError);

      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('manual_intervention');
      expect(actions[0].automatic).toBe(false);
      expect(actions[0].requiresUserConfirmation).toBe(true);
    });

    test('should sort recovery actions by priority', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.GEN_UNKNOWN,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.ERROR,
        message: 'Unknown error',
        userMessage: 'Unknown error occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const actions = errorHandler.suggestRecoveryAction(wizardError);

      expect(actions).toHaveLength(1);
      expect(actions[0].priority).toBe(10); // Generic action has low priority
    });
  });

  describe('Recovery Action Execution', () => {
    test('should execute recovery action successfully', async () => {
      const action: RecoveryAction = {
        type: 'retry',
        description: 'Test action',
        userDescription: 'Test action for user',
        automatic: true,
        priority: 1,
        execute: jest.fn().mockResolvedValue(true)
      };

      const result = await errorHandler.executeRecoveryAction(action);

      expect(result).toBe(true);
      expect(action.execute).toHaveBeenCalled();
    });

    test('should handle recovery action failure', async () => {
      const action: RecoveryAction = {
        type: 'retry',
        description: 'Test action',
        userDescription: 'Test action for user',
        automatic: true,
        priority: 1,
        execute: jest.fn().mockRejectedValue(new Error('Action failed'))
      };

      const result = await errorHandler.executeRecoveryAction(action);

      expect(result).toBe(false);
    });
  });

  describe('Troubleshooting Steps', () => {
    test('should generate troubleshooting steps for serial port errors', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const steps = errorHandler.generateTroubleshootingSteps(wizardError);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].title).toContain('Check USB Connection');
      expect(steps[0].isAutomated).toBe(false);
      expect(steps[0].estimatedTime).toBeGreaterThan(0);
    });

    test('should generate troubleshooting steps for communication errors', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const steps = errorHandler.generateTroubleshootingSteps(wizardError);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].title).toContain('Check Wiring');
      expect(steps.some(step => step.isAutomated)).toBe(true);
    });

    test('should generate troubleshooting steps for address configuration errors', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.ADDR_CONFLICT,
        category: ErrorCategory.ADDRESS_CONFIG,
        severity: ErrorSeverity.ERROR,
        message: 'Address conflict',
        userMessage: 'Address conflict detected',
        recoverable: true,
        timestamp: new Date()
      };

      const steps = errorHandler.generateTroubleshootingSteps(wizardError);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].title).toContain('Scan Existing Addresses');
      expect(steps.every(step => step.isAutomated)).toBe(true);
    });

    test('should include step navigation information', () => {
      const wizardError: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const steps = errorHandler.generateTroubleshootingSteps(wizardError);

      const firstStep = steps[0];
      expect(firstStep.nextStepOnSuccess).toBeDefined();
      expect(firstStep.nextStepOnFailure).toBeDefined();
    });
  });

  describe('Error History', () => {
    test('should add errors to history', () => {
      const error = new Error('Test error');
      const wizardError = errorHandler.classifyError(error);

      expect(errorHandler.getErrorHistory()).toHaveLength(1);
      expect(errorHandler.getErrorHistory()[0]).toEqual(wizardError);
    });

    test('should maintain history size limit', () => {
      // Add more errors than the limit (100)
      for (let i = 0; i < 150; i++) {
        const error = new Error(`Test error ${i}`);
        errorHandler.classifyError(error);
      }

      const history = errorHandler.getErrorHistory();
      expect(history.length).toBe(100);
      expect(history[0].message).toBe('Test error 149'); // Most recent first
    });

    test('should provide error statistics', () => {
      // Add various types of errors
      const serialError = new Error('Serial error');
      (serialError as any).code = 'ENOENT';
      errorHandler.classifyError(serialError);

      const commError = new Error('Communication timeout');
      errorHandler.classifyError(commError);

      const stats = errorHandler.getErrorStatistics();

      expect(stats.totalErrors).toBe(2);
      expect(stats.errorsByCategory[ErrorCategory.SERIAL_PORT]).toBe(1);
      expect(stats.errorsByCategory[ErrorCategory.COMMUNICATION]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.errorsBySeverity[ErrorSeverity.WARNING]).toBe(1);
      expect(stats.recentErrors).toHaveLength(2);
    });
  });

  describe('Error Context', () => {
    test('should preserve error context', () => {
      const error = new Error('Test error');
      const context = {
        step: 3,
        sessionId: 'session-123',
        deviceAddress: 2,
        operation: 'address_config'
      };

      const wizardError = errorHandler.classifyError(error, context);

      expect(wizardError.context).toEqual(context);
    });

    test('should handle missing context gracefully', () => {
      const error = new Error('Test error');

      const wizardError = errorHandler.classifyError(error);

      expect(wizardError.context).toEqual({});
    });
  });
});