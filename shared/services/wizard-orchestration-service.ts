/**
 * Wizard Orchestration Service for Hardware Configuration Wizard
 * Manages multi-step wizard process and state management
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { randomUUID } from 'crypto';
import { DatabaseManager } from '../database/database-manager';
import { EventRepository } from '../database/event-repository';
import { EventType } from '../types/core-entities';
import { ConfigManager } from './config-manager';
import { HardwareDetectionService } from './hardware-detection-service';
import { SlaveAddressService } from './slave-address-service';
import { HardwareTestingService } from './hardware-testing-service';

// Core interfaces for wizard orchestration
export interface WizardSession {
  sessionId: string;
  currentStep: number;
  maxCompletedStep: number;
  cardData: NewCardData;
  testResults: TestResult[];
  errors: WizardError[];
  createdAt: Date;
  lastUpdated: Date;
  status: 'active' | 'completed' | 'cancelled' | 'error';
}

export interface NewCardData {
  detectedAddress?: number;
  assignedAddress?: number;
  deviceType?: DeviceType;
  capabilities?: DeviceCapabilities;
  configuration?: RelayCardConfig;
  testsPassed: boolean;
  serialPort?: string;
  connectionVerified: boolean;
}

export interface DeviceType {
  manufacturer: 'waveshare' | 'generic' | 'unknown';
  model: string;
  channels: number;
  features: string[];
}

export interface DeviceCapabilities {
  maxRelays: number;
  supportedFunctions: number[];
  firmwareVersion?: string;
  addressConfigurable: boolean;
  timedPulseSupport: boolean;
}

export interface RelayCardConfig {
  slave_address: number;
  channels: number;
  type: string;
  description: string;
  enabled: boolean;
  installation_date: Date;
  wizard_configured: boolean;
  last_tested: Date;
  test_results?: TestSuite;
  firmware_version?: string;
  capabilities?: DeviceCapabilities;
}

export interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  details: string;
  error?: string;
  timestamp: Date;
}

export interface TestSuite {
  address: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  overallSuccess: boolean;
  duration: number;
}

export interface WizardError {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: any;
  recoverable: boolean;
  suggestedAction?: string;
  timestamp: Date;
  step?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  canProceed: boolean;
}

export interface StepResult {
  success: boolean;
  data?: any;
  errors: WizardError[];
  nextStep?: number;
  canProceed: boolean;
}

export interface CompletionResult {
  success: boolean;
  sessionId: string;
  newCardConfig?: RelayCardConfig;
  systemUpdated: boolean;
  errors: WizardError[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    duration: number;
    testsRun: number;
    testsPassed: number;
  };
}

export enum WizardStep {
  CHECKLIST = 1,
  DETECTION = 2,
  ADDRESS_CONFIG = 3,
  TESTING = 4,
  INTEGRATION = 5
}

/**
 * Wizard Orchestration Service
 * Coordinates the multi-step hardware configuration wizard process
 */
export class WizardOrchestrationService {
  private static instance: WizardOrchestrationService | null = null;
  private dbManager: DatabaseManager;
  private eventRepository: EventRepository;
  private configManager: ConfigManager;
  private hardwareDetectionService: HardwareDetectionService;
  private slaveAddressService: SlaveAddressService;
  private hardwareTestingService: HardwareTestingService;
  private activeSessions = new Map<string, WizardSession>();

  private constructor() {
    this.dbManager = DatabaseManager.getInstance();
    this.eventRepository = new EventRepository(this.dbManager.getConnection());
    this.configManager = ConfigManager.getInstance();
    this.hardwareDetectionService = HardwareDetectionService.getInstance();
    this.slaveAddressService = SlaveAddressService.getInstance();
    this.hardwareTestingService = HardwareTestingService.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): WizardOrchestrationService {
    if (!WizardOrchestrationService.instance) {
      WizardOrchestrationService.instance = new WizardOrchestrationService();
    }
    return WizardOrchestrationService.instance;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    await this.createWizardTables();
    await this.loadActiveSessions();
  }

