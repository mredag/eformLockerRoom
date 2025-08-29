# Dynamic Locker Layout Implementation

## Overview

The eForm Locker System now generates locker cards and tiles **dynamically based on Modbus configuration** instead of using hardcoded values. This ensures perfect consistency between hardware setup and UI display.

## Key Changes

### 🔧 **New Shared Service**

**File**: `shared/services/locker-layout-service.ts`

**Purpose**: Central service that reads hardware configuration and generates appropriate locker layouts for both panel and kiosk interfaces.

**Key Features**:
- ✅ **Hardware-driven layout** - Reads from `config/system.json`
- ✅ **Dynamic grid CSS** - Generates responsive grid layouts
- ✅ **Hardware mapping** - Maps locker IDs to specific relay cards and channels
- ✅ **Statistics calculation** - Hardware utilization and configuration validation
- ✅ **HTML generation** - Creates panel cards and kiosk tiles

### 🖥️ **Panel Updates**

**File**: `app/panel/src/views/lockers.html`

**Changes**:
- ✅ **Dynamic card generation** based on hardware configuration
- ✅ **Hardware information display** - Shows card ID, relay ID, slave address
- ✅ **Hardware statistics dashboard** - Real-time hardware utilization
- ✅ **Configuration validation** - Warns about mismatches
- ✅ **Fallback support** - Falls back to original method if dynamic fails

**New Features**:
- **Hardware Info Cards**: Each locker card shows which relay card and channel it uses
- **Statistics Dashboard**: Shows total lockers, active cards, channels, utilization
- **Dynamic Grid**: Grid layout adjusts based on configuration

### 📱 **Kiosk Updates**

**File**: `app/kiosk/src/ui/static/app-simple.js`

**Changes**:
- ✅ **Dynamic tile generation** based on hardware configuration
- ✅ **Hardware-aware rendering** - Shows card/relay info on tiles
- ✅ **Responsive grid CSS** - Automatically adjusts to screen size
- ✅ **Configuration-driven layout** - No more hardcoded tile counts
- ✅ **Fallback support** - Falls back to static rendering if needed

**New Features**:
- **Hardware Labels**: Each tile shows \"C1R5\" (Card 1, Relay 5) for debugging
- **Dynamic Grid**: Grid size adjusts based on total locker count
- **Real-time Updates**: Layout updates when configuration changes

### 🔌 **API Endpoints**

