import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseConnection } from '../database/connection.js';
import { 
  SystemConfig, 
  ConfigurationPackage, 
  ConfigurationDeployment, 
  KioskConfigStatus 
} from '../types/index.js';

export class ConfigurationService {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Get default system configuration
   */
  getDefaultConfig(): SystemConfig {
    return {
      BULK_INTERVAL_MS: 300,
      RESERVE_TTL_SECONDS: 90,
      OPEN_PULSE_MS: 400,
      OPEN_BURST_SECONDS: 10,
      OPEN_BURST_INTERVAL_MS: 2000,
      MASTER_LOCKOUT_FAILS: 5,
      MASTER_LOCKOUT_MINUTES: 5,
      HEARTBEAT_SEC: 10,
      OFFLINE_SEC: 30,
      LOG_RETENTION_DAYS: 30,
      RATE_LIMIT_IP_PER_MIN: 30,
      RATE_LIMIT_CARD_PER_MIN: 60,
      RATE_LIMIT_LOCKER_PER_MIN: 6,
      RATE_LIMIT_DEVICE_PER_SEC: 20
    };
  }

  /**
   * Create a new configuration package
   */
  async createConfigurationPackage(config: SystemConfig, createdBy: string): Promise<ConfigurationPackage> {
    const version = this.generateConfigVersion();
    const configJson = JSON.stringify(config, null, 2);
    const hash = this.calculateConfigHash(configJson);

    // Check if this exact configuration already exists
    const existing = await this.db.get<ConfigurationPackage>(
      `SELECT * FROM configuration_packages WHERE hash = ?`,
      [hash]
    );

    if (existing) {
      throw new Error(`Configuration with hash ${hash} already exists as version ${existing.version}`);
    }

    // Store configuration package
    await this.db.run(
      `INSERT INTO configuration_packages (version, hash, config, created_by) 
       VALUES (?, ?, ?, ?)`,
      [version, hash, configJson, createdBy]
    );

    // Log configuration creation
    await this.logEvent('config_package_created', {
      version,
      hash,
      created_by: createdBy
    });

    return {
      version,
      hash,
      config,
      created_at: new Date(),
      created_by: createdBy
    };
  }

