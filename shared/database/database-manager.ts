import { DatabaseConnection } from './connection';
import { MigrationRunner } from './migration-runner';

export interface DatabaseConfig {
  path?: string;
  enableWAL?: boolean;
  busyTimeout?: number;
  cacheSize?: number;
  migrationsPath?: string;
}

export class DatabaseManager {
  private static instances = new Map<string, DatabaseManager>();
  private connection: DatabaseConnection;
  private config: DatabaseConfig;

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

  public static getInstance(config?: DatabaseConfig): DatabaseManager {
    const key = config?.path || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    
    if (!DatabaseManager.instances.has(key)) {
      DatabaseManager.instances.set(key, new DatabaseManager(config));
    }
    return DatabaseManager.instances.get(key)!;
  }

  public static resetInstance(config?: DatabaseConfig): void {
    const key = config?.path || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    const instance = DatabaseManager.instances.get(key);
    if (instance) {
      instance.close().catch(console.error);
      DatabaseManager.instances.delete(key);
    }
    DatabaseConnection.resetInstance(config?.path);
  }

  public static async resetAllInstances(): Promise<void> {
    const promises = Array.from(DatabaseManager.instances.values()).map(instance => 
      instance.close().catch(console.error)
    );
    await Promise.all(promises);
    DatabaseManager.instances.clear();
    await DatabaseConnection.resetAllInstances();
  }

  public getConnection(): DatabaseConnection {
    return this.connection;
  }

  /**
   * Initialize database with migrations
   */
  public async initialize(): Promise<void> {
    try {
      console.log('Initializing database...');
      
      // Wait for connection to be ready
      await this.connection.waitForInitialization();
      
      // Run migrations with the configured path
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
   * Health check for database
   */
  public async healthCheck(): Promise<{
    status: 'ok' | 'error';
    lastWrite?: Date;
    walSize?: number;
    error?: string;
  }> {
    try {
      // Test basic connectivity
      await this.connection.get('SELECT 1 as test');
      
      // Check WAL file size
      const walInfo = await this.connection.get<{ wal_size: number }>('PRAGMA wal_checkpoint(PASSIVE)');
      
      // Test write operation
      const testResult = await this.connection.run(
        'INSERT OR REPLACE INTO schema_migrations (id, filename, checksum) VALUES (-1, "health_check", "test")'
      );
      
      // Clean up test record
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
   * Execute a function within a transaction
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
   * Execute a function with retry logic
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
        
        // Check if error is retryable (database locked, busy, etc.)
        if (this.isRetryableError(lastError)) {
          console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        } else {
          // Non-retryable error, fail immediately
          break;
        }
      }
    }
    
    throw lastError || new Error('Unknown error occurred');
  }

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
   * Close database connection
   */
  public async close(): Promise<void> {
    await this.connection.close();
  }
}
