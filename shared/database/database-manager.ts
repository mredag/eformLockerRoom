import { DatabaseConnection } from './connection';
import { MigrationRunner } from './migration-runner';

/**
 * Defines the configuration options for the DatabaseManager.
 */
export interface DatabaseConfig {
  /** The file path to the SQLite database. Defaults to a path in the `data` directory. */
  path?: string;
  /** Whether to enable Write-Ahead Logging (WAL). Recommended for concurrency. Defaults to true. */
  enableWAL?: boolean;
  /** The timeout in milliseconds for waiting on a locked database. Defaults to 30000. */
  busyTimeout?: number;
  /** The suggested cache size for the database connection. */
  cacheSize?: number;
  /** The path to the directory containing SQL migration files. Defaults to './migrations'. */
  migrationsPath?: string;
}

/**
 * A high-level manager for the database.
 * This class provides a singleton interface to the database, building on `DatabaseConnection`.
 * It is responsible for orchestrating database initialization (including running migrations),
 * performing health checks, and providing utility wrappers for transactions and retry logic.
 */
export class DatabaseManager {
  private static instances = new Map<string, DatabaseManager>();
  private connection: DatabaseConnection;
  private config: DatabaseConfig;

  /**
   * Private constructor to enforce singleton pattern. Use `getInstance()` instead.
   * @private
   * @param {DatabaseConfig} [config={}] - Configuration for the database manager.
   */
  private constructor(config: DatabaseConfig = {}) {
    const defaultPath = process.env.NODE_ENV === 'test' 
      ? './data/test/test.db' 
      : './data/eform.db';
      
    this.config = {
      path: defaultPath,
      enableWAL: true,
      busyTimeout: 30000,
      cacheSize: 1000,
      ...config
    };
    
    this.connection = DatabaseConnection.getInstance(this.config.path);
  }

  /**
   * Gets a singleton instance of the DatabaseManager for a given configuration.
   * @param {DatabaseConfig} [config] - The configuration to use. A default is used if not provided.
   * @returns {DatabaseManager} The singleton instance.
   */
  public static getInstance(config?: DatabaseConfig): DatabaseManager {
    const key = config?.path || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    
    if (!DatabaseManager.instances.has(key)) {
      DatabaseManager.instances.set(key, new DatabaseManager(config));
    }
    return DatabaseManager.instances.get(key)!;
  }

  /**
   * Resets a specific singleton instance of the DatabaseManager and its underlying connection.
   * Primarily used for test teardown.
   * @param {DatabaseConfig} [config] - The configuration identifying the instance to reset.
   */
  public static resetInstance(config?: DatabaseConfig): void {
    const key = config?.path || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    const instance = DatabaseManager.instances.get(key);
    if (instance) {
      instance.close().catch(console.error);
      DatabaseManager.instances.delete(key);
    }
    DatabaseConnection.resetInstance(config?.path);
  }

  /**
   * Resets all singleton instances. Used for global test teardown.
   */
  public static async resetAllInstances(): Promise<void> {
    const promises = Array.from(DatabaseManager.instances.values()).map(instance => 
      instance.close().catch(console.error)
    );
    await Promise.all(promises);
    DatabaseManager.instances.clear();
    await DatabaseConnection.resetAllInstances();
  }

  /**
   * Gets the underlying `DatabaseConnection` object.
   * @returns {DatabaseConnection} The raw database connection wrapper.
   */
  public getConnection(): DatabaseConnection {
    return this.connection;
  }

  /**
   * Initializes the database by ensuring the connection is ready and running all pending migrations.
   * This should be called once when the application starts.
   */
  public async initialize(): Promise<void> {
    try {
      console.log('Initializing database...');
      
      await this.connection.waitForInitialization();
      
      const migrationsPath = this.config.migrationsPath || './migrations';
      const migrationRunner = new MigrationRunner(migrationsPath);
      await migrationRunner.runMigrations();
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Performs a health check on the database.
   * This check verifies connectivity and the ability to perform a write operation.
   * @returns {Promise<object>} An object containing the health status and additional metrics.
   */
  public async healthCheck(): Promise<{
    status: 'ok' | 'error';
    lastWrite?: Date;
    walSize?: number;
    error?: string;
  }> {
    try {
      await this.connection.get('SELECT 1 as test');
      
      const walInfo = await this.connection.get<{ wal_size: number }>('PRAGMA wal_checkpoint(PASSIVE)');
      
      await this.connection.run(
        'INSERT OR REPLACE INTO schema_migrations (id, filename, checksum) VALUES (-1, "health_check", "test")'
      );
      
      await this.connection.run('DELETE FROM schema_migrations WHERE id = -1');
      
      return {
        status: 'ok',
        lastWrite: new Date(),
        walSize: walInfo?.wal_size || 0
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Executes a given function within a database transaction.
   * The transaction is automatically committed if the function succeeds, or rolled back if it throws an error.
   * @template T - The return type of the function to be executed.
   * @param {(connection: DatabaseConnection) => Promise<T>} fn - The async function to execute. It receives the connection as an argument.
   * @returns {Promise<T>} The result of the executed function.
   */
  public async withTransaction<T>(fn: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    await this.connection.beginTransaction();
    try {
      const result = await fn(this.connection);
      await this.connection.commit();
      return result;
    } catch (error) {
      await this.connection.rollback();
      throw error;
    }
  }

  /**
   * Executes a function with automatic retry logic for retryable database errors (e.g., `SQLITE_BUSY`).
   * @template T - The return type of the function to be executed.
   * @param {(connection: DatabaseConnection) => Promise<T>} fn - The async function to execute.
   * @param {number} [maxRetries=3] - The maximum number of times to retry.
   * @param {number} [delayMs=100] - The base delay between retries, in milliseconds.
   * @returns {Promise<T>} The result of the executed function.
   */
  public async withRetry<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 100
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(this.connection);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          break;
        }
        
        if (this.isRetryableError(lastError)) {
          console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        } else {
          break;
        }
      }
    }
    
    throw lastError || new Error('Unknown error occurred');
  }

  /**
   * Checks if an error is a known retryable SQLite error.
   * @private
   * @param {Error} error - The error to check.
   * @returns {boolean} True if the error is retryable.
   */
  private isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
      'database is locked',
      'database is busy'
    ];
    
    return retryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Closes the underlying database connection.
   */
  public async close(): Promise<void> {
    await this.connection.close();
  }
}
