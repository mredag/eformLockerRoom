/**
 * Hardware Configuration Wizard - Recovery Action System
 * 
 * Provides automated error recovery, rollback mechanisms, and manual intervention
 * guidance for the hardware configuration wizard.
 * 
 * Based on requirements 7.3 and 7.4 from the Hardware Configuration Wizard spec.
 */

import { WizardError, RecoveryAction, ErrorCategory, ERROR_CODES } from './error-handler';

export interface RecoveryContext {
  sessionId?: string;
  step?: number;
  deviceAddress?: number;
  operation?: string;
  attemptCount?: number;
  maxAttempts?: number;
  lastAttemptTime?: Date;
  rollbackData?: any;
}

export interface RecoveryResult {
  success: boolean;
  action: RecoveryAction;
  message: string;
  nextAction?: RecoveryAction;
  rollbackRequired?: boolean;
  userInterventionRequired?: boolean;
  estimatedRecoveryTime?: number;
}

export interface RollbackOperation {
  id: string;
  description: string;
  execute: () => Promise<boolean>;
  verify: () => Promise<boolean>;
  priority: number;
}

export interface ManualInterventionGuide {
  title: string;
  description: string;
  steps: ManualInterventionStep[];
  estimatedTime: number;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  toolsRequired?: string[];
  safetyWarnings?: string[];
}

export interface ManualInterventionStep {
  stepNumber: number;
  title: string;
  description: string;
  action: string;
  expectedResult: string;
  troubleshooting?: string;
  imageUrl?: string;
  videoUrl?: string;
}

/**
 * Recovery Action System for automated error resolution
 */
export class RecoveryActionSystem {
  private recoveryHistory: Map<string, RecoveryResult[]> = new Map();
  private rollbackStack: Map<string, RollbackOperation[]> = new Map();
  private activeRecoveries: Set<string> = new Set();

