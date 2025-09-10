/**
 * Zone Extension Service for the Eform Locker System
 * Handles automatic zone extension when hardware is added
 */

import { CompleteSystemConfig, ZoneConfig } from '../types/system-config';

/**
 * Result of zone synchronization operation
 */
export interface ZoneSyncResult {
  extended: boolean;
  affectedZone?: string;
  newRange?: [number, number];
  mergedRanges?: [number, number][];
  updatedRelayCards?: number[];
  error?: string;
}

/**
 * Service for managing automatic zone extensions
 */
export class ZoneExtensionService {
  /**
   * Synchronize zones with hardware configuration
   * Extends zones automatically when new hardware is detected
   * 
   * @param config - Current system configuration
   * @param totalLockers - Total number of lockers available from hardware
   * @returns Result of the sync operation
   */
  async syncZonesWithHardware(
    config: CompleteSystemConfig,
    totalLockers: number
  ): Promise<ZoneSyncResult> {
    try {
      // Return early if zones are disabled or not configured
      if (!config.features?.zones_enabled || !config.zones || config.zones.length === 0) {
        return { extended: false };
      }

      // Calculate the maximum locker covered by enabled zones
      const enabledZones = config.zones.filter(zone => zone.enabled);
      if (enabledZones.length === 0) {
        return { extended: false };
      }

      // First, rebalance zones to match actual hardware capacity per zone and overall
      const rebalanced = this.rebalanceZonesWithHardware(config, totalLockers);
      const zonesAfter = config.zones ?? [];
      const enabledAfter = zonesAfter.filter(z => z.enabled);
      const coveredMax = this.calculateCoveredMax(enabledAfter);

      // If zones already cover all lockers, no extension needed
      if (coveredMax >= totalLockers) {
        return { extended: false };
      }

      // Find the last enabled zone to extend
      const lastZone = enabledZones[enabledZones.length - 1];
      const newRange: [number, number] = [coveredMax + 1, totalLockers];

      // Create updated ranges by merging the new range
      const updatedRanges = this.mergeAdjacentRanges([...lastZone.ranges, newRange]);

      // Calculate required relay cards for the extended zone
      const lockersInExtendedZone = this.countLockersInRanges(updatedRanges);
      const requiredCards = Math.ceil(lockersInExtendedZone / 16);
      
      // Update the zone configuration
      lastZone.ranges = updatedRanges;
      
      // Update relay_cards if we need more cards
      const updatedRelayCards = this.updateRelayCardsForZone(lastZone, requiredCards, config);

      return {
        extended: true,
        affectedZone: lastZone.id,
        newRange,
        mergedRanges: updatedRanges,
        updatedRelayCards
      };

    } catch (error) {
      return {
        extended: false,
        error: error instanceof Error ? error.message : 'Unknown error during zone sync'
      };
    }
  }

