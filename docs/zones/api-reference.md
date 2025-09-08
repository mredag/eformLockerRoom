# Zone Features API Reference

## 📋 **Overview**

This document provides a complete API reference for the zone features in the eForm Locker System. It covers all zone-aware functions, endpoints, and integration patterns.

## 🔧 **Zone Helper Functions**

### **Core Functions**

#### **`getLockerPositionInZone(lockerId, config)`**
Returns the position of a locker within configured zone ranges.

**Parameters:**
- `lockerId: number` - The locker ID to find
- `config: CompleteSystemConfig` - Complete system configuration

**Returns:**
- `number` - Position (1-based) within zone ranges
- `null` - If zones disabled or locker not found in any zone

**Example:**
```javascript
const position = getLockerPositionInZone(5, config);
// Returns: 5 (if locker 5 is in first zone range)

const position = getLockerPositionInZone(35, config);
// Returns: 19 (if locker 35 is in second range after 16 lockers)
```

#### **`computeHardwareMappingFromPosition(position, zoneConfig)`**
Computes hardware mapping (slave address and coil) from zone position.

**Parameters:**
- `position: number` - Position within zone (1-based)
- `zoneConfig: ZoneConfig` - Zone configuration

**Returns:**
- `LockerHardwareMapping` - Hardware mapping object
- `null` - If invalid position or zone disabled

**Example:**
```javascript
const mapping = computeHardwareMappingFromPosition(5, zoneConfig);
// Returns: { slaveAddress: 1, coilAddress: 5, position: 5 }

const mapping = computeHardwareMappingFromPosition(19, zoneConfig);
// Returns: { slaveAddress: 3, coilAddress: 3, position: 19 }
```

#### **`getZoneAwareHardwareMapping(lockerId, config)`**
Gets complete hardware mapping for a locker using zone configuration.

**Parameters:**
- `lockerId: number` - The locker ID to map
- `config: CompleteSystemConfig` - Complete system configuration

**Returns:**
- `LockerHardwareMapping` - Complete hardware mapping with zone ID
- `null` - If zones disabled or locker not in any zone

**Example:**
```javascript
const mapping = getZoneAwareHardwareMapping(5, config);
// Returns: { 
//   slaveAddress: 1, 
//   coilAddress: 5, 
//   position: 5, 
//   zoneId: 'mens' 
// }
```

#### **`findZoneForLocker(lockerId, config)`**
Finds the zone configuration that contains a specific locker.

**Parameters:**
- `lockerId: number` - The locker ID to find
- `config: CompleteSystemConfig` - Complete system configuration

**Returns:**
- `ZoneConfig` - Zone configuration object
- `null` - If zones disabled or locker not found

**Example:**
```javascript
const zone = findZoneForLocker(5, config);
// Returns: { id: 'mens', name: 'Men\'s Lockers', ... }
```

#### **`getLockersInZone(zoneId, config)`**
Gets all lockers in a specific zone.

**Parameters:**
- `zoneId: string` - Zone ID to get lockers for
- `config: CompleteSystemConfig` - Complete system configuration

**Returns:**
- `number[]` - Array of locker IDs in the zone (sorted)

**Example:**
```javascript
const lockers = getLockersInZone('mens', config);
// Returns: [1, 2, 3, ..., 16, 33, 34, ..., 48]
```

#### **`validateZoneConfiguration(config)`**
Validates zone configuration consistency.

**Parameters:**
- `config: CompleteSystemConfig` - Complete system configuration

**Returns:**
- `ValidationResult` - Validation result object

**Example:**
```javascript
const validation = validateZoneConfiguration(config);
// Returns: {
//   valid: true,
//   errors: [],
//   warnings: []
// }
```

### **Type Definitions**

#### **`LockerHardwareMapping`**
```typescript
interface LockerHardwareMapping {
  slaveAddress: number;  // Relay card slave address
  coilAddress: number;   // Coil/relay number on card
  position: number;      // Position within zone
  zoneId: string;        // Zone identifier
}
```

#### **`ZoneConfig`**
```typescript
interface ZoneConfig {
  id: string;                    // Unique zone identifier
  name: string;                  // Display name
  enabled: boolean;              // Enable/disable flag
  ranges: [number, number][];    // Array of [start, end] ranges
  relay_cards: number[];         // Relay card slave addresses
}
```

