import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../database/database-manager';
import { getConfigurationSeeder, resetConfigurationSeeder } from '../configuration-seeder';
import { getConfigurationManager, resetConfigurationManager } from '../configuration-manager';
import { DatabaseConnection } from '../../database/connection';
import { promises as fs } from 'fs';
import path from 'path';

describe('Configuration Seeding Integration', () => {
  let dbManager: DatabaseManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create unique test database path
    testDbPath = path.join(process.cwd(), 'data', 'test', `config-seeding-${Date.now()}.db`);
    
    // Ensure test directory exists
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    
    // Reset singletons
    resetConfigurationSeeder();
    resetConfigurationManager();
    DatabaseManager.resetInstance({ path: testDbPath });
    
    // Create fresh database manager
    dbManager = DatabaseManager.getInstance({ 
      path: testDbPath,
      migrationsPath: './migrations'
    });
  });

  afterEach(async () => {
    try {
      await dbManager.close();
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore cleanup errors
    }
    
    resetConfigurationSeeder();
    resetConfigurationManager();
    DatabaseManager.resetInstance({ path: testDbPath });
  });

  it('should seed configuration during database initialization', async () => {
    // Initialize database (should trigger seeding)
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    
    // Verify configuration was seeded
    const configCount = await connection.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings_global'
    );
    
    expect(configCount?.count).toBeGreaterThan(0);
    
    // Verify critical configurations
    const smartAssignmentEnabled = await connection.get<{ value: string; data_type: string }>(
      'SELECT value, data_type FROM settings_global WHERE key = ?',
      ['smart_assignment_enabled']
    );
    
    expect(smartAssignmentEnabled).toBeDefined();
    expect(smartAssignmentEnabled?.value).toBe('false');
    expect(smartAssignmentEnabled?.data_type).toBe('boolean');
    
    const sessionLimit = await connection.get<{ value: string; data_type: string }>(
      'SELECT value, data_type FROM settings_global WHERE key = ?',
      ['session_limit_minutes']
    );
    
    expect(sessionLimit).toBeDefined();
    expect(sessionLimit?.value).toBe('180');
    expect(sessionLimit?.data_type).toBe('number');
  });

  it('should not duplicate configuration on subsequent initializations', async () => {
    // First initialization
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    
    const firstCount = await connection.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings_global'
    );
    
    // Second initialization (should not duplicate)
    const seeder = getConfigurationSeeder(connection);
    await seeder.initialize();
    
    const secondCount = await connection.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings_global'
    );
    
    expect(secondCount?.count).toBe(firstCount?.count);
  });

  it('should work with configuration manager after seeding', async () => {
    // Initialize database with seeding
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    const configManager = getConfigurationManager(connection);
    
    // Initialize configuration manager
    await configManager.initialize();
    
    // Test getting effective configuration
    const effectiveConfig = await configManager.getEffectiveConfig('test-kiosk');
    
    expect(effectiveConfig.smart_assignment_enabled).toBe(false);
    expect(effectiveConfig.session_limit_minutes).toBe(180);
    expect(effectiveConfig.base_score).toBe(100);
    expect(effectiveConfig.version).toBeGreaterThan(0);
  });

  it('should validate seeded configuration values', async () => {
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    
    // Check all seeded values have proper data types
    const configs = await connection.all<{ key: string; value: string; data_type: string }>(
      'SELECT key, value, data_type FROM settings_global'
    );
    
    expect(configs.length).toBeGreaterThan(0);
    
    for (const config of configs) {
      // Verify data type consistency
      switch (config.data_type) {
        case 'boolean':
          expect(['true', 'false']).toContain(config.value);
          break;
        case 'number':
          expect(isNaN(parseFloat(config.value))).toBe(false);
          break;
        case 'string':
          expect(typeof config.value).toBe('string');
          break;
        case 'json':
          expect(() => JSON.parse(config.value)).not.toThrow();
          break;
      }
    }
  });

  it('should initialize config version tracking', async () => {
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    
    // Verify config version was initialized
    const version = await connection.get<{ version: number }>(
      'SELECT version FROM config_version WHERE id = 1'
    );
    
    expect(version).toBeDefined();
    expect(version?.version).toBeGreaterThan(0);
  });

  it('should handle seeding errors gracefully', async () => {
    // Create database manager but don't run migrations first
    const badDbManager = DatabaseManager.getInstance({ 
      path: testDbPath + '_bad',
      migrationsPath: './nonexistent'
    });
    
    // This should not throw even if seeding fails
    await expect(badDbManager.initialize()).rejects.toThrow();
    
    await badDbManager.close();
  });

  it('should seed all required configuration keys', async () => {
    await dbManager.initialize();
    
    const connection = dbManager.getConnection();
    
    // Check for critical configuration keys
    const criticalKeys = [
      'smart_assignment_enabled',
      'session_limit_minutes',
      'base_score',
      'score_factor_a',
      'score_factor_b',
      'top_k_candidates',
      'quarantine_minutes_base',
      'quarantine_minutes_ceiling',
      'reserve_ratio',
      'reserve_minimum',
      'sensorless_pulse_ms',
      'card_rate_limit_seconds'
    ];
    
    for (const key of criticalKeys) {
      const config = await connection.get<{ key: string }>(
        'SELECT key FROM settings_global WHERE key = ?',
        [key]
      );
      
      expect(config).toBeDefined();
      expect(config?.key).toBe(key);
    }
  });
});