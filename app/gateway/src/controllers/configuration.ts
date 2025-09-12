import { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigurationService } from '../services/configuration';
import { SystemConfig } from '../../../../shared/types/index';

export class ConfigurationController {
  private configService: ConfigurationService;

  constructor() {
    this.configService = new ConfigurationService();
  }

  /**
   * Get default configuration template
   */
  async getDefaultConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const defaultConfig = this.configService.getDefaultConfig();
      reply.send({
        success: true,
        data: defaultConfig
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create new configuration package
   */
  async createConfigurationPackage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { config, created_by } = request.body as { config: SystemConfig; created_by: string };

      if (!config || !created_by) {
        reply.status(400).send({
          success: false,
          error: 'Missing required fields: config, created_by'
        });
        return;
      }

      // Validate configuration structure
      const defaultConfig = this.configService.getDefaultConfig();
      const missingKeys = Object.keys(defaultConfig).filter(key => !(key in config));
      if (missingKeys.length > 0) {
        reply.status(400).send({
          success: false,
          error: `Missing configuration keys: ${missingKeys.join(', ')}`
        });
        return;
      }

      const configPackage = await this.configService.createConfigurationPackage(config, created_by);
      
      reply.send({
        success: true,
        data: configPackage
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get configuration package by version
   */
  async getConfigurationPackage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { version } = request.params as { version: string };
      
      const configPackage = await this.configService.getConfigurationPackage(version);
      if (!configPackage) {
        reply.status(404).send({
          success: false,
          error: 'Configuration package not found'
        });
        return;
      }

      reply.send({
        success: true,
        data: configPackage
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * List all configuration packages
   */
  async listConfigurationPackages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const packages = await this.configService.listConfigurationPackages();
      
      reply.send({
        success: true,
        data: packages
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Deploy configuration to kiosks
   */
  async deployConfiguration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { 
        config_version, 
        target, 
        created_by 
      } = request.body as { 
        config_version: string; 
        target: { kiosk_id?: string; zone?: string }; 
        created_by: string 
      };

      if (!config_version || !created_by) {
        reply.status(400).send({
          success: false,
          error: 'Missing required fields: config_version, created_by'
        });
        return;
      }

      const deployment = await this.configService.deployConfiguration(
        config_version, 
        { kioskId: target?.kiosk_id, zone: target?.zone }, 
        created_by
      );
      
      reply.send({
        success: true,
        data: deployment
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get pending configuration for kiosk (called by kiosk)
   */
  async getPendingConfiguration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.params as { kiosk_id: string };
      
      const pendingConfig = await this.configService.getPendingConfiguration(kiosk_id);
      
      reply.send({
        success: true,
        data: pendingConfig
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Apply configuration (called by kiosk)
   */
  async applyConfiguration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.params as { kiosk_id: string };
      const { config_version, config_hash } = request.body as { config_version: string; config_hash: string };

      if (!config_version || !config_hash) {
        reply.status(400).send({
          success: false,
          error: 'Missing required fields: config_version, config_hash'
        });
        return;
      }

      await this.configService.applyConfiguration(kiosk_id, config_version, config_hash);
      
      reply.send({
        success: true,
        message: 'Configuration applied successfully'
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Rollback configuration (called by kiosk or panel)
   */
  async rollbackConfiguration(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.params as { kiosk_id: string };
      const { reason } = request.body as { reason: string };

      if (!reason) {
        reply.status(400).send({
          success: false,
          error: 'Missing required field: reason'
        });
        return;
      }

      await this.configService.rollbackConfiguration(kiosk_id, reason);
      
      reply.send({
        success: true,
        message: 'Configuration rolled back successfully'
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get kiosk configuration status
   */
  async getKioskConfigStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { kiosk_id } = request.params as { kiosk_id: string };
      
      const status = await this.configService.getKioskConfigStatus(kiosk_id);
      if (!status) {
        reply.status(404).send({
          success: false,
          error: 'Kiosk not found'
        });
        return;
      }

      reply.send({
        success: true,
        data: status
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * List all kiosk configuration statuses (for panel)
   */
  async listKioskConfigStatuses(request: FastifyRequest, reply: FastifyReply) {
    try {
      const statuses = await this.configService.listKioskConfigStatuses();
      
      reply.send({
        success: true,
        data: statuses
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get deployment history (for panel)
   */
  async getDeploymentHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { limit } = request.query as { limit?: string };
      const limitNum = limit ? parseInt(limit, 10) : 50;
      
      const history = await this.configService.getDeploymentHistory(limitNum);
      
      reply.send({
        success: true,
        data: history
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
