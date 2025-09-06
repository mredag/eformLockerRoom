import { getConfigurationManager, ConfigurationManager } from './configuration-manager';
import { DatabaseConnection } from '../database/connection';

export interface FeatureFlags {
  smartAssignmentEnabled: boolean;
  allowReclaimDuringQuarantine: boolean;
}

export class FeatureFlagService {
  private configManager: ConfigurationManager;
  private flagCache: Map<string, FeatureFlags> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL_MS = 1000; // 1 second cache TTL for fast response

  constructor(db?: DatabaseConnection) {
    this.configManager = getConfigurationManager(db);
    this.setupConfigChangeListener();
  }

  /**
   * Setup listener for configuration changes to invalidate cache
   */
  private setupConfigChangeListener(): void {
    this.configManager.on('config_changed', () => {
      this.flagCache.clear();
      this.lastCacheUpdate = 0;
      console.log('🚩 Feature flag cache cleared due to config change');
    });
  }

  /**
   * Get feature flags for a specific kiosk
   */
  async getFeatureFlags(kioskId: string): Promise<FeatureFlags> {
    const now = Date.now();
    
    // Check cache first
    if (this.flagCache.has(kioskId) && (now - this.lastCacheUpdate) < this.CACHE_TTL_MS) {
      return this.flagCache.get(kioskId)!;
    }

    // Load from configuration
    const config = await this.configManager.getEffectiveConfig(kioskId);
    
    const flags: FeatureFlags = {
      smartAssignmentEnabled: config.smart_assignment_enabled || false,
      allowReclaimDuringQuarantine: config.allow_reclaim_during_quarantine || false
    };

    // Update cache
    this.flagCache.set(kioskId, flags);
    this.lastCacheUpdate = now;

    return flags;
  }

  /**
   * Check if smart assignment is enabled for a kiosk
   */
  async isSmartAssignmentEnabled(kioskId: string): Promise<boolean> {
    const flags = await this.getFeatureFlags(kioskId);
    return flags.smartAssignmentEnabled;
  }

  /**
   * Check if reclaim during quarantine is allowed
   */
  async isReclaimDuringQuarantineAllowed(kioskId: string): Promise<boolean> {
    const flags = await this.getFeatureFlags(kioskId);
    return flags.allowReclaimDuringQuarantine;
  }

