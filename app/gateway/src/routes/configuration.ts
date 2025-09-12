import { FastifyInstance } from 'fastify';
import { ConfigurationController } from '../controllers/configuration';

export async function configurationRoutes(fastify: FastifyInstance) {
  const configController = new ConfigurationController();

  // Panel endpoints (staff management interface)
  
  // Get default configuration template
  fastify.get('/default', configController.getDefaultConfig.bind(configController));
  
  // Create new configuration package
  fastify.post('/packages', configController.createConfigurationPackage.bind(configController));
  
  // Get configuration package by version
  fastify.get('/packages/:version', configController.getConfigurationPackage.bind(configController));
  
  // List all configuration packages
  fastify.get('/packages', configController.listConfigurationPackages.bind(configController));
  
  // Deploy configuration to kiosks
  fastify.post('/deploy', configController.deployConfiguration.bind(configController));
  
  // List all kiosk configuration statuses
  fastify.get('/kiosks/status', configController.listKioskConfigStatuses.bind(configController));
  
  // Get deployment history
  fastify.get('/deployments', configController.getDeploymentHistory.bind(configController));

  // Kiosk endpoints (called by kiosks)
  
  // Get pending configuration for specific kiosk
  fastify.get('/kiosks/:kiosk_id/pending', configController.getPendingConfiguration.bind(configController));
  
  // Apply configuration (called by kiosk after successful download)
  fastify.post('/kiosks/:kiosk_id/apply', configController.applyConfiguration.bind(configController));
  
  // Rollback configuration (called by kiosk on failure)
  fastify.post('/kiosks/:kiosk_id/rollback', configController.rollbackConfiguration.bind(configController));
  
  // Get kiosk configuration status
  fastify.get('/kiosks/:kiosk_id/status', configController.getKioskConfigStatus.bind(configController));
}