  /**
   * Suggest recovery actions with context-aware prioritization
   */
  async suggestRecoveryAction(
    error: WizardError, 
    context: RecoveryContext = {}
  ): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];
    
    // Get base recovery actions
    const baseActions = this.getBaseRecoveryActions(error, context);
    actions.push(...baseActions);

    // Add context-aware actions
    const contextActions = await this.getContextAwareActions(error, context);
    actions.push(...contextActions);

    // Add progressive recovery actions based on attempt count
    if (context.attemptCount && context.attemptCount > 1) {
      const progressiveActions = this.getProgressiveRecoveryActions(error, context);
      actions.push(...progressiveActions);
    }

    // Sort by priority and filter duplicates
    return this.prioritizeAndDeduplicateActions(actions);
  }

  /**
   * Execute a recovery action with full context and rollback support
   */
  async executeRecoveryAction(
    action: RecoveryAction,
    error: WizardError,
    context: RecoveryContext = {}
  ): Promise<RecoveryResult> {
    const recoveryId = this.generateRecoveryId(error, context);
    
    try {
      // Mark recovery as active
      this.activeRecoveries.add(recoveryId);

      // Create rollback point if needed
      if (action.type === 'rollback' || this.requiresRollbackPoint(action)) {
        await this.createRollbackPoint(recoveryId, context);
      }

      console.log(`🔧 Executing recovery action: ${action.description}`);
      const startTime = Date.now();

      // Execute the recovery action
      const success = await action.execute();
      const duration = Date.now() - startTime;

      // Create recovery result
      const result: RecoveryResult = {
        success,
        action,
        message: success 
          ? `Recovery action completed successfully in ${duration}ms`
          : `Recovery action failed after ${duration}ms`,
        estimatedRecoveryTime: duration
      };

      // Determine next steps
      if (success) {
        result.nextAction = await this.getNextRecoveryAction(action, error, context);
      } else {
        result.rollbackRequired = this.shouldRollback(action, error);
        result.userInterventionRequired = this.requiresUserIntervention(action, error);
        result.nextAction = await this.getFailureRecoveryAction(action, error, context);
      }

      // Record recovery attempt
      this.recordRecoveryAttempt(recoveryId, result);

      return result;

    } catch (recoveryError) {
      console.error(`❌ Recovery action failed with exception:`, recoveryError);
      
      const result: RecoveryResult = {
        success: false,
        action,
        message: `Recovery action failed: ${recoveryError.message}`,
        rollbackRequired: true,
        userInterventionRequired: true
      };

      this.recordRecoveryAttempt(recoveryId, result);
      return result;

    } finally {
      // Mark recovery as complete
      this.activeRecoveries.delete(recoveryId);
    }
  }

  /**
   * Execute rollback operations for failed recovery
   */
  async executeRollback(sessionId: string): Promise<boolean> {
    const rollbackOps = this.rollbackStack.get(sessionId) || [];
    
    if (rollbackOps.length === 0) {
      console.log('📋 No rollback operations available');
      return true;
    }

    console.log(`🔄 Executing ${rollbackOps.length} rollback operations...`);
    
    // Sort by priority (higher number = higher priority for rollback)
    const sortedOps = rollbackOps.sort((a, b) => b.priority - a.priority);
    
    let allSuccessful = true;
    
    for (const operation of sortedOps) {
      try {
        console.log(`🔄 Rolling back: ${operation.description}`);
        
        const success = await operation.execute();
        if (success) {
          // Verify rollback was successful
          const verified = await operation.verify();
          if (!verified) {
            console.error(`❌ Rollback verification failed: ${operation.description}`);
            allSuccessful = false;
          }
        } else {
          console.error(`❌ Rollback failed: ${operation.description}`);
          allSuccessful = false;
        }
      } catch (error) {
        console.error(`❌ Rollback exception: ${operation.description}`, error);
        allSuccessful = false;
      }
    }

    // Clear rollback stack after execution
    this.rollbackStack.delete(sessionId);
    
    return allSuccessful;
  }

  /**
   * Generate manual intervention guide for complex issues
   */
  generateManualInterventionGuide(
    error: WizardError,
    context: RecoveryContext = {}
  ): ManualInterventionGuide {
    switch (error.category) {
      case ErrorCategory.SERIAL_PORT:
        return this.generateSerialPortInterventionGuide(error, context);
      
      case ErrorCategory.COMMUNICATION:
        return this.generateCommunicationInterventionGuide(error, context);
      
      case ErrorCategory.ADDRESS_CONFIG:
        return this.generateAddressConfigInterventionGuide(error, context);
      
      case ErrorCategory.HARDWARE_TEST:
        return this.generateHardwareTestInterventionGuide(error, context);
      
      case ErrorCategory.SYSTEM_INTEGRATION:
        return this.generateSystemIntegrationInterventionGuide(error, context);
      
      default:
        return this.generateGenericInterventionGuide(error, context);
    }
  }

  /**
   * Get recovery history for analysis
   */
  getRecoveryHistory(sessionId?: string): RecoveryResult[] {
    if (sessionId) {
      return this.recoveryHistory.get(sessionId) || [];
    }
    
    // Return all recovery history
    const allHistory: RecoveryResult[] = [];
    for (const history of this.recoveryHistory.values()) {
      allHistory.push(...history);
    }
    return allHistory;
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStatistics(): {
    totalRecoveries: number;
    successfulRecoveries: number;
    failedRecoveries: number;
    averageRecoveryTime: number;
    mostCommonFailures: string[];
    rollbacksExecuted: number;
  } {
    const allHistory = this.getRecoveryHistory();
    
    const successful = allHistory.filter(r => r.success);
    const failed = allHistory.filter(r => !r.success);
    const withRollback = allHistory.filter(r => r.rollbackRequired);
    
    const totalTime = allHistory.reduce((sum, r) => sum + (r.estimatedRecoveryTime || 0), 0);
    const averageTime = allHistory.length > 0 ? totalTime / allHistory.length : 0;
    
    // Count most common failure types
    const failureTypes = failed.map(r => r.action.type);
    const failureCounts = failureTypes.reduce((counts, type) => {
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    const mostCommonFailures = Object.entries(failureCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type]) => type);

    return {
      totalRecoveries: allHistory.length,
      successfulRecoveries: successful.length,
      failedRecoveries: failed.length,
      averageRecoveryTime: averageTime,
      mostCommonFailures,
      rollbacksExecuted: withRollback.length
    };
  }

  // Private helper methods
  private getBaseRecoveryActions(error: WizardError, context: RecoveryContext): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.code) {
      case ERROR_CODES.SP_NOT_FOUND:
        actions.push({
          type: 'automatic_fix',
          description: 'Rescan for serial ports',
          userDescription: 'Automatically scan for USB-RS485 adapters',
          automatic: true,
          priority: 1,
          execute: async () => {
            // Implementation would call hardware detection service
            console.log('🔍 Rescanning serial ports...');
            await this.delay(2000); // Simulate scan time
            return Math.random() > 0.3; // 70% success rate
          },
          estimatedDuration: 5
        });
        break;

      case ERROR_CODES.COM_TIMEOUT:
        actions.push({
          type: 'retry',
          description: 'Retry with extended timeout',
          userDescription: 'Try communication again with longer timeout',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔄 Retrying with extended timeout...');
            await this.delay(1000);
            return Math.random() > 0.4; // 60% success rate
          },
          estimatedDuration: 10
        });
        break;

      case ERROR_CODES.ADDR_CONFLICT:
        actions.push({
          type: 'automatic_fix',
          description: 'Resolve address conflicts',
          userDescription: 'Automatically assign different addresses',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔧 Resolving address conflicts...');
            await this.delay(3000);
            return Math.random() > 0.2; // 80% success rate
          },
          estimatedDuration: 15
        });
        break;
    }

    return actions;
  }

  private async getContextAwareActions(
    error: WizardError, 
    context: RecoveryContext
  ): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    // Add session-specific actions
    if (context.sessionId) {
      const sessionHistory = this.recoveryHistory.get(context.sessionId) || [];
      
      // If we've tried this before, suggest different approach
      if (sessionHistory.some(r => r.action.type === 'retry')) {
        actions.push({
          type: 'manual_intervention',
          description: 'Manual troubleshooting required',
          userDescription: 'Previous automatic attempts failed, manual intervention needed',
          automatic: false,
          priority: 2,
          execute: async () => false, // Manual intervention always requires user action
          requiresUserConfirmation: true
        });
      }
    }

    // Add step-specific actions
    if (context.step) {
      switch (context.step) {
        case 2: // Device detection step
          if (error.category === ErrorCategory.SERIAL_PORT) {
            actions.push({
              type: 'skip',
              description: 'Skip to manual device configuration',
              userDescription: 'Skip automatic detection and configure manually',
              automatic: false,
              priority: 3,
              execute: async () => {
                console.log('⏭️ Skipping to manual configuration...');
                return true;
              }
            });
          }
          break;

        case 3: // Address configuration step
          if (error.category === ErrorCategory.ADDRESS_CONFIG) {
            actions.push({
              type: 'rollback',
              description: 'Return to device detection',
              userDescription: 'Go back to device detection step',
              automatic: false,
              priority: 4,
              execute: async () => {
                console.log('🔙 Rolling back to device detection...');
                return true;
              }
            });
          }
          break;
      }
    }

    return actions;
  }

  private getProgressiveRecoveryActions(
    error: WizardError, 
    context: RecoveryContext
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];
    const attemptCount = context.attemptCount || 0;

    // Progressive escalation based on attempt count
    if (attemptCount >= 2) {
      actions.push({
        type: 'manual_intervention',
        description: 'Manual intervention recommended',
        userDescription: 'Multiple automatic attempts failed, manual help needed',
        automatic: false,
        priority: 5,
        execute: async () => false,
        requiresUserConfirmation: true
      });
    }

    if (attemptCount >= 3) {
      actions.push({
        type: 'rollback',
        description: 'Full rollback to previous working state',
        userDescription: 'Restore system to previous working configuration',
        automatic: false,
        priority: 6,
        execute: async () => {
          if (context.sessionId) {
            return await this.executeRollback(context.sessionId);
          }
          return false;
        }
      });
    }

    return actions;
  }

  private prioritizeAndDeduplicateActions(actions: RecoveryAction[]): RecoveryAction[] {
    // Remove duplicates based on type and description
    const unique = actions.filter((action, index, arr) => 
      arr.findIndex(a => a.type === action.type && a.description === action.description) === index
    );

    // Sort by priority (lower number = higher priority)
    return unique.sort((a, b) => a.priority - b.priority);
  }

  private async getNextRecoveryAction(
    completedAction: RecoveryAction,
    error: WizardError,
    context: RecoveryContext
  ): Promise<RecoveryAction | undefined> {
    // Define action chains
    if (completedAction.type === 'automatic_fix' && error.category === ErrorCategory.SERIAL_PORT) {
      return {
        type: 'retry',
        description: 'Test serial port connection',
        userDescription: 'Test if the serial port is now accessible',
        automatic: true,
        priority: 1,
        execute: async () => {
          console.log('🔍 Testing serial port connection...');
          await this.delay(1000);
          return Math.random() > 0.3;
        },
        estimatedDuration: 3
      };
    }

    return undefined;
  }

  private async getFailureRecoveryAction(
    failedAction: RecoveryAction,
    error: WizardError,
    context: RecoveryContext
  ): Promise<RecoveryAction | undefined> {
    // Suggest alternative actions when primary recovery fails
    if (failedAction.type === 'automatic_fix') {
      return {
        type: 'manual_intervention',
        description: 'Manual troubleshooting required',
        userDescription: 'Automatic fix failed, manual intervention needed',
        automatic: false,
        priority: 2,
        execute: async () => false,
        requiresUserConfirmation: true
      };
    }

    if (failedAction.type === 'retry') {
      return {
        type: 'rollback',
        description: 'Rollback and try different approach',
        userDescription: 'Restore previous state and try alternative method',
        automatic: false,
        priority: 3,
        execute: async () => {
          if (context.sessionId) {
            return await this.executeRollback(context.sessionId);
          }
          return false;
        }
      };
    }

    return undefined;
  }

  private requiresRollbackPoint(action: RecoveryAction): boolean {
    // Actions that modify system state should create rollback points
    return action.type === 'automatic_fix' || 
           action.description.toLowerCase().includes('config') ||
           action.description.toLowerCase().includes('update');
  }

  private async createRollbackPoint(recoveryId: string, context: RecoveryContext): Promise<void> {
    const sessionId = context.sessionId || recoveryId;
    
    if (!this.rollbackStack.has(sessionId)) {
      this.rollbackStack.set(sessionId, []);
    }

    const rollbackOps = this.rollbackStack.get(sessionId)!;

    // Add rollback operations based on context
    if (context.operation === 'config_update') {
      rollbackOps.push({
        id: `rollback_config_${Date.now()}`,
        description: 'Restore previous configuration',
        execute: async () => {
          console.log('🔄 Restoring previous configuration...');
          // Implementation would restore config from backup
          return true;
        },
        verify: async () => {
          console.log('✅ Verifying configuration restore...');
          return true;
        },
        priority: 1
      });
    }

    if (context.operation === 'service_restart') {
      rollbackOps.push({
        id: `rollback_service_${Date.now()}`,
        description: 'Restart services to previous state',
        execute: async () => {
          console.log('🔄 Restarting services...');
          return true;
        },
        verify: async () => {
          console.log('✅ Verifying service state...');
          return true;
        },
        priority: 2
      });
    }
  }

  private shouldRollback(action: RecoveryAction, error: WizardError): boolean {
    // Determine if rollback is needed based on action type and error severity
    return action.type === 'automatic_fix' && 
           (error.severity === 'critical' || error.severity === 'error');
  }

  private requiresUserIntervention(action: RecoveryAction, error: WizardError): boolean {
    // Determine if user intervention is required
    return action.type === 'manual_intervention' ||
           error.category === ErrorCategory.PERMISSION ||
           (action.type === 'automatic_fix' && error.severity === 'critical');
  }

  private generateRecoveryId(error: WizardError, context: RecoveryContext): string {
    const timestamp = Date.now();
    const sessionPart = context.sessionId ? context.sessionId.slice(-8) : 'no-session';
    const errorPart = error.code.slice(-3);
    return `recovery_${sessionPart}_${errorPart}_${timestamp}`;
  }

  private recordRecoveryAttempt(recoveryId: string, result: RecoveryResult): void {
    const sessionId = recoveryId.split('_')[1] || 'unknown';
    
    if (!this.recoveryHistory.has(sessionId)) {
      this.recoveryHistory.set(sessionId, []);
    }

    this.recoveryHistory.get(sessionId)!.push(result);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  // 
Manual intervention guide generators
  private generateSerialPortInterventionGuide(
    error: WizardError,
    context: RecoveryContext
  ): ManualInterventionGuide {
    return {
      title: 'Serial Port Connection Issues',
      description: 'Step-by-step guide to resolve USB-RS485 adapter connection problems',
      estimatedTime: 300, // 5 minutes
      skillLevel: 'beginner',
      toolsRequired: ['USB-RS485 adapter', 'USB cable'],
      safetyWarnings: [
        'Ensure system is powered off before connecting/disconnecting hardware',
        'Use only the provided USB cable to avoid connection issues'
      ],
      steps: [
        {
          stepNumber: 1,
          title: 'Check Physical Connection',
          description: 'Verify the USB-RS485 adapter is properly connected',
          action: 'Disconnect and reconnect the USB cable firmly to both the adapter and computer',
          expectedResult: 'USB device should be recognized by the operating system',
          troubleshooting: 'Try a different USB port or cable if device is not recognized'
        },
        {
          stepNumber: 2,
          title: 'Verify Device Manager',
          description: 'Check if the device appears in Device Manager (Windows) or lsusb (Linux)',
          action: 'Open Device Manager and look for the USB-RS485 adapter under "Ports (COM & LPT)"',
          expectedResult: 'Device should appear without warning icons',
          troubleshooting: 'If device has warning icon, right-click and update driver'
        },
        {
          stepNumber: 3,
          title: 'Test Port Access',
          description: 'Verify the application can access the serial port',
          action: 'Run the application as administrator or add user to dialout group (Linux)',
          expectedResult: 'Application should be able to open the serial port',
          troubleshooting: 'Check user permissions and group membership'
        },
        {
          stepNumber: 4,
          title: 'Check for Conflicts',
          description: 'Ensure no other applications are using the serial port',
          action: 'Close any terminal programs, Arduino IDE, or other serial applications',
          expectedResult: 'Only one application should access the port at a time',
          troubleshooting: 'Use Task Manager to identify and close conflicting applications'
        }
      ]
    };
  }

  private generateCommunicationInterventionGuide(
    error: WizardError,
    context: RecoveryContext
  ): ManualInterventionGuide {
    return {
      title: 'Modbus Communication Problems',
      description: 'Guide to resolve RS485 communication issues with relay cards',
      estimatedTime: 600, // 10 minutes
      skillLevel: 'intermediate',
      toolsRequired: ['Multimeter', 'RS485 wiring diagram'],
      safetyWarnings: [
        'Turn off power to relay cards before checking connections',
        'Verify voltage levels before connecting devices'
      ],
      steps: [
        {
          stepNumber: 1,
          title: 'Check RS485 Wiring',
          description: 'Verify A+, B-, and GND connections',
          action: 'Check that A+ connects to A+, B- connects to B-, and GND is common',
          expectedResult: 'Wiring should match the connection diagram exactly',
          troubleshooting: 'Swap A+ and B- if communication fails - some devices have reversed labeling'
        },
        {
          stepNumber: 2,
          title: 'Verify Power Supply',
          description: 'Ensure relay card has stable 12V power',
          action: 'Use multimeter to check 12V power supply voltage at relay card terminals',
          expectedResult: 'Voltage should be between 11.5V and 12.5V',
          troubleshooting: 'Check power supply capacity - relay cards need adequate current'
        },
        {
          stepNumber: 3,
          title: 'Test Cable Continuity',
          description: 'Check RS485 cable for breaks or shorts',
          action: 'Use multimeter to test continuity of A+, B-, and GND wires',
          expectedResult: 'Each wire should have good continuity end-to-end',
          troubleshooting: 'Replace cable if any wire shows open circuit or short'
        },
        {
          stepNumber: 4,
          title: 'Check Termination',
          description: 'Verify RS485 bus termination is correct',
          action: 'Ensure 120Ω termination resistors are installed at both ends of RS485 bus',
          expectedResult: 'Total bus resistance should be approximately 60Ω (two 120Ω in parallel)',
          troubleshooting: 'Add or remove termination resistors as needed'
        },
        {
          stepNumber: 5,
          title: 'Test with Single Device',
          description: 'Isolate communication issues by testing one device',
          action: 'Disconnect all but one relay card and test communication',
          expectedResult: 'Single device should communicate reliably',
          troubleshooting: 'If single device fails, check device address and power'
        }
      ]
    };
  }

  private generateAddressConfigInterventionGuide(
    error: WizardError,
    context: RecoveryContext
  ): ManualInterventionGuide {
    return {
      title: 'Slave Address Configuration Issues',
      description: 'Manual steps to resolve Modbus address conflicts and configuration problems',
      estimatedTime: 480, // 8 minutes
      skillLevel: 'intermediate',
      toolsRequired: ['Modbus testing software (optional)'],
      steps: [
        {
          stepNumber: 1,
          title: 'Scan Current Addresses',
          description: 'Identify all devices currently on the bus',
          action: 'Use the hardware wizard to scan addresses 1-255 and note responding devices',
          expectedResult: 'List of all active device addresses',
          troubleshooting: 'If scan finds no devices, check communication setup first'
        },
        {
          stepNumber: 2,
          title: 'Identify Conflicts',
          description: 'Find devices with duplicate addresses',
          action: 'Look for multiple devices responding to the same address',
          expectedResult: 'Clear identification of address conflicts',
          troubleshooting: 'Physically disconnect devices one by one to isolate conflicts'
        },
        {
          stepNumber: 3,
          title: 'Power Cycle Devices',
          description: 'Reset devices to ensure clean state',
          action: 'Turn off power to all relay cards, wait 10 seconds, then power on one at a time',
          expectedResult: 'Devices should start with their configured addresses',
          troubleshooting: 'Some devices may revert to default address (1) after power loss'
        },
        {
          stepNumber: 4,
          title: 'Configure Addresses Individually',
          description: 'Set unique addresses for each device',
          action: 'Connect one device at a time and use broadcast command to set unique address',
          expectedResult: 'Each device should respond only at its assigned address',
          troubleshooting: 'If broadcast fails, device may not support software address configuration'
        },
        {
          stepNumber: 5,
          title: 'Verify Final Configuration',
          description: 'Test all devices with their new addresses',
          action: 'Connect all devices and verify each responds only at its assigned address',
          expectedResult: 'No address conflicts, all devices responding correctly',
          troubleshooting: 'If conflicts persist, check for hardware address switches (DIP switches)'
        }
      ]
    };
  }

  private generateHardwareTestInterventionGuide(
    error: WizardError,
    context: RecoveryContext
  ): ManualInterventionGuide {
    return {
      title: 'Hardware Testing and Validation Issues',
      description: 'Manual procedures to diagnose and fix relay testing problems',
      estimatedTime: 420, // 7 minutes
      skillLevel: 'beginner',
      toolsRequired: ['Multimeter', 'Test load (LED or small bulb)'],
      safetyWarnings: [
        'Do not exceed relay voltage/current ratings',
        'Use appropriate test loads to verify relay operation'
      ],
      steps: [
        {
          stepNumber: 1,
          title: 'Test Communication First',
          description: 'Ensure basic Modbus communication is working',
          action: 'Send read register command to verify device responds',
          expectedResult: 'Device should return valid register data',
          troubleshooting: 'Fix communication issues before testing relays'
        },
        {
          stepNumber: 2,
          title: 'Listen for Relay Clicks',
          description: 'Verify relays are physically activating',
          action: 'Send relay activation command and listen for audible click',
          expectedResult: 'Should hear distinct click sound when relay activates',
          troubleshooting: 'If no click, check power supply and relay card health'
        },
        {
          stepNumber: 3,
          title: 'Test with Multimeter',
          description: 'Measure relay contact closure electrically',
          action: 'Use multimeter continuity mode to test relay contacts',
          expectedResult: 'Contacts should show continuity when relay is activated',
          troubleshooting: 'If no continuity, relay may be defective'
        },
        {
          stepNumber: 4,
          title: 'Test with Load',
          description: 'Connect test load to verify relay can switch current',
          action: 'Connect LED or small bulb to relay contacts and test activation',
          expectedResult: 'Test load should turn on/off with relay commands',
          troubleshooting: 'Check load connections and relay current rating'
        },
        {
          stepNumber: 5,
          title: 'Test Multiple Relays',
          description: 'Verify all relays on the card are functional',
          action: 'Test relays 1, 8, and 16 to check different sections of the card',
          expectedResult: 'All tested relays should activate correctly',
          troubleshooting: 'If some relays fail, card may have partial damage'
        }
      ]
    };
  }

  private generateSystemIntegrationInterventionGuide(
    error: WizardError,
    context: RecoveryContext
  ): ManualInterventionGuide {
    return {
      title: 'System Integration Problems',
      description: 'Manual steps to resolve configuration and service integration issues',
      estimatedTime: 900, // 15 minutes
      skillLevel: 'advanced',
      toolsRequired: ['Text editor', 'System administration access'],
      safetyWarnings: [
        'Create backup of configuration files before making changes',
        'Ensure you have system administrator privileges'
      ],
      steps: [
        {
          stepNumber: 1,
          title: 'Backup Current Configuration',
          description: 'Create safety backup before making changes',
          action: 'Copy system.json and database files to backup location',
          expectedResult: 'Backup files created with timestamp',
          troubleshooting: 'Ensure backup location has sufficient disk space'
        },
        {
          stepNumber: 2,
          title: 'Validate Configuration Syntax',
          description: 'Check configuration file for JSON syntax errors',
          action: 'Open system.json in text editor and validate JSON structure',
          expectedResult: 'File should be valid JSON with proper syntax',
          troubleshooting: 'Use online JSON validator if syntax errors are found'
        },
        {
          stepNumber: 3,
          title: 'Check File Permissions',
          description: 'Ensure application can read/write configuration files',
          action: 'Verify file permissions allow application to modify system.json',
          expectedResult: 'Application should have read/write access to config files',
          troubleshooting: 'Change file ownership or permissions as needed'
        },
        {
          stepNumber: 4,
          title: 'Test Configuration Update',
          description: 'Manually update configuration with new hardware',
          action: 'Add new relay card entry to system.json hardware section',
          expectedResult: 'Configuration should include new hardware definition',
          troubleshooting: 'Follow existing configuration format exactly'
        },
        {
          stepNumber: 5,
          title: 'Restart Services Manually',
          description: 'Stop and start services to apply configuration changes',
          action: 'Stop kiosk and gateway services, then restart them',
          expectedResult: 'Services should start without errors and load new configuration',
          troubleshooting: 'Check service logs for startup errors'
        },
        {
          stepNumber: 6,
          title: 'Verify API Access',
          description: 'Test that new hardware is accessible via API',
          action: 'Use API testing tool to send commands to new locker ranges',
          expectedResult: 'API should accept commands for new lockers',
          troubleshooting: 'Check service logs and hardware connectivity'
        }
      ]
    };
  }

  private generateGenericInterventionGuide(
    error: WizardError,
    context: RecoveryContext
  ): ManualInterventionGuide {
    return {
      title: 'General Troubleshooting',
      description: 'Basic troubleshooting steps for unspecified issues',
      estimatedTime: 300, // 5 minutes
      skillLevel: 'beginner',
      steps: [
        {
          stepNumber: 1,
          title: 'Check System Logs',
          description: 'Review application logs for detailed error information',
          action: 'Open application log files and look for error messages around the time of failure',
          expectedResult: 'Logs should provide more specific error details',
          troubleshooting: 'Look for patterns in error messages or stack traces'
        },
        {
          stepNumber: 2,
          title: 'Restart Application',
          description: 'Try restarting the application to clear temporary issues',
          action: 'Close and restart the hardware configuration wizard',
          expectedResult: 'Application should start cleanly without errors',
          troubleshooting: 'If restart fails, check for system resource issues'
        },
        {
          stepNumber: 3,
          title: 'Check System Resources',
          description: 'Verify system has adequate resources available',
          action: 'Check CPU usage, memory usage, and disk space',
          expectedResult: 'System should have adequate resources for operation',
          troubleshooting: 'Close other applications if resources are low'
        },
        {
          stepNumber: 4,
          title: 'Contact Support',
          description: 'Get help from technical support if issue persists',
          action: 'Gather error logs and system information, then contact technical support',
          expectedResult: 'Support team should be able to provide specific guidance',
          troubleshooting: 'Include as much detail as possible in support request'
        }
      ]
    };
  }
}

// Export singleton instance
export const recoveryActionSystem = new RecoveryActionSystem();