  /**
   * Rebalance zone ranges to reflect current hardware capacity and total lockers.
   * Ensures:
   * - Each enabled zone covers at most (relay_cards.length * 16) lockers
   * - Zones are allocated sequentially from 1..totalLockers in configured order
   * - No overall coverage beyond totalLockers
   */
  private rebalanceZonesWithHardware(config: CompleteSystemConfig, totalLockers: number): boolean {
    let changed = false;
    const zones = config.zones ?? [];
    const enabledZones = zones.filter(z => z.enabled);
    if (enabledZones.length === 0) return false;

    let nextStart = 1;
    for (const zone of zones) {
      if (!zone.enabled) continue;

      const capacity = Math.max(0, (zone.relay_cards?.length || 0) * 16);
      const remaining = Math.max(0, totalLockers - (nextStart - 1));
      const assignCount = Math.min(capacity, remaining);

      let newRanges: [number, number][] = [];
      if (assignCount > 0) {
        const start = nextStart;
        const end = nextStart + assignCount - 1;
        newRanges = this.mergeAdjacentRanges([[start, end]]);
        nextStart = end + 1;
      } else {
        newRanges = [];
      }

      // Detect change
      const oldCount = this.countLockersInRanges(zone.ranges);
      const newCount = this.countLockersInRanges(newRanges);
      const oldRangesStr = JSON.stringify(zone.ranges);
      const newRangesStr = JSON.stringify(newRanges);
      if (oldRangesStr !== newRangesStr || oldCount !== newCount) {
        zone.ranges = newRanges;
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Calculate the maximum locker number covered by enabled zones
   * 
   * @param enabledZones - Array of enabled zone configurations
   * @returns Maximum locker number covered
   */
  private calculateCoveredMax(enabledZones: ZoneConfig[]): number {
    let maxCovered = 0;

    for (const zone of enabledZones) {
      for (const [start, end] of zone.ranges) {
        maxCovered = Math.max(maxCovered, end);
      }
    }

    return maxCovered;
  }

  /**
   * Merge adjacent ranges in a zone
   * For example: [[1, 16], [17, 32]] becomes [[1, 32]]
   * 
   * @param ranges - Array of ranges to merge
   * @returns Merged ranges array
   */
  private mergeAdjacentRanges(ranges: [number, number][]): [number, number][] {
    if (ranges.length <= 1) {
      return ranges;
    }

    // Sort ranges by start position
    const sortedRanges = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    let current = sortedRanges[0];

    for (let i = 1; i < sortedRanges.length; i++) {
      const next = sortedRanges[i];
      
      // Check if ranges are adjacent or overlapping
      if (current[1] + 1 >= next[0]) {
        // Merge ranges
        current = [current[0], Math.max(current[1], next[1])];
      } else {
        // Ranges are not adjacent, add current to merged and move to next
        merged.push(current);
        current = next;
      }
    }

    // Add the last range
    merged.push(current);

    return merged;
  }

  /**
   * Count total lockers in a set of ranges
   * 
   * @param ranges - Array of ranges to count
   * @returns Total number of lockers
   */
  private countLockersInRanges(ranges: [number, number][]): number {
    return ranges.reduce((total, [start, end]) => total + (end - start + 1), 0);
  }

  /**
   * Update relay cards for a zone based on required capacity
   * 
   * @param zone - Zone configuration to update
   * @param requiredCards - Number of relay cards required
   * @param config - Complete system configuration for available cards
   * @returns Updated relay cards array
   */
  private updateRelayCardsForZone(
    zone: ZoneConfig,
    requiredCards: number,
    config: CompleteSystemConfig
  ): number[] {
    // If we already have enough cards, return current configuration
    if (zone.relay_cards.length >= requiredCards) {
      return zone.relay_cards;
    }

    // Get available relay card addresses from hardware config
    const availableCards = config.hardware.relay_cards
      .filter(card => card.enabled)
      .map(card => card.slave_address)
      .sort((a, b) => a - b);

    // Find cards that are not already assigned to this zone
    const unassignedCards = availableCards.filter(cardId => !zone.relay_cards.includes(cardId));

    // Add cards until we have enough
    const updatedCards = [...zone.relay_cards];
    let cardsToAdd = requiredCards - zone.relay_cards.length;

    for (const cardId of unassignedCards) {
      if (cardsToAdd <= 0) break;
      
      // Check if this card is used by other zones
      const isUsedByOtherZone = config.zones?.some(otherZone => 
        otherZone.id !== zone.id && 
        otherZone.enabled && 
        otherZone.relay_cards.includes(cardId)
      );

      if (!isUsedByOtherZone) {
        updatedCards.push(cardId);
        cardsToAdd--;
      }
    }

    // Update the zone's relay_cards
    zone.relay_cards = updatedCards.sort((a, b) => a - b);

    return zone.relay_cards;
  }

  /**
   * Validate zone extension before applying
   * 
   * @param config - System configuration
   * @param totalLockers - Total lockers from hardware
   * @returns Validation result
   */
  validateZoneExtension(
    config: CompleteSystemConfig,
    totalLockers: number
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.features?.zones_enabled || !config.zones) {
      return { valid: true, errors, warnings };
    }

    const enabledZones = config.zones.filter(zone => zone.enabled);
    
    // Check if we have any enabled zones
    if (enabledZones.length === 0) {
      warnings.push('No enabled zones found for extension');
      return { valid: true, errors, warnings };
    }

    // Check for overlapping ranges after potential extension
    const allRanges: Array<{ zoneId: string; range: [number, number] }> = [];
    
    for (const zone of enabledZones) {
      for (const range of zone.ranges) {
        allRanges.push({ zoneId: zone.id, range });
      }
    }

    // Check for overlaps
    for (let i = 0; i < allRanges.length; i++) {
      for (let j = i + 1; j < allRanges.length; j++) {
        const range1 = allRanges[i].range;
        const range2 = allRanges[j].range;
        
        if (this.rangesOverlap(range1, range2)) {
          errors.push(
            `Zone ranges overlap: ${allRanges[i].zoneId} [${range1[0]}-${range1[1]}] ` +
            `and ${allRanges[j].zoneId} [${range2[0]}-${range2[1]}]`
          );
        }
      }
    }

    // Check capacity constraints
    const totalHardwareCapacity = config.hardware.relay_cards
      .filter(card => card.enabled)
      .reduce((sum, card) => sum + card.channels, 0);

    if (totalLockers > totalHardwareCapacity) {
      errors.push(
        `Total lockers (${totalLockers}) exceeds hardware capacity (${totalHardwareCapacity})`
      );
    }

    // Check if extension would exceed available relay cards
    const coveredMax = this.calculateCoveredMax(enabledZones);
    if (coveredMax < totalLockers) {
      const lastZone = enabledZones[enabledZones.length - 1];
      const additionalLockers = totalLockers - coveredMax;
      const currentZoneLockers = this.countLockersInRanges(lastZone.ranges);
      const totalZoneLockers = currentZoneLockers + additionalLockers;
      const requiredCards = Math.ceil(totalZoneLockers / 16);
      
      const availableCards = config.hardware.relay_cards
        .filter(card => card.enabled)
        .map(card => card.slave_address);
      
      if (requiredCards > availableCards.length) {
        warnings.push(
          `Zone ${lastZone.id} extension would require ${requiredCards} cards ` +
          `but only ${availableCards.length} are available`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if two ranges overlap
   * 
   * @param range1 - First range [start, end]
   * @param range2 - Second range [start, end]
   * @returns True if ranges overlap
   */
  private rangesOverlap(range1: [number, number], range2: [number, number]): boolean {
    return range1[0] <= range2[1] && range2[0] <= range1[1];
  }

  /**
   * Comprehensive validation for zone configuration integrity
   * This method provides detailed validation beyond basic extension validation
   * 
   * @param config - System configuration to validate
   * @returns Detailed validation result
   */
  validateZoneConfigurationIntegrity(
    config: CompleteSystemConfig
  ): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[];
    details: {
      totalZones: number;
      enabledZones: number;
      totalCoveredLockers: number;
      gaps: Array<{ start: number; end: number }>;
      overlaps: Array<{ zone1: string; zone2: string; range1: [number, number]; range2: [number, number] }>;
      capacityUtilization: number;
    }
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details = {
      totalZones: 0,
      enabledZones: 0,
      totalCoveredLockers: 0,
      gaps: [] as Array<{ start: number; end: number }>,
      overlaps: [] as Array<{ zone1: string; zone2: string; range1: [number, number]; range2: [number, number] }>,
      capacityUtilization: 0
    };

    if (!config.features?.zones_enabled || !config.zones) {
      return { valid: true, errors, warnings, details };
    }

    const zones = config.zones;
    const enabledZones = zones.filter(zone => zone.enabled);
    
    details.totalZones = zones.length;
    details.enabledZones = enabledZones.length;

    // Validate zone IDs
    const zoneIds = zones.map(zone => zone.id);
    const duplicateIds = zoneIds.filter((id, index) => zoneIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate zone IDs found: ${duplicateIds.join(', ')}`);
    }

    // Validate zone ranges
    const allRanges: Array<{ zoneId: string; range: [number, number] }> = [];
    
    for (const zone of enabledZones) {
      // Check for empty ranges
      if (!zone.ranges || zone.ranges.length === 0) {
        errors.push(`Zone ${zone.id} has no ranges defined`);
        continue;
      }

      // Check for invalid ranges
      for (const range of zone.ranges) {
        if (range[0] > range[1]) {
          errors.push(`Zone ${zone.id} has invalid range [${range[0]}-${range[1]}]: start > end`);
        }
        if (range[0] < 1) {
          errors.push(`Zone ${zone.id} has invalid range [${range[0]}-${range[1]}]: start < 1`);
        }
        
        allRanges.push({ zoneId: zone.id, range });
      }

      // Check relay card assignments
      if (!zone.relay_cards || zone.relay_cards.length === 0) {
        warnings.push(`Zone ${zone.id} has no relay cards assigned`);
      }
    }

    // Check for overlaps and calculate details
    for (let i = 0; i < allRanges.length; i++) {
      for (let j = i + 1; j < allRanges.length; j++) {
        const range1 = allRanges[i];
        const range2 = allRanges[j];
        
        if (this.rangesOverlap(range1.range, range2.range)) {
          errors.push(
            `Zone ranges overlap: ${range1.zoneId} [${range1.range[0]}-${range1.range[1]}] ` +
            `and ${range2.zoneId} [${range2.range[0]}-${range2.range[1]}]`
          );
          
          details.overlaps.push({
            zone1: range1.zoneId,
            zone2: range2.zoneId,
            range1: range1.range,
            range2: range2.range
          });
        }
      }
    }

    // Calculate total covered lockers and find gaps
    if (allRanges.length > 0) {
      const sortedRanges = allRanges
        .map(r => r.range)
        .sort((a, b) => a[0] - b[0]);
      
      details.totalCoveredLockers = this.countLockersInRanges(sortedRanges);
      
      // Find gaps between ranges
      for (let i = 0; i < sortedRanges.length - 1; i++) {
        const currentEnd = sortedRanges[i][1];
        const nextStart = sortedRanges[i + 1][0];
        
        if (currentEnd + 1 < nextStart) {
          details.gaps.push({
            start: currentEnd + 1,
            end: nextStart - 1
          });
        }
      }
    }

    // Calculate capacity utilization
    const totalHardwareCapacity = config.hardware.relay_cards
      .filter(card => card.enabled)
      .reduce((sum, card) => sum + card.channels, 0);
    
    if (totalHardwareCapacity > 0) {
      details.capacityUtilization = (details.totalCoveredLockers / totalHardwareCapacity) * 100;
    }

    // Capacity warnings
    if (details.capacityUtilization > 90) {
      warnings.push(`High capacity utilization: ${details.capacityUtilization.toFixed(1)}%`);
    }

    // Gap warnings
    if (details.gaps.length > 0) {
      warnings.push(`Found ${details.gaps.length} gaps in zone coverage: ${details.gaps.map(g => `${g.start}-${g.end}`).join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details
    };
  }

  /**
   * Validate zone extension with enhanced error reporting
   * This extends the basic validation with more detailed error messages
   * 
   * @param config - System configuration
   * @param totalLockers - Total lockers from hardware
   * @param operation - Operation context for better error messages
   * @returns Enhanced validation result
   */
  validateZoneExtensionWithContext(
    config: CompleteSystemConfig,
    totalLockers: number,
    operation: string = 'zone extension'
  ): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[];
    canProceed: boolean;
    recommendations: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // First run basic validation
    const basicValidation = this.validateZoneExtension(config, totalLockers);
    errors.push(...basicValidation.errors);
    warnings.push(...basicValidation.warnings);

    // Run integrity validation
    const integrityValidation = this.validateZoneConfigurationIntegrity(config);
    errors.push(...integrityValidation.errors);
    warnings.push(...integrityValidation.warnings);

    // Add operation-specific validations
    if (!config.features?.zones_enabled) {
      recommendations.push('Enable zones in configuration to use zone-aware features');
      return { valid: true, errors, warnings, canProceed: false, recommendations };
    }

    if (!config.zones || config.zones.length === 0) {
      errors.push(`Cannot perform ${operation}: No zones configured`);
      recommendations.push('Configure at least one zone before attempting zone operations');
      return { valid: false, errors, warnings, canProceed: false, recommendations };
    }

    const enabledZones = config.zones.filter(zone => zone.enabled);
    if (enabledZones.length === 0) {
      errors.push(`Cannot perform ${operation}: No zones are enabled`);
      recommendations.push('Enable at least one zone to perform zone operations');
      return { valid: false, errors, warnings, canProceed: false, recommendations };
    }

    // Check if extension is actually needed
    const coveredMax = this.calculateCoveredMax(enabledZones);
    if (coveredMax >= totalLockers) {
      recommendations.push(`No extension needed: zones already cover all ${totalLockers} lockers`);
    } else {
      const uncoveredLockers = totalLockers - coveredMax;
      recommendations.push(`Extension would add ${uncoveredLockers} lockers to zone coverage`);
    }

    // Hardware capacity recommendations
    const totalHardwareCapacity = config.hardware.relay_cards
      .filter(card => card.enabled)
      .reduce((sum, card) => sum + card.channels, 0);

    if (totalLockers > totalHardwareCapacity) {
      recommendations.push(`Consider adding more relay cards: need ${Math.ceil((totalLockers - totalHardwareCapacity) / 16)} additional cards`);
    }

    // Determine if operation can proceed
    const canProceed = errors.length === 0;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      canProceed,
      recommendations
    };
  }

  /**
   * Get extension preview without applying changes
   * 
   * @param config - Current system configuration
   * @param totalLockers - Total lockers from hardware
   * @returns Preview of what would happen during extension
   */
  getExtensionPreview(
    config: CompleteSystemConfig,
    totalLockers: number
  ): {
    wouldExtend: boolean;
    affectedZone?: string;
    newRange?: [number, number];
    currentRanges?: [number, number][];
    mergedRanges?: [number, number][];
    additionalCards?: number;
  } {
    if (!config.features?.zones_enabled || !config.zones) {
      return { wouldExtend: false };
    }

    const enabledZones = config.zones.filter(zone => zone.enabled);
    if (enabledZones.length === 0) {
      return { wouldExtend: false };
    }

    const coveredMax = this.calculateCoveredMax(enabledZones);
    if (coveredMax >= totalLockers) {
      return { wouldExtend: false };
    }

    const lastZone = enabledZones[enabledZones.length - 1];
    const newRange: [number, number] = [coveredMax + 1, totalLockers];
    const currentRanges = [...lastZone.ranges];
    const mergedRanges = this.mergeAdjacentRanges([...lastZone.ranges, newRange]);
    
    const currentLockers = this.countLockersInRanges(currentRanges);
    const extendedLockers = this.countLockersInRanges(mergedRanges);
    const currentCards = Math.ceil(currentLockers / 16);
    const requiredCards = Math.ceil(extendedLockers / 16);
    const additionalCards = Math.max(0, requiredCards - lastZone.relay_cards.length);

    return {
      wouldExtend: true,
      affectedZone: lastZone.id,
      newRange,
      currentRanges,
      mergedRanges,
      additionalCards
    };
  }
}
