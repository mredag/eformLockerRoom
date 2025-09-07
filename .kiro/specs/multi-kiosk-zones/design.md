# Design Document

## Overview

The multi-kiosk zones feature extends the existing eForm Locker System to support multiple physical kiosk devices serving different zones (men's room, women's room, staff areas, etc.) while maintaining centralized hardware control and administration. The design leverages the existing database schema and configuration system to avoid any database migrations while providing flexible zone-based locker management.

## Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Men's Kiosk   │    │  Women's Kiosk  │    │   Staff Kiosk   │
│   Pi Device     │    │   Pi Device     │    │   Pi Device     │
│                 │    │                 │    │                 │
│ Browser opens:  │    │ Browser opens:  │    │ Browser opens:  │
│ ?zone=mens      │    │ ?zone=womens    │    │ ?zone=staff     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Main Server Pi       │
                    │                          │
                    │  ┌─────────────────────┐ │
                    │  │ Gateway (3000)      │ │
                    │  │ Panel (3001)        │ │
                    │  │ Kiosk (3002)        │ │
                    │  └─────────────────────┘ │
                    │                          │
                    │  ┌─────────────────────┐ │
                    │  │ USB-RS485 Adapter   │ │
                    │  └─────────┬───────────┘ │
                    └────────────┼─────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                       │                        │
   ┌────▼────┐             ┌────▼────┐             ┌────▼────┐
   │ Card 1  │             │ Card 2  │             │ Card 3  │
   │ Mens    │             │ Mens    │             │ Womens  │
   │ Lockers │             │ Lockers │             │ Lockers │
   │ 1-16    │             │ 17-32   │             │ 33-48   │
   └─────────┘             └─────────┘             └─────────┘
```

### Zone-Based Data Flow

1. **Kiosk Device Startup**: Each Pi device opens browser with zone parameter
2. **Zone Identification**: Server reads zone parameter and maps to kiosk_id
3. **Locker Filtering**: System filters lockers by kiosk_id using existing database structure
4. **Hardware Routing**: Zone configuration overrides default card calculation for hardware commands

## Components and Interfaces

### 1. Zone Configuration System

**Location**: Extends existing configuration management system

**Structure**:

```typescript
interface ZoneConfig {
  zones: {
    [zoneName: string]: {
      kiosk_id: string; // e.g., "kiosk-mens"
      display_name: string; // e.g., "Men's Locker Room"
      description?: string; // Optional description
      relay_cards: number[]; // Array of slave addresses [1, 2]
      locker_ranges: Array<{
        // Locker ID ranges for this zone
        start: number;
        end: number;
      }>;
      enabled: boolean;
    };
  };
}
```

**Integration**: Extends existing `hardware.relay_cards` configuration with zone assignments.

### 2. Zone Management Admin Interface

**Location**: New section in admin panel navigation

**Components**:

- Zone list/grid view
- Zone creation/editing forms
- Relay card assignment interface
- Locker range configuration
- Validation and conflict detection

**Routes**:

- `GET /zones` - Zone management page
- `GET /api/zones` - Get all zones
- `POST /api/zones` - Create new zone
- `PUT /api/zones/:id` - Update zone
- `DELETE /api/zones/:id` - Delete zone

### 3. Zone-Aware Kiosk Service

**URL Parameter Processing**:

```typescript
// Extract zone from URL parameter
const zone = request.query.zone as string;
const kioskId = zoneConfig.zones[zone]?.kiosk_id || "kiosk-1";

// Filter lockers by kiosk_id
const lockers = await lockerStateManager.getLockersByKioskId(kioskId);
```

**Hardware Command Routing**:

```typescript
// Override default card calculation with zone-specific mapping
function getHardwareAddress(lockerId: number): { card: number; relay: number } {
  // 1. Find the zone this locker belongs to from the global config
  const zone = findZoneForLocker(lockerId);

  if (!zone) {
    // Fallback to default calculation for backward compatibility
    const card = Math.ceil(lockerId / 16);
    const relay = ((lockerId - 1) % 16) + 1;
    return { card, relay };
  }

  // 2. Calculate the locker's zero-based index *within its zone*
  const firstLockerInZone = zone.locker_ranges[0].start;
  const lockerIndexInZone = lockerId - firstLockerInZone;

  // 3. Use this relative index to find the correct card and relay
  const cardIndexInZone = Math.floor(lockerIndexInZone / 16);
  const relayId = (lockerIndexInZone % 16) + 1;

  // 4. Get the actual Modbus slave address from the zone's card array
  const cardSlaveAddress = zone.relay_cards[cardIndexInZone];
  if (!cardSlaveAddress) {
    throw new Error(`Hardware configuration error for zone ${zone.id}`);
  }

  return { card: cardSlaveAddress, relay: relayId };
}

function findZoneForLocker(lockerId: number): Zone | null {
  const config = getZoneConfiguration();
  for (const zone of Object.values(config.zones)) {
    for (const range of zone.locker_ranges) {
      if (lockerId >= range.start && lockerId <= range.end) {
        return zone;
      }
    }
  }
  return null;
}
```

### 4. Database Integration

**No Schema Changes Required**: Uses existing composite key structure.

**Locker Filtering**:

```sql
-- Filter lockers by zone (via kiosk_id)
SELECT * FROM lockers WHERE kiosk_id = 'kiosk-mens' AND status = 'Free';
```

**Zone Tracking**:

```sql
-- Use existing kiosk_heartbeat table
UPDATE kiosk_heartbeat
SET zone = 'mens', last_seen = CURRENT_TIMESTAMP
WHERE kiosk_id = 'kiosk-mens';
```

## Data Models

### Zone Configuration Model

```typescript
interface Zone {
  id: string; // Zone identifier (e.g., "mens")
  kiosk_id: string; // Database kiosk_id (e.g., "kiosk-mens")
  display_name: string; // Human-readable name
  description?: string; // Optional description
  relay_cards: number[]; // Assigned relay card slave addresses
  locker_ranges: LockerRange[]; // Locker ID ranges
  enabled: boolean; // Zone active status
  created_at: Date;
  updated_at: Date;
}

