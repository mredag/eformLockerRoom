# Portable Waveshare Modbus Slave ID Changer

This is a **completely portable** version that creates a single `.exe` file requiring **no installation** on target computers.

## Quick Start (For End Users)

If someone already built the executable for you:

1. Get the `WaveshareModbusSlaveChanger.exe` file
2. Connect your USB-RS485 adapter and Waveshare relay card
3. Double-click the `.exe` file
4. Follow the interactive menu

**That's it!** No Python, Node.js, or any other software needs to be installed.

## Building Options (Choose One)

### Option 1: Auto-Installing Builder (Recommended)
**Automatically installs Python if needed:**

```cmd
cd waveshare-modbus-slave-id-changer\portable
BUILD.bat
```

This will:
- Check if Python is installed
- Auto-download and install Python if missing
- Build the portable executable
- **No manual steps required!**

### Option 2: PowerShell Builder (Advanced)
**Better error handling and progress:**

```powershell
cd waveshare-modbus-slave-id-changer\portable
.\Build-Executable.ps1
```

Options:
- `.\Build-Executable.ps1 -AutoInstall` - Skip prompts, auto-install Python
- `.\Build-Executable.ps1 -Force` - Force rebuild even if Python exists

### Option 3: Fully Portable (No Installation Ever)
**Creates a folder that works anywhere:**

```powershell
.\create-fully-portable.ps1
```

This creates a `WaveshareModbusChanger-Portable` folder containing:
- Embedded Python (no system installation)
- All dependencies included
- Just copy folder and run `START.bat`

### Option 4: Manual Build (Original)
**If you already have Python installed:**

```cmd
build_executable.bat
```

## Results

All methods create:
- **Single .exe**: `dist\WaveshareModbusSlaveChanger.exe` (15-20MB)
- **Portable folder**: Complete package with embedded Python
- **Zero dependencies**: Works on any Windows PC

## Features

✅ **No Installation Required** - Single executable file  
✅ **Interactive Menu** - Easy-to-use interface  
✅ **COM Port Detection** - Automatically finds USB-RS485 adapters  
✅ **Device Scanning** - Find existing relay cards  
✅ **Broadcast Mode** - Configure cards with unknown addresses  
✅ **Relay Testing** - Verify connections work  
✅ **Safe Operation** - Warnings for broadcast mode  

## Usage Examples

### Setting Up Your New 32CH Card

1. **Connect only the new card** to USB-RS485 adapter
2. Run `WaveshareModbusSlaveChanger.exe`
3. Select your COM port (e.g., COM3)
4. Choose "Change Slave Address"
5. Select "Use broadcast" method
6. Enter new address (e.g., 3 for third card)
7. Confirm the operation

### Scanning for Existing Cards

1. Connect your USB-RS485 adapter to the relay network
2. Run the executable
3. Select COM port
4. Choose "Scan for Devices"
5. Enter range (e.g., 1 to 10)
6. See which addresses respond

### Testing a Card

1. Connect to the relay network
2. Run the executable
3. Select COM port
4. Choose "Test Relay"
5. Enter slave address and relay number
6. Watch the relay activate and deactivate

## Technical Details

- **Protocol**: Modbus RTU over RS485
- **Baud Rate**: 9600 (standard for Waveshare cards)
- **Register**: 0x4000 (slave address storage)
- **Address Range**: 1-247 (0 reserved for broadcast)
- **Supported Cards**: 16CH and 32CH Waveshare Modbus RTU Relay cards

## File Structure After Build

```
portable/
├── modbus_slave_changer.py     # Source code
├── requirements.txt            # Python dependencies
├── build_executable.bat        # Build script
├── README.md                   # This file
├── build/                      # Temporary build files
└── dist/
    └── WaveshareModbusSlaveChanger.exe  # ← The portable executable
```

## Troubleshooting

### "Python is not installed"
- Install Python from https://python.org
- Make sure to check "Add Python to PATH" during installation

### "No COM ports found"
- Check USB-RS485 adapter connection
- Install adapter drivers if needed
- Check Device Manager for COM port numbers

### "No response from device"
- Verify wiring (A-A, B-B connections)
- Check power supply to relay card
- Try different slave addresses (1, 2, 3...)
- Use broadcast mode if address is unknown

### Build Fails
- Make sure you have internet connection
- Try running as Administrator
- Check Python version: `python --version`

## Advantages of Portable Version

| Feature | Node.js Version | Portable Version |
|---------|----------------|------------------|
| Installation Required | ✅ Node.js + npm | ❌ None |
| File Count | Multiple files | Single .exe |
| Dependencies | External packages | Self-contained |
| Distribution | Git clone + setup | Copy single file |
| User Experience | Technical setup | Double-click to run |

## Security Note

The executable is built from the Python source code in this folder. You can inspect `modbus_slave_changer.py` to see exactly what it does before building or running it.