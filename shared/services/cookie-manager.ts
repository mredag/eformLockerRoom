import type { FastifyReply, FastifyRequest } from 'fastify';

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
    const { domain, secure, sameSite } = this.getDefaultCookieOptions();
    const clearOptions: CookieOptions = {
      domain,
      secure,
      sameSite,
      httpOnly: true,
    };
    
    reply.clearCookie(this.COOKIE_NAME, { ...clearOptions, path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { ...clearOptions, path: '/auth' });
    
    const cookieOptions = {
      ...this.getDefaultCookieOptions(),
      ...options
    };
    
    reply.setCookie(this.COOKIE_NAME, sessionId, cookieOptions);
    
    console.log(
      '🍪 Set session cookie:',
      typeof sessionId === 'string' ? `${sessionId.substring(0, 16)}...` : sessionId,
      'with options:',
      cookieOptions
    );
  }
  
  /**
   * Clears all session cookies by expiring them on common application paths.
   * @param {FastifyReply} reply - The Fastify reply object.
   */
  static clearAllSessionCookies(reply: FastifyReply): void {
    const { domain, secure, sameSite } = this.getDefaultCookieOptions();
    const clearOptions: CookieOptions = {
      domain,
      secure,
      sameSite,
      httpOnly: true,
    };

    reply.clearCookie(this.COOKIE_NAME, { ...clearOptions, path: '/' });
    reply.clearCookie(this.COOKIE_NAME, { ...clearOptions, path: '/auth' });
    
    console.log('🗑️ Cleared session cookies');
  }
  
  /**
   * Retrieves the session ID from the request's cookies.
   * @param {FastifyRequest} request - The Fastify request object.
   * @returns {string | null} The session ID, or null if the cookie is not present.
   */
  static getSessionCookie(request: FastifyRequest): string | null {
    // safe access in case fastify-cookie isn't registered or types mismatch
    const cookies = (request as any).cookies ?? {};
    const val = cookies[this.COOKIE_NAME];
    return typeof val === 'string' && val.length > 0 ? val : null;
  }
  
  /**
   * Determines whether cookies should be marked as 'secure'.
   * Secure cookies are only sent over HTTPS connections.
   * @returns {boolean} True if the `HTTPS_ENABLED` environment variable is set to 'true'.
   */
  static shouldUseSecureCookies(): boolean {
    const envFlag = String(process.env.HTTPS_ENABLED ?? '').toLowerCase();
    if (envFlag === 'true') return true;
    if (String(process.env.NODE_ENV ?? '').toLowerCase() === 'production') return true;
    return false;
  }
  
  /**
   * Generates a default set of secure cookie options based on the current environment.
   * @returns {CookieOptions} The default cookie options.
   */
  static getDefaultCookieOptions(): CookieOptions {
    // use environment overrides where applicable
    const sameSiteEnv = String(process.env.COOKIE_SAMESITE ?? '').toLowerCase();
    const sameSite: CookieOptions['sameSite'] =
      sameSiteEnv === 'none' ? 'none' :
      sameSiteEnv === 'lax' ? 'lax' :
      'strict';

    const maxAgeEnv = Number(process.env.SESSION_MAX_AGE_SECONDS ?? NaN);
    const maxAge = Number.isFinite(maxAgeEnv) ? Math.max(0, Math.floor(maxAgeEnv)) : 8 * 60 * 60; // default 8 hours

    return {
      path: this.DEFAULT_PATH,
      httpOnly: true,
      secure: this.shouldUseSecureCookies(),
      sameSite,
      maxAge,
      domain: process.env.COOKIE_DOMAIN || undefined
    };
  }
}