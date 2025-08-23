import Fastify from "fastify";
import { DatabaseManager } from "../../../shared/database/database-manager";
import { AuthService } from "./services/auth-service";
import { SessionManager } from "./services/session-manager";
import { createAuthMiddleware } from "./middleware/auth-middleware";
import {
  SecurityMiddleware,
  AuditLogger,
} from "./middleware/security-middleware";
import { authRoutes } from "./routes/auth-routes";
import { lockerRoutes } from "./routes/locker-routes";
import { vipRoutes } from "./routes/vip-routes";
import { EventRepository } from "../../../shared/database/event-repository";
import { I18nController } from "./controllers/i18n-controller";
import { ConfigController } from "./controllers/config-controller";
import { configManager } from "../../../shared/services/config-manager";
import path from "path";

// Main application startup function
async function startPanelService() {
  const fastify = Fastify({
    logger: true,
  });

  try {
    // Initialize database with correct migrations path
    const dbManager = DatabaseManager.getInstance({
      migrationsPath: path.resolve(__dirname, "../../../migrations"),
    });
    await dbManager.initialize();

    // Initialize configuration manager
    await configManager.initialize();

    // Initialize services
    const authService = new AuthService(dbManager);
    const sessionManager = new SessionManager();

    // Initialize security services
    const eventRepository = new EventRepository(dbManager.getConnection());
    const auditLogger = new AuditLogger(eventRepository);
    const securityMiddleware = new SecurityMiddleware({
      csp: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    });

    const i18nController = new I18nController(fastify);
    const configController = new ConfigController(fastify);

    // Register plugins and middleware
    await fastify.register(import("@fastify/cookie"), {
      secret:
        process.env.COOKIE_SECRET ||
        "eform-panel-secret-key-change-in-production",
      parseOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      },
    });

    await fastify.register(import("@fastify/csrf-protection"));

    // Add security headers middleware
    fastify.addHook("onRequest", securityMiddleware.createSecurityHook());

    // Add authentication middleware
    fastify.addHook("preHandler", createAuthMiddleware({ sessionManager }));

    // Register routes
    await fastify.register(authRoutes, {
      prefix: "/auth",
      authService,
      sessionManager,
    });

    await fastify.register(lockerRoutes, {
      prefix: "/api/lockers",
      dbManager,
      auditLogger,
    });

    await fastify.register(vipRoutes, {
      prefix: "/api/vip",
      dbManager,
      auditLogger,
    });

    // Register i18n routes
    await i18nController.registerRoutes();

    // Register configuration routes
    await configController.registerRoutes();

    // Serve static files
    await fastify.register(import("@fastify/static"), {
      root: path.join(__dirname, "views"),
      prefix: "/",
    });

    // Default route - redirect to login
    fastify.get("/", async (_request, reply) => {
      reply.redirect("/login.html");
    });

    // VIP management page route
    fastify.get("/vip", async (_request, reply) => {
      reply.sendFile("vip.html");
    });

    // Dashboard route
    fastify.get("/dashboard", async (_request, reply) => {
      reply.sendFile("dashboard.html");
    });

    // Lockers route
    fastify.get("/lockers", async (_request, reply) => {
      reply.sendFile("lockers.html");
    });

    // Configuration route
    fastify.get("/config", async (_request, reply) => {
      reply.sendFile("config.html");
    });

    // Health check endpoint
    fastify.get("/health", async () => {
      return {
        status: "ok",
        service: "eform-panel",
        timestamp: new Date().toISOString(),
        database: await dbManager.healthCheck(),
      };
    });

    // Start the server
    const port = parseInt(process.env.PANEL_PORT || "3002");
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`Panel server listening on port ${port}`);
  } catch (err) {
    console.error("Failed to start panel service:", err);
    process.exit(1);
  }
}

// Start the application
startPanelService().catch((err) => {
  console.error("Failed to start panel service:", err);
  process.exit(1);
});
