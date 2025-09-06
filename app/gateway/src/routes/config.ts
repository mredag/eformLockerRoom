import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfigurationManager } from '../../../../shared/services/configuration-manager';
import { getFeatureFlagService } from '../../../../shared/services/feature-flag-service';

interface ConfigRequest {
  Params: {
    kioskId?: string;
  };
  Body: {
    [key: string]: any;
  };
  Querystring: {
    key?: string;
    limit?: number;
  };
}

export async function configRoutes(fastify: FastifyInstance) {
  const configManager = getConfigurationManager();
  const featureFlagService = getFeatureFlagService();

  // Get effective configuration for a kiosk
  fastify.get<ConfigRequest>('/admin/config/effective/:kioskId', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const effectiveConfig = await configManager.getEffectiveConfig(kioskId);
      
      return {
        success: true,
        config: effectiveConfig,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting effective config:', error);
      reply.code(500);
      return { error: 'Failed to get effective configuration' };
    }
  });

  // Get global configuration
  fastify.get('/admin/config/global', async (request, reply) => {
    try {
      const globalConfig = await configManager.getGlobalConfig();
      const version = await configManager.getCurrentVersion();
      
      return {
        success: true,
        config: globalConfig,
        version,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting global config:', error);
      reply.code(500);
      return { error: 'Failed to get global configuration' };
    }
  });

  // Update global configuration
  fastify.put<ConfigRequest>('/admin/config/global', async (request, reply) => {
    try {
      const updates = request.body;
      const updatedBy = 'admin'; // TODO: Get from authentication
      
      // Validate updates
      for (const [key, value] of Object.entries(updates)) {
        const validation = configManager.validateConfigValue(key, value);
        if (!validation.valid) {
          reply.code(400);
          return { error: validation.error };
        }
      }

      await configManager.updateGlobalConfig(updates, updatedBy);
      
      // Log feature flag changes
      if ('smart_assignment_enabled' in updates) {
        const enabled = updates.smart_assignment_enabled;
        console.log(`🎯 Smart assignment ${enabled ? 'enabled' : 'disabled'} globally by ${updatedBy}`);
      }
      
      return {
        success: true,
        message: `Updated ${Object.keys(updates).length} configuration values`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error updating global config:', error);
      reply.code(500);
      return { error: 'Failed to update global configuration' };
    }
  });

  // Get kiosk-specific overrides
  fastify.get<ConfigRequest>('/admin/config/override/:kioskId', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const overrides = await configManager.getKioskOverrides(kioskId);
      
      return {
        success: true,
        kiosk_id: kioskId,
        overrides,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting kiosk overrides:', error);
      reply.code(500);
      return { error: 'Failed to get kiosk overrides' };
    }
  });

  // Set kiosk-specific override
  fastify.put<ConfigRequest>('/admin/config/override/:kioskId', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const { key, value } = request.body;
      const updatedBy = 'admin'; // TODO: Get from authentication
      
      if (!kioskId || !key || value === undefined) {
        reply.code(400);
        return { error: 'kioskId, key, and value are required' };
      }

      // Validate the configuration value
      const validation = configManager.validateConfigValue(key, value);
      if (!validation.valid) {
        reply.code(400);
        return { error: validation.error };
      }

      await configManager.setKioskOverride(kioskId, key, value, updatedBy);
      
      // Log feature flag changes
      if (key === 'smart_assignment_enabled') {
        console.log(`🎯 Smart assignment ${value ? 'enabled' : 'disabled'} for kiosk ${kioskId} by ${updatedBy}`);
      }
      
      return {
        success: true,
        message: `Set override ${key} = ${value} for kiosk ${kioskId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error setting kiosk override:', error);
      reply.code(500);
      return { error: 'Failed to set kiosk override' };
    }
  });

  // Remove kiosk-specific override
  fastify.delete<ConfigRequest>('/admin/config/override/:kioskId', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const { key } = request.query;
      
      if (!kioskId || !key) {
        reply.code(400);
        return { error: 'kioskId and key are required' };
      }

      await configManager.removeKioskOverride(kioskId, key);
      
      // Log feature flag changes
      if (key === 'smart_assignment_enabled') {
        console.log(`🎯 Smart assignment override removed for kiosk ${kioskId}`);
      }
      
      return {
        success: true,
        message: `Removed override ${key} for kiosk ${kioskId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error removing kiosk override:', error);
      reply.code(500);
      return { error: 'Failed to remove kiosk override' };
    }
  });

  // Feature flag specific endpoints
  fastify.get('/admin/feature-flags', async (request, reply) => {
    try {
      const allFlags = await featureFlagService.getAllKioskFlags();
      
      return {
        success: true,
        feature_flags: allFlags,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting feature flags:', error);
      reply.code(500);
      return { error: 'Failed to get feature flags' };
    }
  });

  // Get feature flags for specific kiosk
  fastify.get<ConfigRequest>('/admin/feature-flags/:kioskId', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const flags = await featureFlagService.getFeatureFlags(kioskId);
      
      return {
        success: true,
        kiosk_id: kioskId,
        feature_flags: flags,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting kiosk feature flags:', error);
      reply.code(500);
      return { error: 'Failed to get kiosk feature flags' };
    }
  });

  // Toggle smart assignment for a kiosk
  fastify.post<ConfigRequest>('/admin/feature-flags/:kioskId/toggle-smart-assignment', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      const updatedBy = 'admin'; // TODO: Get from authentication
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const newState = await featureFlagService.toggleSmartAssignment(kioskId, updatedBy);
      
      return {
        success: true,
        kiosk_id: kioskId,
        smart_assignment_enabled: newState,
        message: `Smart assignment ${newState ? 'enabled' : 'disabled'} for kiosk ${kioskId}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error toggling smart assignment:', error);
      reply.code(500);
      return { error: 'Failed to toggle smart assignment' };
    }
  });

  // Enable smart assignment globally
  fastify.post('/admin/feature-flags/global/enable-smart-assignment', async (request, reply) => {
    try {
      const updatedBy = 'admin'; // TODO: Get from authentication
      
      await featureFlagService.enableSmartAssignment(undefined, updatedBy);
      
      return {
        success: true,
        smart_assignment_enabled: true,
        message: 'Smart assignment enabled globally',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error enabling smart assignment globally:', error);
      reply.code(500);
      return { error: 'Failed to enable smart assignment globally' };
    }
  });

  // Disable smart assignment globally
  fastify.post('/admin/feature-flags/global/disable-smart-assignment', async (request, reply) => {
    try {
      const updatedBy = 'admin'; // TODO: Get from authentication
      
      await featureFlagService.disableSmartAssignment(undefined, updatedBy);
      
      return {
        success: true,
        smart_assignment_enabled: false,
        message: 'Smart assignment disabled globally',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error disabling smart assignment globally:', error);
      reply.code(500);
      return { error: 'Failed to disable smart assignment globally' };
    }
  });

  // Test feature flag switching
  fastify.post<ConfigRequest>('/admin/feature-flags/:kioskId/test', async (request, reply) => {
    try {
      const { kioskId } = request.params;
      
      if (!kioskId) {
        reply.code(400);
        return { error: 'kioskId is required' };
      }

      const testResult = await featureFlagService.testFeatureFlagSwitching(kioskId);
      
      return {
        success: testResult.success,
        kiosk_id: kioskId,
        test_logs: testResult.logs,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error testing feature flag switching:', error);
      reply.code(500);
      return { error: 'Failed to test feature flag switching' };
    }
  });

  // Get configuration change history
  fastify.get<ConfigRequest>('/admin/config/history', async (request, reply) => {
    try {
      const { key, limit } = request.query;
      const kioskId = request.query.kiosk_id as string | undefined;
      
      const history = await configManager.getConfigHistory(
        kioskId === 'null' ? null : kioskId,
        key,
        limit || 50
      );
      
      return {
        success: true,
        history,
        filters: { kiosk_id: kioskId, key, limit: limit || 50 },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting config history:', error);
      reply.code(500);
      return { error: 'Failed to get configuration history' };
    }
  });

  // Trigger manual configuration reload
  fastify.post('/admin/config/reload', async (request, reply) => {
    try {
      await configManager.triggerReload();
      
      return {
        success: true,
        message: 'Configuration reloaded successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error reloading configuration:', error);
      reply.code(500);
      return { error: 'Failed to reload configuration' };
    }
  });

  // Get current configuration version
  fastify.get('/admin/config/version', async (request, reply) => {
    try {
      const version = await configManager.getCurrentVersion();
      
      return {
        success: true,
        version,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting config version:', error);
      reply.code(500);
      return { error: 'Failed to get configuration version' };
    }
  });
}