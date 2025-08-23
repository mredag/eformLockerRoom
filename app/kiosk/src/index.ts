import Fastify from "fastify";
import { LockerStateManager } from "../../../shared/services/locker-state-manager";
import { QrHandler } from "./controllers/qr-handler";
import { UiController } from "./controllers/ui-controller";
import { RfidUserFlow } from "./services/rfid-user-flow";
import { ModbusController } from "./hardware/modbus-controller";
import { RfidHandler } from "./hardware/rfid-handler";
import { HeartbeatClient } from "./services/heartbeat-client";
import {
  KioskSecurityMiddleware,
  createKioskValidationMiddleware,
} from "./middleware/security-middleware";
import { KioskI18nController } from "./controllers/i18n-controller";

const fastify = Fastify({
  logger: true,
});

// Initialize security middleware
const securityMiddleware = new KioskSecurityMiddleware();
const validationMiddleware = createKioskValidationMiddleware();

// Apply security headers to all responses
fastify.addHook("onRequest", securityMiddleware.createSecurityHook());

// Initialize services
const lockerStateManager = new LockerStateManager();

// Modbus configuration
const modbusConfig = {
  port: process.env.MODBUS_PORT || "/dev/ttyUSB0",
  baudrate: parseInt(process.env.MODBUS_BAUDRATE || "9600"),
  timeout_ms: 1000,
  pulse_duration_ms: 500,
  burst_duration_seconds: 2,
  burst_interval_ms: 100,
  command_interval_ms: 50,
  max_retries: 3,
  retry_delay_base_ms: 100,
  retry_delay_max_ms: 1000,
  connection_retry_attempts: 5,
  health_check_interval_ms: 30000,
  test_mode: false,
  use_multiple_coils: true,
  verify_writes: true,
};

// Validate configuration before use
if (!modbusConfig || typeof modbusConfig !== "object") {
  console.error("❌ Fatal Error: modbusConfig is not a valid object");
  process.exit(1);
}

if (!modbusConfig.port) {
  console.error("❌ Fatal Error: modbusConfig.port is not defined");
  console.error("Environment MODBUS_PORT:", process.env.MODBUS_PORT);
  process.exit(1);
}

// RFID configuration
const rfidConfig = {
  reader_type: (process.env.RFID_READER_TYPE as "hid" | "keyboard") || "hid",
  debounce_ms: 1000,
  vendor_id: parseInt(process.env.RFID_VENDOR_ID || "0x0"),
  product_id: parseInt(process.env.RFID_PRODUCT_ID || "0x0"),
};

const modbusController = new ModbusController(modbusConfig);
const rfidHandler = new RfidHandler(rfidConfig);

// RFID User Flow configuration
const rfidUserFlowConfig = {
  kiosk_id: process.env.KIOSK_ID || "kiosk-1",
  max_available_lockers_display: parseInt(
    process.env.MAX_AVAILABLE_LOCKERS || "10"
  ),
  opening_timeout_ms: parseInt(process.env.OPENING_TIMEOUT_MS || "30000"),
};

const rfidUserFlow = new RfidUserFlow(
  rfidUserFlowConfig,
  lockerStateManager,
  modbusController
);
const qrHandler = new QrHandler(lockerStateManager, modbusController);
const uiController = new UiController(
  lockerStateManager,
  rfidUserFlow,
  modbusController
);
const i18nController = new KioskI18nController(fastify);

// Get kiosk ID from environment or config
const KIOSK_ID = process.env.KIOSK_ID || "kiosk-1";
const ZONE = process.env.ZONE || "main";
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3000";
const VERSION = process.env.npm_package_version || "1.0.0";
const PORT = parseInt(process.env.PORT || "3002");

// Initialize heartbeat client
const heartbeatClient = new HeartbeatClient({
  gatewayUrl: GATEWAY_URL,
  kioskId: KIOSK_ID,
  zone: ZONE,
  version: VERSION,
  heartbeatIntervalMs: 10000, // 10 seconds
  pollIntervalMs: 2000, // 2 seconds
  maxRetries: 3,
  retryDelayMs: 5000,
});

// QR Code endpoints
fastify.get("/lock/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const lockerId = parseInt(id);

  if (isNaN(lockerId)) {
    return reply.code(400).send({ error: "Invalid locker ID" });
  }

  return await qrHandler.handleQrGet(KIOSK_ID, lockerId, request, reply);
});

fastify.post(
  "/act",
  {
    preHandler: [validationMiddleware.validateQrRequest()],
  },
  async (request, reply) => {
    return await qrHandler.handleQrAction(KIOSK_ID, request, reply);
  }
);

