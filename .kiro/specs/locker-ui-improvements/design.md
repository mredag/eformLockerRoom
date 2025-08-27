# Design Document

## Overview

This design implements comprehensive UI improvements for the eForm Locker System, focusing on enhanced user experience with always-visible locker status, smooth transitions, Turkish language support, and a flexible locker naming system. The design prioritizes accessibility, performance on Raspberry Pi hardware, and real-time state synchronization across all interfaces.

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Kiosk UI      │    │   Admin Panel   │    │   Database      │
│   (Port 3002)   │    │   (Port 3001)   │    │   (SQLite)      │
│                 │    │                 │    │                 │
│ - Always-on     │    │ - Locker Cards  │    │ - Locker Names  │
│   Grid Display  │    │ - Bulk Actions  │    │ - State Tracking│
│ - RFID Sessions │    │ - Filtering     │    │ - Audit Logs    │
│ - Turkish UI    │    │ - Real-time     │    │ - Performance   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  State Manager  │
                    │                 │
                    │ - WebSocket     │
                    │ - Event Bus     │
                    │ - Cache Layer   │
                    └─────────────────┘
```

### Data Flow

1. **State Updates**: Hardware → Kiosk Service → State Manager → All UIs
2. **RFID Events**: Card Reader → Kiosk UI → Session Manager → Grid Updates
3. **Admin Actions**: Admin Panel → Gateway → Kiosk Service → Hardware
4. **Real-time Sync**: State Manager broadcasts to all connected clients via WebSocket

## Components and Interfaces

### 1. Kiosk UI Component Architecture

#### Screen Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│                    Full Screen App                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Background Layer                   │   │
│  │         Live Locker Grid (Blurred)             │   │
│  │                                                 │   │
│  │  ┌─────────────────────────────────────────┐   │   │
│  │  │           Front Overlay Card            │   │   │
│  │  │        "Kart okutunuz"                  │   │   │
│  │  │     (Centered, High Contrast)          │   │   │
│  │  └─────────────────────────────────────────┘   │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Bottom Legend Bar                  │   │
│  │    [Boş] [Dolu] [Açılıyor] [Hata] [Engelli]   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### State Management Interface
```typescript
interface KioskState {
  mode: 'idle' | 'session' | 'opening' | 'feedback';
  sessionId?: string;
  countdown?: number;
  selectedLocker?: number;
  lastUpdate: Date;
  connectionStatus: 'online' | 'offline' | 'reconnecting';
}

interface LockerTile {
  id: number;
  displayName: string;
  relayNumber: number;
  state: 'Boş' | 'Dolu' | 'Açılıyor' | 'Hata' | 'Engelli';
  lastChanged: Date;
  isSelectable: boolean;
}
```

#### Visual Specifications

**Idle State Configuration:**
- Background Grid: Blur 12px, Opacity 70%, Scale 0.98
- Overlay Card: Max width 480px, Padding 24px, Corner radius 24px
- Typography: High contrast (dark text on light card OR light on dark)
- Legend: Bottom center, small state chips

**Grid Tile Specifications (FHD):**
- Tile Size: 120x120px with 12px gaps
- Touch Target: Minimum 56px inside tile
- Content: Large custom name (truncated), small relay number, corner icon
- Universal States (used everywhere): Boş, Dolu, Açılıyor, Hata, Engelli
- State colors and icons:
  - Boş: Green fill + Check icon
  - Dolu: Red fill + Lock icon  
  - Açılıyor: Orange fill + Spinner icon
  - Hata: Gray fill + Warning icon
  - Engelli: Blue/Purple fill + Shield icon

### 2. Session Management System

#### Session Lifecycle
```typescript
interface RFIDSession {
  id: string;
  kioskId: string;
  cardId: string;
  startTime: Date;
  timeoutSeconds: number; // Default: 20
  status: 'active' | 'expired' | 'completed' | 'cancelled';
}

class SessionManager {
  createSession(cardId: string): RFIDSession;
  extendSession(sessionId: string): void;
  cancelSession(sessionId: string, reason: string): void;
  handleNewCard(cardId: string): void; // Cancels existing, creates new
  cleanup(): void; // Remove expired sessions
}
```

#### Session Management Rules
- **One Active Session**: Only one session per kiosk at any time
- **New Card Handling**: New RFID cancels current session with message "Yeni kart okundu. Önceki oturum kapatıldı."
- **Countdown Display**: 20-second countdown in top right, large and clear, visible during entire session
- **Legend Visibility**: Always visible during both idle and session states

#### Transition Animations
- **RFID Read**: Overlay fade to 0, blur to 0, scale to 1.00 (under 300ms), countdown appears
- **Selection**: Tile lift 4px, outline glow
- **Opening**: Spinner rotation (1s per loop), optional soft pulse (90-100% opacity)
- **Big Feedback**: Screen-level messages "Dolap açılıyor", "Dolap açıldı", "Açılamadı"
- **Return to Idle**: Overlay fade in, reapply blur, hide countdown (200-300ms)

### 3. Admin Panel Enhancement

#### Locker Card Component
```typescript
interface LockerCardProps {
  displayName: string;
  relayNumber: number;
  state: LockerState;
  lastChanged: Date;
  ownerInfo?: string;
  onOpen: () => void;
  onRelease: () => void;
}