interface LockerRange {
  start: number; // Starting locker ID
  end: number; // Ending locker ID
}
```

### Hardware Mapping Model

```typescript
interface ZoneHardwareMapping {
  zone: string;
  kiosk_id: string;
  card_assignments: {
    [lockerId: number]: {
      slave_address: number;
      relay_id: number;
    };
  };
}

// Example zone configurations with non-standard ranges
interface ExampleZoneConfig {
  zones: {
    mens: {
      kiosk_id: "kiosk-mens";
      locker_ranges: [{ start: 1; end: 32 }]; // Lockers 1-32
      relay_cards: [1, 2]; // Cards 1,2
    };
    womens: {
      kiosk_id: "kiosk-womens";
      locker_ranges: [{ start: 33; end: 48 }]; // Lockers 33-48
      relay_cards: [3]; // Card 3 only
    };
    staff: {
      kiosk_id: "kiosk-staff";
      locker_ranges: [{ start: 49; end: 56 }]; // Lockers 49-56
      relay_cards: [4]; // Card 4 only
    };
  };
}

// Hardware mapping examples:
// Locker 1 (mens): index=0, card=1, relay=1
// Locker 33 (womens): index=0, card=3, relay=1
// Locker 49 (staff): index=0, card=4, relay=1
```

## Error Handling

### Zone Configuration Validation

1. **Locker Range Conflicts**: Ensure no overlapping locker ranges between zones
2. **Relay Card Conflicts**: Ensure each relay card is assigned to only one zone
3. **Kiosk ID Uniqueness**: Ensure each kiosk_id is used by only one zone
4. **Hardware Availability**: Validate that assigned relay cards exist and are enabled

### Runtime Error Handling

1. **Invalid Zone Parameter**: Default to main zone or show zone selection
2. **Hardware Unavailable**: Show appropriate error messages per zone
3. **Cross-Zone Access**: Redirect users to correct zone when accessing wrong kiosk
4. **Configuration Errors**: Graceful fallback to single-zone mode

### Error Response Format

```typescript
interface ZoneError {
  success: false;
  error: string;
  error_code: "ZONE_NOT_FOUND" | "HARDWARE_UNAVAILABLE" | "CONFIG_INVALID";
  suggested_action?: string;
  redirect_zone?: string;
}
```

## Testing Strategy

### Unit Tests

1. **Zone Configuration Validation**

   - Test locker range conflict detection
   - Test relay card assignment validation
   - Test configuration parsing and serialization

2. **Hardware Mapping Logic**

   - Test zone-specific card calculation
   - Test fallback to default calculation
   - Test invalid zone handling

3. **URL Parameter Processing**
   - Test zone extraction from URL
   - Test kiosk_id mapping
   - Test invalid zone parameter handling

### Integration Tests

1. **Multi-Zone Locker Operations**

   - Test locker opening in different zones
   - Test cross-zone access prevention
   - Test hardware command routing

2. **Admin Interface Integration**

   - Test zone creation and editing
   - Test configuration persistence
   - Test validation error handling

3. **Database Integration**
   - Test locker filtering by kiosk_id
   - Test existing data compatibility
   - Test performance with multiple zones

### End-to-End Tests

1. **Multi-Device Simulation**

   - Simulate multiple kiosk devices with different zones
   - Test concurrent access from different zones
   - Test hardware isolation between zones

2. **User Journey Tests**
   - Test complete user flow in each zone
   - Test cross-zone user redirection
   - Test admin zone management workflow

### Performance Tests

1. **Concurrent Zone Access**

   - Test multiple zones accessing hardware simultaneously
   - Test database query performance with zone filtering
   - Test configuration loading performance

2. **Hardware Command Throughput**
   - Test hardware command routing performance
   - Test zone-specific hardware isolation
   - Test fallback performance under load

## Implementation Phases

### Phase 1: Core Zone Configuration System

- Extend configuration management to support zones
- Implement zone validation logic
- Add zone-aware hardware mapping
- Update kiosk service to process zone parameters

### Phase 2: Admin Interface

- Add zone management to admin panel navigation
- Implement zone CRUD operations
- Add relay card assignment interface
- Implement configuration validation UI

### Phase 3: Multi-Device Support

- Test multi-device deployment
- Implement cross-zone user redirection
- Add zone-specific error handling
- Performance optimization and monitoring

### Phase 4: Advanced Features

- Zone-specific customization (themes, languages)
- Advanced zone analytics and reporting
- Zone-based maintenance scheduling
- Automated zone health monitoring

## Security Considerations

### Zone Isolation

- Ensure hardware commands are properly isolated between zones
- Prevent cross-zone data access
- Validate zone permissions for admin operations

### Configuration Security

- Secure zone configuration storage
- Audit zone configuration changes
- Validate zone assignments before applying

### Access Control

- Zone-specific admin permissions (future enhancement)
- Secure zone parameter validation
- Prevent zone enumeration attacks

## Monitoring and Observability

### Zone-Specific Metrics

- Per-zone locker utilization
- Zone-specific hardware health
- Cross-zone access attempts
- Zone configuration change tracking

### Logging Enhancements

- Include zone information in all log entries
- Zone-specific error tracking
- Hardware command routing logs
- Configuration change audit logs

### Health Checks

- Per-zone hardware availability
- Zone configuration validation
- Cross-zone connectivity monitoring
- Zone-specific performance metrics
