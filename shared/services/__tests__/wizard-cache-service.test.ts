/**
 * Unit tests for Wizard Cache Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryCache, ModbusConnectionPool, WizardCacheService } from '../wizard-cache-service';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(5, 1000); // Small cache for testing
  });

  afterEach(() => {
    cache.clear();
  });

  it('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should respect TTL', async () => {
    cache.set('key1', 'value1', 100); // 100ms TTL
    expect(cache.get('key1')).toBe('value1');
    
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(cache.get('key1')).toBeNull();
  });

  it('should evict LRU when at capacity', () => {
    // Fill cache to capacity
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, `value${i}`);
    }

    // Access key0 to make it recently used
    cache.get('key0');

    // Add one more item to trigger eviction
    cache.set('key5', 'value5');

    // key1 should be evicted (least recently used)
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key0')).toBe('value0'); // Should still exist
    expect(cache.get('key5')).toBe('value5'); // New item should exist
  });

  it('should track hit and miss rates', () => {
    cache.set('key1', 'value1');
    
    cache.get('key1'); // hit
    cache.get('key2'); // miss
    cache.get('key1'); // hit
    cache.get('key3'); // miss

    const stats = cache.getStats();
    expect(stats.hitRate).toBe(50); // 2 hits out of 4 requests
    expect(stats.missRate).toBe(50); // 2 misses out of 4 requests
  });

  it('should estimate memory usage', () => {
    cache.set('key1', 'value1');
    cache.set('key2', { data: 'complex object' });
    
    const stats = cache.getStats();
    expect(stats.memoryUsage).toBeGreaterThan(0);
  });

  it('should emit events', () => {
    const setListener = vi.fn();
    const deleteListener = vi.fn();
    const clearListener = vi.fn();

    cache.on('set', setListener);
    cache.on('delete', deleteListener);
    cache.on('clear', clearListener);

    cache.set('key1', 'value1');
    cache.delete('key1');
    cache.clear();

    expect(setListener).toHaveBeenCalledWith('key1', 'value1');
    expect(deleteListener).toHaveBeenCalledWith('key1');
    expect(clearListener).toHaveBeenCalled();
  });
});

describe('ModbusConnectionPool', () => {
  let pool: ModbusConnectionPool;

  beforeEach(() => {
    pool = new ModbusConnectionPool(2, 1000); // Small pool for testing
  });

  afterEach(async () => {
    await pool.close();
  });

  it('should acquire and release connections', async () => {
    const connection1 = await pool.acquireConnection('/dev/ttyUSB0');
    expect(connection1).toBeDefined();
    expect(connection1.serialPort).toBe('/dev/ttyUSB0');

    const stats1 = pool.getStats();
    expect(stats1.activeConnections).toBe(1);
    expect(stats1.totalConnections).toBe(1);

    pool.releaseConnection('/dev/ttyUSB0');

    const stats2 = pool.getStats();
    expect(stats2.activeConnections).toBe(0);
    expect(stats2.idleConnections).toBe(1);
  });

  it('should reuse existing connections', async () => {
    const connection1 = await pool.acquireConnection('/dev/ttyUSB0');
    pool.releaseConnection('/dev/ttyUSB0');

    const connection2 = await pool.acquireConnection('/dev/ttyUSB0');
    expect(connection2).toBe(connection1); // Should be the same object
  });

  it('should handle multiple connections', async () => {
    const connection1 = await pool.acquireConnection('/dev/ttyUSB0');
    const connection2 = await pool.acquireConnection('/dev/ttyUSB1');

    const stats = pool.getStats();
    expect(stats.totalConnections).toBe(2);
    expect(stats.activeConnections).toBe(2);

    pool.releaseConnection('/dev/ttyUSB0');
    pool.releaseConnection('/dev/ttyUSB1');
  });

  it('should queue requests when at capacity', async () => {
    // Acquire all available connections
    const connection1 = await pool.acquireConnection('/dev/ttyUSB0');
    const connection2 = await pool.acquireConnection('/dev/ttyUSB1');

    // This should be queued
    const connection3Promise = pool.acquireConnection('/dev/ttyUSB2');

    const stats = pool.getStats();
    expect(stats.waitingRequests).toBe(1);

    // Release a connection to fulfill the queued request
    pool.releaseConnection('/dev/ttyUSB0');

    const connection3 = await connection3Promise;
    expect(connection3).toBeDefined();
  });

  it('should timeout queued requests', async () => {
    const shortTimeoutPool = new ModbusConnectionPool(1, 100); // 100ms timeout

    // Acquire the only connection
    await shortTimeoutPool.acquireConnection('/dev/ttyUSB0');

    // This should timeout
    await expect(shortTimeoutPool.acquireConnection('/dev/ttyUSB1'))
      .rejects.toThrow('Connection pool timeout');

    await shortTimeoutPool.close();
  });

  it('should track statistics', async () => {
    const connection = await pool.acquireConnection('/dev/ttyUSB0');
    pool.releaseConnection('/dev/ttyUSB0');

    const stats = pool.getStats();
    expect(stats.totalAcquisitions).toBe(1);
    expect(stats.totalReleases).toBe(1);
    expect(stats.averageResponseTime).toBeGreaterThanOrEqual(0);
  });
});

describe('WizardCacheService', () => {
  let cacheService: WizardCacheService;

  beforeEach(() => {
    cacheService = new WizardCacheService();
  });

  afterEach(async () => {
    await cacheService.shutdown();
  });

  it('should cache and retrieve device detection results', () => {
    const deviceResults = {
      serialPorts: [{ path: '/dev/ttyUSB0', available: true }],
      modbusDevices: [{ address: 1, type: 'waveshare' }],
      lastScan: Date.now(),
      scanDuration: 5000
    };

    cacheService.cacheDeviceDetection('/dev/ttyUSB0', deviceResults);
    const cached = cacheService.getCachedDeviceDetection('/dev/ttyUSB0');

    expect(cached).toEqual(deviceResults);
  });

  it('should cache and retrieve wizard session state', () => {
    const sessionData = {
      sessionId: 'session-123',
      currentStep: 2,
      cardData: { address: 1, type: 'waveshare' },
      validationResults: [],
      lastActivity: Date.now()
    };

    cacheService.cacheWizardSession('session-123', sessionData);
    const cached = cacheService.getCachedWizardSession('session-123');

    expect(cached).toEqual(sessionData);
  });

  it('should cache and retrieve configuration templates', () => {
    const config = {
      id: 'waveshare-16ch',
      channels: 16,
      type: 'relay-card'
    };

    cacheService.cacheConfiguration('waveshare-16ch', config);
    const cached = cacheService.getCachedConfiguration('waveshare-16ch');

    expect(cached).toEqual(config);
  });

  it('should invalidate device cache', () => {
    const deviceResults = {
      serialPorts: [],
      modbusDevices: [],
      lastScan: Date.now(),
      scanDuration: 1000
    };

    cacheService.cacheDeviceDetection('/dev/ttyUSB0', deviceResults);
    expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB0')).toEqual(deviceResults);

    cacheService.invalidateDeviceCache('/dev/ttyUSB0');
    expect(cacheService.getCachedDeviceDetection('/dev/ttyUSB0')).toBeNull();
  });

  it('should invalidate session cache', () => {
    const sessionData = {
      sessionId: 'session-123',
      currentStep: 1,
      cardData: {},
      validationResults: [],
      lastActivity: Date.now()
    };

    cacheService.cacheWizardSession('session-123', sessionData);
    expect(cacheService.getCachedWizardSession('session-123')).toEqual(sessionData);

    cacheService.invalidateSessionCache('session-123');
    expect(cacheService.getCachedWizardSession('session-123')).toBeNull();
  });

  it('should provide comprehensive statistics', () => {
    // Add some cached data
    cacheService.cacheDeviceDetection('/dev/ttyUSB0', {
      serialPorts: [],
      modbusDevices: [],
      lastScan: Date.now(),
      scanDuration: 1000
    });

    cacheService.cacheWizardSession('session-123', {
      sessionId: 'session-123',
      currentStep: 1,
      cardData: {},
      validationResults: [],
      lastActivity: Date.now()
    });

    const stats = cacheService.getStats();

    expect(stats.device.totalEntries).toBe(1);
    expect(stats.session.totalEntries).toBe(1);
    expect(stats.config.totalEntries).toBe(0);
    expect(stats.memoryUsage.total).toBeGreaterThan(0);
  });

  it('should emit events for cache operations', () => {
    const deviceCachedListener = vi.fn();
    const sessionCachedListener = vi.fn();

    cacheService.on('deviceCached', deviceCachedListener);
    cacheService.on('sessionCached', sessionCachedListener);

    const deviceResults = {
      serialPorts: [],
      modbusDevices: [],
      lastScan: Date.now(),
      scanDuration: 1000
    };

    const sessionData = {
      sessionId: 'session-123',
      currentStep: 1,
      cardData: {},
      validationResults: [],
      lastActivity: Date.now()
    };

    cacheService.cacheDeviceDetection('/dev/ttyUSB0', deviceResults);
    cacheService.cacheWizardSession('session-123', sessionData);

    expect(deviceCachedListener).toHaveBeenCalledWith('/dev/ttyUSB0', deviceResults);
    expect(sessionCachedListener).toHaveBeenCalledWith('session-123', sessionData);
  });

  it('should handle Modbus connection pooling', async () => {
    const connection = await cacheService.getModbusConnection('/dev/ttyUSB0');
    expect(connection).toBeDefined();
    expect(connection.serialPort).toBe('/dev/ttyUSB0');

    cacheService.releaseModbusConnection('/dev/ttyUSB0');
    // Should not throw
  });

  it('should perform garbage collection', () => {
    const gcListener = vi.fn();
    cacheService.on('garbageCollection', gcListener);

    cacheService.performGarbageCollection();

    expect(gcListener).toHaveBeenCalled();
  });

  it('should preload cache', async () => {
    const preloadListener = vi.fn();
    cacheService.on('preloadCompleted', preloadListener);

    await cacheService.preloadCache();

    expect(preloadListener).toHaveBeenCalled();
  });
});