import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventLogger } from '../event-logger';
import { EventRepository } from '../../database/event-repository';
import { EventType } from '../../types/core-entities';

// Mock EventRepository
const mockEventRepository = {
  create: vi.fn(),
  findAll: vi.fn(),
  getStatistics: vi.fn(),
  findStaffActions: vi.fn(),
  cleanupOldEvents: vi.fn()
} as unknown as EventRepository;

describe('EventLogger', () => {
  let eventLogger: EventLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    eventLogger = new EventLogger(mockEventRepository);
  });

  describe('System Events', () => {
    it('should log system restart event with valid details', async () => {
      const mockEvent = {
        id: 1,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.SYSTEM_RESTARTED,
        details: {
          previous_uptime: 86400000,
          restart_reason: 'scheduled_maintenance',
          config_version: '1.2.3',
          pending_commands_cleared: 5
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logSystemRestart('kiosk-1', {
        previous_uptime: 86400000,
        restart_reason: 'scheduled_maintenance',
        config_version: '1.2.3',
        pending_commands_cleared: 5
      });

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        kiosk_id: 'kiosk-1',
        event_type: EventType.SYSTEM_RESTARTED,
        details: {
          previous_uptime: 86400000,
          restart_reason: 'scheduled_maintenance',
          config_version: '1.2.3',
          pending_commands_cleared: 5
        },
        locker_id: undefined,
        rfid_card: undefined,
        device_id: undefined,
        staff_user: undefined
      });

      expect(result).toEqual(mockEvent);
    });

    it('should log system restart with minimal details', async () => {
      const mockEvent = {
        id: 1,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.SYSTEM_RESTARTED,
        details: {}
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logSystemRestart('kiosk-1');

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        kiosk_id: 'kiosk-1',
        event_type: EventType.SYSTEM_RESTARTED,
        details: {},
        locker_id: undefined,
        rfid_card: undefined,
        device_id: undefined,
        staff_user: undefined
      });
    });
  });

  describe('RFID Events', () => {
    it('should log RFID assignment with valid details', async () => {
      const mockEvent = {
        id: 2,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        event_type: EventType.RFID_ASSIGN,
        rfid_card: 'card123',
        details: {
          previous_status: 'Free',
          burst_required: false,
          assignment_duration_ms: 1500
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logRfidAssign('kiosk-1', 5, 'card123', {
        previous_status: 'Free',
        burst_required: false,
        assignment_duration_ms: 1500
      });

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        event_type: EventType.RFID_ASSIGN,
        rfid_card: 'card123',
        device_id: undefined,
        staff_user: undefined,
        details: {
          previous_status: 'Free',
          burst_required: false,
          assignment_duration_ms: 1500
        }
      });
    });

    it('should accept RFID assignment without optional duration metadata', async () => {
      vi.mocked(mockEventRepository.create).mockResolvedValue({
        id: 3,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        event_type: EventType.RFID_ASSIGN,
        rfid_card: 'card123',
        details: {
          previous_status: 'Free',
          burst_required: false
        }
      } as any);

      await expect(
        eventLogger.logRfidAssign('kiosk-1', 5, 'card123', {
          previous_status: 'Free',
          burst_required: false
        })
      ).resolves.toBeDefined();

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        event_type: EventType.RFID_ASSIGN,
        rfid_card: 'card123',
        device_id: undefined,
        staff_user: undefined,
        details: {
          previous_status: 'Free',
          burst_required: false
        }
      });
    });

    it('should reject RFID assignment when required details are missing', async () => {
      await expect(
        eventLogger.logRfidAssign('kiosk-1', 5, 'card123', {
          burst_required: false
        } as any)
      ).rejects.toThrow('Event validation failed');
    });

    it('should log RFID release with valid details', async () => {
      const mockEvent = {
        id: 3,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        event_type: EventType.RFID_RELEASE,
        rfid_card: 'card123',
        details: {
          ownership_duration_ms: 3600000,
          release_method: 'scan'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logRfidRelease('kiosk-1', 5, 'card123', {
        ownership_duration_ms: 3600000,
        release_method: 'scan'
      });

      expect(result).toEqual(mockEvent);
    });

    it('should validate release method enum', async () => {
      await expect(
        eventLogger.logRfidRelease('kiosk-1', 5, 'card123', {
          ownership_duration_ms: 3600000,
          release_method: 'invalid_method' as any
        })
      ).rejects.toThrow('Event validation failed');
    });
  });

  describe('QR Events', () => {
    it('should log QR assignment with device hash', async () => {
      const mockEvent = {
        id: 4,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 3,
        event_type: EventType.QR_ASSIGN,
        device_id: 'device123',
        details: {
          device_hash: 'hash_abc123',
          action: 'assign',
          ip_address: 'hash_def456',
          user_agent: 'Mozilla/5.0...',
          token_used: true
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logQrAccess('kiosk-1', 3, 'device123', 'assign', {
        device_hash: 'hash_abc123',
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0...',
        token_used: true
      });

      expect(mockEventRepository.create).toHaveBeenCalledWith({
        kiosk_id: 'kiosk-1',
        locker_id: 3,
        event_type: EventType.QR_ASSIGN,
        device_id: 'device123',
        rfid_card: undefined,
        staff_user: undefined,
        details: {
          device_hash: 'hash_abc123',
          action: 'assign',
          ip_address: expect.stringMatching(/^hash_/),
          user_agent: 'Mozilla/5.0...',
          token_used: true
        }
      });
    });

    it('should log QR release event', async () => {
      const mockEvent = {
        id: 5,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 3,
        event_type: EventType.QR_RELEASE,
        device_id: 'device123',
        details: {
          device_hash: 'hash_abc123',
          action: 'release'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logQrAccess('kiosk-1', 3, 'device123', 'release', {
        device_hash: 'hash_abc123'
      });

      expect(result).toEqual(mockEvent);
    });
  });

  describe('Staff Events', () => {
    it('should log staff open operation', async () => {
      const mockEvent = {
        id: 6,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 7,
        event_type: EventType.STAFF_OPEN,
        staff_user: 'admin1',
        details: {
          reason: 'User assistance',
          override: true,
          locker_id: 7,
          previous_status: 'Owned'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logStaffOperation(
        'kiosk-1',
        EventType.STAFF_OPEN,
        'admin1',
        {
          reason: 'User assistance',
          override: true,
          locker_id: 7,
          previous_status: 'Owned'
        }
      );

      expect(result).toEqual(mockEvent);
    });

    it('should require staff_user for staff events', async () => {
      await expect(
        eventLogger.logEvent('kiosk-1', EventType.STAFF_OPEN, {
          reason: 'Test'
        })
      ).rejects.toThrow('Staff event staff_open requires staff_user field');
    });

    it('should log bulk operation with statistics', async () => {
      const mockEvent = {
        id: 7,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.BULK_OPEN,
        staff_user: 'admin1',
        details: {
          total_count: 10,
          success_count: 8,
          failed_lockers: [3, 7],
          execution_time_ms: 5000,
          exclude_vip: true
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logBulkOperation('kiosk-1', 'admin1', {
        total_count: 10,
        success_count: 8,
        failed_lockers: [3, 7],
        execution_time_ms: 5000,
        exclude_vip: true
      });

      expect(result).toEqual(mockEvent);
    });

    it('should log master PIN usage', async () => {
      const mockEvent = {
        id: 8,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 5,
        event_type: EventType.MASTER_PIN_USED,
        details: {
          pin_attempts: 2,
          success: true,
          lockout_triggered: false
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logMasterPinUsage('kiosk-1', 5, {
        pin_attempts: 2,
        success: true,
        lockout_triggered: false
      });

      expect(result).toEqual(mockEvent);
    });
  });

  describe('VIP Events', () => {
    it('should log VIP contract creation', async () => {
      const mockEvent = {
        id: 9,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        locker_id: 10,
        event_type: EventType.VIP_CONTRACT_CREATED,
        rfid_card: 'vip_card123',
        staff_user: 'admin1',
        details: {
          contract_id: 1,
          locker_id: 10,
          rfid_card: 'vip_card123',
          duration_months: 6
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logVipContractOperation(
        'kiosk-1',
        EventType.VIP_CONTRACT_CREATED,
        'admin1',
        {
          contract_id: 1,
          locker_id: 10,
          rfid_card: 'vip_card123',
          duration_months: 6
        }
      );

      expect(result).toEqual(mockEvent);
    });

    it('should log VIP transfer request', async () => {
      const mockEvent = {
        id: 10,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.VIP_TRANSFER_REQUESTED,
        staff_user: 'admin1',
        details: {
          transfer_id: 1,
          contract_id: 1,
          from_kiosk_id: 'kiosk-1',
          from_locker_id: 10,
          to_kiosk_id: 'kiosk-2',
          to_locker_id: 5,
          new_rfid_card: 'new_vip_card456',
          reason: 'Room change request'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logVipTransferOperation(
        'kiosk-1',
        EventType.VIP_TRANSFER_REQUESTED,
        'admin1',
        {
          transfer_id: 1,
          contract_id: 1,
          from_kiosk_id: 'kiosk-1',
          from_locker_id: 10,
          to_kiosk_id: 'kiosk-2',
          to_locker_id: 5,
          new_rfid_card: 'new_vip_card456',
          reason: 'Room change request'
        }
      );

      expect(result).toEqual(mockEvent);
    });
  });

  describe('Kiosk Status Events', () => {
    it('should log kiosk online event', async () => {
      const mockEvent = {
        id: 11,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.KIOSK_ONLINE,
        details: {
          previous_status: 'offline',
          version: '1.2.3'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logKioskStatusChange(
        'kiosk-1',
        EventType.KIOSK_ONLINE,
        {
          previous_status: 'offline',
          version: '1.2.3'
        }
      );

      expect(result).toEqual(mockEvent);
    });

    it('should log kiosk offline event', async () => {
      const mockEvent = {
        id: 12,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.KIOSK_OFFLINE,
        details: {
          previous_status: 'online',
          offline_duration_ms: 30000,
          last_heartbeat: '2024-01-01T12:00:00Z'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      const result = await eventLogger.logKioskStatusChange(
        'kiosk-1',
        EventType.KIOSK_OFFLINE,
        {
          previous_status: 'online',
          offline_duration_ms: 30000,
          last_heartbeat: '2024-01-01T12:00:00Z'
        }
      );

      expect(result).toEqual(mockEvent);
    });
  });

  describe('Query and Statistics', () => {
    it('should query events with filters', async () => {
      const mockEvents = [
        { id: 1, event_type: EventType.RFID_ASSIGN },
        { id: 2, event_type: EventType.STAFF_OPEN }
      ];

      vi.mocked(mockEventRepository.findAll).mockResolvedValue(mockEvents as any);

      const result = await eventLogger.queryEvents({
        kiosk_id: 'kiosk-1',
        event_types: [EventType.RFID_ASSIGN, EventType.STAFF_OPEN],
        from_date: new Date('2024-01-01'),
        to_date: new Date('2024-01-31'),
        limit: 100
      });

      expect(mockEventRepository.findAll).toHaveBeenCalledWith({
        kiosk_id: 'kiosk-1',
        event_type: [EventType.RFID_ASSIGN, EventType.STAFF_OPEN],
        from_date: new Date('2024-01-01'),
        to_date: new Date('2024-01-31'),
        limit: 100,
        locker_id: undefined,
        staff_user: undefined,
        offset: undefined
      });

      expect(result).toEqual(mockEvents);
    });

    it('should get event statistics', async () => {
      const mockStats = {
        total: 100,
        by_type: { 'rfid_assign': 50, 'staff_open': 30 },
        by_kiosk: { 'kiosk-1': 60, 'kiosk-2': 40 },
        staff_actions: 30,
        user_actions: 60,
        system_events: 10
      };

      vi.mocked(mockEventRepository.getStatistics).mockResolvedValue(mockStats);

      const result = await eventLogger.getEventStatistics(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(mockEventRepository.getStatistics).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toEqual(mockStats);
    });

    it('should get staff audit trail', async () => {
      const mockAuditTrail = [
        { id: 1, event_type: EventType.STAFF_OPEN, staff_user: 'admin1' },
        { id: 2, event_type: EventType.BULK_OPEN, staff_user: 'admin1' }
      ];

      vi.mocked(mockEventRepository.findStaffActions).mockResolvedValue(mockAuditTrail as any);

      const result = await eventLogger.getStaffAuditTrail(
        'admin1',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(mockEventRepository.findStaffActions).toHaveBeenCalledWith(
        'admin1',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toEqual(mockAuditTrail);
    });

    it('should cleanup old events', async () => {
      vi.mocked(mockEventRepository.cleanupOldEvents).mockResolvedValue(50);

      const result = await eventLogger.cleanupOldEvents(30);

      expect(mockEventRepository.cleanupOldEvents).toHaveBeenCalledWith(30);
      expect(result).toBe(50);
    });
  });

  describe('Data Sanitization', () => {
    it('should hash IP addresses in event details', async () => {
      const mockEvent = {
        id: 13,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.QR_ASSIGN,
        details: {
          device_hash: 'hash_abc123',
          action: 'assign',
          ip_address: 'hash_def456'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      await eventLogger.logQrAccess('kiosk-1', 3, 'device123', 'assign', {
        device_hash: 'hash_abc123',
        ip_address: '192.168.1.100'
      });

      expect(mockEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            ip_address: expect.stringMatching(/^hash_/)
          })
        })
      );
    });

    it('should truncate long user agent strings', async () => {
      const longUserAgent = 'A'.repeat(150);
      const mockEvent = {
        id: 14,
        timestamp: new Date(),
        kiosk_id: 'kiosk-1',
        event_type: EventType.QR_ASSIGN,
        details: {
          device_hash: 'hash_abc123',
          action: 'assign',
          user_agent: 'A'.repeat(100) + '...'
        }
      };

      vi.mocked(mockEventRepository.create).mockResolvedValue(mockEvent as any);

      await eventLogger.logQrAccess('kiosk-1', 3, 'device123', 'assign', {
        device_hash: 'hash_abc123',
        user_agent: longUserAgent
      });

      expect(mockEventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            user_agent: expect.stringMatching(/^A{100}\.\.\.$/)
          })
        })
      );
    });
  });

  describe('Validation Errors', () => {
    it('should reject events with invalid field types', async () => {
      await expect(
        eventLogger.logRfidAssign('kiosk-1', 5, 'card123', {
          previous_status: 'Free',
          burst_required: 'not_boolean' as any // Invalid type
        })
      ).rejects.toThrow('Event validation failed');
    });

    it('should reject events with missing required fields', async () => {
      await expect(
        eventLogger.logBulkOperation('kiosk-1', 'admin1', {
          total_count: 10,
          // Missing required fields
        } as any)
      ).rejects.toThrow('Event validation failed');
    });

    it('should reject events with invalid enum values', async () => {
      await expect(
        eventLogger.logRfidRelease('kiosk-1', 5, 'card123', {
          ownership_duration_ms: 3600000,
          release_method: 'invalid' as any
        })
      ).rejects.toThrow('Event validation failed');
    });
  });
});
