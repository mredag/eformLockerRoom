# Design Document

## Overview

This design addresses the critical issue where the admin panel's "Open" button only updates the database without sending Modbus commands to physically open lockers. The solution integrates the admin panel with the existing command queue system to ensure locker operations trigger actual hardware relay pulses through the established kiosk service architecture.

## Architecture

The system follows a command-driven architecture where the admin panel enqueues commands that are processed by kiosk services:

- **Admin Panel Service** (port 3003): Staff interface that enqueues locker commands
- **Gateway Service** (port 3000): Command queue coordination and heartbeat management
- **Kiosk Services** (port 3001): Hardware control with Modbus integration
- **Command Queue**: SQLite-based queue for reliable command delivery
- **Modbus Hardware**: Waveshare 16-channel relay cards with RS-485 communication

### Current Issue Analysis

**Root Cause**: Admin panel routes call `lockerStateManager.releaseLocker()` which only updates the database. No Modbus commands are sent to the physical hardware.

**Impact**: Staff see status changes in the UI but lockers remain physically locked, making the admin panel ineffective for actual locker management.

**Solution**: Replace direct database updates with command queue integration, allowing the kiosk service to handle both hardware control and database updates.

## Components and Interfaces

### 1. Command Queue Integration

**Location**: `app/panel/src/routes/locker-routes.ts`

**Current Implementation**:

```typescript
// Only updates database - NO hardware control
await lockerStateManager.releaseLocker(
  lockerId,
  kioskId,
  user.username,
  reason
);
```

**Enhanced Implementation**:

```typescript
import { CommandQueueManager } from "../../../shared/services/command-queue-manager";

// Single locker open
const cmdQueue = new CommandQueueManager();
await cmdQueue.enqueueCommand(kioskId, "open_locker", {
  locker_id: lockerId_num,
  staff_user: user.username,
  reason: reason || "Manual open",
  force: override || false,
});

// Bulk locker open
await cmdQueue.enqueueCommand(kioskId, "bulk_open", {
  locker_ids: lockerIdsArray,
  staff_user: user.username,
  exclude_vip: excludeVip,
  interval_ms: intervalMs,
});
```

### 2. Enhanced Locker Routes

**Location**: `app/panel/src/routes/locker-routes.ts`

**Single Locker Open Route**:

```typescript
fastify.post("/api/lockers/:kioskId/:lockerId/open", async (request, reply) => {
  const { kioskId, lockerId } = request.params;
  const { reason, override } = request.body;

  // Validate session and permissions
  const user = await validateStaffSession(request);
  if (!user) {
    return reply
      .code(401)
      .send({ code: "unauthorized", message: "Login required" });
  }

  try {
    const lockerId_num = parseInt(lockerId);
    if (isNaN(lockerId_num)) {
      return reply
        .code(400)
        .send({ code: "bad_request", message: "Invalid locker ID" });
    }

    // Enqueue command instead of direct database update
    const cmdQueue = new CommandQueueManager();
    await cmdQueue.enqueueCommand(kioskId, "open_locker", {
      locker_id: lockerId_num,
      staff_user: user.username,
      reason: reason || "Manual open",
      force: override || false,
    });

    fastify.log.info({
      action: "locker_open_queued",
      kioskId,
      lockerId: lockerId_num,
      staffUser: user.username,
      reason,
    });

    const commandId = await cmdQueue.enqueueCommand(kioskId, "open_locker", {
      locker_id: lockerId_num,
      staff_user: user.username,
      reason: reason || "Manual open",
      force: override || false,
    });

    return reply.code(202).send({
      success: true,
      message: "Locker open command queued",
      command_id: commandId,
      lockerId: lockerId_num,
    });
  } catch (error) {
    fastify.log.error("Failed to queue locker open command:", error);
    return reply.code(500).send({
      code: "server_error",
      message: "Failed to queue open command",
    });
  }
});
```

**Bulk Open Route**:

