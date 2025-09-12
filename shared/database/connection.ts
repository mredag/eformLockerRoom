import sqlite3 from 'sqlite3';
import { join, dirname } from 'path';
import * as fs from 'fs-extra';

export class DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private static instances = new Map<string, DatabaseConnection>();
  private isInitialized: boolean = false;
  private dbPath: string;

  private constructor(dbPath: string = process.env.EFORM_DB_PATH || './data/eform.db') {
    this.dbPath = this.resolveDatabasePath(dbPath);
  }

  private resolveDatabasePath(dbPath: string): string {
    if (process.env.NODE_ENV === 'test') {
      // Use in-memory database for tests for speed and reliability
      return ':memory:';
    }
    
    // Resolve to absolute path to prevent different CWDs from pointing to different files
    if (dbPath === ':memory:') {
      return dbPath;
    }
    
    const path = require('path');
    return path.resolve(dbPath);
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.dbPath);
    await fs.ensureDir(dir);
  }

  private async initializeConnection(): Promise<void> {
    if (this.db) return;

    // Only ensure directory exists for file-based databases
    if (this.dbPath !== ':memory:') {
      await this.ensureDirectoryExists();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Database connection timeout'));
      }, 3000); // 3 second timeout

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

  private async initializePragmas(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // For in-memory databases (tests), use minimal pragmas
      if (this.dbPath === ':memory:') {
        await this.execPragma('PRAGMA foreign_keys = ON');
        await this.execPragma('PRAGMA synchronous = NORMAL');
        await this.execPragma('PRAGMA busy_timeout = 5000');
      } else {
        // For file databases, use consistent pragma set across all services
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

  public static getInstance(dbPath?: string): DatabaseConnection {
    const key = dbPath || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    
    if (!DatabaseConnection.instances.has(key)) {
      DatabaseConnection.instances.set(key, new DatabaseConnection(dbPath));
    }
    return DatabaseConnection.instances.get(key)!;
  }

  public static resetInstance(dbPath?: string): void {
    const key = dbPath || (process.env.NODE_ENV === 'test' ? 'test' : 'default');
    const instance = DatabaseConnection.instances.get(key);
    if (instance) {
      instance.close().catch(console.error);
      DatabaseConnection.instances.delete(key);
    }
  }

  public static async resetAllInstances(): Promise<void> {
    const promises = Array.from(DatabaseConnection.instances.values()).map(instance => 
      instance.close().catch(console.error)
    );
    await Promise.all(promises);
    DatabaseConnection.instances.clear();
  }

  public async waitForInitialization(): Promise<void> {
    if (!this.db) {
      await this.initializeConnection();
    }
    
    while (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  public getDatabase(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call waitForInitialization() first.');
    }
    return this.db;
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

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

  public async beginTransaction(): Promise<void> {
    await this.run('BEGIN TRANSACTION');
  }

  public async commit(): Promise<void> {
    await this.run('COMMIT');
  }

  public async rollback(): Promise<void> {
    await this.run('ROLLBACK');
  }

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