#### **`ValidationResult`**
```typescript
interface ValidationResult {
  valid: boolean;      // Overall validation status
  errors: string[];    // Critical errors that prevent operation
  warnings: string[];  // Non-critical issues
}
```

## 🏗️ **Layout Service API**

### **Enhanced Methods**

#### **`generateLockerLayout(kioskId?, zoneId?)`**
Generates locker layout based on configuration, optionally filtered by zone.

**Parameters:**
- `kioskId?: string` - Kiosk identifier (default: 'kiosk-1')
- `zoneId?: string` - Optional zone ID to filter lockers

**Returns:**
- `Promise<LayoutGrid>` - Layout grid with locker information

**Example:**
```javascript
// Full layout (existing behavior)
const fullLayout = await layoutService.generateLockerLayout('kiosk-1');

// Zone-filtered layout
const mensLayout = await layoutService.generateLockerLayout('kiosk-1', 'mens');
```

#### **`getLockerMapping(lockerId, kioskId?, zoneId?)`**
Gets locker mapping information for hardware control.

**Parameters:**
- `lockerId: number` - Locker ID to get mapping for
- `kioskId?: string` - Kiosk identifier (default: 'kiosk-1')
- `zoneId?: string` - Optional zone ID for validation

**Returns:**
- `Promise<LockerLayoutInfo | null>` - Locker layout information

**Example:**
```javascript
// Get mapping for locker in any zone
const mapping = await layoutService.getLockerMapping(5, 'kiosk-1');

// Get mapping for locker in specific zone
const mapping = await layoutService.getLockerMapping(5, 'kiosk-1', 'mens');
```

#### **`isValidLockerId(lockerId, kioskId?, zoneId?)`**
Validates that locker ID is within configured range, optionally for specific zone.

**Parameters:**
- `lockerId: number` - Locker ID to validate
- `kioskId?: string` - Kiosk identifier (default: 'kiosk-1')
- `zoneId?: string` - Optional zone ID for validation

**Returns:**
- `Promise<boolean>` - True if locker ID is valid

**Example:**
```javascript
// Validate locker in any zone
const isValid = await layoutService.isValidLockerId(5, 'kiosk-1');

// Validate locker in specific zone
const isValid = await layoutService.isValidLockerId(5, 'kiosk-1', 'mens');
```

#### **`generatePanelCards(kioskId?, zoneId?)`**
Generates locker cards for admin panel, optionally filtered by zone.

**Parameters:**
- `kioskId?: string` - Kiosk identifier (default: 'kiosk-1')
- `zoneId?: string` - Optional zone ID to filter cards

**Returns:**
- `Promise<string>` - HTML string with locker cards

**Example:**
```javascript
// Generate cards for all lockers
const allCards = await layoutService.generatePanelCards('kiosk-1');

// Generate cards for specific zone
const mensCards = await layoutService.generatePanelCards('kiosk-1', 'mens');
```

#### **`generateKioskTiles(kioskId?, zoneId?)`**
Generates locker tiles for kiosk interface, optionally filtered by zone.

**Parameters:**
- `kioskId?: string` - Kiosk identifier (default: 'kiosk-1')
- `zoneId?: string` - Optional zone ID to filter tiles

**Returns:**
- `Promise<string>` - HTML string with locker tiles

**Example:**
```javascript
// Generate tiles for all lockers
const allTiles = await layoutService.generateKioskTiles('kiosk-1');

// Generate tiles for specific zone
const womensTiles = await layoutService.generateKioskTiles('kiosk-1', 'womens');
```

### **Layout Service Types**

#### **`LayoutGrid`**
```typescript
interface LayoutGrid {
  rows: number;              // Grid rows
  columns: number;           // Grid columns
  totalLockers: number;      // Total lockers in layout
  lockers: LockerLayoutInfo[]; // Array of locker information
}
```

#### **`LockerLayoutInfo`**
```typescript
interface LockerLayoutInfo {
  id: number;              // Locker ID
  cardId: number;          // Relay card ID
  relayId: number;         // Relay number on card
  slaveAddress: number;    // Modbus slave address
  displayName: string;     // Display name for UI
  description: string;     // Technical description
  enabled: boolean;        // Enable/disable flag
  cardDescription: string; // Relay card description
}
```

