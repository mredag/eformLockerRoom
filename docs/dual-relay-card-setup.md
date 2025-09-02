# Dual Relay Card Setup Guide

## Problem Solved
When connecting 2 Modbus relay cards to 1 USB-RS485 adapter, both cards were responding to the same commands because they had the same slave address.

## Hardware Configuration

### Physical Setup
```
USB-RS485 Adapter
    ↓
RS485 Bus (A+, B-, GND)
    ├── Relay Card 1 (Slave Address 1)
    └── Relay Card 2 (Slave Address 2)
```

### DIP Switch Configuration

**Card 1 (Slave Address 1):**
- DIP Switches: `00000001` (binary)
- Controls: Lockers 1-16
- Relays: 1-16

**Card 2 (Slave Address 2):**
- DIP Switches: `00000010` (binary) 
- Controls: Lockers 17-32
- Relays: 1-16 (on card 2)

### Locker to Hardware Mapping

The system automatically maps locker IDs to the correct card:

```javascript
// Locker 1-16  → Card 1, Slave Address 1
// Locker 17-32 → Card 2, Slave Address 2

const cardId = Math.ceil(lockerNumber / 16);  // 1 or 2
const relayId = ((lockerNumber - 1) % 16) + 1;  // 1-16 on each card
```

**Examples:**
- Locker 1  → Card 1, Relay 1
- Locker 16 → Card 1, Relay 16
- Locker 17 → Card 2, Relay 1
- Locker 32 → Card 2, Relay 16

## Physical DIP Switch Setup

### Waveshare Relay Cards
Each card has 8 DIP switches for setting the slave address:

**Card 1:** Set to address 1
```
DIP: 1 2 3 4 5 6 7 8
     ↑ ↓ ↓ ↓ ↓ ↓ ↓ ↓
     ON OFF OFF OFF OFF OFF OFF OFF
```

**Card 2:** Set to address 2
```
DIP: 1 2 3 4 5 6 7 8
     ↓ ↑ ↓ ↓ ↓ ↓ ↓ ↓
     OFF ON OFF OFF OFF OFF OFF OFF
```

## Testing Commands

### Test Card 1 (Lockers 1-16)
```bash
# Test locker 5 (Card 1, Relay 5)
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing card 1"}'
```

### Test Card 2 (Lockers 17-32)
```bash
# Test locker 20 (Card 2, Relay 4)
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 20, "staff_user": "test", "reason": "testing card 2"}'
```

## Verification Steps

1. **Power off the Pi**
2. **Set DIP switches** on both cards as shown above
3. **Power on the Pi**
4. **Deploy updated configuration:**
   ```bash
   ssh pi@pi-eform-locker
   cd /home/pi/eform-locker
   git pull origin main
   ./scripts/start-all-clean.sh
   ```
5. **Test each card separately** using the commands above

## Troubleshooting

### If both cards still respond:
- Check DIP switch settings
- Ensure cards are powered off when changing DIP switches
- Verify wiring (A+, B-, GND connections)

### If no cards respond:
- Check USB-RS485 adapter connection
- Verify `/dev/ttyUSB0` exists: `ls -la /dev/ttyUSB*`
- Check service logs: `tail -f logs/kiosk.log`

### Test individual cards:
```bash
# Test basic relay control
node scripts/test-basic-relay-control.js

# Test specific locker ranges
node -e "
const { ModbusController } = require('./app/kiosk/dist/hardware/modbus-controller.js');
const config = require('./config/system.json');

async function test() {
  const controller = new ModbusController(config.hardware.modbus);
  await controller.initialize();
  
  // Test Card 1
  console.log('Testing Card 1 (Locker 5)...');
  await controller.openLocker(5);
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Test Card 2  
  console.log('Testing Card 2 (Locker 20)...');
  await controller.openLocker(20);
}

test().catch(console.error);
"
```

## Configuration Updated
- Total lockers: 16 → 32
- Layout: 4x4 → 8x4
- Added second relay card configuration
- Automatic locker-to-card mapping

The system now properly routes commands to the correct relay card based on locker ID!