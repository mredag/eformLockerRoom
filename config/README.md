# Configuration

## Files

- **`system.json`** - Main system configuration (auto-generated with defaults)
- **`pi-ip-config.json`** - Network configuration for Pi deployment

## How It Works

The system uses a single `system.json` file that gets created automatically with sensible defaults. You don't need to manage multiple config files.

## Key Settings

The config manager loads `system.json` and provides these main settings:

- **Services**: Gateway (3000), Kiosk (3001), Panel (3002)
- **Hardware**: Modbus port `/dev/ttyUSB0`, relay cards, RFID reader
- **Lockers**: Total count, timeouts, layout
- **Security**: Rate limits, secrets (auto-generated for production)

## Making Changes

Configuration changes are made through the admin panel or API calls, not by editing files directly. The system validates and saves changes automatically.

## Production Setup

The system automatically generates secure secrets when running in production mode. No manual configuration needed.