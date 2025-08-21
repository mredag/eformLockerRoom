import { DatabaseConnection } from './connection.js';

export interface OptimisticLockError extends Error {
  name: 'OptimisticLockError';
  entity: string;
  id: string | number;
  currentVersion: number;
  expectedVersion: number;
}

export class OptimisticLockError extends Error implements OptimisticLockError {
  name = 'OptimisticLockError' as const;
  
  constructor(
    public entity: string,
    public id: string | number,
    public currentVersion: number,
    public expectedVersion: number
  ) {
    super(`Optimistic lock failed for ${entity} ${id}: expected version ${expectedVersion}, got ${currentVersion}`);
  }
}

export abstract class BaseRepository<T extends { version: number }> {
  protected db: DatabaseConnection;
  protected tableName: string;

  constructor(db: DatabaseConnection, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Find entity by ID
   */
  abstract findById(id: string | number): Promise<T | null>;

  /**
   * Find all entities with optional conditions
   */
  abstract findAll(conditions?: Record<string, any>): Promise<T[]>;

  /**
   * Create new entity
   */
  abstract create(entity: Omit<T, 'version' | 'created_at' | 'updated_at'>): Promise<T>;

  /**
   * Update entity with optimistic locking
   */
  abstract update(id: string | number, updates: Partial<T>, expectedVersion: number): Promise<T>;

  /**
   * Delete entity
   */
  abstract delete(id: string | number): Promise<boolean>;

  /**
   * Check if entity exists
   */
  async exists(id: string | number): Promise<boolean> {
    const entity = await this.findById(id);
    return entity !== null;
  }

  /**
   * Count entities with optional conditions
   */
  async count(conditions?: Record<string, any>): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];

    if (conditions && Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map(key => `${key} = ?`)
        .join(' AND ');
      sql += ` WHERE ${whereClause}`;
      params.push(...Object.values(conditions));
    }

    const result = await this.db.get<{ count: number }>(sql, params);
    return result?.count || 0;
  }

  /**
   * Execute update with optimistic locking
   */
  protected async executeOptimisticUpdate(
    sql: string,
    params: any[],
    entityName: string,
    id: string | number,
    expectedVersion: number
  ): Promise<void> {
    const result = await this.db.run(sql, params);
    
    if (result.changes === 0) {
      // Check if entity exists
      const current = await this.findById(id);
      if (!current) {
        throw new Error(`${entityName} with id ${id} not found`);
      }
      
      // Entity exists but wasn't updated - version mismatch
      throw new OptimisticLockError(entityName, id, current.version, expectedVersion);
    }
  }

  /**
   * Build WHERE clause from conditions
   */
  protected buildWhereClause(conditions: Record<string, any>): { clause: string; params: any[] } {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { clause: '', params: [] };
    }

    const clauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(conditions)) {
      if (value === null) {
        clauses.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        clauses.push(`${key} IN (${value.map(() => '?').join(', ')})`);
        params.push(...value);
      } else {
        clauses.push(`${key} = ?`);
        params.push(value);
      }
    }

    return {
      clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }

  /**
   * Convert database row to entity
   */
  protected abstract mapRowToEntity(row: any): T;

  /**
   * Convert entity to database row
   */
  protected abstract mapEntityToRow(entity: Partial<T>): Record<string, any>;
}