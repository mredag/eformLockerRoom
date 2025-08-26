# eForm Locker System - API Reference

## 📋 **Overview**

This document provides comprehensive API documentation for the eForm Locker System. The system exposes REST APIs across three services for different use cases.

## 🌐 **Base URLs**

- **Gateway Service**: `http://192.168.1.8:3000`
- **Kiosk Service**: `http://192.168.1.8:3002`  
- **Panel Service**: `http://192.168.1.8:3001`

## 🔐 **Authentication**

Most API endpoints are open for system integration. Web interfaces use session-based authentication.

**Master PIN Authentication**: Required for administrative operations
- Default PIN: `1234` (change in production)
- Lockout: 5 failed attempts = 5-minute lockout

---

## 🖥️ **Kiosk Service API (Port 3002)**

### **Health Check**

#### `GET /health`
Check service health and get system information.

**Response**:
```json
{
  "status": "healthy",
  "kiosk_id": "kiosk-1",
  "timestamp": "2025-08-26T20:47:21.556Z",
  "version": "1.0.0"
}
```

### **RFID Card Processing**

#### `POST /api/rfid/handle-card`
Process RFID card scan and determine appropriate action.

**Request Body**:
```json
{
  "card_id": "0009652489",
  "kiosk_id": "kiosk-1"
}
```

**Response - New User (Show Lockers)**:
```json
{
  "action": "show_lockers",
  "session_id": "kiosk-1-0009652489-1756241234567",
  "lockers": [
    {
      "id": 1,
      "status": "Free"
    },
    {
      "id": 2, 
      "status": "Free"
    }
  ]
}
```

**Response - Existing User (Return Locker)**:
```json
{
  "action": "open_locker",
  "locker_id": 4,
  "message": "Locker opened and released"
}
```

**Response - Error**:
```json
{
  "error": "no_lockers"
}
```

**Error Codes**:
- `no_lockers` - No available lockers
- `card_not_found` - RFID card not registered
- `error_server` - Internal server error

### **Locker Management**

#### `GET /api/lockers/available`
Get list of available lockers for selection.

**Query Parameters**:
- `kiosk_id` (required): Kiosk identifier

**Response**:
```json
[
  {
    "id": 1,
    "status": "Free",
    "is_vip": false
  },
  {
    "id": 3,
    "status": "Free", 
    "is_vip": true
  }
]
```

#### `GET /api/lockers/all`
Get all lockers with their current status (for master interface).

**Query Parameters**:
- `kiosk_id` (required): Kiosk identifier

**Response**:
```json
[
  {
    "id": 1,
    "status": "Free",
    "is_vip": false,
    "owner_type": null,
    "owned_at": null
  },
  {
    "id": 2,
    "status": "Owned",
    "is_vip": false,
    "owner_type": "rfid",
    "owned_at": "2025-08-26T20:30:15.123Z"
  }
]
```

#### `POST /api/lockers/select`
Select and assign a locker to the current user session.

**Request Body**:
```json
{
  "locker_id": 4,
  "kiosk_id": "kiosk-1",
  "session_id": "kiosk-1-0009652489-1756241234567"
}
```

**Response - Success**:
```json
{
  "success": true,
  "locker_id": 4
}
```

**Response - Error**:
```json
{
  "error": "Invalid or expired session. Please scan your card again."
}
```

**Error Codes**:
- `Invalid or expired session` - Session not found or expired
- `Locker not available` - Locker already assigned
- `failed_open` - Hardware relay activation failed

### **Master PIN Access**

#### `POST /api/master/verify-pin`
Verify master PIN for administrative access.

**Request Body**:
```json
{
  "pin": "1234",
  "kiosk_id": "kiosk-1"
}
```

**Response - Success**:
```json
{
  "success": true
}
```

**Response - Failed**:
```json
{
  "error": "Incorrect PIN",
  "attempts_remaining": 3
}
```

**Response - Locked Out**:
```json
{
  "error": "PIN entry locked",
  "lockout_end": 1756241534567
}
```

#### `POST /api/master/open-locker`
Master override to open any locker (requires PIN verification first).

**Request Body**:
```json
{
  "locker_id": 4,
  "kiosk_id": "kiosk-1"
}
```

**Response**:
```json
{
  "success": true,
  "locker_id": 4
}
```

