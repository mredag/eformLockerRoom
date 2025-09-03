import { Permission, PermissionService, UserRole } from '../../app/panel/src/services/permission-service';
import { SessionManager } from '../../app/panel/src/services/session-manager';
import crypto from 'crypto';

// Hardware wizard specific permissions
export enum WizardPermission {
  VIEW_HARDWARE = 'view_hardware',
  SCAN_DEVICES = 'scan_devices',
  CONFIGURE_ADDRESSES = 'configure_addresses',
  TEST_HARDWARE = 'test_hardware',
  MODIFY_CONFIGURATION = 'modify_configuration',
  ACCESS_ADVANCED_FEATURES = 'access_advanced_features',
  EMERGENCY_STOP = 'emergency_stop',
  VIEW_AUDIT_LOGS = 'view_audit_logs'
}

export enum WizardOperation {
  SCAN_PORTS = 'scan_ports',
  SCAN_DEVICES = 'scan_devices',
  DETECT_NEW_CARDS = 'detect_new_cards',
  SET_SLAVE_ADDRESS = 'set_slave_address',
  READ_SLAVE_ADDRESS = 'read_slave_address',
  TEST_CARD = 'test_card',
  TEST_RELAY = 'test_relay',
  VALIDATE_SETUP = 'validate_setup',
  CREATE_WIZARD_SESSION = 'create_wizard_session',
  UPDATE_WIZARD_SESSION = 'update_wizard_session',
  FINALIZE_WIZARD = 'finalize_wizard',
  MANUAL_CONFIGURATION = 'manual_configuration',
  BULK_CONFIGURATION = 'bulk_configuration',
  EXPORT_CONFIGURATION = 'export_configuration',
  IMPORT_CONFIGURATION = 'import_configuration'
}

export interface SecurityPolicy {
  requiresRole: UserRole;
  allowedOperations: WizardOperation[];
  auditLevel: 'basic' | 'detailed' | 'comprehensive';
  rateLimits: {
    [key in WizardOperation]?: {
      maxRequests: number;
      windowMs: number;
    };
  };
}

