import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'fs/promises';
import { join, sep } from 'path';
import { ConfigManager } from '@eform/shared/services/config-manager';
import { LockerAssignmentMode } from '@eform/shared/types/system-config';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';

interface UpdateAssignmentBody {
  default_mode: LockerAssignmentMode;
  recent_holder_min_hours?: number;
  open_only_window_hours?: number;
}

interface UpdateAssignmentRequest extends FastifyRequest {
  Body: UpdateAssignmentBody;
}

export class AssignmentSettingsRoutes {
  private configManager: ConfigManager;

  constructor(options?: { configManager?: ConfigManager }) {
    this.configManager = options?.configManager ?? ConfigManager.getInstance();
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
      const htmlPath = this.resolveViewPath('assignment-settings.html');
      const html = await readFile(htmlPath, 'utf-8');
      reply.type('text/html');
      return html;
    } catch (error) {
      reply.log.error({ err: error }, 'Failed to load assignment settings page');
      reply.code(500);
      return { success: false, error: 'Failed to load assignment settings page' };
    }
  }

  private resolveViewPath(fileName: string): string {
    const isBundledOutput = __dirname.split(sep).includes('dist');
    const baseDir = isBundledOutput ? join(__dirname, 'views') : join(__dirname, '../views');
    return join(baseDir, fileName);
  }

  private async getAssignmentSettings(reply: FastifyReply) {
    try {
      await this.configManager.initialize();
      const config = this.configManager.getConfiguration();
      const assignment = config.services.kiosk.assignment ?? { default_mode: 'manual', per_kiosk: {} };

      return {
        success: true,
        default_mode: assignment.default_mode ?? 'manual',
        recent_holder_min_hours: typeof assignment.recent_holder_min_hours === 'number'
          ? assignment.recent_holder_min_hours
          : this.configManager.getRecentHolderMinHours(),
        open_only_window_hours: typeof assignment.open_only_window_hours === 'number'
          ? assignment.open_only_window_hours
          : this.configManager.getOpenOnlyWindowHours()
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
      const minHoursRaw = body.recent_holder_min_hours;
      const openOnlyRaw = body.open_only_window_hours;

      if (defaultMode !== 'manual' && defaultMode !== 'automatic') {
        reply.code(400);
        return { success: false, error: 'Invalid default mode. Use "manual" or "automatic".' };
      }

      const minHours = typeof minHoursRaw === 'number' ? minHoursRaw : 0;
      if (Number.isNaN(minHours) || minHours < 0 || minHours > 24) {
        reply.code(400);
        return { success: false, error: 'Minimum held hours must be between 0 and 24.' };
      }

      const openOnlyWindow = typeof openOnlyRaw === 'number' ? openOnlyRaw : 0;
      if (Number.isNaN(openOnlyWindow) || openOnlyWindow < 0 || openOnlyWindow > 24) {
        reply.code(400);
        return { success: false, error: 'Open-only window must be between 0 and 24 hours.' };
      }

      await this.configManager.initialize();

      const staffUser = (request as any).user?.username || 'panel-user';
      const currentAssignment = this.configManager.getConfiguration().services.kiosk.assignment;

      await this.configManager.setKioskAssignmentConfig(
        {
          default_mode: defaultMode,
          per_kiosk: currentAssignment?.per_kiosk ?? {},
          recent_holder_min_hours: minHours,
          open_only_window_hours: openOnlyWindow
        },
        staffUser,
        'Updated kiosk assignment settings via panel'
      );

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
