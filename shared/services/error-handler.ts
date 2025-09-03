/**
 * Hardware Configuration Wizard - Error Handler Service
 * 
 * Provides comprehensive error classification, recovery actions, and user-friendly
 * error messaging for the hardware configuration wizard.
 * 
 * Based on requirements 7.1 and 7.2 from the Hardware Configuration Wizard spec.
 */

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  SERIAL_PORT = 'serial_port',
  COMMUNICATION = 'communication',
  ADDRESS_CONFIG = 'address_config',
  HARDWARE_TEST = 'hardware_test',
  SYSTEM_INTEGRATION = 'system_integration',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  PERMISSION = 'permission',
  CONFIGURATION = 'configuration'
}

export interface WizardError {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  details?: any;
  recoverable: boolean;
  suggestedAction?: string;
  documentationUrl?: string;
  timestamp: Date;
  context?: {
    step?: number;
    sessionId?: string;
    deviceAddress?: number;
    operation?: string;
  };
}

export interface RecoveryAction {
  type: 'retry' | 'skip' | 'rollback' | 'manual_intervention' | 'automatic_fix';
  description: string;
  userDescription: string;
  automatic: boolean;
  priority: number; // 1 = highest priority
  execute: () => Promise<boolean>;
  estimatedDuration?: number; // seconds
  requiresUserConfirmation?: boolean;
}

export interface TroubleshootingStep {
  id: string;
  title: string;
  description: string;
  action?: string;
  expectedResult?: string;
  nextStepOnSuccess?: string;
  nextStepOnFailure?: string;
  isAutomated?: boolean;
  estimatedTime?: number; // seconds
}

/**
 * Error code mapping for consistent error identification
 */
export const ERROR_CODES = {
  // Serial Port Errors (SP_xxx)
  SP_NOT_FOUND: 'SP_001',
  SP_PERMISSION_DENIED: 'SP_002',
  SP_DEVICE_BUSY: 'SP_003',
  SP_DISCONNECTED: 'SP_004',
  SP_INVALID_CONFIG: 'SP_005',

  // Communication Errors (COM_xxx)
  COM_TIMEOUT: 'COM_001',
  COM_NO_RESPONSE: 'COM_002',
  COM_CRC_ERROR: 'COM_003',
  COM_INVALID_RESPONSE: 'COM_004',
  COM_CONNECTION_LOST: 'COM_005',

  // Address Configuration Errors (ADDR_xxx)
  ADDR_CONFLICT: 'ADDR_001',
  ADDR_OUT_OF_RANGE: 'ADDR_002',
  ADDR_VERIFICATION_FAILED: 'ADDR_003',
  ADDR_BROADCAST_FAILED: 'ADDR_004',
  ADDR_READ_FAILED: 'ADDR_005',

  // Hardware Test Errors (TEST_xxx)
  TEST_COMMUNICATION_FAILED: 'TEST_001',
  TEST_RELAY_NO_RESPONSE: 'TEST_002',
  TEST_RELAY_STUCK: 'TEST_003',
  TEST_PERFORMANCE_POOR: 'TEST_004',
  TEST_VALIDATION_FAILED: 'TEST_005',

  // System Integration Errors (SYS_xxx)
  SYS_CONFIG_UPDATE_FAILED: 'SYS_001',
  SYS_SERVICE_RESTART_FAILED: 'SYS_002',
  SYS_VALIDATION_FAILED: 'SYS_003',
  SYS_ROLLBACK_FAILED: 'SYS_004',
  SYS_DATABASE_ERROR: 'SYS_005',

  // Validation Errors (VAL_xxx)
  VAL_INVALID_INPUT: 'VAL_001',
  VAL_MISSING_REQUIRED: 'VAL_002',
  VAL_FORMAT_ERROR: 'VAL_003',
  VAL_RANGE_ERROR: 'VAL_004',

  // General Errors (GEN_xxx)
  GEN_UNKNOWN: 'GEN_001',
  GEN_INTERNAL_ERROR: 'GEN_002',
  GEN_OPERATION_CANCELLED: 'GEN_003',
  GEN_INSUFFICIENT_RESOURCES: 'GEN_004'
} as const;

