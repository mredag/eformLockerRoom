import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ConfigManager } from '@eform/shared/services/config-manager';
import { LockerStateManager } from '@eform/shared/services/locker-state-manager';
import { LockerAssignmentMode } from '@eform/shared/types/system-config';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';

interface UpdateAssignmentBody {
  default_mode: LockerAssignmentMode;
  kiosks?: Array<{ id: string; mode: LockerAssignmentMode }>;
}

interface UpdateAssignmentRequest extends FastifyRequest {
  Body: UpdateAssignmentBody;
}

export class AssignmentSettingsRoutes {
  private configManager: ConfigManager;
  private lockerStateManager: LockerStateManager;

  constructor(options?: { configManager?: ConfigManager; lockerStateManager?: LockerStateManager }) {
    this.configManager = options?.configManager ?? ConfigManager.getInstance();
    this.lockerStateManager = options?.lockerStateManager ?? new LockerStateManager();
  }

  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get(
      '/panel/assignment-settings',
      { preHandler: [requirePermission(Permission.SYSTEM_CONFIG)] },
      async (_request, reply: FastifyReply) => this.serveAssignmentSettingsPage(reply)
    );

    fastify.get(
      '/api/assignment-settings',
      { preHandler: [requirePermission(Permission.SYSTEM_CONFIG)] },
      async (_request, reply: FastifyReply) => this.getAssignmentSettings(reply)
    );

    fastify.post(
      '/api/assignment-settings',
      { preHandler: [requirePermission(Permission.SYSTEM_CONFIG), requireCsrfToken()] },
      async (request: UpdateAssignmentRequest, reply: FastifyReply) => this.updateAssignmentSettings(request, reply)
    );
  }

  private async serveAssignmentSettingsPage(reply: FastifyReply) {
    try {
      const htmlPath = join(__dirname, '../views/assignment-settings.html');
      const html = await readFile(htmlPath, 'utf-8');
      reply.type('text/html');
      return html;
    } catch (error) {
      reply.code(500);
      return { success: false, error: 'Failed to load assignment settings page' };
    }
  }

  private async getAssignmentSettings(reply: FastifyReply) {
    try {
      await this.configManager.initialize();
      const config = this.configManager.getConfiguration();
      const assignment = config.services.kiosk.assignment ?? { default_mode: 'manual', per_kiosk: {} };
      const kioskIds = await this.lockerStateManager.getKioskIds();

      const kiosks = kioskIds.map(id => ({
        id,
        mode: assignment.per_kiosk?.[id] ?? assignment.default_mode ?? 'manual'
      }));

      return {
        success: true,
        default_mode: assignment.default_mode ?? 'manual',
        kiosks
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load assignment settings'
      };
    }
  }

  private async updateAssignmentSettings(request: UpdateAssignmentRequest, reply: FastifyReply) {
    try {
      const body = request.body || {} as UpdateAssignmentBody;
      const defaultMode = body.default_mode;
      const kiosks = Array.isArray(body.kiosks) ? body.kiosks : [];

      if (defaultMode !== 'manual' && defaultMode !== 'automatic') {
        reply.code(400);
        return { success: false, error: 'Invalid default mode. Use "manual" or "automatic".' };
      }

      const invalidKiosk = kiosks.find(k => k.mode !== 'manual' && k.mode !== 'automatic');
      if (invalidKiosk) {
        reply.code(400);
        return { success: false, error: `Invalid mode for kiosk ${invalidKiosk.id}` };
      }

      await this.configManager.initialize();
      const currentConfig = this.configManager.getConfiguration();
      const currentAssignment = currentConfig.services.kiosk.assignment ?? { default_mode: 'manual', per_kiosk: {} };
      const perKiosk: Record<string, LockerAssignmentMode> = { ...(currentAssignment.per_kiosk ?? {}) };

      for (const kiosk of kiosks) {
        if (kiosk.mode === defaultMode) {
          delete perKiosk[kiosk.id];
        } else {
          perKiosk[kiosk.id] = kiosk.mode;
        }
      }

      const staffUser = (request as any).user?.username || 'panel-user';

      await this.configManager.updateConfiguration('services', {
        kiosk: {
          assignment: {
            default_mode: defaultMode,
            per_kiosk: perKiosk
          }
        }
      }, staffUser, 'Updated kiosk assignment settings via panel');

      return { success: true };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update assignment settings'
      };
    }
  }
}
