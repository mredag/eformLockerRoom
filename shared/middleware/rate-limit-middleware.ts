/**
 * Rate Limiting Middleware for Smart Locker Assignment
 * 
 * Provides middleware functions to integrate rate limiting with API endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { get_rate_limiter, RateLimitResult } from '../services/rate-limiter';

export interface RateLimitRequest extends FastifyRequest {
  body: any;
  params: any;
}

/**
 * Middleware to check card-based rate limits
 */
export async function check_card_rate_limit(
  request: RateLimitRequest,
  reply: FastifyReply
): Promise<void> {
  const card_id = request.body?.card_id || request.body?.cardId;
  const kiosk_id = request.body?.kiosk_id || request.body?.kioskId;
  
  if (!card_id) {
    reply.code(400).send({
      success: false,
      error: 'missing_card_id',
      message: 'Card ID is required for rate limiting.'
    });
    return;
  }

  const rate_limiter = get_rate_limiter();
  const result = await rate_limiter.check_card_rate(card_id, kiosk_id);

  if (!result.allowed) {
    reply.code(429).send({
      success: false,
      error: 'rate_limit_exceeded',
      type: result.type,
      key: result.key,
      message: result.message,
      retry_after_seconds: result.retry_after_seconds
    });
    return;
  }

  // Rate limit passed, continue to next handler
}

/**
 * Middleware to check locker-based rate limits
 */
export async function check_locker_rate_limit(
  request: RateLimitRequest,
  reply: FastifyReply
): Promise<void> {
  const locker_id = request.body?.locker_id || request.body?.lockerId || request.params?.lockerId;
  const kiosk_id = request.body?.kiosk_id || request.body?.kioskId;
  
  if (!locker_id) {
    reply.code(400).send({
      success: false,
      error: 'missing_locker_id',
      message: 'Locker ID is required for rate limiting.'
    });
    return;
  }

  const rate_limiter = get_rate_limiter();
  const result = await rate_limiter.check_locker_rate(parseInt(locker_id), kiosk_id);

  if (!result.allowed) {
    reply.code(429).send({
      success: false,
      error: 'rate_limit_exceeded',
      type: result.type,
      key: result.key,
      message: result.message,
      retry_after_seconds: result.retry_after_seconds
    });
    return;
  }

  // Rate limit passed, continue to next handler
}

/**
 * Middleware to check command cooldown
 */
export async function check_command_cooldown(
  request: RateLimitRequest,
  reply: FastifyReply
): Promise<void> {
  const kiosk_id = request.body?.kiosk_id || request.body?.kioskId;
  
  const rate_limiter = get_rate_limiter();
  const result = await rate_limiter.check_command_cooldown(kiosk_id);

  if (!result.allowed) {
    reply.code(429).send({
      success: false,
      error: 'rate_limit_exceeded',
      type: result.type,
      key: result.key,
      message: result.message,
      retry_after_seconds: result.retry_after_seconds
    });
    return;
  }

  // Rate limit passed, continue to next handler
}

/**
 * Middleware to check user report rate limits
 */
export async function check_user_report_rate_limit(
  request: RateLimitRequest,
  reply: FastifyReply
): Promise<void> {
  const card_id = request.body?.card_id || request.body?.cardId;
  const kiosk_id = request.body?.kiosk_id || request.body?.kioskId;
  
  if (!card_id) {
    reply.code(400).send({
      success: false,
      error: 'missing_card_id',
      message: 'Card ID is required for rate limiting.'
    });
    return;
  }

  const rate_limiter = get_rate_limiter();
  const result = await rate_limiter.check_user_report_rate(card_id, kiosk_id);

  if (!result.allowed) {
    reply.code(429).send({
      success: false,
      error: 'rate_limit_exceeded',
      type: result.type,
      key: result.key,
      message: result.message,
      retry_after_seconds: result.retry_after_seconds
    });
    return;
  }

  // Rate limit passed, continue to next handler
}

/**
 * Combined middleware for locker open operations
 * Checks card rate, locker rate, and command cooldown
 */
export async function check_locker_open_rate_limits(
  request: RateLimitRequest,
  reply: FastifyReply
): Promise<void> {
  const card_id = request.body?.card_id || request.body?.cardId;
  const locker_id = request.body?.locker_id || request.body?.lockerId || request.params?.lockerId;
  const kiosk_id = request.body?.kiosk_id || request.body?.kioskId;
  
  if (!card_id || !locker_id) {
    reply.code(400).send({
      success: false,
      error: 'missing_parameters',
      message: 'Card ID and Locker ID are required for rate limiting.'
    });
    return;
  }

  const rate_limiter = get_rate_limiter();
  const result = await rate_limiter.check_all_limits(card_id, parseInt(locker_id), kiosk_id);

  if (!result.allowed) {
    reply.code(429).send({
      success: false,
      error: 'rate_limit_exceeded',
      type: result.type,
      key: result.key,
      message: result.message,
      retry_after_seconds: result.retry_after_seconds
    });
    return;
  }

  // All rate limits passed, continue to next handler
}

/**
 * Helper function to record successful operations
 */
export async function record_successful_operation(
  card_id: string,
  locker_id: number,
  operation_type: 'open' | 'report' | 'command' = 'open',
  kiosk_id?: string
): Promise<void> {
  const rate_limiter = get_rate_limiter();
  
  switch (operation_type) {
    case 'open':
      await rate_limiter.record_successful_open(card_id, locker_id, kiosk_id);
      break;
    case 'report':
      rate_limiter.record_user_report(card_id);
      break;
    case 'command':
      rate_limiter.record_command();
      break;
  }
}

/**
 * Helper function to get rate limit status for monitoring
 */
export function get_rate_limit_status() {
  const rate_limiter = get_rate_limiter();
  return {
    recent_violations: rate_limiter.get_recent_violations(10),
    state: rate_limiter.get_state()
  };
}

/**
 * Cleanup function to remove old violations
 */
export function cleanup_rate_limits(): void {
  const rate_limiter = get_rate_limiter();
  rate_limiter.cleanup_violations();
}

/**
 * Error response helper for rate limit violations
 */
export function create_rate_limit_response(result: RateLimitResult) {
  return {
    success: false,
    error: 'rate_limit_exceeded',
    type: result.type,
    key: result.key,
    message: result.message,
    retry_after_seconds: result.retry_after_seconds,
    timestamp: new Date().toISOString()
  };
}

// Legacy compatibility functions (deprecated)
export const recordSuccessfulOperation = record_successful_operation;
export const getRateLimitStatus = get_rate_limit_status;
export const cleanupRateLimits = cleanup_rate_limits;
export const createRateLimitResponse = create_rate_limit_response;
export const checkCardRateLimit = check_card_rate_limit;
export const checkLockerRateLimit = check_locker_rate_limit;
export const checkCommandCooldown = check_command_cooldown;
export const checkUserReportRateLimit = check_user_report_rate_limit;
export const checkLockerOpenRateLimits = check_locker_open_rate_limits;