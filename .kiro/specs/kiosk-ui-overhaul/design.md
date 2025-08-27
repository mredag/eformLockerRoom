# Design Document

## Overview

This design creates a completely new, lightweight kiosk interface optimized for Raspberry Pi performance while fixing the broken card assignment functionality. The design prioritizes simplicity, reliability, and performance over complex animations and effects. The new interface will use a single-page application with minimal JavaScript and CSS to ensure smooth operation on resource-constrained hardware.

## Architecture

### Simplified System Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   RFID Reader   │    │   Kiosk UI      │    │   Backend API   │
│   (Hardware)    │    │   (Simplified)  │    │   (Existing)    │
│                 │    │                 │    │                 │
│ - Card Scan     │───▶│ - Simple Grid   │───▶│ - Locker API    │
│ - HID Input     │    │ - Touch Events  │    │ - Session Mgmt  │
│                 │    │ - Basic State   │    │ - Hardware Ctrl │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Performance-First Architecture

1. **Minimal JavaScript**: Single file with essential functionality only
2. **Simple CSS**: No complex animations, gradients, or effects
3. **Direct API Calls**: Streamlined communication with backend
4. **Static Assets**: Minimal external dependencies
5. **Memory Management**: Automatic cleanup and garbage collection

## Components and Interfaces

### 1. Simplified Kiosk Interface

#### Screen Layout
```
┌─────────────────────────────────────────────────────────┐
│                    Kiosk Interface                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │                Header Bar                       │   │
│  │  [Status] [Time] [Connection] [Session Timer]  │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │                Main Content                     │   │
│  │                                                 │   │
│  │  IDLE: "Kartınızı okutun"                     │   │
│  │  SESSION: "Dolap seçin" + Grid                 │   │
│  │  LOADING: "İşlem yapılıyor..."                 │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │                Footer Bar                       │   │
│  │  [Legend: Boş=Yeşil, Dolu=Kırmızı, Kapalı=Gri]│   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### State Management
```typescript
interface SimpleKioskState {
  mode: 'idle' | 'session' | 'loading' | 'error';
  sessionId?: string;
  countdown?: number;
  selectedCard?: string;
  availableLockers: SimpleLocker[];
  errorMessage?: string;
}

interface SimpleLocker {
  id: number;
  name: string;
  status: 'available' | 'occupied' | 'disabled';
  selectable: boolean;
}
```

### 2. Streamlined Session Flow

#### Session Lifecycle
```
1. IDLE STATE
   ↓ (Card Scan)
2. CHECK EXISTING
   ├─ Has Locker → OPEN & RELEASE → IDLE
   └─ No Locker → SESSION STATE
3. SESSION STATE (30s timer)
   ├─ Select Locker → ASSIGN & OPEN → IDLE
   ├─ Timeout → IDLE
   └─ New Card → Cancel → CHECK EXISTING
```

#### API Endpoints (Simplified)
```typescript
// Check if card has existing locker
GET /api/card/{cardId}/locker

// Get available lockers for selection
GET /api/lockers/available?kioskId={id}

// Assign locker to card
POST /api/locker/assign
{
  cardId: string,
  lockerId: number,
  kioskId: string
}

// Open existing locker and release
POST /api/locker/release
{
  cardId: string,
  kioskId: string
}
```

### 3. Performance-Optimized UI Components

#### Locker Grid Component
```html
<div class="locker-grid">
  <div class="locker-tile available" data-locker-id="1">
    <div class="locker-number">1</div>
    <div class="locker-status">Boş</div>
  </div>
  <div class="locker-tile occupied" data-locker-id="2">
    <div class="locker-number">2</div>
    <div class="locker-status">Dolu</div>
  </div>
  <!-- More tiles... -->
</div>
```

#### CSS Specifications (Pi-Optimized)
```css
/* No animations, simple transitions only */
.locker-tile {
  width: 120px;
  height: 120px;
  border: 2px solid #ccc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.1s ease; /* Minimal transition */
}

.locker-tile.available {
  background-color: #4CAF50; /* Green */
  color: white;
}

.locker-tile.occupied {
  background-color: #f44336; /* Red */
  color: white;
  cursor: not-allowed;
}

.locker-tile.disabled {
  background-color: #9E9E9E; /* Gray */
  color: white;
  cursor: not-allowed;
}

/* No complex animations or effects */
.locker-tile:hover.available {
  background-color: #45a049;
}
```

### 4. Simplified JavaScript Architecture

#### Main Application Class
```typescript
class SimpleKioskApp {
  constructor() {
    this.state = {
      mode: 'idle',
      sessionId: null,
      countdown: 0,
      availableLockers: [],
      errorMessage: null
    };
    this.kioskId = 'kiosk-1';
    this.sessionTimer = null;
  }

  // Core methods
  init(): void;
  handleCardScan(cardId: string): Promise<void>;
  selectLocker(lockerId: number): Promise<void>;
  startSession(lockers: SimpleLocker[]): void;
  endSession(): void;
  showError(message: string): void;
  updateDisplay(): void;
}
```

#### Event Handling (Simplified)
```typescript
// RFID card input handling
document.addEventListener('keydown', (event) => {
  if (this.state.mode === 'idle') {
    this.handleRfidInput(event);
  }
});

// Locker selection handling
document.addEventListener('click', (event) => {
  const tile = event.target.closest('.locker-tile');
  if (tile && tile.classList.contains('available')) {
    const lockerId = parseInt(tile.dataset.lockerId);
    this.selectLocker(lockerId);
  }
});
```

## Data Models

### Simplified Locker Model
```typescript
interface SimpleLockerData {
  id: number;
  displayName: string;
  status: 'available' | 'occupied' | 'disabled';
  lastUpdate: Date;
}
```

### Session Model
```typescript
interface SimpleSession {
  id: string;
  cardId: string;
  kioskId: string;
  startTime: Date;
  timeoutSeconds: number;
  status: 'active' | 'expired' | 'completed';
}
```

### API Response Models
```typescript
interface CardCheckResponse {
  hasLocker: boolean;
  lockerId?: number;
  message: string;
}

