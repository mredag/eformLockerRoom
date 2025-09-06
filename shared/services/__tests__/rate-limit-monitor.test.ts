/**
 * Unit tests for Rate Limit Monitor Service
 */

import { RateLimitMonitor, getRateLimitMonitor } from '../rate-limit-monitor';
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from '../rate-limiter';

// Mock the rate limiter
jest.mock('../rate-limiter');

describe('RateLimitMonitor', () => {
  let monitor: RateLimitMonitor;
  let mockRateLimiter: jest.Mocked<RateLimiter>;

  beforeEach(() => {
    monitor = new RateLimitMonitor();
    
    // Create mock rate limiter
    mockRateLimiter = {
      getRecentViolations: jest.fn(),
      getState: jest.fn(),
      checkCardRate: jest.fn(),
      checkLockerRate: jest.fn(),
      checkCommandCooldown: jest.fn(),
      checkUserReportRate: jest.fn(),
      checkAllLimits: jest.fn(),
      recordCardOpen: jest.fn(),
      recordLockerOpen: jest.fn(),
      recordCommand: jest.fn(),
      recordUserReport: jest.fn(),
      recordSuccessfulOpen: jest.fn(),
      cleanupViolations: jest.fn()
    } as any;

    // Mock the getRateLimiter function
    (require('../rate-limiter').getRateLimiter as jest.Mock).mockReturnValue(mockRateLimiter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should calculate metrics correctly with no violations', () => {
      mockRateLimiter.getRecentViolations.mockReturnValue([]);
      
      const metrics = monitor.getMetrics(60);
      
      expect(metrics.totalViolations).toBe(0);
      expect(metrics.violationsPerMinute).toBe(0);
      expect(metrics.systemHealth).toBe('healthy');
      expect(metrics.topViolators).toEqual([]);
    });

    it('should calculate metrics correctly with violations', () => {
      const mockViolations = [
        { type: 'card_rate', key: 'card123', timestamp: new Date(), retryAfter: 5 },
        { type: 'card_rate', key: 'card123', timestamp: new Date(), retryAfter: 5 },
        { type: 'locker_rate', key: '1', timestamp: new Date(), retryAfter: 10 },
        { type: 'command_cooldown', key: 'global', timestamp: new Date(), retryAfter: 3 }
      ];
      
      mockRateLimiter.getRecentViolations.mockReturnValue(mockViolations);
      
      const metrics = monitor.getMetrics(60);
      
      expect(metrics.totalViolations).toBe(4);
      expect(metrics.violationsByType).toEqual({
        'card_rate': 2,
        'locker_rate': 1,
        'command_cooldown': 1
      });
      expect(metrics.violationsByKey).toEqual({
        'card123': 2,
        '1': 1,
        'global': 1
      });
      expect(metrics.violationsPerMinute).toBeCloseTo(4/60);
      expect(metrics.topViolators[0]).toEqual({
        key: 'card123',
        count: 2,
        type: 'card_rate'
      });
    });

    it('should determine system health correctly', () => {
      // Test warning level
      const warningViolations = Array(11).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(warningViolations);
      
      const warningMetrics = monitor.getMetrics(1); // 1 minute window = 11 violations/minute
      expect(warningMetrics.systemHealth).toBe('warning');
      
      // Test critical level
      const criticalViolations = Array(101).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(criticalViolations);
      
      const criticalMetrics = monitor.getMetrics(1); // 101 violations/minute
      expect(criticalMetrics.systemHealth).toBe('critical');
    });
  });

  describe('checkAlerts', () => {
    it('should generate high violation rate alert', () => {
      const highViolations = Array(15).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(highViolations);
      
      const alerts = monitor.checkAlerts();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_violation_rate');
      expect(alerts[0].severity).toBe('high');
    });

    it('should generate card abuse alert', () => {
      const cardAbuse = Array(55).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(cardAbuse);
      
      const alerts = monitor.checkAlerts();
      
      const cardAlert = alerts.find(a => a.type === 'card_abuse');
      expect(cardAlert).toBeDefined();
      expect(cardAlert?.data.cardId).toBe('card123');
      expect(cardAlert?.data.violationCount).toBe(55);
    });

    it('should generate locker abuse alert', () => {
      const lockerAbuse = Array(35).fill(null).map(() => ({
        type: 'locker_rate',
        key: '5',
        timestamp: new Date(),
        retryAfter: 10
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(lockerAbuse);
      
      const alerts = monitor.checkAlerts();
      
      const lockerAlert = alerts.find(a => a.type === 'locker_abuse');
      expect(lockerAlert).toBeDefined();
      expect(lockerAlert?.data.lockerId).toBe('5');
      expect(lockerAlert?.data.violationCount).toBe(35);
    });

    it('should not generate alerts for normal activity', () => {
      const normalViolations = Array(5).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(normalViolations);
      
      const alerts = monitor.checkAlerts();
      
      expect(alerts).toHaveLength(0);
    });
  });

  describe('alert management', () => {
    it('should track and acknowledge alerts', () => {
      // Generate an alert
      const highViolations = Array(15).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(highViolations);
      
      const newAlerts = monitor.checkAlerts();
      expect(newAlerts).toHaveLength(1);
      
      // Check active alerts
      const activeAlerts = monitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      
      // Acknowledge alert
      const acknowledged = monitor.acknowledgeAlert(newAlerts[0].id);
      expect(acknowledged).toBe(true);
      
      // Check active alerts again
      const activeAlertsAfter = monitor.getActiveAlerts();
      expect(activeAlertsAfter).toHaveLength(0);
      
      // All alerts should still include acknowledged ones
      const allAlerts = monitor.getAllAlerts();
      expect(allAlerts).toHaveLength(1);
      expect(allAlerts[0].acknowledged).toBe(true);
    });

    it('should return false when acknowledging non-existent alert', () => {
      const acknowledged = monitor.acknowledgeAlert('non-existent-id');
      expect(acknowledged).toBe(false);
    });
  });

  describe('getStatusSummary', () => {
    it('should return healthy status with no violations', () => {
      mockRateLimiter.getRecentViolations.mockReturnValue([]);
      
      const status = monitor.getStatusSummary();
      
      expect(status.status).toBe('healthy');
      expect(status.activeAlerts).toBe(0);
      expect(status.recentViolations).toBe(0);
      expect(status.systemLoad).toBe('low');
    });

    it('should return warning status with moderate violations', () => {
      const moderateViolations = Array(8).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(moderateViolations);
      
      const status = monitor.getStatusSummary();
      
      expect(status.status).toBe('warning');
      expect(status.systemLoad).toBe('medium');
    });

    it('should return critical status with high violations', () => {
      const highViolations = Array(25).fill(null).map(() => ({
        type: 'card_rate',
        key: 'card123',
        timestamp: new Date(),
        retryAfter: 5
      }));
      
      mockRateLimiter.getRecentViolations.mockReturnValue(highViolations);
      
      const status = monitor.getStatusSummary();
      
      expect(status.status).toBe('critical');
      expect(status.systemLoad).toBe('high');
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report with recommendations', () => {
      const violations = [
        ...Array(30).fill(null).map(() => ({
          type: 'card_rate',
          key: 'card123',
          timestamp: new Date(),
          retryAfter: 5
        })),
        ...Array(10).fill(null).map(() => ({
          type: 'locker_rate',
          key: '1',
          timestamp: new Date(),
          retryAfter: 10
        }))
      ];
      
      mockRateLimiter.getRecentViolations.mockReturnValue(violations);
      
      const report = monitor.generateReport(1);
      
      expect(report.summary.totalViolations).toBe(40);
      expect(report.recommendations).toContain(
        'High card rate violations - consider user education or adjusting card rate limits'
      );
      expect(report.recommendations).toContain(
        'High locker rate violations - check for hardware issues or adjust locker limits'
      );
    });
  });

  describe('threshold management', () => {
    it('should update and get thresholds', () => {
      const newThresholds = {
        violationsPerMinute: 20,
        cardViolationsPerHour: 100
      };
      
      monitor.updateThresholds(newThresholds);
      
      const currentThresholds = monitor.getThresholds();
      expect(currentThresholds.violationsPerMinute).toBe(20);
      expect(currentThresholds.cardViolationsPerHour).toBe(100);
      expect(currentThresholds.lockerViolationsPerHour).toBe(30); // Should remain unchanged
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = getRateLimitMonitor();
      const instance2 = getRateLimitMonitor();
      
      expect(instance1).toBe(instance2);
    });
  });
});