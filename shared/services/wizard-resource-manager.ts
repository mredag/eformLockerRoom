/**
 * Hardware Configuration Wizard - Resource Management Service
 * 
 * Implements intelligent resource management, memory optimization, and lazy loading
 * for wizard components and operations.
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import { EventEmitter } from 'events';

export interface ResourcePool<T> {
  acquire(): Promise<T>;
  release(resource: T): void;
  size(): number;
  available(): number;
  stats(): ResourcePoolStats;
}

export interface ResourcePoolStats {
  totalResources: number;
  activeResources: number;
  availableResources: number;
  waitingRequests: number;
  averageAcquisitionTime: number;
  totalAcquisitions: number;
  totalReleases: number;
}

export interface LazyLoadableComponent {
  id: string;
  loaded: boolean;
  loadPromise?: Promise<any>;
  component?: any;
  dependencies?: string[];
  priority: 'low' | 'medium' | 'high';
  estimatedSize: number; // bytes
}

export interface MemoryOptimizationConfig {
  maxHeapSize: number; // bytes
  gcThreshold: number; // percentage
  componentCacheSize: number;
  preloadThreshold: number; // percentage
  aggressiveCleanup: boolean;
}

export interface ResourceUsageReport {
  timestamp: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentage: number;
  };
  componentStats: {
    totalComponents: number;
    loadedComponents: number;
    cachedComponents: number;
    estimatedMemoryUsage: number;
  };
  poolStats: {
    [poolName: string]: ResourcePoolStats;
  };
  recommendations: string[];
}

/**
 * Generic resource pool implementation
 */
export class GenericResourcePool<T> extends EventEmitter implements ResourcePool<T> {
  private resources: T[] = [];
  private activeResources = new Set<T>();
  private waitingQueue: Array<{ resolve: Function; reject: Function; timestamp: number }> = [];
  private factory: () => Promise<T>;
  private destroyer?: (resource: T) => Promise<void>;
  private validator?: (resource: T) => boolean;
  private maxSize: number;
  private minSize: number;
  private acquisitionTimeout: number;
  
  private stats = {
    totalAcquisitions: 0,
    totalReleases: 0,
    totalAcquisitionTime: 0,
    createdResources: 0,
    destroyedResources: 0
  };

  constructor(
    factory: () => Promise<T>,
    options: {
      maxSize?: number;
      minSize?: number;
      acquisitionTimeout?: number;
      destroyer?: (resource: T) => Promise<void>;
      validator?: (resource: T) => boolean;
    } = {}
  ) {
    super();
    this.factory = factory;
    this.destroyer = options.destroyer;
    this.validator = options.validator;
    this.maxSize = options.maxSize || 10;
    this.minSize = options.minSize || 1;
    this.acquisitionTimeout = options.acquisitionTimeout || 30000;
    
    // Initialize minimum resources
    this.initializePool();
  }

  /**
   * Acquire a resource from the pool
   */
  async acquire(): Promise<T> {
    const startTime = Date.now();
    this.stats.totalAcquisitions++;

    return new Promise((resolve, reject) => {
      // Check for available resource
      const availableResource = this.getAvailableResource();
      if (availableResource) {
        this.activeResources.add(availableResource);
        this.recordAcquisitionTime(startTime);
        resolve(availableResource);
        return;
      }

      // Check if we can create a new resource
      if (this.resources.length < this.maxSize) {
        this.createResource()
          .then(resource => {
            this.resources.push(resource);
            this.activeResources.add(resource);
            this.recordAcquisitionTime(startTime);
            resolve(resource);
          })
          .catch(reject);
        return;
      }

      // Add to waiting queue
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
          reject(new Error('Resource acquisition timeout'));
        }
      }, this.acquisitionTimeout);