### **RFID Events Polling**

#### `GET /api/rfid/events`
Poll for RFID events (used by frontend for real-time updates).

**Query Parameters**:
- `kiosk_id` (required): Kiosk identifier

**Response**:
```json
[
  {
    "type": "card_scanned",
    "card_id": "0009652489",
    "timestamp": "2025-08-26T20:30:15.123Z"
  },
  {
    "type": "locker_assigned", 
    "locker_id": 4,
    "timestamp": "2025-08-26T20:30:20.456Z"
  }
]
```

**Event Types**:
- `card_scanned` - RFID card detected
- `locker_assigned` - Locker assigned to user
- `locker_opened` - Locker successfully opened
- `locker_failed` - Locker opening failed

---

## 🌐 **Gateway Service API (Port 3000)**

### **Health Check**

#### `GET /health`
Check Gateway service health.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-08-26T20:47:21.538Z",
  "service": "eform-gateway",
  "version": "1.0.0"
}
```

### **Admin Locker Control**

#### `POST /api/admin/lockers/{id}/open`
Administrative override to open any locker.

**Path Parameters**:
- `id`: Locker ID (1-30)

**Request Body**:
```json
{
  "staff_user": "admin",
  "reason": "maintenance"
}
```

**Response - Success**:
```json
{
  "success": true,
  "locker_id": 4,
  "message": "Locker opened successfully"
}
```

**Response - Error**:
```json
{
  "success": false,
  "error": "Locker opening failed",
  "details": "Hardware communication error"
}
```

#### `GET /api/admin/lockers`
Get status of all lockers across all kiosks.

**Response**:
```json
{
  "kiosk-1": [
    {
      "id": 1,
      "status": "Free",
      "owner_type": null,
      "owned_at": null
    },
    {
      "id": 2,
      "status": "Owned", 
      "owner_type": "rfid",
      "owned_at": "2025-08-26T20:30:15.123Z"
    }
  ]
}
```

### **User Management**

#### `POST /api/admin/users`
Register new RFID card user.

**Request Body**:
```json
{
  "name": "John Doe",
  "rfid_card_id": "0009652491"
}
```

**Response**:
```json
{
  "success": true,
  "user_id": 5,
  "message": "User registered successfully"
}
```

#### `GET /api/admin/users`
Get all registered users.

**Response**:
```json
[
  {
    "id": 1,
    "name": "Card User 1",
    "rfid_card_id": "0009652489"
  },
  {
    "id": 2,
    "name": "Card User 2", 
    "rfid_card_id": "0009652490"
  }
]
```

---

## 📊 **Panel Service API (Port 3001)**

### **Health Check**

#### `GET /health`
Check Panel service health and database status.

**Response**:
```json
{
  "status": "ok",
  "service": "eform-panel",
  "timestamp": "2025-08-26T20:47:21.574Z",
  "database": {
    "status": "ok",
    "lastWrite": "2025-08-26T20:47:21.591Z",
    "walSize": 0
  }
}
```

### **Direct Relay Control**

#### `POST /api/relay/activate`
Direct relay activation (bypasses locker management).

**Request Body**:
```json
{
  "relay_number": 5,
  "staff_user": "technician",
  "reason": "testing"
}
```

**Response - Success**:
```json
{
  "success": true,
  "relay_number": 5,
  "message": "Relay activated successfully"
}
```

**Response - Error**:
```json
{
  "success": false,
  "error": "Relay activation failed",
  "details": "Hardware communication error"
}
```

#### `GET /api/relay/status`
Get relay service status and configuration.

**Response**:
```json
{
  "status": "operational",
  "hardware": {
    "serial_port": "/dev/ttyUSB0",
    "connected": true,
    "last_command": "2025-08-26T20:45:30.123Z"
  },
  "relays": {
    "total": 30,
    "available": 28,
    "active": 2
  }
}
```

### **Web Interface Endpoints**

#### `GET /`
Admin dashboard (HTML interface).

#### `GET /lockers`
Locker management interface (HTML).

#### `GET /relay`
Direct relay control interface (HTML).

---

## 🔧 **Error Handling**

### **HTTP Status Codes**

- `200 OK` - Request successful
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limited (PIN attempts)
- `500 Internal Server Error` - Server error

### **Error Response Format**

```json
{
  "error": "error_code",
  "message": "Human readable error message",
  "details": "Additional error details",
  "timestamp": "2025-08-26T20:47:21.574Z"
}
```

### **Common Error Codes**

**RFID Related**:
- `card_not_found` - RFID card not registered
- `no_lockers` - No available lockers
- `session_expired` - User session expired

**Hardware Related**:
- `hardware_error` - Hardware communication failed
- `relay_failed` - Relay activation failed
- `serial_port_busy` - Serial port in use

**System Related**:
- `database_error` - Database operation failed
- `service_unavailable` - Required service not available
- `invalid_request` - Malformed request

---

## 🧪 **Testing Examples**

### **cURL Examples**

**Test Service Health**:
```bash
curl -X GET http://192.168.1.8:3002/health
```

**Simulate RFID Card Scan**:
```bash
curl -X POST http://192.168.1.8:3002/api/rfid/handle-card \
  -H "Content-Type: application/json" \
  -d '{
    "card_id": "0009652489",
    "kiosk_id": "kiosk-1"
  }'