```typescript
fastify.post("/api/lockers/bulk/open", async (request, reply) => {
  const { kioskId, lockerIds, reason, exclude_vip, interval_ms } = request.body;

  const user = await validateStaffSession(request);
  if (!user) {
    return reply
      .code(401)
      .send({ code: "unauthorized", message: "Login required" });
  }

  try {
    const lockerIdsArray = lockerIds
      .map((id) => parseInt(id))
      .filter((id) => !isNaN(id));

    if (lockerIdsArray.length === 0) {
      return reply
        .code(400)
        .send({ code: "bad_request", message: "No valid locker IDs provided" });
    }

    const cmdQueue = new CommandQueueManager();
    const commandId = await cmdQueue.enqueueCommand(kioskId, "bulk_open", {
      locker_ids: lockerIdsArray,
      staff_user: user.username,
      reason: reason || "Bulk manual open",
      exclude_vip: exclude_vip || false,
      interval_ms: interval_ms || 1000,
    });

    fastify.log.info({
      action: "bulk_open_queued",
      kioskId,
      lockerCount: lockerIdsArray.length,
      staffUser: user.username,
      reason,
    });

    const commandId = await cmdQueue.enqueueCommand(kioskId, "bulk_open", {
      locker_ids: lockerIdsArray,
      staff_user: user.username,
      reason: reason || "Bulk manual open",
      exclude_vip: excludeVip || false,
      interval_ms: intervalMs || 1000,
    });

    return reply.code(202).send({
      success: true,
      message: `Bulk open command queued for ${lockerIdsArray.length} lockers`,
      command_id: commandId,
      lockerIds: lockerIdsArray,
    });
  } catch (error) {
    fastify.log.error("Failed to queue bulk open command:", error);
    return reply.code(500).send({
      code: "server_error",
      message: "Failed to queue bulk open command",
    });
  }
});
```

### 3. Client-Side Updates

**Location**: `app/panel/src/views/lockers.html`

**Enhanced Open Functions**:

```javascript
async function openSingleLocker(lockerId, reason = "") {
  const kioskId = getSelectedKioskId();
  if (!kioskId) {
    showError("Select a kiosk first");
    return;
  }

  try {
    const response = await fetch(`/api/lockers/${kioskId}/${lockerId}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    showSuccess(`Locker ${lockerId} open command queued`);

    // Refresh locker display after short delay to allow command processing
    setTimeout(() => loadLockers(), 2000);
  } catch (error) {
    showError(`Failed to open locker: ${error.message}`);
    console.error("Single locker open failed:", error);
  }
}

async function performBulkOpen(
  lockerIds,
  reason,
  excludeVip = false,
  intervalMs = 1000
) {
  const kioskId = getSelectedKioskId();
  if (!kioskId) {
    showError("Select a kiosk first");
    return;
  }

  try {
    const response = await fetch("/api/lockers/bulk/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        kioskId,
        lockerIds,
        reason,
        exclude_vip,
        interval_ms,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    showSuccess(`Bulk open command queued for ${lockerIds.length} lockers`);

    // Refresh after estimated completion time
    const estimatedTime = lockerIds.length * interval_ms + 2000;
    setTimeout(() => loadLockers(), estimatedTime);
  } catch (error) {
    showError(`Bulk open failed: ${error.message}`);
    console.error("Bulk open failed:", error);
  }
}
```

### 4. Kiosk Service Command Processing

**Location**: `app/kiosk/src/services/command-processor.ts`

The kiosk service already handles `open_locker` and `bulk_open` commands. The key is ensuring these commands:

1. Call `modbusController.openLocker(cardId, relayId)` to pulse the relay
2. Update the database via `lockerStateManager.releaseLocker()` after successful hardware operation
3. Log the operation with staff user and reason

**Command Processing Flow**:

```typescript
// Existing kiosk command processing (reference only)
async processOpenLockerCommand(command: OpenLockerCommand) {
  const { locker_id, staff_user, reason, force } = command.data;

  try {
    // 1. Pulse the relay hardware
    const cardId = Math.ceil(locker_id / 16);
    const relayId = ((locker_id - 1) % 16) + 1;
    await this.modbusController.openLocker(cardId, relayId);

    // 2. Update database after successful hardware operation
    await this.lockerStateManager.releaseLocker(
      locker_id,
      this.kioskId,
      staff_user,
      reason
    );

    this.logger.info({
      action: 'locker_opened',
      lockerId: locker_id,
      staffUser: staff_user,
      reason,
      kioskId: this.kioskId
    });

  } catch (error) {
    this.logger.error('Failed to open locker:', error);
    throw error;
  }
}
```

### 5. Hardware Validation Integration

**Location**: `scripts/validate-waveshare-hardware.js`

**Enhanced Validation Script**:

```javascript
import { ModbusController } from "../app/kiosk/src/hardware/modbus-controller.js";

async function validateHardware() {
  console.log("🔧 Validating Waveshare relay hardware...");

  try {
    // Test configuration from system.json
    const controller = new ModbusController({
      port: "/dev/ttyUSB0",
      baudRate: 9600,
      timeout: 1000,
      use_multiple_coils: true,
    });

    await controller.initialize();

    // Test relay cards 1 and 2
    for (let cardId = 1; cardId <= 2; cardId++) {
      console.log(`Testing card ${cardId}...`);

      // Test first relay on each card
      await controller.openLocker(cardId, 1);
      console.log(`✅ Card ${cardId} relay 1 pulsed successfully`);

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await controller.close();
    console.log("✅ Hardware validation complete");
  } catch (error) {
    console.error("❌ Hardware validation failed:", error.message);
    console.log("\n🔍 Troubleshooting tips:");
    console.log("- Check RS-485 A/B wiring");
    console.log("- Verify DIP switches: Card 1=address 1, Card 2=address 2");
    console.log("- Ensure DIP 9=off (9600 baud), DIP 10=off (no parity)");
    console.log("- Confirm /dev/ttyUSB0 exists and has proper permissions");
    process.exit(1);
  }
}

validateHardware();
```

### 6. Service Port Configuration

**Location**: `app/panel/src/index.ts`

**Ensure Correct Port**:

```typescript
const PORT = process.env.PANEL_PORT || 3003;

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Admin panel server listening on ${address}`);
  console.log(`🎛️  Admin Panel: http://localhost:${PORT}`);
});
```

## Data Models

### Command Queue Models

```typescript
interface OpenLockerCommand {
  type: "open_locker";
  data: {
    locker_id: number;
    staff_user: string;
    reason: string;
    force: boolean;
  };
}

