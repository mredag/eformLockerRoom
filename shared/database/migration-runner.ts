import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from './connection';

/**
 * Represents a single migration record as stored in the `schema_migrations` table.
 */
export interface Migration {
  id: number;
  filename: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Manages the database schema migration process.
 * This class is responsible for finding, applying, and verifying SQL migration files
 * to ensure the database schema is up-to-date and consistent.
 */
export class MigrationRunner {
  private db: DatabaseConnection;
  private migrationsPath: string;

  /**
   * Creates an instance of MigrationRunner.
   * @param {string} [migrationsPath='./migrations'] - The path to the directory containing SQL migration files.
   */
  constructor(migrationsPath: string = './migrations') {
    this.db = DatabaseConnection.getInstance();
    this.migrationsPath = migrationsPath;
  }

  /**
   * Ensures the `schema_migrations` table exists in the database.
   * This table is used to track which migrations have been applied.
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
   * Retrieves a list of all migrations that have been applied to the database.
   * @returns {Promise<Migration[]>} A promise that resolves to an array of applied migrations.
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    await this.initializeMigrationsTable();
    return await this.db.all<Migration>(
      'SELECT * FROM schema_migrations ORDER BY id'
    );
  }

  /**
   * Compares the migrations on disk with the applied migrations in the database
   * to determine which migrations need to be run.
   * @returns {Promise<string[]>} A promise that resolves to an array of pending migration filenames.
   */
  async getPendingMigrations(): Promise<string[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedFilenames = new Set(appliedMigrations.map(m => m.filename.trim()));
    
    const allMigrationFiles = readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .map(file => file.trim())
      .sort();

    const pending = allMigrationFiles.filter(file => !appliedFilenames.has(file));
    return pending;
  }

  /**
   * Calculates the SHA-256 checksum of a migration file's content.
   * @private
   * @param {string} content - The content of the migration file.
   * @returns {Promise<string>} The hex-encoded checksum.
   */
  private async calculateChecksum(content: string): Promise<string> {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Extracts the numeric ID from the beginning of a migration filename (e.g., "001_...").
   * @private
   * @param {string} filename - The migration filename.
   * @returns {number} The extracted migration ID.
   * @throws {Error} If the filename is not in the expected format.
   */
  private extractMigrationId(filename: string): number {
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      throw new Error(`Invalid migration filename format: ${filename}`);
    }
    return parseInt(match[1], 10);
  }

  /**
   * Applies a single migration file to the database within a transaction.
   * If the migration succeeds, a record is added to the `schema_migrations` table.
   * If it fails, the transaction is rolled back.
   * @param {string} filename - The filename of the migration to apply.
   */
  async applyMigration(filename: string): Promise<void> {
    const migrationPath = join(this.migrationsPath, filename);
    const content = readFileSync(migrationPath, 'utf8');
    const checksum = await this.calculateChecksum(content);
    const migrationId = this.extractMigrationId(filename);

    console.log(`Applying migration: ${filename}`);

    try {
      await this.db.beginTransaction();
      
      console.log(`Executing migration SQL...`);
      
      try {
        await this.db.exec(content);
      } catch (error) {
        console.error(`Error executing migration: ${error}`);
        throw error;
      }

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
   * Finds and applies all pending migrations in order.
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
   * Verifies the integrity of applied migrations by comparing the checksums stored
   * in the database with the current checksums of the migration files on disk.
   * @returns {Promise<boolean>} True if all checksums match, false otherwise.
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
        console.warn(`⚠ Migration ${migration.filename} file not found (already applied)`);
      }
    }

    return allValid;
  }

  /**
   * Gets the current status of all migrations, including which have been applied and which are pending.
   * @returns {Promise<object>} An object containing the applied and pending migrations.
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
