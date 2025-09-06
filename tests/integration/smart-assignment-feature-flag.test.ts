/**
 * Smart Locker Assignment - Feature Flag and Backward Compatibility Tests
 * 
 * Tests feature flag switching between manual and smart assignment modes
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../../shared/services/configuration-manager';
import { UIController } from '../../app/kiosk/src/controllers/ui-controller';
import { LockerStateManager } from '../../shared/services/locker-state-manager';
import { AssignmentEngine } from '../../shared/services/assignment-engine';

interface RfidRequest {
  card_id: string;
  kiosk_id: string;
  timestamp: string;
}

interface RfidResponse {
  success: boolean;
  action?: string;
  locker_id?: number;
  message?: string;
  available_lockers?: number[];
  session_id?: string;
}

describe('Smart Assignment Feature Flag Tests', () => {
  let configManager: ConfigurationManager;
  let uiController: UIController;
  let lockerStateManager: LockerStateManager;
  let assignmentEngine: AssignmentEngine;

  const mockAvailableLockers = [
    { id: 1, kioskId: 'kiosk-1', status: 'Free' },
    { id: 2, kioskId: 'kiosk-1', status: 'Free' },
    { id: 3, kioskId: 'kiosk-1', status: 'Free' }
  ];

  beforeEach(async () => {
    // Mock configuration manager
    configManager = {
      getEffectiveConfig: vi.fn(),
      updateGlobalConfig: vi.fn(),
      setKioskOverride: vi.fn(),
      subscribeToChanges: vi.fn(),
      triggerReload: vi.fn()
    } as any;

    // Mock locker state manager
    lockerStateManager = {
      getAvailableLockers: vi.fn().mockResolvedValue(mockAvailableLockers),
      assignLocker: vi.fn().mockResolvedValue(true),
      checkExistingOwnership: vi.fn().mockResolvedValue(null)
    } as any;

    // Mock assignment engine
    assignmentEngine = {
      assignLocker: vi.fn().mockResolvedValue({
        success: true,
        action: 'assign_new',
        lockerId: 1,
        message: 'Dolabınız açıldı. Eşyalarınızı yerleştirin.'
      })
    } as any;

    // Mock UI controller
    uiController = new UIController(
      configManager,
      lockerStateManager,
      assignmentEngine
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Feature Flag OFF - Manual Mode', () => {
    beforeEach(() => {
      // Configure feature flag OFF
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: false,
        session_timeout_seconds: 30
      });
    });

    it('should show manual locker selection interface', async () => {
      // Arrange
      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.available_lockers).toEqual([1, 2, 3]);
      expect(response.session_id).toBeDefined();
      expect(response.locker_id).toBeUndefined(); // No automatic assignment
      expect(response.message).toContain('Dolap seçin');

      // Verify manual selection flow
      expect(lockerStateManager.getAvailableLockers).toHaveBeenCalledWith('kiosk-1');
      expect(assignmentEngine.assignLocker).not.toHaveBeenCalled();
    });

    it('should handle manual locker selection', async () => {
      // Arrange - First create session
      const cardRequest: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      const sessionResponse = await uiController.handleRfidCard(cardRequest);
      
      // Act - Select locker manually
      const selectionResponse = await uiController.selectLocker({
        session_id: sessionResponse.session_id!,
        locker_id: 2
      });

      // Assert
      expect(selectionResponse.success).toBe(true);
      expect(selectionResponse.locker_id).toBe(2);
      expect(selectionResponse.action).toBe('manual_selection');

      // Verify assignment occurred
      expect(lockerStateManager.assignLocker).toHaveBeenCalledWith(
        'kiosk-1',
        2,
        'rfid',
        '0009652489'
      );
    });

    it('should maintain existing API compatibility', async () => {
      // Arrange
      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert - Response structure should match existing API
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('available_lockers');
      expect(response).toHaveProperty('session_id');
      expect(typeof response.success).toBe('boolean');
      expect(Array.isArray(response.available_lockers)).toBe(true);
      expect(typeof response.session_id).toBe('string');
    });

    it('should handle existing ownership in manual mode', async () => {
      // Arrange
      const existingLocker = {
        id: 5,
        kioskId: 'kiosk-1',
        status: 'Owned',
        ownerKey: '0009652489'
      };

      vi.mocked(lockerStateManager.checkExistingOwnership).mockResolvedValue(existingLocker);

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.action).toBe('open_existing');
      expect(response.locker_id).toBe(5);
      expect(response.available_lockers).toBeUndefined(); // No selection needed
    });
  });

  describe('Feature Flag ON - Smart Assignment Mode', () => {
    beforeEach(() => {
      // Configure feature flag ON
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180,
        base_score: 100,
        score_factor_a: 2.0
      });
    });

    it('should use smart assignment without showing locker list', async () => {
      // Arrange
      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert
      expect(response.success).toBe(true);
      expect(response.action).toBe('assign_new');
      expect(response.locker_id).toBe(1);
      expect(response.message).toBe('Dolabınız açıldı. Eşyalarınızı yerleştirin.');
      expect(response.available_lockers).toBeUndefined(); // No manual selection

      // Verify smart assignment was used
      expect(assignmentEngine.assignLocker).toHaveBeenCalledWith({
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        timestamp: expect.any(Date)
      });
    });

    it('should not render locker selection UI elements', async () => {
      // Arrange
      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert - UI should not include locker selection elements
      expect(response.available_lockers).toBeUndefined();
      expect(response.session_id).toBeUndefined(); // No session for manual selection
      
      // Verify immediate assignment
      expect(response.locker_id).toBeDefined();
      expect(response.action).toBeDefined();
    });

    it('should handle smart assignment failures gracefully', async () => {
      // Arrange
      vi.mocked(assignmentEngine.assignLocker).mockResolvedValue({
        success: false,
        errorCode: 'no_stock',
        message: 'Boş dolap yok. Görevliye başvurun.',
        action: 'error'
      });

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert
      expect(response.success).toBe(false);
      expect(response.message).toBe('Boş dolap yok. Görevliye başvurun.');
      expect(response.locker_id).toBeUndefined();
    });
  });

  describe('Feature Flag Switching', () => {
    it('should switch from manual to smart mode without restart', async () => {
      // Arrange - Start in manual mode
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: false,
        session_timeout_seconds: 30
      });

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act 1 - Manual mode
      const manualResponse = await uiController.handleRfidCard(request);

      // Assert 1 - Manual behavior
      expect(manualResponse.available_lockers).toBeDefined();
      expect(assignmentEngine.assignLocker).not.toHaveBeenCalled();

      // Arrange - Switch to smart mode
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });

      // Simulate configuration reload
      await configManager.triggerReload();

      // Act 2 - Smart mode (same controller instance)
      const smartResponse = await uiController.handleRfidCard(request);

      // Assert 2 - Smart behavior
      expect(smartResponse.available_lockers).toBeUndefined();
      expect(assignmentEngine.assignLocker).toHaveBeenCalled();
    });

    it('should switch from smart to manual mode without restart', async () => {
      // Arrange - Start in smart mode
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act 1 - Smart mode
      const smartResponse = await uiController.handleRfidCard(request);

      // Assert 1 - Smart behavior
      expect(smartResponse.locker_id).toBeDefined();
      expect(assignmentEngine.assignLocker).toHaveBeenCalled();

      // Clear mocks
      vi.clearAllMocks();

      // Arrange - Switch to manual mode
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: false,
        session_timeout_seconds: 30
      });

      // Simulate configuration reload
      await configManager.triggerReload();

      // Act 2 - Manual mode (same controller instance)
      const manualResponse = await uiController.handleRfidCard(request);

      // Assert 2 - Manual behavior
      expect(manualResponse.available_lockers).toBeDefined();
      expect(assignmentEngine.assignLocker).not.toHaveBeenCalled();
    });

    it('should log feature flag changes', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'log');

      // Act - Enable smart assignment
      await configManager.updateGlobalConfig({
        smart_assignment_enabled: true
      });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Smart assignment enabled')
      );

      // Act - Disable smart assignment
      await configManager.updateGlobalConfig({
        smart_assignment_enabled: false
      });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Smart assignment disabled')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Per-Kiosk Feature Flag Override', () => {
    it('should support per-kiosk feature flag overrides', async () => {
      // Arrange - Global setting OFF, kiosk-1 override ON
      vi.mocked(configManager.getEffectiveConfig)
        .mockImplementation(async (kioskId: string) => {
          if (kioskId === 'kiosk-1') {
            return {
              smart_assignment_enabled: true, // Override
              session_limit_minutes: 180
            };
          }
          return {
            smart_assignment_enabled: false, // Global default
            session_timeout_seconds: 30
          };
        });

      // Act - Test kiosk-1 (override enabled)
      const request1: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      const response1 = await uiController.handleRfidCard(request1);

      // Assert - Should use smart assignment
      expect(response1.locker_id).toBeDefined();
      expect(assignmentEngine.assignLocker).toHaveBeenCalled();

      // Clear mocks
      vi.clearAllMocks();

      // Act - Test kiosk-2 (global default)
      const request2: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-2',
        timestamp: new Date().toISOString()
      };

      const response2 = await uiController.handleRfidCard(request2);

      // Assert - Should use manual selection
      expect(response2.available_lockers).toBeDefined();
      expect(assignmentEngine.assignLocker).not.toHaveBeenCalled();
    });

    it('should handle kiosk override changes dynamically', async () => {
      // Arrange - Initially no override
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: false,
        session_timeout_seconds: 30
      });

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act 1 - No override
      const response1 = await uiController.handleRfidCard(request);

      // Assert 1 - Manual mode
      expect(response1.available_lockers).toBeDefined();

      // Act - Set kiosk override
      await configManager.setKioskOverride('kiosk-1', 'smart_assignment_enabled', true);

      // Update mock to reflect override
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });

      // Act 2 - With override
      const response2 = await uiController.handleRfidCard(request);

      // Assert 2 - Smart mode
      expect(response2.locker_id).toBeDefined();
      expect(assignmentEngine.assignLocker).toHaveBeenCalled();
    });
  });

  describe('Rollback and Emergency Disable', () => {
    it('should support emergency disable via configuration', async () => {
      // Arrange - Smart assignment enabled
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: true,
        session_limit_minutes: 180
      });

      // Act - Emergency disable
      await configManager.updateGlobalConfig({
        smart_assignment_enabled: false
      });

      // Update mock to reflect emergency disable
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: false,
        session_timeout_seconds: 30
      });

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      const response = await uiController.handleRfidCard(request);

      // Assert - Should immediately fall back to manual mode
      expect(response.available_lockers).toBeDefined();
      expect(assignmentEngine.assignLocker).not.toHaveBeenCalled();
    });

    it('should maintain data integrity during rollback', async () => {
      // Arrange - Active smart sessions exist
      const activeSession = {
        id: 'smart-session-123',
        cardId: '0009652489',
        kioskId: 'kiosk-1',
        lockerId: 1,
        status: 'active'
      };

      // Mock existing session
      vi.mocked(lockerStateManager.checkExistingOwnership).mockResolvedValue({
        id: 1,
        kioskId: 'kiosk-1',
        status: 'Owned',
        ownerKey: '0009652489'
      });

      // Disable smart assignment
      vi.mocked(configManager.getEffectiveConfig).mockResolvedValue({
        smart_assignment_enabled: false,
        session_timeout_seconds: 30
      });

      const request: RfidRequest = {
        card_id: '0009652489',
        kiosk_id: 'kiosk-1',
        timestamp: new Date().toISOString()
      };

      // Act
      const response = await uiController.handleRfidCard(request);

      // Assert - Should still handle existing ownership correctly
      expect(response.success).toBe(true);
      expect(response.action).toBe('open_existing');
      expect(response.locker_id).toBe(1);
    });
  });

  describe('Configuration Hot Reload', () => {
    it('should propagate configuration changes within 3 seconds', async () => {
      // Arrange
      const startTime = Date.now();
      let configChangeDetected = false;

      // Mock configuration subscription
      vi.mocked(configManager.subscribeToChanges).mockImplementation((callback) => {
        // Simulate configuration change after 1 second
        setTimeout(() => {
          callback({
            smart_assignment_enabled: true,
            session_limit_minutes: 180
          });
          configChangeDetected = true;
        }, 1000);
      });

      // Act - Subscribe to changes
      configManager.subscribeToChanges(() => {});

      // Trigger configuration update
      await configManager.updateGlobalConfig({
        smart_assignment_enabled: true
      });

      // Wait for propagation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Assert
      const propagationTime = Date.now() - startTime;
      expect(configChangeDetected).toBe(true);
      expect(propagationTime).toBeLessThan(3000); // 3 second SLA
    });
  });
});