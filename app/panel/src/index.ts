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
        secure: false, // We'll set this per-cookie instead
        sameSite: "strict",
      },
    });

    await fastify.register(import("@fastify/csrf-protection"));

    // Add security headers middleware
    fastify.addHook("onRequest", securityMiddleware.createSecurityHook());

    // Enable authentication middleware
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

    // Default route - redirect based on setup status and auth
    fastify.get("/", async (request, reply) => {
      try {
        // Check if setup is needed (no admin users exist)
        const hasAdmins = await authService.hasAdminUsers();
        if (!hasAdmins) {
          reply.redirect("/setup");
          return;
        }

        // Setup is complete, check authentication
        const sessionToken = request.cookies.session;
        if (sessionToken) {
          const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
          const userAgent = request.headers['user-agent'] || 'unknown';
          const session = sessionManager.validateSession(sessionToken, ipAddress, userAgent);
          if (session) {
            reply.redirect("/dashboard.html");
            return;
          }
        }
        reply.redirect("/login.html");
      } catch (error) {
        fastify.log.error('Root route error:', error);
        reply.redirect("/login.html");
      }
    });

    // VIP management page route
    fastify.get("/vip", async (_request, reply) => {
      reply.sendFile("vip.html");
    });

    // Dashboard route
    fastify.get("/dashboard", async (request, reply) => {
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

    // Setup route for initial admin user creation (only if no admin users exist)
    fastify.get("/setup", async (request, reply) => {
      try {
        const hasAdmins = await authService.hasAdminUsers();
        if (hasAdmins) {
          // Admin users already exist, redirect to login
          reply.redirect("/login.html");
          return;
        }

        // No users exist, show setup page
        reply.type('text/html');
        return `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Eform Panel - Initial Setup</title>
            <style>
              body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
              .setup-container { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); width: 100%; max-width: 500px; }
              .setup-header { text-align: center; margin-bottom: 2rem; }
              .form-group { margin-bottom: 1.5rem; }
              .form-group label { display: block; margin-bottom: 0.5rem; color: #333; font-weight: 500; }
              .form-group input { width: 100%; padding: 0.75rem; border: 2px solid #e1e5e9; border-radius: 5px; font-size: 1rem; box-sizing: border-box; }
              .form-group input:focus { outline: none; border-color: #667eea; }
              .setup-button { width: 100%; padding: 0.75rem; background: #667eea; color: white; border: none; border-radius: 5px; font-size: 1rem; font-weight: 500; cursor: pointer; }
              .setup-button:hover { background: #5a6fd8; }
              .setup-button:disabled { background: #ccc; cursor: not-allowed; }
              .error-message { background: #fee; color: #c33; padding: 0.75rem; border-radius: 5px; margin-bottom: 1rem; border: 1px solid #fcc; }
              .success-message { background: #efe; color: #363; padding: 0.75rem; border-radius: 5px; margin-bottom: 1rem; border: 1px solid #cfc; }
            </style>
          </head>
          <body>
            <div class="setup-container">
              <div class="setup-header">
                <h1>🔐 Eform Panel Setup</h1>
                <p>Create the first administrator account</p>
              </div>

              <div id="error-message" class="error-message" style="display: none;"></div>
              <div id="success-message" class="success-message" style="display: none;"></div>

              <form id="setup-form">
                <div class="form-group">
                  <label for="username">Administrator Username</label>
                  <input type="text" id="username" name="username" required minlength="3">
                </div>
                <div class="form-group">
                  <label for="password">Password</label>
                  <input type="password" id="password" name="password" required minlength="8">
                </div>
                <div class="form-group">
                  <label for="confirm-password">Confirm Password</label>
                  <input type="password" id="confirm-password" name="confirmPassword" required minlength="8">
                </div>
                <button type="submit" class="setup-button" id="setup-button">Create Administrator</button>
              </form>
            </div>

            <script>
              const setupForm = document.getElementById('setup-form');
              const errorMessage = document.getElementById('error-message');
              const successMessage = document.getElementById('success-message');

              function showError(message) {
                errorMessage.textContent = message;
                errorMessage.style.display = 'block';
                successMessage.style.display = 'none';
              }

              function showSuccess(message) {
                successMessage.textContent = message;
                successMessage.style.display = 'block';
                errorMessage.style.display = 'none';
              }

              function hideMessages() {
                errorMessage.style.display = 'none';
                successMessage.style.display = 'none';
              }

              setupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideMessages();

                const formData = new FormData(setupForm);
                const password = formData.get('password');
                const confirmPassword = formData.get('confirmPassword');

                if (password !== confirmPassword) {
                  showError('Passwords do not match');
                  return;
                }

                const setupButton = document.getElementById('setup-button');
                setupButton.disabled = true;
                setupButton.textContent = 'Creating...';

                try {
                  const response = await fetch('/setup', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      username: formData.get('username'),
                      password: password
                    })
                  });

                  const data = await response.json();

                  if (response.ok && data.success) {
                    showSuccess('Administrator account created successfully! Redirecting to login...');
                    setTimeout(() => {
                      window.location.href = '/login.html';
                    }, 2000);
                  } else {
                    showError(data.error || 'Failed to create administrator account');
                  }
                } catch (error) {
                  showError('Network error. Please try again.');
                } finally {
                  setupButton.disabled = false;
                  setupButton.textContent = 'Create Administrator';
                }
              });
            </script>
          </body>
          </html>
        `;
      } catch (error) {
        fastify.log.error('Setup page error:', error);
        reply.code(500).send({ error: 'Internal server error' });
      }
    });

    // Setup POST endpoint for creating initial admin user
    fastify.post("/setup", {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 3 },
            password: { type: 'string', minLength: 8 }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const hasAdmins = await authService.hasAdminUsers();
        if (hasAdmins) {
          reply.code(403).send({ error: 'Setup already completed' });
          return;
        }

        const { username, password } = request.body as { username: string; password: string };
        
        const newUser = await authService.createUser({ 
          username, 
          password, 
          role: 'admin' 
        });

        reply.send({
          success: true,
          message: 'Administrator account created successfully'
        });
      } catch (error) {
        fastify.log.error('Setup error:', error);
        reply.code(500).send({ error: 'Failed to create administrator account' });
      }
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
