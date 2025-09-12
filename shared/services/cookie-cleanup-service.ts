import { FastifyInstance } from 'fastify';

/**
 * A service to handle the cleanup of old or conflicting session cookies on the client-side.
 * This service works by injecting a small JavaScript snippet into HTML responses,
 * which checks for and removes duplicate session cookies, preventing potential authentication issues.
 */
export class CookieCleanupService {
  private static instance: CookieCleanupService;
  
  /**
   * Gets the singleton instance of the CookieCleanupService.
   * @returns {CookieCleanupService} The singleton instance.
   */
  static getInstance(): CookieCleanupService {
    if (!this.instance) {
      this.instance = new CookieCleanupService();
    }
    return this.instance;
  }
  
  /**
   * Starts the cookie cleanup service by registering hooks with the Fastify instance.
   * This method sets up a route to serve a cleanup script and injects the script
   * into all outgoing HTML pages.
   * @param {FastifyInstance} fastify - The Fastify server instance.
   */
  startCleanup(fastify: FastifyInstance): void {
    fastify.get('/internal/cleanup-cookies', async (request, reply) => {
      reply.type('text/javascript');
      return `
        // Automatic cookie cleanup script
        (function() {
          const cookies = document.cookie.split(';');
          let sessionCookies = [];
          
          cookies.forEach(cookie => {
            const trimmed = cookie.trim();
            if (trimmed.startsWith('session=')) {
              sessionCookies.push(trimmed);
            }
          });
          
          if (sessionCookies.length > 1) {
            console.log('🧹 Cleaning up', sessionCookies.length - 1, 'old session cookies');
            
            for (let i = 0; i < sessionCookies.length - 1; i++) {
              const cookieName = sessionCookies[i].split('=')[0];
              document.cookie = cookieName + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            }
          }
        })();
      `;
    });
    
    this.injectCleanupScript(fastify);
    
    console.log('🧹 Cookie cleanup service started');
  }
  
  /**
   * Injects the cookie cleanup script into outgoing HTML responses using a Fastify `onSend` hook.
   * @private
   * @param {FastifyInstance} fastify - The Fastify server instance.
   */
  private injectCleanupScript(fastify: FastifyInstance): void {
    fastify.addHook('onSend', async (request, reply, payload) => {
      const contentType = reply.getHeader('content-type');
      if (typeof contentType === 'string' && contentType.includes('text/html')) {
        if (typeof payload === 'string' && payload.includes('</body>')) {
          const cleanupScript = `
<script>
// Automatic cookie conflict prevention
(function() {
  const cookies = document.cookie.split(';');
  const sessionCookies = cookies.filter(c => c.trim().startsWith('session='));
  
  if (sessionCookies.length > 1) {
    console.log('🧹 Auto-cleaning', sessionCookies.length - 1, 'conflicting session cookies');
    
    sessionCookies.slice(0, -1).forEach(cookie => {
      const name = cookie.trim().split('=')[0];
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
    
    setTimeout(() => window.location.reload(), 100);
  }
})();
</script>
`;
          
          return payload.replace('</body>', cleanupScript + '</body>');
        }
      }
      
      return payload;
    });
  }
}