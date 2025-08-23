import { FastifyInstance } from 'fastify';

export class CookieCleanupService {
  private static instance: CookieCleanupService;
  
  static getInstance(): CookieCleanupService {
    if (!this.instance) {
      this.instance = new CookieCleanupService();
    }
    return this.instance;
  }
  
  /**
   * Start automatic cookie cleanup
   */
  startCleanup(fastify: FastifyInstance): void {
    // Add cleanup route that's called periodically
    fastify.get('/internal/cleanup-cookies', async (request, reply) => {
      // This endpoint helps browsers clean up old cookies
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
          
          // If multiple session cookies, keep only the last one
          if (sessionCookies.length > 1) {
            console.log('🧹 Cleaning up', sessionCookies.length - 1, 'old session cookies');
            
            // Clear all but the last session cookie
            for (let i = 0; i < sessionCookies.length - 1; i++) {
              const cookieName = sessionCookies[i].split('=')[0];
              document.cookie = cookieName + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            }
          }
        })();
      `;
    });
    
    // Add to all HTML pages
    this.injectCleanupScript(fastify);
    
    console.log('🧹 Cookie cleanup service started');
  }
  
  /**
   * Inject cleanup script into HTML responses
   */
  private injectCleanupScript(fastify: FastifyInstance): void {
    fastify.addHook('onSend', async (request, reply, payload) => {
      // Only inject into HTML responses
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
    
    // Keep only the most recent session cookie
    sessionCookies.slice(0, -1).forEach(cookie => {
      const name = cookie.trim().split('=')[0];
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
    
    // Reload page to use clean cookies
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