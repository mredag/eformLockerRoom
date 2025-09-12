import sqlite3 from 'sqlite3';
import { dirname } from 'path';
import * as fs from 'fs-extra';

/**
 * Manages a singleton connection to a SQLite database.
 * This class handles the complexities of database initialization, including
 * ensuring the database file's directory exists, setting performance and
 * reliability PRAGMAs (like WAL mode), and providing a unified interface
 * for database operations. It uses a Map of instances to support multiple
 * database connections if needed (e.g., for testing).
 */
export class DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private static instances = new Map<string, DatabaseConnection>();
  private isInitialized: boolean = false;
  private dbPath: string;

  /**
   * Private constructor to enforce singleton pattern. Use `getInstance()` instead.
   * @private
   * @param {string} [dbPath] - The path to the SQLite database file or ':memory:' for an in-memory database.
   * Defaults to the path specified in the EFORM_DB_PATH environment variable or './data/eform.db'.
   */
  private constructor(dbPath: string = process.env.EFORM_DB_PATH || './data/eform.db') {
    this.dbPath = this.resolveDatabasePath(dbPath);
  }

  /**
   * Resolves the database path. For tests, it defaults to in-memory.
   * For file-based databases, it resolves to an absolute path to avoid CWD issues.
   * @private
   * @param {string} dbPath - The initial database path.
   * @returns {string} The resolved, absolute path or ':memory:'.
   */
  private resolveDatabasePath(dbPath: string): string {
    if (process.env.NODE_ENV === 'test') {
      return ':memory:';
    }
    
    if (dbPath === ':memory:') {
      return dbPath;
    }
    
    const path = require('path');
    return path.resolve(dbPath);
  }

  /**
   * Ensures that the directory for the database file exists before attempting to connect.
   * @private
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.dbPath);
    await fs.ensureDir(dir);
  }

  /**
   * Initializes the database connection, including creating the file,
   * setting up a connection timeout, and applying PRAGMAs.
   * @private
   */
  private async initializeConnection(): Promise<void> {
    if (this.db) return;

    if (this.dbPath !== ':memory:') {
      await this.ensureDirectoryExists();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 3000);

      this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, async (err) => {
        clearTimeout(timeout);
        
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
          return;
        }
        console.log('🗄️  Connected to SQLite database');
        console.log(`📍 Absolute database path: ${this.dbPath}`);
        
        try {
          await this.initializePragmas();
          resolve();
        } catch (error) {
          console.error('Failed to initialize database pragmas:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * Sets the recommended PRAGMA settings for the database connection.
   * Uses WAL mode for file-based databases to improve concurrency.
   * @private
   */
  private async initializePragmas(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      if (this.dbPath === ':memory:') {
        await this.execPragma('PRAGMA foreign_keys = ON');
        await this.execPragma('PRAGMA synchronous = NORMAL');
        await this.execPragma('PRAGMA busy_timeout = 5000');
      } else {
        await this.execPragma('PRAGMA journal_mode = WAL');
        await this.execPragma('PRAGMA synchronous = NORMAL');
        await this.execPragma('PRAGMA cache_size = 1000');
        await this.execPragma('PRAGMA temp_store = memory');
        await this.execPragma('PRAGMA foreign_keys = ON');
        await this.execPragma('PRAGMA busy_timeout = 5000');
      }
      
      this.isInitialized = true;
      console.log('🔧 Database PRAGMAs initialized:');
      console.log('   - journal_mode = WAL');
      console.log('   - synchronous = NORMAL');
      console.log('   - foreign_keys = ON');
      console.log('   - busy_timeout = 5000');
      console.log(`   - Database: ${this.dbPath}`);
    } catch (error) {
      console.error('Error initializing database pragmas:', error);
      throw error;
    }
  }

  /**
   * Executes a PRAGMA statement.
   * @private
   * @param {string} sql - The PRAGMA statement to execute.
   */
  private async execPragma(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Gets a singleton instance of the DatabaseConnection.
   * A different instance is returned for each unique `dbPath`.
   * @param {string} [dbPath] - The path to the database. If not provided, a default is used.
   * @returns {DatabaseConnection} The singleton instance.
   */
  public static getInstance(dbPath?: string): DatabaseConnection {
    const key = dbPath || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    
    if (!DatabaseConnection.instances.has(key)) {
      DatabaseConnection.instances.set(key, new DatabaseConnection(dbPath));
    }
    return DatabaseConnection.instances.get(key)!;
  }

  /**
   * Closes and removes a specific database connection instance.
   * Useful for tearing down state in tests.
   * @param {string} [dbPath] - The identifier for the instance to reset.
   */
  public static resetInstance(dbPath?: string): void {
    const key = dbPath || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    const instance = DatabaseConnection.instances.get(key);
    if (instance) {
      instance.close().catch(console.error);
      DatabaseConnection.instances.delete(key);
    }
  }

  /**
   * Resets all cached database connection instances.
   * This closes all open connections and clears the instance map.
   * Primarily used for global test teardown.
   */
  public static async resetAllInstances(): Promise<void> {
    const promises = Array.from(DatabaseConnection.instances.values()).map(instance => 
      instance.close().catch(console.error)
    );
    await Promise.all(promises);
    DatabaseConnection.instances.clear();
  }

  /**
   * Ensures the database connection is fully initialized before proceeding.
   * This is called internally by query methods but can be called externally
   * if direct access to the `sqlite3.Database` object is needed.
   */
  public async waitForInitialization(): Promise<void> {
    if (!this.db) {
      await this.initializeConnection();
    }
    
    while (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Returns the raw `sqlite3.Database` object.
   * @returns {sqlite3.Database} The underlying database object.
   * @throws {Error} If the database has not been initialized.
   */
  public getDatabase(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call waitForInitialization() first.');
    }
    return this.db;
  }

  /**
   * Returns the path of the database file.
   * @returns {string} The database path.
   */
  public getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * Executes a SQL query that does not return rows (e.g., INSERT, UPDATE, DELETE).
   * @param {string} sql - The SQL statement to execute.
   * @param {any[]} [params=[]] - Parameters to bind to the statement.
   * @returns {Promise<sqlite3.RunResult>} A promise that resolves with the RunResult object,
   * which contains information like `changes` and `lastID`.
   */
  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    await this.waitForInitialization();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  /**
   * Executes a SQL query and returns the first row found.
   * @template T - The expected type of the result row.
   * @param {string} sql - The SQL statement to execute.
   * @param {any[]} [params=[]] - Parameters to bind to the statement.
   * @returns {Promise<T | undefined>} A promise that resolves with the first row, or undefined if no rows are found.
   */
  public async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    await this.waitForInitialization();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  /**
   * Executes a SQL query and returns all found rows.
   * @template T - The expected type of the result rows.
   * @param {string} sql - The SQL statement to execute.
   * @param {any[]} [params=[]] - Parameters to bind to the statement.
   * @returns {Promise<T[]>} A promise that resolves with an array of all found rows.
   */
  public async all<T>(sql: string, params: any[] = []): Promise<T[]> {
    await this.waitForInitialization();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * Executes one or more SQL statements separated by semicolons.
   * This is useful for running schema migrations or setup scripts.
   * @param {string} sql - The SQL script to execute.
   * @returns {Promise<void>} A promise that resolves when the script has completed.
   */
  public async exec(sql: string): Promise<void> {
    await this.waitForInitialization();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return new Promise((resolve, reject) => {
      this.db!.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Begins a database transaction.
   */
  public async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  /**
   * Commits the current database transaction.
   */
  public async commit(): Promise<void> {
    await this.run('COMMIT');
  }

  /**
   * Rolls back the current database transaction.
   */
  public async rollback(): Promise<void> {
    await this.run('ROLLBACK');
  }

  /**
   * Closes the database connection.
   * @returns {Promise<void>} A promise that resolves when the connection is closed.
   */
  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            this.isInitialized = false;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
