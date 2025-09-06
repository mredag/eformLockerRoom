/**
 * Feature Flag Cache Service
 * 
 * Caches last-known feature flag values to prevent fallback to manual mode
 * when flag check fails. If last-known smart assignment is ON, never render locker grid.
 */

export interface CachedFeatureFlags {
  smartAssignmentEnabled: boolean;
  lastUpdated: number;
  kioskId: string;
}

export class FeatureFlagCache {
  private cache: Map<string, CachedFeatureFlags> = new Map();
  private readonly CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly STORAGE_KEY = 'kiosk_feature_flags';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Get cached feature flag value with fallback logic
   */
  getCachedSmartAssignment(kioskId: string): boolean | null {
    const cached = this.cache.get(kioskId);
    
    if (!cached) {
      return null; // No cached value
    }

    // Always return cached value, even if expired
    // This prevents fallback to manual mode when network fails
    return cached.smartAssignmentEnabled;
  }

  /**
   * Update cache with new feature flag value
   */
  updateSmartAssignment(kioskId: string, enabled: boolean): void {
    const cached: CachedFeatureFlags = {
      smartAssignmentEnabled: enabled,
      lastUpdated: Date.now(),
      kioskId
    };

    this.cache.set(kioskId, cached);
    this.saveToStorage();
    
    console.log(`🚩 Feature flag cached: kiosk=${kioskId}, smart_assignment=${enabled}`);
  }

  /**
   * Check if cached value is fresh (within expiry time)
   */
  isCacheFresh(kioskId: string): boolean {
    const cached = this.cache.get(kioskId);
    
    if (!cached) {
      return false;
    }

    return (Date.now() - cached.lastUpdated) < this.CACHE_EXPIRY_MS;
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(kioskId: string): {
    hasCached: boolean;
    isFresh: boolean;
    value: boolean | null;
    lastUpdated: number | null;
  } {
    const cached = this.cache.get(kioskId);
    
    return {
      hasCached: !!cached,
      isFresh: this.isCacheFresh(kioskId),
      value: cached?.smartAssignmentEnabled ?? null,
      lastUpdated: cached?.lastUpdated ?? null
    };
  }

  /**
   * Clear cache for a specific kiosk
   */
  clearCache(kioskId: string): void {
    this.cache.delete(kioskId);
    this.saveToStorage();
    console.log(`🚩 Feature flag cache cleared for kiosk: ${kioskId}`);
  }

  /**
   * Clear all cached flags
   */
  clearAllCache(): void {
    this.cache.clear();
    this.saveToStorage();
    console.log('🚩 All feature flag cache cleared');
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Restore cache from stored data
        Object.entries(data).forEach(([kioskId, cached]) => {
          this.cache.set(kioskId, cached as CachedFeatureFlags);
        });
        
        console.log(`🚩 Feature flag cache loaded: ${this.cache.size} entries`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to load feature flag cache from storage:', error);
    }
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    try {
      const data: Record<string, CachedFeatureFlags> = {};
      
      this.cache.forEach((cached, kioskId) => {
        data[kioskId] = cached;
      });
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('⚠️ Failed to save feature flag cache to storage:', error);
    }
  }
}

// Singleton instance
let featureFlagCache: FeatureFlagCache | null = null;

export function getFeatureFlagCache(): FeatureFlagCache {
  if (!featureFlagCache) {
    featureFlagCache = new FeatureFlagCache();
  }
  return featureFlagCache;
}