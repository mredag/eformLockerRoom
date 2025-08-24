# 🔧 Configuration Distribution System

The Configuration Distribution System provides centralized management and distribution of system configuration to all kiosks in the Eform Locker System. It implements version control, hash verification, atomic application, and rollback capabilities.

**Status:** ✅ Fully Implemented and Production Ready  
**Last Updated:** January 2025  
**Language:** Turkish UI with English documentation

## Features

### ✅ Config Push Mechanism
- **Version Control**: Each configuration package has a unique version identifier
- **Hash Control**: SHA256 hash verification ensures configuration integrity
- **Targeted Deployment**: Deploy to specific kiosks, zones, or all kiosks
- **Status Tracking**: Real-time tracking of deployment status across all kiosks

### ✅ Atomic Configuration Apply
- **Atomic Operations**: Configuration changes are applied atomically
- **Validation**: Configuration syntax and structure validation before apply
- **Health Checks**: Service health verification after configuration changes
- **Failure Handling**: Automatic rollback on application failures

### ✅ Rollback Capability
- **Automatic Rollback**: Failed configurations automatically rollback to previous state
- **Manual Rollback**: Staff can manually trigger rollbacks when needed
- **State Preservation**: Previous configuration state is preserved for rollback
- **Audit Trail**: All rollback operations are logged with reasons

### ✅ Read-Only Configuration Display
- **Web Interface**: Browser-based configuration panel at `/config-panel`
- **Real-Time Status**: Live kiosk configuration status monitoring
- **Deployment History**: Complete history of configuration deployments
- **Multi-Tab Interface**: Organized display of current config, kiosk status, and history

## Architecture

### Database Schema

```sql
-- Configuration Packages
CREATE TABLE configuration_packages (
  version TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  config TEXT NOT NULL, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL
);

-- Configuration Deployments
CREATE TABLE configuration_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_version TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  kiosk_id TEXT, -- NULL for all kiosks
  zone TEXT, -- NULL for all zones
  status TEXT NOT NULL DEFAULT 'pending',
  deployed_at DATETIME,
  error TEXT,
  rollback_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL
);

-- Kiosk Configuration Status
CREATE TABLE kiosk_config_status (
  kiosk_id TEXT PRIMARY KEY,
  current_config_version TEXT,
  current_config_hash TEXT,
  pending_config_version TEXT,
  pending_config_hash TEXT,
  last_config_update DATETIME,
  config_status TEXT NOT NULL DEFAULT 'up_to_date'
);
```

### Configuration Status States

- **`up_to_date`**: Kiosk has the latest configuration applied
- **`pending_update`**: Configuration deployment is pending
- **`updating`**: Configuration is currently being applied
- **`failed`**: Configuration application failed
- **`rollback_required`**: Manual rollback is required

## API Endpoints

### Panel Endpoints (Staff Management)

```typescript
// Get default configuration template
GET /api/configuration/default

// Create new configuration package
POST /api/configuration/packages
{
  "config": SystemConfig,
  "created_by": "admin-user"
}

// Get configuration package by version
GET /api/configuration/packages/:version

// List all configuration packages
GET /api/configuration/packages

// Deploy configuration to kiosks
POST /api/configuration/deploy
{
  "config_version": "config-2025-01-01T00-00-00-000Z-abc123",
  "target": {
    "kiosk_id": "kiosk-1", // OR
    "zone": "zone-a"       // OR omit for all kiosks
  },
  "created_by": "admin-user"
}

// List all kiosk configuration statuses
GET /api/configuration/kiosks/status

// Get deployment history
GET /api/configuration/deployments?limit=50
```

### Kiosk Endpoints (Called by Kiosks)

```typescript
// Get pending configuration for kiosk
GET /api/configuration/kiosks/:kiosk_id/pending

// Apply configuration (after successful download)
POST /api/configuration/kiosks/:kiosk_id/apply
{
  "config_version": "config-2025-01-01T00-00-00-000Z-abc123",
  "config_hash": "sha256-hash"
}

// Rollback configuration (on failure)
POST /api/configuration/kiosks/:kiosk_id/rollback
{
  "reason": "Configuration apply failed: service restart timeout"
}

// Get kiosk configuration status
GET /api/configuration/kiosks/:kiosk_id/status
```

## Configuration Structure

### System Configuration Parameters

```typescript
interface SystemConfig {
  // Locker Management
  BULK_INTERVAL_MS: number;           // Default: 300
  RESERVE_TTL_SECONDS: number;        // Default: 90
  OPEN_PULSE_MS: number;              // Default: 400
  OPEN_BURST_SECONDS: number;         // Default: 10
  OPEN_BURST_INTERVAL_MS: number;     // Default: 2000
  
  // Security
  MASTER_LOCKOUT_FAILS: number;       // Default: 5
  MASTER_LOCKOUT_MINUTES: number;     // Default: 5
  
  // Communication
  HEARTBEAT_SEC: number;              // Default: 10
  OFFLINE_SEC: number;                // Default: 30
  
  // System
  LOG_RETENTION_DAYS: number;         // Default: 30
  
  // Rate Limiting
  RATE_LIMIT_IP_PER_MIN: number;      // Default: 30
  RATE_LIMIT_CARD_PER_MIN: number;    // Default: 60
  RATE_LIMIT_LOCKER_PER_MIN: number;  // Default: 6
  RATE_LIMIT_DEVICE_PER_SEC: number;  // Default: 20
}
```

