// Ensure EFORM_DB_PATH is set before any database imports
if (!process.env.EFORM_DB_PATH) {
  const path = require('path');
  // Resolve to project root from app/kiosk/src/
  const projectRoot = path.resolve(__dirname, '../../..');
  process.env.EFORM_DB_PATH = path.join(projectRoot, 'data', 'eform.db');
  console.log(`🔧 Kiosk: Set EFORM_DB_PATH to ${process.env.EFORM_DB_PATH}`);
}

import Fastify from "fastify";
import { LockerStateManager } from "../../../shared/services/locker-state-manager";
import { LockerNamingService } from "../../../shared/services/locker-naming-service";
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
const lockerNamingService = new LockerNamingService(lockerStateManager.db);

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
  modbusController,
  lockerNamingService
);
const qrHandler = new QrHandler(lockerStateManager, modbusController, lockerNamingService);
const uiController = new UiController(
  lockerStateManager,
  modbusController,
  lockerNamingService
);
const i18nController = new KioskI18nController(fastify);

// Get kiosk ID from environment or config
const KIOSK_ID = process.env.KIOSK_ID || "kiosk-1";
const ZONE = process.env.ZONE || "main";
const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:3000";
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

// Command execution tracking for idempotency
const executedCommands = new Map<string, { result: any; timestamp: number }>();
const COMMAND_CACHE_TTL = 300000; // 5 minutes

// Cleanup old command cache entries
setInterval(() => {
  const now = Date.now();
  for (const [commandId, entry] of executedCommands.entries()) {
    if (now - entry.timestamp > COMMAND_CACHE_TTL) {
      executedCommands.delete(commandId);
    }
  }
}, 60000); // Cleanup every minute

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

