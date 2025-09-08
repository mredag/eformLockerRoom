# Zone Features Usage Guide

## 🎯 **Quick Start Guide**

This guide shows how to use the zone features in the eForm Locker System for organizing lockers into logical groups with independent hardware control.

## 📋 **Prerequisites**

- eForm Locker System with zone features deployed
- Access to `config/system.json` for configuration
- Understanding of your hardware setup (relay cards and locker layout)

## 🚀 **Getting Started**

### **Step 1: Enable Zone Features**

Edit `config/system.json`:
```json
{
  "features": {
    "zones_enabled": true
  }
}
```

### **Step 2: Configure Your First Zone**

Add zone configuration:
```json
{
  "zones": [
    {
      "id": "main",
      "name": "Main Locker Area",
      "enabled": true,
      "ranges": [[1, 32]],
      "relay_cards": [1, 2]
    }
  ]
}
```

### **Step 3: Restart Services**

```bash
ssh pi@pi-eform-locker
cd /home/pi/eform-locker
./scripts/start-all-clean.sh
```

### **Step 4: Test Zone Functionality**

```bash
# Test zone logic
node simple-zone-test.js

# Test API integration
node test-zone-layout-api.js
```

## 🏗️ **Zone Configuration Examples**

### **Example 1: Men's and Women's Areas**
```json
{
  "features": {
    "zones_enabled": true
  },
  "zones": [
    {
      "id": "mens",
      "name": "Men's Locker Room",
      "enabled": true,
      "ranges": [[1, 24]],
      "relay_cards": [1, 2]
    },
    {
      "id": "womens",
      "name": "Women's Locker Room", 
      "enabled": true,
      "ranges": [[25, 48]],
      "relay_cards": [3, 4]
    }
  ]
}
```

### **Example 2: Multiple Disconnected Ranges**
```json
{
  "zones": [
    {
      "id": "premium",
      "name": "Premium Lockers",
      "enabled": true,
      "ranges": [[1, 8], [41, 48]],
      "relay_cards": [1, 3]
    },
    {
      "id": "standard",
      "name": "Standard Lockers",
      "enabled": true,
      "ranges": [[9, 40]],
      "relay_cards": [2]
    }
  ]
}
```

### **Example 3: Floor-Based Zones**
```json
{
  "zones": [
    {
      "id": "floor1",
      "name": "First Floor Lockers",
      "enabled": true,
      "ranges": [[1, 32]],
      "relay_cards": [1, 2]
    },
    {
      "id": "floor2", 
      "name": "Second Floor Lockers",
      "enabled": true,
      "ranges": [[33, 64]],
      "relay_cards": [3, 4]
    }
  ]
}
```

## 🔧 **Configuration Parameters**

### **Zone Object Structure**
```typescript
interface ZoneConfig {
  id: string;           // Unique identifier (no spaces, lowercase)
  name: string;         // Display name for UI
  enabled: boolean;     // Enable/disable this zone
  ranges: [number, number][]; // Array of [start, end] locker ranges
  relay_cards: number[]; // Array of relay card slave addresses
}
```

### **Parameter Details**

#### **`id` (required)**
- Unique identifier for the zone
- Used in API calls and internal references
- Format: lowercase, no spaces (e.g., "mens", "floor1", "premium")

#### **`name` (required)**
- Human-readable name displayed in UI
- Can contain spaces and special characters
- Examples: "Men's Locker Room", "Premium Area", "Floor 1"

#### **`enabled` (required)**
- Boolean flag to enable/disable the zone
- Disabled zones are ignored by the system
- Allows temporary zone deactivation without removing configuration

#### **`ranges` (required)**
- Array of locker number ranges included in this zone
- Format: `[[start1, end1], [start2, end2], ...]`
- Ranges are inclusive (both start and end included)
- Can have multiple disconnected ranges per zone

#### **`relay_cards` (required)**
- Array of relay card slave addresses used by this zone
- Must match actual hardware configuration
- Cards are assigned to lockers using the position formula
- Order matters: first card gets positions 1-16, second gets 17-32, etc.

## 📊 **Hardware Mapping Logic**

### **Position Calculation**
```javascript
// For locker in zone ranges [[1,16], [33,48]]
// Locker 5  -> Position 5  (in first range)
// Locker 35 -> Position 19 (16 from first range + 3 in second range)
```

### **Hardware Assignment**
```javascript
// From position to hardware
cardIndex = Math.floor((position - 1) / 16)  // Which relay card
coilAddress = ((position - 1) % 16) + 1      // Which relay on card
slaveAddress = zone.relay_cards[cardIndex]   // Actual card address
```

### **Example Mapping**
```
Zone: mens, ranges: [[1,16], [33,48]], relay_cards: [1, 3]

Locker 5:  Position 5  -> Card 1 (index 0), Relay 5  -> Slave 1, Coil 5
Locker 35: Position 19 -> Card 3 (index 1), Relay 3  -> Slave 3, Coil 3
```

## 🔌 **API Usage**

### **Zone-Aware Layout Generation**
```javascript
// Get layout for specific zone
const layout = await layoutService.generateLockerLayout('kiosk-1', 'mens');

// Get layout for all lockers (existing behavior)
const fullLayout = await layoutService.generateLockerLayout('kiosk-1');
```

### **Zone-Aware Locker Operations**
```javascript
// Open locker with zone awareness (automatic)
POST /api/locker/open
{
  "locker_id": 5,
  "staff_user": "admin",
  "reason": "maintenance"
}
// System automatically uses zone mapping if zones enabled
```

