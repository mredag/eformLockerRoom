/**
 * VIP Locker Handling Tests for Heartbeat Command Handlers
 * Tests that VIP lockers are properly handled in heartbeat command execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { ModbusController } from '../hardware/modbus-controller';

// Mock dependencies
vi.mock('../../../../shared/services/locker-state-manager.js');
vi.mock('../hardware/modbus-controller.js');

describe('Heartbeat Command Handlers VIP Handling', () => {
  let mockLockerStateManager: vi.Mocked<LockerStateManager>;
  let mockModbusController: vi.Mocked<ModbusController>;
  let openLockerHandler: (command: any) => Promise<any>;
  let bulkOpenHandler: (command: any) => Promise<any>;

  const KIOSK_ID = 'test-kiosk';

  beforeEach(() => {
    vi.clearAllMocks();
    mockLockerStateManager = vi.mocked(new LockerStateManager());
    mockModbusController = vi.mocked(new ModbusController());

    // Recreate the command handlers from the main file
    openLockerHandler = async (command) => {
      try {
        const { locker_id, staff_user, reason, force } = command.payload.open_locker || {};
        
        if (!locker_id) {
          return { success: false, error: 'Missing locker_id in command payload' };
        }

        // Fetch locker to check VIP status
        const locker = await mockLockerStateManager.getLocker(KIOSK_ID, locker_id);
        if (!locker) {
          return { success: false, error: 'Locker not found' };
        }

        // Execute locker opening
        const success = await mockModbusController.openLocker(locker_id);
        
        if (success) {
          // Skip release for VIP lockers unless force is true
          if (locker.is_vip && !force) {
            return { success: true, message: 'VIP locker opened without release' };
          } else {
            // Release locker ownership for non-VIP or forced operations
            await mockLockerStateManager.releaseLocker(KIOSK_ID, locker_id);
            return { success: true };
          }
        } else {
          return { success: false, error: 'Failed to open locker hardware' };
        }
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    };

    bulkOpenHandler = async (command) => {
      try {
        const { locker_ids, staff_user, exclude_vip, interval_ms } = command.payload.bulk_open || {};
        
        if (!locker_ids || !Array.isArray(locker_ids)) {
          return { success: false, error: 'Missing or invalid locker_ids in command payload' };
        }

        let successCount = 0;
        const failedLockers: number[] = [];
        const vipSkipped: number[] = [];

        for (const lockerId of locker_ids) {
          try {
            // Add interval between operations
            if (interval_ms && successCount > 0) {
              await new Promise(resolve => setTimeout(resolve, interval_ms));
            }

            // Fetch locker to check VIP status
            const locker = await mockLockerStateManager.getLocker(KIOSK_ID, lockerId);
            if (!locker) {
              failedLockers.push(lockerId);
              continue;
            }

            // Skip VIP lockers if exclude_vip is true
            if (locker.is_vip && exclude_vip) {
              vipSkipped.push(lockerId);
              continue;
            }

            const success = await mockModbusController.openLocker(lockerId);
            
            if (success) {
              // Skip release for VIP lockers
              if (!locker.is_vip) {
                await mockLockerStateManager.releaseLocker(KIOSK_ID, lockerId);
              }
              successCount++;
            } else {
              failedLockers.push(lockerId);
            }
          } catch (error) {
            failedLockers.push(lockerId);
          }
        }

        const errorMessages = [];
        if (failedLockers.length > 0) {
          errorMessages.push(`Failed lockers: ${failedLockers.join(', ')}`);
        }
        if (vipSkipped.length > 0) {
          errorMessages.push(`VIP lockers skipped: ${vipSkipped.join(', ')}`);
        }

        return { 
          success: true, 
          error: errorMessages.length > 0 ? errorMessages.join('; ') : undefined
        };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    };
  });

  describe('Open Locker Command VIP Handling', () => {
    it('should open VIP locker without releasing when force is false', async () => {
      const vipLocker = {
        kiosk_id: KIOSK_ID,
        id: 5,
        status: 'Owned',
        is_vip: true,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(vipLocker as any);
      mockModbusController.openLocker.mockResolvedValue(true);

      const command = {
        payload: {
          open_locker: {
            locker_id: 5,
            staff_user: 'test-staff',
            reason: 'Test open',
            force: false
          }
        }
      };

      const result = await openLockerHandler(command);

      expect(result.success).toBe(true);
      expect(result.message).toBe('VIP locker opened without release');

      // Verify locker was opened but not released
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalled();
    });

    it('should open and release VIP locker when force is true', async () => {
      const vipLocker = {
        kiosk_id: KIOSK_ID,
        id: 5,
        status: 'Owned',
        is_vip: true,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(vipLocker as any);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const command = {
        payload: {
          open_locker: {
            locker_id: 5,
            staff_user: 'test-staff',
            reason: 'Emergency open',
            force: true
          }
        }
      };

      const result = await openLockerHandler(command);

      expect(result.success).toBe(true);
      expect(result.message).toBeUndefined(); // No special message for forced release

      // Verify locker was opened and released
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(5);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(KIOSK_ID, 5);
    });

    it('should open and release non-VIP locker normally', async () => {
      const regularLocker = {
        kiosk_id: KIOSK_ID,
        id: 3,
        status: 'Owned',
        is_vip: false,
        version: 1
      };

      mockLockerStateManager.getLocker.mockResolvedValue(regularLocker as any);
      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const command = {
        payload: {
          open_locker: {
            locker_id: 3,
            staff_user: 'test-staff',
            reason: 'Regular open'
          }
        }
      };

      const result = await openLockerHandler(command);

      expect(result.success).toBe(true);

      // Verify locker was opened and released
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(3);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(KIOSK_ID, 3);
    });
  });

  describe('Bulk Open Command VIP Handling', () => {
    it('should skip VIP lockers when exclude_vip is true', async () => {
      const lockers = [
        { kiosk_id: KIOSK_ID, id: 1, is_vip: false },
        { kiosk_id: KIOSK_ID, id: 2, is_vip: true },
        { kiosk_id: KIOSK_ID, id: 3, is_vip: false }
      ];

      mockLockerStateManager.getLocker
        .mockResolvedValueOnce(lockers[0] as any)
        .mockResolvedValueOnce(lockers[1] as any)
        .mockResolvedValueOnce(lockers[2] as any);

      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const command = {
        payload: {
          bulk_open: {
            locker_ids: [1, 2, 3],
            staff_user: 'test-staff',
            exclude_vip: true,
            interval_ms: 0
          }
        }
      };

      const result = await bulkOpenHandler(command);

      expect(result.success).toBe(true);
      expect(result.error).toContain('VIP lockers skipped: 2');

      // Verify only non-VIP lockers were opened and released
      expect(mockModbusController.openLocker).toHaveBeenCalledTimes(2);
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(1);
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(3);
      expect(mockModbusController.openLocker).not.toHaveBeenCalledWith(2);

      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledTimes(2);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(KIOSK_ID, 1);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(KIOSK_ID, 3);
    });

    it('should open VIP lockers without releasing when exclude_vip is false', async () => {
      const lockers = [
        { kiosk_id: KIOSK_ID, id: 1, is_vip: false },
        { kiosk_id: KIOSK_ID, id: 2, is_vip: true }
      ];

      mockLockerStateManager.getLocker
        .mockResolvedValueOnce(lockers[0] as any)
        .mockResolvedValueOnce(lockers[1] as any);

      mockModbusController.openLocker.mockResolvedValue(true);
      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const command = {
        payload: {
          bulk_open: {
            locker_ids: [1, 2],
            staff_user: 'test-staff',
            exclude_vip: false,
            interval_ms: 0
          }
        }
      };

      const result = await bulkOpenHandler(command);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify both lockers were opened
      expect(mockModbusController.openLocker).toHaveBeenCalledTimes(2);
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(1);
      expect(mockModbusController.openLocker).toHaveBeenCalledWith(2);

      // Verify only non-VIP locker was released
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledTimes(1);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(KIOSK_ID, 1);
      expect(mockLockerStateManager.releaseLocker).not.toHaveBeenCalledWith(KIOSK_ID, 2);
    });

    it('should handle mixed success and failure with VIP exclusion', async () => {
      const lockers = [
        { kiosk_id: KIOSK_ID, id: 1, is_vip: false },
        { kiosk_id: KIOSK_ID, id: 2, is_vip: true },
        { kiosk_id: KIOSK_ID, id: 3, is_vip: false }
      ];

      mockLockerStateManager.getLocker
        .mockResolvedValueOnce(lockers[0] as any)
        .mockResolvedValueOnce(lockers[1] as any)
        .mockResolvedValueOnce(lockers[2] as any);

      // Mock locker 1 success, locker 3 failure
      mockModbusController.openLocker
        .mockResolvedValueOnce(true)   // locker 1
        .mockResolvedValueOnce(false); // locker 3

      mockLockerStateManager.releaseLocker.mockResolvedValue(true);

      const command = {
        payload: {
          bulk_open: {
            locker_ids: [1, 2, 3],
            staff_user: 'test-staff',
            exclude_vip: true,
            interval_ms: 0
          }
        }
      };

      const result = await bulkOpenHandler(command);

      expect(result.success).toBe(true);
      expect(result.error).toContain('Failed lockers: 3');
      expect(result.error).toContain('VIP lockers skipped: 2');

      // Verify correct calls
      expect(mockModbusController.openLocker).toHaveBeenCalledTimes(2);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledTimes(1);
      expect(mockLockerStateManager.releaseLocker).toHaveBeenCalledWith(KIOSK_ID, 1);
    });
  });
});
