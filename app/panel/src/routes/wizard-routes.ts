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
  const wizardOrchestration = WizardOrchestrationService.getInstance(dbManager);
  const wizardSecurity = WizardSecurityService.getInstance(dbManager);
  const hardwareDetection = HardwareDetectionService.getInstance();
  const slaveAddressService = SlaveAddressService.getInstance();
  const hardwareTestingService = HardwareTestingService.getInstance();

  // Wizard session management
  fastify.post('/session/start', async (request, reply) => {
    try {
      const session = await wizardOrchestration.createWizardSession();
      
      // Log security event (commented out until security service is fixed)
      // await wizardSecurity.logSecurityEvent(session.sessionId, 'session_started', {
      //   ip: request.ip,
      //   userAgent: request.headers['user-agent']
      // });

      return { 
        success: true, 
        sessionId: session.sessionId,
        currentStep: session.currentStep 
      };
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

      // Perform hardware detection - scan serial ports and detect new devices
      const serialPorts = await hardwareDetection.scanSerialPorts();
      const newDevices = await hardwareDetection.detectNewDevices();
      
      const detectionResult = {
        serialPorts,
        newDevices,
        timestamp: new Date()
      };
      
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

      // Initialize slave address service
      await slaveAddressService.initialize();
      
      // Configure slave addresses sequentially
      const configurationResults = [];
      for (const addressConfig of addresses) {
        const result = await slaveAddressService.configureBroadcastAddress(addressConfig.slaveAddress);
        configurationResults.push({
          cardId: addressConfig.cardId,
          slaveAddress: addressConfig.slaveAddress,
          ...result
        });
      }
      
      // Close slave address service
      await slaveAddressService.close();
      
      // Update session
      await wizardOrchestration.updateWizardSession(sessionId, {
        current_step: 3,
        max_completed_step: Math.max(session.max_completed_step, 2)
      });

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'addresses_configured', {
        addresses,
        result: configurationResults,
        ip: request.ip
      });

      return { success: true, configurationResult: configurationResults };
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
      const { addresses } = request.body as { addresses?: number[] };
      
      // Validate session
      const session = await wizardOrchestration.getWizardSession(sessionId);
      if (!session) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Session not found' 
        });
      }

      // Initialize hardware testing service with default config
      await hardwareTestingService.initialize({
        port: '/dev/ttyUSB0',
        baudrate: 9600,
        timeout_ms: 5000,
        max_retries: 3
      });
      
      // Run hardware tests for each address
      const testResults = [];
      const testAddresses = addresses || [1, 2]; // Default test addresses
      
      for (const address of testAddresses) {
        const fullTest = await hardwareTestingService.runFullHardwareTest(address);
        testResults.push(fullTest);
      }
      
      // Run system integration test
      const integrationResult = await hardwareTestingService.validateSystemIntegration();
      
      const allResults = {
        hardwareTests: testResults,
        integrationTest: integrationResult,
        timestamp: new Date()
      };
      
      // Clean up testing service
      await hardwareTestingService.cleanup();
      
      // Update session with test results
      await wizardOrchestration.updateWizardSession(sessionId, {
        current_step: 4,
        max_completed_step: Math.max(session.max_completed_step, 3),
        test_results: JSON.stringify(allResults)
      });

      // Log security event
      await wizardSecurity.logSecurityEvent(sessionId, 'hardware_tested', {
        testResults: allResults,
        ip: request.ip
      });

      return { success: true, testResults: allResults };
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