# Eform Update Agent

The Update Agent handles automatic system updates with security verification for the Eform Locker System.

## Features

- **Automatic Updates**: Checks for updates every 30 minutes
- **Security Verification**: 
  - SHA256 checksum validation
  - Minisign signature verification
- **Safe Application**: 
  - Service stop/start management
  - Automatic backup creation
  - Health verification after updates
  - Automatic rollback on failure

## Security

The update system uses a two-layer security approach:

1. **SHA256 Checksum**: Ensures package integrity during download
2. **Minisign Signature**: Verifies package authenticity using public key cryptography

Both checks must pass before any update is applied.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the service:
   ```bash
   npm run build
   ```

3. Install systemd service:
   ```bash
   sudo cp eform-agent.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable eform-agent
   sudo systemctl start eform-agent
   ```

## Configuration

The agent requires:

- **Public Key**: `/opt/eform/config/update-key.pub` - Minisign public key for signature verification
- **Update Server**: Panel server must provide `/api/updates/check` endpoint
- **Permissions**: Write access to `/opt/eform` and `/tmp/eform-updates`

## Update Process

1. **Check**: Query panel server for available updates
2. **Download**: Fetch update package from provided URL
3. **Verify**: Validate SHA256 checksum and minisign signature
4. **Backup**: Create backup of current installation
5. **Apply**: Stop services, extract update, run migrations
6. **Verify**: Start services and check health endpoints
7. **Rollback**: Restore backup if health check fails

## Monitoring

The agent logs all operations to systemd journal:

```bash
# View logs
sudo journalctl -u eform-agent -f

# Check status
sudo systemctl status eform-agent
```

## Testing

Run the test suite:

```bash
npm test
```

## Development

Start in development mode:

```bash
npm run dev
```

## Security Considerations

- The agent runs with minimal privileges
- Update packages must be signed with the correct private key
- All operations are logged for audit purposes
- Failed updates automatically rollback to prevent system corruption
- Health checks ensure system stability after updates