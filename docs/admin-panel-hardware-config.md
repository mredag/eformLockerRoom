# Admin Panel Hardware Configuration

## Overview

The **Hardware Configuration** interface in the admin panel provides a user-friendly way to manage your eForm Locker System's hardware settings without needing to remember command-line scripts or edit configuration files manually.

## Accessing the Interface

1. **Login to Admin Panel**: `http://192.168.1.8:3001`
2. **Navigate to Hardware Config**: Click "🔧 Donanım Yapılandırması" in the navigation menu
3. **Or direct URL**: `http://192.168.1.8:3001/hardware-config`

## Features

### 📊 **Hardware Statistics Dashboard**
- **Total Lockers**: Current configured locker count
- **Relay Cards**: Number of relay cards configured
- **Total Channels**: Available relay channels from enabled cards
- **Active Cards**: Number of enabled relay cards

### ⚠️ **Configuration Mismatch Detection**
- Automatically detects when locker count doesn't match available hardware channels
- Shows warning with "Auto-Fix" button for easy correction
- Prevents hardware underutilization

### 🔧 **Modbus Configuration**
Configure your RS485/Modbus communication:
- **Serial Port**: `/dev/ttyUSB0` (or your specific port)
- **Baud Rate**: 9600, 19200, 38400, 57600, 115200
- **Timeout**: Response timeout in milliseconds
- **Pulse Duration**: How long to activate relays (100-2000ms)
- **Command Interval**: Delay between commands
- **Max Retries**: Number of retry attempts
- **Advanced Options**: Multiple coils, write verification

### 🏠 **Locker Configuration**
Manage your locker settings:
- **Total Locker Count**: Number of lockers in system
- **Reservation Time**: How long reservations last
- **Layout**: Grid layout (rows × columns)
- **Numbering Scheme**: Sequential or grid-based
- **Auto-Release**: Automatic release after hours
- **Maintenance Mode**: Disable all lockers for maintenance

### 🔌 **Relay Cards Management**
Visual management of your relay cards:
- **Add/Remove Cards**: Easy card management
- **Slave Address**: Modbus slave address (1-247)
- **Channel Count**: 8, 16, or 32 channels per card
- **DIP Switch Display**: Shows required DIP switch settings
- **Enable/Disable**: Turn cards on/off without removing
- **Description**: Custom descriptions for each card

### 🧪 **Hardware Testing**
Built-in testing tools:
- **Single Locker Test**: Test specific locker by ID
- **Bulk Test**: Test all lockers sequentially
- **Modbus Connection Test**: Verify communication
- **Emergency Stop**: Close all relays immediately

## Usage Examples

### **Adding a New Relay Card**

1. **Click "Kart Ekle"** button in the Relay Cards section
2. **Configure the new card**:
   - Slave Address: Automatically assigned (next available)
   - Channels: Select 16 for Waveshare 16-channel cards
   - Description: Update to describe the card location
3. **Note the DIP Switch setting** displayed (e.g., "00000010" for card 2)
4. **Set DIP switches** on physical card to match
5. **Click "Kaydet"** to save configuration
6. **Restart services** for changes to take effect

### **Configuring for Single 16-Channel Card**

1. **Verify Relay Cards section** shows one card:
   - Slave Address: 1
   - Channels: 16
   - DIP Switches: 00000001
   - Enabled: ✓
2. **Set Total Locker Count** to 16
3. **Update Layout** to 4 rows × 4 columns
4. **Click "Kaydet"**

### **Expanding to Multiple Cards**

1. **Add second card** with "Kart Ekle"
2. **Configure DIP switches** on physical card to address 2
3. **Update Total Locker Count** to 32 (or use Auto-Fix)
4. **Adjust Layout** to 4 rows × 8 columns
5. **Test hardware** with bulk test feature

### **Troubleshooting Hardware Issues**

1. **Check Hardware Statistics** for mismatches
2. **Use Modbus Connection Test** to verify communication
3. **Test individual lockers** to isolate problems
4. **Check DIP switch settings** match configuration
5. **Use Emergency Stop** if relays are stuck

## Configuration Validation

The system automatically validates:
- ✅ **Unique slave addresses** (no conflicts)
- ✅ **Valid port and timing settings**
- ✅ **Reasonable timeout values**
- ✅ **Proper channel counts**
- ⚠️ **Configuration mismatches** (with auto-fix suggestions)

## Auto-Fix Feature

When the system detects configuration mismatches:
1. **Warning appears** at top of page
2. **Click "Otomatik Düzelt"** to fix automatically
3. **System updates**:
   - Total locker count to match available channels
   - Layout for optimal UI display
4. **Save configuration** to apply changes

## Best Practices

### 🔧 **Hardware Setup**
- **Plan slave addresses** before installing cards
- **Set DIP switches** before powering on cards
- **Use proper RS485 termination** resistors
- **Test each card individually** before bulk operations

### ⚙️ **Configuration Management**
- **Always save** after making changes
- **Test configuration** before deploying to production
- **Use descriptive names** for relay cards
- **Document your setup** for future reference

### 🚀 **Deployment**
- **Make changes during maintenance windows**
- **Restart services** after configuration changes
- **Verify hardware** with test functions
- **Monitor logs** for any issues

## Integration with Existing System

The hardware configuration interface:
- ✅ **Reads from** `config/system.json`
- ✅ **Updates configuration** through ConfigManager
- ✅ **Validates changes** before applying
- ✅ **Logs all changes** for audit trail
- ✅ **Works with existing** command-line tools

## Troubleshooting

### **Common Issues**

**Configuration Not Saving**
- Check file permissions on `config/system.json`
- Verify admin panel has write access
- Check browser console for errors

**Hardware Tests Failing**
- Verify kiosk service is running
- Check Modbus connection and DIP switches
- Test with command-line tools first

**UI Not Loading**
- Clear browser cache
- Check admin panel service logs
- Verify all routes are registered

**Changes Not Taking Effect**
- Restart all services after configuration changes
- Check that configuration file was updated
- Verify kiosk service reads new configuration

### **Getting Help**

1. **Check service logs**: `tail -f logs/*.log`
2. **Test with CLI tools**: `node scripts/test-basic-relay-control.js`
3. **Verify configuration**: `node scripts/configure-hardware.js`
4. **Check hardware connections**: Physical inspection

## Summary

The Hardware Configuration interface provides:

- 🖥️ **User-friendly web interface** instead of command-line scripts
- 🔧 **Visual relay card management** with DIP switch guidance
- 📊 **Real-time hardware statistics** and mismatch detection
- 🧪 **Built-in testing tools** for validation
- ⚙️ **Automatic configuration validation** and suggestions
- 💾 **Safe configuration management** with audit logging

No more remembering JavaScript file names or editing JSON files manually - everything is now accessible through the admin panel!