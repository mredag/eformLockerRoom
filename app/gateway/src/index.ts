import Fastify from "fastify";
import { DatabaseManager } from "../../../shared/database/database-manager.js";
import { provisioningRoutes } from "./routes/provisioning.js";
import { configurationRoutes } from "./routes/configuration.js";
import { heartbeatRoutes } from "./routes/heartbeat.js";
import { websocketRoutes } from "./routes/websocket.js";
import { registerHelpRoutes } from "./routes/help.js";
import { vipRoutes } from "./routes/vip.js";
import { reportsRoutes } from "./routes/reports.js";
// import { settingsRoutes } from "./routes/settings.js";
import { commandRoutes } from "./routes/commands.js";
import { WebSocketManager } from "./services/websocket-manager.js";
import { WebSocketEvents } from "./utils/websocket-events.js";
import { mkdirSync } from "fs";

const fastify = Fastify({
  logger: true,
});

let websocketManager: WebSocketManager;
let websocketEvents: WebSocketEvents;

// Export for use by other modules
export { websocketManager, websocketEvents };

// Ensure data directory exists
try {
  mkdirSync("./data", { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Initialize database
async function initializeDatabase() {
  const dbManager = DatabaseManager.getInstance({
    migrationsPath: '../../migrations'
  });
  await dbManager.initialize();
}

// Register routes (WebSocket routes will be registered after WebSocket manager is initialized)
fastify.register(provisioningRoutes, { prefix: "/api/provisioning" });
fastify.register(configurationRoutes, { prefix: "/api/configuration" });
fastify.register(heartbeatRoutes, { prefix: "/api/kiosk" });
fastify.register(registerHelpRoutes);

// Register VIP routes after database is initialized
fastify.register(async function (fastify) {
  const dbManager = DatabaseManager.getInstance();
  const database = dbManager.getConnection();
  await fastify.register(vipRoutes, { 
    prefix: "/api/vip",
    database 
  });
});

// Register Reports routes after database is initialized
fastify.register(async function (fastify) {
  const dbManager = DatabaseManager.getInstance();
  const database = dbManager.getConnection();
  // Add sqlite property to fastify instance for reports service
  fastify.decorate('sqlite', database);
  await fastify.register(reportsRoutes);
});

// Register Settings routes (temporarily disabled for telemetry testing)
// fastify.register(settingsRoutes);

// Register Command routes (will be registered after WebSocket manager is initialized)

// Health check endpoint
fastify.get("/health", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "eform-gateway",
    version: process.env.npm_package_version || "1.0.0",
  };
});

// Serve configuration panel
fastify.get("/config-panel", async (_request, reply) => {
  const { readFileSync } = await import("fs");
  const { join } = await import("path");

  try {
    const htmlPath = join(
      process.cwd(),
      "app",
      "panel",
      "src",
      "views",
      "configuration-panel.html"
    );
    const html = readFileSync(htmlPath, "utf8");
    reply.type("text/html").send(html);
  } catch (error) {
    reply.status(500).send({ error: "Failed to load configuration panel" });
  }
});

// Start server
const start = async () => {
  try {
    await initializeDatabase();
    
    // Register WebSocket support
    await fastify.register(import('@fastify/websocket'));
    
    // Register multipart support for file uploads
    await fastify.register(import('@fastify/multipart'), {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      }
    });
    
    // Initialize WebSocket manager
    websocketManager = new WebSocketManager(fastify);
    
    // Initialize WebSocket events utility
    websocketEvents = new WebSocketEvents(websocketManager);
    
    // Register WebSocket routes after manager is initialized
    await fastify.register(websocketRoutes, { websocketManager });
    
    // Register Command routes after WebSocket manager is initialized
    await fastify.register(commandRoutes, { websocketManager });
    
    const port = parseInt(process.env.PORT || "3000", 10);
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    console.log(`Eform Gateway Service started on port ${port}`);
    
    // Graceful shutdown handling
    const gracefulShutdown = () => {
      console.log('Shutting down gracefully...');
      if (websocketManager) {
        websocketManager.shutdown();
      }
      fastify.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
