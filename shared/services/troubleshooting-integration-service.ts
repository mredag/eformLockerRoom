/**
 * Hardware Configuration Wizard - Troubleshooting Integration Service
 * 
 * Integrates error handling, recovery actions, and troubleshooting wizard
 * to provide a comprehensive error resolution system.
 * 
 * Based on requirements 7.1-7.7 from the Hardware Configuration Wizard spec.
 */

import { 
  ErrorHandler, 
  WizardError, 
  TroubleshootingStep,
  errorHandler 
} from './error-handler';
import { 
  RecoveryActionSystem,
  RecoveryContext,
  RecoveryResult,
  ManualInterventionGuide,
  recoveryActionSystem
} from './recovery-action-system';

export interface TroubleshootingSession {
  sessionId: string;
  error: WizardError;
  context: RecoveryContext;
  troubleshootingSteps: TroubleshootingStep[];
  manualGuide: ManualInterventionGuide;
  recoveryAttempts: RecoveryResult[];
  currentStepIndex: number;
  status: 'active' | 'resolved' | 'escalated' | 'abandoned';
  startTime: Date;
  endTime?: Date;
  resolution?: string;
  escalationReason?: string;
}

export interface TroubleshootingMetrics {
  totalSessions: number;
  resolvedSessions: number;
  escalatedSessions: number;
  averageResolutionTime: number;
  mostCommonErrors: string[];
  mostEffectiveRecoveryActions: string[];
  userSatisfactionScore?: number;
}

export interface EscalationData {
  error: WizardError;
  context: RecoveryContext;
  troubleshootingHistory: TroubleshootingSession;
  systemInfo: SystemInfo;
  userFeedback?: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SystemInfo {
  operatingSystem: string;
  nodeVersion: string;
  applicationVersion: string;
  hardwareInfo: {
    serialPorts: string[];
    usbDevices: string[];
    systemResources: {
      cpuUsage: number;
      memoryUsage: number;
      diskSpace: number;
    };
  };
  configurationSnapshot: any;
  recentLogs: string[];
}

/**
 * Main integration service for troubleshooting functionality
 */
export class TroubleshootingIntegrationService {
  private activeSessions: Map<string, TroubleshootingSession> = new Map();
  private sessionHistory: TroubleshootingSession[] = [];
  private maxHistorySize = 1000;

  constructor(
    private errorHandler: ErrorHandler = errorHandler,
    private recoverySystem: RecoveryActionSystem = recoveryActionSystem
  ) {}

  /**
   * Start a new troubleshooting session for an error
   */
  async startTroubleshootingSession(
    error: Error | WizardError,
    context: RecoveryContext = {}
  ): Promise<TroubleshootingSession> {
    // Classify error if it's a raw Error object
    const wizardError = error instanceof Error 
      ? this.errorHandler.classifyError(error, context)
      : error as WizardError;

    // Generate session ID
    const sessionId = this.generateSessionId(wizardError, context);

    // Generate troubleshooting steps
    const troubleshootingSteps = this.errorHandler.generateTroubleshootingSteps(wizardError);

    // Generate manual intervention guide
    const manualGuide = this.recoverySystem.generateManualInterventionGuide(wizardError, context);

    // Create session
    const session: TroubleshootingSession = {
      sessionId,
      error: wizardError,
      context,
      troubleshootingSteps,
      manualGuide,
      recoveryAttempts: [],
      currentStepIndex: 0,
      status: 'active',
      startTime: new Date()
    };

    // Store active session
    this.activeSessions.set(sessionId, session);

    console.log(`🔧 Started troubleshooting session: ${sessionId} for error: ${wizardError.code}`);

    return session;
  }