interface LockerManagementFilters {
  state?: LockerState[];
  kioskId?: string;
  nameSearch?: string;
  sortBy: 'name' | 'relay' | 'state' | 'lastChanged';
  sortOrder: 'asc' | 'desc';
}
```

#### Bulk Operations Interface
```typescript
interface BulkActions {
  openSelected(lockerIds: number[]): Promise<CommandResult[]>;
  releaseSelected(lockerIds: number[]): Promise<CommandResult[]>;
  refreshStatus(lockerIds: number[]): Promise<void>;
}
```

### 4. Locker Naming System

#### Database Schema Extension
```sql
-- Add to existing lockers table
ALTER TABLE lockers ADD COLUMN display_name VARCHAR(20);
ALTER TABLE lockers ADD COLUMN name_updated_at DATETIME;
ALTER TABLE lockers ADD COLUMN name_updated_by VARCHAR(50);

-- Create naming audit table
CREATE TABLE locker_name_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locker_id INTEGER,
  old_name VARCHAR(20),
  new_name VARCHAR(20),
  changed_by VARCHAR(50),
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (locker_id) REFERENCES lockers(id)
);
```

#### Naming Service Interface
```typescript
interface LockerNamingService {
  setDisplayName(lockerId: number, name: string, updatedBy: string): Promise<void>;
  getDisplayName(lockerId: number): string; // Returns custom name or "Dolap [relay]"
  validateName(name: string): ValidationResult;
  generatePresets(): string[]; // ["Kapı A1", "Dolap 101", etc.]
  exportPrintableMap(kioskId: string): PrintableMap;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  suggestions?: string[];
}
```

## Data Models

### Enhanced Locker Model
```typescript
interface EnhancedLocker {
  id: number;
  relayNumber: number;
  displayName: string; // Custom name or fallback
  kioskId: string;
  state: 'Boş' | 'Dolu' | 'Açılıyor' | 'Hata' | 'Engelli';
  ownerKey?: string;
  lastStateChange: Date;
  lastOpened?: Date;
  openCount: number;
  errorCount: number;
  isSelectable: boolean;
}
```

### Performance Metrics Model
```typescript
interface PerformanceMetrics {
  timeToOpen: number[]; // Array of response times
  errorRate: number; // Percentage
  sessionsPerHour: number;
  mostSelectedLockers: { lockerId: number; count: number }[];
  averageIdleTime: number; // Seconds
  uiUpdateLatency: number[]; // Array of update times
}
```

### Real-time Event Model
```typescript
interface StateUpdateEvent {
  type: 'locker_state_change' | 'session_update' | 'system_status';
  timestamp: Date;
  data: {
    lockerId?: number;
    newState?: LockerState;
    sessionId?: string;
    connectionStatus?: 'online' | 'offline';
  };
}
```

## Error Handling

### Error Message Catalog
```typescript
const ERROR_MESSAGES = {
  HARDWARE_DISCONNECTED: "Donanım bağlı değil. Sistem bakımda",
  LOCKER_BUSY: "Dolap dolu",
  SESSION_TIMEOUT: "Oturum zaman aşımı", 
  GENERAL_ERROR: "İşlem yapılamadı",
  CONNECTION_LOST: "Çevrimdışı",
  CONNECTION_RESTORED: "Yeniden bağlandı"
};

const RECOVERY_SUGGESTIONS = {
  LOCKER_BUSY: "Farklı dolap seçin",
  OPERATION_FAILED: "Tekrar deneyin", 
  SYSTEM_ERROR: "Görevliye başvurun"
};
```

### Error Handling Strategy
1. **Graceful Degradation**: Show cached state when offline
2. **User Guidance**: Provide clear next steps for each error type
3. **Automatic Recovery**: Retry failed operations with exponential backoff
4. **Logging**: Comprehensive error tracking for troubleshooting

## Testing Strategy

### Unit Tests
- Session management lifecycle
- Locker naming validation
- State transition logic
- Error message localization

### Integration Tests
- Real-time state synchronization
- RFID session handling
- Admin panel operations
- Database naming system

### Performance Tests
- UI responsiveness on Raspberry Pi
- Animation smoothness at 30fps
- Memory usage during extended operation
- WebSocket connection stability

### User Experience Tests
- 2-meter readability validation
- Touch target accessibility (56px minimum)
- Color-blind accessibility testing
- Turkish language display correctness

### Success Criteria Validation
- 95% of locker opens complete under 2 seconds
- Error rate under 2%
- UI updates under 2 seconds
- Smooth performance on target hardware

## Implementation Phases

### Phase 1: Core UI Framework
- Implement always-visible grid with blur/overlay system
- Add session management with countdown
- Create state-based tile rendering
- Implement smooth transitions

### Phase 2: Enhanced Feedback
- Add Turkish message system
- Implement audio feedback
- Create toast notification system
- Add connection status indicators

### Phase 3: Naming System
- Extend database schema
- Create naming management interface
- Implement validation and audit system
- Add printable map generation

### Phase 4: Admin Panel Improvements
- Redesign locker cards with state chips
- Add filtering and sorting capabilities
- Implement bulk operations
- Remove non-functional buttons

### Phase 5: Real-time Synchronization
- Implement WebSocket state broadcasting
- Add connection monitoring
- Create automatic reconnection logic
- Optimize update performance

## Quick Acceptance Checklist

### Kiosk Interface
- [ ] Idle shows blurred live grid, centered "Kart okutunuz", legend visible
- [ ] RFID fades overlay in under 300ms, countdown starts in top right
- [ ] Tiles show Boş, Dolu, Açılıyor, Hata, Engelli with clear colors and icons
- [ ] Session ends on success, timeout, or new card and returns to idle cleanly
- [ ] Legend remains visible during both idle and session states
- [ ] Big feedback messages appear for all major actions

### Admin Panel
- [ ] Locker cards show state chips with consistent state names
- [ ] Port 3001 is used consistently throughout documentation
- [ ] Non-functional "Engelle" buttons are removed
- [ ] Real-time updates work across all interfaces

This design provides a comprehensive foundation for implementing all the requested UI improvements while maintaining system performance and reliability.