/**
 * Documentation URLs for different error categories
 */
export const DOCUMENTATION_URLS = {
  [ErrorCategory.SERIAL_PORT]: '/docs/troubleshooting/serial-port-issues',
  [ErrorCategory.COMMUNICATION]: '/docs/troubleshooting/communication-errors',
  [ErrorCategory.ADDRESS_CONFIG]: '/docs/troubleshooting/address-configuration',
  [ErrorCategory.HARDWARE_TEST]: '/docs/troubleshooting/hardware-testing',
  [ErrorCategory.SYSTEM_INTEGRATION]: '/docs/troubleshooting/system-integration',
  [ErrorCategory.VALIDATION]: '/docs/troubleshooting/validation-errors',
  [ErrorCategory.TIMEOUT]: '/docs/troubleshooting/timeout-issues',
  [ErrorCategory.PERMISSION]: '/docs/troubleshooting/permission-issues',
  [ErrorCategory.CONFIGURATION]: '/docs/troubleshooting/configuration-errors'
};

/**
 * Main Error Handler class for the Hardware Configuration Wizard
 */
export class ErrorHandler {
  private errorHistory: WizardError[] = [];
  private maxHistorySize = 100;

  /**
   * Classify an error and convert it to a WizardError with appropriate metadata
   */
  classifyError(error: Error | any, context?: Partial<WizardError['context']>): WizardError {
    const timestamp = new Date();
    
    // Handle known error types
    if (error.code && ERROR_CODES[error.code as keyof typeof ERROR_CODES]) {
      return this.createKnownError(error, context, timestamp);
    }

    // Handle system errors
    if (error.code === 'ENOENT') {
      return this.createSerialPortError('SP_NOT_FOUND', error, context, timestamp);
    }

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return this.createSerialPortError('SP_PERMISSION_DENIED', error, context, timestamp);
    }

    if (error.code === 'EBUSY') {
      return this.createSerialPortError('SP_DEVICE_BUSY', error, context, timestamp);
    }

    // Handle timeout errors
    if (error.message?.toLowerCase().includes('timeout') || error.code === 'ETIMEDOUT') {
      return this.createCommunicationError('COM_TIMEOUT', error, context, timestamp);
    }

    // Handle CRC errors
    if (error.message?.toLowerCase().includes('crc')) {
      return this.createCommunicationError('COM_CRC_ERROR', error, context, timestamp);
    }