      this.waitingQueue.push({
        resolve: (resource: T) => {
          clearTimeout(timeout);
          this.recordAcquisitionTime(startTime);
          resolve(resource);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: startTime
      });
    });
  }

  /**
   * Release a resource back to the pool
   */
  release(resource: T): void {
    if (!this.activeResources.has(resource)) {
      console.warn('⚠️ Attempting to release resource not in active set');
      return;
    }

    this.activeResources.delete(resource);
    this.stats.totalReleases++;

    // Validate resource before returning to pool
    if (this.validator && !this.validator(resource)) {
      this.destroyResource(resource);
      return;
    }

    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const waiting = this.waitingQueue.shift();
      if (waiting) {
        this.activeResources.add(resource);
        waiting.resolve(resource);
        return;
      }
    }

    this.emit('release', resource);
  }

  /**
   * Get pool size
   */
  size(): number {
    return this.resources.length;
  }

  /**
   * Get available resources count
   */
  available(): number {
    return this.resources.length - this.activeResources.size;
  }

  /**
   * Get pool statistics
   */
  stats(): ResourcePoolStats {
    return {
      totalResources: this.resources.length,
      activeResources: this.activeResources.size,
      availableResources: this.available(),
      waitingRequests: this.waitingQueue.length,
      averageAcquisitionTime: this.stats.totalAcquisitions > 0 ? 
        this.stats.totalAcquisitionTime / this.stats.totalAcquisitions : 0,
      totalAcquisitions: this.stats.totalAcquisitions,
      totalReleases: this.stats.totalReleases
    };
  }

  /**
   * Initialize pool with minimum resources
   */
  private async initializePool(): Promise<void> {
    const promises = [];
    for (let i = 0; i < this.minSize; i++) {
      promises.push(this.createResource());
    }

    try {
      const resources = await Promise.all(promises);
      this.resources.push(...resources);
      this.emit('initialized', this.resources.length);
    } catch (error) {
      console.error('Error initializing resource pool:', error);
      this.emit('error', error);
    }
  }

  /**
   * Get an available resource
   */
  private getAvailableResource(): T | null {
    for (const resource of this.resources) {
      if (!this.activeResources.has(resource)) {
        return resource;
      }
    }
    return null;
  }

  /**
   * Create a new resource
   */
  private async createResource(): Promise<T> {
    try {
      const resource = await this.factory();
      this.stats.createdResources++;
      this.emit('create', resource);
      return resource;
    } catch (error) {
      this.emit('createError', error);
      throw error;
    }
  }

  /**
   * Destroy a resource
   */
  private async destroyResource(resource: T): Promise<void> {
    try {
      const index = this.resources.indexOf(resource);
      if (index !== -1) {
        this.resources.splice(index, 1);
      }

      if (this.destroyer) {
        await this.destroyer(resource);
      }

      this.stats.destroyedResources++;
      this.emit('destroy', resource);
    } catch (error) {
      console.error('Error destroying resource:', error);
      this.emit('destroyError', error);
    }
  }

  /**
   * Record acquisition time for statistics
   */
  private recordAcquisitionTime(startTime: number): void {
    this.stats.totalAcquisitionTime += Date.now() - startTime;
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    // Clear waiting queue
    this.waitingQueue.forEach(waiting => {
      waiting.reject(new Error('Resource pool shutting down'));
    });
    this.waitingQueue.length = 0;

    // Destroy all resources
    const destroyPromises = this.resources.map(resource => this.destroyResource(resource));
    await Promise.all(destroyPromises);

    this.resources.length = 0;
    this.activeResources.clear();
    this.emit('shutdown');
  }
}

/**
 * Lazy loading component manager
 */
export class LazyComponentManager extends EventEmitter {
  private components = new Map<string, LazyLoadableComponent>();
  private loadingPromises = new Map<string, Promise<any>>();
  private dependencyGraph = new Map<string, Set<string>>();
  private loadOrder: string[] = [];
  private maxCacheSize: number;
  private preloadThreshold: number;

