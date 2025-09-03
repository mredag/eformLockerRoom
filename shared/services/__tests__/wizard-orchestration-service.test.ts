/**
 * Unit tests for WizardOrchestrationService
 * Tests wizard session management, step validation, and execution
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WizardOrchestrationService, WizardStep, WizardSession } from '../wizard-orchestration-service';
import { DatabaseManager } from '../../database/database-manager';
import { ConfigManager } from '../config-manager';
import { HardwareDetectionService } from '../hardware-detection-service';
import { SlaveAddressService } from '../slave-address-service';
import { HardwareTestingService } from '../hardware-testing-service';

// Mock dependencies
jest.mock('../../database/database-manager');
jest.mock('../config-manager');
jest.mock('../hardware-detection-service');
jest.mock('../slave-address-service');
jest.mock('../hardware-testing-service');

describe('WizardOrchestrationService', () => {
  let service: WizardOrchestrationService;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockHardwareDetection: jest.Mocked<HardwareDetectionService>;
  let mockSlaveAddress: jest.Mocked<SlaveAddressService>;
  let mockHardwareTesting: jest.Mocked<HardwareTestingService>;
  let mockDb: any;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock database connection
    mockDb = {
      exec: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([])
    };

    // Mock DatabaseManager
    mockDbManager = {
      getInstance: jest.fn().mockReturnThis(),
      getConnection: jest.fn().mockReturnValue(mockDb)
    } as any;
    (DatabaseManager.getInstance as jest.Mock).mockReturnValue(mockDbManager);

    // Mock ConfigManager
    mockConfigManager = {
      getInstance: jest.fn().mockReturnThis(),
      getConfiguration: jest.fn().mockReturnValue({
        hardware: { relay_cards: [] },
        lockers: { total_count: 0, layout: { rows: 1, columns: 1 } }
      }),
      updateConfiguration: jest.fn().mockResolvedValue(undefined)
    } as any;
    (ConfigManager.getInstance as jest.Mock).mockReturnValue(mockConfigManager);

    // Mock HardwareDetectionService
    mockHardwareDetection = {
      getInstance: jest.fn().mockReturnThis(),
      scanSerialPorts: jest.fn().mockResolvedValue([
        { path: '/dev/ttyUSB0', available: true }
      ]),
      scanModbusDevices: jest.fn().mockResolvedValue([
        {
          address: 1,
          type: { manufacturer: 'waveshare', model: '16CH', channels: 16, features: [] },
          capabilities: { maxRelays: 16, supportedFunctions: [5, 6], addressConfigurable: true, timedPulseSupport: false },
          status: 'responding',
          responseTime: 100,
          lastSeen: new Date()
        }
      ])
    } as any;
    (HardwareDetectionService.getInstance as jest.Mock).mockReturnValue(mockHardwareDetection);

    // Mock SlaveAddressService
    mockSlaveAddress = {
      getInstance: jest.fn().mockReturnThis(),
      findNextAvailableAddress: jest.fn().mockResolvedValue(2),
      configureBroadcastAddress: jest.fn().mockResolvedValue(true),
      verifyAddressConfiguration: jest.fn().mockResolvedValue(true)
    } as any;
    (SlaveAddressService.getInstance as jest.Mock).mockReturnValue(mockSlaveAddress);

    // Mock HardwareTestingService
    mockHardwareTesting = {
      getInstance: jest.fn().mockReturnThis(),
      runFullHardwareTest: jest.fn().mockResolvedValue({
        address: 2,
        totalTests: 3,
        passedTests: 3,
        failedTests: 0,
        results: [
          { testName: 'Communication', success: true, duration: 100, details: 'OK', timestamp: new Date() },
          { testName: 'Relay 1', success: true, duration: 200, details: 'OK', timestamp: new Date() },
          { testName: 'Relay 8', success: true, duration: 200, details: 'OK', timestamp: new Date() }
        ],
        overallSuccess: true,
        duration: 500
      })
    } as any;
    (HardwareTestingService.getInstance as jest.Mock).mockReturnValue(mockHardwareTesting);

    // Create service instance
    service = WizardOrchestrationService.getInstance();
    await service.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Management', () => {
    test('should create wizard session with unique ID', async () => {
      const session = await service.createWizardSession();

      expect(session.sessionId).toMatch(/^wizard-[0-9a-f-]+$/);
      expect(session.currentStep).toBe(WizardStep.CHECKLIST);
      expect(session.maxCompletedStep).toBe(0);
      expect(session.status).toBe('active');
      expect(session.cardData.testsPassed).toBe(false);
      expect(session.cardData.connectionVerified).toBe(false);
      expect(session.testResults).toEqual([]);
      expect(session.errors).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastUpdated).toBeInstanceOf(Date);

      // Verify database persistence
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO wizard_sessions'),
        expect.arrayContaining([session.sessionId])
      );
    });

    test('should retrieve existing wizard session', async () => {
      const originalSession = await service.createWizardSession();
      
      const retrievedSession = await service.getWizardSession(originalSession.sessionId);

      expect(retrievedSession.sessionId).toBe(originalSession.sessionId);
      expect(retrievedSession.currentStep).toBe(originalSession.currentStep);
      expect(retrievedSession.status).toBe(originalSession.status);
    });

    test('should throw error for non-existent session', async () => {
      await expect(service.getWizardSession('non-existent-id'))
        .rejects.toThrow('Wizard session not found: non-existent-id');
    });

    test('should update wizard session', async () => {
      const session = await service.createWizardSession();
      
      await service.updateWizardSession(session.sessionId, {
        currentStep: WizardStep.DETECTION,
        cardData: { ...session.cardData, connectionVerified: true }
      });

      const updatedSession = await service.getWizardSession(session.sessionId);
      expect(updatedSession.currentStep).toBe(WizardStep.DETECTION);
      expect(updatedSession.cardData.connectionVerified).toBe(true);
      expect(updatedSession.lastUpdated.getTime()).toBeGreaterThan(session.lastUpdated.getTime());
    });
  });

  describe('Step Validation', () => {
    let session: WizardSession;

    beforeEach(async () => {
      session = await service.createWizardSession();
    });

    test('should validate checklist step requirements', async () => {
      // Initially should fail validation
      let validation = await service.validateStep(session.sessionId, WizardStep.CHECKLIST);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Physical connection must be verified before proceeding');

      // After connection verification should pass
      await service.updateWizardSession(session.sessionId, {
        cardData: { ...session.cardData, connectionVerified: true }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.CHECKLIST);
      expect(validation.valid).toBe(true);
      expect(validation.canProceed).toBe(true);
    });

    test('should validate detection step requirements', async () => {
      // Should fail without serial port and detected device
      let validation = await service.validateStep(session.sessionId, WizardStep.DETECTION);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Serial port must be selected');
      expect(validation.errors).toContain('No Modbus device detected');

      // Should pass with required data
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          serialPort: '/dev/ttyUSB0',
          detectedAddress: 1,
          deviceType: { manufacturer: 'waveshare', model: '16CH', channels: 16, features: [] }
        }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.DETECTION);
      expect(validation.valid).toBe(true);
    });

    test('should validate address configuration step requirements', async () => {
      // Should fail without detected and assigned addresses
      let validation = await service.validateStep(session.sessionId, WizardStep.ADDRESS_CONFIG);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Device must be detected before address configuration');
      expect(validation.errors).toContain('New slave address must be assigned');

      // Should pass with required addresses
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          detectedAddress: 1,
          assignedAddress: 2
        }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.ADDRESS_CONFIG);
      expect(validation.valid).toBe(true);
    });

    test('should validate testing step requirements', async () => {
      // Should fail without address and tests
      let validation = await service.validateStep(session.sessionId, WizardStep.TESTING);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Address configuration must be completed before testing');

      // Should fail with address but no tests
      await service.updateWizardSession(session.sessionId, {
        cardData: { ...session.cardData, assignedAddress: 2 }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.TESTING);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('No tests have been run');

      // Should fail with failed tests
      await service.updateWizardSession(session.sessionId, {
        testResults: [{ testName: 'Test', success: false, duration: 100, details: 'Failed', timestamp: new Date() }],
        cardData: { ...session.cardData, testsPassed: false }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.TESTING);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Hardware tests must pass before proceeding');

      // Should pass with passing tests
      await service.updateWizardSession(session.sessionId, {
        testResults: [{ testName: 'Test', success: true, duration: 100, details: 'OK', timestamp: new Date() }],
        cardData: { ...session.cardData, testsPassed: true }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.TESTING);
      expect(validation.valid).toBe(true);
    });

    test('should validate integration step requirements', async () => {
      // Should fail without tests passed and configuration
      let validation = await service.validateStep(session.sessionId, WizardStep.INTEGRATION);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Hardware tests must pass before integration');
      expect(validation.errors).toContain('Card configuration must be prepared');

      // Should pass with all requirements
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          testsPassed: true,
          configuration: {
            slave_address: 2,
            channels: 16,
            type: 'waveshare_16ch',
            description: 'Test Card',
            enabled: true,
            installation_date: new Date(),
            wizard_configured: true,
            last_tested: new Date()
          }
        }
      });

      validation = await service.validateStep(session.sessionId, WizardStep.INTEGRATION);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Step Execution', () => {
    let session: WizardSession;

    beforeEach(async () => {
      session = await service.createWizardSession();
    });

    test('should execute checklist step', async () => {
      // Setup prerequisites
      await service.updateWizardSession(session.sessionId, {
        cardData: { ...session.cardData, connectionVerified: true }
      });

      const result = await service.executeStep(session.sessionId, WizardStep.CHECKLIST);

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe(WizardStep.DETECTION);
      expect(result.data.checklistCompleted).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should execute detection step', async () => {
      // Setup prerequisites
      await service.updateWizardSession(session.sessionId, {
        cardData: { ...session.cardData, connectionVerified: true }
      });

      const result = await service.executeStep(session.sessionId, WizardStep.DETECTION);

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe(WizardStep.ADDRESS_CONFIG);
      expect(result.data.deviceDetected).toBe(true);
      expect(result.data.detectedAddress).toBe(1);
      expect(result.data.serialPort).toBe('/dev/ttyUSB0');
      expect(mockHardwareDetection.scanSerialPorts).toHaveBeenCalled();
      expect(mockHardwareDetection.scanModbusDevices).toHaveBeenCalledWith('/dev/ttyUSB0', { start: 1, end: 10 });
    });

    test('should execute address configuration step', async () => {
      // Setup prerequisites
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          connectionVerified: true,
          serialPort: '/dev/ttyUSB0',
          detectedAddress: 1
        }
      });

      const result = await service.executeStep(session.sessionId, WizardStep.ADDRESS_CONFIG);

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe(WizardStep.TESTING);
      expect(result.data.addressConfigured).toBe(true);
      expect(result.data.oldAddress).toBe(1);
      expect(result.data.newAddress).toBe(2);
      expect(mockSlaveAddress.findNextAvailableAddress).toHaveBeenCalled();
      expect(mockSlaveAddress.configureBroadcastAddress).toHaveBeenCalledWith(2);
      expect(mockSlaveAddress.verifyAddressConfiguration).toHaveBeenCalledWith(2);
    });

    test('should execute testing step', async () => {
      // Setup prerequisites
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          connectionVerified: true,
          detectedAddress: 1,
          assignedAddress: 2
        }
      });

      const result = await service.executeStep(session.sessionId, WizardStep.TESTING);

      expect(result.success).toBe(true);
      expect(result.nextStep).toBe(WizardStep.INTEGRATION);
      expect(result.data.allTestsPassed).toBe(true);
      expect(result.data.testSuite.totalTests).toBe(3);
      expect(result.data.testSuite.passedTests).toBe(3);
      expect(mockHardwareTesting.runFullHardwareTest).toHaveBeenCalledWith(2);
    });

    test('should execute integration step', async () => {
      // Setup prerequisites
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          assignedAddress: 2,
          testsPassed: true,
          capabilities: { maxRelays: 16, supportedFunctions: [5, 6], addressConfigurable: true, timedPulseSupport: false },
          deviceType: { manufacturer: 'waveshare', model: '16CH', channels: 16, features: [] }
        },
        testResults: [
          { testName: 'Test', success: true, duration: 100, details: 'OK', timestamp: new Date() }
        ]
      });

      const result = await service.executeStep(session.sessionId, WizardStep.INTEGRATION);

      expect(result.success).toBe(true);
      expect(result.nextStep).toBeUndefined(); // Final step
      expect(result.data.integrationComplete).toBe(true);
      expect(result.data.cardConfiguration).toBeDefined();
      expect(result.data.cardConfiguration.slave_address).toBe(2);
      expect(result.data.cardConfiguration.wizard_configured).toBe(true);
    });

    test('should handle step execution errors', async () => {
      // Force an error by not setting up prerequisites
      const result = await service.executeStep(session.sessionId, WizardStep.DETECTION);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('STEP_VALIDATION_FAILED');
      expect(result.errors[0].severity).toBe('error');
    });
  });

  describe('Wizard Completion', () => {
    let session: WizardSession;

    beforeEach(async () => {
      session = await service.createWizardSession();
      
      // Setup completed wizard session
      await service.updateWizardSession(session.sessionId, {
        maxCompletedStep: WizardStep.INTEGRATION,
        cardData: {
          ...session.cardData,
          testsPassed: true,
          configuration: {
            slave_address: 2,
            channels: 16,
            type: 'waveshare_16ch',
            description: 'Wizard Card 2',
            enabled: true,
            installation_date: new Date(),
            wizard_configured: true,
            last_tested: new Date()
          }
        },
        testResults: [
          { testName: 'Test', success: true, duration: 100, details: 'OK', timestamp: new Date() }
        ]
      });
    });

    test('should finalize wizard successfully', async () => {
      const result = await service.finalizeWizard(session.sessionId);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(session.sessionId);
      expect(result.newCardConfig).toBeDefined();
      expect(result.newCardConfig!.slave_address).toBe(2);
      expect(result.systemUpdated).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.totalSteps).toBe(5);
      expect(result.summary.completedSteps).toBe(WizardStep.INTEGRATION);

      // Verify configuration was updated
      expect(mockConfigManager.updateConfiguration).toHaveBeenCalledWith(
        'hardware',
        expect.objectContaining({
          relay_cards: expect.arrayContaining([
            expect.objectContaining({ slave_address: 2 })
          ])
        }),
        'wizard-system',
        expect.stringContaining('Added relay card via wizard')
      );
    });

    test('should handle finalization errors', async () => {
      // Setup incomplete session
      await service.updateWizardSession(session.sessionId, {
        maxCompletedStep: WizardStep.DETECTION // Not completed
      });

      const result = await service.finalizeWizard(session.sessionId);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('WIZARD_FINALIZATION_ERROR');
      expect(result.errors[0].severity).toBe('critical');
    });
  });

  describe('Wizard Rollback', () => {
    test('should rollback wizard session', async () => {
      const session = await service.createWizardSession();
      
      // Setup session with some progress
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          detectedAddress: 1,
          assignedAddress: 2
        }
      });

      await service.rollbackWizard(session.sessionId);

      // Verify session was cancelled
      const updatedSession = await service.getWizardSession(session.sessionId);
      expect(updatedSession.status).toBe('cancelled');

      // Verify address reset was attempted
      expect(mockSlaveAddress.setSlaveAddress).toHaveBeenCalledWith(2, 1);
    });
  });

  describe('Navigation Control', () => {
    test('should check if can proceed to next step', async () => {
      const session = await service.createWizardSession();

      // Initially cannot proceed (step not completed)
      let canProceed = await service.canProceedToNextStep(session.sessionId);
      expect(canProceed).toBe(false);

      // After completing current step, should be able to proceed
      await service.updateWizardSession(session.sessionId, {
        maxCompletedStep: WizardStep.CHECKLIST,
        currentStep: WizardStep.DETECTION,
        cardData: { ...session.cardData, connectionVerified: true }
      });

      canProceed = await service.canProceedToNextStep(session.sessionId);
      expect(canProceed).toBe(false); // Still need serial port and device detection

      // Setup for next step validation
      await service.updateWizardSession(session.sessionId, {
        cardData: {
          ...session.cardData,
          serialPort: '/dev/ttyUSB0',
          detectedAddress: 1
        }
      });

      canProceed = await service.canProceedToNextStep(session.sessionId);
      expect(canProceed).toBe(true);
    });

    test('should not proceed beyond final step', async () => {
      const session = await service.createWizardSession();
      
      await service.updateWizardSession(session.sessionId, {
        currentStep: WizardStep.INTEGRATION,
        maxCompletedStep: WizardStep.INTEGRATION
      });

      const canProceed = await service.canProceedToNextStep(session.sessionId);
      expect(canProceed).toBe(false);
    });
  });
});