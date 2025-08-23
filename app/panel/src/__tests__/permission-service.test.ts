import { describe, it, expect } from 'vitest';
import { PermissionService, Permission } from '../services/permission-service';

describe('PermissionService', () => {
  describe('hasPermission', () => {
    it('should grant admin all permissions', () => {
      const adminPermissions = [
        Permission.VIEW_LOCKERS,
        Permission.OPEN_LOCKER,
        Permission.BULK_OPEN,
        Permission.BLOCK_LOCKER,
        Permission.MANAGE_VIP,
        Permission.MANAGE_MASTER_PIN,
        Permission.VIEW_EVENTS,
        Permission.EXPORT_REPORTS,
        Permission.SYSTEM_CONFIG,
        Permission.MANAGE_USERS
      ];

      adminPermissions.forEach(permission => {
        expect(PermissionService.hasPermission('admin', permission)).toBe(true);
      });
    });

    it('should grant staff limited permissions', () => {
      const staffPermissions = [
        Permission.VIEW_LOCKERS,
        Permission.OPEN_LOCKER,
        Permission.BULK_OPEN,
        Permission.BLOCK_LOCKER,
        Permission.VIEW_EVENTS,
        Permission.EXPORT_REPORTS
      ];

      const restrictedPermissions = [
        Permission.MANAGE_VIP,
        Permission.MANAGE_MASTER_PIN,
        Permission.SYSTEM_CONFIG,
        Permission.MANAGE_USERS
      ];

      staffPermissions.forEach(permission => {
        expect(PermissionService.hasPermission('staff', permission)).toBe(true);
      });

      restrictedPermissions.forEach(permission => {
        expect(PermissionService.hasPermission('staff', permission)).toBe(false);
      });
    });
  });

  describe('getPermissions', () => {
    it('should return all admin permissions', () => {
      const permissions = PermissionService.getPermissions('admin');
      expect(permissions).toContain(Permission.MANAGE_VIP);
      expect(permissions).toContain(Permission.SYSTEM_CONFIG);
      expect(permissions.length).toBeGreaterThan(8);
    });

    it('should return limited staff permissions', () => {
      const permissions = PermissionService.getPermissions('staff');
      expect(permissions).toContain(Permission.VIEW_LOCKERS);
      expect(permissions).toContain(Permission.OPEN_LOCKER);
      expect(permissions).not.toContain(Permission.MANAGE_VIP);
      expect(permissions).not.toContain(Permission.SYSTEM_CONFIG);
    });
  });

  describe('requirePermission', () => {
    it('should not throw for valid permission', () => {
      expect(() => {
        PermissionService.requirePermission('admin', Permission.MANAGE_VIP);
      }).not.toThrow();

      expect(() => {
        PermissionService.requirePermission('staff', Permission.VIEW_LOCKERS);
      }).not.toThrow();
    });

    it('should throw for invalid permission', () => {
      expect(() => {
        PermissionService.requirePermission('staff', Permission.MANAGE_VIP);
      }).toThrow('Access denied: manage_vip permission required');

      expect(() => {
        PermissionService.requirePermission('staff', Permission.SYSTEM_CONFIG);
      }).toThrow('Access denied: system_config permission required');
    });
  });

  describe('canAccessResource', () => {
    it('should allow admin access to all resources', () => {
      expect(PermissionService.canAccessResource('admin', 'lockers', 'view')).toBe(true);
      expect(PermissionService.canAccessResource('admin', 'vip', 'create')).toBe(true);
      expect(PermissionService.canAccessResource('admin', 'system', 'config')).toBe(true);
      expect(PermissionService.canAccessResource('admin', 'users', 'manage')).toBe(true);
    });

    it('should restrict staff access to certain resources', () => {
      expect(PermissionService.canAccessResource('staff', 'lockers', 'view')).toBe(true);
      expect(PermissionService.canAccessResource('staff', 'lockers', 'open')).toBe(true);
      expect(PermissionService.canAccessResource('staff', 'events', 'view')).toBe(true);
      
      expect(PermissionService.canAccessResource('staff', 'vip', 'create')).toBe(false);
      expect(PermissionService.canAccessResource('staff', 'system', 'config')).toBe(false);
      expect(PermissionService.canAccessResource('staff', 'users', 'manage')).toBe(false);
    });

    it('should return false for unknown resource/action combinations', () => {
      expect(PermissionService.canAccessResource('admin', 'unknown', 'action')).toBe(false);
      expect(PermissionService.canAccessResource('staff', 'lockers', 'unknown')).toBe(false);
    });
  });
});