```

**Select Locker**:
```bash
curl -X POST http://192.168.1.8:3002/api/lockers/select \
  -H "Content-Type: application/json" \
  -d '{
    "locker_id": 4,
    "kiosk_id": "kiosk-1", 
    "session_id": "kiosk-1-0009652489-1756241234567"
  }'
```

**Admin Open Locker**:
```bash
curl -X POST http://192.168.1.8:3000/api/admin/lockers/5/open \
  -H "Content-Type: application/json" \
  -d '{
    "staff_user": "admin",
    "reason": "maintenance"
  }'
```

**Direct Relay Control**:
```bash
curl -X POST http://192.168.1.8:3001/api/relay/activate \
  -H "Content-Type: application/json" \
  -d '{
    "relay_number": 5,
    "staff_user": "technician",
    "reason": "testing"
  }'
```

### **JavaScript Examples**

**RFID Card Processing**:
```javascript
async function handleRfidCard(cardId) {
  try {
    const response = await fetch('/api/rfid/handle-card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        card_id: cardId,
        kiosk_id: 'kiosk-1'
      })
    });
    
    const result = await response.json();
    
    if (result.action === 'show_lockers') {
      displayLockers(result.lockers, result.session_id);
    } else if (result.action === 'open_locker') {
      showMessage(`Locker ${result.locker_id} opened`);
    }
  } catch (error) {
    console.error('Error handling card:', error);
  }
}
```

**Locker Selection**:
```javascript
async function selectLocker(lockerId, sessionId) {
  try {
    const response = await fetch('/api/lockers/select', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        locker_id: lockerId,
        kiosk_id: 'kiosk-1',
        session_id: sessionId
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage(`Locker ${lockerId} assigned successfully`);
    } else {
      showError(result.error);
    }
  } catch (error) {
    console.error('Error selecting locker:', error);
  }
}
```

---

## 📊 **Rate Limiting**

### **PIN Verification**
- **Limit**: 5 attempts per IP per kiosk
- **Lockout**: 5 minutes after max attempts
- **Reset**: Successful verification resets counter

### **API Endpoints**
- **General**: No rate limiting (internal system use)
- **Admin endpoints**: Consider implementing rate limiting in production

---

## 🔄 **Session Management**

### **RFID Sessions**
- **Creation**: Automatic on card scan
- **Duration**: 5 minutes (300 seconds)
- **Cleanup**: Automatic cleanup of expired sessions
- **Format**: `kiosk-{kioskId}-{cardId}-{timestamp}`

### **Session Lifecycle**
1. **Card Scan** → Create session
2. **Show Lockers** → Session active
3. **Select Locker** → Session consumed and cleared
4. **Timeout** → Session automatically expired

---

## 📝 **Changelog**

### **Version 1.0.0**
- Initial API implementation
- RFID card processing
- Locker management
- Master PIN access
- Session management
- Hardware relay control

### **Recent Updates**
- Fixed session management for multi-user support
- Improved error handling and logging
- Added comprehensive API documentation
- Enhanced hardware communication reliability

---

*This API reference is part of the eForm Locker System documentation. For implementation details, see SYSTEM_DOCUMENTATION.md*