## 🌐 **HTTP API Endpoints**

### **Existing Endpoints (Zone-Aware)**

#### **POST `/api/locker/open`**
Opens a locker using zone-aware hardware mapping when zones are enabled.

**Request Body:**
```json
{
  "locker_id": 5,
  "staff_user": "admin",
  "reason": "maintenance"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Locker 5 opened successfully",
  "locker_id": 5,
  "staff_user": "admin",
  "reason": "maintenance",
  "timestamp": "2025-09-08T20:28:43.201Z"
}
```

**Zone Behavior:**
- If zones enabled: Uses zone-aware hardware mapping
- If zones disabled: Uses traditional hardware mapping
- Automatic fallback ensures compatibility

#### **GET `/health`**
Health check endpoints now include zone information in logs.

**Response:**
```json
{
  "status": "healthy",
  "kiosk_id": "kiosk-1",
  "timestamp": "2025-09-08T20:26:52.183Z",
  "version": "1.0.0",
  "hardware": {
    "available": true,
    "connected": true,
    "health_status": "ok"
  }
}
```

**Zone Logging:**
Service logs include zone information:
```
🚀 Kiosk service kiosk-1 running on port 3002 (zone: main)
🔓 Direct locker opening: 5 by zone-test
🔧 Hardware: Opening locker 5 (card=1, relay=5, slave=1)
```

## 🔧 **Integration Patterns**

### **Zone-Aware Service Integration**

#### **Pattern 1: Automatic Zone Detection**
```javascript
// Service automatically uses zones if enabled
const result = await lockerService.openLocker(lockerId, staffUser, reason);
// Uses zone mapping if zones_enabled=true, traditional mapping if false
```

#### **Pattern 2: Explicit Zone Filtering**
```javascript
// Explicitly request zone-filtered results
const layout = await layoutService.generateLockerLayout(kioskId, zoneId);
// Only returns lockers in specified zone
```

#### **Pattern 3: Zone Validation**
```javascript
// Validate locker exists in specific zone
const isValid = await layoutService.isValidLockerId(lockerId, kioskId, zoneId);
if (!isValid) {
  throw new Error(`Locker ${lockerId} not available in zone ${zoneId}`);
}
```

### **Backward Compatibility Patterns**

#### **Pattern 1: Optional Zone Parameter**
```javascript
// Method works with or without zone parameter
generateLockerLayout(kioskId = 'kiosk-1', zoneId?: string)

// Existing calls continue working
const layout = await generateLockerLayout('kiosk-1'); // No zone

// New zone-aware calls
const layout = await generateLockerLayout('kiosk-1', 'mens'); // With zone
```

#### **Pattern 2: Null Return for Graceful Fallback**
```javascript
// Zone helpers return null when zones disabled
const mapping = getZoneAwareHardwareMapping(lockerId, config);
if (mapping) {
  // Use zone-aware mapping
  useZoneMapping(mapping);
} else {
  // Fall back to traditional mapping
  useTraditionalMapping(lockerId);
}
```

#### **Pattern 3: Configuration-Driven Behavior**
```javascript
// Behavior changes based on configuration
if (config.features?.zones_enabled && zoneId) {
  // Zone-aware logic
  return getZoneFilteredLockers(zoneId);
} else {
  // Traditional logic
  return getAllLockers();
}
```

## 🧪 **Testing API**

### **Test Helper Functions**

#### **Zone Logic Testing**
```javascript
// Test zone position calculation
function testZonePosition(lockerId, config) {
  const position = getLockerPositionInZone(lockerId, config);
  console.log(`Locker ${lockerId} position: ${position}`);
  return position;
}

// Test hardware mapping
function testHardwareMapping(position, zoneConfig) {
  const mapping = computeHardwareMappingFromPosition(position, zoneConfig);
  console.log(`Position ${position} mapping:`, mapping);
  return mapping;
}
```

#### **Service Integration Testing**
```javascript
// Test zone-aware layout generation
async function testZoneLayout(zoneId) {
  const layout = await layoutService.generateLockerLayout('kiosk-1', zoneId);
  console.log(`Zone ${zoneId} has ${layout.totalLockers} lockers`);
  return layout;
}

// Test API endpoints
async function testLockerAPI(lockerId) {
  const response = await fetch('/api/locker/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locker_id: lockerId,
      staff_user: 'test',
      reason: 'API testing'
    })
  });
  return response.json();
}
```

