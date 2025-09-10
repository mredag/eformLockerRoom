# Zone Features Implementation Guide

## 📋 **Overview**

This document describes the implementation of zone-aware locker management in the eForm Locker System. Zone features allow organizing lockers into logical groups (e.g., men's/women's areas) with independent hardware mapping and management.

## 🎯 **What Was Implemented**

### **Core Zone Features**
- **Zone-Aware Hardware Mapping**: Lockers are mapped to hardware based on their position within zones
- **Flexible Zone Configuration**: Support for multiple zones with custom ranges and relay card assignments
- **Backward Compatibility**: Existing non-zone functionality continues to work unchanged
- **Zone-Filtered Layouts**: UI can display lockers for specific zones only
- **Production Ready**: Fully tested and deployed on Raspberry Pi hardware

### **Key Components Added**

1. **Zone Helper Functions** (`shared/services/zone-helpers.ts`)
2. **Enhanced Layout Service** (`shared/services/locker-layout-service.ts`)
3. **Zone Configuration Support** (`config/system.json`)
4. **Type Definitions** (`shared/types/system-config.ts`)

## 🏗️ **Architecture Overview**

```
Zone Configuration (system.json)
         ↓
Zone Helper Functions
         ↓
Layout Service Integration
         ↓
Service APIs (Gateway/Kiosk/Panel)
         ↓
Hardware Control (Modbus)
```

### **Zone Mapping Formula**
```javascript
// Position within zone ranges
position = calculatePositionInZone(lockerId, zoneRanges)

// Hardware mapping from position
cardIndex = Math.floor((position - 1) / 16)
coilAddress = ((position - 1) % 16) + 1
slaveAddress = zone.relay_cards[cardIndex]
```

## 📁 **Files Created/Modified**

### **New Files**
- `shared/services/zone-helpers.ts` - Core zone logic functions
- `docs/ZONE_FEATURES_IMPLEMENTATION.md` - This documentation
- `test-zone-features.js` - Local testing script
- `test-zone-features-pi.js` - Pi testing script
- `simple-zone-test.js` - Basic zone logic test
- `test-zone-services.js` - Service integration test
- `test-zone-layout-api.js` - API functionality test

### **Modified Files**
- `shared/services/locker-layout-service.ts` - Added zone support
- `shared/types/system-config.ts` - Zone type definitions
- `config/system.json` - Zone configuration

## 🔧 **Implementation Details**

### **1. Zone Helper Functions**

#### **Core Functions**
```typescript
// Get locker position within zone ranges
getLockerPositionInZone(lockerId: number, config: CompleteSystemConfig): number | null

// Compute hardware mapping from zone position
computeHardwareMappingFromPosition(position: number, zoneConfig: ZoneConfig): LockerHardwareMapping | null

// Get complete zone-aware hardware mapping
getZoneAwareHardwareMapping(lockerId: number, config: CompleteSystemConfig): LockerHardwareMapping | null

// Find which zone contains a locker
findZoneForLocker(lockerId: number, config: CompleteSystemConfig): ZoneConfig | null

// Get all lockers in a specific zone
getLockersInZone(zoneId: string, config: CompleteSystemConfig): number[]

// Validate zone configuration
validateZoneConfiguration(config: CompleteSystemConfig): ValidationResult
```

#### **Key Features**
- **Null Return Pattern**: Returns `null` when zones disabled or locker not in zone
- **Pure Functions**: No side effects, easy to test and integrate
- **Type Safety**: Full TypeScript interfaces and return types
- **Error Handling**: Graceful handling of invalid configurations

### **2. Layout Service Integration**

#### **Enhanced Methods**
```typescript
// Zone-aware layout generation
generateLockerLayout(kioskId: string = 'kiosk-1', zoneId?: string): Promise<LayoutGrid>

// Zone-aware locker mapping
getLockerMapping(lockerId: number, kioskId: string = 'kiosk-1', zoneId?: string): Promise<LockerLayoutInfo | null>

// Zone-aware validation
isValidLockerId(lockerId: number, kioskId: string = 'kiosk-1', zoneId?: string): Promise<boolean>
```

#### **Integration Logic**
```typescript
if (config.features?.zones_enabled && zoneId) {
  // Use zone-filtered locker list
  targetLockerIds = getLockersInZone(zoneId, config);
} else {
  // Use existing logic: generate full list
  targetLockerIds = Array.from({ length: totalLockers }, (_, i) => i + 1);
}
```

### **3. Configuration Structure**

#### **Zone Configuration Example**
```json
{
  "features": {
    "zones_enabled": true
  },
  "zones": [
    {
      "id": "mens",
      "name": "Men's Lockers",
      "enabled": true,
      "ranges": [[1, 16], [33, 48]],
      "relay_cards": [1, 3]
    },
    {
      "id": "womens",
      "name": "Women's Lockers", 
      "enabled": true,
      "ranges": [[17, 32]],
      "relay_cards": [2]
    }
  ]
}
```

