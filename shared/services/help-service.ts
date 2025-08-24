import { DatabaseConnection } from '../database/connection.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Help request data interfaces (Simplified)
 */
export interface CreateHelpRequest {
  kiosk_id: string;
  locker_no?: number;
  category: 'lock_problem' | 'other';
  note?: string;
}

export interface HelpRequest {
  id: number;
  kiosk_id: string;
  locker_no?: number;
  category: 'lock_problem' | 'other';
  note?: string;
  status: 'open' | 'resolved';
  created_at: string; // ISO string
  resolved_at?: string; // ISO string
}

export interface UpdateHelpRequest {
  status?: 'open' | 'resolved';
}

export interface HelpRequestFilter {
  status?: 'open' | 'resolved';
  kiosk_id?: string;
  category?: 'lock_problem' | 'other';
}

/**
 * Help request validation error
 */
export class HelpRequestValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'HelpRequestValidationError';
  }
}

/**
 * Help request not found error
 */
export class HelpRequestNotFoundError extends Error {
  constructor(id: number) {
    super(`Help request with id ${id} not found`);
    this.name = 'HelpRequestNotFoundError';
  }
}

/**
 * Invalid status transition error
 */
export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid status transition from '${from}' to '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

/**
 * Service for managing help requests with real-time event emission
 */
export class HelpService {
  private db: DatabaseConnection;
  private eventEmitter?: (event: string, data: any) => Promise<void>;

  constructor(db?: DatabaseConnection, eventEmitter?: (event: string, data: any) => Promise<void>) {
    this.db = db || DatabaseConnection.getInstance();
    this.eventEmitter = eventEmitter;
  }

  /**
   * Create a new help request (Simplified)
   */
  async createHelpRequest(request: CreateHelpRequest): Promise<HelpRequest> {
    // Validate input
    this.validateCreateHelpRequest(request);

    const createdAt = new Date().toISOString();

    // Insert help request into database
    const result = await this.db.run(
      `INSERT INTO help_requests (
        kiosk_id, locker_no, category, note, status, created_at
      ) VALUES (?, ?, ?, ?, 'open', ?)`,
      [
        request.kiosk_id,
        request.locker_no || null,
        request.category,
        request.note || null,
        createdAt
      ]
    );

    if (!result.lastID) {
      throw new Error('Failed to create help request');
    }

    // Fetch the created help request
    const helpRequest = await this.getHelpRequestById(result.lastID);
    if (!helpRequest) {
      throw new Error('Failed to retrieve created help request');
    }

    // Emit help requested event
    await this.emitHelpRequestedEvent(helpRequest);

    return helpRequest;
  }

  /**
   * Resolve a help request (Simplified)
   */
  async resolveHelpRequest(id: number): Promise<HelpRequest> {
    const helpRequest = await this.getHelpRequestById(id);
    if (!helpRequest) {
      throw new HelpRequestNotFoundError(id);
    }

    // Validate status transition
    if (helpRequest.status === 'resolved') {
      throw new InvalidStatusTransitionError(helpRequest.status, 'resolved');
    }

    const oldStatus = helpRequest.status;
    const resolvedAt = new Date().toISOString();

    // Update help request
    await this.db.run(
      `UPDATE help_requests SET status = ?, resolved_at = ? WHERE id = ?`,
      ['resolved', resolvedAt, id]
    );

    // Fetch updated help request
    const updatedHelpRequest = await this.getHelpRequestById(id);
    if (!updatedHelpRequest) {
      throw new Error('Failed to retrieve updated help request');
    }

    // Emit status update event
    await this.emitHelpStatusUpdatedEvent(id, oldStatus, 'resolved');

    return updatedHelpRequest;
  }

