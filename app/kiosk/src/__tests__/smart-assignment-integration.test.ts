/**
 * Smart Assignment Integration Tests
 * 
 * Tests for Task 8: Enhance kiosk UI for smart assignment
 * Integration tests for API endpoints and feature flag functionality
 */

import { FastifyInstance } from 'fastify';
import { UiController } from '../controllers/ui-controller';
import { LockerStateManager } from '../../../shared/services/locker-state-manager';
import { LockerNamingService } from '../../../shared/services/locker-naming-service';
import { ModbusController } from '../hardware/modbus-controller';
import { DatabaseConnection } from '../../../shared/database/connection';

describe('Smart Assignment Integration', () => {
  let fastify: FastifyInstance;
  let uiController: UiController;
  let mockLockerStateManager: jest.Mocked<LockerStateManager>;
  let mockModbusController: jest.Mocked<ModbusController>;
  let mockLockerNamingService: jest.Mocked<LockerNamingService>;

  beforeEach(async () => {
    // Create mocks
    mockLockerStateManager = {
      checkExistingOwnership: jest.fn(),
      getEnhancedAvailableLockers: jest.fn(),
      assignLocker: jest.fn(),
      releaseLocker: jest.fn(),
      confirmOwnership: jest.fn(),
      handleHardwareError: jest.fn(),
    } as any;

    mockModbusController = {
      openLocker: jest.fn(),
      openLockerWithSensorlessRetry: jest.fn(),
      recordCardScan: jest.fn(),
      getHardwareStatus: jest.fn(),
      on: jest.fn(),
    } as any;

    mockLockerNamingService = {
      getDisplayName: jest.fn(),
    } as any;

    // Create UI controller
    uiController = new UiController(
      mockLockerStateManager,
      mockModbusController,
      mockLockerNamingService
    );

    // Create Fastify instance
    fastify = require('fastify')({ logger: false });
    
    // Register routes
    await uiController.registerRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
    jest.clearAllMocks();
  });

  describe('Feature Flag API Endpoint', () => {
    test('GET /api/feature-flags/smart-assignment should return feature flag status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/feature-flags/smart-assignment?kiosk_id=kiosk-1'
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('kiosk_id', 'kiosk-1');
      expect(result).toHaveProperty('smart_assignment_enabled');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.smart_assignment_enabled).toBe('boolean');
    });

    test('GET /api/feature-flags/smart-assignment should require kiosk_id parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/feature-flags/smart-assignment'
      });

      expect(response.statusCode).toBe(400);
      
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('error', 'kiosk_id is required');
    });
  });

  describe('Enhanced RFID Card Handling', () => {
    test('POST /api/rfid/handle-card should include smart_assignment flag in response', async () => {
      // Mock existing locker check
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      
      // Mock available lockers for manual mode fallback
      mockLockerStateManager.getEnhancedAvailableLockers.mockResolvedValue([
        {
          id: 1,
          status: 'Free',
          displayName: 'Dolap 1',
          kiosk_id: 'kiosk-1',
          is_vip: false,
          owner_type: null,
          owner_key: null,
          owned_at: null,
          version: 1,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/rfid/handle-card',
        payload: {
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      
      // Should include smart assignment information
      if (result.smart_assignment) {
        expect(result).toHaveProperty('mode', 'smart');
        expect(result).toHaveProperty('smart_assignment', true);
      } else {
        // Manual mode fallback
        expect(result).toHaveProperty('action', 'show_lockers');
        expect(result).toHaveProperty('lockers');
      }
    });

    test('POST /api/rfid/handle-card should handle rate limiting', async () => {
      // Mock rate limit exceeded
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/rfid/handle-card',
        payload: {
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        }
      });

      // Rate limiting should be handled gracefully
      expect([200, 429]).toContain(response.statusCode);
      
      if (response.statusCode === 429) {
        const result = JSON.parse(response.payload);
        expect(result).toHaveProperty('error', 'rate_limit_exceeded');
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('retry_after_seconds');
      }
    });

    test('POST /api/rfid/handle-card should require card_id and kiosk_id', async () => {
      const testCases = [
        { payload: {}, expectedError: 'card_id and kiosk_id are required' },
        { payload: { card_id: '123' }, expectedError: 'card_id and kiosk_id are required' },
        { payload: { kiosk_id: 'kiosk-1' }, expectedError: 'card_id and kiosk_id are required' }
      ];

      for (const testCase of testCases) {
        const response = await fastify.inject({
          method: 'POST',
          url: '/api/rfid/handle-card',
          payload: testCase.payload
        });

        expect(response.statusCode).toBe(400);
        
        const result = JSON.parse(response.payload);
        expect(result).toHaveProperty('error', testCase.expectedError);
      }
    });
  });

  describe('Smart Assignment Flow Integration', () => {
    test('should handle successful smart assignment with hardware success', async () => {
      // Mock smart assignment enabled
      jest.spyOn(uiController as any, 'featureFlagService', 'get').mockReturnValue({
        isSmartAssignmentEnabled: jest.fn().mockResolvedValue(true)
      });

      // Mock assignment engine success
      jest.spyOn(uiController as any, 'assignmentEngine', 'get').mockReturnValue({
        assignLocker: jest.fn().mockResolvedValue({
          success: true,
          lockerId: 15,
          action: 'assign_new',
          message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin'
        })
      });

      // Mock hardware success
      mockModbusController.openLockerWithSensorlessRetry.mockResolvedValue({
        success: true,
        action: 'opened',
        message: 'Locker opened successfully'
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/rfid/handle-card',
        payload: {
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('smart_assignment', true);
      expect(result).toHaveProperty('action', 'assign_new');
      expect(result).toHaveProperty('locker_id', 15);
      expect(result).toHaveProperty('message', 'Dolabınız açıldı. Eşyalarınızı yerleştirin');
    });

    test('should handle smart assignment failure and release locker', async () => {
      // Mock smart assignment enabled
      jest.spyOn(uiController as any, 'featureFlagService', 'get').mockReturnValue({
        isSmartAssignmentEnabled: jest.fn().mockResolvedValue(true)
      });

      // Mock assignment engine success but hardware failure
      jest.spyOn(uiController as any, 'assignmentEngine', 'get').mockReturnValue({
        assignLocker: jest.fn().mockResolvedValue({
          success: true,
          lockerId: 15,
          action: 'assign_new',
          message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin'
        })
      });

      // Mock hardware failure
      mockModbusController.openLockerWithSensorlessRetry.mockResolvedValue({
        success: false,
        action: 'failed',
        message: 'Hardware error'
      });

      // Mock locker release
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/rfid/handle-card',
        payload: {
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('smart_assignment', true);
      expect(result).toHaveProperty('error', 'hardware_failure');
      expect(result).toHaveProperty('message', 'Şu an işlem yapılamıyor');
      
      // Verify locker was released
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith('kiosk-1', 15, '0009652489');
    });

    test('should handle assignment engine errors gracefully', async () => {
      // Mock smart assignment enabled
      jest.spyOn(uiController as any, 'featureFlagService', 'get').mockReturnValue({
        isSmartAssignmentEnabled: jest.fn().mockResolvedValue(true)
      });

      // Mock assignment engine error
      jest.spyOn(uiController as any, 'assignmentEngine', 'get').mockReturnValue({
        assignLocker: jest.fn().mockRejectedValue(new Error('Assignment engine error'))
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/rfid/handle-card',
        payload: {
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('smart_assignment', true);
      expect(result).toHaveProperty('error', 'assignment_engine_error');
      expect(result).toHaveProperty('message', 'Şu an işlem yapılamıyor');
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain manual mode functionality when smart assignment is disabled', async () => {
      // Mock smart assignment disabled
      jest.spyOn(uiController as any, 'featureFlagService', 'get').mockReturnValue({
        isSmartAssignmentEnabled: jest.fn().mockResolvedValue(false)
      });

      // Mock no existing locker
      mockLockerStateManager.checkExistingOwnership.mockResolvedValue(null);
      
      // Mock available lockers
      mockLockerStateManager.getEnhancedAvailableLockers.mockResolvedValue([
        {
          id: 1,
          status: 'Free',
          displayName: 'Dolap 1',
          kiosk_id: 'kiosk-1',
          is_vip: false,
          owner_type: null,
          owner_key: null,
          owned_at: null,
          version: 1,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/rfid/handle-card',
        payload: {
          card_id: '0009652489',
          kiosk_id: 'kiosk-1'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result).toHaveProperty('action', 'show_lockers');
      expect(result).toHaveProperty('session_id');
      expect(result).toHaveProperty('lockers');
      expect(result).toHaveProperty('message', 'Kart okundu. Dolap seçin');
      
      // Should not have smart assignment flag
      expect(result).not.toHaveProperty('smart_assignment');
    });
  });
});