  /**
   * Create wizard session management
   * Requirements: 2.1, 2.2
   */
  async createWizardSession(): Promise<WizardSession> {
    const sessionId = `wizard-${randomUUID()}`;
    const now = new Date();

    const session: WizardSession = {
      sessionId,
      currentStep: WizardStep.CHECKLIST,
      maxCompletedStep: 0,
      cardData: {
        testsPassed: false,
        connectionVerified: false
      },
      testResults: [],
      errors: [],
      createdAt: now,
      lastUpdated: now,
      status: 'active'
    };

    // Store in memory cache
    this.activeSessions.set(sessionId, session);

    // Persist to database
    await this.persistWizardSession(session);

    // Log session creation
    await this.eventRepository.logEvent(
      'system',
      EventType.CONFIG_APPLIED,
      {
        action: 'wizard_session_created',
        session_id: sessionId,
        step: WizardStep.CHECKLIST
      },
      undefined,
      undefined,
      undefined,
      'wizard-system'
    );

    return session;
  }

  /**
   * Get wizard session by ID
   * Requirements: 2.1, 2.2
   */
  async getWizardSession(sessionId: string): Promise<WizardSession> {
    // Check memory cache first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Load from database
    const session = await this.loadWizardSessionFromDb(sessionId);
    if (!session) {
      throw new Error(`Wizard session not found: ${sessionId}`);
    }

    // Cache in memory
    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Update wizard session
   * Requirements: 2.1, 2.2
   */
  async updateWizardSession(sessionId: string, updates: Partial<WizardSession>): Promise<void> {
    const session = await this.getWizardSession(sessionId);
    
    // Apply updates
    Object.assign(session, updates, { lastUpdated: new Date() });

    // Update memory cache
    this.activeSessions.set(sessionId, session);

    // Persist to database
    await this.persistWizardSession(session);

    // Log session update
    await this.eventRepository.logEvent(
      'system',
      EventType.CONFIG_APPLIED,
      {
        action: 'wizard_session_updated',
        session_id: sessionId,
        updates: Object.keys(updates)
      },
      undefined,
      undefined,
      undefined,
      'wizard-system'
    );
  }

  /**
   * Validate step completion requirements
   * Requirements: 2.3, 2.4, 2.5
   */
  async validateStep(sessionId: string, step: number): Promise<ValidationResult> {
    const session = await this.getWizardSession(sessionId);
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      switch (step) {
        case WizardStep.CHECKLIST:
          // Step 1: Pre-setup checklist validation
          if (!session.cardData.connectionVerified) {
            errors.push('Physical connection must be verified before proceeding');
          }
          break;

        case WizardStep.DETECTION:
          // Step 2: Device detection validation
          if (!session.cardData.serialPort) {
            errors.push('Serial port must be selected');
          }
          if (!session.cardData.detectedAddress) {
            errors.push('No Modbus device detected');
          }
          if (!session.cardData.deviceType) {
            warnings.push('Device type could not be identified');
          }
          break;

        case WizardStep.ADDRESS_CONFIG:
          // Step 3: Address configuration validation
          if (!session.cardData.detectedAddress) {
            errors.push('Device must be detected before address configuration');
          }
          if (!session.cardData.assignedAddress) {
            errors.push('New slave address must be assigned');
          }
          if (session.cardData.assignedAddress === session.cardData.detectedAddress) {
            warnings.push('New address is same as detected address');
          }
          break;

        case WizardStep.TESTING:
          // Step 4: Hardware testing validation
          if (!session.cardData.assignedAddress) {
            errors.push('Address configuration must be completed before testing');
          }
          if (session.testResults.length === 0) {
            errors.push('No tests have been run');
          }
          if (!session.cardData.testsPassed) {
            errors.push('Hardware tests must pass before proceeding');
          }
          break;

        case WizardStep.INTEGRATION:
          // Step 5: System integration validation
          if (!session.cardData.testsPassed) {
            errors.push('Hardware tests must pass before integration');
          }
          if (!session.cardData.configuration) {
            errors.push('Card configuration must be prepared');
          }
          break;

        default:
          errors.push(`Invalid step number: ${step}`);
      }
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      canProceed: errors.length === 0
    };
  }

