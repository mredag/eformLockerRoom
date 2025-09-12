import { EventRepository } from '../database/event-repository';
import { Event, EventType, EventDetails, ValidationResult, ValidationError } from '../types/core-entities';

/**
 * Provides a high-level, standardized interface for logging system events.
 * This class ensures that all events are created with a consistent structure,
 * validates event details against predefined schemas, and handles the
 * sanitization of sensitive data before persisting events to the database.
 */
export class EventLogger {
  private eventRepository: EventRepository;
  private validationSchemas: Map<EventType, EventSchema>;

  /**
   * Creates an instance of EventLogger.
   * @param {EventRepository} eventRepository - The repository for persisting event data.
   */
  constructor(eventRepository: EventRepository) {
    this.eventRepository = eventRepository;
    this.validationSchemas = new Map();
    this.initializeSchemas();
  }

  /**
   * Logs a system restart event.
   * @param {string} kioskId - The ID of the kiosk that restarted.
   * @param {object} [details={}] - Additional details about the restart.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for an RFID card being assigned to a locker.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} rfidCard - The RFID card ID.
   * @param {object} details - Details about the assignment.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for a locker being released by an RFID card.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} rfidCard - The RFID card ID.
   * @param {object} details - Details about the release.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for a locker being accessed via a QR code.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} deviceId - A unique identifier for the user's device.
   * @param {'assign' | 'release'} action - The action performed.
   * @param {object} details - Details about the QR access.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for an operation performed by a staff member.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {EventType.STAFF_OPEN | EventType.STAFF_BLOCK | EventType.STAFF_UNBLOCK} eventType - The type of staff operation.
   * @param {string} staffUser - The username of the staff member.
   * @param {object} details - Details about the operation.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for a bulk operation (e.g., opening all lockers).
   * @param {string} kioskId - The ID of the kiosk.
   * @param {string} staffUser - The username of the staff member.
   * @param {object} details - Details about the bulk operation.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for the use of a master PIN.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker accessed.
   * @param {object} details - Details about the PIN usage.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event related to a VIP contract operation.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {EventType.VIP_CONTRACT_CREATED | EventType.VIP_CONTRACT_EXTENDED | EventType.VIP_CONTRACT_CANCELLED} eventType - The type of VIP operation.
   * @param {string} staffUser - The username of the staff member.
   * @param {object} details - Details about the operation.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event related to a VIP contract transfer.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {EventType.VIP_TRANSFER_REQUESTED | EventType.VIP_TRANSFER_APPROVED | EventType.VIP_TRANSFER_REJECTED | EventType.VIP_TRANSFER_COMPLETED} eventType - The type of transfer operation.
   * @param {string} staffUser - The username of the staff member.
   * @param {object} details - Details about the transfer.
   * @returns {Promise<Event>} The created event object.
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
   * Logs an event for a change in kiosk status (online/offline).
   * @param {string} kioskId - The ID of the kiosk.
   * @param {EventType.KIOSK_ONLINE | EventType.KIOSK_OFFLINE} eventType - The new status.
   * @param {object} details - Details about the status change.
   * @returns {Promise<Event>} The created event object.
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
   * A generic method to log any type of event. It validates the event details against
   * a schema and sanitizes sensitive information before persisting the event.
   * @param {string} kioskId - The ID of the kiosk where the event occurred.
   * @param {EventType} eventType - The type of the event.
   * @param {Record<string, any>} [details={}] - A JSON object with additional event details.
   * @param {number} [lockerId] - The associated locker ID, if any.
   * @param {string} [rfidCard] - The associated RFID card ID, if any.
   * @param {string} [deviceId] - The associated device ID, if any.
   * @param {string} [staffUser] - The staff user who initiated the event, if any.
   * @returns {Promise<Event>} The created event object.
   * @throws {Error} If the event details fail validation.
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
    const validationResult = this.validateEventDetails(eventType, details);
    if (!validationResult.valid) {
      throw new Error(`Event validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    if (this.isStaffEvent(eventType) && !staffUser) {
      throw new Error(`Staff event ${eventType} requires staff_user field`);
    }

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
   * Queries the event log using a flexible set of filters.
   * @param {object} filter - The filtering criteria.
   * @returns {Promise<Event[]>} An array of events matching the filter.
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
   * Retrieves statistics about logged events.
   * @param {Date} [fromDate] - The start date for the statistics.
   * @param {Date} [toDate] - The end date for the statistics.
   * @returns {Promise<object>} An object containing event statistics.
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
   * Retrieves a full audit trail for a specific staff member.
   * @param {string} [staffUser] - The username of the staff member.
   * @param {Date} [fromDate] - The start date for the audit trail.
   * @param {Date} [toDate] - The end date for the audit trail.
   * @returns {Promise<Event[]>} An array of events performed by the specified user.
   */
  async getStaffAuditTrail(staffUser?: string, fromDate?: Date, toDate?: Date): Promise<Event[]> {
    return this.eventRepository.findStaffActions(staffUser, fromDate, toDate);
  }

  /**
   * Deletes old event records to save space.
   * @param {number} [retentionDays=30] - The number of days to keep event records.
   * @returns {Promise<number>} The number of deleted rows.
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    return this.eventRepository.cleanupOldEvents(retentionDays);
  }

  /**
   * Initializes the validation schemas for each event type.
   * @private
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
   * Validates the details of an event against its registered schema.
   * @private
   * @param {EventType} eventType - The type of the event.
   * @param {Record<string, any>} details - The details object to validate.
   * @returns {ValidationResult} The result of the validation.
   */
  private validateEventDetails(eventType: EventType, details: Record<string, any>): ValidationResult {
    const schema = this.validationSchemas.get(eventType);
    const errors: ValidationError[] = [];

    if (!schema) {
      return { valid: true, errors: [] };
    }

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
   * Checks if a given event type is considered a staff-initiated event.
   * @private
   * @param {EventType} eventType - The event type to check.
   * @returns {boolean} True if the event is a staff event.
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
   * Sanitizes event details to protect user privacy, for example, by hashing IP addresses.
   * @private
   * @param {Record<string, any>} details - The original event details.
   * @param {string} [deviceId] - The device ID, used for context.
   * @returns {Record<string, any>} The sanitized details.
   */
  private sanitizeEventDetails(details: Record<string, any>, deviceId?: string): Record<string, any> {
    const sanitized = { ...details };

    if (sanitized.device_hash && deviceId) {
      delete sanitized.device_id;
    }

    if (sanitized.ip_address) {
      sanitized.ip_address = this.hashSensitiveData(sanitized.ip_address);
    }

    if (sanitized.user_agent && sanitized.user_agent.length > 100) {
      sanitized.user_agent = sanitized.user_agent.substring(0, 100) + '...';
    }

    return sanitized;
  }

  /**
   * Hashes a string for privacy. In a real application, a more secure hashing algorithm should be used.
   * @private
   * @param {string} data - The string to hash.
   * @returns {string} The hashed string.
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
 * @private
 * Defines the schema for validating the details of a specific event type.
 */
interface EventSchema {
  required?: string[];
  optional?: string[];
  types?: Record<string, string>;
  enums?: Record<string, string[]>;
}