// Health check endpoint
fastify.get("/health", async (request, reply) => {
  return {
    status: "healthy",
    kiosk_id: KIOSK_ID,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
});

// Initialize RFID handler
rfidHandler.on("card_scanned", async (scanEvent: any) => {
  await rfidUserFlow.handleCardScanned(scanEvent);
});

// Register command handlers for heartbeat client
heartbeatClient.registerCommandHandler("open_locker", async (command) => {
  try {
    const { locker_id, staff_user, reason, force } =
      command.payload.open_locker || {};

    if (!locker_id) {
      return { success: false, error: "Missing locker_id in command payload" };
    }

    // Fetch locker to check VIP status
    const locker = await lockerStateManager.getLocker(KIOSK_ID, locker_id);
    if (!locker) {
      return { success: false, error: "Locker not found" };
    }

    // Execute locker opening
    const success = await modbusController.openLocker(locker_id);

    if (success) {
      // Skip release for VIP lockers unless force is true
      if (locker.is_vip && !force) {
        return { success: true, message: "VIP locker opened without release" };
      } else {
        // Release locker ownership for non-VIP or forced operations
        await lockerStateManager.releaseLocker(KIOSK_ID, locker_id);
        return { success: true };
      }
    } else {
      return { success: false, error: "Failed to open locker hardware" };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

heartbeatClient.registerCommandHandler("bulk_open", async (command) => {
  try {
    const { locker_ids, staff_user, exclude_vip, interval_ms } =
      command.payload.bulk_open || {};

    if (!locker_ids || !Array.isArray(locker_ids)) {
      return {
        success: false,
        error: "Missing or invalid locker_ids in command payload",
      };
    }

    let successCount = 0;
    const failedLockers: number[] = [];
    const vipSkipped: number[] = [];

    for (const lockerId of locker_ids) {
      try {
        // Add interval between operations
        if (interval_ms && successCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, interval_ms));
        }

        // Fetch locker to check VIP status
        const locker = await lockerStateManager.getLocker(KIOSK_ID, lockerId);
        if (!locker) {
          failedLockers.push(lockerId);
          continue;
        }

        // Skip VIP lockers if exclude_vip is true
        if (locker.is_vip && exclude_vip) {
          vipSkipped.push(lockerId);
          continue;
        }

        const success = await modbusController.openLocker(lockerId);

        if (success) {
          // Skip release for VIP lockers
          if (!locker.is_vip) {
            await lockerStateManager.releaseLocker(KIOSK_ID, lockerId);
          }
          successCount++;
        } else {
          failedLockers.push(lockerId);
        }
      } catch (error) {
        failedLockers.push(lockerId);
      }
    }

    const errorMessages = [];
    if (failedLockers.length > 0) {
      errorMessages.push(`Failed lockers: ${failedLockers.join(", ")}`);
    }
    if (vipSkipped.length > 0) {
      errorMessages.push(`VIP lockers skipped: ${vipSkipped.join(", ")}`);
    }

    return {
      success: true,
      error: errorMessages.length > 0 ? errorMessages.join("; ") : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

heartbeatClient.registerCommandHandler("block_locker", async (command) => {
  try {
    const { locker_id, staff_user, reason } =
      command.payload.block_locker || {};

    if (!locker_id) {
      return { success: false, error: "Missing locker_id in command payload" };
    }

    await lockerStateManager.blockLocker(
      KIOSK_ID,
      locker_id,
      reason || "Blocked by staff"
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

heartbeatClient.registerCommandHandler("unblock_locker", async (command) => {
  try {
    const { locker_id } = command.payload.unblock_locker || {};

    if (!locker_id) {
      return { success: false, error: "Missing locker_id in command payload" };
    }

    await lockerStateManager.unblockLocker(KIOSK_ID, locker_id);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Start server
const start = async () => {
  try {
    // Register UI routes
    await uiController.registerRoutes(fastify);

    // Register i18n routes
    await i18nController.registerRoutes();

    // Initialize kiosk lockers if needed
    await lockerStateManager.initializeKioskLockers(KIOSK_ID, 30);

    // Start heartbeat client (disabled for now)
    // await heartbeatClient.start();

    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(
      `🚀 Kiosk service ${KIOSK_ID} running on port ${PORT} (zone: ${ZONE})`
    );
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  // await heartbeatClient.stop();
  await lockerStateManager.shutdown();
  await fastify.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  // await heartbeatClient.stop();
  await lockerStateManager.shutdown();
  await fastify.close();
  process.exit(0);
});

start();
