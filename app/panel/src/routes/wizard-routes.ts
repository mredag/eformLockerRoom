import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { WizardOrchestrationService } from '../../../../shared/services/wizard-orchestration-service';
import { WizardSecurityService } from '../../../../shared/services/wizard-security-service';
import { HardwareDetectionService } from '../../../../shared/services/hardware-detection-service';
import { SlaveAddressService } from '../../../../shared/services/slave-address-service';
import { HardwareTestingService } from '../../../../shared/services/hardware-testing-service';

interface WizardRoutesOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

export async function wizardRoutes(
  fastify: FastifyInstance,
  options: WizardRoutesOptions
) {
  const { dbManager } = options;

  // Initialize services
  const wizardOrchestration = new WizardOrchestrationService(dbManager);
  const wizardSecurity = new WizardSecurityService(dbManager);
  const hardwareDetection = new HardwareDetectionService();
  const slaveAddressService = new SlaveAddressService();
  const hardwareTestingService = new HardwareTestingService();

  // Wizard session management
  fastify.post('/session/start', async (request, reply) => {
    try {
      const session = await wizardOrchestration.startWizardSession();
      
      // Log security event
      await wizardSecurity.logSecurityEvent(session.session_id, 'session_started', {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      return { success: true, session };
    } catch (error) {
      fastify.log.error('Failed to start wizard session:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to start wizard session' 
      });
    }
  });

  fastify.get('/session/:sessionId/status', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const session = await wizardOrchestration.getWizardSession(sessionId);
      
      if (!session) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Session not found' 
        });
      }

      return { success: true, session };
    } catch (error) {
      fastify.log.error('Failed to get session status:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to get session status' 
      });
    }
  });

  // Hardware detection step
  fastify.post('/session/:sessionId/detect-hardware', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      
      // Validate session
      const session = await wizardOrchestration.getWizardSession(sessionId);
      if (!session) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Session not found' 
        });
      }

      // Perform hardware detection
      const detectionResult = await hardwareDetection.detectHardware();
      
      // Update session with detection results
      await wizardOrchestration.updateWizardSession(sessionId, {
        current_step: 2,
        max_completed_step: Math.max(session.max_completed_step, 1),
        card_data: JSON.stringify(detectionResult)
      });

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'hardware_detected', {
        detectionResult,
        ip: request.ip
      });

      return { success: true, detectionResult };
    } catch (error) {
      fastify.log.error('Hardware detection failed:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Hardware detection failed' 
      });
    }
  });

  // Address configuration step
  fastify.post('/session/:sessionId/configure-addresses', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { addresses } = request.body as { addresses: Array<{ cardId: number; slaveAddress: number }> };
      
      // Validate session
      const session = await wizardOrchestration.getWizardSession(sessionId);
      if (!session) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Session not found' 
        });
      }

      // Configure slave addresses
      const configurationResult = await slaveAddressService.configureSlaveAddresses(addresses);
      
      // Update session
      await wizardOrchestration.updateWizardSession(sessionId, {
        current_step: 3,
        max_completed_step: Math.max(session.max_completed_step, 2)
      });

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'addresses_configured', {
        addresses,
        result: configurationResult,
        ip: request.ip
      });

      return { success: true, configurationResult };
    } catch (error) {
      fastify.log.error('Address configuration failed:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Address configuration failed' 
      });
    }
  });

  // Hardware testing step
  fastify.post('/session/:sessionId/test-hardware', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      
      // Validate session
      const session = await wizardOrchestration.getWizardSession(sessionId);
      if (!session) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Session not found' 
        });
      }

      // Run hardware tests
      const testResults = await hardwareTestingService.runComprehensiveTests();
      
      // Update session with test results
      await wizardOrchestration.updateWizardSession(sessionId, {
        current_step: 4,
        max_completed_step: Math.max(session.max_completed_step, 3),
        test_results: JSON.stringify(testResults)
      });

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'hardware_tested', {
        testResults,
        ip: request.ip
      });

      return { success: true, testResults };
    } catch (error) {
      fastify.log.error('Hardware testing failed:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Hardware testing failed' 
      });
    }
  });

  // Complete wizard
  fastify.post('/session/:sessionId/complete', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      
      // Validate session
      const session = await wizardOrchestration.getWizardSession(sessionId);
      if (!session) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Session not found' 
        });
      }

      // Complete the wizard
      await wizardOrchestration.completeWizardSession(sessionId);

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'wizard_completed', {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });

      return { success: true, message: 'Wizard completed successfully' };
    } catch (error) {
      fastify.log.error('Failed to complete wizard:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to complete wizard' 
      });
    }
  });

  // Cancel wizard session
  fastify.post('/session/:sessionId/cancel', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      
      await wizardOrchestration.cancelWizardSession(sessionId);

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'wizard_cancelled', {
        ip: request.ip
      });

      return { success: true, message: 'Wizard session cancelled' };
    } catch (error) {
      fastify.log.error('Failed to cancel wizard session:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to cancel wizard session' 
      });
    }
  });

  // Get wizard security audit log
  fastify.get('/security/audit/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const auditLog = await wizardSecurity.getSecurityAuditLog(sessionId);
      
      return { success: true, auditLog };
    } catch (error) {
      fastify.log.error('Failed to get audit log:', error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to get audit log' 
      });
    }
  });
}

// Register wizard page routes
export async function registerWizardPageRoutes(fastify: FastifyInstance) {
  // Hardware wizard main page
  fastify.get('/wizard/hardware', async (request, reply) => {
    return reply.sendFile('wizard/hardware-wizard.html');
  });

  // Hardware dashboard page
  fastify.get('/hardware-dashboard', async (request, reply) => {
    return reply.sendFile('hardware-dashboard.html');
  });

  // Wizard performance dashboard
  fastify.get('/wizard/performance', async (request, reply) => {
    return reply.sendFile('wizard-performance-dashboard.html');
  });
}