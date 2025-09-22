import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseConnection } from '../../../../../shared/database/connection';
import { LockerStateManager } from '../../../../../shared/services/locker-state-manager';
import { LockerNamingService } from '../../../../../shared/services/locker-naming-service';
import { RfidUserFlow, RfidUserFlowConfig } from '../rfid-user-flow';
import { RfidScanEvent } from '../../../../../src/types/core-entities';

describe('RfidUserFlow integration - recent holder reassignment', () => {
  let db: DatabaseConnection;
  let lockerStateManager: LockerStateManager;
  let lockerNamingService: LockerNamingService;
  let modbusController: { openLocker: ReturnType<typeof vi.fn> };
  let configManager: {
    initialize: ReturnType<typeof vi.fn>;
    getKioskAssignmentMode: ReturnType<typeof vi.fn>;
    getRecentHolderMinHours: ReturnType<typeof vi.fn>;
  };

  const kioskId = 'integration-kiosk';
  const defaultConfig: RfidUserFlowConfig = {
    kiosk_id: kioskId,
    max_available_lockers_display: 10,
    opening_timeout_ms: 5000
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-01T12:00:00.000Z'));

    DatabaseConnection.resetInstance();
    DatabaseConnection.resetInstance(':memory:');
    db = DatabaseConnection.getInstance(':memory:');
    await db.waitForInitialization();

    await db.exec(`
      CREATE TABLE lockers (
        kiosk_id TEXT NOT NULL,
        id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Free',
        owner_type TEXT,
        owner_key TEXT,
        reserved_at DATETIME,
        owned_at DATETIME,
        version INTEGER NOT NULL DEFAULT 1,
        is_vip BOOLEAN NOT NULL DEFAULT 0,
        display_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (kiosk_id, id)
      )
    `);

    await db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        kiosk_id TEXT NOT NULL,
        locker_id INTEGER,
        event_type TEXT NOT NULL,
        rfid_card TEXT,
        device_id TEXT,
        staff_user TEXT,
        details TEXT
      )
    `);

    lockerStateManager = new LockerStateManager(db, { autoReleaseHoursOverride: null });
    lockerNamingService = new LockerNamingService(db);

    await lockerStateManager.initializeKioskLockers(kioskId, 4);

    modbusController = {
      openLocker: vi.fn().mockResolvedValue(true)
    } as any;

    configManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getKioskAssignmentMode: vi.fn().mockReturnValue('automatic'),
      getRecentHolderMinHours: vi.fn().mockReturnValue(2)
    };
  });

  afterEach(async () => {
    vi.useRealTimers();
    await lockerStateManager.shutdown();
    DatabaseConnection.resetInstance();
    DatabaseConnection.resetInstance(':memory:');
  });

  function createFlow(configOverrides: Partial<RfidUserFlowConfig> = {}): RfidUserFlow {
    return new RfidUserFlow(
      { ...defaultConfig, ...configOverrides },
      lockerStateManager,
      modbusController as any,
      lockerNamingService,
      configManager as any
    );
  }

  async function seedRecentRelease(cardId: string, lockerId: number, heldHours: number): Promise<void> {
    const baseNow = Date.now();
    const assignTime = new Date(baseNow - heldHours * 60 * 60 * 1000);
    vi.setSystemTime(assignTime);

    const assigned = await lockerStateManager.assignLocker(kioskId, lockerId, 'rfid', cardId);
    expect(assigned).toBe(true);
    const confirmed = await lockerStateManager.confirmOwnership(kioskId, lockerId);
    expect(confirmed).toBe(true);

    await db.run(
      `UPDATE lockers SET owned_at = ?, reserved_at = ?, updated_at = ? WHERE kiosk_id = ? AND id = ?`,
      [assignTime.toISOString(), assignTime.toISOString(), assignTime.toISOString(), kioskId, lockerId]
    );

    const releaseTime = new Date(assignTime.getTime() + heldHours * 60 * 60 * 1000);
    vi.setSystemTime(releaseTime);
    const released = await lockerStateManager.releaseLocker(kioskId, lockerId, cardId, 'rfid');
    expect(released).toBe(true);

    vi.setSystemTime(new Date(releaseTime.getTime() + 5 * 60 * 1000));
  }

  it('reassigns the previously held locker when the recent holder rule qualifies', async () => {
    const cardId = 'card-recent-owner';

    await seedRecentRelease(cardId, 2, 3);

    const flow = createFlow();
    const scanEvent: RfidScanEvent = {
      card_id: cardId,
      scan_time: new Date(),
      reader_id: 'integration-test'
    };

    const result = await flow.handleCardScanned(scanEvent);

    expect(configManager.getKioskAssignmentMode).toHaveBeenCalledWith(kioskId);
    expect(configManager.getRecentHolderMinHours).toHaveBeenCalled();
    expect(modbusController.openLocker).toHaveBeenCalledWith(2);

    expect(result.success).toBe(true);
    expect(result.action).toBe('open_locker');
    expect(result.opened_locker).toBe(2);
    expect(result.auto_assigned).toBe(true);
    expect(result.assignment_mode).toBe('automatic');
    expect(result.debug_logs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Card is recognized as the recent owner')
      ])
    );
  });

  it('falls back to the normal automatic selection when the previous locker is unavailable', async () => {
    const cardId = 'card-previous-busy';

    await seedRecentRelease(cardId, 1, 5);

    // Mark locker 1 as owned by someone else to make it unavailable
    const takeover = await lockerStateManager.assignLocker(kioskId, 1, 'rfid', 'other-card');
    expect(takeover).toBe(true);

    const flow = createFlow();
    const scanEvent: RfidScanEvent = {
      card_id: cardId,
      scan_time: new Date(),
      reader_id: 'integration-test'
    };

    const result = await flow.handleCardScanned(scanEvent);

    expect(result.success).toBe(true);
    expect(result.action).toBe('open_locker');
    expect(result.auto_assigned).toBe(true);
    expect(result.opened_locker).not.toBeNull();
    expect(result.opened_locker).not.toBe(1);
    expect(result.debug_logs).toEqual(
      expect.arrayContaining([
        'Card is not recognized as the recent owner. Assigning a new random locker.'
      ])
    );
  });
});
