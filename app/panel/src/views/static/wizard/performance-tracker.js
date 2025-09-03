/**
 * Hardware Configuration Wizard - Client-Side Performance Tracker
 * 
 * Tracks user experience metrics, operation timing, and resource usage
 * from the browser side to provide comprehensive performance monitoring.
 * 
 * Requirements: 10.4, 10.5, 10.6
 */

class WizardPerformanceTracker {
    constructor() {
        this.operationStartTimes = new Map();
        this.performanceBuffer = [];
        this.resourceMonitorInterval = null;
        this.batchSize = 10;
        this.flushInterval = 30000; // 30 seconds
        this.isEnabled = true;
        
        this.init();
    }

    /**
     * Initialize performance tracking
     */
    init() {
        // Start resource monitoring
        this.startResourceMonitoring();
        
        // Set up periodic data flushing
        setInterval(() => this.flushPerformanceData(), this.flushInterval);
        
        // Track page load performance
        this.trackPageLoad();
        
        // Set up navigation timing
        this.setupNavigationTracking();
        
        // Track user interactions
        this.setupInteractionTracking();
        
        console.log('🎯 Wizard Performance Tracker initialized');
    }

    /**
     * Start tracking a wizard operation
     */
    startOperation(operationId, operationType, metadata = {}) {
        if (!this.isEnabled) return;
        
        const startTime = performance.now();
        this.operationStartTimes.set(operationId, {
            startTime,
            operationType,
            metadata: {
                ...metadata,
                userAgent: navigator.userAgent,
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                connectionType: this.getConnectionType()
            }
        });

        // Send to server
        this.sendOperationStart(operationId, operationType, metadata);
        
        console.log(`📊 Started tracking operation: ${operationId} (${operationType})`);
    }

    /**
     * Complete tracking a wizard operation
     */
    completeOperation(operationId, success = true, errorMessage = null) {
        if (!this.isEnabled) return;
        
        const operationData = this.operationStartTimes.get(operationId);
        if (!operationData) {
            console.warn(`⚠️ Operation ${operationId} not found in tracking`);
            return;
        }

        const endTime = performance.now();
        const duration = endTime - operationData.startTime;
        
        // Record performance metric
        this.recordPerformanceMetric({
            type: 'operation_complete',
            operationId,
            operationType: operationData.operationType,
            duration,
            success,
            errorMessage,
            metadata: operationData.metadata,
            timestamp: Date.now()
        });

        // Send to server
        this.sendOperationComplete(operationId, success, errorMessage);
        
        // Clean up
        this.operationStartTimes.delete(operationId);
        
        console.log(`📊 Completed tracking operation: ${operationId} (${duration.toFixed(2)}ms)`);
    }

    /**
     * Track step navigation timing
     */
    trackStepNavigation(fromStep, toStep) {
        if (!this.isEnabled) return;
        
        const navigationTime = performance.now();
        
        this.recordPerformanceMetric({
            type: 'step_navigation',
            fromStep,
            toStep,
            timestamp: Date.now(),
            navigationTime,
            metadata: {
                url: window.location.href,
                referrer: document.referrer
            }
        });
        
        console.log(`📊 Step navigation: ${fromStep} → ${toStep}`);
    }

    /**
     * Track user wait time (time between user action and system response)
     */
    trackUserWaitTime(actionType, waitTime) {
        if (!this.isEnabled) return;
        
        this.recordPerformanceMetric({
            type: 'user_wait_time',
            actionType,
            waitTime,
            timestamp: Date.now(),
            metadata: {
                activeElement: document.activeElement?.tagName || 'unknown'
            }
        });
        
        if (waitTime > 2000) { // Log slow responses
            console.warn(`⏱️ Slow response detected: ${actionType} took ${waitTime}ms`);
        }
    }

    /**
     * Track error recovery time
     */
    trackErrorRecovery(errorType, recoveryTime, recoveryMethod) {
        if (!this.isEnabled) return;
        
        this.recordPerformanceMetric({
            type: 'error_recovery',
            errorType,
            recoveryTime,
            recoveryMethod,
            timestamp: Date.now()
        });
        
        console.log(`🔧 Error recovery tracked: ${errorType} (${recoveryTime}ms)`);
    }

    /**
     * Track UI rendering performance
     */
    trackUIRender(componentName, renderTime) {
        if (!this.isEnabled) return;
        
        this.recordPerformanceMetric({
            type: 'ui_render',
            componentName,
            renderTime,
            timestamp: Date.now(),
            metadata: {
                domNodes: document.querySelectorAll('*').length,
                memoryUsage: this.getMemoryUsage()
            }
        });
    }