### **Validation Testing**
```javascript
// Test zone configuration validation
function testZoneValidation(config) {
  const validation = validateZoneConfiguration(config);
  
  if (!validation.valid) {
    console.error('Zone configuration errors:', validation.errors);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('Zone configuration warnings:', validation.warnings);
  }
  
  return validation;
}
```

## 📊 **Performance Considerations**

### **Caching Strategies**
```javascript
// Cache zone calculations for performance
const zoneCache = new Map();

function getCachedZoneMapping(lockerId, config) {
  const cacheKey = `${lockerId}-${config.version}`;
  
  if (zoneCache.has(cacheKey)) {
    return zoneCache.get(cacheKey);
  }
  
  const mapping = getZoneAwareHardwareMapping(lockerId, config);
  zoneCache.set(cacheKey, mapping);
  return mapping;
}
```

### **Batch Operations**
```javascript
// Process multiple lockers efficiently
function getZoneMappingsForLockers(lockerIds, config) {
  return lockerIds.map(id => ({
    lockerId: id,
    mapping: getZoneAwareHardwareMapping(id, config)
  }));
}
```

## 🔍 **Error Handling**

### **Common Error Patterns**
```javascript
// Handle zone-related errors gracefully
try {
  const mapping = getZoneAwareHardwareMapping(lockerId, config);
  if (!mapping) {
    // Locker not in any zone or zones disabled
    return useTraditionalMapping(lockerId);
  }
  return useZoneMapping(mapping);
} catch (error) {
  console.error('Zone mapping error:', error);
  // Fallback to traditional mapping
  return useTraditionalMapping(lockerId);
}
```

### **Validation Error Handling**
```javascript
// Validate before processing
const validation = validateZoneConfiguration(config);
if (!validation.valid) {
  throw new Error(`Invalid zone configuration: ${validation.errors.join(', ')}`);
}

// Check locker availability
const isValid = await layoutService.isValidLockerId(lockerId, kioskId, zoneId);
if (!isValid) {
  throw new Error(`Locker ${lockerId} not available in zone ${zoneId}`);
}
```

## 📚 **Usage Examples**

### **Complete Integration Example**
```javascript
// Complete zone-aware locker operation
async function openLockerWithZones(lockerId, staffUser, reason, zoneId = null) {
  try {
    // Load configuration
    const config = await configManager.getConfiguration();
    
    // Validate zone configuration if zones enabled
    if (config.features?.zones_enabled) {
      const validation = validateZoneConfiguration(config);
      if (!validation.valid) {
        throw new Error(`Zone configuration invalid: ${validation.errors.join(', ')}`);
      }
    }
    
    // Validate locker availability
    const isValid = await layoutService.isValidLockerId(lockerId, 'kiosk-1', zoneId);
    if (!isValid) {
      throw new Error(`Locker ${lockerId} not available${zoneId ? ` in zone ${zoneId}` : ''}`);
    }
    
    // Get hardware mapping
    let mapping;
    if (config.features?.zones_enabled) {
      mapping = getZoneAwareHardwareMapping(lockerId, config);
    }
    
    if (mapping) {
      // Use zone-aware hardware control
      console.log(`Opening locker ${lockerId} using zone mapping:`, mapping);
      return await hardwareController.openLocker(mapping.slaveAddress, mapping.coilAddress);
    } else {
      // Fall back to traditional mapping
      console.log(`Opening locker ${lockerId} using traditional mapping`);
      return await hardwareController.openLockerTraditional(lockerId);
    }
    
  } catch (error) {
    console.error('Locker operation failed:', error);
    throw error;
  }
}
```

---

## 📞 **Support Information**

### **Related Documentation**
- [Zone Implementation Guide](ZONE_FEATURES_IMPLEMENTATION.md)
- [Zone Usage Guide](ZONE_USAGE_GUIDE.md)
- [Configuration Reference](../config/README.md)

### **Test Scripts**
- `simple-zone-test.js` - Basic API testing
- `test-zone-services.js` - Service integration testing
- `test-zone-layout-api.js` - Complete API testing

---

**API Version**: Zone MVP 1.0  
**Last Updated**: September 8, 2025  
**Status**: Production Ready