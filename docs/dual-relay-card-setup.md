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

## Software-Based Slave Address Configuration

### Waveshare Modbus RTU Relay 16CH (Official Method)
The Waveshare Modbus RTU Relay 16CH does **NOT use DIP switches** for slave address configuration. Instead, the slave address is set via software using Modbus commands.

**Key Facts:**
- **Default slave address**: 1 (factory setting)
- **Address storage**: Register 0x4000 in each device
- **Configuration method**: Write Single Register (Function 0x06)
- **Address range**: 1-255 (0 is reserved for broadcast)

### Configuration Process

**CRITICAL**: Connect only **ONE relay card at a time** when setting addresses!

#### Step 1: Configure Card 1 (Slave Address 1)
```bash
# Connect only Card 1 to USB-RS485 adapter
# Run configuration script
cd /home/pi/eform-locker
node scripts/configure-relay-slave-addresses.js 1
```

#### Step 2: Configure Card 2 (Slave Address 2)  
```bash
# Disconnect Card 1, connect only Card 2
# Run configuration script
node scripts/configure-relay-slave-addresses.js 2
```

#### Step 3: Connect Both Cards
After both cards are configured with unique addresses, connect both to the RS485 bus.

### Manual Configuration Commands

If you prefer manual configuration using SSCOM or similar tools:

**Set Card to Slave Address 1:**
```
Command: 00 06 40 00 00 01 5C 1B
- 00: Broadcast address (all devices respond)
- 06: Write Single Register function
- 40 00: Register 0x4000 (slave address storage)
- 00 01: New slave address (1)
- 5C 1B: CRC16 checksum
```

**Set Card to Slave Address 2:**
```
Command: 00 06 40 00 00 02 1C 1A
- 00: Broadcast address
- 06: Write Single Register function  
- 40 00: Register 0x4000
- 00 02: New slave address (2)
- 1C 1A: CRC16 checksum
```

### Verification Commands

**Read slave address from Card 1:**
```
Command: 01 03 40 00 00 01 [CRC]
Response: 01 03 02 00 01 [CRC] (address = 1)
```

**Read slave address from Card 2:**
```
Command: 02 03 40 00 00 01 [CRC]  
Response: 02 03 02 00 02 [CRC] (address = 2)
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

## Official Waveshare Testing Tools

### SSCOM Serial Port Debugging Assistant (Recommended for first test)
Download SSCOM and test individual cards:
1. Open SSCOM, set port to your USB-RS485 adapter
2. Set baud rate to 9600
3. Use SendHEX mode with ModbusCRC16 checksum
4. Test Card 1: Send `01 05 00 04 FF 00` (will auto-add CRC)
5. Test Card 2: Send `02 05 00 04 FF 00` (will auto-add CRC)

### Modbus Poll Software
For visual register monitoring:
1. Setup -> Read/Write Definition
2. Set Slave ID to 1 (for Card 1) or 2 (for Card 2)  
3. Function: 01 Read Coils, Quantity: 16
4. Connection -> Connect, set baud rate 9600, 8 data bits, no parity

## Troubleshooting

### If both cards still respond:
- **Check DIP switch settings** - This is the most common issue
- Ensure cards are powered off when changing DIP switches
- Verify wiring (A-A, B-B connections as per Waveshare docs)
- Test with SSCOM tool to verify each card responds to correct slave address

### If no cards respond:
- Check USB-RS485 adapter connection
- Verify `/dev/ttyUSB0` exists: `ls -la /dev/ttyUSB*`
- Check service logs: `tail -f logs/kiosk.log`
- Ensure proper RS485 level conversion (not direct Pi serial connection)

### Test individual cards:
```bash
# Test basic relay control (if services are stopped)
node scripts/testing/test-basic-relay-control.js

# Test with official Waveshare commands (using SSCOM or direct serial)
# Card 1, Relay 5 ON:  01 05 00 04 FF 00 [CRC auto-calculated]
# Card 1, Relay 5 OFF: 01 05 00 04 00 00 [CRC auto-calculated]
# Card 2, Relay 5 ON:  02 05 00 04 FF 00 [CRC auto-calculated]
# Card 2, Relay 5 OFF: 02 05 00 04 00 00 [CRC auto-calculated]

# Test via our API (services running)
curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 5, "staff_user": "test", "reason": "testing card 1"}'

curl -X POST http://192.168.1.8:3002/api/locker/open \
  -H "Content-Type: application/json" \
  -d '{"locker_id": 20, "staff_user": "test", "reason": "testing card 2"}'
```

## Configuration Updated
- Total lockers: 16 → 32
- Layout: 4x4 → 8x4
- Added second relay card configuration
- Automatic locker-to-card mapping

The system now properly routes commands to the correct relay card based on locker ID!