  constructor(maxCacheSize: number = 50, preloadThreshold: number = 0.7) {
    super();
    this.maxCacheSize = maxCacheSize;
    this.preloadThreshold = preloadThreshold;
  }

  /**
   * Register a lazy loadable component
   */
  register(
    id: string,
    loader: () => Promise<any>,
    options: {
      dependencies?: string[];
      priority?: 'low' | 'medium' | 'high';
      estimatedSize?: number;
    } = {}
  ): void {
    const component: LazyLoadableComponent = {
      id,
      loaded: false,
      dependencies: options.dependencies || [],
      priority: options.priority || 'medium',
      estimatedSize: options.estimatedSize || 1024 // 1KB default
    };

    this.components.set(id, component);

    // Build dependency graph
    if (component.dependencies.length > 0) {
      this.dependencyGraph.set(id, new Set(component.dependencies));
    }

    // Store loader function
    this.loadingPromises.set(id, Promise.resolve().then(loader));

    this.emit('registered', component);
  }

  /**
   * Load a component and its dependencies
   */
  async load(id: string): Promise<any> {
    const component = this.components.get(id);
    if (!component) {
      throw new Error(`Component ${id} not registered`);
    }

    if (component.loaded && component.component) {
      return component.component;
    }

    // Load dependencies first
    if (component.dependencies.length > 0) {
      await this.loadDependencies(component.dependencies);
    }

    // Load the component
    const loadPromise = this.loadingPromises.get(id);
    if (!loadPromise) {
      throw new Error(`No loader found for component ${id}`);
    }

    try {
      const loadedComponent = await loadPromise;
      component.component = loadedComponent;
      component.loaded = true;
      component.loadPromise = undefined;

      this.loadOrder.push(id);
      this.emit('loaded', component);

      // Check if we need to evict components
      await this.checkCacheSize();

      return loadedComponent;
    } catch (error) {
      this.emit('loadError', id, error);
      throw error;
    }
  }

  /**
   * Preload high-priority components
   */
  async preload(): Promise<void> {
    const highPriorityComponents = Array.from(this.components.values())
      .filter(c => c.priority === 'high' && !c.loaded)
      .sort((a, b) => a.estimatedSize - b.estimatedSize); // Load smaller components first

    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    if (memoryUsagePercent < this.preloadThreshold * 100) {
      console.log(`🚀 Preloading ${highPriorityComponents.length} high-priority components`);
      
      const preloadPromises = highPriorityComponents.map(c => 
        this.load(c.id).catch(error => {
          console.warn(`⚠️ Failed to preload component ${c.id}:`, error);
        })
      );

      await Promise.all(preloadPromises);
      this.emit('preloadCompleted', highPriorityComponents.length);
    }
  }

  /**
   * Unload a component to free memory
   */
  unload(id: string): void {
    const component = this.components.get(id);
    if (!component || !component.loaded) {
      return;
    }

    component.component = undefined;
    component.loaded = false;

    // Remove from load order
    const index = this.loadOrder.indexOf(id);
    if (index !== -1) {
      this.loadOrder.splice(index, 1);
    }

    this.emit('unloaded', component);
  }

  /**
   * Get component loading statistics
   */
  getStats(): {
    totalComponents: number;
    loadedComponents: number;
    estimatedMemoryUsage: number;
    loadOrder: string[];
  } {
    const loadedComponents = Array.from(this.components.values()).filter(c => c.loaded);
    const estimatedMemoryUsage = loadedComponents.reduce((total, c) => total + c.estimatedSize, 0);

    return {
      totalComponents: this.components.size,
      loadedComponents: loadedComponents.length,
      estimatedMemoryUsage,
      loadOrder: [...this.loadOrder]
    };
  }

  /**
   * Load component dependencies
   */
  private async loadDependencies(dependencies: string[]): Promise<void> {
    const loadPromises = dependencies.map(depId => this.load(depId));
    await Promise.all(loadPromises);
  }

