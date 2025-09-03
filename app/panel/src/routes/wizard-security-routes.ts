import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { WizardSecurityService, WizardOperation, wizardSecurityService } from '../../../../shared/services/wizard-security-service';
import { wizardSecurityMonitor } from '../../../../shared/services/wizard-security-monitor';
import { createWizardSecurityMiddleware, createEmergencyStopMiddleware } from '../middleware/wizard-security-middleware';
import { SessionManager } from '../services/session-manager';

interface WizardSecurityRouteOptions extends FastifyPluginOptions {
  sessionManager: SessionManager;
}

export async function wizardSecurityRoutes(
  fastify: FastifyInstance,
  options: WizardSecurityRouteOptions
) {
  const { sessionManager } = options;

  // Security dashboard endpoint
  fastify.get(
    '/security/dashboard',
    {
      preHandler: createWizardSecurityMiddleware(
        wizardSecurityService,
        sessionManager,
        {
          operation: WizardOperation.SCAN_DEVICES, // Using as view operation
          requireAuth: true,
          auditLevel: 'basic'
        }
      )
    },
    async (request, reply) => {
      try {
        const dashboard = wizardSecurityMonitor.getSecurityDashboard();
        reply.send(dashboard);
      } catch (error) {
        fastify.log.error('Security dashboard error:', error);
        reply.code(500).send({ error: 'Failed to load security dashboard' });
      }
    }
  );

  // Get active security alerts
  fastify.get(
    '/security/alerts',
    {
      preHandler: createWizardSecurityMiddleware(
        wizardSecurityService,
        sessionManager,
        {
          operation: WizardOperation.SCAN_DEVICES, // Using as view operation
          requireAuth: true,
          auditLevel: 'basic'
        }
      ),
      schema: {
        querystring: {
          type: 'object',
          properties: {
            severity: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'critical'] 
            },
            limit: { 
              type: 'number', 
              minimum: 1, 
              maximum: 100 
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { severity, limit } = request.query as { 
          severity?: 'low' | 'medium' | 'high' | 'critical';
          limit?: number;
        };

        let alerts = wizardSecurityMonitor.getActiveAlerts(severity);
        
        if (limit) {
          alerts = alerts.slice(0, limit);
        }

        reply.send({ alerts });
      } catch (error) {
        fastify.log.error('Get alerts error:', error);
        reply.code(500).send({ error: 'Failed to retrieve alerts' });
      }
    }
  );

  // Resolve security alert
  fastify.post(
    '/security/alerts/:alertId/resolve',
    {
      preHandler: createWizardSecurityMiddleware(
        wizardSecurityService,
        sessionManager,
        {
          operation: WizardOperation.FINALIZE_WIZARD, // Using as admin operation
          requireAuth: true,
          requireCsrf: true,
          validateInput: true,
          auditLevel: 'detailed'
        }
      ),
      schema: {
        params: {
          type: 'object',
          required: ['alertId'],
          properties: {
            alertId: { type: 'string', minLength: 1 }
          }
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { alertId } = request.params as { alertId: string };
        const { reason } = request.body as { reason?: string };
        const context = (request as any).securityContext;

        const resolved = wizardSecurityMonitor.resolveAlert(alertId, context.username);
        
        if (!resolved) {
          return reply.code(404).send({ error: 'Alert not found or already resolved' });
        }

        // Log the resolution
        wizardSecurityService.logAuditEntry(
          context,
          WizardOperation.FINALIZE_WIZARD, // Using as admin operation
          'security_alert',
          true,
          { alertId, reason, action: 'resolve' },
          'medium'
        );

        reply.send({ success: true, message: 'Alert resolved successfully' });
      } catch (error) {
        fastify.log.error('Resolve alert error:', error);
        reply.code(500).send({ error: 'Failed to resolve alert' });
      }
    }
  );

  // Get audit logs
  fastify.get(
    '/security/audit-logs',
    {
      preHandler: createWizardSecurityMiddleware(
        wizardSecurityService,
        sessionManager,
        {
          operation: WizardOperation.SCAN_DEVICES, // Using as view operation
          requireAuth: true,
          auditLevel: 'basic'
        }
      ),
      schema: {
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'number' },
            operation: { type: 'string' },
            success: { type: 'boolean' },
            riskLevel: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'critical'] 
            },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            limit: { 
              type: 'number', 
              minimum: 1, 
              maximum: 1000,
              default: 100
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const context = (request as any).securityContext;
        const filters = request.query as any;

        // Convert date strings to Date objects
        if (filters.startDate) {
          filters.startDate = new Date(filters.startDate);
        }
        if (filters.endDate) {
          filters.endDate = new Date(filters.endDate);
        }

        const auditLogs = wizardSecurityService.getAuditLogs(context, filters);
        reply.send({ auditLogs });
      } catch (error) {
        fastify.log.error('Get audit logs error:', error);
        reply.code(500).send({ error: 'Failed to retrieve audit logs' });
      }
    }
  );

  // Export security report
  fastify.get(
    '/security/report',
    {
      preHandler: createWizardSecurityMiddleware(
        wizardSecurityService,
        sessionManager,
        {
          operation: WizardOperation.EXPORT_CONFIGURATION,
          requireAuth: true,
          auditLevel: 'detailed'
        }
      ),
      schema: {
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            format: { 
              type: 'string', 
              enum: ['json', 'csv'],
              default: 'json'
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { startDate, endDate, format } = request.query as {
          startDate?: string;
          endDate?: string;
          format?: 'json' | 'csv';
        };

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: 7 days ago
        const end = endDate ? new Date(endDate) : new Date(); // Default: now

        const report = wizardSecurityMonitor.exportSecurityReport(start, end);

        if (format === 'csv') {
          // Convert to CSV format
          const csvData = this.convertReportToCSV(report);
          reply
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', `attachment; filename="security-report-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}.csv"`)
            .send(csvData);
        } else {
          reply
            .header('Content-Type', 'application/json')
            .header('Content-Disposition', `attachment; filename="security-report-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}.json"`)
            .send(report);
        }
      } catch (error) {
        fastify.log.error('Export security report error:', error);
        reply.code(500).send({ error: 'Failed to export security report' });
      }
    }
  );

  // Emergency stop endpoint
  fastify.post(
    '/security/emergency-stop',
    {
      preHandler: createEmergencyStopMiddleware(wizardSecurityService, sessionManager),
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { 
              type: 'string', 
              minLength: 5, 
              maxLength: 500 
            }
          }
        }
      }
    }
  );

  // Get security metrics
  fastify.get(
    '/security/metrics',
    {
      preHandler: createWizardSecurityMiddleware(
        wizardSecurityService,
        sessionManager,
        {
          operation: WizardOperation.SCAN_DEVICES, // Using as view operation
          requireAuth: true,
          auditLevel: 'basic'
        }
      )
    },
    async (request, reply) => {
      try {
        const metrics = wizardSecurityMonitor.getSecurityMetrics();
        reply.send({ metrics });
      } catch (error) {
        fastify.log.error('Get security metrics error:', error);
        reply.code(500).send({ error: 'Failed to retrieve security metrics' });
      }
    }
  );

  // Test security endpoint (for development/testing)
  if (process.env.NODE_ENV === 'development') {
    fastify.post(
      '/security/test-alert',
      {
        preHandler: createWizardSecurityMiddleware(
          wizardSecurityService,
          sessionManager,
          {
            operation: WizardOperation.FINALIZE_WIZARD, // Using as admin operation
            requireAuth: true,
            requireCsrf: true,
            validateInput: true,
            auditLevel: 'comprehensive'
          }
        ),
        schema: {
          body: {
            type: 'object',
            required: ['type', 'severity', 'message'],
            properties: {
              type: { 
                type: 'string',
                enum: ['rate_limit', 'suspicious_activity', 'unauthorized_access', 'system_anomaly', 'emergency_stop']
              },
              severity: { 
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              },
              message: { type: 'string', minLength: 1, maxLength: 500 }
            }
          }
        }
      },
      async (request, reply) => {
        try {
          const { type, severity, message } = request.body as {
            type: 'rate_limit' | 'suspicious_activity' | 'unauthorized_access' | 'system_anomaly' | 'emergency_stop';
            severity: 'low' | 'medium' | 'high' | 'critical';
            message: string;
          };
          const context = (request as any).securityContext;

          const alert = wizardSecurityMonitor.createAlert(
            type,
            severity,
            `TEST ALERT: ${message}`,
            context,
            { testAlert: true, timestamp: new Date() }
          );

          reply.send({ 
            success: true, 
            alert: {
              id: alert.id,
              type: alert.type,
              severity: alert.severity,
              message: alert.message,
              timestamp: alert.timestamp
            }
          });
        } catch (error) {
          fastify.log.error('Test alert error:', error);
          reply.code(500).send({ error: 'Failed to create test alert' });
        }
      }
    );
  }

  // Helper method to convert report to CSV
  function convertReportToCSV(report: any): string {
    const headers = ['Timestamp', 'User', 'Operation', 'Resource', 'Success', 'Risk Level', 'IP Address', 'Details'];
    const rows = [headers.join(',')];

    for (const alert of report.alerts) {
      const row = [
        alert.timestamp.toISOString(),
        alert.context.username,
        'security_alert',
        alert.type,
        'true',
        alert.severity,
        alert.context.ipAddress,
        JSON.stringify(alert.details).replace(/"/g, '""')
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }
}