  /**
   * Execute step-specific operations
   * Requirements: 2.3, 2.4, 2.5
   */
  async executeStep(sessionId: string, step: number): Promise<StepResult> {
    const session = await this.getWizardSession(sessionId);
    const errors: WizardError[] = [];
    let success = false;
    let data: any = {};
    let nextStep: number | undefined;

    try {
      // Validate step before execution
      const validation = await this.validateStep(sessionId, step);
      if (!validation.valid) {
        errors.push({
          code: 'STEP_VALIDATION_FAILED',
          severity: 'error',
          message: `Step ${step} validation failed: ${validation.errors.join(', ')}`,
          recoverable: true,
          timestamp: new Date(),
          step
        });
        return { success: false, errors, canProceed: false };
      }

      switch (step) {
        case WizardStep.CHECKLIST:
          data = await this.executeChecklistStep(session);
          success = true;
          nextStep = WizardStep.DETECTION;
          break;

        case WizardStep.DETECTION:
          data = await this.executeDetectionStep(session);
          success = data.deviceDetected;
          nextStep = success ? WizardStep.ADDRESS_CONFIG : undefined;
          break;

        case WizardStep.ADDRESS_CONFIG:
          data = await this.executeAddressConfigStep(session);
          success = data.addressConfigured;
          nextStep = success ? WizardStep.TESTING : undefined;
          break;

        case WizardStep.TESTING:
          data = await this.executeTestingStep(session);
          success = data.allTestsPassed;
          nextStep = success ? WizardStep.INTEGRATION : undefined;
          break;

        case WizardStep.INTEGRATION:
          data = await this.executeIntegrationStep(session);
          success = data.integrationComplete;
          nextStep = undefined; // Final step
          break;

        default:
          throw new Error(`Invalid step number: ${step}`);
      }

      // Update session with step completion
      if (success) {
        await this.updateWizardSession(sessionId, {
          currentStep: nextStep || step,
          maxCompletedStep: Math.max(session.maxCompletedStep, step)
        });
      }

    } catch (error) {
      errors.push({
        code: 'STEP_EXECUTION_ERROR',
        severity: 'error',
        message: `Step ${step} execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error,
        recoverable: true,
        timestamp: new Date(),
        step
      });
    }

    return {
      success,
      data,
      errors,
      nextStep,
      canProceed: success && nextStep !== undefined
    };
  }

  /**
   * Check if can proceed to next step
   * Requirements: 2.3, 2.4, 2.5
   */
  async canProceedToNextStep(sessionId: string): Promise<boolean> {
    const session = await this.getWizardSession(sessionId);
    const currentStep = session.currentStep;
    
    // Check if current step is completed
    if (session.maxCompletedStep < currentStep) {
      return false;
    }

    // Validate next step requirements
    const nextStep = currentStep + 1;
    if (nextStep > WizardStep.INTEGRATION) {
      return false; // Already at final step
    }

    const validation = await this.validateStep(sessionId, nextStep);
    return validation.canProceed;
  }

  /**
   * Finalize wizard and complete configuration
   * Requirements: 2.6, 2.7, 7.1, 7.2
   */
  async finalizeWizard(sessionId: string): Promise<CompletionResult> {
    const session = await this.getWizardSession(sessionId);
    const errors: WizardError[] = [];
    let success = false;
    let systemUpdated = false;
    let newCardConfig: RelayCardConfig | undefined;

    try {
      // Validate wizard completion requirements
      if (session.maxCompletedStep < WizardStep.INTEGRATION) {
        throw new Error('All wizard steps must be completed before finalization');
      }

      if (!session.cardData.testsPassed) {
        throw new Error('Hardware tests must pass before finalization');
      }

      if (!session.cardData.configuration) {
        throw new Error('Card configuration is missing');
      }

      // Create configuration backup before changes
      const backupId = await this.createConfigurationBackup();

      try {
        // Add relay card to system configuration
        newCardConfig = session.cardData.configuration;
        await this.addRelayCardToSystem(newCardConfig);
        systemUpdated = true;

        // Update session status
        await this.updateWizardSession(sessionId, {
          status: 'completed'
        });

        success = true;

        // Log successful completion
        await this.eventRepository.logEvent(
          'system',
          EventType.CONFIG_APPLIED,
          {
            action: 'wizard_completed',
            session_id: sessionId,
            new_card_address: newCardConfig.slave_address,
            backup_id: backupId
          },
          undefined,
          undefined,
          undefined,
          'wizard-system'
        );

      } catch (integrationError) {
        // Rollback configuration changes
        await this.restoreConfiguration(backupId);
        throw integrationError;
      }

    } catch (error) {
      errors.push({
        code: 'WIZARD_FINALIZATION_ERROR',
        severity: 'critical',
        message: `Wizard finalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error,
        recoverable: false,
        timestamp: new Date()
      });

      // Update session status to error
      await this.updateWizardSession(sessionId, {
        status: 'error',
        errors: [...session.errors, ...errors]
      });
    }

    // Calculate summary
    const summary = {
      totalSteps: 5,
      completedSteps: session.maxCompletedStep,
      duration: new Date().getTime() - session.createdAt.getTime(),
      testsRun: session.testResults.length,
      testsPassed: session.testResults.filter(t => t.success).length
    };

    return {
      success,
      sessionId,
      newCardConfig,
      systemUpdated,
      errors,
      summary
    };
  }

