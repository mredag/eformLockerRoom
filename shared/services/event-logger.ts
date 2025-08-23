import { EventRepository } from '../database/event-repository';
import { Event, EventType, EventDetails, ValidationResult, ValidationError } from '../types/core-entities';

/**
 * Comprehensive Event Logging System
 * Implements standardized event types with schema validation
 * Requirements: 8.4, 9.3
 */
export class EventLogger {
  private eventRepository: EventRepository;
  private validationSchemas: Map<EventType, EventSchema>;

  constructor(eventRepository: EventRepository) {
    this.eventRepository = eventRepository;
    this.validationSchemas = new Map();
    this.initializeSchemas();
  }

  /**
   * Log a system restart event
   */
  async logSystemRestart(kioskId: string, details: {
    previous_uptime?: number;
    restart_reason?: string;
    config_version?: string;
    pending_commands_cleared?: number;
  } = {}): Promise<Event> {
    return this.logEvent(kioskId, EventType.SYSTEM_RESTARTED, details);
  }

  /**
   * Log RFID assignment event
   */
  async logRfidAssign(
    kioskId: string,
    lockerId: number,
    rfidCard: string,
    details: {
      previous_status: string;
      burst_required: boolean;
      assignment_duration_ms?: number;
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      EventType.RFID_ASSIGN,
      details,
      lockerId,
      rfidCard
    );
  }

  /**
   * Log RFID release event
   */
  async logRfidRelease(
    kioskId: string,
    lockerId: number,
    rfidCard: string,
    details: {
      ownership_duration_ms: number;
      release_method: 'scan' | 'timeout' | 'staff_override';
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      EventType.RFID_RELEASE,
      details,
      lockerId,
      rfidCard
    );
  }

  /**
   * Log QR code access event
   */
  async logQrAccess(
    kioskId: string,
    lockerId: number,
    deviceId: string,
    action: 'assign' | 'release',
    details: {
      device_hash: string;
      ip_address?: string;
      user_agent?: string;
      token_used?: boolean;
    }
  ): Promise<Event> {
    const eventType = action === 'assign' ? EventType.QR_ASSIGN : EventType.QR_RELEASE;
    return this.logEvent(
      kioskId,
      eventType,
      { ...details, action },
      lockerId,
      undefined,
      deviceId
    );
  }

  /**
   * Log staff operation
   */
  async logStaffOperation(
    kioskId: string,
    eventType: EventType.STAFF_OPEN | EventType.STAFF_BLOCK | EventType.STAFF_UNBLOCK,
    staffUser: string,
    details: {
      reason: string;
      override?: boolean;
      locker_id?: number;
      previous_status?: string;
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      eventType,
      details,
      details.locker_id,
      undefined,
      undefined,
      staffUser
    );
  }

  /**
   * Log bulk operation
   */
  async logBulkOperation(
    kioskId: string,
    staffUser: string,
    details: {
      total_count: number;
      success_count: number;
      failed_lockers: number[];
      execution_time_ms: number;
      exclude_vip: boolean;
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      EventType.BULK_OPEN,
      details,
      undefined,
      undefined,
      undefined,
      staffUser
    );
  }

  /**
   * Log master PIN usage
   */
  async logMasterPinUsage(
    kioskId: string,
    lockerId: number,
    details: {
      pin_attempts: number;
      success: boolean;
      lockout_triggered?: boolean;
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      EventType.MASTER_PIN_USED,
      details,
      lockerId
    );
  }

  /**
   * Log VIP contract operations
   */
  async logVipContractOperation(
    kioskId: string,
    eventType: EventType.VIP_CONTRACT_CREATED | EventType.VIP_CONTRACT_EXTENDED | EventType.VIP_CONTRACT_CANCELLED,
    staffUser: string,
    details: {
      contract_id: number;
      locker_id: number;
      rfid_card: string;
      duration_months?: number;
      reason?: string;
      old_end_date?: string;
      new_end_date?: string;
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      eventType,
      details,
      details.locker_id,
      details.rfid_card,
      undefined,
      staffUser
    );
  }

