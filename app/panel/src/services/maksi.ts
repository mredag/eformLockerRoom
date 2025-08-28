/**
 * Maksisoft Integration Service
 * 
 * This service handles communication with the Maksisoft member management system.
 * It provides RFID-based member search functionality with proper error handling,
 * timeout management, and data mapping.
 * 
 * Key features:
 * - 10-second timeout with no retry logic
 * - Bootstrap cookie authentication
 * - Data mapping to exactly 6 display fields
 * - Proper error handling and logging
 */

import { mapMaksi, type MaksiHit, type MaksiUser, type MaksiConfig } from './maksi-types';

/**
 * Get Maksisoft configuration from environment variables
 */
function getMaksiConfig(): MaksiConfig {
  return {
    baseUrl: process.env.MAKSI_BASE || '',
    searchPath: process.env.MAKSI_SEARCH_PATH || '',
    criteriaForRfid: process.env.MAKSI_CRITERIA_FOR_RFID || '0',
    bootstrapCookie: process.env.MAKSI_BOOTSTRAP_COOKIE || '',
    enabled: process.env.MAKSI_ENABLED === 'true'
  };
}

/**
 * Search for member information by RFID card number
 * 
 * @param rfid RFID card number to search for
 * @returns Promise resolving to search results with mapped user data
 * @throws Error with specific error codes for different failure scenarios
 */
export async function searchMaksiByRFID(rfid: string): Promise<{ hits: MaksiUser[] }> {
  const config = getMaksiConfig();
  
  if (!config.enabled) {
    throw new Error('maksi_disabled');
  }

  if (!config.baseUrl || !config.searchPath) {
    throw new Error('maksi_not_configured');
  }

  // Build the search URL with RFID and criteria=0
  const searchUrl = `${config.baseUrl}${config.searchPath}?text=${encodeURIComponent(rfid)}&criteria=${config.criteriaForRfid}`;
  
  // Create abort controller for 10-second timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 10000);

  try {
    // Make the API request with bootstrap cookie
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'eForm-Locker-System/1.0',
        ...(config.bootstrapCookie ? { 'Cookie': config.bootstrapCookie } : {})
      },
      redirect: 'manual', // Don't follow redirects (might indicate auth issues)
      signal: abortController.signal
    });

    // Check for HTTP errors
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('upstream_401');
      }
      if (response.status >= 500) {
        throw new Error('network_error');
      }
      throw new Error(`upstream_${response.status}`);
    }

    // Verify content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('invalid_response');
    }

    // Parse JSON response
    const rawData = await response.json() as MaksiHit[];
    
    // Validate response format
    if (!Array.isArray(rawData)) {
      throw new Error('invalid_response');
    }

    // Map raw hits to simplified user objects
    const hits = rawData.map(mapMaksi);
    
    return { hits };

  } catch (error: any) {
    // Handle abort/timeout errors
    if (error.name === 'AbortError') {
      throw new Error('network_timeout');
    }
    
    // Handle Node.js fetch errors (TypeError: fetch failed)
    if (error.name === 'TypeError' && error.message === 'fetch failed') {
      throw new Error('network_error');
    }
    
    // Handle network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error('network_error');
    }
    
    // Re-throw known errors
    if (error.message && typeof error.message === 'string') {
      throw error;
    }
    
    // Unknown errors
    throw new Error('unknown_error');
    
  } finally {
    // Always clear the timeout
    clearTimeout(timeoutId);
  }
}

/**
 * Check if Maksisoft integration is enabled
 */
export function isMaksiEnabled(): boolean {
  return getMaksiConfig().enabled;
}

/**
 * Get Maksisoft configuration (for debugging/testing)
 * Note: This excludes sensitive data like cookies
 */
export function getMaksiStatus(): { enabled: boolean; configured: boolean } {
  const config = getMaksiConfig();
  return {
    enabled: config.enabled,
    configured: !!(config.baseUrl && config.searchPath)
  };
}