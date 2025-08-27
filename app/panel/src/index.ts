// Ensure EFORM_DB_PATH is set before any database imports
if (!process.env.EFORM_DB_PATH) {
  const path = require('path');
  // Resolve to project root from app/panel/src/
  const projectRoot = path.resolve(__dirname, '../../..');
  process.env.EFORM_DB_PATH = path.join(projectRoot, 'data', 'eform.db');
  console.log(`🔧 Panel: Set EFORM_DB_PATH to ${process.env.EFORM_DB_PATH}`);
}

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
import { CookieCleanupService } from "../../../shared/services/cookie-cleanup-service";
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
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for now, still detects extensions
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        reportUri: "/csp-report"
      },
      reportOnly: true // Enable report-only mode for extension interference detection
    });

    const i18nController = new I18nController(fastify);
    const configController = new ConfigController(fastify);

    // Helper function to determine secure cookie settings
    const shouldUseSecureCookies = () => {
      return process.env.NODE_ENV === 'production' && 
             process.env.HTTPS_ENABLED === 'true';
    };

    // Register plugins and middleware
    await fastify.register(import("@fastify/cookie"), {
      secret:
        process.env.COOKIE_SECRET ||
        "eform-panel-secret-key-change-in-production",
      parseOptions: {
        httpOnly: true,
        secure: shouldUseSecureCookies(), // Dynamic based on HTTPS availability
        sameSite: "lax", // Changed from "strict" for better LAN compatibility
        path: "/" // Ensure consistent path across all routes
      },
    });

    await fastify.register(import("@fastify/csrf-protection"), {
      cookieOpts: { signed: true },
      sessionPlugin: '@fastify/cookie',
      getToken: (request) => {
        // Skip CSRF validation for GET requests
        if (request.method === 'GET') {
          return false;
        }
        // For other methods, use default token extraction
        return request.headers['x-csrf-token'] || 
               (request.body && request.body._csrf) ||
               request.query._csrf;
      }
    });

    // Add security headers middleware
    fastify.addHook("onRequest", securityMiddleware.createSecurityHook());

    // CSP violation reporting endpoint
    fastify.post('/csp-report', {
      config: {
        rawBody: true
      }
    }, async (request, reply) => {
      try {
        // Parse CSP report from raw body
        let report;
        try {
          const bodyStr = request.body ? request.body.toString() : '{}';
          const parsed = JSON.parse(bodyStr);
          report = parsed['csp-report'] || parsed;
        } catch (parseError) {
          fastify.log.warn('Failed to parse CSP report:', parseError);
          return reply.code(400).send({ error: 'Invalid CSP report format' });
        }
        
        // Log CSP violation with structured data
        fastify.log.warn('CSP Violation Detected:', {
          blockedUri: report['blocked-uri'],
          violatedDirective: report['violated-directive'],
          sourceFile: report['source-file'],
          lineNumber: report['line-number'],
          columnNumber: report['column-number'],
          originalPolicy: report['original-policy'],
          userAgent: request.headers['user-agent'],
          timestamp: new Date().toISOString()
        });

        // Check if this looks like browser extension interference
        const blockedUri = report['blocked-uri'] || '';
        if (blockedUri.startsWith('chrome-extension://') || 
            blockedUri.startsWith('moz-extension://') || 
            blockedUri.startsWith('safari-extension://') ||
            blockedUri.includes('extension')) {
          
          fastify.log.warn('Browser Extension Interference Detected:', {
            extensionUri: blockedUri,
            directive: report['violated-directive'],
            recommendation: 'Consider disabling browser extensions on panel machines'
          });
        }

        reply.code(204).send();
      } catch (error) {
        fastify.log.error('CSP report processing error:', error);
        reply.code(400).send({ error: 'Invalid CSP report format' });
      }
    });

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

    // Register locker naming routes
    try {
      const { lockerNamingRoutes } = await import('./routes/locker-naming-routes');
      await fastify.register(lockerNamingRoutes, {
        prefix: "/api/locker-naming",
        dbManager,
      });
      console.log('✅ Locker naming routes registered successfully');
    } catch (error) {
      console.error('❌ Failed to register locker naming routes:', error);
    }

    // Register relay control routes
    try {
      const { registerRelayRoutes } = await import('./routes/relay-routes');
      await registerRelayRoutes(fastify);
      console.log('✅ Relay routes registered successfully');
    } catch (error) {
      console.error('❌ Failed to register relay routes:', error);
    }

    // Register performance monitoring routes - TEMPORARILY DISABLED
    // TODO: Fix database connection issue in PerformanceMonitor
    /*
    try {
      const { performanceRoutes } = await import('./routes/performance-routes');
      await fastify.register(performanceRoutes);
      console.log('✅ Performance monitoring routes registered successfully');
    } catch (error) {
      console.error('❌ Failed to register performance routes:', error);
    }
    */
    console.log('⚠️ Performance monitoring routes temporarily disabled - will fix database connection issue')

    // Proxy heartbeat requests to Gateway service
    fastify.register(async function (fastify) {
      // Proxy all heartbeat routes
      fastify.all('/api/heartbeat/*', async (request, reply) => {
        try {
          const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:3000';
          const path = request.url;
          
          const response = await fetch(`${gatewayUrl}${path}`, {
            method: request.method,
            headers: {
              'Content-Type': 'application/json',
              ...Object.fromEntries(
                Object.entries(request.headers).filter(([key]) => 
                  !['host', 'connection', 'content-length'].includes(key.toLowerCase())
                )
              )
            },
            body: request.method !== 'GET' && request.method !== 'HEAD' 
              ? JSON.stringify(request.body) 
              : undefined
          });
          
          const data = await response.json();
          reply.code(response.status).send(data);
        } catch (error) {
          fastify.log.error('Heartbeat proxy error:', error);
          reply.code(500).send({ 
            success: false, 
            error: 'Failed to connect to Gateway service' 
          });
        }
      });
    });

    // Register i18n routes
    await i18nController.registerRoutes();

    // Register configuration routes
    await configController.registerRoutes();

    // Initialize cookie cleanup service (temporarily disabled)
    // const cookieCleanupService = CookieCleanupService.getInstance();
    // cookieCleanupService.startCleanup(fastify);

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
          return reply.redirect("/setup");
        }

        // Setup is complete, check authentication
        const sessionToken = request.cookies.session;
        if (sessionToken) {
          const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
          const userAgent = request.headers['user-agent'] || 'unknown';
          const session = sessionManager.validateSession(sessionToken, ipAddress, userAgent);
          
          // Only redirect to dashboard if session is valid
          if (session) {
            return reply.redirect("/dashboard");
          }
        }
        
        // No valid session - show login
        return reply.redirect("/login.html");
      } catch (error) {
        fastify.log.error('Root route error:', error);
        return reply.redirect("/login.html");
      }
    });

    // VIP management page route
    fastify.get("/vip", async (_request, reply) => {
      return reply.sendFile("vip.html");
    });

    // Dashboard route
    fastify.get("/dashboard", async (request, reply) => {
      return reply.sendFile("dashboard.html");
    });

    // Lockers route
    fastify.get("/lockers", async (_request, reply) => {
      return reply.sendFile("lockers.html");
    });

    // Relay control route
    fastify.get("/relay", async (_request, reply) => {
      return reply.sendFile("relay.html");
    });

    // Locker naming route
    fastify.get("/locker-naming", async (_request, reply) => {
      return reply.sendFile("locker-naming.html");
    });

    // Configuration route
    fastify.get("/config", async (_request, reply) => {
      return reply.sendFile("config.html");
    });

    // CSP test route for extension interference detection
    fastify.get("/csp-test", async (_request, reply) => {
      return reply.sendFile("csp-test.html");
    });

    // Performance dashboard route
    fastify.get("/performance", async (_request, reply) => {
      return reply.sendFile("performance-dashboard.html");
    });

    
    // Clear cookies endpoint (fix browser conflicts)
    fastify.get("/clear-cookies", async (request, reply) => {
      // Clear session cookies with all possible paths
      reply.clearCookie('session', { path: '/' });
      reply.clearCookie('session', { path: '/auth' });
      reply.clearCookie('session');
      
      reply.type('text/html');
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>🍪 Cookie Cleaner - Eform Panel</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center;
            }
            .container { 
              background: white; padding: 3rem; border-radius: 15px; 
              box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; max-width: 500px; width: 90%;
            }
            .success { color: #28a745; font-size: 2rem; margin-bottom: 1rem; }
            .title { color: #333; font-size: 1.5rem; margin-bottom: 1rem; font-weight: 600; }
            .info { color: #6c757d; margin-bottom: 2rem; line-height: 1.6; }
            .button { 
              display: inline-block; padding: 12px 30px; background: #007bff; color: white; 
              text-decoration: none; border-radius: 8px; font-weight: 500; transition: all 0.3s;
              margin: 0 10px;
            }
            .button:hover { background: #0056b3; transform: translateY(-2px); }
            .button.secondary { background: #6c757d; }
            .button.secondary:hover { background: #545b62; }
            .steps { text-align: left; margin: 2rem 0; }
            .steps li { margin: 0.5rem 0; }
            .note { background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-top: 2rem; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅</div>
            <div class="title">Cookies Cleared Successfully!</div>
            <div class="info">
              All session cookies have been cleared from your browser. 
              This should fix any login issues caused by conflicting cookies.
            </div>
            
            <div class="steps">
              <strong>What happened:</strong>
              <ul>
                <li>🗑️ Removed old session cookies</li>
                <li>🧹 Cleared browser cache conflicts</li>
                <li>🔄 Reset authentication state</li>
              </ul>
            </div>
            
            <a href="/login.html" class="button">Go to Login</a>
            <a href="/debug-session" class="button secondary">Debug Tools</a>
            
            <div class="note">
              <strong>💡 Tip:</strong> If you continue having issues, try using incognito/private mode 
              or manually clear all cookies for this site in your browser settings.
            </div>
          </div>
          
          <script>
            // Additional JavaScript cookie clearing for extra safety
            console.log('🍪 Clearing cookies via JavaScript...');
            
            // Clear all cookies for this domain
            document.cookie.split(";").forEach(function(c) { 
              const cookie = c.replace(/^ +/, "");
              const eqPos = cookie.indexOf("=");
              const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
              
              // Clear with different path combinations
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/auth";
              document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
            });
            
            console.log('✅ JavaScript cookie clearing completed');
            
            // Show current cookies (should be empty)
            setTimeout(() => {
              const remainingCookies = document.cookie;
              console.log('🔍 Remaining cookies:', remainingCookies || 'None');
            }, 100);
          </script>
        </body>
        </html>
      `;
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
          return reply.redirect("/login.html");
        }

        // No users exist, show setup page
        reply.type('text/html');
        return `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Eform Panel - İlk Kurulum</title>
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
                <h1>🔐 Eform Panel Kurulumu</h1>
                <p>İlk yönetici hesabını oluşturun</p>
              </div>

              <div id="error-message" class="error-message" style="display: none;"></div>
              <div id="success-message" class="success-message" style="display: none;"></div>

              <form id="setup-form">
                <div class="form-group">
                  <label for="username">Yönetici Kullanıcı Adı</label>
                  <input type="text" id="username" name="username" required minlength="3" placeholder="Kullanıcı adı">
                </div>
                <div class="form-group">
                  <label for="password">Şifre</label>
                  <input type="password" id="password" name="password" required minlength="8" placeholder="Şifre">
                </div>
                <div class="form-group">
                  <label for="confirm-password">Şifre Onayı</label>
                  <input type="password" id="confirm-password" name="confirmPassword" required minlength="8" placeholder="Şifreyi tekrar girin">
                </div>
                <button type="submit" class="setup-button" id="setup-button">Yönetici Oluştur</button>
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
                  showError('Şifreler eşleşmiyor');
                  return;
                }

                const setupButton = document.getElementById('setup-button');
                setupButton.disabled = true;
                setupButton.textContent = 'Oluşturuluyor...';

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
                    showSuccess('Yönetici hesabı başarıyla oluşturuldu! Giriş sayfasına yönlendiriliyor...');
                    setTimeout(() => {
                      window.location.href = '/login.html';
                    }, 2000);
                  } else {
                    showError(data.error || 'Yönetici hesabı oluşturulamadı');
                  }
                } catch (error) {
                  showError('Ağ hatası. Lütfen tekrar deneyin.');
                } finally {
                  setupButton.disabled = false;
                  setupButton.textContent = 'Yönetici Oluştur';
                }
              });
            </script>
          </body>
          </html>
        `;
      } catch (error) {
        fastify.log.error('Setup page error:', error);
        return reply.code(500).send({ error: 'Internal server error' });
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
          return reply.code(403).send({ error: 'Setup already completed' });
        }

        const { username, password } = request.body as { username: string; password: string };
        
        const newUser = await authService.createUser({ 
          username, 
          password, 
          role: 'admin' 
        });

        return reply.send({
          success: true,
          message: 'Yönetici hesabı başarıyla oluşturuldu'
        });
      } catch (error) {
        fastify.log.error('Setup error:', error);
        return reply.code(500).send({ error: 'Failed to create administrator account' });
      }
    });

    // Start the server
    const port = parseInt(process.env.PANEL_PORT || "3001");
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`🎛️  Admin Panel: http://localhost:${port}`);
  } catch (err) {
    console.error("Failed to start panel service:", err);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

// Start the application
startPanelService().catch((err) => {
  console.error("Failed to start panel service:", err);
  process.exit(1);
});