  /**
   * Check cache size and evict if necessary
   */
  private async checkCacheSize(): Promise<void> {
    const loadedComponents = Array.from(this.components.values()).filter(c => c.loaded);
    
    if (loadedComponents.length > this.maxCacheSize) {
      // Evict least recently used components (low priority first)
      const sortedComponents = loadedComponents
        .sort((a, b) => {
          // Sort by priority (low first), then by load order (oldest first)
          const priorityOrder = { low: 0, medium: 1, high: 2 };
          const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
          if (priorityDiff !== 0) return priorityDiff;
          
          return this.loadOrder.indexOf(a.id) - this.loadOrder.indexOf(b.id);
        });

      const toEvict = sortedComponents.slice(0, loadedComponents.length - this.maxCacheSize);
      toEvict.forEach(component => this.unload(component.id));

      console.log(`🧹 Evicted ${toEvict.length} components from cache`);
    }
  }
}

/**
 * Main resource manager service
 */
export class WizardResourceManager extends EventEmitter {
  private componentManager: LazyComponentManager;
  private resourcePools = new Map<string, ResourcePool<any>>();
  private config: MemoryOptimizationConfig;
  private monitoringInterval: NodeJS.Timeout;
  private gcInterval: NodeJS.Timeout;

  constructor(config: Partial<MemoryOptimizationConfig> = {}) {
    super();
    
    this.config = {
      maxHeapSize: config.maxHeapSize || 512 * 1024 * 1024, // 512MB
      gcThreshold: config.gcThreshold || 80, // 80%
      componentCacheSize: config.componentCacheSize || 50,
      preloadThreshold: config.preloadThreshold || 0.7, // 70%
      aggressiveCleanup: config.aggressiveCleanup || false
    };

    this.componentManager = new LazyComponentManager(
      this.config.componentCacheSize,
      this.config.preloadThreshold
    );

    // Start monitoring
    this.monitoringInterval = setInterval(() => this.monitorResources(), 30000); // Every 30 seconds
    this.gcInterval = setInterval(() => this.performGarbageCollection(), 60000); // Every minute

    console.log('🎯 Wizard Resource Manager initialized');
  }

  /**
   * Register a resource pool
   */
  registerResourcePool<T>(
    name: string,
    factory: () => Promise<T>,
    options: {
      maxSize?: number;
      minSize?: number;
      destroyer?: (resource: T) => Promise<void>;
      validator?: (resource: T) => boolean;
    } = {}
  ): ResourcePool<T> {
    const pool = new GenericResourcePool(factory, options);
    this.resourcePools.set(name, pool);
    this.emit('poolRegistered', name, pool);
    return pool;
  }

  /**
   * Get a resource pool
   */
  getResourcePool<T>(name: string): ResourcePool<T> | undefined {
    return this.resourcePools.get(name) as ResourcePool<T>;
  }

  /**
   * Register a lazy loadable component
   */
  registerComponent(
    id: string,
    loader: () => Promise<any>,
    options: {
      dependencies?: string[];
      priority?: 'low' | 'medium' | 'high';
      estimatedSize?: number;
    } = {}
  ): void {
    this.componentManager.register(id, loader, options);
  }

  /**
   * Load a component
   */
  async loadComponent(id: string): Promise<any> {
    return this.componentManager.load(id);
  }

  /**
   * Preload high-priority components
   */
  async preloadComponents(): Promise<void> {
    await this.componentManager.preload();
  }