// Admin API endpoint for direct locker opening
fastify.post("/api/locker/open", async (request, reply) => {
  try {
    const { locker_id, staff_user, reason } = request.body as {
      locker_id: number;
      staff_user: string;
      reason?: string;
    };

    if (!locker_id || !staff_user) {
      return reply.status(400).send({
        success: false,
        error: "locker_id and staff_user are required"
      });
    }

    if (locker_id < 1 || locker_id > 30) {
      return reply.status(400).send({
        success: false,
        error: "Invalid locker_id. Must be between 1 and 30."
      });
    }

    console.log(`🔓 Direct locker opening: ${locker_id} by ${staff_user}`);

    // Use ModbusController to open the locker
    const success = await modbusController.openLocker(locker_id);

    if (success) {
      return reply.send({
        success: true,
        message: `Locker ${locker_id} opened successfully`,
        locker_id,
        staff_user,
        reason: reason || 'Direct API access',
        timestamp: new Date().toISOString()
      });
    } else {
      return reply.status(500).send({
        success: false,
        error: `Failed to open locker ${locker_id}`,
        locker_id,
        staff_user
      });
    }

  } catch (error) {
    console.error('❌ Direct locker open error:', error);
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// EMERGENCY: Close locker endpoint to prevent hardware damage
fastify.post('/api/locker/close', async (request, reply) => {
  try {
    const { locker_id, staff_user, reason } = request.body as {
      locker_id: number;
      staff_user: string;
      reason?: string;
    };

    if (!locker_id || !staff_user) {
      return reply.status(400).send({
        success: false,
        error: "locker_id and staff_user are required"
      });
    }

    if (locker_id < 1 || locker_id > 30) {
      return reply.status(400).send({
        success: false,
        error: "Invalid locker_id. Must be between 1 and 30."
      });
    }

    console.log(`🔒 Emergency close locker: ${locker_id} by ${staff_user}`);

    // Map locker_id to cardId and relayId
    const cardId = Math.ceil(locker_id / 16);
    const relayId = ((locker_id - 1) % 16) + 1;
    const targetSlaveAddress = cardId;

    // Force close the relay
    const success = await modbusController.sendCloseRelay(relayId, targetSlaveAddress);

    if (success) {
      return reply.send({
        success: true,
        message: `Locker ${locker_id} closed successfully`,
        locker_id,
        staff_user,
        reason: reason || 'Emergency close',
        timestamp: new Date().toISOString()
      });
    } else {
      return reply.status(500).send({
        success: false,
        error: `Failed to close locker ${locker_id}`,
        locker_id,
        staff_user
      });
    }

  } catch (error) {
    console.error('❌ Emergency close error:', error);
    return reply.status(500).send({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
fastify.get("/health", async (request, reply) => {
  return {
    status: "healthy",
    kiosk_id: KIOSK_ID,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  };
});

// Performance tracking proxy endpoint to avoid CSP issues
fastify.post("/api/performance/ui-event", async (request, reply) => {
  try {
    // Proxy performance events to panel service
    const panelUrl = process.env.PANEL_URL || "http://127.0.0.1:3001";
    
    const response = await fetch(`${panelUrl}/api/performance/ui-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request.body)
    });

    if (response.ok) {
      const result = await response.json();
      return reply.send(result);
    } else {
      return reply.status(response.status).send({ 
        success: false, 
        error: 'Failed to proxy performance event' 
      });
    }
  } catch (error) {
    // Silently handle errors to avoid console spam
    return reply.status(500).send({ 
      success: false, 
      error: 'Performance tracking unavailable' 
    });
  }
});

// Initialize RFID handler
rfidHandler.on("card_scanned", async (scanEvent: any) => {
  await rfidUserFlow.handleCardScanned(scanEvent);
});

// Register command handlers for heartbeat client
heartbeatClient.registerCommandHandler("open_locker", async (command) => {
  try {
    // Idempotency check - return cached result if command already executed
    const cachedResult = executedCommands.get(command.command_id);
    if (cachedResult) {
      fastify.log.info({
        action: 'open_locker_command_duplicate',
        command_id: command.command_id,
        kiosk_id: KIOSK_ID,
        message: 'Returning cached result for duplicate command'
      });
      return cachedResult.result;
    }

    const { locker_id, staff_user, reason, force } =
      command.payload.open_locker || {};

    if (!locker_id) {
      const errorResult = { success: false, error: "Missing locker_id in command payload" };
      executedCommands.set(command.command_id, { result: errorResult, timestamp: Date.now() });
      
      fastify.log.error({
        action: 'open_locker_command_failed',
        command_id: command.command_id,
        error: 'Missing locker_id in command payload'
      });
      return errorResult;
    }

    // Log command execution start
    fastify.log.info({
      action: 'open_locker_command_start',
      command_id: command.command_id,
      kiosk_id: KIOSK_ID,
      locker_id,
      staff_user,
      reason,
      force
    });

    // Fetch locker to check VIP status
    const locker = await lockerStateManager.getLocker(KIOSK_ID, locker_id);
    if (!locker) {
      fastify.log.error({
        action: 'open_locker_command_failed',
        command_id: command.command_id,
        kiosk_id: KIOSK_ID,
        locker_id,
        staff_user,
        error: 'Locker not found'
      });
      return { success: false, error: "Locker not found" };
    }

    // Execute locker opening - this will now use correct cardId/relayId mapping
    const success = await modbusController.openLocker(locker_id);

    if (success) {
      // Database update only occurs after successful relay pulse
      if (locker.is_vip && !force) {
        // Skip release for VIP lockers unless force is true
        fastify.log.info({
          action: 'open_locker_command_success',
          command_id: command.command_id,
          kiosk_id: KIOSK_ID,
          locker_id,
          staff_user,
          reason,
          message: 'VIP locker opened without release'
        });
        const result = { success: true, message: "VIP locker opened without release" };
        executedCommands.set(command.command_id, { result, timestamp: Date.now() });
        return result;
      } else {
        // Release locker ownership for non-VIP or forced operations
        await lockerStateManager.releaseLocker(KIOSK_ID, locker_id);
        
        fastify.log.info({
          action: 'open_locker_command_success',
          command_id: command.command_id,
          kiosk_id: KIOSK_ID,
          locker_id,
          staff_user,
          reason,
          message: 'Locker opened and released successfully'
        });
        const result = { success: true };
        executedCommands.set(command.command_id, { result, timestamp: Date.now() });
        return result;
      }
    } else {
      fastify.log.error({
        action: 'open_locker_command_failed',
        command_id: command.command_id,
        kiosk_id: KIOSK_ID,
        locker_id,
        staff_user,
        reason,
        error: 'Failed to open locker hardware'
      });
      const result = { success: false, error: "Failed to open locker hardware" };
      executedCommands.set(command.command_id, { result, timestamp: Date.now() });
      return result;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const { staff_user } = command.payload.open_locker || {};
    fastify.log.error({
      action: 'open_locker_command_error',
      command_id: command.command_id,
      kiosk_id: KIOSK_ID,
      staff_user: staff_user || 'unknown',
      error: errorMessage
    });
    return {
      success: false,
      error: errorMessage,
    };
  }
});

heartbeatClient.registerCommandHandler("bulk_open", async (command) => {
  try {
    const { locker_ids, staff_user, exclude_vip, interval_ms } =
      command.payload.bulk_open || {};

    if (!locker_ids || !Array.isArray(locker_ids)) {
      fastify.log.error({
        action: 'bulk_open_command_failed',
        command_id: command.command_id,
        error: 'Missing or invalid locker_ids in command payload'
      });
      return {
        success: false,
        error: "Missing or invalid locker_ids in command payload",
      };
    }

    // Clamp interval_ms to safe range (100-5000ms)
    const clampedInterval = Math.max(100, Math.min(interval_ms || 1000, 5000));
    
    // Log bulk command execution start
    fastify.log.info({
      action: 'bulk_open_command_start',
      command_id: command.command_id,
      kiosk_id: KIOSK_ID,
      locker_ids,
      staff_user,
      exclude_vip,
      interval_ms: clampedInterval,
      original_interval_ms: interval_ms
    });

    let successCount = 0;
    const failedLockers: number[] = [];
    const vipSkipped: number[] = [];

    for (const lockerId of locker_ids) {
      try {
        // Add clamped interval between operations
        if (successCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, clampedInterval));
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
          // Database update only occurs after successful relay pulse
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

    // Log bulk command completion
    fastify.log.info({
      action: 'bulk_open_command_complete',
      command_id: command.command_id,
      kiosk_id: KIOSK_ID,
      staff_user,
      total_requested: locker_ids.length,
      successful_opens: successCount,
      failed_lockers: failedLockers,
      vip_skipped: vipSkipped,
      error_messages: errorMessages
    });

    return {
      success: true,
      error: errorMessages.length > 0 ? errorMessages.join("; ") : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const { staff_user } = command.payload.bulk_open || {};
    fastify.log.error({
      action: 'bulk_open_command_error',
      command_id: command.command_id,
      kiosk_id: KIOSK_ID,
      staff_user: staff_user || 'unknown',
      error: errorMessage
    });
    return {
      success: false,
      error: errorMessage,
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

    // Initialize ModbusController (CRITICAL: This was missing!)
    try {
      console.log(`🔧 Initializing ModbusController on port: ${modbusConfig.port}`);
      await modbusController.initialize();
      console.log(`✅ ModbusController initialized successfully`);
    } catch (modbusError) {
      console.error("❌ Error initializing ModbusController:", modbusError);
      console.error("❌ Hardware relay control will not work!");
      console.error("Check USB-RS485 connection and relay card power");
      // Don't exit - allow service to start for other functionality
    }

    // Initialize kiosk lockers if needed (with error handling)
    try {
      // Change working directory to project root to fix database path issues
      const path = require('path');
      const projectRoot = path.resolve(__dirname, '../../..');
      process.chdir(projectRoot);
      
      console.log(`🔍 Initializing lockers for kiosk: ${KIOSK_ID}`);
      console.log(`🔍 Changed working directory to: ${process.cwd()}`);
      console.log(`🔍 Database path: ${process.env.EFORM_DB_PATH || './data/eform.db'}`);
      await lockerStateManager.initializeKioskLockers(KIOSK_ID, 30);
      console.log(`✅ Kiosk lockers initialized successfully`);
    } catch (dbError) {
      console.error("❌ Error initializing kiosk lockers:", dbError);
      if (
        dbError instanceof Error &&
        dbError.message.includes("no such table")
      ) {
        console.error("❌ Database tables not found!");
        console.error("Please run database migrations first:");
        console.error("  npm run migrate");
        console.error("Or use the quick fix:");
        console.error("  node scripts/quick-database-fix.js");
        process.exit(1);
      } else {
        throw dbError;
      }
    }

    // Initialize WebSocket server for real-time state broadcasting
    try {
      const wsPort = parseInt(process.env.WEBSOCKET_PORT || "8080");
      lockerStateManager.initializeWebSocket(wsPort);
      console.log(`🔌 WebSocket server initialized on port ${wsPort}`);
    } catch (wsError) {
      console.error("❌ Error initializing WebSocket server:", wsError);
      console.error("Real-time updates will not work!");
    }

    // Start heartbeat client
    await heartbeatClient.start();

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
  await heartbeatClient.stop();
  await modbusController.close();
  uiController.shutdown(); // Shutdown session manager
  await lockerStateManager.shutdown();
  await fastify.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  await heartbeatClient.stop();
  await modbusController.close();
  uiController.shutdown(); // Shutdown session manager
  await lockerStateManager.shutdown();
  await fastify.close();
  process.exit(0);
});

start();

// Export ModbusController for external use (testing, etc.)
export { ModbusController };