    /**
     * Track network request performance
     */
    trackNetworkRequest(url, method, duration, success, responseSize = 0) {
        if (!this.isEnabled) return;
        
        this.recordPerformanceMetric({
            type: 'network_request',
            url,
            method,
            duration,
            success,
            responseSize,
            timestamp: Date.now(),
            metadata: {
                connectionType: this.getConnectionType(),
                effectiveType: this.getEffectiveConnectionType()
            }
        });
    }

    /**
     * Record a performance metric
     */
    recordPerformanceMetric(metric) {
        this.performanceBuffer.push(metric);
        
        // Flush if buffer is full
        if (this.performanceBuffer.length >= this.batchSize) {
            this.flushPerformanceData();
        }
    }

    /**
     * Start monitoring system resources
     */
    startResourceMonitoring() {
        this.resourceMonitorInterval = setInterval(() => {
            this.collectResourceMetrics();
        }, 10000); // Every 10 seconds
    }

    /**
     * Collect current resource metrics
     */
    collectResourceMetrics() {
        if (!this.isEnabled) return;
        
        const memoryInfo = this.getMemoryUsage();
        const connectionInfo = this.getConnectionInfo();
        
        const resourceMetric = {
            type: 'resource_usage',
            timestamp: Date.now(),
            memoryUsage: memoryInfo,
            connectionInfo,
            performanceEntries: this.getPerformanceEntries(),
            domComplexity: {
                totalNodes: document.querySelectorAll('*').length,
                scriptTags: document.querySelectorAll('script').length,
                styleTags: document.querySelectorAll('style, link[rel="stylesheet"]').length
            }
        };
        
        this.recordPerformanceMetric(resourceMetric);
    }