  /**
   * Enable smart assignment for a kiosk (global or kiosk-specific)
   */
  async enableSmartAssignment(kioskId?: string, updatedBy: string = 'system'): Promise<void> {
    if (kioskId) {
      await this.configManager.setKioskOverride(kioskId, 'smart_assignment_enabled', true, updatedBy);
      console.log(`Smart assignment enabled for kiosk ${kioskId} by ${updatedBy}`);
    } else {
      await this.configManager.updateGlobalConfig({ smart_assignment_enabled: true }, updatedBy);
      console.log(`Smart assignment enabled globally by ${updatedBy}`);
    }

    // Clear cache to force reload
    this.flagCache.clear();
    this.lastCacheUpdate = 0;
    
    // Wait a moment for the configuration to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Disable smart assignment for a kiosk (global or kiosk-specific)
   */
  async disableSmartAssignment(kioskId?: string, updatedBy: string = 'system'): Promise<void> {
    if (kioskId) {
      await this.configManager.setKioskOverride(kioskId, 'smart_assignment_enabled', false, updatedBy);
      console.log(`Smart assignment disabled for kiosk ${kioskId} by ${updatedBy}`);
    } else {
      await this.configManager.updateGlobalConfig({ smart_assignment_enabled: false }, updatedBy);
      console.log(`Smart assignment disabled globally by ${updatedBy}`);
    }

    // Clear cache to force reload
    this.flagCache.clear();
    this.lastCacheUpdate = 0;
    
    // Wait a moment for the configuration to propagate
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Toggle smart assignment for a kiosk
   */
  async toggleSmartAssignment(kioskId: string, updatedBy: string = 'system'): Promise<boolean> {
    const currentlyEnabled = await this.isSmartAssignmentEnabled(kioskId);
    
    if (currentlyEnabled) {
      await this.disableSmartAssignment(kioskId, updatedBy);
      return false;
    } else {
      await this.enableSmartAssignment(kioskId, updatedBy);
      return true;
    }
  }

  /**
   * Get feature flag status for all kiosks
   */
  async getAllKioskFlags(): Promise<{ [kioskId: string]: FeatureFlags }> {
    // Get all kiosk IDs that have overrides
    const overrides = await this.configManager.getDatabase().all<{ kiosk_id: string }>(
      'SELECT DISTINCT kiosk_id FROM settings_kiosk WHERE key = ?',
      ['smart_assignment_enabled']
    );

    const result: { [kioskId: string]: FeatureFlags } = {};

    // Get flags for kiosks with overrides
    for (const override of overrides) {
      result[override.kiosk_id] = await this.getFeatureFlags(override.kiosk_id);
    }

    // Add global default for reference
    const globalConfig = await this.configManager.getGlobalConfig();
    result['_global'] = {
      smartAssignmentEnabled: globalConfig.smart_assignment_enabled || false,
      allowReclaimDuringQuarantine: globalConfig.allow_reclaim_during_quarantine || false
    };

    return result;
  }

  /**
   * Validate feature flag configuration
   */
  validateFeatureFlags(flags: Partial<FeatureFlags>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (flags.smartAssignmentEnabled !== undefined && typeof flags.smartAssignmentEnabled !== 'boolean') {
      errors.push('smartAssignmentEnabled must be a boolean');
    }

    if (flags.allowReclaimDuringQuarantine !== undefined && typeof flags.allowReclaimDuringQuarantine !== 'boolean') {
      errors.push('allowReclaimDuringQuarantine must be a boolean');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get feature flag change history
   */
  async getFeatureFlagHistory(kioskId?: string, limit: number = 50): Promise<any[]> {
    return await this.configManager.getConfigHistory(
      kioskId, 
      'smart_assignment_enabled', 
      limit
    );
  }

  /**
   * Test feature flag switching (for validation)
   */
  async testFeatureFlagSwitching(kioskId: string): Promise<{ success: boolean; logs: string[] }> {
    const logs: string[] = [];
    
    try {
      // Get initial state
      const initialState = await this.isSmartAssignmentEnabled(kioskId);
      logs.push(`Initial state: ${initialState ? 'enabled' : 'disabled'}`);

      // Toggle to opposite state
      const newState = await this.toggleSmartAssignment(kioskId, 'test');
      logs.push(`Toggled to: ${newState ? 'enabled' : 'disabled'}`);

      // Verify the change took effect
      const verifyState = await this.isSmartAssignmentEnabled(kioskId);
      logs.push(`Verified state: ${verifyState ? 'enabled' : 'disabled'}`);

      if (verifyState !== newState) {
        logs.push('❌ State verification failed');
        return { success: false, logs };
      }

      // Toggle back to original state
      await this.toggleSmartAssignment(kioskId, 'test');
      const finalState = await this.isSmartAssignmentEnabled(kioskId);
      logs.push(`Restored to: ${finalState ? 'enabled' : 'disabled'}`);

      if (finalState !== initialState) {
        logs.push('❌ State restoration failed');
        return { success: false, logs };
      }

      logs.push('✅ Feature flag switching test passed');
      return { success: true, logs };

    } catch (error) {
      logs.push(`❌ Test failed with error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, logs };
    }
  }

  /**
   * Initialize feature flag service
   */
  async initialize(): Promise<void> {
    console.log('🚩 Initializing Feature Flag Service...');
    
    // Initialize configuration manager
    await this.configManager.initialize();
    
    // Load initial flags for logging
    const globalConfig = await this.configManager.getGlobalConfig();
    console.log(`🎯 Smart assignment globally ${globalConfig.smart_assignment_enabled ? 'enabled' : 'disabled'}`);
    
    console.log('✅ Feature Flag Service initialized');
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.flagCache.clear();
    this.configManager.removeAllListeners();
  }
}

// Singleton instance
let featureFlagService: FeatureFlagService | null = null;

export function getFeatureFlagService(db?: DatabaseConnection): FeatureFlagService {
  if (!featureFlagService) {
    featureFlagService = new FeatureFlagService(db);
  }
  return featureFlagService;
}

export function resetFeatureFlagService(): void {
  if (featureFlagService) {
    featureFlagService.destroy();
    featureFlagService = null;
  }
}