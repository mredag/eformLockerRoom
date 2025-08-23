import { FastifyReply } from 'fastify';

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

export class CookieManager {
  private static readonly COOKIE_NAME = 'session';
  private static readonly DEFAULT_PATH = '/';
  
  /**
   * Set session cookie with comprehensive clearing of old cookies
   */
  static setSessionCookie(reply: FastifyReply, sessionId: string, options: CookieOptions = {}): void {
    // First, aggressively clear any existing session cookies
    this.clearAllSessionCookies(reply);
    
    // Set the new cookie with proper options
    const cookieOptions = {
      path: this.DEFAULT_PATH,
      httpOnly: true,
      sameSite: 'strict' as const,
      maxAge: 8 * 60 * 60, // 8 hours
      ...options
    };
    
    reply.setCookie(this.COOKIE_NAME, sessionId, cookieOptions);
    
    console.log(`🍪 Set session cookie: ${sessionId.substring(0, 16)}... with options:`, cookieOptions);
  }
  
  /**
   * Clear all possible session cookies to prevent conflicts
   */
  static clearAllSessionCookies(reply: FastifyReply): void {
    const pathVariations = ['/', '/auth', '/panel', ''];
    const domainVariations = [undefined, 'localhost', '192.168.1.8'];
    
    // Clear with all possible path and domain combinations
    pathVariations.forEach(path => {
      domainVariations.forEach(domain => {
        const clearOptions: any = {};
        if (path) clearOptions.path = path;
        if (domain) clearOptions.domain = domain;
        
        try {
          reply.clearCookie(this.COOKIE_NAME, clearOptions);
        } catch (error) {
          // Ignore errors - some combinations might not be valid
        }
      });
    });
    
    console.log('🗑️ Cleared all session cookie variations');
  }
  
  /**
   * Get session cookie value from request
   */
  static getSessionCookie(request: any): string | null {
    return request.cookies?.[this.COOKIE_NAME] || null;
  }
  
  /**
   * Check if secure cookies should be used
   */
  static shouldUseSecureCookies(): boolean {
    // Only use secure cookies when explicitly enabled for HTTPS
    return process.env.HTTPS_ENABLED === 'true';
  }
  
  /**
   * Generate cookie options based on environment
   */
  static getDefaultCookieOptions(): CookieOptions {
    return {
      path: this.DEFAULT_PATH,
      httpOnly: true,
      secure: this.shouldUseSecureCookies(),
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 // 8 hours
    };
  }
}