#### **Configuration Fields**
- `zones_enabled`: Global zone feature toggle
- `zones[].id`: Unique zone identifier
- `zones[].name`: Human-readable zone name
- `zones[].enabled`: Zone-specific enable/disable
- `zones[].ranges`: Array of [start, end] locker ranges
- `zones[].relay_cards`: Array of relay card slave addresses

## 🧪 **Testing Implementation**

### **Test Coverage**
1. **Unit Tests**: Zone helper function logic
2. **Integration Tests**: Layout service zone integration
3. **Service Tests**: API endpoint functionality
4. **Hardware Tests**: Actual relay control with zone mapping

### **Test Results**
```
✅ Zone position calculation: PASS
✅ Hardware mapping formula: PASS  
✅ Complete zone-aware mapping: PASS
✅ Service integration: PASS
✅ API functionality: PASS
✅ Hardware control: PASS
```

### **Example Test Output**
```
🧪 Testing Zone Features - JavaScript Implementation
📍 Testing zone position calculation:
Locker 5 position: 5 (expected: 5)
Locker 35 position: 19 (expected: 19)
Locker 20 position: 4 (expected: 4)

🔧 Testing hardware mapping:
Position 5 mapping: { slaveAddress: 1, coilAddress: 5, position: 5 }
Position 19 mapping: { slaveAddress: 3, coilAddress: 3, position: 19 }

🎯 Testing complete zone-aware mapping:
Locker 5 full mapping: { slaveAddress: 1, coilAddress: 5, position: 5, zoneId: 'mens' }
Locker 35 full mapping: { slaveAddress: 3, coilAddress: 3, position: 19, zoneId: 'mens' }
Locker 20 full mapping: { slaveAddress: 2, coilAddress: 4, position: 4, zoneId: 'womens' }
```

## 🚀 **Deployment Process**

### **Development to Production Flow**
1. **Local Development**: Code changes on Windows PC
2. **Build Services**: `npm run build:gateway && npm run build:kiosk && npm run build:panel`
3. **Git Deployment**: `git push origin feat/zones-mvp`
4. **Pi Deployment**: `ssh pi@pi-eform-locker "cd /home/pi/eform-locker && git pull"`
5. **Service Restart**: `./scripts/start-all-clean.sh`
6. **Testing**: Run zone feature tests

### **Deployment Commands**
```bash
# On Windows PC
git add .
git commit -m "feat(zones): zone feature updates"
git push origin feat/zones-mvp

# On Raspberry Pi
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
git pull origin feat/zones-mvp
./scripts/start-all-clean.sh

# Test deployment
node simple-zone-test.js
node test-zone-layout-api.js
```

## 📊 **Production Status**

### **Current State**
- ✅ **Deployed**: Zone features active on Pi (192.168.1.10)
- ✅ **Tested**: All zone functionality verified
- ✅ **Stable**: Services running with zone configuration
- ✅ **Compatible**: Existing functionality preserved

### **Service Status**
```
Gateway: http://192.168.1.10:3000 - ✅ Healthy
Kiosk:   http://192.168.1.10:3002 - ✅ Healthy (zone: main)
Panel:   http://192.168.1.10:3001 - ✅ Healthy
```

### **Hardware Integration**
```
🔧 Hardware: Opening locker 32 (card=2, relay=16, slave=2)
✅ Hardware: Locker 32 opened successfully with pulse
```

## 🎯 **Benefits Achieved**

### **Operational Benefits**
- **Logical Organization**: Lockers grouped by purpose/location
- **Independent Management**: Each zone operates independently
- **Flexible Hardware**: Zones can use different relay cards
- **Scalable Design**: Easy to add new zones or modify existing ones

### **Technical Benefits**
- **Clean Architecture**: Zone logic isolated in helper functions
- **Backward Compatibility**: Non-zone code continues working
- **Type Safety**: Full TypeScript support with proper interfaces
- **Testable Code**: Pure functions enable comprehensive testing

### **Maintenance Benefits**
- **Configuration Driven**: Changes via config file, no code changes
- **Validation Built-in**: Automatic zone configuration validation
- **Clear Logging**: Zone-aware logging for debugging
- **Documentation**: Comprehensive guides and examples

## 🔄 **Future Enhancements**

### **Potential Improvements**
- **Zone-Specific UI**: Different interfaces per zone
- **Zone Analytics**: Usage statistics per zone
- **Zone Permissions**: Access control by zone
- **Dynamic Zones**: Runtime zone configuration changes
- **Zone Monitoring**: Health monitoring per zone

### **Integration Opportunities**
- **RFID Zone Mapping**: Cards assigned to specific zones
- **Zone-Based Reporting**: Analytics and usage reports
- **Multi-Kiosk Zones**: Zones spanning multiple kiosks
- **Zone Scheduling**: Time-based zone availability

---

## 📚 **Related Documentation**
- [Zone Usage Guide](ZONE_USAGE_GUIDE.md)
- [Configuration Reference](../config/README.md)
- [API Documentation](API_REFERENCE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

---

**Implementation Date**: September 8, 2025  
**Status**: Production Ready  
**Branch**: `feat/zones-mvp`  
**Tested On**: Raspberry Pi 4 (192.168.1.10)