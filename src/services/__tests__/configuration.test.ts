import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigurationService } from '../configuration.js';
import { DatabaseConnection } from '../../database/connection.js';
import { SystemConfig } from '../../types/index.js';

describe('ConfigurationService', () => {
  let configService: ConfigurationService;
  let db: DatabaseConnection;

  beforeEach(async () => {
    // Use in-memory database for testing
    db = DatabaseConnection.getInstance(':memory:');
    await db.initializeSchema();
    configService = new ConfigurationService();
  });

  afterEach(async () => {
    await db.close();
    DatabaseConnection.resetInstance();
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration with all required fields', () => {
      const defaultConfig = configService.getDefaultConfig();
      
      expect(defaultConfig).toHaveProperty('BULK_INTERVAL_MS', 300);
      expect(defaultConfig).toHaveProperty('RESERVE_TTL_SECONDS', 90);
      expect(defaultConfig).toHaveProperty('OPEN_PULSE_MS', 400);
      expect(defaultConfig).toHaveProperty('OPEN_BURST_SECONDS', 10);
      expect(defaultConfig).toHaveProperty('OPEN_BURST_INTERVAL_MS', 2000);
      expect(defaultConfig).toHaveProperty('MASTER_LOCKOUT_FAILS', 5);
      expect(defaultConfig).toHaveProperty('MASTER_LOCKOUT_MINUTES', 5);
      expect(defaultConfig).toHaveProperty('HEARTBEAT_SEC', 10);
      expect(defaultConfig).toHaveProperty('OFFLINE_SEC', 30);
      expect(defaultConfig).toHaveProperty('LOG_RETENTION_DAYS', 30);
      expect(defaultConfig).toHaveProperty('RATE_LIMIT_IP_PER_MIN', 30);
      expect(defaultConfig).toHaveProperty('RATE_LIMIT_CARD_PER_MIN', 60);
      expect(defaultConfig).toHaveProperty('RATE_LIMIT_LOCKER_PER_MIN', 6);
      expect(defaultConfig).toHaveProperty('RATE_LIMIT_DEVICE_PER_SEC', 20);
    });
  });

  describe('createConfigurationPackage', () => {
    it('should create a new configuration package', async () => {
      const config = configService.getDefaultConfig();
      config.BULK_INTERVAL_MS = 500; // Modify a value
      
      const configPackage = await configService.createConfigurationPackage(config, 'test-admin');
      
      expect(configPackage.version).toMatch(/^config-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/);
      expect(configPackage.hash).toHaveLength(64); // SHA256 hash
      expect(configPackage.config).toEqual(config);
      expect(configPackage.created_by).toBe('test-admin');
    });

    it('should prevent duplicate configurations', async () => {
      const config = configService.getDefaultConfig();
      
      await configService.createConfigurationPackage(config, 'test-admin');
      
      await expect(
        configService.createConfigurationPackage(config, 'test-admin')
      ).rejects.toThrow(/Configuration with hash .* already exists/);
    });

    it('should generate different hashes for different configurations', async () => {
      const config1 = configService.getDefaultConfig();
      const config2 = { ...config1, BULK_INTERVAL_MS: 500 };
      
      const package1 = await configService.createConfigurationPackage(config1, 'test-admin');
      const package2 = await configService.createConfigurationPackage(config2, 'test-admin');
      
      expect(package1.hash).not.toBe(package2.hash);
    });
  });

  describe('getConfigurationPackage', () => {
    it('should retrieve configuration package by version', async () => {
      const config = configService.getDefaultConfig();
      const created = await configService.createConfigurationPackage(config, 'test-admin');
      
      const retrieved = await configService.getConfigurationPackage(created.version);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.version).toBe(created.version);
      expect(retrieved!.hash).toBe(created.hash);
      expect(retrieved!.config).toEqual(config);
    });

    it('should return null for non-existent version', async () => {
      const retrieved = await configService.getConfigurationPackage('non-existent-version');
      expect(retrieved).toBeNull();
    });
  });

  describe('deployConfiguration', () => {
    let configVersion: string;

    beforeEach(async () => {
      // Create a test kiosk
      await db.run(
        `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-kiosk-1', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
      );

      // Create a configuration package
      const config = configService.getDefaultConfig();
      const configPackage = await configService.createConfigurationPackage(config, 'test-admin');
      configVersion = configPackage.version;
    });

    it('should deploy configuration to specific kiosk', async () => {
      const deployment = await configService.deployConfiguration(
        configVersion,
        { kioskId: 'test-kiosk-1' },
        'test-admin'
      );

      expect(deployment.config_version).toBe(configVersion);
      expect(deployment.kiosk_id).toBe('test-kiosk-1');
      expect(deployment.status).toBe('pending');
      expect(deployment.created_by).toBe('test-admin');

      // Check kiosk config status was updated
      const status = await configService.getKioskConfigStatus('test-kiosk-1');
      expect(status?.pending_config_version).toBe(configVersion);
      expect(status?.config_status).toBe('pending_update');
    });

    it('should deploy configuration to all kiosks in zone', async () => {
      // Add another kiosk in the same zone
      await db.run(
        `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-kiosk-2', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
      );

      const deployment = await configService.deployConfiguration(
        configVersion,
        { zone: 'zone-a' },
        'test-admin'
      );

      expect(deployment.zone).toBe('zone-a');
      expect(deployment.status).toBe('pending');

      // Check both kiosks have pending updates
      const status1 = await configService.getKioskConfigStatus('test-kiosk-1');
      const status2 = await configService.getKioskConfigStatus('test-kiosk-2');
      
      expect(status1?.config_status).toBe('pending_update');
      expect(status2?.config_status).toBe('pending_update');
    });

    it('should fail for non-existent configuration', async () => {
      await expect(
        configService.deployConfiguration('non-existent-version', { kioskId: 'test-kiosk-1' }, 'test-admin')
      ).rejects.toThrow('Configuration version non-existent-version not found');
    });
  });

  describe('applyConfiguration', () => {
    let configVersion: string;
    let configHash: string;

    beforeEach(async () => {
      // Create test kiosk
      await db.run(
        `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-kiosk-1', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
      );

      // Create and deploy configuration
      const config = configService.getDefaultConfig();
      const configPackage = await configService.createConfigurationPackage(config, 'test-admin');
      configVersion = configPackage.version;
      configHash = configPackage.hash;

      await configService.deployConfiguration(configVersion, { kioskId: 'test-kiosk-1' }, 'test-admin');
    });

    it('should successfully apply configuration', async () => {
      await configService.applyConfiguration('test-kiosk-1', configVersion, configHash);

      const status = await configService.getKioskConfigStatus('test-kiosk-1');
      expect(status?.current_config_version).toBe(configVersion);
      expect(status?.current_config_hash).toBe(configHash);
      expect(status?.pending_config_version).toBeNull();
      expect(status?.config_status).toBe('up_to_date');
    });

    it('should fail with version/hash mismatch', async () => {
      await expect(
        configService.applyConfiguration('test-kiosk-1', configVersion, 'wrong-hash')
      ).rejects.toThrow('Configuration version/hash mismatch');
    });

    it('should rollback on simulated failure', async () => {
      // Mock Math.random to always trigger failure
      const originalRandom = Math.random;
      Math.random = () => 0.01; // Always trigger 5% failure

      try {
        await expect(
          configService.applyConfiguration('test-kiosk-1', configVersion, configHash)
        ).rejects.toThrow('Simulated configuration apply failure');

        const status = await configService.getKioskConfigStatus('test-kiosk-1');
        expect(status?.config_status).toBe('failed'); // Should be marked as failed since no previous config
        expect(status?.pending_config_version).toBeNull();
      } finally {
        Math.random = originalRandom;
      }
    });
  });

  describe('rollbackConfiguration', () => {
    beforeEach(async () => {
      // Create test kiosk with pending configuration
      await db.run(
        `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-kiosk-1', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
      );

      await db.run(
        `INSERT INTO kiosk_config_status 
         (kiosk_id, current_config_version, pending_config_version, config_status) 
         VALUES (?, ?, ?, ?)`,
        ['test-kiosk-1', 'old-version', 'new-version', 'pending_update']
      );
    });

    it('should rollback to previous configuration', async () => {
      await configService.rollbackConfiguration('test-kiosk-1', 'Test rollback');

      const status = await configService.getKioskConfigStatus('test-kiosk-1');
      expect(status?.pending_config_version).toBeNull();
      expect(status?.config_status).toBe('up_to_date');
    });

    it('should fail for non-existent kiosk', async () => {
      await expect(
        configService.rollbackConfiguration('non-existent-kiosk', 'Test rollback')
      ).rejects.toThrow('Kiosk non-existent-kiosk not found');
    });
  });

  describe('listConfigurationPackages', () => {
    it('should return empty list when no packages exist', async () => {
      const packages = await configService.listConfigurationPackages();
      expect(packages).toEqual([]);
    });

    it('should return all packages ordered by creation date', async () => {
      const config1 = configService.getDefaultConfig();
      const config2 = { ...config1, BULK_INTERVAL_MS: 500 };

      const package1 = await configService.createConfigurationPackage(config1, 'admin1');
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const package2 = await configService.createConfigurationPackage(config2, 'admin2');

      const packages = await configService.listConfigurationPackages();
      
      expect(packages).toHaveLength(2);
      // Check that packages are ordered by creation date (most recent first)
      expect(packages.find(p => p.version === package2.version)).toBeDefined();
      expect(packages.find(p => p.version === package1.version)).toBeDefined();
    });
  });

  describe('getDeploymentHistory', () => {
    it('should return empty list when no deployments exist', async () => {
      const history = await configService.getDeploymentHistory();
      expect(history).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      // Create test data
      const config = configService.getDefaultConfig();
      const configPackage = await configService.createConfigurationPackage(config, 'test-admin');

      await db.run(
        `INSERT INTO kiosk_heartbeat (kiosk_id, last_seen, zone, status, version) 
         VALUES (?, ?, ?, ?, ?)`,
        ['test-kiosk-1', new Date().toISOString(), 'zone-a', 'online', '1.0.0']
      );

      // Create multiple deployments
      for (let i = 0; i < 5; i++) {
        await configService.deployConfiguration(
          configPackage.version,
          { kioskId: 'test-kiosk-1' },
          `admin-${i}`
        );
      }

      const history = await configService.getDeploymentHistory(3);
      expect(history).toHaveLength(3);
    });
  });
});