/**
 * UI Performance Tracker for Kiosk Interface
 * 
 * Tracks UI update latency and reports to performance monitoring system
 * Implements requirements 8.1, 8.4 for UI performance monitoring
 */

class UIPerformanceTracker {
  constructor() {
    this.kioskId = this.getKioskId();
    this.panelUrl = this.getPanelUrl();
    this.enabled = true;
    this.pendingReports = [];
    this.reportBatchSize = 10;
    this.reportInterval = 5000; // Report every 5 seconds
    
    this.startReportingTimer();
    console.log('📊 UI Performance Tracker initialized');
  }

  /**
   * Track state update performance
   */
  trackStateUpdate(startTime, success = true, errorMessage = null) {
    const latency = performance.now() - startTime;
    this.recordEvent('state_update', latency, success, errorMessage);
  }

  /**
   * Track session start performance
   */
  trackSessionStart(startTime, success = true, errorMessage = null) {
    const latency = performance.now() - startTime;
    this.recordEvent('session_start', latency, success, errorMessage);
  }

  /**
   * Track locker selection performance
   */
  trackLockerSelection(startTime, success = true, errorMessage = null) {
    const latency = performance.now() - startTime;
    this.recordEvent('locker_selection', latency, success, errorMessage);
  }

  /**
   * Track UI render performance
   */
  trackUIRender(startTime, success = true, errorMessage = null) {
    const latency = performance.now() - startTime;
    this.recordEvent('ui_render', latency, success, errorMessage);
  }

  /**
   * Record a performance event
   */
  recordEvent(eventType, latency, success, errorMessage) {
    if (!this.enabled) return;

    const event = {
      kioskId: this.kioskId,
      eventType,
      latency: Math.round(latency),
      success,
      errorMessage,
      timestamp: new Date().toISOString()
    };

    this.pendingReports.push(event);

    // Log performance issues
    if (latency > 2000) {
      console.warn(`⚠️ Slow UI performance: ${eventType} took ${latency.toFixed(0)}ms`);
    }

    // Batch report if we have enough events
    if (this.pendingReports.length >= this.reportBatchSize) {
      this.flushReports();
    }
  }