interface BulkOpenCommand {
  type: "bulk_open";
  data: {
    locker_ids: number[];
    staff_user: string;
    reason: string;
    exclude_vip: boolean;
    interval_ms: number;
  };
}
```

### Response Models

```typescript
interface OpenResponse {
  success: boolean;
  message: string;
  lockerId?: number;
  lockerIds?: number[];
}

interface ErrorResponse {
  code: "bad_request" | "unauthorized" | "server_error";
  message: string;
}
```

## Error Handling

### Hardware Error Handling

```typescript
async function handleModbusError(error: Error, lockerId: number) {
  if (error.message.includes("timeout")) {
    fastify.log.error({
      error: "Modbus timeout",
      lockerId,
      troubleshooting: "Check RS-485 wiring and DIP switch settings",
    });
    throw new Error("Hardware communication timeout - check wiring");
  }

  if (error.message.includes("permission")) {
    fastify.log.error({
      error: "Serial port permission denied",
      port: "/dev/ttyUSB0",
      troubleshooting:
        "Add user to dialout group: sudo usermod -a -G dialout $USER",
    });
    throw new Error("Serial port access denied");
  }

  throw error;
}
```

### Client Error Display

```javascript
function showError(message) {
  const errorDiv = document.getElementById("error-message");
  errorDiv.textContent = message;
  errorDiv.className = "error-banner show";
  setTimeout(() => errorDiv.classList.remove("show"), 5000);
}

function showSuccess(message) {
  const successDiv = document.getElementById("success-message");
  successDiv.textContent = message;
  successDiv.className = "success-banner show";
  setTimeout(() => successDiv.classList.remove("show"), 3000);
}
```

## Testing Strategy

### 1. Hardware Validation Testing

**Prerequisites**:

- Waveshare relay cards powered and connected
- RS-485 converter at /dev/ttyUSB0
- Correct DIP switch settings

**Test Cases**:

- Run `npx tsx scripts/validate-waveshare-hardware.js` → expect successful relay pulses
- Run `npx tsx scripts/simple-relay-test.js` → expect manual locker opening
- Test ModbusController instantiation with production settings
- Verify 400ms pulse duration and proper timing

### 2. Command Queue Integration Testing

**Test Cases**:

- Admin panel single locker open → expect command queued and processed
- Admin panel bulk open → expect multiple commands processed with intervals
- Kiosk service command processing → expect hardware pulse + database update
- Command failure handling → expect error logging and no database update

### 3. End-to-End Testing

**Test Cases**:

- Staff login → select kiosk → click "Open" → verify physical locker opens
- Bulk select lockers → bulk open → verify all selected lockers open with intervals
- Network error during command → expect proper error handling
- Hardware failure → expect error message and no database corruption

**Success Criteria**:

- Physical lockers open when "Open" button is clicked
- Database reflects actual locker states
- Staff actions are properly logged with username and reason
- Hardware errors are handled gracefully with clear messages

## Implementation Priority

### Phase 1: Core Integration (Day 1)

1. Update locker routes to use CommandQueueManager instead of direct database calls
2. Modify client-side JavaScript to handle queued commands
3. Test single locker open functionality

### Phase 2: Bulk Operations (Day 2)

1. Implement bulk open command queuing
2. Add interval timing for bulk operations
3. Test bulk open with multiple lockers

### Phase 3: Validation and Hardening (Day 3)

1. Enhance hardware validation scripts
2. Add comprehensive error handling
3. Verify service port configuration
4. End-to-end testing with physical hardware

This design ensures the admin panel integrates properly with the existing command queue architecture while maintaining the reliability and logging capabilities of the current system.