  /**
   * Generate resource usage report
   */
  generateUsageReport(): ResourceUsageReport {
    const memoryUsage = process.memoryUsage();
    const componentStats = this.componentManager.getStats();
    
    const poolStats: { [poolName: string]: ResourcePoolStats } = {};
    for (const [name, pool] of this.resourcePools.entries()) {
      poolStats[name] = pool.stats();
    }

    const recommendations: string[] = [];
    
    // Memory usage recommendations
    const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    if (memoryPercentage > this.config.gcThreshold) {
      recommendations.push('Consider running garbage collection - memory usage is high');
    }
    
    if (componentStats.loadedComponents > this.config.componentCacheSize * 0.8) {
      recommendations.push('Component cache is near capacity - consider unloading unused components');
    }

    // Pool recommendations
    for (const [name, stats] of Object.entries(poolStats)) {
      if (stats.waitingRequests > 0) {
        recommendations.push(`Resource pool '${name}' has waiting requests - consider increasing pool size`);
      }
      if (stats.averageAcquisitionTime > 1000) {
        recommendations.push(`Resource pool '${name}' has high acquisition time - check resource creation performance`);
      }
    }

    return {
      timestamp: Date.now(),
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        percentage: memoryPercentage
      },
      componentStats: {
        totalComponents: componentStats.totalComponents,
        loadedComponents: componentStats.loadedComponents,
        cachedComponents: componentStats.loadedComponents,
        estimatedMemoryUsage: componentStats.estimatedMemoryUsage
      },
      poolStats,
      recommendations
    };
  }

  /**
   * Monitor resource usage
   */
  private monitorResources(): void {
    const report = this.generateUsageReport();
    
    // Check if we need to take action
    if (report.memoryUsage.percentage > this.config.gcThreshold) {
      console.warn(`⚠️ High memory usage: ${report.memoryUsage.percentage.toFixed(1)}%`);
      this.emit('highMemoryUsage', report);
      
      if (this.config.aggressiveCleanup) {
        this.performAggressiveCleanup();
      }
    }

    this.emit('resourceReport', report);
  }

  /**
   * Perform garbage collection
   */
  private performGarbageCollection(): void {
    const beforeMemory = process.memoryUsage();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const afterMemory = process.memoryUsage();
    const memoryFreed = beforeMemory.heapUsed - afterMemory.heapUsed;

    if (memoryFreed > 0) {
      console.log(`🧹 Garbage collection freed ${(memoryFreed / 1024 / 1024).toFixed(2)}MB`);
    }

    this.emit('garbageCollection', { before: beforeMemory, after: afterMemory, freed: memoryFreed });
  }

  /**
   * Perform aggressive cleanup
   */
  private performAggressiveCleanup(): void {
    console.log('🧹 Performing aggressive cleanup...');
    
    // Unload low-priority components
    const componentStats = this.componentManager.getStats();
    const lowPriorityComponents = Array.from(this.componentManager['components'].values())
      .filter(c => c.loaded && c.priority === 'low');
    
    lowPriorityComponents.forEach(component => {
      this.componentManager.unload(component.id);
    });

    // Force garbage collection
    this.performGarbageCollection();

    this.emit('aggressiveCleanup', {
      unloadedComponents: lowPriorityComponents.length
    });
  }

  /**
   * Optimize resource usage
   */
  async optimize(): Promise<void> {
    console.log('🎯 Optimizing resource usage...');
    
    const report = this.generateUsageReport();
    
    // Preload components if memory usage is low
    if (report.memoryUsage.percentage < this.config.preloadThreshold * 100) {
      await this.preloadComponents();
    }

    // Cleanup if memory usage is high
    if (report.memoryUsage.percentage > this.config.gcThreshold) {
      this.performAggressiveCleanup();
    }

    this.emit('optimizationCompleted', report);
  }

  /**
   * Shutdown resource manager
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Wizard Resource Manager...');
    
    // Clear intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }

    // Shutdown all resource pools
    const shutdownPromises = Array.from(this.resourcePools.values()).map(pool => {
      if (typeof pool.shutdown === 'function') {
        return pool.shutdown();
      }
      return Promise.resolve();
    });

    await Promise.all(shutdownPromises);

    this.emit('shutdown');
    console.log('✅ Wizard Resource Manager shutdown complete');
  }
}

// Export singleton instance
export const wizardResourceManager = new WizardResourceManager();