### **Zone Validation**
```javascript
// Check if locker is valid in specific zone
const isValid = await layoutService.isValidLockerId(5, 'kiosk-1', 'mens');

// Get locker mapping for specific zone
const mapping = await layoutService.getLockerMapping(5, 'kiosk-1', 'mens');
```

## 🧪 **Testing Your Configuration**

### **1. Validate Configuration**
```bash
# Test zone logic with your configuration
node simple-zone-test.js
```

### **2. Test Service Integration**
```bash
# Test if services load your zone config
node test-zone-services.js
```

### **3. Test API Functionality**
```bash
# Test zone-aware locker operations
node test-zone-layout-api.js
```

### **4. Test Hardware Control**
```bash
# Test actual hardware with zone mapping
curl -X POST http://192.168.1.10:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "zone test"}'
```

## 🔍 **Monitoring and Debugging**

### **Check Service Logs**
```bash
# Monitor zone-aware operations
tail -f logs/kiosk.log | grep -i zone

# Check hardware mapping
tail -f logs/kiosk.log | grep "Hardware:"
```

### **Verify Configuration Loading**
```bash
# Check if zones are loaded
curl -s http://192.168.1.10:3002/health | jq
```

### **Debug Zone Mapping**
```javascript
// Add to your test script
const zoneHelpers = require('./shared/services/zone-helpers');
const config = require('./config/system.json');

console.log('Zone mapping for locker 5:');
console.log(zoneHelpers.getZoneAwareHardwareMapping(5, config));
```

## ⚠️ **Common Issues and Solutions**

### **Issue: Zones Not Working**
**Symptoms**: Lockers use old hardware mapping
**Solution**: 
1. Check `zones_enabled: true` in config
2. Restart services: `./scripts/start-all-clean.sh`
3. Verify zone configuration syntax

### **Issue: Locker Not Found in Zone**
**Symptoms**: API returns "locker not found" errors
**Solution**:
1. Check locker ID is within zone ranges
2. Verify zone is enabled
3. Check for overlapping ranges between zones

### **Issue: Hardware Mapping Incorrect**
**Symptoms**: Wrong relay activates
**Solution**:
1. Verify relay_cards array matches hardware
2. Check relay card slave addresses
3. Test with `node simple-zone-test.js`

### **Issue: Service Won't Start**
**Symptoms**: Services crash on startup
**Solution**:
1. Check JSON syntax in config file
2. Verify all required fields present
3. Check logs: `tail -f logs/*.log`

## 📈 **Best Practices**

### **Configuration Management**
- **Backup Config**: Always backup `config/system.json` before changes
- **Test Changes**: Use test scripts before deploying to production
- **Document Zones**: Keep clear documentation of your zone layout
- **Version Control**: Commit configuration changes to git

### **Zone Design**
- **Logical Grouping**: Group lockers by physical location or purpose
- **Hardware Alignment**: Align zones with relay card boundaries when possible
- **Future Growth**: Leave room for expansion in your zone design
- **Clear Naming**: Use descriptive zone IDs and names

### **Deployment Process**
1. **Plan**: Design zone layout on paper first
2. **Configure**: Update `config/system.json`
3. **Test**: Run all test scripts locally
4. **Deploy**: Push to git and pull on Pi
5. **Verify**: Test hardware operations
6. **Monitor**: Watch logs for any issues

## 🔄 **Migration from Non-Zone Setup**

### **Step 1: Plan Your Zones**
- Map current locker layout
- Identify logical groupings
- Note relay card assignments

### **Step 2: Create Zone Configuration**
```json
{
  "features": {
    "zones_enabled": false  // Start disabled
  },
  "zones": [
    // Add your zone definitions
  ]
}
```

### **Step 3: Test Configuration**
```bash
# Test with zones disabled first
node simple-zone-test.js
```

### **Step 4: Enable Zones**
```json
{
  "features": {
    "zones_enabled": true  // Enable zones
  }
}
```

### **Step 5: Verify Migration**
- Test all lockers still work
- Verify hardware mapping is correct
- Check UI displays properly

## 📚 **Advanced Usage**

### **Dynamic Zone Management**
```javascript
// Disable zone temporarily
config.zones.find(z => z.id === 'mens').enabled = false;

// Add new zone at runtime (requires service restart)
config.zones.push({
  id: 'new_zone',
  name: 'New Area',
  enabled: true,
  ranges: [[49, 64]],
  relay_cards: [5]
});
```

### **Zone-Specific UI**
```javascript
// Generate UI for specific zone only
const mensLayout = await layoutService.generateKioskTiles('kiosk-1', 'mens');
const womensLayout = await layoutService.generateKioskTiles('kiosk-1', 'womens');
```

### **Multi-Kiosk Zone Support**
```javascript
// Different kiosks can show different zones
const kiosk1Layout = await layoutService.generateLockerLayout('kiosk-1', 'mens');
const kiosk2Layout = await layoutService.generateLockerLayout('kiosk-2', 'womens');
```

---

## 📞 **Support and Resources**

### **Documentation**
- [Implementation Guide](ZONE_FEATURES_IMPLEMENTATION.md)
- [Configuration Reference](../config/README.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

### **Test Scripts**
- `simple-zone-test.js` - Basic zone logic testing
- `test-zone-services.js` - Service integration testing
- `test-zone-layout-api.js` - API functionality testing

### **Configuration Examples**
- See `config/system.json` for current configuration
- Check test scripts for additional examples

---

**Last Updated**: September 8, 2025  
**Version**: Zone MVP 1.0  
**Status**: Production Ready