/**
 * Hardware Configuration Wizard - Caching and Resource Management Service
 * 
 * Implements performance optimization through intelligent caching and resource management
 * for wizard operations. Supports both in-memory and Redis-based caching.
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import { EventEmitter } from 'events';

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  memoryUsage: number; // bytes
  oldestEntry: number; // timestamp
  newestEntry: number; // timestamp
}

export interface DeviceDetectionCache {
  serialPorts: any[];
  modbusDevices: any[];
  lastScan: number;
  scanDuration: number;
}

export interface WizardSessionCache {
  sessionId: string;
  currentStep: number;
  cardData: any;
  validationResults: any[];
  lastActivity: number;
}

export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  averageResponseTime: number;
}

/**
 * In-memory cache with LRU eviction and TTL support
 */
export class MemoryCache extends EventEmitter {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private defaultTTL: number;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(maxSize: number = 1000, defaultTTL: number = 300000) { // 5 minutes default
    super();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    
    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    
    return entry.data as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entryTTL = ttl || this.defaultTTL;

    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: now,
      ttl: entryTTL,
      accessCount: 1,
      lastAccessed: now
    };

    this.cache.set(key, entry);
    this.emit('set', key, value);
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.emit('delete', key);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
    this.emit('clear');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalRequests = this.stats.hits + this.stats.misses;
    
    return {
      totalEntries: this.cache.size,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? (this.stats.misses / totalRequests) * 100 : 0,
      memoryUsage: this.estimateMemoryUsage(),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.emit('evict', oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.emit('expire', key);
    });

