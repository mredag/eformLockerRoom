/**
 * Test for Task 9: Update kiosk API endpoints
 * Validates API response format, backward compatibility, and logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { UiController } from '../ui-controller';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';
import { ModbusController } from '../../hardware/modbus-controller';
import { LockerNamingService } from '../../../../../shared/services/locker-naming-service';
import { UI_MESSAGES } from '../../../../../shared/constants/ui-messages';

// Mock dependencies
vi.mock('../../../../../shared/services/locker-state-manager');
vi.mock('../../hardware/modbus-controller');
vi.mock('../../../../../shared/services/locker-naming-service');
vi.mock('../../../../../shared/services/feature-flag-service');
vi.mock('../../../../../shared/services/assignment-engine');
vi.mock('../../../../../shared/services/configuration-manager');
vi.mock('../../../../../shared/database/connection');
vi.mock('../../../../../shared/services/rate-limiter');
vi.mock('../../../../../shared/middleware/rate-limit-middleware');

describe('UiController API Response Format (Task 9)', () => {
  let uiController: UiController;
  let mockLockerStateManager: any;
  let mockModbusController: any;
  let mockLockerNamingService: any;
  let mockRequest: any;
  let mockReply: any;
  let consoleSpy: any;

  beforeEach(() => {
    // Setup mocks
    mockLockerStateManager = {
      checkExistingOwnership: vi.fn(),
      getEnhancedAvailableLockers: vi.fn(),
      releaseLocker: vi.fn(),
      assignLocker: vi.fn(),
      confirmOwnership: vi.fn()
    };

    mockModbusController = {
      recordCardScan: vi.fn(),
      openLocker: vi.fn(),
      openLockerWithSensorlessRetry: vi.fn(),
      getHardwareStatus: vi.fn().mockReturnValue({
        available: true,
        diagnostics: { errorRate: 0 }
      })
    };

    mockLockerNamingService = {
      getDisplayName: vi.fn().mockResolvedValue('Dolap 1')
    };

    // Mock rate limiter
    const mockRateLimiter = {
      check_card_rate: vi.fn().mockResolvedValue({ allowed: true }),
      check_all_limits: vi.fn().mockResolvedValue({ allowed: true })
    };

    // Mock feature flag service
    const mockFeatureFlagService = {
      isSmartAssignmentEnabled: vi.fn()
    };

    // Mock assignment engine
    const mockAssignmentEngine = {
      assignLocker: vi.fn()
    };

    // Setup request/reply mocks
    mockRequest = {
      body: {},
      ip: '127.0.0.1'
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis()
    };

    // Spy on console.log to verify logging
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create controller instance
    uiController = new UiController(
      mockLockerStateManager,
      mockModbusController,
      mockLockerNamingService
    );

    // Mock the private properties
    (uiController as any).rateLimiter = mockRateLimiter;
    (uiController as any).featureFlagService = mockFeatureFlagService;
    (uiController as any).assignmentEngine = mockAssignmentEngine;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Smart Assignment Mode', () => {
    beforeEach(() => {
      (uiController as any).featureFlagService.isSmartAssignmentEnabled.mockResolvedValue(true);
    });

    it('should return proper format for successful smart assignment', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      const mockAssignmentResult = {
        success: true,
        lockerId: 5,
        action: 'assign_new',
        message: UI_MESSAGES.success_new,
        sessionId: 'session_123'
      };

      (uiController as any).assignmentEngine.assignLocker.mockResolvedValue(mockAssignmentResult);
      mockModbusController.openLockerWithSensorlessRetry.mockResolvedValue({
        success: true,
        action: 'opened'
      });

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: true,
        action: 'assign_new',
        locker_id: 5,
        message: UI_MESSAGES.success_new,
        mode: 'smart',
        smart_assignment: true,
        session_id: 'session_123'
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=assign_new, message=.*/)
      );
    });

    it('should return proper format for no stock error', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      const mockAssignmentResult = {
        success: false,
        action: 'assign_new',
        message: UI_MESSAGES.no_stock,
        errorCode: 'no_stock'
      };

      (uiController as any).assignmentEngine.assignLocker.mockResolvedValue(mockAssignmentResult);

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: false,
        error: 'no_stock',
        message: UI_MESSAGES.no_stock,
        mode: 'smart',
        smart_assignment: true
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=assign_new, message=.*/)
      );
    });

    it('should return proper format for hardware failure', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      const mockAssignmentResult = {
        success: true,
        lockerId: 5,
        action: 'assign_new',
        message: UI_MESSAGES.success_new
      };

      (uiController as any).assignmentEngine.assignLocker.mockResolvedValue(mockAssignmentResult);
      mockModbusController.openLockerWithSensorlessRetry.mockResolvedValue({
        success: false,
        action: 'failed'
      });

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: false,
        error: 'hardware_failure',
        message: UI_MESSAGES.error,
        mode: 'smart',
        smart_assignment: true
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=hardware_failure, message=.*/)
      );
    });
  });

  describe('Manual Mode (Backward Compatibility)', () => {
    beforeEach(() => {
      (uiController as any).featureFlagService.isSmartAssignmentEnabled.mockResolvedValue(false);
    });

    it('should return proper format for existing locker opening', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      const mockExistingLocker = {
        id: 3,
        kiosk_id: 'kiosk_1',
        status: 'Owned'
      };

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(mockExistingLocker);
      mockModbusController.openLocker.mockResolvedValue(true);

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: true,
        action: 'open_existing',
        locker_id: 3,
        message: UI_MESSAGES.success_existing,
        mode: 'manual'
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=open_existing, message=.*/)
      );
    });

    it('should return proper format for showing available lockers', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      const mockAvailableLockers = [
        { id: 1, status: 'Free', displayName: 'Dolap 1' },
        { id: 2, status: 'Free', displayName: 'Dolap 2' }
      ];

      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getEnhancedAvailableLockers.mockResolvedValue(mockAvailableLockers);

      // Mock session manager
      const mockSession = {
        id: 'session_123',
        timeoutSeconds: 30
      };
      (uiController as any).sessionManager = {
        getKioskSession: vi.fn().mockReturnValue(null),
        createSession: vi.fn().mockReturnValue(mockSession)
      };

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: true,
        action: 'show_lockers',
        session_id: 'session_123',
        timeout_seconds: 30,
        message: expect.any(String), // Validated message
        mode: 'manual',
        lockers: [
          { id: 1, status: 'Free', display_name: 'Dolap 1' },
          { id: 2, status: 'Free', display_name: 'Dolap 2' }
        ]
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=show_lockers, message=.*/)
      );
    });

    it('should return proper format for no available lockers', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      mockLockerStateManager.getEnhancedAvailableLockers.mockResolvedValue([]);

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: false,
        error: 'no_lockers',
        message: UI_MESSAGES.no_stock,
        mode: 'manual'
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=no_lockers, message=.*/)
      );
    });
  });

  describe('Rate Limiting', () => {
    it('should return proper format for rate limit exceeded', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      const mockRateLimitResult = {
        allowed: false,
        type: 'card_rate',
        key: 'test_card',
        message: UI_MESSAGES.throttled,
        retry_after_seconds: 10
      };

      (uiController as any).rateLimiter.check_card_rate.mockResolvedValue(mockRateLimitResult);

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: false,
        error: 'rate_limit_exceeded',
        type: 'card_rate',
        key: 'test_card',
        message: UI_MESSAGES.throttled,
        retry_after_seconds: 10
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=rate_limit, message=.*/)
      );

      // Verify HTTP status code
      expect(mockReply.code).toHaveBeenCalledWith(429);
    });
  });

  describe('Error Handling', () => {
    it('should return proper format for server errors', async () => {
      // Setup
      mockRequest.body = { card_id: 'test_card', kiosk_id: 'kiosk_1' };
      
      // Mock an error
      (uiController as any).featureFlagService.isSmartAssignmentEnabled.mockRejectedValue(
        new Error('Database error')
      );

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        success: false,
        error: 'error_server',
        message: UI_MESSAGES.error,
        mode: 'unknown'
      });

      // Verify logging format as required
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/API response: action=error_server, message=.*/)
      );

      // Verify HTTP status code
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('Static MVP Configuration', () => {
    it('should use static windows for MVP', () => {
      // Test the static configuration method
      const config = (uiController as any).getStaticMVPConfig();
      
      expect(config).toEqual({
        quarantine_minutes: 20,
        reclaim_minutes: 60,
        session_limit_minutes: 180,
        return_hold_minutes: 15
      });
    });
  });

  describe('Input Validation', () => {
    it('should return error for missing parameters', async () => {
      // Setup - missing kiosk_id
      mockRequest.body = { card_id: 'test_card' };

      // Execute
      const result = await (uiController as any).handleCardScanned(mockRequest, mockReply);

      // Verify response format
      expect(result).toEqual({
        error: 'card_id and kiosk_id are required'
      });

      // Verify HTTP status code
      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });
});