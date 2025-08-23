import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthController } from '../health-controller';
import { HealthMonitor } from '../../services/health-monitor';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock HealthMonitor
const mockHealthMonitor = {
  getSystemHealth: vi.fn(),
  runDiagnostics: vi.fn(),
  getKioskHealth: vi.fn(),
  generateDiagnosticReport: vi.fn(),
  rotateLogFiles: vi.fn()
} as unknown as HealthMonitor;

// Mock Fastify request and reply
const mockRequest = {} as FastifyRequest;
const mockReply = {
  code: vi.fn().mockReturnThis(),
  type: vi.fn().mockReturnThis()
} as unknown as FastifyReply;

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(() => {
    vi.clearAllMocks();
    healthController = new HealthController(mockHealthMonitor);
  });

  describe('getHealth', () => {
    it('should return healthy status with 200 code', async () => {
      const mockHealth = {
        status: 'healthy' as const,
        version: '1.0.0',
        uptime: 3600000,
        components: {
          database: 'ok' as const,
          hardware: 'ok' as const,
          network: 'ok' as const,
          services: 'ok' as const
        }
      };

      vi.mocked(mockHealthMonitor.getSystemHealth).mockResolvedValue(mockHealth);

      const result = await healthController.getHealth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(result).toEqual(mockHealth);
    });

    it('should return degraded status with 200 code', async () => {
      const mockHealth = {
        status: 'degraded' as const,
        version: '1.0.0',
        uptime: 3600000,
        components: {
          database: 'error' as const,
          hardware: 'ok' as const,
          network: 'ok' as const,
          services: 'ok' as const
        }
      };

      vi.mocked(mockHealthMonitor.getSystemHealth).mockResolvedValue(mockHealth);

      const result = await healthController.getHealth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(result).toEqual(mockHealth);
    });

    it('should return unhealthy status with 503 code', async () => {
      const mockHealth = {
        status: 'unhealthy' as const,
        version: '1.0.0',
        uptime: 3600000,
        components: {
          database: 'error' as const,
          hardware: 'error' as const,
          network: 'ok' as const,
          services: 'ok' as const
        }
      };

      vi.mocked(mockHealthMonitor.getSystemHealth).mockResolvedValue(mockHealth);

      const result = await healthController.getHealth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(result).toEqual(mockHealth);
    });

    it('should handle health monitor errors', async () => {
      vi.mocked(mockHealthMonitor.getSystemHealth).mockRejectedValue(new Error('Health check failed'));

      const result = await healthController.getHealth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(result.status).toBe('unhealthy');
      expect(result.details?.error).toBe('Health check failed');
    });
  });

  describe('getDetailedHealth', () => {
    it('should return health with diagnostics', async () => {
      const mockHealth = {
        status: 'healthy' as const,
        version: '1.0.0',
        uptime: 3600000,
        components: {
          database: 'ok' as const,
          hardware: 'ok' as const,
          network: 'ok' as const,
          services: 'ok' as const
        }
      };

      const mockDiagnostics = {
        timestamp: new Date(),
        system_info: { node_version: 'v18.0.0' },
        database_diagnostics: { status: 'ok' },
        performance_metrics: { memory_usage: 50 },
        error_summary: { failed_commands: [] }
      };

      vi.mocked(mockHealthMonitor.getSystemHealth).mockResolvedValue(mockHealth);
      vi.mocked(mockHealthMonitor.runDiagnostics).mockResolvedValue(mockDiagnostics);

      const result = await healthController.getDetailedHealth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(result).toEqual({
        ...mockHealth,
        diagnostics: mockDiagnostics
      });
    });

    it('should handle detailed health errors', async () => {
      vi.mocked(mockHealthMonitor.getSystemHealth).mockRejectedValue(new Error('Detailed health failed'));

      const result = await healthController.getDetailedHealth(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Detailed health failed');
    });
  });

  describe('getKioskHealth', () => {
    it('should return kiosk-specific health information', async () => {
      const mockKioskHealth = {
        database: { status: 'ok' as const, last_write: new Date(), wal_size: 1024 },
        rs485: { status: 'ok' as const, port: '/dev/ttyUSB0', last_successful_command: new Date() },
        command_queue: { pending_count: 0, failed_count: 0, last_processed: new Date() },
        system: { version: '1.0.0', uptime: 3600000, memory_usage: 50 }
      };

      const mockRequestWithParams = {
        params: { kioskId: 'kiosk-1' }
      } as FastifyRequest<{ Params: { kioskId: string } }>;

      vi.mocked(mockHealthMonitor.getKioskHealth).mockResolvedValue(mockKioskHealth);

      const result = await healthController.getKioskHealth(mockRequestWithParams, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(result.kiosk_id).toBe('kiosk-1');
      expect(result.status).toBe('healthy');
      expect(result.database).toEqual(mockKioskHealth.database);
    });

    it('should return unhealthy status when components have errors', async () => {
      const mockKioskHealth = {
        database: { status: 'error' as const, last_write: new Date(), wal_size: 0 },
        rs485: { status: 'ok' as const, port: '/dev/ttyUSB0', last_successful_command: new Date() },
        command_queue: { pending_count: 0, failed_count: 0, last_processed: new Date() },
        system: { version: '1.0.0', uptime: 3600000, memory_usage: 50 }
      };

      const mockRequestWithParams = {
        params: { kioskId: 'kiosk-2' }
      } as FastifyRequest<{ Params: { kioskId: string } }>;

      vi.mocked(mockHealthMonitor.getKioskHealth).mockResolvedValue(mockKioskHealth);

      const result = await healthController.getKioskHealth(mockRequestWithParams, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(result.kiosk_id).toBe('kiosk-2');
      expect(result.status).toBe('unhealthy');
    });

    it('should handle kiosk health errors', async () => {
      const mockRequestWithParams = {
        params: { kioskId: 'kiosk-error' }
      } as FastifyRequest<{ Params: { kioskId: string } }>;

      vi.mocked(mockHealthMonitor.getKioskHealth).mockRejectedValue(new Error('Kiosk not found'));

      const result = await healthController.getKioskHealth(mockRequestWithParams, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(result.kiosk_id).toBe('kiosk-error');
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Kiosk not found');
    });
  });

  describe('getDiagnosticReport', () => {
    it('should return diagnostic report as plain text', async () => {
      const mockReport = `=== DIAGNOSTIC REPORT ===
System Status: Healthy
Database: OK
Memory Usage: 50MB`;

      vi.mocked(mockHealthMonitor.generateDiagnosticReport).mockResolvedValue(mockReport);

      const result = await healthController.getDiagnosticReport(mockRequest, mockReply);

      expect(mockReply.type).toHaveBeenCalledWith('text/plain');
      expect(result).toBe(mockReport);
    });

    it('should handle diagnostic report generation errors', async () => {
      vi.mocked(mockHealthMonitor.generateDiagnosticReport).mockRejectedValue(new Error('Report generation failed'));

      const result = await healthController.getDiagnosticReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(result.error).toBe('Failed to generate diagnostic report');
      expect(result.message).toBe('Report generation failed');
    });
  });

  describe('rotateLogFiles', () => {
    it('should rotate log files with default parameters', async () => {
      const mockRotationResult = {
        rotated_files: [],
        deleted_files: ['old.log', 'ancient.log'],
        errors: []
      };

      const mockRequestWithBody = {
        body: {}
      } as FastifyRequest<{ Body: { log_directory?: string; retention_days?: number } }>;

      vi.mocked(mockHealthMonitor.rotateLogFiles).mockResolvedValue(mockRotationResult);

      const result = await healthController.rotateLogFiles(mockRequestWithBody, mockReply);

      expect(mockHealthMonitor.rotateLogFiles).toHaveBeenCalledWith('./logs', 30);
      expect(result.success).toBe(true);
      expect(result.deleted_files).toEqual(['old.log', 'ancient.log']);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should rotate log files with custom parameters', async () => {
      const mockRotationResult = {
        rotated_files: [],
        deleted_files: ['custom.log'],
        errors: []
      };

      const mockRequestWithBody = {
        body: {
          log_directory: '/custom/logs',
          retention_days: 7
        }
      } as FastifyRequest<{ Body: { log_directory?: string; retention_days?: number } }>;

      vi.mocked(mockHealthMonitor.rotateLogFiles).mockResolvedValue(mockRotationResult);

      const result = await healthController.rotateLogFiles(mockRequestWithBody, mockReply);

      expect(mockHealthMonitor.rotateLogFiles).toHaveBeenCalledWith('/custom/logs', 7);
      expect(result.success).toBe(true);
      expect(result.deleted_files).toEqual(['custom.log']);
    });

    it('should handle log rotation errors', async () => {
      const mockRequestWithBody = {
        body: {}
      } as FastifyRequest<{ Body: { log_directory?: string; retention_days?: number } }>;

      vi.mocked(mockHealthMonitor.rotateLogFiles).mockRejectedValue(new Error('Permission denied'));

      const result = await healthController.rotateLogFiles(mockRequestWithBody, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('should handle requests with no body', async () => {
      const mockRotationResult = {
        rotated_files: [],
        deleted_files: [],
        errors: []
      };

      const mockRequestWithoutBody = {} as FastifyRequest<{ Body: { log_directory?: string; retention_days?: number } }>;

      vi.mocked(mockHealthMonitor.rotateLogFiles).mockResolvedValue(mockRotationResult);

      const result = await healthController.rotateLogFiles(mockRequestWithoutBody, mockReply);

      expect(mockHealthMonitor.rotateLogFiles).toHaveBeenCalledWith('./logs', 30);
      expect(result.success).toBe(true);
    });
  });

  describe('registerRoutes', () => {
    it('should register all health routes', () => {
      const mockFastify = {
        get: vi.fn(),
        post: vi.fn()
      };

      HealthController.registerRoutes(mockFastify, healthController);

      expect(mockFastify.get).toHaveBeenCalledTimes(4);
      expect(mockFastify.post).toHaveBeenCalledTimes(1);

      // Verify route paths
      expect(mockFastify.get).toHaveBeenCalledWith('/health', expect.any(Object), expect.any(Function));
      expect(mockFastify.get).toHaveBeenCalledWith('/health/detailed', expect.any(Object), expect.any(Function));
      expect(mockFastify.get).toHaveBeenCalledWith('/health/kiosk/:kioskId', expect.any(Object), expect.any(Function));
      expect(mockFastify.get).toHaveBeenCalledWith('/health/diagnostics/report', expect.any(Object), expect.any(Function));
      expect(mockFastify.post).toHaveBeenCalledWith('/health/maintenance/rotate-logs', expect.any(Object), expect.any(Function));
    });
  });
});
