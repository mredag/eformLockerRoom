# Smart Assignment Configuration API

This document describes the configuration API endpoints for the Smart Locker Assignment system.

## Overview

The Smart Assignment Configuration API provides endpoints for managing global configuration, kiosk-specific overrides, and configuration audit history. All configuration changes are logged with full audit trails.

## Base URL

All endpoints are prefixed with `/api/admin/config` on the Panel service (default port 3001).

Example: `http://localhost:3001/api/admin/config/global`

## Authentication

All write operations (PUT, POST, DELETE) require:
- Valid authentication session
- `SYSTEM_CONFIG` permission
- CSRF token for state-changing operations

Read operations (GET) require:
- Valid authentication session  
- `VIEW_LOCKERS` permission (minimum)

## Endpoints

### GET /api/admin/config/global

Retrieve the global configuration settings.

**Response:**
```json
{
  "success": true,
  "config": {
    "smart_assignment_enabled": false,
    "base_score": 100,
    "session_limit_minutes": 180,
    "score_factor_a": 2.0,
    "top_k_candidates": 5,
    // ... other configuration keys
  }
}
```

### GET /api/admin/config/effective

Retrieve the effective configuration for a specific kiosk (global + overrides).

**Query Parameters:**
- `kiosk_id` (required): The kiosk identifier

**Example:** `GET /api/admin/config/effective?kiosk_id=kiosk-1`

**Response:**
```json
{
  "success": true,
  "kiosk_id": "kiosk-1",
  "config": {
    "smart_assignment_enabled": true,  // overridden for this kiosk
    "base_score": 100,                 // from global
    "session_limit_minutes": 240,      // overridden for this kiosk
    // ... merged configuration
  },
  "version": 42,
  "loaded_at": "2025-01-09T10:30:00Z"
}
```

### PUT /api/admin/config/global

Update global configuration settings.

**Request Body:**
```json
{
  "updates": {
    "base_score": 150,
    "smart_assignment_enabled": true,
    "session_limit_minutes": 200
  },
  "reason": "Adjusting scoring parameters for better performance"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Global configuration updated successfully",
  "updated_keys": ["base_score", "smart_assignment_enabled", "session_limit_minutes"]
}
```

**Validation:**
- All values are validated according to their data types and constraints
- Unknown configuration keys are rejected with a 400 error
- Only changed values bump the configuration version
- Idempotent updates (no changes) return success with empty `updated_keys`

### PUT /api/admin/config/override/{kioskId}

Set a kiosk-specific configuration override.

**Parameters:**
- `kioskId` (path): The kiosk identifier

**Request Body:**
```json
{
  "key": "smart_assignment_enabled",
  "value": true,
  "reason": "Enable smart assignment for this kiosk only"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kiosk override set successfully for kiosk-1",
  "kiosk_id": "kiosk-1",
  "key": "smart_assignment_enabled",
  "value": true
}
```

### DELETE /api/admin/config/override/{kioskId}

Remove kiosk-specific configuration overrides.

**Parameters:**
- `kioskId` (path): The kiosk identifier

**Request Body:**
```json
{
  "keys": ["session_limit_minutes", "base_score"],
  "reason": "Revert to global settings"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Removed 2 overrides for kiosk-1",
  "kiosk_id": "kiosk-1",
  "removed_count": 2,
  "version": 43
}
```

**Behavior:**
- If `keys` array is provided, only those specific keys are removed
- If `keys` is empty or not provided, all overrides for the kiosk are removed
- Returns the count of actually removed overrides and current version

### GET /api/admin/config/history

Retrieve configuration change audit history with pagination.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `page_size` (optional): Records per page (default: 50, max: 200)
- `kiosk_id` (optional): Filter by specific kiosk ID
- `key` (optional): Filter by specific configuration key
- `updated_after` (optional): Filter changes after this timestamp (ISO 8601)
- `updated_before` (optional): Filter changes before this timestamp (ISO 8601)

**Response:**
```json
{
  "success": true,
  "history": [
    {
      "id": 123,
      "kiosk_id": null,
      "key": "base_score",
      "old_value": "100",
      "new_value": "150",
      "data_type": "number",
      "changed_by": "admin-user",
      "changed_at": "2025-01-09T10:30:00Z"
    },
    {
      "id": 122,
      "kiosk_id": "kiosk-1",
      "key": "smart_assignment_enabled",
      "old_value": null,
      "new_value": "true",
      "data_type": "boolean",
      "changed_by": "admin-user",
      "changed_at": "2025-01-09T10:25:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_records": 156,
    "total_pages": 4,
    "has_next": true,
    "has_previous": false
  },
  "filters": {
    "kiosk_id": null,
    "key": null,
    "updated_after": null,
    "updated_before": null
  }
}
```