  /**
   * Log VIP transfer operations
   */
  async logVipTransferOperation(
    kioskId: string,
    eventType: EventType.VIP_TRANSFER_REQUESTED | EventType.VIP_TRANSFER_APPROVED | EventType.VIP_TRANSFER_REJECTED | EventType.VIP_TRANSFER_COMPLETED,
    staffUser: string,
    details: {
      transfer_id: number;
      contract_id: number;
      from_kiosk_id: string;
      from_locker_id: number;
      to_kiosk_id: string;
      to_locker_id: number;
      new_rfid_card?: string;
      reason: string;
      rejection_reason?: string;
    }
  ): Promise<Event> {
    return this.logEvent(
      kioskId,
      eventType,
      details,
      undefined,
      details.new_rfid_card,
      undefined,
      staffUser
    );
  }

  /**
   * Log kiosk status changes
   */
  async logKioskStatusChange(
    kioskId: string,
    eventType: EventType.KIOSK_ONLINE | EventType.KIOSK_OFFLINE,
    details: {
      previous_status?: string;
      offline_duration_ms?: number;
      version?: string;
      last_heartbeat?: string;
    }
  ): Promise<Event> {
    return this.logEvent(kioskId, eventType, details);
  }

  /**
   * Generic event logging with validation
   */
  async logEvent(
    kioskId: string,
    eventType: EventType,
    details: Record<string, any> = {},
    lockerId?: number,
    rfidCard?: string,
    deviceId?: string,
    staffUser?: string
  ): Promise<Event> {
    // Validate event details against schema
    const validationResult = this.validateEventDetails(eventType, details);
    if (!validationResult.valid) {
      throw new Error(`Event validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Validate staff operations have staff_user
    if (this.isStaffEvent(eventType) && !staffUser) {
      throw new Error(`Staff event ${eventType} requires staff_user field`);
    }

    // Hash sensitive data in details
    const sanitizedDetails = this.sanitizeEventDetails(details, deviceId);

    return this.eventRepository.create({
      kiosk_id: kioskId,
      locker_id: lockerId,
      event_type: eventType,
      rfid_card: rfidCard,
      device_id: deviceId,
      staff_user: staffUser,
      details: sanitizedDetails
    });
  }

  /**
   * Query events with filtering
   */
  async queryEvents(filter: {
    kiosk_id?: string;
    locker_id?: number;
    event_types?: EventType[];
    staff_user?: string;
    from_date?: Date;
    to_date?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Event[]> {
    return this.eventRepository.findAll({
      kiosk_id: filter.kiosk_id,
      locker_id: filter.locker_id,
      event_type: filter.event_types,
      staff_user: filter.staff_user,
      from_date: filter.from_date,
      to_date: filter.to_date,
      limit: filter.limit,
      offset: filter.offset
    });
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(fromDate?: Date, toDate?: Date): Promise<{
    total: number;
    by_type: Record<string, number>;
    by_kiosk: Record<string, number>;
    staff_actions: number;
    user_actions: number;
    system_events: number;
  }> {
    return this.eventRepository.getStatistics(fromDate, toDate);
  }

  /**
   * Get staff audit trail
   */
  async getStaffAuditTrail(staffUser?: string, fromDate?: Date, toDate?: Date): Promise<Event[]> {
    return this.eventRepository.findStaffActions(staffUser, fromDate, toDate);
  }

  /**
   * Clean up old events
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    return this.eventRepository.cleanupOldEvents(retentionDays);
  }

  /**
   * Initialize validation schemas for event types
   */
  private initializeSchemas(): void {
    // System events
    this.validationSchemas.set(EventType.SYSTEM_RESTARTED, {
      optional: ['previous_uptime', 'restart_reason', 'config_version', 'pending_commands_cleared'],
      types: {
        previous_uptime: 'number',
        restart_reason: 'string',
        config_version: 'string',
        pending_commands_cleared: 'number'
      }
    });

    // RFID events
    this.validationSchemas.set(EventType.RFID_ASSIGN, {
      required: ['previous_status', 'burst_required'],
      optional: ['assignment_duration_ms'],
      types: {
        previous_status: 'string',
        burst_required: 'boolean',
        assignment_duration_ms: 'number'
      }
    });

    this.validationSchemas.set(EventType.RFID_RELEASE, {
      required: ['ownership_duration_ms', 'release_method'],
      types: {
        ownership_duration_ms: 'number',
        release_method: 'string'
      },
      enums: {
        release_method: ['scan', 'timeout', 'staff_override']
      }
    });

    // QR events
    this.validationSchemas.set(EventType.QR_ASSIGN, {
      required: ['device_hash', 'action'],
      optional: ['ip_address', 'user_agent', 'token_used'],
      types: {
        device_hash: 'string',
        action: 'string',
        ip_address: 'string',
        user_agent: 'string',
        token_used: 'boolean'
      },
      enums: {
        action: ['assign', 'release']
      }
    });

    this.validationSchemas.set(EventType.QR_RELEASE, {
      required: ['device_hash', 'action'],
      optional: ['ip_address', 'user_agent', 'token_used'],
      types: {
        device_hash: 'string',
        action: 'string',
        ip_address: 'string',
        user_agent: 'string',
        token_used: 'boolean'
      },
      enums: {
        action: ['assign', 'release']
      }
    });

    // Staff events
    this.validationSchemas.set(EventType.STAFF_OPEN, {
      required: ['reason'],
      optional: ['override', 'locker_id', 'previous_status'],
      types: {
        reason: 'string',
        override: 'boolean',
        locker_id: 'number',
        previous_status: 'string'
      }
    });

    this.validationSchemas.set(EventType.STAFF_BLOCK, {
      required: ['reason'],
      optional: ['locker_id', 'previous_status'],
      types: {
        reason: 'string',
        locker_id: 'number',
        previous_status: 'string'
      }
    });

    this.validationSchemas.set(EventType.STAFF_UNBLOCK, {
      required: ['reason'],
      optional: ['locker_id', 'previous_status'],
      types: {
        reason: 'string',
        locker_id: 'number',
        previous_status: 'string'
      }
    });

    this.validationSchemas.set(EventType.BULK_OPEN, {
      required: ['total_count', 'success_count', 'failed_lockers', 'execution_time_ms', 'exclude_vip'],
      types: {
        total_count: 'number',
        success_count: 'number',
        failed_lockers: 'array',
        execution_time_ms: 'number',
        exclude_vip: 'boolean'
      }
    });

    this.validationSchemas.set(EventType.MASTER_PIN_USED, {
      required: ['pin_attempts', 'success'],
      optional: ['lockout_triggered'],
      types: {
        pin_attempts: 'number',
        success: 'boolean',
        lockout_triggered: 'boolean'
      }
    });

    // VIP events
    this.validationSchemas.set(EventType.VIP_CONTRACT_CREATED, {
      required: ['contract_id', 'locker_id', 'rfid_card'],
      optional: ['duration_months'],
      types: {
        contract_id: 'number',
        locker_id: 'number',
        rfid_card: 'string',
        duration_months: 'number'
      }
    });

    this.validationSchemas.set(EventType.VIP_CONTRACT_EXTENDED, {
      required: ['contract_id', 'locker_id', 'rfid_card'],
      optional: ['old_end_date', 'new_end_date'],
      types: {
        contract_id: 'number',
        locker_id: 'number',
        rfid_card: 'string',
        old_end_date: 'string',
        new_end_date: 'string'
      }
    });

    this.validationSchemas.set(EventType.VIP_CONTRACT_CANCELLED, {
      required: ['contract_id', 'locker_id', 'rfid_card', 'reason'],
      types: {
        contract_id: 'number',
        locker_id: 'number',
        rfid_card: 'string',
        reason: 'string'
      }
    });

    // VIP transfer events
    this.validationSchemas.set(EventType.VIP_TRANSFER_REQUESTED, {
      required: ['transfer_id', 'contract_id', 'from_kiosk_id', 'from_locker_id', 'to_kiosk_id', 'to_locker_id', 'reason'],
      optional: ['new_rfid_card'],
      types: {
        transfer_id: 'number',
        contract_id: 'number',
        from_kiosk_id: 'string',
        from_locker_id: 'number',
        to_kiosk_id: 'string',
        to_locker_id: 'number',
        new_rfid_card: 'string',
        reason: 'string'
      }
    });

    // Kiosk status events
    this.validationSchemas.set(EventType.KIOSK_ONLINE, {
      optional: ['previous_status', 'version'],
      types: {
        previous_status: 'string',
        version: 'string'
      }
    });

    this.validationSchemas.set(EventType.KIOSK_OFFLINE, {
      optional: ['previous_status', 'offline_duration_ms', 'last_heartbeat'],
      types: {
        previous_status: 'string',
        offline_duration_ms: 'number',
        last_heartbeat: 'string'
      }
    });
  }

  /**
   * Validate event details against schema
   */
  private validateEventDetails(eventType: EventType, details: Record<string, any>): ValidationResult {
    const schema = this.validationSchemas.get(eventType);
    const errors: ValidationError[] = [];

    if (!schema) {
      // No schema defined, allow any details
      return { valid: true, errors: [] };
    }

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in details)) {
          errors.push({
            field,
            message: `Required field '${field}' is missing`,
            value: undefined
          });
        }
      }
    }

    // Check field types
    if (schema.types) {
      for (const [field, expectedType] of Object.entries(schema.types)) {
        if (field in details) {
          const value = details[field];
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          
          if (actualType !== expectedType) {
            errors.push({
              field,
              message: `Field '${field}' should be of type '${expectedType}', got '${actualType}'`,
              value
            });
          }
        }
      }
    }

    // Check enum values
    if (schema.enums) {
      for (const [field, allowedValues] of Object.entries(schema.enums)) {
        if (field in details) {
          const value = details[field];
          if (!allowedValues.includes(value)) {
            errors.push({
              field,
              message: `Field '${field}' must be one of: ${allowedValues.join(', ')}`,
              value
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if event type is a staff event
   */
  private isStaffEvent(eventType: EventType): boolean {
    const staffEvents = [
      EventType.STAFF_OPEN,
      EventType.STAFF_BLOCK,
      EventType.STAFF_UNBLOCK,
      EventType.BULK_OPEN,
      EventType.VIP_CONTRACT_CREATED,
      EventType.VIP_CONTRACT_EXTENDED,
      EventType.VIP_CONTRACT_CANCELLED,
      EventType.VIP_TRANSFER_REQUESTED,
      EventType.VIP_TRANSFER_APPROVED,
      EventType.VIP_TRANSFER_REJECTED,
      EventType.VIP_TRANSFER_COMPLETED
    ];
    
    return staffEvents.includes(eventType);
  }

  /**
   * Sanitize event details for privacy protection
   */
  private sanitizeEventDetails(details: Record<string, any>, deviceId?: string): Record<string, any> {
    const sanitized = { ...details };

    // Hash device_id if present in details
    if (sanitized.device_hash && deviceId) {
      // Keep the hash, remove any raw device_id
      delete sanitized.device_id;
    }

    // Hash IP addresses for privacy
    if (sanitized.ip_address) {
      sanitized.ip_address = this.hashSensitiveData(sanitized.ip_address);
    }

    // Truncate user agent strings
    if (sanitized.user_agent && sanitized.user_agent.length > 100) {
      sanitized.user_agent = sanitized.user_agent.substring(0, 100) + '...';
    }

    return sanitized;
  }

  /**
   * Hash sensitive data for privacy protection
   */
  private hashSensitiveData(data: string): string {
    // Simple hash for privacy - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Event validation schema interface
 */
interface EventSchema {
  required?: string[];
  optional?: string[];
  types?: Record<string, string>;
  enums?: Record<string, string[]>;
}