  /**
   * Get configuration package by version
   */
  async getConfigurationPackage(version: string): Promise<ConfigurationPackage | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM configuration_packages WHERE version = ?`,
      [version]
    );

    if (!row) {
      return null;
    }

    return {
      version: row.version,
      hash: row.hash,
      config: JSON.parse(row.config),
      created_at: new Date(row.created_at),
      created_by: row.created_by
    };
  }

  /**
   * List all configuration packages
   */
  async listConfigurationPackages(): Promise<ConfigurationPackage[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM configuration_packages ORDER BY created_at DESC`
    );

    return rows.map(row => ({
      version: row.version,
      hash: row.hash,
      config: JSON.parse(row.config),
      created_at: new Date(row.created_at),
      created_by: row.created_by
    }));
  }

  /**
   * Deploy configuration to specific kiosk or zone
   */
  async deployConfiguration(
    configVersion: string, 
    target: { kioskId?: string; zone?: string }, 
    createdBy: string
  ): Promise<ConfigurationDeployment> {
    // Validate configuration exists
    const configPackage = await this.getConfigurationPackage(configVersion);
    if (!configPackage) {
      throw new Error(`Configuration version ${configVersion} not found`);
    }

    // Create deployment record
    const result = await this.db.run(
      `INSERT INTO configuration_deployments 
       (config_version, config_hash, kiosk_id, zone, created_by) 
       VALUES (?, ?, ?, ?, ?)`,
      [configVersion, configPackage.hash, target.kioskId || null, target.zone || null, createdBy]
    );

    const deploymentId = result.lastID!;

    // Update kiosk config status for pending deployment
    if (target.kioskId) {
      await this.updateKioskConfigStatus(target.kioskId, {
        pending_config_version: configVersion,
        pending_config_hash: configPackage.hash,
        config_status: 'pending_update'
      });
    } else if (target.zone) {
      // Update all kiosks in zone
      const kiosks = await this.db.all<{ kiosk_id: string }>(
        `SELECT kiosk_id FROM kiosk_heartbeat WHERE zone = ?`,
        [target.zone]
      );

      for (const kiosk of kiosks) {
        await this.updateKioskConfigStatus(kiosk.kiosk_id, {
          pending_config_version: configVersion,
          pending_config_hash: configPackage.hash,
          config_status: 'pending_update'
        });
      }
    } else {
      // Update all kiosks
      const kiosks = await this.db.all<{ kiosk_id: string }>(
        `SELECT kiosk_id FROM kiosk_heartbeat`
      );

      for (const kiosk of kiosks) {
        await this.updateKioskConfigStatus(kiosk.kiosk_id, {
          pending_config_version: configVersion,
          pending_config_hash: configPackage.hash,
          config_status: 'pending_update'
        });
      }
    }

    // Log deployment initiation
    await this.logEvent('config_deployment_initiated', {
      deployment_id: deploymentId,
      config_version: configVersion,
      target,
      created_by: createdBy
    });

    return {
      id: deploymentId,
      config_version: configVersion,
      config_hash: configPackage.hash,
      kiosk_id: target.kioskId,
      zone: target.zone,
      status: 'pending',
      created_by: createdBy
    };
  }

  /**
   * Get pending configuration for a kiosk
   */
  async getPendingConfiguration(kioskId: string): Promise<ConfigurationPackage | null> {
    const status = await this.getKioskConfigStatus(kioskId);
    if (!status || !status.pending_config_version) {
      return null;
    }

    return await this.getConfigurationPackage(status.pending_config_version);
  }

  /**
   * Apply configuration to kiosk (called by kiosk)
   */
  async applyConfiguration(kioskId: string, configVersion: string, configHash: string): Promise<void> {
    // Validate configuration matches expected
    const configPackage = await this.getConfigurationPackage(configVersion);
    if (!configPackage || configPackage.hash !== configHash) {
      throw new Error('Configuration version/hash mismatch');
    }

    // Update kiosk config status to applying
    await this.updateKioskConfigStatus(kioskId, {
      config_status: 'updating'
    });

    try {
      // Simulate atomic configuration apply
      // In real implementation, this would involve file operations and service restarts
      await this.simulateConfigurationApply(kioskId, configPackage);

      // Mark as successfully applied
      await this.updateKioskConfigStatus(kioskId, {
        current_config_version: configVersion,
        current_config_hash: configHash,
        pending_config_version: null,
        pending_config_hash: null,
        last_config_update: new Date(),
        config_status: 'up_to_date'
      });

      // Update deployment status
      await this.db.run(
        `UPDATE configuration_deployments 
         SET status = 'completed', deployed_at = ? 
         WHERE (kiosk_id = ? OR zone = (SELECT zone FROM kiosk_heartbeat WHERE kiosk_id = ?)) 
         AND config_version = ? AND status = 'pending'`,
        [new Date().toISOString(), kioskId, kioskId, configVersion]
      );

      // Log successful application
      await this.logEvent('config_applied', {
        kiosk_id: kioskId,
        config_version: configVersion,
        config_hash: configHash
      }, kioskId);

    } catch (error) {
      // Mark as failed and initiate rollback
      await this.rollbackConfiguration(kioskId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Rollback configuration for a kiosk
   */
  async rollbackConfiguration(kioskId: string, reason: string): Promise<void> {
    const status = await this.getKioskConfigStatus(kioskId);
    if (!status) {
      throw new Error(`Kiosk ${kioskId} not found`);
    }

    // If there's a current config, rollback to it
    if (status.current_config_version) {
      await this.updateKioskConfigStatus(kioskId, {
        pending_config_version: null,
        pending_config_hash: null,
        config_status: 'up_to_date'
      });
    } else {
      // No previous config, mark as failed
      await this.updateKioskConfigStatus(kioskId, {
        pending_config_version: null,
        pending_config_hash: null,
        config_status: 'failed'
      });
    }

    // Update deployment status
    if (status.pending_config_version) {
      await this.db.run(
        `UPDATE configuration_deployments 
         SET status = 'rolled_back', rollback_reason = ? 
         WHERE (kiosk_id = ? OR zone = (SELECT zone FROM kiosk_heartbeat WHERE kiosk_id = ?)) 
         AND config_version = ? AND status IN ('pending', 'in_progress')`,
        [reason, kioskId, kioskId, status.pending_config_version]
      );
    }

    // Log rollback
    await this.logEvent('config_rollback', {
      kiosk_id: kioskId,
      reason,
      rolled_back_version: status.pending_config_version
    }, kioskId);
  }

  /**
   * Get kiosk configuration status
   */
  async getKioskConfigStatus(kioskId: string): Promise<KioskConfigStatus | null> {
    const row = await this.db.get<any>(
      `SELECT * FROM kiosk_config_status WHERE kiosk_id = ?`,
      [kioskId]
    );

    if (!row) {
      return null;
    }

    return {
      kiosk_id: row.kiosk_id,
      current_config_version: row.current_config_version,
      current_config_hash: row.current_config_hash,
      pending_config_version: row.pending_config_version,
      pending_config_hash: row.pending_config_hash,
      last_config_update: row.last_config_update ? new Date(row.last_config_update) : undefined,
      config_status: row.config_status
    };
  }

  /**
   * List all kiosk configuration statuses
   */
  async listKioskConfigStatuses(): Promise<KioskConfigStatus[]> {
    const rows = await this.db.all<any>(
      `SELECT kcs.*, kh.zone 
       FROM kiosk_config_status kcs 
       JOIN kiosk_heartbeat kh ON kcs.kiosk_id = kh.kiosk_id 
       ORDER BY kh.zone, kcs.kiosk_id`
    );

    return rows.map(row => ({
      kiosk_id: row.kiosk_id,
      current_config_version: row.current_config_version,
      current_config_hash: row.current_config_hash,
      pending_config_version: row.pending_config_version,
      pending_config_hash: row.pending_config_hash,
      last_config_update: row.last_config_update ? new Date(row.last_config_update) : undefined,
      config_status: row.config_status
    }));
  }

  /**
   * Get deployment history
   */
  async getDeploymentHistory(limit: number = 50): Promise<ConfigurationDeployment[]> {
    const rows = await this.db.all<any>(
      `SELECT * FROM configuration_deployments 
       ORDER BY created_at DESC LIMIT ?`,
      [limit]
    );

    return rows.map(row => ({
      id: row.id,
      config_version: row.config_version,
      config_hash: row.config_hash,
      kiosk_id: row.kiosk_id,
      zone: row.zone,
      status: row.status,
      deployed_at: row.deployed_at ? new Date(row.deployed_at) : undefined,
      error: row.error,
      rollback_reason: row.rollback_reason,
      created_by: row.created_by
    }));
  }

  // Private helper methods

  private generateConfigVersion(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uuid = uuidv4().split('-')[0];
    return `config-${timestamp}-${uuid}`;
  }

  private calculateConfigHash(configJson: string): string {
    return createHash('sha256').update(configJson).digest('hex');
  }

  private async updateKioskConfigStatus(kioskId: string, updates: Partial<KioskConfigStatus>): Promise<void> {
    // Ensure kiosk config status record exists
    await this.db.run(
      `INSERT OR IGNORE INTO kiosk_config_status (kiosk_id) VALUES (?)`,
      [kioskId]
    );

    // Build update query dynamically
    const fields = Object.keys(updates).filter(key => key !== 'kiosk_id');
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => {
      const value = (updates as any)[field];
      return value instanceof Date ? value.toISOString() : value;
    });

    await this.db.run(
      `UPDATE kiosk_config_status SET ${setClause} WHERE kiosk_id = ?`,
      [...values, kioskId]
    );
  }

  private async simulateConfigurationApply(kioskId: string, configPackage: ConfigurationPackage): Promise<void> {
    // Simulate configuration file write and validation
    // In real implementation, this would:
    // 1. Write configuration to temporary file
    // 2. Validate configuration syntax
    // 3. Backup current configuration
    // 4. Atomically replace configuration file
    // 5. Restart services if needed
    // 6. Verify services are healthy
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
    
    // Simulate potential failure (5% chance for testing)
    if (Math.random() < 0.05) {
      throw new Error('Simulated configuration apply failure');
    }
  }

  private async logEvent(eventType: string, details: any, kioskId?: string): Promise<void> {
    await this.db.run(
      `INSERT INTO events (kiosk_id, event_type, details) VALUES (?, ?, ?)`,
      [kioskId || null, eventType, JSON.stringify(details)]
    );
  }
}