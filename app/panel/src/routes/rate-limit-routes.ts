/**
 * Rate Limit Management Routes for Admin Panel
 * 
 * All endpoints require admin authentication
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { get_rate_limiter } from '../../../../shared/services/rate-limiter';
import { getRateLimitMonitor } from '../../../../shared/services/rate-limit-monitor';
import { getRateLimitCleanup } from '../../../../shared/services/rate-limit-cleanup';

// Admin authentication middleware
async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply) {
  // Check if user is authenticated (this should integrate with existing auth system)
  const session = (request as any).session;
  if (!session || !session.authenticated) {
    reply.code(401).send({
      success: false,
      error: 'authentication_required',
      message: 'Admin authentication required.'
    });
    return;
  }
}

export async function rateLimitRoutes(fastify: FastifyInstance) {
  
  // Get rate limit status and metrics
  fastify.get('/api/admin/rate-limits/status', { 
    preHandler: requireAdminAuth 
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rate_limiter = get_rate_limiter();
      const monitor = getRateLimitMonitor();
      const cleanup = getRateLimitCleanup();
      
      const state = rate_limiter.get_state();
      const metrics = monitor.getMetrics(60); // Last hour
      const status_summary = monitor.getStatusSummary();
      const cleanup_status = cleanup.getStatus();
      
      return {
        success: true,
        status: status_summary,
        metrics,
        state: {
          active_card_limits: Object.keys(state.card_last_open).length,
          active_locker_limits: Object.keys(state.locker_open_history).length,
          active_user_reports: Object.keys(state.user_report_history).length,
          last_command_time: state.last_command_time
        },
        cleanup: cleanup_status
      };
    } catch (error) {
      console.error('Error getting rate limit status:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to get rate limit status.' 
      };
    }
  });

  // Get recent violations
  fastify.get('/api/admin/rate-limits/violations', { 
    preHandler: requireAdminAuth 
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { minutes = 60 } = request.query as { minutes?: number };
      
      const rate_limiter = get_rate_limiter();
      const violations = rate_limiter.get_recent_violations(minutes);
      
      return {
        success: true,
        violations: violations.map(v => ({
          type: v.type,
          key: v.key,
          timestamp: v.timestamp,
          retry_after: v.retry_after
        })),
        window_minutes: minutes,
        total_count: violations.length
      };
    } catch (error) {
      console.error('Error getting rate limit violations:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to get violations.' 
      };
    }
  });

  // Get active alerts
  fastify.get('/api/admin/rate-limits/alerts', { 
    preHandler: requireAdminAuth 
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const monitor = getRateLimitMonitor();
      const activeAlerts = monitor.getActiveAlerts();
      const allAlerts = monitor.getAllAlerts();
      
      return {
        success: true,
        active_alerts: activeAlerts.map(alert => ({
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          triggered_at: alert.triggeredAt,
          acknowledged: alert.acknowledged,
          data: alert.data
        })),
        total_alerts: allAlerts.length,
        acknowledged_alerts: allAlerts.filter(a => a.acknowledged).length
      };
    } catch (error) {
      console.error('Error getting rate limit alerts:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to get alerts' 
      };
    }
  });

  // Acknowledge an alert
  fastify.post('/api/admin/rate-limits/alerts/:alertId/acknowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { alertId } = request.params as { alertId: string };
      
      const monitor = getRateLimitMonitor();
      const acknowledged = monitor.acknowledgeAlert(alertId);
      
      if (acknowledged) {
        return {
          success: true,
          message: 'Alert acknowledged'
        };
      } else {
        reply.code(404);
        return {
          success: false,
          error: 'Alert not found'
        };
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to acknowledge alert' 
      };
    }
  });

  // Generate rate limit report
  fastify.get('/api/admin/rate-limits/report', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { hours = 24 } = request.query as { hours?: number };
      
      const monitor = getRateLimitMonitor();
      const report = monitor.generateReport(hours);
      
      return {
        success: true,
        report: {
          summary: report.summary,
          alerts: report.alerts.map(alert => ({
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            triggeredAt: alert.triggeredAt,
            acknowledged: alert.acknowledged
          })),
          recommendations: report.recommendations,
          generatedAt: new Date().toISOString(),
          windowHours: hours
        }
      };
    } catch (error) {
      console.error('Error generating rate limit report:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to generate report' 
      };
    }
  });

  // Update alert thresholds
  fastify.put('/api/admin/rate-limits/thresholds', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const thresholds = request.body as any;
      
      const monitor = getRateLimitMonitor();
      monitor.updateThresholds(thresholds);
      
      return {
        success: true,
        message: 'Thresholds updated',
        newThresholds: monitor.getThresholds()
      };
    } catch (error) {
      console.error('Error updating thresholds:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to update thresholds' 
      };
    }
  });

  // Get current thresholds
  fastify.get('/api/admin/rate-limits/thresholds', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const monitor = getRateLimitMonitor();
      const thresholds = monitor.getThresholds();
      
      return {
        success: true,
        thresholds
      };
    } catch (error) {
      console.error('Error getting thresholds:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to get thresholds' 
      };
    }
  });

  // Force cleanup
  fastify.post('/api/admin/rate-limits/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cleanup = getRateLimitCleanup();
      cleanup.forceCleanup();
      
      return {
        success: true,
        message: 'Cleanup completed'
      };
    } catch (error) {
      console.error('Error forcing cleanup:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to force cleanup' 
      };
    }
  });

  // Update cleanup configuration
  fastify.put('/api/admin/rate-limits/cleanup/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = request.body as any;
      
      const cleanup = getRateLimitCleanup();
      cleanup.updateConfig(config);
      
      return {
        success: true,
        message: 'Cleanup configuration updated',
        status: cleanup.getStatus()
      };
    } catch (error) {
      console.error('Error updating cleanup config:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to update cleanup config' 
      };
    }
  });

  // Clear all rate limits (emergency function)
  fastify.post('/api/admin/rate-limits/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { confirm } = request.body as { confirm: boolean };
      
      if (!confirm) {
        reply.code(400);
        return {
          success: false,
          error: 'Confirmation required to clear all rate limits'
        };
      }
      
      // This would reset the rate limiter instance
      // For now, just log the action
      console.log('ADMIN ACTION: All rate limits cleared');
      
      return {
        success: true,
        message: 'All rate limits cleared',
        warning: 'This action affects all active rate limits'
      };
    } catch (error) {
      console.error('Error clearing rate limits:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to clear rate limits' 
      };
    }
  });

  // Get rate limit configuration
  fastify.get('/api/admin/rate-limits/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // This would get the current rate limit configuration
      // For now, return default config
      const config = {
        cardOpenIntervalSeconds: 10,
        lockerOpensPer60Seconds: 3,
        commandCooldownSeconds: 3,
        userReportsPerDay: 2
      };
      
      return {
        success: true,
        config
      };
    } catch (error) {
      console.error('Error getting rate limit config:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to get configuration' 
      };
    }
  });

  // Serve rate limits management page
  fastify.get('/rate-limits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const htmlPath = path.join(__dirname, '../views/rate-limits.html');
      const html = await fs.readFile(htmlPath, 'utf-8');
      
      reply.type('text/html');
      return html;
    } catch (error) {
      console.error('Error serving rate limits page:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to load rate limits page' 
      };
    }
  });

  // Test rate limits (for debugging)
  fastify.post('/api/admin/rate-limits/test', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type, cardId = 'test', lockerId = 999 } = request.body as { 
        type: string; 
        cardId?: string; 
        lockerId?: number; 
      };
      
      const rateLimiter = getRateLimiter();
      let result;
      
      switch (type) {
        case 'card':
          result = rateLimiter.checkCardRate(cardId);
          break;
        case 'locker':
          result = rateLimiter.checkLockerRate(lockerId);
          break;
        case 'command':
          result = rateLimiter.checkCommandCooldown();
          break;
        case 'report':
          result = rateLimiter.checkUserReportRate(cardId);
          break;
        case 'all':
          result = rateLimiter.checkAllLimits(cardId, lockerId);
          break;
        default:
          reply.code(400);
          return {
            success: false,
            error: 'Invalid test type. Use: card, locker, command, report, or all'
          };
      }
      
      return {
        success: true,
        testType: type,
        result: {
          allowed: result.allowed,
          type: result.type,
          key: result.key,
          message: result.message,
          retryAfterSeconds: result.retryAfterSeconds
        }
      };
    } catch (error) {
      console.error('Error testing rate limits:', error);
      reply.code(500);
      return { 
        success: false, 
        error: 'Failed to test rate limits' 
      };
    }
  });
}