  /**
   * Rollback wizard and cancel configuration
   * Requirements: 2.6, 2.7, 7.1, 7.2
   */
  async rollbackWizard(sessionId: string): Promise<void> {
    const session = await this.getWizardSession(sessionId);

    try {
      // If any system changes were made, attempt to rollback
      if (session.cardData.assignedAddress) {
        // Attempt to reset device address if possible
        try {
          await this.slaveAddressService.setSlaveAddress(
            session.cardData.assignedAddress,
            session.cardData.detectedAddress || 1
          );
        } catch (error) {
          console.warn('Could not reset device address during rollback:', error);
        }
      }

      // Update session status
      await this.updateWizardSession(sessionId, {
        status: 'cancelled'
      });

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      // Log rollback
      await this.eventRepository.logEvent(
        'system',
        EventType.CONFIG_APPLIED,
        {
          action: 'wizard_rolled_back',
          session_id: sessionId,
          step: session.currentStep
        },
        undefined,
        undefined,
        undefined,
        'wizard-system'
      );

    } catch (error) {
      console.error('Error during wizard rollback:', error);
      throw error;
    }
  }

  // Private helper methods for step execution
  private async executeChecklistStep(session: WizardSession): Promise<any> {
    // Step 1: Pre-setup checklist
    // This step is primarily UI-driven, so we just mark it as ready
    await this.updateWizardSession(session.sessionId, {
      cardData: {
        ...session.cardData,
        connectionVerified: true
      }
    });

    return {
      checklistCompleted: true,
      message: 'Pre-setup checklist completed'
    };
  }

  private async executeDetectionStep(session: WizardSession): Promise<any> {
    // Step 2: Hardware detection
    const serialPorts = await this.hardwareDetectionService.scanSerialPorts();
    
    if (serialPorts.length === 0) {
      throw new Error('No serial ports found');
    }

    // Use first available port or previously selected port
    const selectedPort = session.cardData.serialPort || serialPorts[0].path;
    
    // Scan for Modbus devices
    const devices = await this.hardwareDetectionService.scanModbusDevices(
      selectedPort,
      { start: 1, end: 10 } // Scan first 10 addresses
    );

    if (devices.length === 0) {
      throw new Error('No Modbus devices detected');
    }

    const detectedDevice = devices[0]; // Use first detected device
    
    // Update session with detection results
    await this.updateWizardSession(session.sessionId, {
      cardData: {
        ...session.cardData,
        serialPort: selectedPort,
        detectedAddress: detectedDevice.address,
        deviceType: detectedDevice.type,
        capabilities: detectedDevice.capabilities
      }
    });

    return {
      deviceDetected: true,
      serialPort: selectedPort,
      detectedAddress: detectedDevice.address,
      deviceType: detectedDevice.type,
      availablePorts: serialPorts,
      detectedDevices: devices
    };
  }

