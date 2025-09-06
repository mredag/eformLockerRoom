# Smart Locker Assignment API Reference

## Overview

This document provides comprehensive API documentation for the Smart Locker Assignment system. The system extends the existing eForm Locker System with intelligent assignment capabilities while maintaining full backward compatibility.

## Base URLs

- **Gateway Service**: `http://localhost:3000` (Admin APIs)
- **Kiosk Service**: `http://localhost:3002` (Hardware control and RFID)
- **Panel Service**: `http://localhost:3001` (Admin web interface)

## Authentication

Most admin endpoints require authentication. Include the following header:

```
Authorization: Bearer <token>
```

For development and testing, some endpoints may bypass authentication.

## Enhanced Kiosk API

### Handle RFID Card

Enhanced endpoint that supports both manual and smart assignment modes based on feature flag configuration.

**Endpoint**: `POST /api/rfid/handle-card`

**Request Body**:
```json
{
  "card_id": "0009652489",
  "kiosk_id": "kiosk-1",
  "timestamp": "2025-01-09T10:30:00Z"
}
```

**Response (Smart Assignment Mode - New Assignment)**:
```json
{
  "success": true,
  "action": "assign_new",
  "locker_id": 15,
  "message": "Dolabınız açıldı. Eşyalarınızı yerleştirin",
  "session_id": "smart-session-123",
  "assignment_details": {
    "score": 125.5,
    "candidates_considered": 8,
    "selection_method": "weighted_random"
  }
}
```

**Response (Smart Assignment Mode - Existing Locker)**:
```json
{
  "success": true,
  "action": "open_existing",
  "locker_id": 8,
  "message": "Önceki dolabınız açıldı",
  "session_id": "smart-session-456",
  "session_details": {
    "remaining_minutes": 45,
    "can_extend": true
  }
}
```

**Response (Overdue Retrieval)**:
```json
{
  "success": true,
  "action": "retrieve_overdue",
  "locker_id": 12,
  "message": "Süreniz doldu. Almanız için açılıyor",
  "session_id": null,
  "overdue_details": {
    "overdue_since": "2025-01-09T08:00:00Z",
    "reason": "session_expired"
  }
}
```

**Response (Reclaim Previous Locker)**:
```json
{
  "success": true,
  "action": "reopen_reclaim",
  "locker_id": 5,
  "message": "Önceki dolabınız yeniden açıldı",
  "session_id": "smart-session-789",
  "reclaim_details": {
    "exit_quarantine_until": "2025-01-09T11:20:00Z",
    "reclaim_window_minutes": 120
  }
}
```

**Response (Suspected Occupied - Reassignment)**:
```json
{
  "success": true,
  "action": "assign_new",
  "locker_id": 18,
  "message": "Dolap dolu bildirildi. Yeni dolap açılıyor",
  "session_id": "smart-session-101",
  "suspected_details": {
    "reported_locker": 15,
    "report_count_today": 1
  }
}
```

**Response (No Stock Available)**:
```json
{
  "success": false,
  "error": "no_stock",
  "message": "Boş dolap yok. Görevliye başvurun",
  "stock_details": {
    "total_lockers": 32,
    "available_count": 0,
    "reserved_count": 3,
    "quarantined_count": 2
  }
}
```

**Response (Rate Limited)**:
```json
{
  "success": false,
  "error": "rate_limited",
  "message": "Lütfen birkaç saniye sonra deneyin",
  "rate_limit_details": {
    "type": "card_rate_limit",
    "retry_after_seconds": 8
  }
}
```

**Response (Manual Mode - Backward Compatible)**:
```json
{
  "success": true,
  "action": "show_selection",
  "available_lockers": [1, 3, 5, 7, 9],
  "session_id": "manual-session-abc",
  "message": "Dolap seçin"
}
```

### Sensorless Retry Handling

The system automatically handles hardware retry logic. When a card is scanned again within the open window, it triggers a retry sequence.

