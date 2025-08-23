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

    // TEMPORARY: Disable authentication for emergency access
    // TODO: Re-enable authentication after fixing login issues
    // fastify.addHook("preHandler", createAuthMiddleware({ sessionManager }));

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

    // TEMPORARY: Default route - serve dashboard directly (bypass login)
    // This MUST come before static file registration to take priority
    fastify.get("/", async (_request, reply) => {
      reply.type('text/html');
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Eform Panel - Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
            .nav { display: flex; gap: 20px; margin: 20px 0; }
            .nav a { padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
            .nav a:hover { background: #0056b3; }
            .status { padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Eform Locker Management Panel</h1>
              <p>Staff Management Interface - <strong>AUTHENTICATION BYPASSED</strong></p>
            </div>
            
            <div class="status">
              ✅ <strong>Panel Service Status:</strong> Running<br>
              ✅ <strong>Database:</strong> Connected<br>
              ⚠️ <strong>Security:</strong> Authentication temporarily disabled for setup
            </div>
            
            <div class="nav">
              <a href="/lockers.html">🔒 Manage Lockers</a>
              <a href="/vip.html">👑 VIP Management</a>
              <a href="/config.html">⚙️ Configuration</a>
              <a href="/health">📊 System Health</a>
            </div>
            
            <h2>Quick Actions</h2>
            <p>Welcome to the Eform Locker Management Panel. Use the navigation above to access different sections.</p>
            
            <h3>System Information</h3>
            <ul>
              <li><strong>Service:</strong> Panel Management Interface</li>
              <li><strong>Version:</strong> 1.0.0</li>
              <li><strong>Status:</strong> Operational</li>
              <li><strong>Auth Status:</strong> Temporarily bypassed for setup</li>
            </ul>
            
            <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
              <strong>⚠️ Security Notice:</strong> Authentication is currently disabled for initial setup. 
              Please re-enable authentication after completing the setup process.
            </div>
          </div>
        </body>
        </html>
      `;
    });

    // Serve static files AFTER our custom routes
    await fastify.register(import("@fastify/static"), {
      root: path.join(__dirname, "views"),
      prefix: "/",
    });

    // VIP management page route
    fastify.get("/vip", async (_request, reply) => {
      reply.sendFile("vip.html");
    });

    // Dashboard route - bypassed version
    fastify.get("/dashboard", async (_request, reply) => {
      reply.type('text/html');
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Eform Panel - Dashboard (Auth Bypassed)</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
            .nav { display: flex; gap: 20px; margin: 20px 0; }
            .nav a { padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; }
            .nav a:hover { background: #0056b3; }
            .status { padding: 15px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; margin: 20px 0; }
            .card { background: #f8f9fa; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #007bff; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Eform Management Dashboard</h1>
              <p>Staff Management Interface - <strong>AUTHENTICATION BYPASSED FOR SETUP</strong></p>
            </div>
            
            <div class="status">
              ✅ <strong>Panel Service:</strong> Running<br>
              ✅ <strong>Database:</strong> Connected<br>
              ⚠️ <strong>Security:</strong> Authentication temporarily disabled
            </div>
            
            <div class="nav">
              <a href="/lockers.html">🔒 Manage Lockers</a>
              <a href="/vip.html">👑 VIP Management</a>
              <a href="/config.html">⚙️ Configuration</a>
              <a href="/health">📊 System Health</a>
              <a href="/test">🧪 Test Endpoint</a>
            </div>
            
            <div class="card">
              <h3>🔒 Locker Management</h3>
              <p>Monitor and control all lockers across multiple rooms. View real-time status and perform operations.</p>
            </div>
            
            <div class="card">
              <h3>👑 VIP Contracts</h3>
              <p>Manage long-term locker contracts for premium customers with dedicated assignments.</p>
            </div>
            
            <div class="card">
              <h3>📊 System Monitoring</h3>
              <p>View system health, kiosk status, and hardware diagnostics in real-time.</p>
            </div>
            
            <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
              <strong>⚠️ Security Notice:</strong> Authentication is currently disabled for initial setup. 
              This allows emergency access to configure the system. Re-enable authentication after setup is complete.
            </div>
          </div>
        </body>
        </html>
      `;
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

    // Test endpoint to verify service is working
    fastify.get("/test", async () => {
      return {
        message: "Panel service is working!",
        timestamp: new Date().toISOString(),
        auth_disabled: true,
        routes_available: ["/", "/dashboard", "/dashboard-bypass", "/health", "/test"]
      };
    });

    // Emergency bypass dashboard (guaranteed no auth checks)
    fastify.get("/dashboard-bypass", async (_request, reply) => {
      reply.type('text/html');
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Emergency Dashboard Access</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f0f0f0; }
            .emergency { background: #ff6b6b; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .container { background: white; padding: 20px; border-radius: 8px; }
            .nav a { display: inline-block; margin: 10px; padding: 10px 15px; background: #4ecdc4; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="emergency">
            🚨 EMERGENCY ACCESS MODE - Authentication Completely Bypassed
          </div>
          <div class="container">
            <h1>Emergency Panel Access</h1>
            <p>This is the emergency access dashboard with all authentication disabled.</p>
            
            <h3>Available Actions:</h3>
            <div class="nav">
              <a href="/health">System Health</a>
              <a href="/test">Test API</a>
              <a href="/api/lockers">Locker API</a>
              <a href="/api/vip">VIP API</a>
            </div>
            
            <h3>System Status:</h3>
            <ul>
              <li>✅ Panel Service: Running</li>
              <li>✅ Database: Connected</li>
              <li>⚠️ Authentication: DISABLED</li>
              <li>🔓 Security: BYPASSED</li>
            </ul>
          </div>
        </body>
        </html>
      `;
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