    /**
     * Get memory usage information
     */
    getMemoryUsage() {
        if ('memory' in performance) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
                percentage: (performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize) * 100
            };
        }
        return null;
    }

    /**
     * Get connection type
     */
    getConnectionType() {
        if ('connection' in navigator) {
            return navigator.connection.type || 'unknown';
        }
        return 'unknown';
    }

    /**
     * Get effective connection type
     */
    getEffectiveConnectionType() {
        if ('connection' in navigator) {
            return navigator.connection.effectiveType || 'unknown';
        }
        return 'unknown';
    }

    /**
     * Get connection information
     */
    getConnectionInfo() {
        if ('connection' in navigator) {
            const conn = navigator.connection;
            return {
                type: conn.type || 'unknown',
                effectiveType: conn.effectiveType || 'unknown',
                downlink: conn.downlink || 0,
                rtt: conn.rtt || 0,
                saveData: conn.saveData || false
            };
        }
        return null;
    }

    /**
     * Get performance entries
     */
    getPerformanceEntries() {
        const entries = performance.getEntriesByType('navigation')[0];
        if (entries) {
            return {
                domContentLoaded: entries.domContentLoadedEventEnd - entries.domContentLoadedEventStart,
                loadComplete: entries.loadEventEnd - entries.loadEventStart,
                domInteractive: entries.domInteractive - entries.navigationStart,
                firstPaint: this.getFirstPaint(),
                firstContentfulPaint: this.getFirstContentfulPaint()
            };
        }
        return null;
    }

    /**
     * Get First Paint timing
     */
    getFirstPaint() {
        const paintEntries = performance.getEntriesByType('paint');
        const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
        return firstPaint ? firstPaint.startTime : null;
    }

    /**
     * Get First Contentful Paint timing
     */
    getFirstContentfulPaint() {
        const paintEntries = performance.getEntriesByType('paint');
        const firstContentfulPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        return firstContentfulPaint ? firstContentfulPaint.startTime : null;
    }

    /**
     * Track page load performance
     */
    trackPageLoad() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const navigation = performance.getEntriesByType('navigation')[0];
                if (navigation) {
                    this.recordPerformanceMetric({
                        type: 'page_load',
                        timestamp: Date.now(),
                        loadTime: navigation.loadEventEnd - navigation.navigationStart,
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
                        firstPaint: this.getFirstPaint(),
                        firstContentfulPaint: this.getFirstContentfulPaint(),
                        metadata: {
                            url: window.location.href,
                            referrer: document.referrer
                        }
                    });
                }
            }, 0);
        });
    }

    /**
     * Setup navigation tracking
     */
    setupNavigationTracking() {
        // Track hash changes (for single-page navigation)
        window.addEventListener('hashchange', (event) => {
            this.recordPerformanceMetric({
                type: 'navigation',
                timestamp: Date.now(),
                from: event.oldURL,
                to: event.newURL,
                navigationType: 'hash_change'
            });
        });

        // Track back/forward navigation
        window.addEventListener('popstate', (event) => {
            this.recordPerformanceMetric({
                type: 'navigation',
                timestamp: Date.now(),
                navigationType: 'popstate',
                state: event.state
            });
        });
    }

    /**
     * Setup interaction tracking
     */
    setupInteractionTracking() {
        // Track clicks on important elements
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (target.matches('button, .btn, [role="button"], .wizard-step, .card')) {
                const interactionTime = performance.now();
                this.recordPerformanceMetric({
                    type: 'user_interaction',
                    timestamp: Date.now(),
                    interactionType: 'click',
                    targetElement: target.tagName.toLowerCase(),
                    targetClass: target.className,
                    targetId: target.id,
                    interactionTime
                });
            }
        });

        // Track form interactions
        document.addEventListener('submit', (event) => {
            this.recordPerformanceMetric({
                type: 'user_interaction',
                timestamp: Date.now(),
                interactionType: 'form_submit',
                formId: event.target.id,
                formAction: event.target.action
            });
        });
    }

    /**
     * Send operation start to server
     */
    async sendOperationStart(operationId, operationType, metadata) {
        try {
            await fetch('/api/wizard/performance/operation/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    operationId,
                    operationType,
                    metadata
                })
            });
        } catch (error) {
            console.error('Error sending operation start:', error);
        }
    }

    /**
     * Send operation complete to server
     */
    async sendOperationComplete(operationId, success, errorMessage) {
        try {
            await fetch('/api/wizard/performance/operation/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    operationId,
                    success,
                    errorMessage
                })
            });
        } catch (error) {
            console.error('Error sending operation complete:', error);
        }
    }

    /**
     * Flush performance data to server
     */
    async flushPerformanceData() {
        if (this.performanceBuffer.length === 0) return;
        
        const dataToSend = [...this.performanceBuffer];
        this.performanceBuffer = [];
        
        try {
            // Send resource usage data
            const resourceMetrics = dataToSend.filter(m => m.type === 'resource_usage');
            for (const metric of resourceMetrics) {
                if (metric.memoryUsage) {
                    await fetch('/api/wizard/performance/resource-usage', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            timestamp: metric.timestamp,
                            memoryUsage: {
                                used: metric.memoryUsage.used,
                                free: metric.memoryUsage.total - metric.memoryUsage.used,
                                total: metric.memoryUsage.total,
                                percentage: metric.memoryUsage.percentage
                            },
                            cpuUsage: {
                                user: 0, // Not available in browser
                                system: 0,
                                idle: 0,
                                percentage: 0
                            },
                            networkStats: {
                                latency: metric.connectionInfo?.rtt || 0,
                                throughput: metric.connectionInfo?.downlink || 0,
                                errors: 0
                            }
                        })
                    });
                }
            }
            
            console.log(`📊 Flushed ${dataToSend.length} performance metrics`);
        } catch (error) {
            console.error('Error flushing performance data:', error);
            // Put data back in buffer for retry
            this.performanceBuffer.unshift(...dataToSend);
        }
    }

    /**
     * Enable performance tracking
     */
    enable() {
        this.isEnabled = true;
        if (!this.resourceMonitorInterval) {
            this.startResourceMonitoring();
        }
        console.log('📊 Performance tracking enabled');
    }

    /**
     * Disable performance tracking
     */
    disable() {
        this.isEnabled = false;
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
            this.resourceMonitorInterval = null;
        }
        console.log('📊 Performance tracking disabled');
    }

    /**
     * Get current performance summary
     */
    getPerformanceSummary() {
        return {
            activeOperations: this.operationStartTimes.size,
            bufferedMetrics: this.performanceBuffer.length,
            memoryUsage: this.getMemoryUsage(),
            connectionInfo: this.getConnectionInfo(),
            isEnabled: this.isEnabled
        };
    }

    /**
     * Clear all tracking data
     */
    clear() {
        this.operationStartTimes.clear();
        this.performanceBuffer = [];
        console.log('📊 Performance tracking data cleared');
    }

    /**
     * Shutdown performance tracker
     */
    shutdown() {
        this.disable();
        this.flushPerformanceData();
        this.clear();
        console.log('📊 Performance tracker shutdown');
    }
}

// Create global instance
window.wizardPerformanceTracker = new WizardPerformanceTracker();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WizardPerformanceTracker;
}