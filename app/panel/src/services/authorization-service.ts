import { PermissionService } from './permission-service';
import { SessionManager } from './session-manager';

export interface AuthorizationResult {
  allowed: boolean;
  role?: string;
  reason?: string;
  auditInfo?: {
    username: string;
    operation: string;
    timestamp: Date;
    reason?: string;
  };
}

export interface OperationContext {
  locker_id?: number;
  kiosk_id?: string;
  is_vip?: boolean;
  bulk_operation?: boolean;
  target_user?: string;
}

export class AuthorizationService {
  constructor(
    private permissionService: PermissionService,
    private sessionManager: SessionManager
  ) {}

  /**
   * Check if user has permission for a specific operation
   */
  async checkPermission(sessionId: string, operation: string): Promise<AuthorizationResult> {
    try {
      // Validate inputs
      if (!sessionId || !operation) {
        return {
          allowed: false,
          reason: 'Invalid session or operation'
        };
      }

      // Get session
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        return {
          allowed: false,
          reason: 'Invalid session'
        };
      }

      // Check if session is expired
      if (this.sessionManager.isSessionExpired(session)) {
        return {
          allowed: false,
          reason: 'Session expired'
        };
      }

      // Validate session integrity
      if (!this.sessionManager.validateSession(session)) {
        return {
          allowed: false,
          reason: 'Session validation failed'
        };
      }

      // Check permission
      const hasPermission = this.permissionService.hasPermission(session.role, operation);
      
      const auditInfo = {
        username: session.username,
        operation,
        timestamp: new Date(),
        reason: hasPermission ? undefined : 'Insufficient permissions'
      };

      if (hasPermission) {
        return {
          allowed: true,
          role: session.role,
          auditInfo
        };
      } else {
        return {
          allowed: false,
          role: session.role,
          reason: 'Insufficient permissions',
          auditInfo
        };
      }
    } catch (error) {
      return {
        allowed: false,
        reason: 'Authorization service error'
      };
    }
  }

  /**
   * Check permission with additional context
   */
  async checkPermissionWithContext(
    sessionId: string, 
    operation: string, 
    context: OperationContext
  ): Promise<AuthorizationResult> {
    const baseResult = await this.checkPermission(sessionId, operation);
    
    if (!baseResult.allowed) {
      return baseResult;
    }

    // Additional context-based checks
    if (context.is_vip && baseResult.role === 'staff') {
      // Staff cannot access VIP lockers for certain operations
      const vipRestrictedOps = ['open_locker', 'block_locker'];
      if (vipRestrictedOps.includes(operation)) {
        return {
          allowed: false,
          role: baseResult.role,
          reason: 'VIP locker access denied for staff role',
          auditInfo: {
            ...baseResult.auditInfo!,
            reason: 'VIP locker access denied'
          }
        };
      }
    }

    return baseResult;
  }

  /**
   * Check multiple permissions efficiently
   */
  async checkMultiplePermissions(
    sessionId: string, 
    operations: string[]
  ): Promise<AuthorizationResult[]> {
    return Promise.all(
      operations.map(operation => this.checkPermission(sessionId, operation))
    );
  }

  /**
   * Check if user can perform bulk operations
   */
  async checkBulkOperationPermission(
    sessionId: string, 
    operation: string, 
    targetCount: number
  ): Promise<AuthorizationResult> {
    const baseResult = await this.checkPermission(sessionId, operation);
    
    if (!baseResult.allowed) {
      return baseResult;
    }

    // Additional checks for bulk operations
    if (targetCount > 100 && baseResult.role === 'staff') {
      return {
        allowed: false,
        role: baseResult.role,
        reason: 'Bulk operation limit exceeded for staff role',
        auditInfo: {
          ...baseResult.auditInfo!,
          reason: 'Bulk operation limit exceeded'
        }
      };
    }

    return baseResult;
  }

  /**
   * Check if user can access specific kiosk/zone
   */
  async checkZoneAccess(
    sessionId: string, 
    kioskId: string
  ): Promise<AuthorizationResult> {
    const baseResult = await this.checkPermission(sessionId, 'view_lockers');
    
    if (!baseResult.allowed) {
      return baseResult;
    }

    // Zone-based access control could be implemented here
    // For now, all authenticated users can access all zones
    return baseResult;
  }

  /**
   * Validate administrative operation
   */
  async checkAdminOperation(
    sessionId: string, 
    operation: string
  ): Promise<AuthorizationResult> {
    const result = await this.checkPermission(sessionId, operation);
    
    if (!result.allowed) {
      return result;
    }

    // Ensure only admin role can perform admin operations
    const adminOnlyOps = [
      'manage_users',
      'system_config',
      'manage_master_pin',
      'view_audit_logs'
    ];

    if (adminOnlyOps.includes(operation) && result.role !== 'admin') {
      return {
        allowed: false,
        role: result.role,
        reason: 'Administrative privileges required',
        auditInfo: {
          ...result.auditInfo!,
          reason: 'Administrative privileges required'
        }
      };
    }

    return result;
  }

  /**
   * Check emergency override permissions
   */
  async checkEmergencyOverride(
    sessionId: string, 
    reason: string
  ): Promise<AuthorizationResult> {
    const result = await this.checkPermission(sessionId, 'emergency_override');
    
    if (!result.allowed) {
      return result;
    }

    // Log emergency override attempt
    if (result.auditInfo) {
      result.auditInfo.reason = `Emergency override: ${reason}`;
    }

    return result;
  }

  /**
   * Validate session and get user info
   */
  async validateSessionAndGetUser(sessionId: string): Promise<{
    valid: boolean;
    user?: {
      id: number;
      username: string;
      role: string;
    };
    reason?: string;
  }> {
    try {
      if (!sessionId) {
        return { valid: false, reason: 'No session ID provided' };
      }

      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        return { valid: false, reason: 'Session not found' };
      }

      if (this.sessionManager.isSessionExpired(session)) {
        return { valid: false, reason: 'Session expired' };
      }

      if (!this.sessionManager.validateSession(session)) {
        return { valid: false, reason: 'Session validation failed' };
      }

      return {
        valid: true,
        user: {
          id: session.user_id,
          username: session.username,
          role: session.role
        }
      };
    } catch (error) {
      return { valid: false, reason: 'Session validation error' };
    }
  }
}
