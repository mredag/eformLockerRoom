---
inclusion: fileMatch
fileMatchPattern: '.kiro/specs/smart-locker-assignment/*'
---

# Smart Locker Assignment System - Implementation Context

This steering file provides essential context about the current eForm Locker System architecture to guide implementation of the smart assignment feature.

## Current System Architecture

### Service Structure
- **Gateway Service** (Port 3000): Admin API coordinator, handles `/api/admin/lockers/{id}/open` endpoints
- **Kiosk Service** (Port 3002): Hardware control, RFID handling, UI serving at `/api/rfid/handle-card`
- **Panel Service** (Port 3001): Admin web interface, direct relay control at `/api/relay/activate`

### Database Schema (Current)
```sql
-- Core lockers table structure
CREATE TABLE lockers (
  kiosk_id TEXT NOT NULL,
  id INTEGER NOT NULL,           -- Locker number 1-30
  status TEXT NOT NULL DEFAULT 'Free',  -- 'Free', 'Owned', 'Opening', 'Error', 'Blocked'
  owner_type TEXT,               -- 'rfid', 'device', 'vip'
  owner_key TEXT,                -- RFID card ID or device hash
  reserved_at DATETIME,
  owned_at DATETIME,
  version INTEGER NOT NULL DEFAULT 1,  -- Optimistic locking
  is_vip BOOLEAN NOT NULL DEFAULT 0,
  display_name TEXT,             -- Custom names (max 20 chars, Turkish support)
  name_updated_at DATETIME,
  name_updated_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kiosk_id, id)
);
```

### Hardware Integration

#### Relay Control (ModbusController)
```typescript
// Current working relay control method
async openLocker(lockerId: number): Promise<boolean> {
  // Maps locker ID to hardware addresses
  const cardId = Math.ceil(lockerId / 16);     // Card 1, 2, 3...
  const relayId = ((lockerId - 1) % 16) + 1;  // Relay 1-16 on card
  const coilAddress = relayId - 1;            // 0-based coil address
  
  // Uses Function Code 0x05 (Write Single Coil)
  // ON: 01 05 00 04 FF 00 [CRC] (for relay 5)
  // OFF: 01 05 00 04 00 00 [CRC] (for relay 5)
}
```

#### Hardware Configuration
- **Serial Port**: `/dev/ttyUSB0` at 9600 baud
- **Relay Cards**: Waveshare 16-channel cards (slave addresses 1, 2)
- **Pulse Duration**: 400ms default (will extend to 800ms for smart assignment)
- **Command Interval**: 300ms between commands
- **Retry Backoff**: Will use 500ms for smart assignment retry logic
- **CRC Calculation**: Custom implementation for Modbus RTU

### Current RFID Flow

#### Card Scan Processing (`/api/rfid/handle-card`)
```typescript
// Current manual selection flow
1. Card scanned → Check existing ownership
2. If existing: Open locker + release assignment
3. If new: Show available lockers for manual selection
4. User selects → Assign + open locker
5. Session timeout: 30 seconds
```

#### Session Management
```typescript
interface RfidSession {
  id: string;
  kioskId: string;
  cardId: string;
  startTime: Date;
  timeoutSeconds: number;  // Currently 30 seconds, will extend to 180 minutes for smart sessions
  status: 'active' | 'expired' | 'completed' | 'cancelled';
  availableLockers?: number[];
  selectedLockerId?: number;
}
```

### Admin Panel Integration

#### Locker Management (`/api/lockers`)
- **GET /api/lockers**: Fetch all lockers with filtering by kioskId, status
- **POST /api/lockers/{kioskId}/{lockerId}/open**: Queue-based locker opening
- **POST /api/lockers/bulk/open**: Bulk operations with command queuing

#### Direct Relay Control (`/api/relay/activate`)
- **POST /api/relay/activate**: Direct hardware activation (bypasses queue)
- **POST /api/relay/activate-bulk**: Multiple relay activation
- **GET /api/relay/status**: Hardware connection status

#### Admin UI Features
- Real-time locker grid with Turkish status display
- Click-to-select multiple lockers
- Hardware statistics and connection monitoring
- WebSocket updates for live state changes

### Configuration System

#### Current Config Structure (`config/system.json`)
```json
{
  "lockers": {
    "total_count": 32,
    "offline_threshold_seconds": 60,
    "bulk_operation_interval_ms": 500,
    "auto_release_hours": 24
  },
  "hardware": {
    "modbus": {
      "pulse_duration_ms": 400,
      "command_interval_ms": 300,
      "max_retries": 4
    }
  }
}
```

### State Management

