import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

export class DatabaseConnection {
  private db: sqlite3.Database;
  private static instance: DatabaseConnection;
  private isInitialized: boolean = false;

  private constructor(dbPath: string = './data/eform.db') {
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log('Connected to SQLite database');
    });

    this.initializePragmas();
  }

  private async initializePragmas(): Promise<void> {
    try {
      // Enable WAL mode for better concurrent access
      await this.run('PRAGMA journal_mode = WAL');
      await this.run('PRAGMA synchronous = NORMAL');
      await this.run('PRAGMA cache_size = 1000');
      await this.run('PRAGMA temp_store = memory');
      await this.run('PRAGMA foreign_keys = ON');
      await this.run('PRAGMA busy_timeout = 30000'); // 30 second timeout
      
      this.isInitialized = true;
      console.log('Database WAL mode and pragmas initialized');
    } catch (error) {
      console.error('Error initializing database pragmas:', error);
      throw error;
    }
  }

  public static getInstance(dbPath?: string): DatabaseConnection {
    if (!DatabaseConnection.instance || (dbPath && DatabaseConnection.instance.db === null)) {
      DatabaseConnection.instance = new DatabaseConnection(dbPath);
    }
    return DatabaseConnection.instance;
  }

  public static resetInstance(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
      DatabaseConnection.instance = null as any;
    }
  }

  public async waitForInitialization(): Promise<void> {
    while (!this.isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  public async initializeSchema(): Promise<void> {
    await this.waitForInitialization();
    return new Promise((resolve, reject) => {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      
      this.db.exec(schema, (err) => {
        if (err) {
          console.error('Error initializing schema:', err);
          reject(err);
        } else {
          console.log('Database schema initialized');
          resolve();
        }
      });
    });
  }

  public getDatabase(): sqlite3.Database {
    return this.db;
  }

  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    await this.waitForInitialization();
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
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
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
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
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
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
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
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
            DatabaseConnection.instance = null as any;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}