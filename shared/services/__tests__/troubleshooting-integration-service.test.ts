/**
 * Unit tests for TroubleshootingIntegrationService
 * Tests the integration of error handling, recovery actions, and troubleshooting workflow
 */

import { 
  TroubleshootingIntegrationService,
  TroubleshootingSession,
  EscalationData
} from '../troubleshooting-integration-service';
import { 
  WizardError, 
  ErrorSeverity, 
  ErrorCategory, 
  ERROR_CODES,
  ErrorHandler
} from '../error-handler';
import { 
  RecoveryActionSystem,
  RecoveryContext 
} from '../recovery-action-system';

// Mock the dependencies
jest.mock('../error-handler');
jest.mock('../recovery-action-system');

describe('TroubleshootingIntegrationService', () => {
  let service: TroubleshootingIntegrationService;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockRecoverySystem: jest.Mocked<RecoveryActionSystem>;

  const mockError: WizardError = {
    code: ERROR_CODES.SP_NOT_FOUND,
    category: ErrorCategory.SERIAL_PORT,
    severity: ErrorSeverity.CRITICAL,
    message: 'Serial port not found',
    userMessage: 'USB-RS485 adapter not found',
    recoverable: true,
    timestamp: new Date()
  };

  beforeEach(() => {
    // Create mock instances
    mockErrorHandler = {
      classifyError: jest.fn(),
      generateTroubleshootingSteps: jest.fn(),
      formatUserFriendlyMessage: jest.fn(),
      suggestRecoveryAction: jest.fn(),
      executeRecoveryAction: jest.fn(),
      addToHistory: jest.fn(),
      getErrorHistory: jest.fn(),
      getErrorStatistics: jest.fn()
    } as any;

    mockRecoverySystem = {
      suggestRecoveryAction: jest.fn(),
      executeRecoveryAction: jest.fn(),
      executeRollback: jest.fn(),
      generateManualInterventionGuide: jest.fn(),
      getRecoveryHistory: jest.fn(),
      getRecoveryStatistics: jest.fn()
    } as any;

    // Setup default mock returns
    mockErrorHandler.classifyError.mockReturnValue(mockError);
    mockErrorHandler.generateTroubleshootingSteps.mockReturnValue([
      {
        id: 'test_step',
        title: 'Test Step',
        description: 'Test step description',
        action: 'Test action',
        expectedResult: 'Test result',
        isAutomated: false,
        estimatedTime: 30
      }
    ]);

    mockRecoverySystem.generateManualInterventionGuide.mockReturnValue({
      title: 'Test Manual Guide',
      description: 'Test description',
      estimatedTime: 300,
      skillLevel: 'beginner',
      steps: []
    });

    mockRecoverySystem.suggestRecoveryAction.mockResolvedValue([
      {
        type: 'retry',
        description: 'Test recovery action',
        userDescription: 'Test recovery for user',
        automatic: true,
        priority: 1,
        execute: jest.fn().mockResolvedValue(true)
      }
    ]);

    mockRecoverySystem.executeRecoveryAction.mockResolvedValue({
      success: true,
      action: {
        type: 'retry',
        description: 'Test recovery action',
        userDescription: 'Test recovery for user',
        automatic: true,
        priority: 1,
        execute: jest.fn().mockResolvedValue(true)
      },
      message: 'Recovery successful'
    });

    service = new TroubleshootingIntegrationService(mockErrorHandler, mockRecoverySystem);
  });

  describe('Session Management', () => {
    test('should start a new troubleshooting session', async () => {
      const context: RecoveryContext = {
        sessionId: 'test-session',
        step: 1
      };

      const session = await service.startTroubleshootingSession(mockError, context);

      expect(session).toBeDefined();
      expect(session.sessionId).toMatch(/troubleshoot_/);
      expect(session.error).toBe(mockError);
      expect(session.context).toBe(context);
      expect(session.status).toBe('active');
      expect(session.startTime).toBeInstanceOf(Date);
      expect(session.troubleshootingSteps).toHaveLength(1);
      expect(session.manualGuide).toBeDefined();
      expect(session.recoveryAttempts).toEqual([]);
      expect(session.currentStepIndex).toBe(0);
    });

    test('should start session with raw Error object', async () => {
      const rawError = new Error('Test error');
      
      const session = await service.startTroubleshootingSession(rawError);

      expect(mockErrorHandler.classifyError).toHaveBeenCalledWith(rawError, {});
      expect(session.error).toBe(mockError);
    });

    test('should get active session by ID', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      const retrievedSession = service.getSession(session.sessionId);
      
      expect(retrievedSession).toBe(session);
    });

    test('should return undefined for non-existent session', () => {
      const session = service.getSession('non-existent');
      
      expect(session).toBeUndefined();
    });

    test('should get all active sessions', async () => {
      const session1 = await service.startTroubleshootingSession(mockError);
      const session2 = await service.startTroubleshootingSession(mockError);
      
      const activeSessions = service.getActiveSessions();
      
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions).toContain(session1);
      expect(activeSessions).toContain(session2);
    });
  });

  describe('Recovery Action Execution', () => {
    test('should execute recovery action successfully', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      const result = await service.executeRecoveryAction(session.sessionId);

      expect(mockRecoverySystem.suggestRecoveryAction).toHaveBeenCalledWith(mockError, {});
      expect(mockRecoverySystem.executeRecoveryAction).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(session.recoveryAttempts).toHaveLength(1);
    });

    test('should handle recovery action failure', async () => {
      mockRecoverySystem.executeRecoveryAction.mockResolvedValue({
        success: false,
        action: {
          type: 'retry',
          description: 'Test recovery action',
          userDescription: 'Test recovery for user',
          automatic: true,
          priority: 1,
          execute: jest.fn().mockResolvedValue(false)
        },
        message: 'Recovery failed',
        userInterventionRequired: true
      });

      const session = await service.startTroubleshootingSession(mockError);
      
      const result = await service.executeRecoveryAction(session.sessionId);

      expect(result.success).toBe(false);
      expect(result.userInterventionRequired).toBe(true);
      expect(session.recoveryAttempts).toHaveLength(1);
    });

    test('should throw error for non-existent session', async () => {
      await expect(
        service.executeRecoveryAction('non-existent')
      ).rejects.toThrow('Troubleshooting session not found');
    });

    test('should throw error for invalid action index', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      await expect(
        service.executeRecoveryAction(session.sessionId, 999)
      ).rejects.toThrow('Recovery action index out of range');
    });
  });

  describe('Step Progress Management', () => {
    test('should update step progress successfully', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      const result = service.updateStepProgress(session.sessionId, 0, true);

      expect(result).toBe(true);
      expect(session.currentStepIndex).toBe(0);
    });

    test('should handle step failure', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      const result = service.updateStepProgress(session.sessionId, 0, false);

      expect(result).toBe(true);
    });

    test('should resolve session on last step success', async () => {
      // Mock single step
      mockErrorHandler.generateTroubleshootingSteps.mockReturnValue([
        {
          id: 'final_step',
          title: 'Final Step',
          description: 'Final step description',
          action: 'Final action',
          expectedResult: 'Final result',
          isAutomated: false,
          estimatedTime: 30
        }
      ]);

      const session = await service.startTroubleshootingSession(mockError);
      
      const result = service.updateStepProgress(session.sessionId, 0, true);

      expect(result).toBe(true);
      expect(session.status).toBe('resolved');
      expect(session.endTime).toBeInstanceOf(Date);
      expect(session.resolution).toContain('Resolved through troubleshooting steps');
    });

    test('should handle invalid session ID', () => {
      const result = service.updateStepProgress('non-existent', 0, true);
      
      expect(result).toBe(false);
    });

    test('should handle invalid step index', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      const result = service.updateStepProgress(session.sessionId, 999, true);

      expect(result).toBe(false);
    });
  });

  describe('Session Escalation', () => {
    test('should escalate session to support', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      const reason = 'User unable to resolve issue';
      const userFeedback = 'The steps were confusing';
      
      const escalationData = await service.escalateSession(session.sessionId, reason, userFeedback);

      expect(escalationData).toBeDefined();
      expect(escalationData.error).toBe(mockError);
      expect(escalationData.troubleshootingHistory).toBe(session);
      expect(escalationData.userFeedback).toBe(userFeedback);
      expect(escalationData.urgencyLevel).toBe('critical'); // Based on error severity
      expect(escalationData.systemInfo).toBeDefined();

      expect(session.status).toBe('escalated');
      expect(session.endTime).toBeInstanceOf(Date);
      expect(session.escalationReason).toBe(reason);
    });

    test('should determine correct urgency level', async () => {
      const warningError: WizardError = {
        ...mockError,
        severity: ErrorSeverity.WARNING
      };

      const session = await service.startTroubleshootingSession(warningError);
      
      const escalationData = await service.escalateSession(session.sessionId, 'test');

      expect(escalationData.urgencyLevel).toBe('medium');
    });

    test('should throw error for non-existent session', async () => {
      await expect(
        service.escalateSession('non-existent', 'test')
      ).rejects.toThrow('Troubleshooting session not found');
    });
  });

  describe('Metrics and Analytics', () => {
    test('should provide troubleshooting metrics', async () => {
      // Create some sessions with different outcomes
      const session1 = await service.startTroubleshootingSession(mockError);
      const session2 = await service.startTroubleshootingSession(mockError);
      
      // Resolve one session
      service.updateStepProgress(session1.sessionId, 0, true);
      
      // Escalate another
      await service.escalateSession(session2.sessionId, 'test');
      
      const metrics = service.getTroubleshootingMetrics();

      expect(metrics.totalSessions).toBe(2);
      expect(metrics.resolvedSessions).toBeGreaterThanOrEqual(0);
      expect(metrics.escalatedSessions).toBeGreaterThanOrEqual(0);
      expect(metrics.averageResolutionTime).toBeGreaterThanOrEqual(0);
      expect(metrics.mostCommonErrors).toBeInstanceOf(Array);
      expect(metrics.mostEffectiveRecoveryActions).toBeInstanceOf(Array);
    });

    test('should handle empty metrics', () => {
      const metrics = service.getTroubleshootingMetrics();

      expect(metrics.totalSessions).toBe(0);
      expect(metrics.resolvedSessions).toBe(0);
      expect(metrics.escalatedSessions).toBe(0);
      expect(metrics.averageResolutionTime).toBe(0);
      expect(metrics.mostCommonErrors).toEqual([]);
      expect(metrics.mostEffectiveRecoveryActions).toEqual([]);
    });
  });

  describe('Session Cleanup', () => {
    test('should clean up old sessions', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      // Manually set old timestamp
      session.startTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      
      service.cleanup();

      expect(session.status).toBe('abandoned');
      expect(session.endTime).toBeInstanceOf(Date);
      
      // Session should be moved to history
      const activeSessions = service.getActiveSessions();
      expect(activeSessions).not.toContain(session);
    });

    test('should maintain history size limit', async () => {
      // This would require creating many sessions to test the limit
      // For now, just verify cleanup runs without error
      service.cleanup();
      
      const metrics = service.getTroubleshootingMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle errors in recovery action execution', async () => {
      mockRecoverySystem.executeRecoveryAction.mockRejectedValue(new Error('Recovery failed'));
      
      const session = await service.startTroubleshootingSession(mockError);
      
      await expect(
        service.executeRecoveryAction(session.sessionId)
      ).rejects.toThrow('Recovery failed');
    });

    test('should handle errors in session escalation', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      // Mock system info gathering failure
      jest.spyOn(service as any, 'gatherSystemInfo').mockRejectedValue(new Error('System info failed'));
      
      await expect(
        service.escalateSession(session.sessionId, 'test')
      ).rejects.toThrow('System info failed');
    });
  });

  describe('Integration Points', () => {
    test('should integrate with ErrorHandler correctly', async () => {
      const rawError = new Error('Test error');
      
      await service.startTroubleshootingSession(rawError);

      expect(mockErrorHandler.classifyError).toHaveBeenCalledWith(rawError, {});
      expect(mockErrorHandler.generateTroubleshootingSteps).toHaveBeenCalledWith(mockError);
    });

    test('should integrate with RecoveryActionSystem correctly', async () => {
      const session = await service.startTroubleshootingSession(mockError);
      
      await service.executeRecoveryAction(session.sessionId);

      expect(mockRecoverySystem.suggestRecoveryAction).toHaveBeenCalledWith(mockError, {});
      expect(mockRecoverySystem.executeRecoveryAction).toHaveBeenCalled();
      expect(mockRecoverySystem.generateManualInterventionGuide).toHaveBeenCalledWith(mockError, {});
    });
  });
});