export enum Permission {
  VIEW_LOCKERS = 'view_lockers',
  OPEN_LOCKER = 'open_locker',
  BULK_OPEN = 'bulk_open',
  BLOCK_LOCKER = 'block_locker',
  MANAGE_LOCKERS = 'manage_lockers',
  MANAGE_VIP = 'manage_vip',
  MANAGE_MASTER_PIN = 'manage_master_pin',
  VIEW_EVENTS = 'view_events',
  EXPORT_REPORTS = 'export_reports',
  SYSTEM_CONFIG = 'system_config',
  MANAGE_USERS = 'manage_users'
}

export type UserRole = 'admin' | 'staff';

export class PermissionService {
  private static readonly ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    admin: [
      Permission.VIEW_LOCKERS,
      Permission.OPEN_LOCKER,
      Permission.BULK_OPEN,
      Permission.BLOCK_LOCKER,
      Permission.MANAGE_LOCKERS,
      Permission.MANAGE_VIP,
      Permission.MANAGE_MASTER_PIN,
      Permission.VIEW_EVENTS,
      Permission.EXPORT_REPORTS,
      Permission.SYSTEM_CONFIG,
      Permission.MANAGE_USERS
    ],
    staff: [
      Permission.VIEW_LOCKERS,
      Permission.OPEN_LOCKER,
      Permission.BULK_OPEN,
      Permission.BLOCK_LOCKER,
      Permission.VIEW_EVENTS,
      Permission.EXPORT_REPORTS
    ]
  };

  static hasPermission(userRole: UserRole, permission: Permission): boolean {
    const rolePermissions = this.ROLE_PERMISSIONS[userRole];
    return rolePermissions.includes(permission);
  }

  static getPermissions(userRole: UserRole): Permission[] {
    return [...this.ROLE_PERMISSIONS[userRole]];
  }

  static requirePermission(userRole: UserRole, permission: Permission): void {
    if (!this.hasPermission(userRole, permission)) {
      throw new Error(`Access denied: ${permission} permission required`);
    }
  }

  static canAccessResource(userRole: UserRole, resource: string, action: string): boolean {
    // Map resource/action combinations to permissions
    const resourcePermissionMap: Record<string, Permission> = {
      'lockers:view': Permission.VIEW_LOCKERS,
      'lockers:open': Permission.OPEN_LOCKER,
      'lockers:bulk_open': Permission.BULK_OPEN,
      'lockers:block': Permission.BLOCK_LOCKER,
      'vip:create': Permission.MANAGE_VIP,
      'vip:update': Permission.MANAGE_VIP,
      'vip:delete': Permission.MANAGE_VIP,
      'vip:view': Permission.MANAGE_VIP,
      'events:view': Permission.VIEW_EVENTS,
      'reports:export': Permission.EXPORT_REPORTS,
      'system:config': Permission.SYSTEM_CONFIG,
      'users:manage': Permission.MANAGE_USERS,
      'master_pin:manage': Permission.MANAGE_MASTER_PIN
    };

    const key = `${resource}:${action}`;
    const requiredPermission = resourcePermissionMap[key];
    
    if (!requiredPermission) {
      return false; // Unknown resource/action combination
    }

    return this.hasPermission(userRole, requiredPermission);
  }
}