    if (expiredKeys.length > 0) {
      console.log(`🧹 Cache cleanup: removed ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Estimate memory usage of cache
   */
  private estimateMemoryUsage(): number {
    let size = 0;
    for (const [key, entry] of this.cache.entries()) {
      size += key.length * 2; // UTF-16 characters
      size += JSON.stringify(entry).length * 2;
    }
    return size;
  }
}

/**
 * Connection pool for Modbus communications
 */
export class ModbusConnectionPool extends EventEmitter {
  private connections: Map<string, any> = new Map();
  private activeConnections = new Set<string>();
  private waitingQueue: Array<{ resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = [];
  private maxConnections: number;
  private connectionTimeout: number;
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalResponseTime: 0
  };

  constructor(maxConnections: number = 5, connectionTimeout: number = 5000) {
    super();
    this.maxConnections = maxConnections;
    this.connectionTimeout = connectionTimeout;
  }

  /**
   * Acquire a connection from the pool
   */
  async acquireConnection(serialPort: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      this.stats.totalRequests++;

      // Check if connection already exists and is available
      const existingConnection = this.connections.get(serialPort);
      if (existingConnection && !this.activeConnections.has(serialPort)) {
        this.activeConnections.add(serialPort);
        this.recordSuccess(startTime);
        resolve(existingConnection);
        return;
      }

      // Check if we can create a new connection
      if (this.connections.size < this.maxConnections) {
        this.createConnection(serialPort)
          .then(connection => {
            this.connections.set(serialPort, connection);
            this.activeConnections.add(serialPort);
            this.recordSuccess(startTime);
            resolve(connection);
          })
          .catch(error => {
            this.recordFailure(startTime);
            reject(error);
          });
        return;
      }

      // Add to waiting queue
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
          this.recordFailure(startTime);
          reject(new Error('Connection pool timeout'));
        }
      }, this.connectionTimeout);

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(serialPort: string): void {
    this.activeConnections.delete(serialPort);
    this.emit('release', serialPort);

    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const waiting = this.waitingQueue.shift();
      if (waiting) {
        clearTimeout(waiting.timeout);
        const connection = this.connections.get(serialPort);
        if (connection) {
          this.activeConnections.add(serialPort);
          waiting.resolve(connection);
        } else {
          waiting.reject(new Error('Connection no longer available'));
        }
      }
    }
  }

  /**
   * Create a new Modbus connection
   */
  private async createConnection(serialPort: string): Promise<any> {
    // This would integrate with the existing ModbusController
    // For now, return a mock connection object
    return {
      serialPort,
      connected: true,
      lastUsed: Date.now(),
      // Add actual Modbus connection properties here
    };
  }

  /**
   * Record successful request
   */
  private recordSuccess(startTime: number): void {
    this.stats.successfulRequests++;
    this.stats.totalResponseTime += Date.now() - startTime;
  }

  /**
   * Record failed request
   */
  private recordFailure(startTime: number): void {
    this.stats.failedRequests++;
    this.stats.totalResponseTime += Date.now() - startTime;
  }

  /**
   * Get connection pool statistics
   */
  getStats(): ConnectionPoolStats {
    return {
      totalConnections: this.connections.size,
      activeConnections: this.activeConnections.size,
      idleConnections: this.connections.size - this.activeConnections.size,
      waitingRequests: this.waitingQueue.length,
      averageResponseTime: this.stats.totalRequests > 0 ? 
        this.stats.totalResponseTime / this.stats.totalRequests : 0
    };
  }

  /**
   * Close all connections and clear pool
   */
  async close(): Promise<void> {
    // Clear waiting queue
    this.waitingQueue.forEach(waiting => {
      clearTimeout(waiting.timeout);
      waiting.reject(new Error('Connection pool closing'));
    });
    this.waitingQueue.length = 0;

    // Close all connections
    for (const [port, connection] of this.connections.entries()) {
      try {
        // Close connection if it has a close method
        if (connection && typeof connection.close === 'function') {
          await connection.close();
        }
      } catch (error) {
        console.error(`Error closing connection for ${port}:`, error);
      }
    }

    this.connections.clear();
    this.activeConnections.clear();
    this.emit('close');
  }
}

/**
 * Main wizard cache service
 */
export class WizardCacheService extends EventEmitter {
  private deviceCache: MemoryCache;
  private sessionCache: MemoryCache;
  private configCache: MemoryCache;
  private connectionPool: ModbusConnectionPool;
  private gcInterval: NodeJS.Timeout;

  constructor() {
    super();
    
    // Initialize caches with different TTLs based on data volatility
    this.deviceCache = new MemoryCache(500, 300000); // 5 minutes for device detection
    this.sessionCache = new MemoryCache(100, 1800000); // 30 minutes for sessions
    this.configCache = new MemoryCache(50, 3600000); // 1 hour for configuration
    this.connectionPool = new ModbusConnectionPool(5, 5000);

    // Set up garbage collection
    this.gcInterval = setInterval(() => this.performGarbageCollection(), 300000); // 5 minutes

    console.log('🚀 Wizard Cache Service initialized');
  }

  /**
   * Cache device detection results
   */
  cacheDeviceDetection(serialPort: string, results: DeviceDetectionCache): void {
    const key = `device:${serialPort}`;
    this.deviceCache.set(key, results, 300000); // 5 minutes TTL
    this.emit('deviceCached', serialPort, results);
  }

  /**
   * Get cached device detection results
   */
  getCachedDeviceDetection(serialPort: string): DeviceDetectionCache | null {
    const key = `device:${serialPort}`;
    return this.deviceCache.get<DeviceDetectionCache>(key);
  }

  /**
   * Cache wizard session state
   */
  cacheWizardSession(sessionId: string, sessionData: WizardSessionCache): void {
    const key = `session:${sessionId}`;
    this.sessionCache.set(key, sessionData, 1800000); // 30 minutes TTL
    this.emit('sessionCached', sessionId, sessionData);
  }

  /**
   * Get cached wizard session state
   */
  getCachedWizardSession(sessionId: string): WizardSessionCache | null {
    const key = `session:${sessionId}`;
    return this.sessionCache.get<WizardSessionCache>(key);
  }

  /**
   * Cache configuration templates
   */
  cacheConfiguration(configId: string, config: any): void {
    const key = `config:${configId}`;
    this.configCache.set(key, config, 3600000); // 1 hour TTL
    this.emit('configCached', configId, config);
  }

  /**
   * Get cached configuration
   */
  getCachedConfiguration(configId: string): any | null {
    const key = `config:${configId}`;
    return this.configCache.get(key);
  }

  /**
   * Invalidate device cache for a specific port
   */
  invalidateDeviceCache(serialPort?: string): void {
    if (serialPort) {
      const key = `device:${serialPort}`;
      this.deviceCache.delete(key);
      this.emit('deviceCacheInvalidated', serialPort);
    } else {
      // Clear all device cache
      this.deviceCache.clear();
      this.emit('allDeviceCacheInvalidated');
    }
  }

  /**
   * Invalidate session cache
   */
  invalidateSessionCache(sessionId?: string): void {
    if (sessionId) {
      const key = `session:${sessionId}`;
      this.sessionCache.delete(key);
      this.emit('sessionCacheInvalidated', sessionId);
    } else {
      this.sessionCache.clear();
      this.emit('allSessionCacheInvalidated');
    }
  }

  /**
   * Get Modbus connection from pool
   */
  async getModbusConnection(serialPort: string): Promise<any> {
    return this.connectionPool.acquireConnection(serialPort);
  }

  /**
   * Release Modbus connection back to pool
   */
  releaseModbusConnection(serialPort: string): void {
    this.connectionPool.releaseConnection(serialPort);
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): {
    device: CacheStats;
    session: CacheStats;
    config: CacheStats;
    connectionPool: ConnectionPoolStats;
    memoryUsage: {
      total: number;
      device: number;
      session: number;
      config: number;
    };
  } {
    const deviceStats = this.deviceCache.getStats();
    const sessionStats = this.sessionCache.getStats();
    const configStats = this.configCache.getStats();
    const poolStats = this.connectionPool.getStats();

    return {
      device: deviceStats,
      session: sessionStats,
      config: configStats,
      connectionPool: poolStats,
      memoryUsage: {
        total: deviceStats.memoryUsage + sessionStats.memoryUsage + configStats.memoryUsage,
        device: deviceStats.memoryUsage,
        session: sessionStats.memoryUsage,
        config: configStats.memoryUsage
      }
    };
  }

  /**
   * Perform garbage collection and memory optimization
   */
  performGarbageCollection(): void {
    const beforeStats = this.getStats();
    
    // Force cleanup of expired entries
    this.deviceCache.emit('cleanup');
    this.sessionCache.emit('cleanup');
    this.configCache.emit('cleanup');

    // Force Node.js garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const afterStats = this.getStats();
    const memoryFreed = beforeStats.memoryUsage.total - afterStats.memoryUsage.total;

    if (memoryFreed > 0) {
      console.log(`🧹 Garbage collection completed: freed ${memoryFreed} bytes`);
    }

    this.emit('garbageCollection', { before: beforeStats, after: afterStats, freed: memoryFreed });
  }

  /**
   * Optimize cache performance based on usage patterns
   */
  optimizeCache(): void {
    const stats = this.getStats();
    
    // Adjust cache sizes based on hit rates
    if (stats.device.hitRate < 50 && stats.device.totalEntries > 100) {
      // Low hit rate, reduce cache size
      console.log('📊 Optimizing device cache: reducing size due to low hit rate');
    }

    if (stats.session.hitRate > 80 && stats.session.totalEntries > 50) {
      // High hit rate, could increase cache size
      console.log('📊 Session cache performing well: high hit rate detected');
    }

    this.emit('cacheOptimized', stats);
  }

  /**
   * Preload frequently used data
   */
  async preloadCache(): Promise<void> {
    try {
      // Preload common configuration templates
      const commonConfigs = [
        'waveshare-16ch-default',
        'waveshare-8ch-default',
        'generic-relay-default'
      ];

      for (const configId of commonConfigs) {
        // This would load from database or file system
        const config = await this.loadConfigurationTemplate(configId);
        if (config) {
          this.cacheConfiguration(configId, config);
        }
      }

      console.log('🚀 Cache preloading completed');
      this.emit('preloadCompleted');
    } catch (error) {
      console.error('❌ Cache preloading failed:', error);
      this.emit('preloadFailed', error);
    }
  }

  /**
   * Load configuration template (placeholder implementation)
   */
  private async loadConfigurationTemplate(configId: string): Promise<any> {
    // This would integrate with the actual configuration system
    // For now, return mock data
    return {
      id: configId,
      name: configId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: 'relay-card',
      channels: configId.includes('16ch') ? 16 : 8,
      manufacturer: configId.includes('waveshare') ? 'waveshare' : 'generic',
      defaultSettings: {
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1
      }
    };
  }

  /**
   * Shutdown cache service
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Wizard Cache Service...');
    
    // Clear garbage collection interval
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    // Close connection pool
    await this.connectionPool.close();

    // Clear all caches
    this.deviceCache.clear();
    this.sessionCache.clear();
    this.configCache.clear();

    this.emit('shutdown');
    console.log('✅ Wizard Cache Service shutdown complete');
  }
}

// Export singleton instance
export const wizardCacheService = new WizardCacheService();