## Usage Examples

### Creating and Deploying Configuration

```typescript
import { ConfigurationService } from './services/configuration.js';

const configService = new ConfigurationService();

// 1. Create configuration package
const config = configService.getDefaultConfig();
config.HEARTBEAT_SEC = 15; // Modify parameter
config.BULK_INTERVAL_MS = 500;

const configPackage = await configService.createConfigurationPackage(
  config, 
  'admin-user'
);

// 2. Deploy to specific zone
const deployment = await configService.deployConfiguration(
  configPackage.version,
  { zone: 'zone-a' },
  'admin-user'
);

// 3. Check deployment status
const history = await configService.getDeploymentHistory(10);
console.log('Recent deployments:', history);
```

### Kiosk Configuration Flow

```typescript
// 1. Kiosk checks for pending configuration
const pendingConfig = await configService.getPendingConfiguration('kiosk-1');

if (pendingConfig) {
  try {
    // 2. Download and validate configuration
    const isValid = validateConfiguration(pendingConfig.config);
    
    if (isValid) {
      // 3. Apply configuration atomically
      await configService.applyConfiguration(
        'kiosk-1',
        pendingConfig.version,
        pendingConfig.hash
      );
      console.log('Configuration applied successfully');
    }
  } catch (error) {
    // 4. Rollback on failure
    await configService.rollbackConfiguration(
      'kiosk-1',
      `Apply failed: ${error.message}`
    );
  }
}
```

## Web Interface

### Configuration Panel

Access the configuration panel at: `http://localhost:3003/config` (Panel service)

**Turkish Interface:** All configuration panels are now displayed in Turkish for Turkey deployment.

**Features:**
- **Current Configuration Tab**: View all system parameters and their values
- **Kiosk Status Tab**: Real-time status of all kiosks with configuration versions
- **Deployment History Tab**: Complete history of configuration deployments

**Status Indicators:**
- 🟢 **Up to Date**: Kiosk has latest configuration
- 🟡 **Pending Update**: Configuration deployment pending
- 🔵 **Updating**: Configuration currently being applied
- 🔴 **Failed**: Configuration application failed

## Testing

### Unit Tests
```bash
npm test
```

### Integration Test
```bash
npm run config-test
```

The integration test creates a complete configuration workflow:
1. Creates test kiosk
2. Creates configuration package
3. Deploys configuration
4. Applies configuration
5. Verifies final state

## Security Considerations

### Hash Verification
- SHA256 hash verification prevents configuration tampering
- Hash mismatch causes automatic rollback
- All configuration changes are audited

### Access Control
- Configuration creation requires admin privileges
- Deployment operations are logged with user identification
- Rollback operations require reason documentation

### Atomic Operations
- Configuration changes are applied atomically
- Failed applications automatically rollback
- Service health is verified after changes

## Monitoring and Logging

### Event Types
- `config_package_created`: New configuration package created
- `config_deployment_initiated`: Configuration deployment started
- `config_applied`: Configuration successfully applied to kiosk
- `config_rollback`: Configuration rolled back with reason

### Health Monitoring
- Kiosk configuration status tracking
- Deployment success/failure rates
- Configuration version distribution across kiosks

## Troubleshooting

### Common Issues

**Configuration Apply Failures:**
- Check kiosk logs for specific error messages
- Verify configuration syntax and required parameters
- Ensure kiosk has sufficient permissions for file operations

**Hash Mismatch Errors:**
- Indicates configuration corruption during transfer
- Automatic rollback will be triggered
- Check network connectivity and transfer integrity

**Rollback Failures:**
- May indicate corrupted previous configuration state
- Manual intervention may be required
- Check database consistency and file system state

### Diagnostic Commands

```bash
# Check configuration status for all kiosks
curl http://localhost:3000/api/configuration/kiosks/status

# Get deployment history
curl http://localhost:3000/api/configuration/deployments

# Check specific kiosk status
curl http://localhost:3000/api/configuration/kiosks/kiosk-1/status
```

## Requirements Compliance

This implementation satisfies the task requirements:

✅ **Config push mechanism to kiosks with version and hash control**
- Version-controlled configuration packages
- SHA256 hash verification for integrity
- Targeted deployment to specific kiosks or zones

✅ **Atomic configuration apply with rollback capability**
- Atomic configuration application process
- Automatic rollback on failures
- Manual rollback capability with reason tracking

✅ **Read-only configuration display in panel interface**
- Web-based configuration panel at `/config-panel`
- Real-time kiosk status monitoring
- Configuration deployment history
- Responsive design for various screen sizes