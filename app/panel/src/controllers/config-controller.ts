import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { configManager } from '../../../../shared/services/config-manager.js';
import { CompleteSystemConfig } from '../../../../shared/types/system-config.js';

interface UpdateConfigRequest {
  Body: {
    section: keyof CompleteSystemConfig;
    updates: any;
    reason?: string;
  };
}

interface UpdateParameterRequest {
  Body: {
    section: keyof CompleteSystemConfig;
    parameter: string;
    value: any;
    reason?: string;
  };
}

export class ConfigController {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Register configuration management routes
   */
  async registerRoutes(): Promise<void> {
    // Get complete configuration
    this.fastify.get('/api/config', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const config = configManager.getConfiguration();
        return {
          success: true,
          config
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get configuration'
        });
      }
    });

    // Get system configuration parameters
    this.fastify.get('/api/config/system', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const systemConfig = configManager.getSystemConfig();
        return {
          success: true,
          systemConfig
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get system configuration'
        });
      }
    });

    // Get specific configuration section
    this.fastify.get('/api/config/:section', async (request: FastifyRequest<{ Params: { section: string } }>, reply: FastifyReply) => {
      try {
        const { section } = request.params;
        const config = configManager.getConfiguration();
        
        if (!(section in config)) {
          return reply.code(404).send({
            success: false,
            error: `Configuration section '${section}' not found`
          });
        }

        return {
          success: true,
          section,
          config: (config as any)[section]
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get configuration section'
        });
      }
    });

    // Update configuration section
    this.fastify.put('/api/config/:section', async (request: FastifyRequest<UpdateConfigRequest & { Params: { section: string } }>, reply: FastifyReply) => {
      try {
        const { section } = request.params;
        const { updates, reason } = request.body;
        const staffUser = (request as any).user?.username || 'unknown';

        await configManager.updateConfiguration(
          section as keyof CompleteSystemConfig,
          updates,
          staffUser,
          reason
        );

        return {
          success: true,
          message: `Configuration section '${section}' updated successfully`
        };
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update configuration'
        });
      }
    });

    // Update specific parameter
    this.fastify.patch('/api/config/:section/:parameter', async (request: FastifyRequest<UpdateParameterRequest & { Params: { section: string; parameter: string } }>, reply: FastifyReply) => {
      try {
        const { section, parameter } = request.params;
        const { value, reason } = request.body;
        const staffUser = (request as any).user?.username || 'unknown';

        await configManager.updateParameter(
          section as keyof CompleteSystemConfig,
          parameter,
          value,
          staffUser,
          reason
        );

        return {
          success: true,
          message: `Parameter '${section}.${parameter}' updated successfully`
        };
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update parameter'
        });
      }
    });

    // Validate configuration
    this.fastify.post('/api/config/validate', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      try {
        const { config } = request.body;
        const validation = configManager.validateConfiguration(config);

        return {
          success: true,
          validation
        };
      } catch (error) {
        return reply.code(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to validate configuration'
        });
      }
    });

    // Reset to defaults
    this.fastify.post('/api/config/reset', async (request: FastifyRequest<{ Body: { reason?: string } }>, reply: FastifyReply) => {
      try {
        const { reason } = request.body;
        const staffUser = (request as any).user?.username || 'unknown';

        await configManager.resetToDefaults(staffUser, reason);

        return {
          success: true,
          message: 'Configuration reset to defaults successfully'
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reset configuration'
        });
      }
    });

    // Get configuration change history
    this.fastify.get('/api/config/history', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit) : 50;
        const history = await configManager.getConfigChangeHistory(limit);

        return {
          success: true,
          history
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get configuration history'
        });
      }
    });

    // Reload configuration from file
    this.fastify.post('/api/config/reload', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await configManager.loadConfiguration();

        return {
          success: true,
          message: 'Configuration reloaded successfully'
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reload configuration'
        });
      }
    });
  }
}