### GET /api/admin/config/version

Get the current configuration version number.

**Response:**
```json
{
  "success": true,
  "version": 42
}
```

### POST /api/admin/config/reload

Trigger a configuration reload across all services (does not bump version).

**Response:**
```json
{
  "success": true,
  "message": "Configuration reload triggered successfully"
}
```

**Note:** This endpoint clears configuration caches and re-reads existing values without incrementing the version number.

## Configuration Keys

### Core Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `smart_assignment_enabled` | boolean | `false` | Enable smart locker assignment system |
| `base_score` | number | `100` | Base score for locker assignment algorithm |
| `session_limit_minutes` | number | `180` | Session timeout in minutes |

### Scoring Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `score_factor_a` | number | `2.0` | Free hours multiplier |
| `score_factor_b` | number | `1.0` | Hours since last owner multiplier |
| `score_factor_g` | number | `0.1` | Wear count divisor |
| `score_factor_d` | number | `0.5` | Waiting hours bonus |
| `top_k_candidates` | number | `5` | Number of top candidates to consider |
| `selection_temperature` | number | `1.0` | Randomness in selection algorithm |

### Hardware Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pulse_ms` | number | `800` | Relay pulse duration in milliseconds |
| `open_window_sec` | number | `10` | Window for retry detection |
| `retry_count` | number | `1` | Number of retries allowed |
| `retry_backoff_ms` | number | `500` | Backoff time between retries |

### Rate Limiting

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `card_rate_limit_seconds` | number | `10` | Minimum seconds between card operations |
| `locker_rate_limit_per_minute` | number | `3` | Maximum locker operations per minute |
| `command_cooldown_seconds` | number | `3` | Cooldown between hardware commands |
| `user_report_daily_cap` | number | `2` | Daily limit for user reports |

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Detailed error message"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation errors, invalid parameters)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (invalid endpoint or resource)
- `500` - Internal Server Error (server-side errors)

## Audit Logging

All configuration changes are automatically logged with:
- Timestamp of change
- User who made the change
- Old and new values
- Configuration key and scope (global vs kiosk-specific)

The audit log format follows the requirement: `"Config updated: key=X, by=Y"`

## Hot Reload

Configuration changes propagate to all services within 3 seconds through the hot reload mechanism. The system monitors configuration version changes and automatically updates cached values.

## Usage Examples

### Enable Smart Assignment for a Specific Kiosk

```bash
# Set kiosk override
curl -X PUT http://localhost:3001/api/admin/config/override/kiosk-1 \
  -H "Content-Type: application/json" \
  -d '{
    "key": "smart_assignment_enabled",
    "value": true,
    "reason": "Pilot testing smart assignment"
  }'

# Verify effective configuration
curl "http://localhost:3001/api/admin/config/effective?kiosk_id=kiosk-1"
```

### Update Global Scoring Parameters

```bash
curl -X PUT http://localhost:3001/api/admin/config/global \
  -H "Content-Type: application/json" \
  -d '{
    "updates": {
      "base_score": 120,
      "score_factor_a": 2.5,
      "top_k_candidates": 7
    },
    "reason": "Optimize scoring algorithm based on usage data"
  }'
```

### Monitor Configuration Changes

```bash
# Get recent changes with pagination
curl "http://localhost:3001/api/admin/config/history?page=1&page_size=20"

# Get changes for specific kiosk
curl "http://localhost:3001/api/admin/config/history?kiosk_id=kiosk-1&page_size=10"

# Get changes for specific key
curl "http://localhost:3001/api/admin/config/history?key=smart_assignment_enabled"

# Get changes within date range
curl "http://localhost:3001/api/admin/config/history?updated_after=2025-01-01T00:00:00Z&updated_before=2025-01-31T23:59:59Z"
```

### Remove Kiosk Overrides

```bash
# Remove specific overrides
curl -X DELETE http://localhost:3001/api/admin/config/override/kiosk-1 \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["smart_assignment_enabled", "session_limit_minutes"],
    "reason": "Revert to global settings"
  }'

# Remove all overrides for a kiosk
curl -X DELETE http://localhost:3001/api/admin/config/override/kiosk-1 \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Clean slate configuration"
  }'
```

## Integration Notes

- All endpoints are registered under the `/api/admin/config` prefix
- Authentication middleware is applied to all routes (admin auth required for writes, read scope for reads)
- CSRF protection is enabled for state-changing operations
- Configuration changes trigger automatic hot reload within ≤3 seconds
- Audit logging is handled automatically with format: "Config updated: key=X, by=Y"
- Strict input validation prevents invalid configuration values and unknown keys
- Kiosk overrides take precedence over global settings in effective configuration
- Version bumping only occurs when actual changes are made (idempotent updates don't bump version)
- POST /reload re-reads configuration without bumping version