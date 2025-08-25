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
   * Set session cookie with simple clearing of old cookies
   */
  static setSessionCookie(reply: any, sessionId: string, options: CookieOptions = {}): void {
    // Simple clearing - just the main variations
    reply.clearCookie(this.COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { path: '/auth' });
    reply.clearCookie(this.COOKIE_NAME); // Default path
    
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
   * Clear session cookies (simplified)
   */
  static clearAllSessionCookies(reply: any): void {
    // Simple clearing without aggressive domain/path combinations
    reply.clearCookie(this.COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { path: '/auth' });
    reply.clearCookie(this.COOKIE_NAME); // Default path
    
    console.log('🗑️ Cleared session cookies');
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