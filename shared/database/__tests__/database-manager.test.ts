import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../database-manager';
import { DatabaseConnection } from '../connection';
import * as path from 'path';

describe('DatabaseManager', () => {
  let manager: DatabaseManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Use in-memory database for faster tests
    testDbPath = ':memory:';
    
    // Reset all instances
    await DatabaseManager.resetAllInstances();
    
    // Create new manager with in-memory database
    manager = DatabaseManager.getInstance({ path: testDbPath });
    
    // Initialize connection with shorter timeout for tests
    try {
      await manager.getConnection().waitForInitialization();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }, 8000);

  afterEach(async () => {
    // Clean up all instances
    await DatabaseManager.resetAllInstances();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const manager1 = DatabaseManager.getInstance();
      const manager2 = DatabaseManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });
  });

  describe('getConnection', () => {
    it('should return database connection', () => {
      const connection = manager.getConnection();
      expect(connection).toBeInstanceOf(DatabaseConnection);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      // Initialize the database first
      await manager.getConnection().waitForInitialization();
      
      // Create the schema_migrations table for health check
      await manager.getConnection().exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          checksum TEXT NOT NULL
        )
      `);

      const health = await manager.healthCheck();

      expect(health.status).toBe('ok');
      expect(health.lastWrite).toBeInstanceOf(Date);
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction', async () => {
      await manager.getConnection().waitForInitialization();
      
      // Create test table
      await manager.getConnection().exec(`
        CREATE TABLE test_table (id INTEGER PRIMARY KEY, value TEXT)
      `);

      const result = await manager.withTransaction(async (connection) => {
        await connection.run('INSERT INTO test_table (value) VALUES (?)', ['test']);
        const row = await connection.get<{ id: number; value: string }>('SELECT * FROM test_table WHERE value = ?', ['test']);
        return row;
      });

      expect(result).toMatchObject({ id: 1, value: 'test' });
    });
  });

  describe('withRetry', () => {
    it('should retry on retryable errors', async () => {
      await manager.getConnection().waitForInitialization();
      
      let attempts = 0;
      const result = await manager.withRetry(async (connection) => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('database is locked');
          throw error;
        }
        return 'success';
      }, 3, 10);

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });
  });
});