  /**
   * Measure and track a function execution
   */
  measure(eventType, fn) {
    const startTime = performance.now();
    
    try {
      const result = fn();
      
      // Handle promises
      if (result && typeof result.then === 'function') {
        return result
          .then(value => {
            this.recordEvent(eventType, performance.now() - startTime, true);
            return value;
          })
          .catch(error => {
            this.recordEvent(eventType, performance.now() - startTime, false, error.message);
            throw error;
          });
      }
      
      // Handle synchronous functions
      this.recordEvent(eventType, performance.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordEvent(eventType, performance.now() - startTime, false, error.message);
      throw error;
    }
  }

  /**
   * Measure async function execution
   */
  async measureAsync(eventType, asyncFn) {
    const startTime = performance.now();
    
    try {
      const result = await asyncFn();
      this.recordEvent(eventType, performance.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordEvent(eventType, performance.now() - startTime, false, error.message);
      throw error;
    }
  }

  /**
   * Start automatic reporting timer
   */
  startReportingTimer() {
    setInterval(() => {
      if (this.pendingReports.length > 0) {
        this.flushReports();
      }
    }, this.reportInterval);
  }

  /**
   * Send pending reports to performance monitoring system
   */
  async flushReports() {
    if (this.pendingReports.length === 0) return;

    const reportsToSend = [...this.pendingReports];
    this.pendingReports = [];

    try {
      // Send each event individually (could be optimized with batch endpoint)
      const promises = reportsToSend.map(event => 
        fetch(`${this.panelUrl}/api/performance/ui-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        }).catch(error => {
          // Silently handle network errors to avoid console spam
          return null;
        })
      );

      await Promise.all(promises);
      
      // Only log successful batches occasionally
      if (reportsToSend.length >= this.reportBatchSize) {
        console.log(`📊 Reported ${reportsToSend.length} UI performance events`);
      }
    } catch (error) {
      // Re-queue failed reports (up to a limit)
      if (this.pendingReports.length < 100) {
        this.pendingReports.unshift(...reportsToSend);
      }
    }
  }

  /**
   * Get kiosk ID from environment or generate one
   */
  getKioskId() {
    // Try to get from URL params, localStorage, or default
    const urlParams = new URLSearchParams(window.location.search);
    const kioskId = urlParams.get('kioskId') || 
                   localStorage.getItem('kioskId') || 
                   'kiosk-1';
    
    // Store in localStorage for consistency
    localStorage.setItem('kioskId', kioskId);
    return kioskId;
  }

  /**
   * Get panel URL for reporting
   */
  getPanelUrl() {
    // Try to determine panel URL from current location
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    // Default to port 3001 for panel service
    return `${protocol}//${hostname}:3001`;
  }

  /**
   * Enable or disable performance tracking
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`📊 UI Performance tracking ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Track memory usage for Raspberry Pi monitoring
   */
  trackMemoryUsage() {
    if (!performance.memory) return null;

    const memoryInfo = {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      timestamp: new Date().toISOString()
    };

    // Calculate memory usage percentage
    const memoryUsagePercent = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;

    // Log warning if memory usage is high (>80% on Pi)
    if (memoryUsagePercent > 80) {
      console.warn(`⚠️ High memory usage: ${memoryUsagePercent.toFixed(1)}% (${Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024)}MB)`);
    }

    // Record memory usage as performance event
    this.recordEvent('memory_usage', memoryUsagePercent, memoryUsagePercent < 90, 
      memoryUsagePercent > 90 ? 'High memory usage detected' : null);

    return memoryInfo;
  }

  /**
   * Start memory monitoring for Raspberry Pi
   */
  startMemoryMonitoring() {
    if (!performance.memory) {
      console.warn('⚠️ Memory monitoring not available in this browser');
      return;
    }

    // Monitor memory every 30 seconds
    setInterval(() => {
      this.trackMemoryUsage();
    }, 30000);

    // Initial memory check
    this.trackMemoryUsage();
    console.log('📊 Memory monitoring started');
  }

  /**
   * Force garbage collection if available (for testing)
   */
  forceGarbageCollection() {
    if (window.gc) {
      window.gc();
      console.log('🗑️ Forced garbage collection');
      // Track memory after GC
      setTimeout(() => this.trackMemoryUsage(), 1000);
    } else {
      console.warn('⚠️ Garbage collection not available');
    }
  }

  /**
   * Get performance statistics including memory
   */
  getStats() {
    const events = [...this.pendingReports];
    const totalEvents = events.length;
    const successfulEvents = events.filter(e => e.success).length;
    const avgLatency = events.length > 0 
      ? events.reduce((sum, e) => sum + e.latency, 0) / events.length 
      : 0;

    const memoryInfo = this.trackMemoryUsage();

    return {
      totalEvents,
      successfulEvents,
      errorRate: totalEvents > 0 ? ((totalEvents - successfulEvents) / totalEvents) * 100 : 0,
      avgLatency: Math.round(avgLatency),
      pendingReports: this.pendingReports.length,
      memory: memoryInfo ? {
        usedMB: Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024),
        limitMB: Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024),
        usagePercent: Math.round((memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100)
      } : null
    };
  }

  /**
   * Create a performance observer for automatic tracking
   */
  observePerformance() {
    if (!window.PerformanceObserver) return;

    // Observe long tasks (> 50ms)
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            this.recordEvent('ui_render', entry.duration, true);
          }
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (error) {
      // Long task API not supported
    }

    // Observe layout shifts
    try {
      const layoutShiftObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.value > 0.1) { // Significant layout shift
            this.recordEvent('ui_render', entry.value * 1000, false, 'Layout shift detected');
          }
        }
      });
      layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      // Layout shift API not supported
    }
  }
}

// Create global performance tracker instance
window.performanceTracker = new UIPerformanceTracker();

// Start observing performance automatically
window.performanceTracker.observePerformance();

// Start memory monitoring for Raspberry Pi
window.performanceTracker.startMemoryMonitoring();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIPerformanceTracker;
}