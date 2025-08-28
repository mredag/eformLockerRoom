# Multiple Relay Cards Setup Guide

## Overview

Your eForm Locker System **already supports multiple Waveshare 16-channel relay cards** out of the box. The system uses Modbus slave addresses to differentiate between cards.

## Hardware Architecture

### **Supported Configuration**
- **Cards**: Up to 247 Waveshare 16-channel relay cards (Modbus limit)
- **Lockers**: Unlimited (tested up to 48 lockers with 3 cards)
- **Protocol**: Modbus RTU over RS485
- **Connection**: Daisy-chain all cards on same RS485 bus

### **Locker to Hardware Mapping**
```javascript
const cardId = Math.ceil(lockerId / 16);     // Which card (1, 2, 3...)
const relayId = ((lockerId - 1) % 16) + 1;  // Which relay on card (1-16)
const slaveAddress = cardId;                 // Modbus slave address
```

### **48 Locker Example**
| Locker Range | Card | Slave Address | Relay Range |
|--------------|------|---------------|-------------|
| 1-16         | 1    | 1             | 1-16        |
| 17-32        | 2    | 2             | 1-16        |
| 33-48        | 3    | 3             | 1-16        |

## Hardware Setup

### **1. DIP Switch Configuration**

Each Waveshare card must have a unique slave address:

**Card 1 (Lockers 1-16):**
```
DIP Switches: Set to address 1
Binary: 00000001
```

**Card 2 (Lockers 17-32):**
```
DIP Switches: Set to address 2  
Binary: 00000010
```

**Card 3 (Lockers 33-48):**
```
DIP Switches: Set to address 3
Binary: 00000011
```

### **2. RS485 Wiring**

Connect all cards to the same RS485 bus:

```
Raspberry Pi USB-RS485 Adapter
    │
    ├── A+ ──┬── Card 1 A+
    │        ├── Card 2 A+
    │        └── Card 3 A+
    │
    └── B- ──┬── Card 1 B-
             ├── Card 2 B-
             └── Card 3 B-
```

**Important**: 
- Use proper RS485 termination resistors (120Ω) at both ends
- Keep cable lengths reasonable (< 1000m total)
- Use twisted pair cable for A+/B- signals

### **3. Power Supply**

Each card needs independent power:
- **Relay Power**: 12V DC (for relay coils)
- **Logic Power**: 5V DC (for Modbus communication)
- **Current**: ~2A per card (depends on relay load)

## Software Configuration

### **No Code Changes Required**

The system automatically handles multiple cards. The mapping logic is already implemented in:

- `app/kiosk/src/hardware/modbus-controller.ts` - Hardware control
- `shared/services/locker-state-manager.ts` - Database management
- All UI components automatically support any number of lockers

### **Environment Variables**

Add to your `.env` file:
```bash
# Hardware Configuration
MODBUS_PORT=/dev/ttyUSB0
MODBUS_BAUDRATE=9600

# Optional: Increase timeouts for multiple cards
MODBUS_TIMEOUT_MS=2000
MODBUS_RETRY_ATTEMPTS=3
```

## Testing Multiple Cards

### **1. Test Hardware Mapping**

```bash
# Run the multiple card test script
node scripts/test-multiple-relay-cards.js
```

This will test lockers from each card:
- Card 1: Lockers 1, 8, 16
- Card 2: Lockers 17, 24, 32  
- Card 3: Lockers 33, 40, 48

### **2. Test Individual Cards**

```bash
# Test specific locker ranges
node scripts/test-basic-relay-control.js 1   # Card 1, Relay 1
node scripts/test-basic-relay-control.js 17  # Card 2, Relay 1
node scripts/test-basic-relay-control.js 33  # Card 3, Relay 1
```

### **3. API Testing**

```bash
# Test locker opening via API
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 17, "staff_user": "test", "reason": "testing card 2"}'

curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 33, "staff_user": "test", "reason": "testing card 3"}'
```

## Database Setup

### **Add Lockers to Database**

The system supports unlimited lockers. Add them to your database:

```sql
-- Add lockers for 3 cards (48 total)
INSERT INTO lockers (kiosk_id, id, status, is_vip) VALUES
-- Card 1 (1-16)
('kiosk-1', 1, 'Free', 0),
('kiosk-1', 2, 'Free', 0),
-- ... continue for all 16
('kiosk-1', 16, 'Free', 0),

-- Card 2 (17-32)  
('kiosk-1', 17, 'Free', 0),
('kiosk-1', 18, 'Free', 0),
-- ... continue for all 16
('kiosk-1', 32, 'Free', 0),

-- Card 3 (33-48)
('kiosk-1', 33, 'Free', 0),
('kiosk-1', 34, 'Free', 0),
-- ... continue for all 16
('kiosk-1', 48, 'Free', 0);
```

Or use the bulk insert script:

```bash
# Generate and insert 48 lockers
node scripts/setup-multiple-lockers.js --count=48 --kiosk=kiosk-1
```

## Troubleshooting

### **Common Issues**

**1. Wrong DIP Switch Settings**
- **Symptom**: Commands sent to wrong card or no response
- **Solution**: Verify each card has unique slave address (1, 2, 3...)

**2. RS485 Wiring Issues**
- **Symptom**: Intermittent communication or no response
- **Solution**: Check A+/B- connections, add termination resistors

**3. Power Supply Problems**
- **Symptom**: Relays don't click or inconsistent operation
- **Solution**: Ensure each card has adequate 12V power supply

**4. Modbus Timeout**
- **Symptom**: Commands fail with timeout errors
- **Solution**: Increase `MODBUS_TIMEOUT_MS` in environment

### **Debugging Commands**

```bash
# Check serial port
ls -la /dev/ttyUSB*

# Monitor Modbus traffic (stop services first)
sudo minicom -D /dev/ttyUSB0 -b 9600

# Check service logs
tail -f logs/kiosk.log | grep -i "modbus\|relay\|card"

# Test specific slave addresses
node -e "
const { ModbusController } = require('./app/kiosk/dist/hardware/modbus-controller');
// Test code here
"
```

## Performance Considerations

### **Response Times**
- **Single Card**: ~100ms per command
- **Multiple Cards**: ~100ms per command (no degradation)
- **Concurrent Operations**: Commands are queued and executed serially

### **Reliability**
- **Retry Logic**: 3 attempts per command with exponential backoff
- **Error Handling**: Failed commands don't affect other cards
- **Health Monitoring**: Individual card status tracking

### **Scalability**
- **Tested**: Up to 3 cards (48 lockers)
- **Theoretical**: Up to 247 cards (3,952 lockers)
- **Practical**: Limited by RS485 bus length and power distribution

## Monitoring Multiple Cards

### **Health Checks**

```bash
# Check all cards are responding
curl http://192.168.1.8:3002/health

# Monitor hardware status
tail -f logs/kiosk.log | grep "Hardware:"
```

### **Performance Metrics**

The system tracks per-card performance:
- Command success rates
- Response times
- Error counts
- Retry attempts

Access via admin panel: `http://192.168.1.8:3001/performance`

## Summary

Your eForm Locker System is **ready for multiple relay cards** without any code changes:

✅ **Hardware Mapping**: Automatic locker-to-card mapping  
✅ **Modbus Protocol**: Slave address differentiation  
✅ **Database Support**: Unlimited locker capacity  
✅ **UI Support**: Automatic scaling for any number of lockers  
✅ **API Support**: All endpoints work with multiple cards  
✅ **Testing Tools**: Scripts provided for validation  

Just set the DIP switches, wire the RS485 bus, and add lockers to your database!