  private async executeAddressConfigStep(session: WizardSession): Promise<any> {
    // Step 3: Slave address configuration
    if (!session.cardData.detectedAddress) {
      throw new Error('No device detected for address configuration');
    }

    // Find next available address
    const nextAddress = await this.slaveAddressService.findNextAvailableAddress();
    
    // Configure new address using broadcast
    const success = await this.slaveAddressService.configureBroadcastAddress(nextAddress);
    
    if (!success) {
      throw new Error('Failed to configure slave address');
    }

    // Verify address configuration
    const verified = await this.slaveAddressService.verifyAddressConfiguration(nextAddress);
    
    if (!verified) {
      throw new Error('Address configuration verification failed');
    }

    // Update session with new address
    await this.updateWizardSession(session.sessionId, {
      cardData: {
        ...session.cardData,
        assignedAddress: nextAddress
      }
    });

    return {
      addressConfigured: true,
      oldAddress: session.cardData.detectedAddress,
      newAddress: nextAddress,
      verified: verified
    };
  }

  private async executeTestingStep(session: WizardSession): Promise<any> {
    // Step 4: Hardware testing
    if (!session.cardData.assignedAddress) {
      throw new Error('No assigned address for testing');
    }

    const address = session.cardData.assignedAddress;
    
    // Run comprehensive hardware tests
    const testSuite = await this.hardwareTestingService.runFullHardwareTest(address);
    
    // Update session with test results
    await this.updateWizardSession(session.sessionId, {
      testResults: testSuite.results,
      cardData: {
        ...session.cardData,
        testsPassed: testSuite.overallSuccess
      }
    });

    return {
      allTestsPassed: testSuite.overallSuccess,
      testSuite: testSuite,
      failedTests: testSuite.results.filter(t => !t.success)
    };
  }

  private async executeIntegrationStep(session: WizardSession): Promise<any> {
    // Step 5: System integration
    if (!session.cardData.assignedAddress || !session.cardData.testsPassed) {
      throw new Error('Prerequisites not met for integration');
    }

    // Prepare relay card configuration
    const cardConfig: RelayCardConfig = {
      slave_address: session.cardData.assignedAddress,
      channels: session.cardData.capabilities?.maxRelays || 16,
      type: session.cardData.deviceType?.model || 'waveshare_16ch',
      description: `Wizard Card ${session.cardData.assignedAddress}`,
      enabled: true,
      installation_date: new Date(),
      wizard_configured: true,
      last_tested: new Date(),
      test_results: {
        address: session.cardData.assignedAddress,
        totalTests: session.testResults.length,
        passedTests: session.testResults.filter(t => t.success).length,
        failedTests: session.testResults.filter(t => !t.success).length,
        results: session.testResults,
        overallSuccess: session.cardData.testsPassed,
        duration: session.testResults.reduce((sum, t) => sum + t.duration, 0)
      },
      firmware_version: session.cardData.capabilities?.firmwareVersion,
      capabilities: session.cardData.capabilities
    };

    // Update session with prepared configuration
    await this.updateWizardSession(session.sessionId, {
      cardData: {
        ...session.cardData,
        configuration: cardConfig
      }
    });

    return {
      integrationComplete: true,
      cardConfiguration: cardConfig,
      message: 'Card configuration prepared for system integration'
    };
  }