export interface WizardSecurityContext {
  userId: number;
  username: string;
  role: UserRole;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  csrfToken: string;
  permissions: WizardPermission[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: number;
  username: string;
  operation: WizardOperation;
  resource: string;
  success: boolean;
  details: any;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class WizardSecurityService {
  private static readonly ROLE_WIZARD_PERMISSIONS: Record<UserRole, WizardPermission[]> = {
    admin: [
      WizardPermission.VIEW_HARDWARE,
      WizardPermission.SCAN_DEVICES,
      WizardPermission.CONFIGURE_ADDRESSES,
      WizardPermission.TEST_HARDWARE,
      WizardPermission.MODIFY_CONFIGURATION,
      WizardPermission.ACCESS_ADVANCED_FEATURES,
      WizardPermission.EMERGENCY_STOP,
      WizardPermission.VIEW_AUDIT_LOGS
    ],
    staff: [
      WizardPermission.VIEW_HARDWARE,
      WizardPermission.SCAN_DEVICES,
      WizardPermission.TEST_HARDWARE
    ]
  };

  private static readonly OPERATION_PERMISSION_MAP: Record<WizardOperation, WizardPermission> = {
    [WizardOperation.SCAN_PORTS]: WizardPermission.SCAN_DEVICES,
    [WizardOperation.SCAN_DEVICES]: WizardPermission.SCAN_DEVICES,
    [WizardOperation.DETECT_NEW_CARDS]: WizardPermission.SCAN_DEVICES,
    [WizardOperation.SET_SLAVE_ADDRESS]: WizardPermission.CONFIGURE_ADDRESSES,
    [WizardOperation.READ_SLAVE_ADDRESS]: WizardPermission.CONFIGURE_ADDRESSES,
    [WizardOperation.TEST_CARD]: WizardPermission.TEST_HARDWARE,
    [WizardOperation.TEST_RELAY]: WizardPermission.TEST_HARDWARE,
    [WizardOperation.VALIDATE_SETUP]: WizardPermission.TEST_HARDWARE,
    [WizardOperation.CREATE_WIZARD_SESSION]: WizardPermission.VIEW_HARDWARE,
    [WizardOperation.UPDATE_WIZARD_SESSION]: WizardPermission.VIEW_HARDWARE,
    [WizardOperation.FINALIZE_WIZARD]: WizardPermission.MODIFY_CONFIGURATION,
    [WizardOperation.MANUAL_CONFIGURATION]: WizardPermission.ACCESS_ADVANCED_FEATURES,
    [WizardOperation.BULK_CONFIGURATION]: WizardPermission.ACCESS_ADVANCED_FEATURES,
    [WizardOperation.EXPORT_CONFIGURATION]: WizardPermission.ACCESS_ADVANCED_FEATURES,
    [WizardOperation.IMPORT_CONFIGURATION]: WizardPermission.ACCESS_ADVANCED_FEATURES
  };

  private static readonly DEFAULT_RATE_LIMITS: Record<WizardOperation, { maxRequests: number; windowMs: number }> = {
    [WizardOperation.SCAN_PORTS]: { maxRequests: 10, windowMs: 60000 }, // 10 per minute
    [WizardOperation.SCAN_DEVICES]: { maxRequests: 5, windowMs: 60000 }, // 5 per minute
    [WizardOperation.DETECT_NEW_CARDS]: { maxRequests: 10, windowMs: 60000 },
    [WizardOperation.SET_SLAVE_ADDRESS]: { maxRequests: 20, windowMs: 60000 },
    [WizardOperation.READ_SLAVE_ADDRESS]: { maxRequests: 50, windowMs: 60000 },
    [WizardOperation.TEST_CARD]: { maxRequests: 30, windowMs: 60000 },
    [WizardOperation.TEST_RELAY]: { maxRequests: 100, windowMs: 60000 },
    [WizardOperation.VALIDATE_SETUP]: { maxRequests: 10, windowMs: 60000 },
    [WizardOperation.CREATE_WIZARD_SESSION]: { maxRequests: 20, windowMs: 60000 },
    [WizardOperation.UPDATE_WIZARD_SESSION]: { maxRequests: 100, windowMs: 60000 },
    [WizardOperation.FINALIZE_WIZARD]: { maxRequests: 5, windowMs: 60000 },
    [WizardOperation.MANUAL_CONFIGURATION]: { maxRequests: 10, windowMs: 60000 },
    [WizardOperation.BULK_CONFIGURATION]: { maxRequests: 3, windowMs: 60000 },
    [WizardOperation.EXPORT_CONFIGURATION]: { maxRequests: 10, windowMs: 60000 },
    [WizardOperation.IMPORT_CONFIGURATION]: { maxRequests: 5, windowMs: 60000 }
  };

  private static instance: WizardSecurityService | null = null;
  
  private auditLog: AuditLogEntry[] = [];
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of WizardSecurityService
   */
  public static getInstance(): WizardSecurityService {
    if (!WizardSecurityService.instance) {
      WizardSecurityService.instance = new WizardSecurityService();
    }
    return WizardSecurityService.instance;
  }

  /**
   * Create security context from request
   */
  createSecurityContext(
    userId: number,
    username: string,
    role: UserRole,
    sessionId: string,
    ipAddress: string,
    userAgent: string,
    csrfToken: string
  ): WizardSecurityContext {
    return {
      userId,
      username,
      role,
      sessionId,
      ipAddress,
      userAgent,
      csrfToken,
      permissions: this.getWizardPermissions(role)
    };
  }

  /**
   * Get wizard permissions for a role
   */
  getWizardPermissions(role: UserRole): WizardPermission[] {
    return [...WizardSecurityService.ROLE_WIZARD_PERMISSIONS[role]];
  }

  /**
   * Check if user has specific wizard permission
   */
  hasWizardPermission(context: WizardSecurityContext, permission: WizardPermission): boolean {
    return context.permissions.includes(permission);
  }

  /**
   * Check if user can perform specific operation
   */
  canPerformOperation(context: WizardSecurityContext, operation: WizardOperation): boolean {
    const requiredPermission = WizardSecurityService.OPERATION_PERMISSION_MAP[operation];
    if (!requiredPermission) {
      return false;
    }
    return this.hasWizardPermission(context, requiredPermission);
  }

  /**
   * Validate CSRF token
   */
  validateCsrfToken(sessionManager: SessionManager, sessionId: string, csrfToken: string): boolean {
    return sessionManager.validateCsrfToken(sessionId, csrfToken);
  }

  /**
   * Check rate limits for operation
   */
  checkRateLimit(context: WizardSecurityContext, operation: WizardOperation): boolean {
    const limits = WizardSecurityService.DEFAULT_RATE_LIMITS[operation];
    if (!limits) {
      return true; // No rate limit defined
    }

    const key = `${context.userId}:${operation}`;
    const now = Date.now();
    const entry = this.rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      this.rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limits.windowMs
      });
      return true;
    }

