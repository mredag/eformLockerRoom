# Eform Locker System Configuration

This directory contains configuration files for the Eform Locker System running on Raspberry Pi.

## Configuration Files

### `system.json`
Main system configuration with all default settings optimized for Raspberry Pi hardware.

### `production.json`
Production environment overrides with security hardening and performance optimizations.

### `development.json`
Development environment overrides with debugging enabled and relaxed security.

## Quick Setup

### For Production (Raspberry Pi)
```bash
# Generate production config with secure secrets
npm run config:setup

# Validate the configuration
npm run config:validate

# View current configuration
npm run config:show
```

### For Development
```bash
# Setup development configuration
npm run config:setup-dev

# Validate development config
node scripts/setup-config.js validate development
```

## Key Configuration Sections

### System Information
- **name**: System identifier
- **version**: Current system version
- **environment**: production/development/test
- **location**: Physical installation location

### Services
- **gateway**: Port 3000 - Main API gateway
- **kiosk**: Port 3001 - Touch screen interface
- **panel**: Port 3003 - Admin web panel
- **agent**: Update and monitoring agent

### Hardware
- **modbus**: RS485/Modbus RTU configuration for relay cards
- **relay_cards**: Waveshare 16CH relay card definitions
- **rfid**: RFID reader configuration (HID/keyboard modes)
- **display**: Touchscreen display settings

### Security
- **secrets**: Cryptographic keys (auto-generated for production)
- **rate_limits**: API and hardware access rate limiting
- **audit**: Security event logging
- **encryption**: Data encryption settings

### Lockers
- **total_count**: Number of physical lockers (32 default)
- **layout**: Physical arrangement (4x8 grid)
- **timeouts**: Reservation and auto-release timers
- **maintenance_mode**: System-wide maintenance flag

## Hardware Configuration

### Relay Cards (Waveshare 16CH)
```json
{
  "slave_address": 1,
  "channels": 16,
  "type": "waveshare_16ch",
  "dip_switches": "00000001",
  "description": "Main Locker Bank 1-16"
}
```

### RFID Reader
```json
{
  "reader_type": "hid",
  "debounce_ms": 1000,
  "auto_detect": true,
  "fallback_to_keyboard": true
}
```

### Modbus RTU
```json
{
  "port": "/dev/ttyUSB0",
  "baudrate": 9600,
  "timeout_ms": 2000,
  "use_multiple_coils": true,
  "verify_writes": true
}
```

## Security Configuration

### Production Secrets
The system automatically generates secure secrets for production:
- **provisioning_secret**: System provisioning authentication
- **session_secret**: Web session encryption
- **qr_hmac_secret**: QR code token signing

### Rate Limiting
- **ip_per_minute**: 20 requests per IP
- **card_per_minute**: 30 RFID scans per card
- **locker_per_minute**: 3 locker operations per user
- **device_per_20_seconds**: 1 hardware command per device

## Monitoring & Maintenance

### Health Monitoring
- CPU, memory, disk usage alerts
- Hardware temperature monitoring
- Network connectivity checks
- Service availability monitoring

### Backup Configuration
- **schedule**: Daily at 2 AM (cron: "0 2 * * *")
- **retention**: 7 days of backups
- **compression**: Enabled for space efficiency
- **path**: ./backups directory

### Logging
- **level**: info (production), debug (development)
- **retention**: 90 days
- **rotation**: Daily with compression
- **audit**: All security events logged

## Environment Variables

You can override configuration using environment variables:

```bash
# Database path
export EFORM_DB_PATH="/custom/path/eform.db"

# Service ports
export EFORM_GATEWAY_PORT=3000
export EFORM_KIOSK_PORT=3001
export EFORM_PANEL_PORT=3003

# Hardware
export EFORM_MODBUS_PORT="/dev/ttyUSB0"
export EFORM_RFID_TYPE="hid"

# Security
export EFORM_PROVISIONING_SECRET="your-secret-here"
export EFORM_SESSION_SECRET="your-session-secret"
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check that ports 3000, 3001, 3003 are available
2. **Hardware not detected**: Verify USB devices with `lsusb`
3. **Permission errors**: Ensure user is in dialout, gpio groups
4. **Config validation fails**: Run `npm run config:validate` for details

### Validation Commands
```bash
# Check configuration syntax
npm run config:validate

# Test hardware connectivity
npm run test:hardware

# Verify all services can start
npm run test:integration
```

## Production Deployment Checklist

- [ ] Run `npm run config:setup` to generate secure secrets
- [ ] Validate configuration with `npm run config:validate`
- [ ] Test hardware with `npm run test:hardware`
- [ ] Configure systemd services
- [ ] Set up log rotation
- [ ] Configure firewall rules
- [ ] Test backup and restore procedures
- [ ] Document system-specific settings

## Support

For configuration issues:
1. Check the validation output: `npm run config:validate`
2. Review system logs: `journalctl -u eform-*`
3. Test hardware connectivity: `npm run test:hardware`
4. Consult the troubleshooting guide in docs/