  /**
   * Execute a recovery action within a troubleshooting session
   */
  async executeRecoveryAction(
    sessionId: string,
    actionIndex: number = 0
  ): Promise<RecoveryResult> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Troubleshooting session not found: ${sessionId}`);
    }

    // Get suggested recovery actions
    const actions = await this.recoverySystem.suggestRecoveryAction(session.error, session.context);
    
    if (actionIndex >= actions.length) {
      throw new Error(`Recovery action index out of range: ${actionIndex}`);
    }

    const action = actions[actionIndex];

    // Execute recovery action
    const result = await this.recoverySystem.executeRecoveryAction(action, session.error, session.context);

    // Record recovery attempt
    session.recoveryAttempts.push(result);

    // Update session status based on result
    if (result.success) {
      console.log(`✅ Recovery action succeeded in session: ${sessionId}`);
      
      // Check if this resolves the issue
      if (await this.verifyResolution(session)) {
        session.status = 'resolved';
        session.endTime = new Date();
        session.resolution = `Resolved by recovery action: ${action.description}`;
        this.moveSessionToHistory(session);
      }
    } else {
      console.log(`❌ Recovery action failed in session: ${sessionId}`);
      
      // Check if we should escalate
      if (result.userInterventionRequired || session.recoveryAttempts.length >= 3) {
        console.log(`🚨 Session ${sessionId} requires escalation`);
      }
    }

    return result;
  }

  /**
   * Update troubleshooting step progress
   */
  updateStepProgress(
    sessionId: string,
    stepIndex: number,
    success: boolean,
    notes?: string
  ): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return false;
    }

    if (stepIndex < 0 || stepIndex >= session.troubleshootingSteps.length) {
      console.error(`Invalid step index: ${stepIndex}`);
      return false;
    }

    // Update current step index
    session.currentStepIndex = stepIndex;

    // If step was successful, check if we can proceed or if issue is resolved
    if (success) {
      const currentStep = session.troubleshootingSteps[stepIndex];
      
      // Check if this was the last step
      if (stepIndex === session.troubleshootingSteps.length - 1) {
        session.status = 'resolved';
        session.endTime = new Date();
        session.resolution = `Resolved through troubleshooting steps`;
        this.moveSessionToHistory(session);
        return true;
      }

      // Move to next step if available
      if (currentStep.nextStepOnSuccess) {
        const nextStepIndex = session.troubleshootingSteps.findIndex(
          s => s.id === currentStep.nextStepOnSuccess
        );
        if (nextStepIndex !== -1) {
          session.currentStepIndex = nextStepIndex;
        }
      } else if (stepIndex < session.troubleshootingSteps.length - 1) {
        session.currentStepIndex = stepIndex + 1;
      }
    } else {
      // Step failed, check for failure path
      const currentStep = session.troubleshootingSteps[stepIndex];
      if (currentStep.nextStepOnFailure) {
        const nextStepIndex = session.troubleshootingSteps.findIndex(
          s => s.id === currentStep.nextStepOnFailure
        );
        if (nextStepIndex !== -1) {
          session.currentStepIndex = nextStepIndex;
        }
      }
    }

    console.log(`📝 Updated step progress for session ${sessionId}: step ${stepIndex} ${success ? 'succeeded' : 'failed'}`);
    return true;
  }

  /**
   * Escalate a troubleshooting session to support
   */
  async escalateSession(
    sessionId: string,
    reason: string,
    userFeedback?: string
  ): Promise<EscalationData> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Troubleshooting session not found: ${sessionId}`);
    }

    // Update session status
    session.status = 'escalated';
    session.endTime = new Date();
    session.escalationReason = reason;

    // Gather system information
    const systemInfo = await this.gatherSystemInfo();

    // Determine urgency level
    const urgencyLevel = this.determineUrgencyLevel(session.error, session.context);

    // Create escalation data
    const escalationData: EscalationData = {
      error: session.error,
      context: session.context,
      troubleshootingHistory: session,
      systemInfo,
      userFeedback,
      urgencyLevel
    };

    // Move session to history
    this.moveSessionToHistory(session);

    console.log(`🚨 Escalated session ${sessionId} to support with urgency: ${urgencyLevel}`);

    return escalationData;
  }

  /**
   * Get active troubleshooting session
   */
  getSession(sessionId: string): TroubleshootingSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): TroubleshootingSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get troubleshooting metrics and analytics
   */
  getTroubleshootingMetrics(): TroubleshootingMetrics {
    const allSessions = [...this.sessionHistory, ...this.activeSessions.values()];
    
    const resolvedSessions = allSessions.filter(s => s.status === 'resolved');
    const escalatedSessions = allSessions.filter(s => s.status === 'escalated');
    
    // Calculate average resolution time
    const resolvedWithTime = resolvedSessions.filter(s => s.endTime);
    const totalResolutionTime = resolvedWithTime.reduce((sum, session) => {
      return sum + (session.endTime!.getTime() - session.startTime.getTime());
    }, 0);
    const averageResolutionTime = resolvedWithTime.length > 0 
      ? totalResolutionTime / resolvedWithTime.length 
      : 0;

    // Find most common errors
    const errorCounts = allSessions.reduce((counts, session) => {
      counts[session.error.code] = (counts[session.error.code] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    const mostCommonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([code]) => code);

    // Find most effective recovery actions
    const actionCounts = allSessions.reduce((counts, session) => {
      session.recoveryAttempts.forEach(attempt => {
        if (attempt.success) {
          const actionType = attempt.action.type;
          counts[actionType] = (counts[actionType] || 0) + 1;
        }
      });
      return counts;
    }, {} as Record<string, number>);

    const mostEffectiveRecoveryActions = Object.entries(actionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type]) => type);

    return {
      totalSessions: allSessions.length,
      resolvedSessions: resolvedSessions.length,
      escalatedSessions: escalatedSessions.length,
      averageResolutionTime,
      mostCommonErrors,
      mostEffectiveRecoveryActions
    };
  }

  /**
   * Clean up old sessions and maintain history size
   */
  cleanup(): void {
    // Remove old active sessions (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.startTime < oneHourAgo) {
        session.status = 'abandoned';
        session.endTime = new Date();
        this.moveSessionToHistory(session);
      }
    }

    // Maintain history size limit
    if (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory = this.sessionHistory
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .slice(0, this.maxHistorySize);
    }

    console.log(`🧹 Cleaned up troubleshooting sessions. Active: ${this.activeSessions.size}, History: ${this.sessionHistory.length}`);
  }

  // Private helper methods
  private generateSessionId(error: WizardError, context: RecoveryContext): string {
    const timestamp = Date.now();
    const errorPart = error.code.slice(-3);
    const contextPart = context.sessionId ? context.sessionId.slice(-4) : 'none';
    return `troubleshoot_${errorPart}_${contextPart}_${timestamp}`;
  }

  private async verifyResolution(session: TroubleshootingSession): Promise<boolean> {
    // This would implement actual verification logic
    // For now, we'll use a simple heuristic based on recovery attempts
    const successfulAttempts = session.recoveryAttempts.filter(a => a.success);
    return successfulAttempts.length > 0;
  }

  private moveSessionToHistory(session: TroubleshootingSession): void {
    this.activeSessions.delete(session.sessionId);
    this.sessionHistory.unshift(session);
    
    // Maintain history size
    if (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory = this.sessionHistory.slice(0, this.maxHistorySize);
    }
  }

  private async gatherSystemInfo(): Promise<SystemInfo> {
    // This would gather actual system information
    // For now, return mock data
    return {
      operatingSystem: process.platform,
      nodeVersion: process.version,
      applicationVersion: '1.0.0',
      hardwareInfo: {
        serialPorts: ['/dev/ttyUSB0'],
        usbDevices: ['USB-RS485 Adapter'],
        systemResources: {
          cpuUsage: 25,
          memoryUsage: 512,
          diskSpace: 1024
        }
      },
      configurationSnapshot: {},
      recentLogs: ['Recent log entries would be here']
    };
  }

  private determineUrgencyLevel(error: WizardError, context: RecoveryContext): 'low' | 'medium' | 'high' | 'critical' {
    // Determine urgency based on error severity and context
    if (error.severity === 'critical') {
      return 'critical';
    }
    
    if (error.severity === 'error') {
      return 'high';
    }
    
    if (error.severity === 'warning') {
      return 'medium';
    }
    
    return 'low';
  }
}

// Export singleton instance
export const troubleshootingIntegrationService = new TroubleshootingIntegrationService();