**Turkish UI Messages**:
- `"Kartınızı okutun."` - Idle state
- `"Dolabınız açıldı. Eşyalarınızı yerleştirin."` - Success (new assignment)
- `"Önceki dolabınız açıldı."` - Success (existing locker)
- `"Süreniz doldu. Almanız için açılıyor."` - Overdue retrieval
- `"Dolap dolu bildirildi. Yeni dolap açılıyor."` - Suspected occupied reassignment
- `"Tekrar deneniyor."` - Retry in progress (shown only during retry window)
- `"Lütfen birkaç saniye sonra deneyin."` - Rate limited
- `"Boş dolap yok. Görevliye başvurun."` - No stock
- `"Şu an işlem yapılamıyor."` - General error

## Configuration Management API

### Get Effective Configuration

Retrieves the merged configuration (global + kiosk overrides) for a specific kiosk.

**Endpoint**: `GET /api/admin/config/effective/{kioskId}`

**Response**:
```json
{
  "kiosk_id": "kiosk-1",
  "effective_config": {
    "base_score": 100,
    "score_factor_a": 2.0,
    "score_factor_b": 1.0,
    "score_factor_g": 0.1,
    "score_factor_d": 0.5,
    "top_k_candidates": 5,
    "selection_temperature": 1.0,
    "quarantine_min_floor": 5,
    "quarantine_min_ceiling": 20,
    "exit_quarantine_minutes": 20,
    "return_hold_trigger_seconds": 120,
    "return_hold_minutes": 15,
    "session_limit_minutes": 180,
    "retrieve_window_minutes": 10,
    "reserve_ratio": 0.1,
    "reserve_minimum": 2,
    "pulse_ms": 800,
    "open_window_sec": 10,
    "retry_backoff_ms": 500,
    "card_rate_limit_seconds": 10,
    "locker_rate_limit_per_minute": 3,
    "command_cooldown_seconds": 3,
    "user_report_daily_cap": 2,
    "smart_assignment_enabled": true,
    "allow_reclaim_during_quarantine": false
  },
  "overrides": {
    "session_limit_minutes": 240,
    "top_k_candidates": 3
  },
  "version": 15,
  "last_updated": "2025-01-09T10:30:00Z"
}
```

### Get Global Configuration

**Endpoint**: `GET /api/admin/config/global`

**Response**:
```json
{
  "global_config": {
    "base_score": 100,
    "score_factor_a": 2.0,
    // ... all global settings
  },
  "version": 15,
  "last_updated": "2025-01-09T10:25:00Z"
}
```

### Update Global Configuration

**Endpoint**: `PUT /api/admin/config/global`

**Request Body**:
```json
{
  "updates": {
    "session_limit_minutes": 200,
    "top_k_candidates": 7
  },
  "updated_by": "admin_user"
}
```

**Response**:
```json
{
  "success": true,
  "updated_keys": ["session_limit_minutes", "top_k_candidates"],
  "new_version": 16,
  "propagation_time_ms": 1250
}
```

### Set Kiosk Override

**Endpoint**: `PUT /api/admin/config/override/{kioskId}`

**Request Body**:
```json
{
  "key": "session_limit_minutes",
  "value": 240,
  "updated_by": "admin_user"
}
```

**Response**:
```json
{
  "success": true,
  "kiosk_id": "kiosk-1",
  "key": "session_limit_minutes",
  "old_value": 180,
  "new_value": 240,
  "effective_immediately": true
}
```

### Remove Kiosk Override

**Endpoint**: `DELETE /api/admin/config/override/{kioskId}`

**Query Parameters**:
- `key` (required): Configuration key to remove override for

**Response**:
```json
{
  "success": true,
  "kiosk_id": "kiosk-1",
  "key": "session_limit_minutes",
  "reverted_to_global": 180
}
```

### Configuration History

**Endpoint**: `GET /api/admin/config/history`

**Query Parameters**:
- `kiosk_id` (optional): Filter by kiosk
- `key` (optional): Filter by configuration key
- `limit` (optional): Number of records (default: 50)
- `offset` (optional): Pagination offset