**Panel Routes** (`app/panel/src/routes/locker-routes.ts`):\n- `GET /api/lockers/layout` - Get dynamic layout configuration\n- `GET /api/lockers/cards` - Get HTML for panel cards\n\n**Kiosk Routes** (`app/kiosk/src/controllers/ui-controller.ts`):\n- `GET /api/ui/layout` - Get dynamic layout configuration\n- `GET /api/ui/tiles` - Get HTML for kiosk tiles\n\n## How It Works\n\n### 🔄 **Layout Generation Process**\n\n1. **Read Configuration**: Service reads `config/system.json`\n2. **Process Relay Cards**: Iterates through enabled relay cards\n3. **Map Lockers**: Maps each locker ID to specific card/relay combination\n4. **Generate Layout**: Creates grid layout based on total locker count\n5. **Create HTML**: Generates appropriate HTML for panel/kiosk\n6. **Apply CSS**: Generates responsive CSS for grid layout\n\n### 🗺️ **Hardware Mapping Logic**\n\n```javascript\n// Example: 16-channel card setup\nLocker 1  → Card 1, Relay 1,  Slave Address 1\nLocker 8  → Card 1, Relay 8,  Slave Address 1\nLocker 16 → Card 1, Relay 16, Slave Address 1\n\n// Example: 32-channel setup (2 cards)\nLocker 17 → Card 2, Relay 1,  Slave Address 2\nLocker 32 → Card 2, Relay 16, Slave Address 2\n```\n\n### 📊 **Configuration Validation**\n\nThe system automatically validates:\n- ✅ **Locker count matches available channels**\n- ✅ **All relay cards have unique slave addresses**\n- ✅ **Grid layout is reasonable for UI display**\n- ⚠️ **Warns about hardware underutilization**\n\n## Benefits\n\n### 🎯 **Perfect Hardware Consistency**\n- **No more mismatches** between hardware and UI\n- **Automatic updates** when hardware configuration changes\n- **Visual hardware mapping** for troubleshooting\n- **Real-time validation** of configuration\n\n### 🔧 **Easy Maintenance**\n- **Add relay cards** without code changes\n- **Visual hardware information** on each locker\n- **Automatic grid optimization** for different screen sizes\n- **Centralized layout logic** in one service\n\n### 📈 **Scalability**\n- **Supports unlimited relay cards** (within reason)\n- **Automatic grid layout** for any locker count\n- **Responsive design** for different screen sizes\n- **Hardware utilization tracking**\n\n## Usage Examples\n\n### **Current Setup (16 Lockers)**\n\n**Configuration** (`config/system.json`):\n```json\n{\n  \"hardware\": {\n    \"relay_cards\": [\n      {\n        \"slave_address\": 1,\n        \"channels\": 16,\n        \"enabled\": true\n      }\n    ]\n  },\n  \"lockers\": {\n    \"total_count\": 16,\n    \"layout\": {\n      \"rows\": 4,\n      \"columns\": 4\n    }\n  }\n}\n```\n\n**Result**:\n- **Panel**: Shows 16 locker cards with \"Card 1, Relay 1-16\" labels\n- **Kiosk**: Shows 16 tiles in 4×4 grid with \"C1R1\" to \"C1R16\" labels\n- **Statistics**: 1 card, 16 channels, 100% utilization\n\n### **Expanded Setup (32 Lockers)**\n\n**Configuration**:\n```json\n{\n  \"hardware\": {\n    \"relay_cards\": [\n      {\n        \"slave_address\": 1,\n        \"channels\": 16,\n        \"enabled\": true\n      },\n      {\n        \"slave_address\": 2,\n        \"channels\": 16,\n        \"enabled\": true\n      }\n    ]\n  },\n  \"lockers\": {\n    \"total_count\": 32,\n    \"layout\": {\n      \"rows\": 4,\n      \"columns\": 8\n    }\n  }\n}\n```\n\n**Result**:\n- **Panel**: Shows 32 locker cards with proper card/relay mapping\n- **Kiosk**: Shows 32 tiles in 4×8 grid\n- **Statistics**: 2 cards, 32 channels, 100% utilization\n\n## Testing\n\n### **Test Script**\n\n```bash\n# Test the layout service\nnode scripts/test-layout-service.js\n```\n\n**Expected Output**:\n```\n🧪 Testing Locker Layout Service\n================================\n\n📋 Test 1: Generate Locker Layout\n✅ Generated layout with 16 lockers\n   Grid: 4 rows × 4 columns\n   Lockers: 16 configured\n\n📊 Test 3: Hardware Statistics\n✅ Hardware Stats:\n   Total Cards: 1\n   Enabled Cards: 1\n   Total Channels: 16\n   Configured Lockers: 16\n   Utilization: 100%\n\n🎉 All tests completed successfully!\n```\n\n### **Manual Testing**\n\n1. **Panel Interface**:\n   - Go to `http://192.168.1.8:3001/lockers`\n   - Verify hardware statistics show correct values\n   - Check that locker cards show hardware information\n\n2. **Kiosk Interface**:\n   - Go to `http://192.168.1.8:3002`\n   - Verify exactly 16 tiles are shown (not 30)\n   - Check that tiles show \"C1R1\" to \"C1R16\" labels\n\n3. **Hardware Configuration**:\n   - Go to `http://192.168.1.8:3001/hardware-config`\n   - Add a new relay card\n   - Verify UI updates to show more lockers\n\n## Troubleshooting\n\n### **Common Issues**\n\n**Layout Service Not Working**:\n- Check that `config/system.json` exists and is valid\n- Verify ConfigManager is initialized properly\n- Check service logs for errors\n\n**UI Not Updating**:\n- Clear browser cache\n- Check that API endpoints are responding\n- Verify JavaScript console for errors\n\n**Hardware Information Missing**:\n- Check that relay cards have proper configuration\n- Verify that `enabled: true` is set on cards\n- Check that locker count matches available channels\n\n### **Debug Commands**\n\n```bash\n# Test layout service\nnode scripts/test-layout-service.js\n\n# Check configuration\nnode -e \"const {ConfigManager} = require('./shared/dist/services/config-manager'); const cm = ConfigManager.getInstance(); cm.initialize().then(() => console.log(JSON.stringify(cm.getConfiguration(), null, 2)));\"\n\n# Test API endpoints\ncurl http://localhost:3001/api/lockers/layout\ncurl http://localhost:3002/api/ui/layout\n```\n\n## Migration Notes\n\n### **Backward Compatibility**\n\n- ✅ **Fallback support** - Falls back to original rendering if dynamic fails\n- ✅ **Existing APIs** - All existing API endpoints still work\n- ✅ **Database compatibility** - No database schema changes required\n- ✅ **Configuration compatibility** - Works with existing configurations\n\n### **Deployment Steps**\n\n1. **Pull latest code**\n2. **Build services**: `npm run build:panel && npm run build:kiosk`\n3. **Restart services**: `./scripts/start-all-clean.sh`\n4. **Test functionality**: Run test script and manual verification\n5. **Monitor logs**: Check for any errors during startup\n\n## Summary\n\nThe dynamic locker layout implementation provides:\n\n- 🎯 **Perfect hardware consistency** - UI always matches hardware configuration\n- 🔧 **Easy maintenance** - Add hardware without code changes\n- 📈 **Scalability** - Supports any number of relay cards\n- 🛡️ **Reliability** - Fallback support for compatibility\n- 📊 **Monitoring** - Real-time hardware utilization tracking\n- 🎨 **Responsive design** - Automatic grid optimization\n\n**Status**: ✅ **COMPLETE** - Ready for production deployment\n\n**Next Steps**:\n1. Deploy to Raspberry Pi\n2. Test with actual hardware\n3. Monitor performance and adjust as needed\n4. Consider adding more advanced layout options (custom positioning, etc.)"