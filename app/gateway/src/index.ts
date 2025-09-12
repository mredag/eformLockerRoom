// Load environment variables from .env file
const { config } = require('dotenv');
const path = require('path');

// Resolve to project root from app/gateway/src/
const projectRoot = path.resolve(__dirname, '../../..');

// Load .env from project root
config({ path: path.join(projectRoot, '.env') });

// Ensure EFORM_DB_PATH is set before any database imports
if (!process.env.EFORM_DB_PATH) {
  process.env.EFORM_DB_PATH = path.join(projectRoot, 'data', 'eform.db');
  console.log(`🔧 Gateway: Set EFORM_DB_PATH to ${process.env.EFORM_DB_PATH}`);
}

import Fastify from "fastify";
import { DatabaseManager } from "../../../shared/database/database-manager.js";
import { provisioningRoutes } from "./routes/provisioning.js";
import { configurationRoutes } from "./routes/configuration.js";
import { heartbeatRoutes } from "./routes/heartbeat.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { mkdirSync } from "fs";

const fastify = Fastify({
  logger: true,
});

// Ensure project root data directory exists (not local ./data)
try {
  const path = require('path');
  const projectRoot = path.resolve(__dirname, '../../..');
  const dataDir = path.join(projectRoot, 'data');
  mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Gateway: Ensured data directory exists at ${dataDir}`);
} catch (error) {
  // Directory might already exist
}

// Initialize database
async function initializeDatabase() {
  const dbManager = DatabaseManager.getInstance({
    path: process.env.EFORM_DB_PATH!,
    migrationsPath: path.join(projectRoot, 'migrations')
  });
  await dbManager.initialize();
  return dbManager;
}

// Start server
const start = async () => {
  try {
    const dbManager = await initializeDatabase();
    const port = parseInt(process.env.PORT || "3000", 10);
    const host = process.env.HOST || "0.0.0.0";

    // Register routes
    fastify.register(provisioningRoutes, { prefix: "/api/provisioning", dbManager });
    fastify.register(configurationRoutes, { prefix: "/api/configuration", dbManager });
    fastify.register(heartbeatRoutes, { prefix: "/api/heartbeat", dbManager });

    // Register admin routes
    fastify.register(async function (fastify) {
      await registerAdminRoutes(fastify);
    });

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

    await fastify.listen({ port, host });
    console.log(`Eform Gateway Service started on port ${port}`);
    
    // Note: WebSocket server is initialized by the Kiosk service on port 8080
    // Gateway service coordinates but doesn't host the WebSocket server
    console.log(`🔌 WebSocket coordination: Kiosk services handle real-time updates on port 8080`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  try {
    await fastify.close();
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  try {
    await fastify.close();
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
});

start();
