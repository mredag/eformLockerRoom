# 🍓 Raspberry Pi eForm Locker System Setup Guide
*A Complete Guide for Kids and Beginners*

## 🎯 What We're Building

Imagine a smart locker system like the ones at Amazon pickup locations! We're going to build our own using:
- A tiny computer (Raspberry Pi) as the "brain"
- Special locks that open with electricity
- Cards that you tap to unlock lockers
- A touchscreen to control everything

## 📦 Hardware Shopping List

Here's what you need for the demo (like a recipe for building our system):

### Main Components
- **1× Raspberry Pi 5** + touchscreen (the brain of our system)
- **2× RS485 16-channel Modbus relay cards** (controls up to 32 locks!)
- **1× USB RS485 converter** + 1 spare (translates computer talk to lock talk)
- **1× K02 12V solenoid lock** (the actual lock mechanism)
- **1× 12V Power Supply 10-15A** (gives power to everything)
- **1× USB HID RFID reader** (reads the tap cards)

### Extra Supplies You'll Need
- MicroSD card (32GB or larger)
- Ethernet cable or WiFi setup
- USB cables
- Jumper wires
- Breadboard (for testing)
- Multimeter (to check connections)

## 🔧 Step 1: Prepare Your Raspberry Pi

### Install the Operating System
1. **Download Raspberry Pi Imager** from the official website
2. **Flash Raspberry Pi OS** (64-bit) to your microSD card
3. **Enable SSH and WiFi** during the imaging process
4. **Insert the SD card** and boot up your Pi

### Update Your System
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install git nodejs npm python3-pip -y
```

### Install Node.js 20 (Required for our system)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 🔌 Step 2: Hardware Connections

### Understanding the Components

**Think of it like building with LEGO blocks:**
- Raspberry Pi = The main control block
- RS485 cards = The "muscle" blocks that control locks
- RFID reader = The "eyes" that see your cards
- Power supply = The "energy" block that powers everything

### Connection Diagram

```
Raspberry Pi 5
    ↓ (USB)
USB RS485 Converter
    ↓ (RS485 A/B wires)
RS485 Relay Card #1 (Address 1)
    ↓ (Daisy chain)
RS485 Relay Card #2 (Address 2)
    ↓ (12V power to locks)
Solenoid Locks
```

### Detailed Wiring Steps

#### 1. Connect the RS485 Network
```
USB RS485 Converter → Raspberry Pi USB port

RS485 Converter Terminals:
- A+ → Connect to A+ on first relay card
- B- → Connect to B- on first relay card
- GND → Connect to GND on relay cards

Relay Card #1 → Relay Card #2:
- A+ to A+ (daisy chain)
- B- to B- (daisy chain)
- GND to GND (daisy chain)
```

#### 2. Set Relay Card Addresses
**Important:** Each relay card needs a unique address!
- Card #1: Set DIP switches for address 1
- Card #2: Set DIP switches for address 2

#### 3. Connect Power
```
12V PSU Connections:
- +12V → Relay card VCC terminals
- GND → Relay card GND terminals
- +12V → Solenoid lock positive wire
- Relay NO (Normally Open) → Solenoid lock negative wire
```

#### 4. Connect RFID Reader
```
USB HID RFID Reader → Raspberry Pi USB port
(No additional wiring needed - it works like a keyboard!)
```

## 💻 Step 3: Install the eForm Locker Software

### Clone the Repository
```bash
cd /home/pi
git clone <your-repository-url> eform-locker
cd eform-locker
```

### Install Dependencies
```bash
npm install
```

### Set Up the Database
```bash
# Run database migrations
npm run migrate
```

### Configure the System
```bash
# Copy example configuration
cp config/system.json.example config/system.json

# Edit configuration for your hardware
nano config/system.json
```

### Example Configuration for Raspberry Pi (Waveshare Compatible)
```json
{
  "hardware": {
    "modbus": {
      "port": "/dev/ttyUSB0",
      "baudrate": 9600,
      "timeout_ms": 1000,
      "pulse_duration_ms": 400,
      "burst_duration_seconds": 10,
      "burst_interval_ms": 2000,
      "command_interval_ms": 300,
      "use_multiple_coils": true,
      "verify_writes": false,
      "max_retries": 2
    },
    "relay_cards": [
      {
        "slave_address": 1,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000001"
      },
      {
        "slave_address": 2,
        "channels": 16,
        "type": "waveshare_16ch",
        "dip_switches": "00000010"
      }
    ],
    "rfid": {
      "reader_type": "hid",
      "debounce_ms": 500,
      "scan_timeout_ms": 5000
    }
  },
  "lockers": {
    "totalCount": 32,
    "layout": {
      "rows": 4,
      "columns": 8
    }
  }
}
```

## 🧪 Step 4: Testing Your Setup

### Test 1: Waveshare Hardware Validation
```bash
# Run Waveshare-specific validation
node scripts/validate-waveshare-hardware.js

# Expected output:
# ✅ Port Detection: PASS
# ✅ Communication: PASS  
# ✅ Address Scan: PASS (2 cards)
# ✅ Function Codes: All PASS
# ✅ Timing Accuracy: PASS
# ✅ Multi-Card Test: PASS
```

### Test 1b: General Hardware Diagnostics
```bash
# Run comprehensive hardware diagnostics
node scripts/hardware-diagnostics.js

