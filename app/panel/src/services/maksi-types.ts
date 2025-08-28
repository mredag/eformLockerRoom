/**
 * Maksisoft Integration Types
 * 
 * This file defines TypeScript types for the Maksisoft member management system integration.
 * The types are based on the exact API response format from Maksisoft's user search endpoint.
 * 
 * IMPORTANT: Always use criteria=0 for RFID searches in Maksisoft API calls.
 */

/**
 * Raw response format from Maksisoft API
 * This represents the exact structure returned by the Maksisoft user search endpoint
 */
export type MaksiHit = {
  /** Member ID in Maksisoft system */
  id: number;
  /** Full name of the member */
  name: string;
  /** Primary phone number */
  phone: string;
  /** Membership type (numeric code) */
  type: number;
  /** Gender (Bay/Bayan) */
  sex: string;
  /** GSM/mobile phone number */
  gsm: string;
  /** Profile photo filename */
  photo: string;
  /** Last check-in/check-out date and time */
  checkListDate: string;
  /** Last check status (in/out) */
  checkListStatus: string;
  /** Membership end date */
  endDate: string;
  /** RFID card number (proximity card) */
  proximity: string;
  /** Turkish ID number (masked for privacy) */
  tc: string;
};

/**
 * Simplified user object for display in the admin panel
 * This is the mapped format used throughout the application
 */
export type MaksiUser = {
  /** Member ID */
  id: number;
  /** Full name (null if empty) */
  fullName: string | null;
  /** Phone number (null if empty) */
  phone: string | null;
  /** RFID card number */
  rfid: string;
  /** Gender (null if not specified) */
  gender: string | null;
  /** Membership type (null if not specified) */
  membershipType: number | null;
  /** Membership end date (null if not specified) */
  membershipEndsAt: string | null;
  /** Last check-in/check-out timestamp (null if not specified) */
  lastCheckAt: string | null;
  /** Last check status (null if not specified) */
  lastCheckStatus: string | null;
  /** Masked Turkish ID (null if not specified) */
  tcMasked: string | null;
  /** Profile photo filename (null if not specified) */
  photoFile: string | null;
};

/**
 * API response format for successful searches
 */
export type MaksiSearchResponse = {
  success: true;
  hits: MaksiUser[];
  disabled?: boolean;
};

/**
 * API response format for failed searches
 */
export type MaksiErrorResponse = {
  success: false;
  error: string;
};

/**
 * Union type for all possible API responses
 */
export type MaksiApiResponse = MaksiSearchResponse | MaksiErrorResponse;

/**
 * Maps a raw Maksisoft API hit to our simplified user format
 * 
 * @param hit Raw MaksiHit from Maksisoft API
 * @returns Simplified MaksiUser object
 */
export function mapMaksi(hit: MaksiHit): MaksiUser {
  return {
    id: hit.id,
    fullName: hit.name?.trim() || null,
    phone: (hit.phone || hit.gsm || "").trim() || null,
    rfid: hit.proximity,
    gender: hit.sex || null,
    membershipType: Number.isFinite(hit.type) ? hit.type : null,
    membershipEndsAt: hit.endDate || null,
    lastCheckAt: hit.checkListDate || null,
    lastCheckStatus: hit.checkListStatus || null,
    tcMasked: hit.tc || null,
    photoFile: hit.photo || null,
  };
}

/**
 * Error codes that can be returned by the Maksisoft service
 */
export type MaksiErrorCode = 
  | 'network_error'
  | 'auth_error'
  | 'rate_limited'
  | 'invalid_response'
  | 'network_timeout'
  | 'unknown_error'
  | 'disabled'
  | 'missing_rfid';

/**
 * Configuration interface for Maksisoft service
 */
export interface MaksiConfig {
  /** Base URL for Maksisoft system */
  baseUrl: string;
  /** Search endpoint path */
  searchPath: string;
  /** Criteria value for RFID searches (always 0) */
  criteriaForRfid: string;
  /** Bootstrap session cookie */
  bootstrapCookie: string;
  /** Whether the integration is enabled */
  enabled: boolean;
}