  /**
   * Update a help request (Simplified)
   */
  async updateHelpRequest(id: number, updates: UpdateHelpRequest): Promise<HelpRequest> {
    const helpRequest = await this.getHelpRequestById(id);
    if (!helpRequest) {
      throw new HelpRequestNotFoundError(id);
    }

    // Validate status transition if status is being updated
    if (updates.status && updates.status !== helpRequest.status) {
      this.validateStatusTransition(helpRequest.status, updates.status);
    }

    const oldStatus = helpRequest.status;
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    // Build dynamic update query
    if (updates.status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(updates.status);
    }

    if (updateFields.length === 0) {
      return helpRequest; // No updates to apply
    }

    updateValues.push(id);

    // Execute update
    await this.db.run(
      `UPDATE help_requests SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch updated help request
    const updatedHelpRequest = await this.getHelpRequestById(id);
    if (!updatedHelpRequest) {
      throw new Error('Failed to retrieve updated help request');
    }

    // Emit status update event if status changed
    if (updates.status && updates.status !== oldStatus) {
      await this.emitHelpStatusUpdatedEvent(id, oldStatus, updates.status);
    }

    return updatedHelpRequest;
  }

  /**
   * Get help request by ID
   */
  async getHelpRequestById(id: number): Promise<HelpRequest | null> {
    const row = await this.db.get<any>(
      'SELECT * FROM help_requests WHERE id = ?',
      [id]
    );

    return row ? this.mapRowToHelpRequest(row) : null;
  }

  /**
   * Get help requests with optional filtering (Simplified)
   */
  async getHelpRequests(filter: HelpRequestFilter = {}): Promise<HelpRequest[]> {
    const whereConditions: string[] = [];
    const params: any[] = [];

    // Build WHERE clause based on filter
    if (filter.status) {
      whereConditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.kiosk_id) {
      whereConditions.push('kiosk_id = ?');
      params.push(filter.kiosk_id);
    }
    if (filter.category) {
      whereConditions.push('category = ?');
      params.push(filter.category);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const rows = await this.db.all<any>(
      `SELECT * FROM help_requests ${whereClause} ORDER BY created_at DESC`,
      params
    );

    return rows.map(row => this.mapRowToHelpRequest(row));
  }

  /**
   * Get help request history for a specific kiosk
   */
  async getHelpHistory(kioskId?: string): Promise<HelpRequest[]> {
    const filter: HelpRequestFilter = {};
    if (kioskId) {
      filter.kiosk_id = kioskId;
    }
    return this.getHelpRequests(filter);
  }



  /**
   * Validate create help request input (Simplified)
   */
  private validateCreateHelpRequest(request: CreateHelpRequest): void {
    if (!request.kiosk_id || request.kiosk_id.trim().length === 0) {
      throw new HelpRequestValidationError('kiosk_id is required', 'kiosk_id');
    }

    if (!request.category) {
      throw new HelpRequestValidationError('category is required', 'category');
    }

    const validCategories = ['lock_problem', 'other'];
    if (!validCategories.includes(request.category)) {
      throw new HelpRequestValidationError(
        `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        'category'
      );
    }

    if (request.locker_no !== undefined && (request.locker_no < 1 || request.locker_no > 1000)) {
      throw new HelpRequestValidationError('locker_no must be between 1 and 1000', 'locker_no');
    }

    if (request.note && request.note.length > 1000) {
      throw new HelpRequestValidationError('note cannot exceed 1000 characters', 'note');
    }
  }

  /**
   * Validate status transition (Simplified)
   */
  private validateStatusTransition(from: string, to: string): void {
    const validTransitions: Record<string, string[]> = {
      'open': ['resolved'],
      'resolved': ['open'] // Allow reopening resolved requests
    };

    if (!validTransitions[from] || !validTransitions[from].includes(to)) {
      throw new InvalidStatusTransitionError(from, to);
    }
  }

  /**
   * Map database row to HelpRequest object (Simplified)
   */
  private mapRowToHelpRequest(row: any): HelpRequest {
    return {
      id: row.id,
      kiosk_id: row.kiosk_id,
      locker_no: row.locker_no,
      category: row.category,
      note: row.note,
      status: row.status,
      created_at: row.created_at,
      resolved_at: row.resolved_at
    };
  }

  /**
   * Emit help requested event (Simplified)
   */
  private async emitHelpRequestedEvent(helpRequest: HelpRequest): Promise<void> {
    if (this.eventEmitter) {
      try {
        await this.eventEmitter('help_requested', {
          id: helpRequest.id,
          kiosk_id: helpRequest.kiosk_id,
          locker_no: helpRequest.locker_no,
          category: helpRequest.category,
          note: helpRequest.note,
          status: helpRequest.status,
          created_at: helpRequest.created_at
        });
      } catch (error) {
        console.error('Failed to emit help requested event:', error);
      }
    }
  }

  /**
   * Emit help status updated event (Simplified)
   */
  private async emitHelpStatusUpdatedEvent(
    id: number,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    if (this.eventEmitter) {
      try {
        await this.eventEmitter('help_status_updated', {
          id,
          old_status: oldStatus,
          new_status: newStatus,
          updated_at: new Date().toISOString()
        });
      } catch (error) {
        console.error('Failed to emit help status updated event:', error);
      }
    }
  }

  /**
   * Get help request statistics (Simplified)
   */
  async getHelpRequestStatistics(): Promise<{
    total: number;
    open: number;
    resolved: number;
    by_category: Record<string, number>;
  }> {
    const stats = await this.db.get<any>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved
      FROM help_requests
    `);

    const categoryStats = await this.db.all<any>(`
      SELECT category, COUNT(*) as count
      FROM help_requests
      GROUP BY category
    `);

    return {
      total: stats?.total || 0,
      open: stats?.open || 0,
      resolved: stats?.resolved || 0,
      by_category: categoryStats.reduce((acc, row) => {
        acc[row.category] = row.count;
        return acc;
      }, {})
    };
  }


}