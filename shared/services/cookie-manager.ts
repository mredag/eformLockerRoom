import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Defines the options for setting a cookie.
 * This interface is compatible with the options used by Fastify's `setCookie`.
 */
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

/**
 * A static utility class for managing session cookies in a standardized way across the application.
 * It provides methods for setting, clearing, and retrieving the session cookie,
 * and ensures that cookie options are consistent and secure.
 */
export class CookieManager {
  private static readonly COOKIE_NAME = 'session';
  private static readonly DEFAULT_PATH = '/';
  
  /**
   * Sets the session cookie on the client's browser.
   * This method first attempts to clear any existing session cookies on common paths
   * before setting the new one to prevent conflicts.
   * @param {FastifyReply} reply - The Fastify reply object, used to set the cookie.
   * @param {string} sessionId - The unique session identifier to be stored in the cookie.
   * @param {CookieOptions} [options={}] - Optional cookie settings to override the defaults.
   */
  static setSessionCookie(reply: FastifyReply, sessionId: string, options: CookieOptions = {}): void {
    reply.clearCookie(this.COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { path: '/auth' });
    reply.clearCookie(this.COOKIE_NAME);
    
    const cookieOptions = {
      ...this.getDefaultCookieOptions(),
      ...options
    };
    
    reply.setCookie(this.COOKIE_NAME, sessionId, cookieOptions);
    
    console.log(`🍪 Set session cookie: ${sessionId.substring(0, 16)}... with options:`, cookieOptions);
  }
  
  /**
   * Clears all session cookies by expiring them on common application paths.
   * @param {FastifyReply} reply - The Fastify reply object.
   */
  static clearAllSessionCookies(reply: FastifyReply): void {
    reply.clearCookie(this.COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { path: '/auth' });
    reply.clearCookie(this.COOKIE_NAME);
    
    console.log('🗑️ Cleared session cookies');
  }
  
  /**
   * Retrieves the session ID from the request's cookies.
   * @param {FastifyRequest} request - The Fastify request object.
   * @returns {string | null} The session ID, or null if the cookie is not present.
   */
  static getSessionCookie(request: FastifyRequest): string | null {
    return request.cookies?.[this.COOKIE_NAME] || null;
  }
  
  /**
   * Determines whether cookies should be marked as 'secure'.
   * Secure cookies are only sent over HTTPS connections.
   * @returns {boolean} True if the `HTTPS_ENABLED` environment variable is set to 'true'.
   */
  static shouldUseSecureCookies(): boolean {
    return process.env.HTTPS_ENABLED === 'true';
  }
  
  /**
   * Generates a default set of secure cookie options based on the current environment.
   * @returns {CookieOptions} The default cookie options.
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