**Response**:
```json
{
  "history": [
    {
      "id": 123,
      "kiosk_id": "kiosk-1",
      "key": "session_limit_minutes",
      "old_value": "180",
      "new_value": "240",
      "changed_by": "admin_user",
      "changed_at": "2025-01-09T10:30:00Z"
    }
  ],
  "total_count": 45,
  "has_more": false
}
```

### Trigger Configuration Reload

**Endpoint**: `POST /api/admin/config/reload`

**Response**:
```json
{
  "success": true,
  "services_reloaded": ["gateway", "kiosk", "panel"],
  "propagation_time_ms": 2100,
  "new_version": 16
}
```

## Session Management API

### Get Live Sessions

**Endpoint**: `GET /api/admin/sessions/live`

**Query Parameters**:
- `kiosk_id` (optional): Filter by kiosk

**Response**:
```json
{
  "sessions": [
    {
      "id": "smart-session-123",
      "card_id": "0009652489",
      "kiosk_id": "kiosk-1",
      "locker_id": 15,
      "start_time": "2025-01-09T09:00:00Z",
      "expires_time": "2025-01-09T12:00:00Z",
      "remaining_minutes": 45,
      "status": "active",
      "extension_count": 1,
      "can_extend": true,
      "last_seen": "2025-01-09T11:10:00Z"
    }
  ],
  "total_active": 8,
  "total_overdue": 2
}
```

### Extend Session

**Endpoint**: `POST /api/admin/sessions/{sessionId}/extend`

**Request Body**:
```json
{
  "admin_user": "admin_username",
  "reason": "User requested more time for complex task"
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "smart-session-123",
  "extension_minutes": 60,
  "new_expires_time": "2025-01-09T13:00:00Z",
  "total_extensions": 2,
  "max_extensions_reached": false,
  "audit_logged": true
}
```

### Cancel Session

**Endpoint**: `POST /api/admin/sessions/{sessionId}/cancel`

**Request Body**:
```json
{
  "admin_user": "admin_username",
  "reason": "Emergency maintenance required"
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "smart-session-123",
  "locker_released": true,
  "quarantine_applied": true,
  "quarantine_until": "2025-01-09T11:35:00Z"
}
```

## Overdue and Suspected Management API

### Get Overdue Lockers

**Endpoint**: `GET /api/admin/lockers/overdue`

**Response**:
```json
{
  "overdue_lockers": [
    {
      "kiosk_id": "kiosk-1",
      "locker_id": 8,
      "owner_key": "0009652489",
      "overdue_since": "2025-01-09T08:00:00Z",
      "overdue_reason": "session_expired",
      "hours_overdue": 3.5,
      "can_force_open": true,
      "retrieval_allowed": true
    }
  ],
  "total_count": 3
}
```

### Force Open Overdue Locker

**Endpoint**: `POST /api/admin/lockers/overdue/{kioskId}/{lockerId}/force-open`

**Request Body**:
```json
{
  "admin_user": "admin_username",
  "reason": "Manual intervention required"
}
```

**Response**:
```json
{
  "success": true,
  "locker_opened": true,
  "quarantine_applied": true,
  "quarantine_duration_minutes": 20,
  "audit_logged": true
}
```

### Get Suspected Occupied Lockers

**Endpoint**: `GET /api/admin/lockers/suspected`

**Response**:
```json
{
  "suspected_lockers": [
    {
      "kiosk_id": "kiosk-1",
      "locker_id": 12,
      "reported_by": "0009652490",
      "reported_at": "2025-01-09T10:15:00Z",
      "suspect_ttl_minutes": 30,
      "can_clear": true,
      "investigation_notes": ""
    }
  ],
  "total_count": 1
}
```

### Clear Suspected Flag

**Endpoint**: `POST /api/admin/lockers/suspected/{kioskId}/{lockerId}/clear`

**Request Body**:
```json
{
  "admin_user": "admin_username",
  "resolution": "confirmed_empty",
  "notes": "Physical inspection confirmed locker is empty"
}
```

**Response**:
```json
{
  "success": true,
  "locker_cleared": true,
  "returned_to_pool": true,
  "audit_logged": true
}
```

## Metrics and Alerts API

### Get System Metrics

**Endpoint**: `GET /api/admin/metrics/dashboard`