interface LockerAssignResponse {
  success: boolean;
  lockerId?: number;
  message: string;
  error?: string;
}

interface AvailableLockersResponse {
  lockers: SimpleLockerData[];
  sessionId: string;
  timeoutSeconds: number;
}
```

## Error Handling

### Error Categories and Messages
```typescript
const ERROR_MESSAGES = {
  CARD_READ_FAILED: "Kart okunamadı - Tekrar deneyin",
  NO_LOCKERS_AVAILABLE: "Müsait dolap yok - Daha sonra deneyin",
  ASSIGNMENT_FAILED: "Dolap atanamadı - Farklı dolap seçin",
  HARDWARE_OFFLINE: "Sistem bakımda - Görevliye başvurun",
  SESSION_EXPIRED: "Süre doldu - Kartınızı tekrar okutun",
  NETWORK_ERROR: "Bağlantı hatası - Tekrar deneyin",
  UNKNOWN_ERROR: "Bilinmeyen hata - Görevliye başvurun"
};
```

### Error Recovery Strategy
1. **Automatic Retry**: Network errors retry 3 times with 1-second delay
2. **Graceful Degradation**: Show cached locker status when offline
3. **Clear Recovery Path**: Always provide "Ana ekrana dön" option
4. **User Guidance**: Simple, actionable error messages in Turkish

## Testing Strategy

### Performance Testing
- **CPU Usage**: Monitor during normal operation (target: <50%)
- **Memory Usage**: Track RAM consumption (target: <200MB)
- **Response Time**: Measure UI responsiveness (target: <100ms)
- **Battery Life**: Test on Pi with battery backup

### Functionality Testing
- **Card Assignment Flow**: Test complete RFID → selection → assignment cycle
- **Session Management**: Verify timeout, cancellation, and new card handling
- **Error Scenarios**: Test all error conditions and recovery paths
- **Hardware Integration**: Validate locker opening and status updates

### Raspberry Pi Specific Testing
- **Different Pi Models**: Test on Pi 3B+, Pi 4 (2GB, 4GB, 8GB)
- **Various Screen Resolutions**: 1024x768, 1280x720, 1920x1080
- **Touch Screen Compatibility**: Test with official Pi touchscreen
- **Performance Under Load**: Stress test with continuous operation

## Implementation Phases

### Phase 1: Core Infrastructure
- Create new simplified HTML structure
- Implement basic CSS without animations
- Set up minimal JavaScript application framework
- Create simplified API endpoints

### Phase 2: RFID and Session Management
- Implement RFID card reading
- Create streamlined session management
- Add 30-second countdown timer
- Implement session cleanup

### Phase 3: Locker Grid and Selection
- Create responsive locker grid
- Implement touch-friendly selection
- Add real-time status updates
- Optimize for Pi performance

### Phase 4: Error Handling and Polish
- Add comprehensive error handling
- Implement Turkish error messages
- Add connection status monitoring
- Performance optimization and testing

### Phase 5: Integration and Deployment
- Integration testing with existing backend
- Pi-specific optimizations
- Deployment scripts and documentation
- User acceptance testing

## Performance Optimizations

### Raspberry Pi Specific Optimizations
```css
/* Disable expensive CSS features */
* {
  box-shadow: none !important;
  text-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
}

/* Use hardware acceleration sparingly */
.locker-tile {
  transform: translateZ(0); /* Force GPU layer only when needed */
}

/* Optimize animations */
@media (max-width: 1920px) {
  * {
    animation-duration: 0.1s !important; /* Minimal animations */
    transition-duration: 0.1s !important;
  }
}
```

### JavaScript Optimizations
```typescript
// Debounce rapid events
const debouncedUpdate = debounce(this.updateDisplay.bind(this), 100);

// Minimize DOM queries
const elements = {
  grid: document.getElementById('locker-grid'),
  status: document.getElementById('status-message'),
  timer: document.getElementById('session-timer')
};

// Use efficient event delegation
document.addEventListener('click', this.handleClick.bind(this));
```

### Memory Management
```typescript
// Clean up timers and event listeners
cleanup() {
  if (this.sessionTimer) {
    clearInterval(this.sessionTimer);
    this.sessionTimer = null;
  }
  
  // Clear large arrays
  this.availableLockers = [];
  
  // Force garbage collection if available
  if (window.gc) {
    window.gc();
  }
}
```

## Success Criteria

### Performance Metrics
- **Load Time**: Interface loads in <2 seconds on Pi 3B+
- **Response Time**: Touch events respond in <100ms
- **CPU Usage**: Average <50% during normal operation
- **Memory Usage**: Stable <200MB RAM usage
- **Reliability**: 99%+ uptime over 24-hour periods

### Functionality Metrics
- **Assignment Success**: 95%+ successful card-to-locker assignments
- **Error Recovery**: All error states provide clear recovery path
- **Session Management**: 100% reliable session timeout and cleanup
- **Hardware Integration**: 99%+ successful locker operations

### User Experience Metrics
- **Touch Responsiveness**: All buttons respond immediately to touch
- **Visual Clarity**: Interface readable from 2 meters distance
- **Error Understanding**: Users can resolve 90%+ of errors independently
- **Task Completion**: 95%+ of users complete locker assignment successfully

This design provides a solid foundation for creating a reliable, Pi-optimized kiosk interface that fixes the current card assignment issues while maintaining excellent performance and user experience.