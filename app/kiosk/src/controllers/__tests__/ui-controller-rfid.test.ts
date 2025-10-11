import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { UiController } from '../ui-controller';
import type { LockerStateManager } from '../../../../../shared/services/locker-state-manager';
import type { ModbusController } from '../../hardware/modbus-controller';
import type { LockerNamingService } from '../../../../../shared/services/locker-naming-service';
import { ConfigManager } from '../../../../../shared/services/config-manager';

describe('UiController RFID normalization', () => {
  let uiController: UiController;

  beforeEach(() => {
    const mockConfigManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getKioskAssignmentMode: vi.fn(),
      getConfiguration: vi.fn().mockReturnValue({ features: {}, zones: [] }),
      getOpenOnlyWindowHours: vi.fn()
    } as unknown as ConfigManager;

    vi
      .spyOn(ConfigManager, 'getInstance')
      .mockReturnValue(mockConfigManager);

    const mockLockerStateManager = {
      handleHardwareError: vi.fn()
    } as unknown as LockerStateManager;
    const mockModbusController = {
      on: vi.fn().mockReturnThis()
    } as unknown as ModbusController;
    const mockLockerNamingService = {
      getDisplayName: vi.fn().mockResolvedValue('Dolap 1')
    } as unknown as LockerNamingService;

    uiController = new UiController(
      mockLockerStateManager,
      mockModbusController,
      mockLockerNamingService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ConfigManager.resetAllInstances();
  });

  it('treats leading-zero RFID UIDs as meeting minimum effective length', () => {
    const standardization = (uiController as any).standardizeCardId('0006851540');

    expect(standardization).toMatchObject({
      standardized: '0006851540',
      significantLength: 7,
      totalLength: 10,
      effectiveLength: 10
    });
  });

  it('normalizes leading-zero RFID UIDs without throwing short length errors', () => {
    const normalized = (uiController as any).normalizeCardId('placeholder', 'kiosk-1', '0006851540');

    const expectedOwnerKey = createHash('sha256')
      .update('0006851540')
      .digest('hex')
      .substring(0, 16);

    expect(normalized.ownerKey).toBe(expectedOwnerKey);
    expect(normalized.standardizedUid).toBe('0006851540');
    expect(normalized.effectiveLength).toBe(10);
    expect(normalized.significantLength).toBe(7);
  });

  it('rejects all-zero RFID inputs as too short', () => {
    try {
      (uiController as any).normalizeCardId('placeholder', 'kiosk-1', '00000000');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('SHORT_UID');
      expect(error.details).toMatchObject({
        standardized_uid_hex: '00000000',
        significant_length: 0,
        effective_length: 0,
        total_length: 8
      });
      return;
    }

    throw new Error('Expected normalizeCardId to throw for all-zero UID');
  });
});
