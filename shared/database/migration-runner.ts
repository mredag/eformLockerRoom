import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from './connection';

export interface Migration {
  id: number;
  filename: string;
  applied_at: Date;
  checksum: string;
}

export class MigrationRunner {
  private db: DatabaseConnection;
  private migrationsPath: string;

  constructor(migrationsPath: string = './migrations') {
    this.db = DatabaseConnection.getInstance();
    this.migrationsPath = migrationsPath;
  }

  /**
   * Initialize the migrations table
   */
  async initializeMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT NOT NULL
      )
    `;
    await this.db.run(sql);
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    await this.initializeMigrationsTable();
    return await this.db.all<Migration>(
      'SELECT * FROM schema_migrations ORDER BY id'
    );
  }

  /**
   * Get list of pending migrations
   */
  async getPendingMigrations(): Promise<string[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedFilenames = new Set(appliedMigrations.map(m => m.filename));
    
    const allMigrationFiles = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return allMigrationFiles.filter(file => !appliedFilenames.has(file));
  }

  /**
   * Calculate checksum for migration file
   */
  private async calculateChecksum(content: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Extract migration ID from filename
   */
  private extractMigrationId(filename: string): number {
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      throw new Error(`Invalid migration filename format: ${filename}`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Apply a single migration
   */
  async applyMigration(filename: string): Promise<void> {
    const migrationPath = join(this.migrationsPath, filename);
    const content = readFileSync(migrationPath, 'utf8');
    const checksum = await this.calculateChecksum(content);
    const migrationId = this.extractMigrationId(filename);

    console.log(`Applying migration: ${filename}`);

    try {
      // Execute the migration SQL
      await this.db.beginTransaction();
      
      // Execute the entire migration as one statement
      // SQLite can handle multiple statements separated by semicolons
      console.log(`Executing migration SQL...`);
      
      try {
        // Use exec for multiple statements
        await this.db.exec(content);
      } catch (error) {
        console.error(`Error executing migration: ${error}`);
        throw error;
      }

      // Record the migration as applied
      await this.db.run(
        'INSERT INTO schema_migrations (id, filename, checksum) VALUES (?, ?, ?)',
        [migrationId, filename, checksum]
      );

      await this.db.commit();
      console.log(`✓ Migration ${filename} applied successfully`);

    } catch (error) {
      await this.db.rollback();
      console.error(`✗ Migration ${filename} failed:`, error);
      throw error;
    }
  }

  /**
   * Apply all pending migrations
   */
  async runMigrations(): Promise<void> {
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s)`);

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    console.log('All migrations applied successfully');
  }

  /**
   * Verify migration checksums
   */
  async verifyMigrations(): Promise<boolean> {
    const appliedMigrations = await this.getAppliedMigrations();
    let allValid = true;

    for (const migration of appliedMigrations) {
      try {
        const migrationPath = join(this.migrationsPath, migration.filename);
        const content = readFileSync(migrationPath, 'utf8');
        const currentChecksum = await this.calculateChecksum(content);

        if (currentChecksum !== migration.checksum) {
          console.error(`✗ Migration ${migration.filename} checksum mismatch`);
          console.error(`  Expected: ${migration.checksum}`);
          console.error(`  Current:  ${currentChecksum}`);
          allValid = false;
        } else {
          console.log(`✓ Migration ${migration.filename} checksum valid`);
        }
      } catch (error) {
        console.error(`✗ Migration ${migration.filename} file not found`);
        allValid = false;
      }
    }

    return allValid;
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    applied: Migration[];
    pending: string[];
    total: number;
  }> {
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    
    return {
      applied,
      pending,
      total: applied.length + pending.length
    };
  }
}
