/**
 * Zone Helper Functions for the Eform Locker System
 * Pure functions for zone-aware locker positioning and hardware mapping
 */

import { ZoneConfig, CompleteSystemConfig } from '../types/system-config';

/**
 * Hardware mapping result for a locker
 */
export interface LockerHardwareMapping {
  slaveAddress: number;
  coilAddress: number;
  position: number;
  zoneId: string;
}

/**
 * Get the position of a locker within the configured zone ranges
 * @param lockerId - The locker ID to find
 * @param config - Complete system configuration
 * @returns Position (1-based) within zone ranges, or null if not found or zones disabled
 */
export function getLockerPositionInZone(
  lockerId: number,
  config: CompleteSystemConfig
): number | null {
  // Return null if zones are disabled or not configured
  if (!config.features?.zones_enabled || !config.zones || config.zones.length === 0) {
    return null;
  }

  // Find the zone that contains this locker
  for (const zone of config.zones) {
    if (!zone.enabled) {
      continue;
    }

    let position = 1;
    
    // Check each range in the zone
    for (const [start, end] of zone.ranges) {
      if (lockerId >= start && lockerId <= end) {
        // Found the locker in this range
        return position + (lockerId - start);
      }
      // Add the size of this range to position counter
      position += (end - start + 1);
    }
  }

  // Locker not found in any enabled zone
  return null;
}

/**
 * Compute hardware mapping (slave address and coil) from zone position
 * @param position - Position within zone (1-based, from getLockerPositionInZone)
 * @param zoneConfig - Zone configuration containing relay card mappings
 * @returns Hardware mapping with slave address and coil, or null if invalid
 */
export function computeHardwareMappingFromPosition(
  position: number,
  zoneConfig: ZoneConfig
): Omit<LockerHardwareMapping, 'zoneId'> | null {
  if (position < 1 || !zoneConfig.enabled || zoneConfig.relay_cards.length === 0) {
    return null;
  }

  // Calculate card index and coil using the specified formula
  const cardIndex = Math.floor((position - 1) / 16);
  const coilAddress = ((position - 1) % 16) + 1;

  // Ensure we have enough relay cards configured
  if (cardIndex >= zoneConfig.relay_cards.length) {
    return null;
  }

  const slaveAddress = zoneConfig.relay_cards[cardIndex];

  return {
    slaveAddress,
    coilAddress,
    position
  };
}

/**
 * Get complete hardware mapping for a locker using zone configuration
 * @param lockerId - The locker ID to map
 * @param config - Complete system configuration
 * @returns Complete hardware mapping or null if zones disabled/locker not in zone
 */
export function getZoneAwareHardwareMapping(
  lockerId: number,
  config: CompleteSystemConfig
): LockerHardwareMapping | null {
  // Get position within zone
  const position = getLockerPositionInZone(lockerId, config);
  if (position === null) {
    return null;
  }

  // Find the zone that contains this locker
  const zone = findZoneForLocker(lockerId, config);
  if (!zone) {
    return null;
  }

  // Compute hardware mapping from position
  const mapping = computeHardwareMappingFromPosition(position, zone);
  if (!mapping) {
    return null;
  }

  return {
    ...mapping,
    zoneId: zone.id
  };
}

/**
 * Find the zone configuration that contains a specific locker
 * @param lockerId - The locker ID to find
 * @param config - Complete system configuration
 * @returns Zone configuration or null if not found
 */
export function findZoneForLocker(
  lockerId: number,
  config: CompleteSystemConfig
): ZoneConfig | null {
  if (!config.features?.zones_enabled || !config.zones) {
    return null;
  }

  for (const zone of config.zones) {
    if (!zone.enabled) {
      continue;
    }

    // Check if locker is in any range of this zone
    for (const [start, end] of zone.ranges) {
      if (lockerId >= start && lockerId <= end) {
        return zone;
      }
    }
  }

  return null;
}

/**
 * Get all lockers in a specific zone
 * @param zoneId - Zone ID to get lockers for
 * @param config - Complete system configuration
 * @returns Array of locker IDs in the zone
 */
export function getLockersInZone(
  zoneId: string,
  config: CompleteSystemConfig
): number[] {
  if (!config.features?.zones_enabled || !config.zones) {
    return [];
  }

  const zone = config.zones.find(z => z.id === zoneId && z.enabled);
  if (!zone) {
    return [];
  }

  const lockers: number[] = [];
  for (const [start, end] of zone.ranges) {
    for (let i = start; i <= end; i++) {
      lockers.push(i);
    }
  }

  return lockers.sort((a, b) => a - b);
}

/**
 * Validate zone configuration consistency
 * @param config - Complete system configuration
 * @returns Validation result with any issues found
 */
export function validateZoneConfiguration(config: CompleteSystemConfig): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.features?.zones_enabled || !config.zones) {
    return { valid: true, errors, warnings };
  }

  const allLockers = new Set<number>();
  const availableCards = new Set(config.hardware.relay_cards.map(card => card.slave_address));

  for (const zone of config.zones) {
    if (!zone.enabled) {
      continue;
    }

    // Check for overlapping ranges
    for (const [start, end] of zone.ranges) {
      for (let i = start; i <= end; i++) {
        if (allLockers.has(i)) {
          errors.push(`Locker ${i} is assigned to multiple zones`);
        }
        allLockers.add(i);
      }
    }

    // Check relay card availability
    for (const cardId of zone.relay_cards) {
      if (!availableCards.has(cardId)) {
        errors.push(`Zone ${zone.id} references unavailable relay card ${cardId}`);
      }
    }

    // Check if zone has enough relay cards for its ranges
    const totalLockers = zone.ranges.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
    const maxCapacity = zone.relay_cards.length * 16;
    
    if (totalLockers > maxCapacity) {
      errors.push(`Zone ${zone.id} has ${totalLockers} lockers but only ${maxCapacity} relay capacity`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}