**Query Parameters**:
- `kiosk_id` (optional): Filter by kiosk
- `time_range` (optional): `1h`, `6h`, `24h`, `7d` (default: `24h`)

**Response**:
```json
{
  "time_range": "24h",
  "kiosk_id": "all",
  "metrics": {
    "assignment_success_rate": 0.987,
    "average_assignment_time_ms": 245,
    "no_stock_events": 3,
    "conflict_rate": 0.008,
    "open_fail_rate": 0.002,
    "retry_rate": 0.045,
    "overdue_share": 0.12,
    "total_assignments": 1247,
    "unique_users": 89,
    "peak_concurrent_sessions": 15
  },
  "stock_status": {
    "total_lockers": 32,
    "available": 18,
    "occupied": 12,
    "quarantined": 1,
    "overdue": 1,
    "free_ratio": 0.5625
  },
  "generated_at": "2025-01-09T11:15:00Z"
}
```

### Get Active Alerts

**Endpoint**: `GET /api/admin/alerts/active`

**Response**:
```json
{
  "active_alerts": [
    {
      "id": "alert-no-stock-001",
      "type": "no_stock",
      "kiosk_id": "kiosk-2",
      "severity": "high",
      "message": "No stock events exceeded threshold: 4 events in 10 minutes",
      "triggered_at": "2025-01-09T10:45:00Z",
      "data": {
        "event_count": 4,
        "threshold": 3,
        "window_minutes": 10
      },
      "auto_clear_condition": "< 2 events in 10 minutes after 20 minutes"
    }
  ],
  "total_active": 1,
  "by_severity": {
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
```

### Acknowledge Alert

**Endpoint**: `POST /api/admin/alerts/{alertId}/acknowledge`

**Request Body**:
```json
{
  "admin_user": "admin_username",
  "notes": "Investigating root cause, temporary capacity added"
}
```

**Response**:
```json
{
  "success": true,
  "alert_id": "alert-no-stock-001",
  "acknowledged_by": "admin_username",
  "acknowledged_at": "2025-01-09T11:20:00Z",
  "will_auto_clear": true
}
```

## Feature Flag API

### Get Feature Flag Status

**Endpoint**: `GET /api/admin/feature-flags`

**Response**:
```json
{
  "feature_flags": {
    "smart_assignment_enabled": {
      "global_default": false,
      "kiosk_overrides": {
        "kiosk-1": true,
        "kiosk-2": false
      }
    },
    "allow_reclaim_during_quarantine": {
      "global_default": false,
      "kiosk_overrides": {}
    }
  },
  "rollout_status": {
    "total_kiosks": 5,
    "smart_enabled": 2,
    "rollout_percentage": 40
  }
}
```

### Toggle Feature Flag

**Endpoint**: `PUT /api/admin/feature-flags/{flag}`

**Request Body**:
```json
{
  "enabled": true,
  "kiosk_id": "kiosk-1",
  "admin_user": "admin_username"
}
```

**Response**:
```json
{
  "success": true,
  "flag": "smart_assignment_enabled",
  "kiosk_id": "kiosk-1",
  "old_value": false,
  "new_value": true,
  "effective_immediately": true,
  "audit_logged": true
}
```

## Error Codes

### Standard Error Response Format

```json
{
  "success": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional error context"
  },
  "timestamp": "2025-01-09T11:30:00Z"
}
```

### Error Code Reference

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `no_stock` | No available lockers | 200 (handled gracefully) |
| `rate_limited` | Rate limit exceeded | 429 |
| `invalid_card` | Invalid or unrecognized card | 400 |
| `invalid_kiosk` | Invalid kiosk ID | 400 |
| `assignment_conflict` | Concurrent assignment conflict | 409 |
| `hardware_error` | Hardware communication failure | 500 |
| `configuration_error` | Invalid configuration | 400 |
| `session_not_found` | Session does not exist | 404 |
| `session_expired` | Session has expired | 410 |
| `extension_limit_reached` | Maximum extensions exceeded | 400 |
| `unauthorized` | Authentication required | 401 |
| `forbidden` | Insufficient permissions | 403 |
| `validation_error` | Request validation failed | 400 |
| `internal_error` | Unexpected server error | 500 |

