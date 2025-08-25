import Fastify from "fastify";
import { DatabaseManager } from "../../../shared/database/database-manager.js";
import { provisioningRoutes } from "./routes/provisioning.js";
import { configurationRoutes } from "./routes/configuration.js";
import { heartbeatRoutes } from "./routes/heartbeat.js";
import { mkdirSync } from "fs";

const fastify = Fastify({
  logger: true,
});

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

// Register routes
fastify.register(provisioningRoutes, { prefix: "/api/provisioning" });
fastify.register(configurationRoutes, { prefix: "/api/configuration" });
fastify.register(heartbeatRoutes, { prefix: "/api/heartbeat" });

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
    const port = parseInt(process.env.PORT || "3000", 10);
    const host = process.env.HOST || "0.0.0.0";

    await fastify.listen({ port, host });
    console.log(`Eform Gateway Service started on port ${port}`);
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