    // Default to unknown error
    return this.createUnknownError(error, context, timestamp);
  }

  /**
   * Generate user-friendly error message
   */
  formatUserFriendlyMessage(error: WizardError): string {
    const baseMessage = error.userMessage || error.message;
    
    let formattedMessage = `${baseMessage}`;
    
    if (error.suggestedAction) {
      formattedMessage += `\n\nSuggested action: ${error.suggestedAction}`;
    }

    if (error.documentationUrl) {
      formattedMessage += `\n\nFor more help, see: ${error.documentationUrl}`;
    }

    return formattedMessage;
  }

  /**
   * Suggest recovery actions for an error
   */
  suggestRecoveryAction(error: WizardError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.category) {
      case ErrorCategory.SERIAL_PORT:
        actions.push(...this.getSerialPortRecoveryActions(error));
        break;
      
      case ErrorCategory.COMMUNICATION:
        actions.push(...this.getCommunicationRecoveryActions(error));
        break;
      
      case ErrorCategory.ADDRESS_CONFIG:
        actions.push(...this.getAddressConfigRecoveryActions(error));
        break;
      
      case ErrorCategory.HARDWARE_TEST:
        actions.push(...this.getHardwareTestRecoveryActions(error));
        break;
      
      case ErrorCategory.SYSTEM_INTEGRATION:
        actions.push(...this.getSystemIntegrationRecoveryActions(error));
        break;
      
      default:
        actions.push(this.getGenericRecoveryAction(error));
    }

    // Sort by priority (lower number = higher priority)
    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute a recovery action
   */
  async executeRecoveryAction(action: RecoveryAction): Promise<boolean> {
    try {
      console.log(`🔧 Executing recovery action: ${action.description}`);
      const result = await action.execute();
      console.log(`✅ Recovery action ${result ? 'succeeded' : 'failed'}: ${action.description}`);
      return result;
    } catch (error) {
      console.error(`❌ Recovery action failed with error: ${action.description}`, error);
      return false;
    }
  }

  /**
   * Generate troubleshooting steps for an error
   */
  generateTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    switch (error.category) {
      case ErrorCategory.SERIAL_PORT:
        return this.getSerialPortTroubleshootingSteps(error);
      
      case ErrorCategory.COMMUNICATION:
        return this.getCommunicationTroubleshootingSteps(error);
      
      case ErrorCategory.ADDRESS_CONFIG:
        return this.getAddressConfigTroubleshootingSteps(error);
      
      case ErrorCategory.HARDWARE_TEST:
        return this.getHardwareTestTroubleshootingSteps(error);
      
      case ErrorCategory.SYSTEM_INTEGRATION:
        return this.getSystemIntegrationTroubleshootingSteps(error);
      
      default:
        return this.getGenericTroubleshootingSteps(error);
    }
  }

  /**
   * Add error to history for analysis
   */
  addToHistory(error: WizardError): void {
    this.errorHistory.unshift(error);
    
    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get error history for analysis
   */
  getErrorHistory(): WizardError[] {
    return [...this.errorHistory];
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    recentErrors: WizardError[];
  } {
    const errorsByCategory = {} as Record<ErrorCategory, number>;
    const errorsBySeverity = {} as Record<ErrorSeverity, number>;

    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      errorsByCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });

    // Count errors
    this.errorHistory.forEach(error => {
      errorsByCategory[error.category]++;
      errorsBySeverity[error.severity]++;
    });

    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      recentErrors: this.errorHistory.slice(0, 10)
    };
  }

  // Private helper methods for creating specific error types
  private createKnownError(error: any, context?: Partial<WizardError['context']>, timestamp: Date = new Date()): WizardError {
    const code = error.code;
    const category = this.getErrorCategory(code);
    const severity = this.getErrorSeverity(code);
    
    const wizardError: WizardError = {
      code,
      category,
      severity,
      message: error.message || `Error ${code}`,
      userMessage: this.getUserMessage(code),
      details: error.details || error,
      recoverable: this.isRecoverable(code),
      suggestedAction: this.getSuggestedAction(code),
      documentationUrl: DOCUMENTATION_URLS[category],
      timestamp,
      context: context || {}
    };

    this.addToHistory(wizardError);
    return wizardError;
  }

  private createSerialPortError(code: string, error: any, context?: Partial<WizardError['context']>, timestamp: Date = new Date()): WizardError {
    const wizardError: WizardError = {
      code,
      category: ErrorCategory.SERIAL_PORT,
      severity: ErrorSeverity.ERROR,
      message: error.message || `Serial port error: ${code}`,
      userMessage: this.getUserMessage(code),
      details: error,
      recoverable: true,
      suggestedAction: this.getSuggestedAction(code),
      documentationUrl: DOCUMENTATION_URLS[ErrorCategory.SERIAL_PORT],
      timestamp,
      context: context || {}
    };

    this.addToHistory(wizardError);
    return wizardError;
  }

  private createCommunicationError(code: string, error: any, context?: Partial<WizardError['context']>, timestamp: Date = new Date()): WizardError {
    const wizardError: WizardError = {
      code,
      category: ErrorCategory.COMMUNICATION,
      severity: ErrorSeverity.WARNING,
      message: error.message || `Communication error: ${code}`,
      userMessage: this.getUserMessage(code),
      details: error,
      recoverable: true,
      suggestedAction: this.getSuggestedAction(code),
      documentationUrl: DOCUMENTATION_URLS[ErrorCategory.COMMUNICATION],
      timestamp,
      context: context || {}
    };

    this.addToHistory(wizardError);
    return wizardError;
  }

  private createUnknownError(error: any, context?: Partial<WizardError['context']>, timestamp: Date = new Date()): WizardError {
    const wizardError: WizardError = {
      code: ERROR_CODES.GEN_UNKNOWN,
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.ERROR,
      message: error.message || 'Unknown error occurred',
      userMessage: 'An unexpected error occurred. Please try again or contact support.',
      details: error,
      recoverable: true,
      suggestedAction: 'Try the operation again. If the problem persists, contact technical support.',
      documentationUrl: DOCUMENTATION_URLS[ErrorCategory.CONFIGURATION],
      timestamp,
      context: context || {}
    };

    this.addToHistory(wizardError);
    return wizardError;
  }

  // Helper methods for error classification
  private getErrorCategory(code: string): ErrorCategory {
    if (code.startsWith('SP_')) return ErrorCategory.SERIAL_PORT;
    if (code.startsWith('COM_')) return ErrorCategory.COMMUNICATION;
    if (code.startsWith('ADDR_')) return ErrorCategory.ADDRESS_CONFIG;
    if (code.startsWith('TEST_')) return ErrorCategory.HARDWARE_TEST;
    if (code.startsWith('SYS_')) return ErrorCategory.SYSTEM_INTEGRATION;
    if (code.startsWith('VAL_')) return ErrorCategory.VALIDATION;
    return ErrorCategory.CONFIGURATION;
  }

  private getErrorSeverity(code: string): ErrorSeverity {
    // Critical errors that prevent wizard from continuing
    const criticalCodes = [
      ERROR_CODES.SP_NOT_FOUND,
      ERROR_CODES.SYS_DATABASE_ERROR,
      ERROR_CODES.SYS_ROLLBACK_FAILED
    ];

    // Warning errors that can be recovered from
    const warningCodes = [
      ERROR_CODES.COM_TIMEOUT,
      ERROR_CODES.TEST_PERFORMANCE_POOR,
      ERROR_CODES.VAL_FORMAT_ERROR
    ];

    if (criticalCodes.includes(code)) return ErrorSeverity.CRITICAL;
    if (warningCodes.includes(code)) return ErrorSeverity.WARNING;
    return ErrorSeverity.ERROR;
  }

  private isRecoverable(code: string): boolean {
    // Non-recoverable errors
    const nonRecoverableCodes = [
      ERROR_CODES.SYS_DATABASE_ERROR,
      ERROR_CODES.GEN_INSUFFICIENT_RESOURCES
    ];

    return !nonRecoverableCodes.includes(code);
  }

  private getUserMessage(code: string): string {
    const messages: Record<string, string> = {
      [ERROR_CODES.SP_NOT_FOUND]: 'USB-RS485 adapter not found. Please check the connection.',
      [ERROR_CODES.SP_PERMISSION_DENIED]: 'Permission denied accessing the serial port. Please check user permissions.',
      [ERROR_CODES.SP_DEVICE_BUSY]: 'Serial port is busy. Another application may be using it.',
      [ERROR_CODES.SP_DISCONNECTED]: 'USB-RS485 adapter was disconnected. Please reconnect the device.',
      [ERROR_CODES.COM_TIMEOUT]: 'Communication timeout. The device may not be responding.',
      [ERROR_CODES.COM_NO_RESPONSE]: 'No response from the Modbus device. Check connections and power.',
      [ERROR_CODES.COM_CRC_ERROR]: 'Communication error detected. Data may be corrupted.',
      [ERROR_CODES.ADDR_CONFLICT]: 'Address conflict detected. Multiple devices have the same address.',
      [ERROR_CODES.ADDR_VERIFICATION_FAILED]: 'Could not verify the new address was set correctly.',
      [ERROR_CODES.TEST_COMMUNICATION_FAILED]: 'Communication test failed. Device may not be responding.',
      [ERROR_CODES.TEST_RELAY_NO_RESPONSE]: 'Relay test failed. No physical click detected.',
      [ERROR_CODES.SYS_CONFIG_UPDATE_FAILED]: 'Failed to update system configuration. Changes were not saved.',
      [ERROR_CODES.SYS_SERVICE_RESTART_FAILED]: 'Failed to restart hardware services. Manual restart may be required.',
      [ERROR_CODES.VAL_INVALID_INPUT]: 'Invalid input provided. Please check the values and try again.',
      [ERROR_CODES.GEN_UNKNOWN]: 'An unexpected error occurred. Please try again.'
    };

    return messages[code] || 'An error occurred during the operation.';
  }

  private getSuggestedAction(code: string): string {
    const actions: Record<string, string> = {
      [ERROR_CODES.SP_NOT_FOUND]: 'Check USB-RS485 adapter connection and try scanning again.',
      [ERROR_CODES.SP_PERMISSION_DENIED]: 'Run as administrator or add user to dialout group.',
      [ERROR_CODES.SP_DEVICE_BUSY]: 'Close other applications using the serial port and retry.',
      [ERROR_CODES.SP_DISCONNECTED]: 'Reconnect the USB-RS485 adapter and scan for devices.',
      [ERROR_CODES.COM_TIMEOUT]: 'Check device power and connections, then retry.',
      [ERROR_CODES.COM_NO_RESPONSE]: 'Verify device is powered on and connections are secure.',
      [ERROR_CODES.COM_CRC_ERROR]: 'Check cable connections and try again.',
      [ERROR_CODES.ADDR_CONFLICT]: 'Use automatic address resolution or manually assign different addresses.',
      [ERROR_CODES.ADDR_VERIFICATION_FAILED]: 'Retry address configuration or use manual verification.',
      [ERROR_CODES.TEST_COMMUNICATION_FAILED]: 'Check device connections and power, then retry test.',
      [ERROR_CODES.TEST_RELAY_NO_RESPONSE]: 'Verify relay card is properly connected and powered.',
      [ERROR_CODES.SYS_CONFIG_UPDATE_FAILED]: 'Check file permissions and disk space, then retry.',
      [ERROR_CODES.SYS_SERVICE_RESTART_FAILED]: 'Manually restart services or reboot the system.',
      [ERROR_CODES.VAL_INVALID_INPUT]: 'Correct the input values and try again.',
      [ERROR_CODES.GEN_UNKNOWN]: 'Try the operation again or contact technical support.'
    };

    return actions[code] || 'Try the operation again.';
  }

  // Recovery action methods
  private getSerialPortRecoveryActions(error: WizardError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.code) {
      case ERROR_CODES.SP_NOT_FOUND:
        actions.push({
          type: 'automatic_fix',
          description: 'Scan for available serial ports',
          userDescription: 'Automatically scan for USB-RS485 adapters',
          automatic: true,
          priority: 1,
          execute: async () => {
            // This would call the hardware detection service
            console.log('🔍 Scanning for serial ports...');
            return true; // Placeholder
          },
          estimatedDuration: 5
        });
        break;

      case ERROR_CODES.SP_PERMISSION_DENIED:
        actions.push({
          type: 'manual_intervention',
          description: 'Fix serial port permissions',
          userDescription: 'Grant permission to access the serial port',
          automatic: false,
          priority: 1,
          execute: async () => {
            console.log('📋 Please run as administrator or add user to dialout group');
            return false; // Requires manual action
          },
          requiresUserConfirmation: true
        });
        break;

      case ERROR_CODES.SP_DEVICE_BUSY:
        actions.push({
          type: 'automatic_fix',
          description: 'Check for conflicting applications',
          userDescription: 'Check if another application is using the port',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔍 Checking for port conflicts...');
            // This would check for processes using the port
            return true; // Placeholder
          },
          estimatedDuration: 3
        });
        break;
    }

    return actions;
  }

  private getCommunicationRecoveryActions(error: WizardError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.code) {
      case ERROR_CODES.COM_TIMEOUT:
        actions.push({
          type: 'retry',
          description: 'Retry communication with longer timeout',
          userDescription: 'Try again with extended timeout',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔄 Retrying with extended timeout...');
            return true; // Placeholder
          },
          estimatedDuration: 10
        });
        break;

      case ERROR_CODES.COM_NO_RESPONSE:
        actions.push({
          type: 'automatic_fix',
          description: 'Test device connectivity',
          userDescription: 'Test if device is responding',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔍 Testing device connectivity...');
            return true; // Placeholder
          },
          estimatedDuration: 5
        });
        break;

      case ERROR_CODES.COM_CRC_ERROR:
        actions.push({
          type: 'retry',
          description: 'Retry communication',
          userDescription: 'Retry the communication',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔄 Retrying communication...');
            return true; // Placeholder
          },
          estimatedDuration: 3
        });
        break;
    }

    return actions;
  }

  private getAddressConfigRecoveryActions(error: WizardError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.code) {
      case ERROR_CODES.ADDR_CONFLICT:
        actions.push({
          type: 'automatic_fix',
          description: 'Resolve address conflicts automatically',
          userDescription: 'Automatically assign different addresses',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔧 Resolving address conflicts...');
            return true; // Placeholder
          },
          estimatedDuration: 10
        });
        break;

      case ERROR_CODES.ADDR_VERIFICATION_FAILED:
        actions.push({
          type: 'retry',
          description: 'Retry address verification',
          userDescription: 'Try verifying the address again',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔄 Retrying address verification...');
            return true; // Placeholder
          },
          estimatedDuration: 5
        });
        break;
    }

    return actions;
  }

  private getHardwareTestRecoveryActions(error: WizardError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.code) {
      case ERROR_CODES.TEST_COMMUNICATION_FAILED:
        actions.push({
          type: 'retry',
          description: 'Retry communication test',
          userDescription: 'Try the communication test again',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔄 Retrying communication test...');
            return true; // Placeholder
          },
          estimatedDuration: 5
        });
        break;

      case ERROR_CODES.TEST_RELAY_NO_RESPONSE:
        actions.push({
          type: 'manual_intervention',
          description: 'Check relay connections',
          userDescription: 'Please check relay card connections and power',
          automatic: false,
          priority: 1,
          execute: async () => {
            console.log('📋 Please check relay card connections');
            return false; // Requires manual action
          },
          requiresUserConfirmation: true
        });
        break;
    }

    return actions;
  }

  private getSystemIntegrationRecoveryActions(error: WizardError): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (error.code) {
      case ERROR_CODES.SYS_CONFIG_UPDATE_FAILED:
        actions.push({
          type: 'rollback',
          description: 'Rollback configuration changes',
          userDescription: 'Restore previous configuration',
          automatic: true,
          priority: 1,
          execute: async () => {
            console.log('🔄 Rolling back configuration...');
            return true; // Placeholder
          },
          estimatedDuration: 5
        });
        break;

      case ERROR_CODES.SYS_SERVICE_RESTART_FAILED:
        actions.push({
          type: 'manual_intervention',
          description: 'Manually restart services',
          userDescription: 'Please restart the hardware services manually',
          automatic: false,
          priority: 1,
          execute: async () => {
            console.log('📋 Please restart services manually');
            return false; // Requires manual action
          },
          requiresUserConfirmation: true
        });
        break;
    }

    return actions;
  }

  private getGenericRecoveryAction(error: WizardError): RecoveryAction {
    return {
      type: 'retry',
      description: 'Retry the operation',
      userDescription: 'Try the operation again',
      automatic: true,
      priority: 10, // Low priority
      execute: async () => {
        console.log('🔄 Retrying operation...');
        return true; // Placeholder
      },
      estimatedDuration: 5
    };
  }

  // Troubleshooting step methods
  private getSerialPortTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    const baseSteps: TroubleshootingStep[] = [
      {
        id: 'sp_check_connection',
        title: 'Check USB Connection',
        description: 'Verify the USB-RS485 adapter is properly connected',
        action: 'Check that the USB cable is securely connected to both the adapter and computer',
        expectedResult: 'USB device should be visible in device manager',
        nextStepOnSuccess: 'sp_check_drivers',
        nextStepOnFailure: 'sp_try_different_port',
        isAutomated: false,
        estimatedTime: 30
      },
      {
        id: 'sp_check_drivers',
        title: 'Check Device Drivers',
        description: 'Ensure proper drivers are installed for the USB-RS485 adapter',
        action: 'Check Device Manager for any warning signs on the USB-RS485 adapter',
        expectedResult: 'Device should appear without warning icons',
        nextStepOnSuccess: 'sp_test_port',
        nextStepOnFailure: 'sp_install_drivers',
        isAutomated: false,
        estimatedTime: 60
      },
      {
        id: 'sp_test_port',
        title: 'Test Serial Port',
        description: 'Test if the serial port is accessible',
        action: 'Attempt to open and close the serial port',
        expectedResult: 'Port should open and close without errors',
        isAutomated: true,
        estimatedTime: 5
      }
    ];

    switch (error.code) {
      case ERROR_CODES.SP_PERMISSION_DENIED:
        return [
          {
            id: 'sp_check_permissions',
            title: 'Check Permissions',
            description: 'Verify user has permission to access serial ports',
            action: 'Run application as administrator or add user to dialout group',
            expectedResult: 'Application should have serial port access',
            isAutomated: false,
            estimatedTime: 120
          },
          ...baseSteps
        ];

      case ERROR_CODES.SP_DEVICE_BUSY:
        return [
          {
            id: 'sp_check_processes',
            title: 'Check Running Processes',
            description: 'Look for other applications using the serial port',
            action: 'Close any terminal programs, Arduino IDE, or other serial applications',
            expectedResult: 'No other applications should be using the port',
            isAutomated: false,
            estimatedTime: 60
          },
          ...baseSteps
        ];

      default:
        return baseSteps;
    }
  }

  private getCommunicationTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    return [
      {
        id: 'com_check_wiring',
        title: 'Check Wiring',
        description: 'Verify RS485 wiring is correct',
        action: 'Check A+, B-, and GND connections between adapter and relay card',
        expectedResult: 'Wiring should match the connection diagram',
        nextStepOnSuccess: 'com_check_power',
        nextStepOnFailure: 'com_fix_wiring',
        isAutomated: false,
        estimatedTime: 180
      },
      {
        id: 'com_check_power',
        title: 'Check Power Supply',
        description: 'Ensure relay card has proper power',
        action: 'Verify 12V power supply is connected and LED indicators are on',
        expectedResult: 'Power LED should be solid green',
        nextStepOnSuccess: 'com_test_basic',
        nextStepOnFailure: 'com_fix_power',
        isAutomated: false,
        estimatedTime: 60
      },
      {
        id: 'com_test_basic',
        title: 'Test Basic Communication',
        description: 'Send a simple Modbus command',
        action: 'Send a read register command to test communication',
        expectedResult: 'Device should respond with valid data',
        isAutomated: true,
        estimatedTime: 10
      }
    ];
  }

  private getAddressConfigTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    return [
      {
        id: 'addr_scan_existing',
        title: 'Scan Existing Addresses',
        description: 'Check what addresses are currently in use',
        action: 'Scan addresses 1-255 to identify existing devices',
        expectedResult: 'List of responding devices and their addresses',
        nextStepOnSuccess: 'addr_find_available',
        isAutomated: true,
        estimatedTime: 30
      },
      {
        id: 'addr_find_available',
        title: 'Find Available Address',
        description: 'Identify the next available address',
        action: 'Find the lowest unused address in the valid range',
        expectedResult: 'Available address identified',
        nextStepOnSuccess: 'addr_configure_broadcast',
        isAutomated: true,
        estimatedTime: 5
      },
      {
        id: 'addr_configure_broadcast',
        title: 'Configure via Broadcast',
        description: 'Set new address using broadcast command',
        action: 'Send broadcast command to set new slave address',
        expectedResult: 'Device should respond at new address',
        nextStepOnSuccess: 'addr_verify',
        isAutomated: true,
        estimatedTime: 10
      },
      {
        id: 'addr_verify',
        title: 'Verify New Address',
        description: 'Confirm device responds at new address',
        action: 'Read register 0x4000 to verify address was set',
        expectedResult: 'Register should contain the new address value',
        isAutomated: true,
        estimatedTime: 5
      }
    ];
  }

  private getHardwareTestTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    return [
      {
        id: 'test_communication',
        title: 'Test Communication',
        description: 'Verify basic Modbus communication',
        action: 'Send read register command to device',
        expectedResult: 'Device should respond with valid data',
        nextStepOnSuccess: 'test_relay_basic',
        nextStepOnFailure: 'test_check_connection',
        isAutomated: true,
        estimatedTime: 5
      },
      {
        id: 'test_relay_basic',
        title: 'Test Single Relay',
        description: 'Test activation of one relay',
        action: 'Activate relay 1 and listen for click sound',
        expectedResult: 'Should hear audible click from relay',
        nextStepOnSuccess: 'test_relay_multiple',
        nextStepOnFailure: 'test_check_power',
        isAutomated: false,
        estimatedTime: 10
      },
      {
        id: 'test_relay_multiple',
        title: 'Test Multiple Relays',
        description: 'Test several relays in sequence',
        action: 'Activate relays 1, 8, and 16 in sequence',
        expectedResult: 'Should hear clicks from all tested relays',
        isAutomated: false,
        estimatedTime: 30
      }
    ];
  }

  private getSystemIntegrationTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    return [
      {
        id: 'sys_backup_config',
        title: 'Backup Current Configuration',
        description: 'Create backup of current system configuration',
        action: 'Save current system.json and database state',
        expectedResult: 'Backup files created successfully',
        nextStepOnSuccess: 'sys_validate_config',
        isAutomated: true,
        estimatedTime: 10
      },
      {
        id: 'sys_validate_config',
        title: 'Validate Configuration',
        description: 'Check configuration file syntax and values',
        action: 'Parse and validate system.json structure',
        expectedResult: 'Configuration should be valid JSON with correct structure',
        nextStepOnSuccess: 'sys_update_config',
        nextStepOnFailure: 'sys_restore_backup',
        isAutomated: true,
        estimatedTime: 5
      },
      {
        id: 'sys_update_config',
        title: 'Update Configuration',
        description: 'Apply new hardware configuration',
        action: 'Update system.json with new relay card information',
        expectedResult: 'Configuration file updated successfully',
        nextStepOnSuccess: 'sys_restart_services',
        nextStepOnFailure: 'sys_restore_backup',
        isAutomated: true,
        estimatedTime: 5
      },
      {
        id: 'sys_restart_services',
        title: 'Restart Services',
        description: 'Restart hardware services to apply changes',
        action: 'Stop and start kiosk and gateway services',
        expectedResult: 'Services should restart without errors',
        nextStepOnSuccess: 'sys_verify_integration',
        isAutomated: true,
        estimatedTime: 30
      },
      {
        id: 'sys_verify_integration',
        title: 'Verify Integration',
        description: 'Test that new hardware is accessible',
        action: 'Test API calls to new locker ranges',
        expectedResult: 'New lockers should respond to API commands',
        isAutomated: true,
        estimatedTime: 15
      }
    ];
  }

  private getGenericTroubleshootingSteps(error: WizardError): TroubleshootingStep[] {
    return [
      {
        id: 'gen_check_logs',
        title: 'Check System Logs',
        description: 'Review system logs for additional error information',
        action: 'Check application logs for detailed error messages',
        expectedResult: 'Logs should provide more context about the error',
        nextStepOnSuccess: 'gen_retry_operation',
        isAutomated: false,
        estimatedTime: 120
      },
      {
        id: 'gen_retry_operation',
        title: 'Retry Operation',
        description: 'Attempt the failed operation again',
        action: 'Retry the operation that caused the error',
        expectedResult: 'Operation should complete successfully',
        isAutomated: true,
        estimatedTime: 30
      }
    ];
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();