  // Database operations
  private async createWizardTables(): Promise<void> {
    const db = this.dbManager.getConnection();
    
    // Create wizard sessions table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS wizard_sessions (
        session_id TEXT PRIMARY KEY,
        current_step INTEGER NOT NULL,
        max_completed_step INTEGER NOT NULL,
        card_data TEXT, -- JSON
        test_results TEXT, -- JSON
        errors TEXT, -- JSON
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (status IN ('active', 'completed', 'cancelled', 'error'))
      )
    `);

    // Create hardware test history table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS hardware_test_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        device_address INTEGER NOT NULL,
        test_type TEXT NOT NULL,
        test_name TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        duration_ms INTEGER,
        details TEXT,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES wizard_sessions(session_id)
      )
    `);

    // Create configuration audit table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS configuration_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        change_type TEXT NOT NULL,
        old_value TEXT, -- JSON
        new_value TEXT, -- JSON
        success BOOLEAN NOT NULL,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES wizard_sessions(session_id)
      )
    `);
  }

  private async persistWizardSession(session: WizardSession): Promise<void> {
    const db = this.dbManager.getConnection();
    
    await db.run(`
      INSERT OR REPLACE INTO wizard_sessions (
        session_id, current_step, max_completed_step, card_data, 
        test_results, errors, status, created_at, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.sessionId,
      session.currentStep,
      session.maxCompletedStep,
      JSON.stringify(session.cardData),
      JSON.stringify(session.testResults),
      JSON.stringify(session.errors),
      session.status,
      session.createdAt.toISOString(),
      session.lastUpdated.toISOString()
    ]);
  }

  private async loadWizardSessionFromDb(sessionId: string): Promise<WizardSession | null> {
    const db = this.dbManager.getConnection();
    
    const row = await db.get(`
      SELECT * FROM wizard_sessions WHERE session_id = ?
    `, [sessionId]);

    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      currentStep: row.current_step,
      maxCompletedStep: row.max_completed_step,
      cardData: JSON.parse(row.card_data || '{}'),
      testResults: JSON.parse(row.test_results || '[]'),
      errors: JSON.parse(row.errors || '[]'),
      status: row.status,
      createdAt: new Date(row.created_at),
      lastUpdated: new Date(row.last_updated)
    };
  }

  private async loadActiveSessions(): Promise<void> {
    const db = this.dbManager.getConnection();
    
    const rows = await db.all(`
      SELECT * FROM wizard_sessions 
      WHERE status = 'active' 
      ORDER BY created_at DESC
    `);

    for (const row of rows) {
      const session = await this.loadWizardSessionFromDb(row.session_id);
      if (session) {
        this.activeSessions.set(session.sessionId, session);
      }
    }
  }

  private async addRelayCardToSystem(cardConfig: RelayCardConfig): Promise<void> {
    // Get current system configuration
    const config = this.configManager.getConfiguration();
    
    // Add new relay card
    config.hardware.relay_cards.push({
      slave_address: cardConfig.slave_address,
      channels: cardConfig.channels,
      type: cardConfig.type,
      description: cardConfig.description,
      enabled: cardConfig.enabled
    });

    // Update total locker count
    const totalLockers = config.hardware.relay_cards
      .filter(card => card.enabled)
      .reduce((sum, card) => sum + card.channels, 0);
    
    config.lockers.total_count = totalLockers;

    // Update layout if needed
    const rows = Math.ceil(Math.sqrt(totalLockers));
    const columns = Math.ceil(totalLockers / rows);
    config.lockers.layout = { rows, columns };

    // Save configuration
    await this.configManager.updateConfiguration(
      'hardware',
      { relay_cards: config.hardware.relay_cards },
      'wizard-system',
      `Added relay card via wizard: address ${cardConfig.slave_address}`
    );

    await this.configManager.updateConfiguration(
      'lockers',
      { 
        total_count: totalLockers,
        layout: { rows, columns }
      },
      'wizard-system',
      `Updated locker count and layout for new card: ${totalLockers} lockers`
    );
  }

  private async createConfigurationBackup(): Promise<string> {
    const backupId = `wizard-backup-${Date.now()}`;
    const config = this.configManager.getConfiguration();
    
    // Store backup in configuration audit table
    const db = this.dbManager.getConnection();
    await db.run(`
      INSERT INTO configuration_audit (
        change_type, old_value, new_value, success, timestamp
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      'backup',
      JSON.stringify(config),
      backupId,
      true,
      new Date().toISOString()
    ]);

    return backupId;
  }

  private async restoreConfiguration(backupId: string): Promise<void> {
    const db = this.dbManager.getConnection();
    
    const backup = await db.get(`
      SELECT old_value FROM configuration_audit 
      WHERE change_type = 'backup' AND new_value = ?
    `, [backupId]);

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const config = JSON.parse(backup.old_value);
    
    // Restore hardware configuration
    await this.configManager.updateConfiguration(
      'hardware',
      { relay_cards: config.hardware.relay_cards },
      'wizard-system',
      `Restored from backup: ${backupId}`
    );

    // Restore locker configuration
    await this.configManager.updateConfiguration(
      'lockers',
      { 
        total_count: config.lockers.total_count,
        layout: config.lockers.layout
      },
      'wizard-system',
      `Restored locker config from backup: ${backupId}`
    );
  }
}

// Export singleton instance
export const wizardOrchestrationService = WizardOrchestrationService.getInstance();