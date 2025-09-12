import { DatabaseConnection } from './connection';

/**
 * Interface for a custom error thrown when an optimistic lock fails.
 * This occurs when trying to update an entity with a stale version number.
 */
export interface OptimisticLockError extends Error {
  name: 'OptimisticLockError';
  entity: string;
  id: string | number;
  currentVersion: number;
  expectedVersion: number;
}

/**
 * Custom error class for optimistic locking failures.
 * Instances of this error are thrown when a database update fails because
 * the entity's version on the database does not match the expected version,
 * indicating that the data has been modified by another process.
 */
export class OptimisticLockError extends Error implements OptimisticLockError {
  name = 'OptimisticLockError' as const;
  
  /**
   * Creates an instance of OptimisticLockError.
   * @param {string} entity - The name of the entity being updated.
   * @param {string | number} id - The ID of the entity.
   * @param {number} currentVersion - The version of the entity currently in the database.
   * @param {number} expectedVersion - The version that was expected for the update to succeed.
   */
  constructor(
    public entity: string,
    public id: string | number,
    public currentVersion: number,
    public expectedVersion: number
  ) {
    super(`Optimistic lock failed for ${entity} ${id}: expected version ${expectedVersion}, got ${currentVersion}`);
  }
}

/**
 * Provides a base implementation for data repositories, defining a standard set of CRUD operations
 * and helper methods for database interaction. It includes built-in support for optimistic locking
 * to prevent race conditions in concurrent environments.
 *
 * @template T - The entity type this repository manages. Must include a `version` property.
 */
export abstract class BaseRepository<T extends { version: number }> {
  protected db: DatabaseConnection;
  protected tableName: string;

  /**
   * Creates an instance of BaseRepository.
   * @param {DatabaseConnection} db - The database connection instance.
   * @param {string} tableName - The name of the database table this repository manages.
   */
  constructor(db: DatabaseConnection, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Finds an entity by its primary identifier.
   * @param {string | number} id - The ID of the entity to find.
   * @returns {Promise<T | null>} The found entity or null if not found.
   */
  abstract findById(id: string | number): Promise<T | null>;

  /**
   * Finds all entities, optionally matching a set of conditions.
   * @param {Record<string, any>} [conditions] - An object of key-value pairs to filter by.
   * @returns {Promise<T[]>} An array of found entities.
   */
  abstract findAll(conditions?: Record<string, any>): Promise<T[]>;

  /**
   * Creates a new entity in the database.
   * Timestamps and version are managed automatically.
   * @param {Omit<T, 'version' | 'created_at' | 'updated_at'>} entity - The entity data to create.
   * @returns {Promise<T>} The newly created entity, including its database-generated properties.
   */
  abstract create(entity: Omit<T, 'version' | 'created_at' | 'updated_at'>): Promise<T>;

  /**
   * Updates an existing entity using optimistic locking.
   * The update will fail if the `expectedVersion` does not match the current version in the database.
   * @param {string | number} id - The ID of the entity to update.
   * @param {Partial<T>} updates - An object with the properties to update.
   * @param {number} expectedVersion - The version of the entity that the update is based on.
   * @returns {Promise<T>} The updated entity.
   * @throws {OptimisticLockError} If the version check fails.
   */
  abstract update(id: string | number, updates: Partial<T>, expectedVersion: number): Promise<T>;

  /**
   * Deletes an entity from the database.
   * @param {string | number} id - The ID of the entity to delete.
   * @returns {Promise<boolean>} True if the entity was deleted, false otherwise.
   */
  abstract delete(id: string | number): Promise<boolean>;

  /**
   * Checks if an entity with the given ID exists.
   * @param {string | number} id - The ID of the entity to check.
   * @returns {Promise<boolean>} True if the entity exists, false otherwise.
   */
  async exists(id: string | number): Promise<boolean> {
    const entity = await this.findById(id);
    return entity !== null;
  }

  /**
   * Counts the number of entities, optionally matching a set of conditions.
   * @param {Record<string, any>} [conditions] - An object of key-value pairs to filter by.
   * @returns {Promise<number>} The total number of matching entities.
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
   * A protected helper to execute an SQL update statement with optimistic locking.
   * It checks if the number of affected rows is 1. If 0, it investigates whether
   * the entity was not found or if a version mismatch occurred, throwing an appropriate error.
   * @protected
   * @param {string} sql - The SQL UPDATE statement to execute.
   * @param {any[]} params - The parameters for the SQL statement.
   * @param {string} entityName - The name of the entity, used for error messages.
   * @param {string | number} id - The ID of the entity being updated.
   * @param {number} expectedVersion - The version required for the update to succeed.
   * @returns {Promise<void>}
   * @throws {Error} If the entity is not found.
   * @throws {OptimisticLockError} If a version mismatch is detected.
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
      const current = await this.findById(id);
      if (!current) {
        throw new Error(`${entityName} with id ${id} not found`);
      }
      
      throw new OptimisticLockError(entityName, id, current.version, expectedVersion);
    }
  }

  /**
   * A protected helper to build a SQL WHERE clause from a conditions object.
   * Supports equality, `IS NULL`, and `IN` operators.
   * @protected
   * @param {Record<string, any>} conditions - The conditions to build the clause from.
   * @returns {{ clause: string; params: any[] }} The generated SQL clause and its parameters.
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
   * An abstract method that must be implemented by subclasses to map a raw database row
   * to a structured entity object.
   * @protected
   * @param {any} row - The raw data object from the database.
   * @returns {T} The mapped entity object.
   */
  protected abstract mapRowToEntity(row: any): T;

  /**
   * An abstract method that must be implemented by subclasses to map a structured entity
   * object to a raw object suitable for database insertion or updates.
   * @protected
   * @param {Partial<T>} entity - The entity object to map.
   * @returns {Record<string, any>} The mapped raw database object.
   */
  protected abstract mapEntityToRow(entity: Partial<T>): Record<string, any>;
}