#### LockerStateManager Key Methods
```typescript
// Core methods to integrate with smart assignment
async getLocker(kioskId: string, lockerId: number): Promise<Locker | null>
async assignLocker(kioskId: string, lockerId: number, ownerType: OwnerType, ownerKey: string): Promise<boolean>
async releaseLocker(kioskId: string, lockerId: number, ownerKey?: string): Promise<boolean>
async getAvailableLockers(kioskId: string): Promise<Locker[]>
async checkExistingOwnership(ownerKey: string, ownerType: OwnerType): Promise<Locker | null>
```

#### WebSocket Integration
- Real-time state updates via WebSocket on port 8080
- Broadcasts locker state changes to connected clients
- Connection monitoring and automatic reconnection

### Turkish Language Support

#### UI Messages (Current)
```javascript
const messages = {
  idle: "Kartınızı okutun",
  no_lockers: "Müsait dolap yok - Daha sonra deneyin",
  opening: "Açılıyor...",
  opened_released: "Dolap açıldı ve bırakıldı",
  failed_open: "Dolap açılamadı - Tekrar deneyin",
  select_locker: "Dolap seçin"
};
```

#### Status Translation (Database → UI)
- Database: `Free` → UI: `Boş`
- Database: `Owned` → UI: `Sahipli` 
- Database: `Opening` → UI: `Açılıyor`
- Database: `Error` → UI: `Hata`
- Database: `Blocked` → UI: `Engelli`

### Performance Considerations

#### Raspberry Pi Optimizations
- Memory cleanup for long-running processes
- Connection pooling and timeout management
- Efficient WebSocket message handling
- Optimistic locking for concurrent operations

#### Rate Limiting (Current)
```json
"rate_limits": {
  "ip_per_minute": 20,
  "card_per_minute": 30,
  "locker_per_minute": 3,
  "device_per_20_seconds": 1
}
```

## Integration Points for Smart Assignment

### 1. Feature Flag Implementation
- Add to `config/system.json` under new `smart_assignment` section
- Check flag in `/api/rfid/handle-card` to switch between manual/auto modes
- Ensure backward compatibility with existing APIs

### 2. Assignment Engine Integration
- Hook into existing `LockerStateManager.assignLocker()` method
- Extend `ModbusController.openLocker()` for sensorless retry logic
- Integrate with current session management system

### 3. Configuration Management
- Extend existing config system in `config/system.json`
- Add hot-reload capability to current configuration loading
- Implement per-kiosk overrides using database tables

### 4. Database Extensions
- Add new columns to existing `lockers` table (free_since, wear, quarantine_until, etc.)
- Create new tables for configuration, sessions, metrics
- Maintain compatibility with existing queries

### 5. Admin Panel Integration
- Extend existing `/api/lockers` endpoints for configuration management
- Add new admin pages alongside existing locker management UI
- Integrate with current WebSocket system for real-time updates

### 6. API Compatibility
- Maintain existing endpoint signatures
- Add new smart assignment responses to `/api/rfid/handle-card`
- Extend admin endpoints without breaking current functionality

## Critical Implementation Notes

### Hardware Constraints
- Single serial port access - only one service can control hardware at a time
- Relay command timing - respect 300ms intervals between commands
- CRC calculation must use existing working implementation
- Hardware error handling must integrate with current retry logic

### Session Management
- Current 30-second timeout system must be extended for smart sessions
- Session cleanup and memory management for Raspberry Pi
- WebSocket integration for real-time session updates

### Database Considerations
- SQLite WAL mode enabled - design for concurrent access
- Optimistic locking (version field) - handle conflicts gracefully
- Migration system in place - use existing MigrationRunner

### Turkish Language Requirements
- All user-facing messages must be in Turkish
- Admin interface supports both Turkish labels and English technical terms
- Status translation layer between database (English) and UI (Turkish)

### Testing Strategy
- Hardware testing scripts available in `scripts/` directory
- Integration tests for existing locker operations
- Performance testing for Raspberry Pi constraints
- Backward compatibility validation

## File References for Implementation

### Core Files to Modify
- `app/kiosk/src/controllers/ui-controller.ts` - Main RFID handling
- `shared/services/locker-state-manager.ts` - State management
- `app/kiosk/src/hardware/modbus-controller.ts` - Hardware control
- `app/panel/src/routes/locker-routes.ts` - Admin API
- `config/system.json` - Configuration

### New Files to Create
- Smart assignment engine service
- Configuration manager with hot reload
- Enhanced session tracker
- Alert manager service
- Database migrations for new schema

### UI Files to Update
- `app/kiosk/src/ui/static/app.js` - Kiosk interface
- `app/panel/src/views/lockers.html` - Admin interface
- Add new admin pages for configuration and monitoring

This context should guide implementation to ensure seamless integration with the existing system while adding the smart assignment capabilities.