## Rate Limits

### Default Rate Limits

- **Card Rate Limit**: 1 operation per 10 seconds per card
- **Locker Rate Limit**: 3 operations per 60 seconds per locker
- **Command Cooldown**: 3 seconds between relay commands
- **User Reports**: 2 suspected occupied reports per day per card
- **API Rate Limits**: 60 requests per minute per IP (admin endpoints)

### Rate Limit Headers

Rate-limited responses include these headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1641734400
Retry-After: 15
```

## WebSocket Events

### Real-time Updates

Connect to WebSocket at `ws://localhost:8080` for real-time updates.

**Event Types**:

```javascript
// Locker state change
{
  "type": "locker_state_change",
  "data": {
    "kiosk_id": "kiosk-1",
    "locker_id": 15,
    "old_status": "Free",
    "new_status": "Owned",
    "owner_key": "0009652489",
    "timestamp": "2025-01-09T11:35:00Z"
  }
}

// Assignment completed
{
  "type": "assignment_completed",
  "data": {
    "kiosk_id": "kiosk-1",
    "card_id": "0009652489",
    "locker_id": 15,
    "action": "assign_new",
    "score": 125.5,
    "timestamp": "2025-01-09T11:35:00Z"
  }
}

// Alert triggered
{
  "type": "alert_triggered",
  "data": {
    "alert_id": "alert-no-stock-002",
    "type": "no_stock",
    "kiosk_id": "kiosk-1",
    "severity": "high",
    "message": "No available lockers",
    "timestamp": "2025-01-09T11:40:00Z"
  }
}

// Configuration updated
{
  "type": "config_updated",
  "data": {
    "kiosk_id": "kiosk-1",
    "key": "session_limit_minutes",
    "old_value": 180,
    "new_value": 240,
    "updated_by": "admin_user",
    "timestamp": "2025-01-09T11:45:00Z"
  }
}
```

## Testing Endpoints

### Health Checks

- `GET /health` - Service health status
- `GET /api/health/detailed` - Detailed health information including database and hardware status

### Debug Endpoints (Development Only)

- `GET /api/debug/assignment-state` - Current assignment engine state
- `GET /api/debug/configuration` - Current configuration dump
- `POST /api/debug/simulate-assignment` - Simulate assignment without hardware
- `POST /api/debug/reset-rate-limits` - Reset all rate limits (testing only)

## SDK Examples

### JavaScript/Node.js

```javascript
const SmartLockerAPI = require('./smart-locker-sdk');

const client = new SmartLockerAPI({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Handle RFID card scan
const result = await client.handleCard({
  cardId: '0009652489',
  kioskId: 'kiosk-1'
});

console.log(`Assignment result: ${result.action}, Locker: ${result.lockerId}`);

// Get live sessions
const sessions = await client.getLiveSessions();
console.log(`Active sessions: ${sessions.length}`);

// Update configuration
await client.updateGlobalConfig({
  session_limit_minutes: 200
});
```

### Python

```python
import requests
from datetime import datetime

class SmartLockerClient:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.headers = {'Authorization': f'Bearer {api_key}'}
    
    def handle_card(self, card_id, kiosk_id):
        response = requests.post(
            f'{self.base_url}/api/rfid/handle-card',
            json={
                'card_id': card_id,
                'kiosk_id': kiosk_id,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            },
            headers=self.headers
        )
        return response.json()
    
    def get_metrics(self, time_range='24h'):
        response = requests.get(
            f'{self.base_url}/api/admin/metrics/dashboard',
            params={'time_range': time_range},
            headers=self.headers
        )
        return response.json()

# Usage
client = SmartLockerClient('http://localhost:3000', 'your-api-key')
result = client.handle_card('0009652489', 'kiosk-1')
print(f"Assignment: {result['action']}, Message: {result['message']}")
```

This API reference provides comprehensive documentation for all smart assignment endpoints, including request/response formats, error handling, and practical examples for integration.