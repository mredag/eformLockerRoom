/**
 * Unit tests for Recovery Action System
 * Tests automated recovery, rollback mechanisms, and manual intervention guides
 */

import { 
  RecoveryActionSystem,
  RecoveryContext,
  RecoveryResult,
  ManualInterventionGuide
} from '../recovery-action-system';
import { 
  WizardError, 
  ErrorSeverity, 
  ErrorCategory, 
  ERROR_CODES 
} from '../error-handler';

describe('RecoveryActionSystem', () => {
  let recoverySystem: RecoveryActionSystem;

  beforeEach(() => {
    recoverySystem = new RecoveryActionSystem();
  });

  describe('Recovery Action Suggestions', () => {
    test('should suggest basic recovery actions for serial port errors', async () => {
      const error: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const actions = await recoverySystem.suggestRecoveryAction(error);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].type).toBe('automatic_fix');
      expect(actions[0].description).toContain('Rescan for serial ports');
      expect(actions[0].automatic).toBe(true);
    });

    test('should suggest context-aware actions based on session history', async () => {
      const error: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const context: RecoveryContext = {
        sessionId: 'test-session',
        attemptCount: 1
      };

      // First attempt
      const actions1 = await recoverySystem.suggestRecoveryAction(error, context);
      expect(actions1[0].type).toBe('retry');

      // Simulate failed recovery to build history
      await recoverySystem.executeRecoveryAction(actions1[0], error, context);

      // Second attempt should suggest different approach
      const context2: RecoveryContext = {
        ...context,
        attemptCount: 2
      };

      const actions2 = await recoverySystem.suggestRecoveryAction(error, context2);
      expect(actions2.some(a => a.type === 'manual_intervention')).toBe(true);
    });

    test('should suggest progressive recovery actions based on attempt count', async () => {
      const error: WizardError = {
        code: ERROR_CODES.ADDR_CONFLICT,
        category: ErrorCategory.ADDRESS_CONFIG,
        severity: ErrorSeverity.ERROR,
        message: 'Address conflict',
        userMessage: 'Address conflict detected',
        recoverable: true,
        timestamp: new Date()
      };

      const context: RecoveryContext = {
        sessionId: 'test-session',
        attemptCount: 3
      };

      const actions = await recoverySystem.suggestRecoveryAction(error, context);

      // Should include rollback action for high attempt count
      expect(actions.some(a => a.type === 'rollback')).toBe(true);
      expect(actions.some(a => a.type === 'manual_intervention')).toBe(true);
    });

    test('should prioritize and deduplicate actions', async () => {
      const error: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const actions = await recoverySystem.suggestRecoveryAction(error);

      // Actions should be sorted by priority (lower number = higher priority)
      for (let i = 1; i < actions.length; i++) {
        expect(actions[i].priority).toBeGreaterThanOrEqual(actions[i-1].priority);
      }

      // Should not have duplicate actions
      const descriptions = actions.map(a => a.description);
      const uniqueDescriptions = [...new Set(descriptions)];
      expect(descriptions.length).toBe(uniqueDescriptions.length);
    });
  });

  describe('Recovery Action Execution', () => {
    test('should execute successful recovery action', async () => {
      const error: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const context: RecoveryContext = {
        sessionId: 'test-session'
      };

      const actions = await recoverySystem.suggestRecoveryAction(error, context);
      const result = await recoverySystem.executeRecoveryAction(actions[0], error, context);

      expect(result.success).toBeDefined();
      expect(result.action).toBe(actions[0]);
      expect(result.message).toContain('Recovery action');
      expect(result.estimatedRecoveryTime).toBeGreaterThan(0);
    });

    test('should handle recovery action failure', async () => {
      const error: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const failingAction = {
        type: 'retry' as const,
        description: 'Failing action',
        userDescription: 'This will fail',
        automatic: true,
        priority: 1,
        execute: jest.fn().mockRejectedValue(new Error('Action failed'))
      };

      const result = await recoverySystem.executeRecoveryAction(failingAction, error);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
      expect(result.rollbackRequired).toBe(true);
      expect(result.userInterventionRequired).toBe(true);
    });

    test('should suggest next action after successful recovery', async () => {
      const error: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const successfulAction = {
        type: 'automatic_fix' as const,
        description: 'Rescan for serial ports',
        userDescription: 'Automatically scan for USB-RS485 adapters',
        automatic: true,
        priority: 1,
        execute: jest.fn().mockResolvedValue(true)
      };

      const result = await recoverySystem.executeRecoveryAction(successfulAction, error);

      expect(result.success).toBe(true);
      expect(result.nextAction).toBeDefined();
      expect(result.nextAction?.description).toContain('Test serial port');
    });

    test('should record recovery attempts in history', async () => {
      const error: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const context: RecoveryContext = {
        sessionId: 'test-session'
      };

      const actions = await recoverySystem.suggestRecoveryAction(error, context);
      await recoverySystem.executeRecoveryAction(actions[0], error, context);

      const history = recoverySystem.getRecoveryHistory('test-session');
      expect(history.length).toBe(1);
      expect(history[0].action).toBe(actions[0]);
    });
  });

  describe('Rollback Operations', () => {
    test('should execute rollback operations in priority order', async () => {
      const sessionId = 'test-session';
      
      // Create a recovery that would create rollback points
      const error: WizardError = {
        code: ERROR_CODES.SYS_CONFIG_UPDATE_FAILED,
        category: ErrorCategory.SYSTEM_INTEGRATION,
        severity: ErrorSeverity.ERROR,
        message: 'Config update failed',
        userMessage: 'Configuration update failed',
        recoverable: true,
        timestamp: new Date()
      };

      const context: RecoveryContext = {
        sessionId,
        operation: 'config_update'
      };

      // Execute an action that creates rollback points
      const actions = await recoverySystem.suggestRecoveryAction(error, context);
      await recoverySystem.executeRecoveryAction(actions[0], error, context);

      // Execute rollback
      const rollbackResult = await recoverySystem.executeRollback(sessionId);
      expect(rollbackResult).toBe(true);
    });

    test('should handle rollback when no operations exist', async () => {
      const result = await recoverySystem.executeRollback('non-existent-session');
      expect(result).toBe(true); // Should succeed with no operations
    });
  });

  describe('Manual Intervention Guides', () => {
    test('should generate serial port intervention guide', () => {
      const error: WizardError = {
        code: ERROR_CODES.SP_PERMISSION_DENIED,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.ERROR,
        message: 'Permission denied',
        userMessage: 'Permission denied accessing serial port',
        recoverable: true,
        timestamp: new Date()
      };

      const guide = recoverySystem.generateManualInterventionGuide(error);

      expect(guide.title).toContain('Serial Port');
      expect(guide.skillLevel).toBe('beginner');
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.estimatedTime).toBeGreaterThan(0);
      expect(guide.safetyWarnings).toBeDefined();
      expect(guide.toolsRequired).toBeDefined();
    });

    test('should generate communication intervention guide', () => {
      const error: WizardError = {
        code: ERROR_CODES.COM_NO_RESPONSE,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'No response',
        userMessage: 'No response from device',
        recoverable: true,
        timestamp: new Date()
      };

      const guide = recoverySystem.generateManualInterventionGuide(error);

      expect(guide.title).toContain('Communication');
      expect(guide.skillLevel).toBe('intermediate');
      expect(guide.steps.length).toBeGreaterThan(0);
      expect(guide.steps[0].stepNumber).toBe(1);
      expect(guide.steps[0].action).toBeDefined();
      expect(guide.steps[0].expectedResult).toBeDefined();
    });

    test('should generate address configuration intervention guide', () => {
      const error: WizardError = {
        code: ERROR_CODES.ADDR_CONFLICT,
        category: ErrorCategory.ADDRESS_CONFIG,
        severity: ErrorSeverity.ERROR,
        message: 'Address conflict',
        userMessage: 'Address conflict detected',
        recoverable: true,
        timestamp: new Date()
      };

      const guide = recoverySystem.generateManualInterventionGuide(error);

      expect(guide.title).toContain('Address');
      expect(guide.skillLevel).toBe('intermediate');
      expect(guide.steps.length).toBeGreaterThan(0);
    });

    test('should generate hardware test intervention guide', () => {
      const error: WizardError = {
        code: ERROR_CODES.TEST_RELAY_NO_RESPONSE,
        category: ErrorCategory.HARDWARE_TEST,
        severity: ErrorSeverity.WARNING,
        message: 'Relay no response',
        userMessage: 'Relay test failed',
        recoverable: true,
        timestamp: new Date()
      };

      const guide = recoverySystem.generateManualInterventionGuide(error);

      expect(guide.title).toContain('Hardware Testing');
      expect(guide.skillLevel).toBe('beginner');
      expect(guide.safetyWarnings).toBeDefined();
      expect(guide.toolsRequired).toContain('Multimeter');
    });

    test('should generate system integration intervention guide', () => {
      const error: WizardError = {
        code: ERROR_CODES.SYS_CONFIG_UPDATE_FAILED,
        category: ErrorCategory.SYSTEM_INTEGRATION,
        severity: ErrorSeverity.ERROR,
        message: 'Config update failed',
        userMessage: 'Configuration update failed',
        recoverable: true,
        timestamp: new Date()
      };

      const guide = recoverySystem.generateManualInterventionGuide(error);

      expect(guide.title).toContain('System Integration');
      expect(guide.skillLevel).toBe('advanced');
      expect(guide.estimatedTime).toBeGreaterThan(600); // Should be longer for advanced tasks
    });

    test('should generate generic intervention guide for unknown errors', () => {
      const error: WizardError = {
        code: ERROR_CODES.GEN_UNKNOWN,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.ERROR,
        message: 'Unknown error',
        userMessage: 'Unknown error occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const guide = recoverySystem.generateManualInterventionGuide(error);

      expect(guide.title).toContain('General');
      expect(guide.skillLevel).toBe('beginner');
      expect(guide.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Recovery Statistics', () => {
    test('should provide recovery statistics', async () => {
      // Execute some recovery actions to build history
      const error: WizardError = {
        code: ERROR_CODES.COM_TIMEOUT,
        category: ErrorCategory.COMMUNICATION,
        severity: ErrorSeverity.WARNING,
        message: 'Communication timeout',
        userMessage: 'Communication timeout occurred',
        recoverable: true,
        timestamp: new Date()
      };

      const context: RecoveryContext = {
        sessionId: 'test-session'
      };

      const actions = await recoverySystem.suggestRecoveryAction(error, context);
      await recoverySystem.executeRecoveryAction(actions[0], error, context);

      const stats = recoverySystem.getRecoveryStatistics();

      expect(stats.totalRecoveries).toBeGreaterThan(0);
      expect(stats.successfulRecoveries).toBeGreaterThanOrEqual(0);
      expect(stats.failedRecoveries).toBeGreaterThanOrEqual(0);
      expect(stats.averageRecoveryTime).toBeGreaterThanOrEqual(0);
      expect(stats.mostCommonFailures).toBeInstanceOf(Array);
      expect(stats.rollbacksExecuted).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty recovery history', () => {
      const stats = recoverySystem.getRecoveryStatistics();

      expect(stats.totalRecoveries).toBe(0);
      expect(stats.successfulRecoveries).toBe(0);
      expect(stats.failedRecoveries).toBe(0);
      expect(stats.averageRecoveryTime).toBe(0);
      expect(stats.mostCommonFailures).toEqual([]);
      expect(stats.rollbacksExecuted).toBe(0);
    });
  });

  describe('Recovery History', () => {
    test('should return session-specific recovery history', async () => {
      const error: WizardError = {
        code: ERROR_CODES.SP_NOT_FOUND,
        category: ErrorCategory.SERIAL_PORT,
        severity: ErrorSeverity.CRITICAL,
        message: 'Serial port not found',
        userMessage: 'USB-RS485 adapter not found',
        recoverable: true,
        timestamp: new Date()
      };

      const context1: RecoveryContext = { sessionId: 'session-1' };
      const context2: RecoveryContext = { sessionId: 'session-2' };

      const actions = await recoverySystem.suggestRecoveryAction(error, context1);
      await recoverySystem.executeRecoveryAction(actions[0], error, context1);
      await recoverySystem.executeRecoveryAction(actions[0], error, context2);

      const session1History = recoverySystem.getRecoveryHistory('session-1');
      const session2History = recoverySystem.getRecoveryHistory('session-2');
      const allHistory = recoverySystem.getRecoveryHistory();

      expect(session1History.length).toBe(1);
      expect(session2History.length).toBe(1);
      expect(allHistory.length).toBe(2);
    });
  });
});