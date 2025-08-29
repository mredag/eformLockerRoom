# Hardware Configuration Guide

## Overview

The eForm Locker System uses a **configuration-driven approach** to manage hardware settings. Instead of hardcoded values, all hardware parameters are defined in `config/system.json`.

## Configuration File Location

```
config/system.json
```

## Key Configuration Sections

### 🔧 **Hardware Section**

```json
{
  "hardware": {
    "modbus": {
      "port": "/dev/ttyUSB0",
      "baudrate": 9600,
      "timeout_ms": 2000,
      "pulse_duration_ms": 400,
      "burst_duration_seconds": 10,
      "burst_interval_ms": 2000,
      "command_interval_ms": 300,
      "use_multiple_coils": true,
      "verify_writes": true,
      "max_retries": 4,
      "retry_delay_base_ms": 1000,
      "connection_retry_attempts": 5,
      "test_mode": false
    },
    "relay_cards": [
      {
        "slave_address": 1,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000001",
        "description": "Main Locker Bank 1-16",
        "enabled": true
      }
    ]
  }
}
```

### 🏠 **Lockers Section**

```json
{
  "lockers": {
    "total_count": 16,
    "reserve_ttl_seconds": 120,
    "offline_threshold_seconds": 60,
    "bulk_operation_interval_ms": 500,
    "master_lockout_fails": 3,
    "master_lockout_minutes": 30,
    "auto_release_hours": 24,
    "maintenance_mode": false,
    "layout": {
      "rows": 4,
      "columns": 4,
      "numbering_scheme": "sequential"
    }
  }
}
```

## Hardware Setup Examples

### **Single 16-Channel Card (Current Setup)**

```json
{
  "hardware": {
    "relay_cards": [
      {
        "slave_address": 1,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000001",
        "description": "Main Locker Bank 1-16",
        "enabled": true
      }
    ]
  },
  "lockers": {
    "total_count": 16,
    "layout": {
      "rows": 4,
      "columns": 4
    }
  }
}
```

### **Two 16-Channel Cards (32 Lockers)**

```json
{
  "hardware": {
    "relay_cards": [
      {
        "slave_address": 1,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000001",
        "description": "Main Locker Bank 1-16",
        "enabled": true
      },
      {
        "slave_address": 2,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000010",
        "description": "Main Locker Bank 17-32",
        "enabled": true
      }
    ]
  },
  "lockers": {
    "total_count": 32,
    "layout": {
      "rows": 4,
      "columns": 8
    }
  }
}
```

### **Three 16-Channel Cards (48 Lockers)**

```json
{
  "hardware": {
    "relay_cards": [
      {
        "slave_address": 1,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000001",
        "description": "Main Locker Bank 1-16",
        "enabled": true
      },
      {
        "slave_address": 2,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000010",
        "description": "Main Locker Bank 17-32",
        "enabled": true
      },
      {
        "slave_address": 3,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000011",
        "description": "Main Locker Bank 33-48",
        "enabled": true
      }
    ]
  },
  "lockers": {
    "total_count": 48,
    "layout": {
      "rows": 6,
      "columns": 8
    }
  }
}
```

## Configuration Management

### **Automatic Configuration**

Use the hardware configuration script:

```bash
# Check current configuration
node scripts/configure-hardware.js

# Add a new relay card
node scripts/configure-hardware.js add-card
```

### **Manual Configuration**

1. **Edit Configuration File**:
   ```bash
   nano config/system.json
   ```

2. **Update Relay Cards**:
   - Add new cards to the `relay_cards` array
   - Set unique `slave_address` for each card
   - Configure correct `dip_switches` binary value

3. **Update Locker Count**:
   - Set `total_count` to match total channels
   - Adjust `layout` for optimal UI display

4. **Restart Services**:
   ```bash
   npm run build:kiosk
   ./scripts/start-all-clean.sh
   ```

## Hardware Mapping Logic

The system automatically maps locker IDs to hardware:

```javascript
// Locker ID → Hardware mapping
const cardId = Math.ceil(lockerId / 16);     // Which card (1, 2, 3...)
const relayId = ((lockerId - 1) % 16) + 1;  // Which relay on card (1-16)
const slaveAddress = cardId;                 // Modbus slave address
```

### **Examples**:
- **Locker 1** → Card 1, Relay 1, Slave Address 1
- **Locker 16** → Card 1, Relay 16, Slave Address 1
- **Locker 17** → Card 2, Relay 1, Slave Address 2
- **Locker 32** → Card 2, Relay 16, Slave Address 2

## DIP Switch Configuration

Each relay card needs unique slave address:

| Card | Slave Address | DIP Switches | Binary |
|------|---------------|--------------|--------|
| 1    | 1             | 00000001     | 1      |
| 2    | 2             | 00000010     | 2      |
| 3    | 3             | 00000011     | 3      |
| 4    | 4             | 00000100     | 4      |

## Validation and Testing

### **Configuration Validation**

The system automatically validates:
- ✅ Unique slave addresses
- ✅ Valid channel counts
- ✅ Proper DIP switch settings
- ✅ Total count matches hardware

### **Hardware Testing**

```bash
# Test specific locker
node scripts/test-basic-relay-control.js 5

# Test all cards
node scripts/test-multiple-relay-cards.js

# API test
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing"}'
```

## Benefits of Configuration-Driven Approach

### ✅ **Advantages**:
- **No Code Changes**: Add hardware without modifying code
- **Automatic Validation**: System checks configuration consistency
- **Easy Scaling**: Add cards by updating configuration
- **Centralized Management**: All settings in one place
- **Environment Agnostic**: Same code works with different hardware

### 🔧 **Easy Expansion**:
1. Add new relay card to `relay_cards` array
2. Update `total_count` to match total channels
3. Restart services
4. System automatically handles new lockers

## Troubleshooting

### **Common Issues**:

**1. Wrong Locker Count**
- **Symptom**: UI shows wrong number of lockers
- **Solution**: Check `lockers.total_count` matches enabled relay channels

**2. Hardware Not Responding**
- **Symptom**: Relays don't activate
- **Solution**: Verify `relay_cards` configuration matches physical DIP switches

**3. Configuration Validation Errors**
- **Symptom**: Service won't start
- **Solution**: Run `node scripts/configure-hardware.js` to check configuration

### **Debug Commands**:

```bash
# Check configuration
node scripts/configure-hardware.js

# Validate configuration
node -e "
const { ConfigManager } = require('./shared/services/config-manager');
const cm = ConfigManager.getInstance();
cm.initialize().then(() => {
  const config = cm.getConfiguration();
  console.log('Total Lockers:', config.lockers.total_count);
  console.log('Relay Cards:', config.hardware.relay_cards.length);
});
"

# Test hardware mapping
node -e "
for (let i = 1; i <= 32; i++) {
  const cardId = Math.ceil(i / 16);
  const relayId = ((i - 1) % 16) + 1;
  console.log(\`Locker \${i} → Card \${cardId}, Relay \${relayId}\`);
}
"
```

## Summary

The eForm Locker System now uses **configuration-driven hardware management**:

- 🔧 **All settings** in `config/system.json`
- 🚀 **No hardcoded values** in the code
- 📈 **Easy scaling** by updating configuration
- ✅ **Automatic validation** and error checking
- 🛠️ **Management tools** for easy configuration

Your current setup (16 lockers, 1 relay card) is now properly configured and ready to expand as needed!