# This provides an interactive menu for detailed testing
```

### Test 2: Test Individual Lock
```bash
# Test lock on relay card 1, channel 1
node -e "
const ModbusController = require('./app/kiosk/src/hardware/modbus-controller');
const controller = new ModbusController();
controller.activateRelay(1, 1, 3000); // 3 second unlock
"
```

### Test 3: Test RFID Reader
```bash
# Monitor RFID events
node -e "
const RFIDHandler = require('./app/kiosk/src/hardware/rfid-handler');
const rfid = new RFIDHandler();
rfid.on('cardRead', (cardId) => console.log('Card detected:', cardId));
console.log('Tap an RFID card now...');
"
```

## 🚀 Step 5: Start the System

### Start All Services
```bash
# Start the gateway (main controller)
npm run start:gateway &

# Start the kiosk interface
npm run start:kiosk &

# Start the admin panel
npm run start:panel &
```

### Access the Interfaces
- **Kiosk Interface:** http://localhost:3001 (touchscreen)
- **Admin Panel:** http://localhost:3003 (management)
- **API Gateway:** http://localhost:3000 (backend)

## 🎮 Step 6: Demo Time!

### Basic Demo Flow
1. **Power on** everything
2. **Open the kiosk interface** on the touchscreen
3. **Tap an RFID card** on the reader
4. **Watch the system** assign and unlock a locker
5. **Close the locker** and tap the card again to lock it
6. **Use the admin panel** to see all activity

### Cool Demo Features to Show

#### 1. Multi-Language Support
- Switch between English and Turkish
- Show how the interface changes

#### 2. VIP Mode
- Use the admin panel to mark someone as VIP
- Show how VIPs get priority lockers

#### 3. Master PIN Override
- Demonstrate emergency access with master PIN
- Show security logging

#### 4. Real-time Monitoring
- Open the admin panel
- Show live locker status
- Display usage statistics

## 🔍 Troubleshooting Guide

### Problem: "No RS485 device found"
**Solution:**
```bash
# Check USB devices
lsusb
# Look for your RS485 converter

# Check serial ports
ls /dev/ttyUSB*
# Should show /dev/ttyUSB0

# Check permissions
sudo chmod 666 /dev/ttyUSB0
```

### Problem: "Relay not responding"
**Solution:**
1. Check power connections (12V to relay cards)
2. Verify RS485 wiring (A+ to A+, B- to B-)
3. Confirm relay card addresses are set correctly
4. Test with multimeter

### Problem: "RFID not working"
**Solution:**
```bash
# Check input devices
ls /dev/input/event*

# Test RFID as keyboard
cat /dev/input/event0
# Tap card - should show data

# Check permissions
sudo chmod 644 /dev/input/event0
```

### Problem: "Lock doesn't open"
**Solution:**
1. Check 12V power supply output
2. Verify solenoid lock wiring
3. Test relay activation with multimeter
4. Check lock mechanism isn't jammed

## 📚 Understanding the Modbus Protocol

### What is Modbus?
Think of Modbus like a language that computers use to talk to industrial equipment. It's like giving commands to robots!

### Basic Modbus Commands We Use
```javascript
// Turn on relay (unlock locker)
writeCoil(slaveAddress, coilAddress, true)

// Turn off relay (lock locker)  
writeCoil(slaveAddress, coilAddress, false)

// Check relay status
readCoils(slaveAddress, coilAddress, 1)
```

### Relay Card Settings (Waveshare 16CH)
- **Baud Rate:** 9600 (default), configurable via DIP switch 9
- **Data Bits:** 8
- **Stop Bits:** 1  
- **Parity:** None (default), configurable via DIP switch 10
- **Default Address:** 1 (change with DIP switches 1-8)
- **Function Codes:** 0x01 (Read), 0x05 (Write Single), 0x0F (Write Multiple)

### DIP Switch Configuration
**Card #1 (Address 1):** Set switches 1-8 to `00000001`
**Card #2 (Address 2):** Set switches 1-8 to `00000010`
**Baud Rate:** Switch 9 - OFF for 9600 baud
**Parity:** Switch 10 - OFF for no parity

## 🎯 Fun Experiments to Try

### Experiment 1: Light Show
```javascript
// Make all relays blink in sequence
for(let i = 1; i <= 16; i++) {
    setTimeout(() => {
        controller.activateRelay(1, i, 500);
    }, i * 100);
}
```

### Experiment 2: Card Memory Game
- Program different cards to open different lockers
- Create a memory game where kids match cards to lockers

### Experiment 3: Timed Challenges
- Set up automatic lock/unlock sequences
- Create escape room style puzzles

## 🛡️ Safety Tips

### Electrical Safety
- Always turn off power before making connections
- Use a multimeter to verify voltages
- Keep water away from electronics
- Adult supervision required for 12V connections

### Software Safety
- Always backup your configuration
- Test changes on one locker first
- Keep the master PIN secure
- Monitor system logs for errors

## 📖 Next Steps

### Advanced Features to Explore
1. **Add more locks** (up to 32 with current setup)
2. **Integrate cameras** for security monitoring
3. **Add sound effects** for better user experience
4. **Create mobile app** for remote management
5. **Add sensors** to detect if items are placed in lockers

### Learning Opportunities
- Learn about industrial automation
- Understand database design
- Explore web development
- Study security systems
- Practice electronics and wiring

## 🎉 Congratulations!

You've built a professional-grade locker system! This is the same technology used in:
- Amazon pickup lockers
- Gym and school lockers
- Package delivery systems
- Secure storage facilities

Keep experimenting and learning - you're now an IoT engineer! 🚀

---

*Need help? Check the troubleshooting section or ask an adult to help with the technical parts.*