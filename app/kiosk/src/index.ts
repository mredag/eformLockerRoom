import Fastify from 'fastify';
import { LockerStateManager } from '../../../shared/services/locker-state-manager.js';
import { QrHandler } from './controllers/qr-handler.js';
import { UiController } from './controllers/ui-controller.js';
import { RfidUserFlow } from './services/rfid-user-flow.js';
import { ModbusController } from './hardware/modbus-controller.js';
import { RfidHandler } from './hardware/rfid-handler.js';
import { HeartbeatClient } from './services/heartbeat-client.js';
import { KioskSecurityMiddleware, createKioskValidationMiddleware } from './middleware/security-middleware.js';
import { KioskI18nController } from './controllers/i18n-controller.js';

const fastify = Fastify({
  logger: true
});

// Initialize security middleware
const securityMiddleware = new KioskSecurityMiddleware();
const validationMiddleware = createKioskValidationMiddleware();

// Apply security headers to all responses
fastify.addHook('onRequest', securityMiddleware.createSecurityHook());

// Initialize services
const lockerStateManager = new LockerStateManager();
const modbusController = new ModbusController();
const rfidHandler = new RfidHandler();
const rfidUserFlow = new RfidUserFlow(lockerStateManager, modbusController);
const qrHandler = new QrHandler(lockerStateManager, modbusController);
const uiController = new UiController(lockerStateManager, rfidUserFlow, modbusController);
const i18nController = new KioskI18nController(fastify);

// Get kiosk ID from environment or config
const KIOSK_ID = process.env.KIOSK_ID || 'kiosk-1';
const ZONE = process.env.ZONE || 'main';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const VERSION = process.env.npm_package_version || '1.0.0';
const PORT = parseInt(process.env.PORT || '3001');

// Initialize heartbeat client
const heartbeatClient = new HeartbeatClient({
  gatewayUrl: GATEWAY_URL,
  kioskId: KIOSK_ID,
  zone: ZONE,
  version: VERSION,
  heartbeatIntervalMs: 10000, // 10 seconds
  pollIntervalMs: 2000,       // 2 seconds
  maxRetries: 3,
  retryDelayMs: 5000
});

// QR Code endpoints
fastify.get('/lock/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const lockerId = parseInt(id);
  
  if (isNaN(lockerId)) {
    return reply.code(400).send({ error: 'Invalid locker ID' });
  }

  return await qrHandler.handleQrGet(KIOSK_ID, lockerId, request, reply);
});

fastify.post('/act', {
  preHandler: [validationMiddleware.validateQrRequest()]
}, async (request, reply) => {
  return await qrHandler.handleQrAction(KIOSK_ID, request, reply);
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    kiosk_id: KIOSK_ID,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
});

// Initialize RFID handler
rfidHandler.onCardScanned = async (cardId: string) => {
  await rfidUserFlow.handleCardScanned(KIOSK_ID, cardId);
};

// Register command handlers for heartbeat client
heartbeatClient.registerCommandHandler('open_locker', async (command) => {
  try {
    const { locker_id, staff_user, reason, force } = command.payload.open_locker || {};
    
    if (!locker_id) {
      return { success: false, error: 'Missing locker_id in command payload' };
    }

    // Fetch locker to check VIP status
    const locker = await lockerStateManager.getLocker(KIOSK_ID, locker_id);
    if (!locker) {
      return { success: false, error: 'Locker not found' };
    }

    // Execute locker opening
    const success = await modbusController.openLocker(locker_id);
    
    if (success) {
      // Skip release for VIP lockers unless force is true
      if (locker.is_vip && !force) {
        return { success: true, message: 'VIP locker opened without release' };
      } else {
        // Release locker ownership for non-VIP or forced operations
        await lockerStateManager.releaseLocker(KIOSK_ID, locker_id);
        return { success: true };
      }
    } else {
      return { success: false, error: 'Failed to open locker hardware' };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

heartbeatClient.registerCommandHandler('bulk_open', async (command) => {
  try {
    const { locker_ids, staff_user, exclude_vip, interval_ms } = command.payload.bulk_open || {};
    
    if (!locker_ids || !Array.isArray(locker_ids)) {
      return { success: false, error: 'Missing or invalid locker_ids in command payload' };
    }

    let successCount = 0;
    const failedLockers: number[] = [];
    const vipSkipped: number[] = [];

    for (const lockerId of locker_ids) {
      try {
        // Add interval between operations
        if (interval_ms && successCount > 0) {
          await new Promise(resolve => setTimeout(resolve, interval_ms));
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
      errorMessages.push(`Failed lockers: ${failedLockers.join(', ')}`);
    }
    if (vipSkipped.length > 0) {
      errorMessages.push(`VIP lockers skipped: ${vipSkipped.join(', ')}`);
    }

    return { 
      success: true, 
      error: errorMessages.length > 0 ? errorMessages.join('; ') : undefined
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

heartbeatClient.registerCommandHandler('block_locker', async (command) => {
  try {
    const { locker_id, staff_user, reason } = command.payload.block_locker || {};
    
    if (!locker_id) {
      return { success: false, error: 'Missing locker_id in command payload' };
    }

    await lockerStateManager.blockLocker(KIOSK_ID, locker_id, reason || 'Blocked by staff');
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
});

heartbeatClient.registerCommandHandler('unblock_locker', async (command) => {
  try {
    const { locker_id } = command.payload.unblock_locker || {};
    
    if (!locker_id) {
      return { success: false, error: 'Missing locker_id in command payload' };
    }

    await lockerStateManager.unblockLocker(KIOSK_ID, locker_id);
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
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
    
    // Start heartbeat client
    await heartbeatClient.start();
    
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Kiosk service ${KIOSK_ID} running on port ${PORT} (zone: ${ZONE})`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await heartbeatClient.stop();
  await lockerStateManager.shutdown();
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await heartbeatClient.stop();
  await lockerStateManager.shutdown();
  await fastify.close();
  process.exit(0);
});

start();