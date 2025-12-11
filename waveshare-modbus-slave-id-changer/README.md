# Waveshare Modbus Slave ID Changer

A Windows utility for configuring slave addresses on Waveshare Modbus RTU Relay cards (16CH and 32CH models).

## 🚀 Two Versions Available

### Option 1: Portable Executable (Recommended for End Users)
- **No installation required** - Single .exe file
- **No dependencies** - Works on any Windows PC
- **Easy distribution** - Just copy and run
- **Location**: `portable/` folder

### Option 2: Node.js Version (For Developers)
- **Full featured** - Command line options
- **Requires Node.js** - Development environment
- **Scriptable** - Automation friendly
- **Location**: Root folder

## Supported Hardware

- Waveshare Modbus RTU Relay 16CH
- Waveshare Modbus RTU Relay 32CH
- Any Waveshare relay card using register `0x4000` for slave address storage

## Quick Start

### For End Users (Portable Version)

1. **Get the executable**:
   ```powershell
   cd waveshare-modbus-slave-id-changer\portable
   build_executable.bat
   ```

2. **Run the tool**:
   - Double-click `dist\WaveshareModbusSlaveChanger.exe`
   - No installation needed!

### For Developers (Node.js Version)

1. **Install dependencies**:
   ```powershell
   cd waveshare-modbus-slave-id-changer
   npm install
   ```

2. **Run interactive mode**:
   ```powershell
   npm start
   ```

## Usage

### Interactive Mode (Recommended)

```powershell
npm start
# or
node index.js
```

This will guide you through:
1. Selecting COM port
2. Scanning for connected devices
3. Reading current slave address
4. Setting new slave address

### Command Line Mode

```powershell
# Scan for devices on COM3
node index.js scan --port COM3

# Read current address (using broadcast)
node index.js read --port COM3

# Set new slave address (from current address 1 to new address 2)
node index.js set --port COM3 --current 1 --new 2

# Set using broadcast (when only ONE card is connected)
node index.js set --port COM3 --broadcast --new 2
```

## Important Notes

### Single Card Configuration

When setting a new slave address using broadcast mode (`--broadcast`), **only ONE card should be connected** to the RS485 bus. Otherwise, all connected cards will receive the same address.

### Configuration Process for Multiple Cards

1. Connect only Card 1 to the adapter
2. Set Card 1 to desired address (e.g., address 1)
3. Disconnect Card 1
4. Connect Card 2
5. Set Card 2 to different address (e.g., address 2)
6. Connect both cards to the RS485 bus

### Address Range

- Valid addresses: 1-247
- Address 0 is reserved for broadcast (configuration only)
- Address 248-255 are reserved

## Technical Details

### Modbus Commands Used

| Function | Code | Description |
|----------|------|-------------|
| Read Holding Register | 0x03 | Read current slave address from register 0x4000 |
| Write Single Register | 0x06 | Write new slave address to register 0x4000 |

### Register Information

- **Register Address**: 0x4000 (16384 decimal)
- **Data Type**: 16-bit unsigned integer
- **Default Value**: 1 (factory setting)
- **Persistence**: Stored in non-volatile memory (survives power cycles)

## Troubleshooting

### No Response from Device

1. Check USB-RS485 adapter connection
2. Verify COM port in Device Manager
3. Ensure correct wiring (A-A, B-B)
4. Try different baud rate (default: 9600)

### Multiple Devices Responding

- Only connect ONE device when using broadcast mode
- Use specific slave address for targeted configuration

### Permission Errors

- Run PowerShell as Administrator
- Check if another application is using the COM port

## License

MIT - Part of eForm Locker System