    if (entry.count >= limits.maxRequests) {
      return false; // Rate limit exceeded
    }

    entry.count++;
    return true;
  }

  /**
   * Log audit entry
   */
  logAuditEntry(
    context: WizardSecurityContext,
    operation: WizardOperation,
    resource: string,
    success: boolean,
    details: any = {},
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): void {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      userId: context.userId,
      username: context.username,
      operation,
      resource,
      success,
      details,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      sessionId: context.sessionId,
      riskLevel
    };

    this.auditLog.push(entry);

    // Keep only last 10000 entries in memory
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    // Log to console for immediate visibility
    console.log(`🔒 WIZARD AUDIT: ${context.username} ${success ? 'SUCCESS' : 'FAILED'} ${operation} on ${resource} [${riskLevel.toUpperCase()}]`);
  }

  /**
   * Get audit logs with filtering
   */
  getAuditLogs(
    context: WizardSecurityContext,
    filters: {
      userId?: number;
      operation?: WizardOperation;
      success?: boolean;
      riskLevel?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): AuditLogEntry[] {
    // Check permission to view audit logs
    if (!this.hasWizardPermission(context, WizardPermission.VIEW_AUDIT_LOGS)) {
      throw new Error('Insufficient permissions to view audit logs');
    }

    let filtered = [...this.auditLog];

    // Apply filters
    if (filters.userId !== undefined) {
      filtered = filtered.filter(entry => entry.userId === filters.userId);
    }
    if (filters.operation) {
      filtered = filtered.filter(entry => entry.operation === filters.operation);
    }
    if (filters.success !== undefined) {
      filtered = filtered.filter(entry => entry.success === filters.success);
    }
    if (filters.riskLevel) {
      filtered = filtered.filter(entry => entry.riskLevel === filters.riskLevel);
    }
    if (filters.startDate) {
      filtered = filtered.filter(entry => entry.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      filtered = filtered.filter(entry => entry.timestamp <= filters.endDate!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (filters.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Detect suspicious activity
   */
  detectSuspiciousActivity(context: WizardSecurityContext): {
    suspicious: boolean;
    reasons: string[];
    riskScore: number;
  } {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for rapid successive operations
    const recentEntries = this.auditLog.filter(
      entry => entry.userId === context.userId &&
      entry.timestamp > new Date(Date.now() - 60000) // Last minute
    );

    if (recentEntries.length > 20) {
      reasons.push('High frequency of operations');
      riskScore += 30;
    }

    // Check for failed operations
    const recentFailures = recentEntries.filter(entry => !entry.success);
    if (recentFailures.length > 5) {
      reasons.push('Multiple failed operations');
      riskScore += 40;
    }

    // Check for sensitive operations
    const sensitiveOps = recentEntries.filter(entry => 
      [WizardOperation.FINALIZE_WIZARD, WizardOperation.BULK_CONFIGURATION].includes(entry.operation)
    );
    if (sensitiveOps.length > 3) {
      reasons.push('Multiple sensitive operations');
      riskScore += 25;
    }

    // Check for IP address changes
    const uniqueIPs = new Set(recentEntries.map(entry => entry.ipAddress));
    if (uniqueIPs.size > 2) {
      reasons.push('Multiple IP addresses');
      riskScore += 35;
    }

    return {
      suspicious: riskScore > 50,
      reasons,
      riskScore
    };
  }

  /**
   * Emergency stop all wizard operations
   */
  emergencyStop(context: WizardSecurityContext, reason: string): void {
    if (!this.hasWizardPermission(context, WizardPermission.EMERGENCY_STOP)) {
      throw new Error('Insufficient permissions for emergency stop');
    }

    this.logAuditEntry(
      context,
      WizardOperation.FINALIZE_WIZARD, // Using as emergency operation
      'system',
      true,
      { emergencyStop: true, reason },
      'critical'
    );

    // In a real implementation, this would stop all active wizard sessions
    console.log(`🚨 EMERGENCY STOP initiated by ${context.username}: ${reason}`);
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}

export const wizardSecurityService = new WizardSecurityService();