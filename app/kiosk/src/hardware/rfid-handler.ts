/**
 * RFID Handler for Eform Locker System
 * Supports both node-hid and HID keyboard input modes
 * Implements card scanning with debouncing and UID standardization
 */

import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
// @ts-ignore
import HID from 'node-hid';

const HID_KEY_CODE_MAP: Record<number, string> = {
  30: '1',
  31: '2',
  32: '3',
  33: '4',
  34: '5',
  35: '6',
  36: '7',
  37: '8',
  38: '9',
  39: '0'
};

const HID_ENTER_KEY_CODE = 40;
const LEGACY_MIN_CARD_SIGNIFICANT_DIGITS = 6;
const ENFORCED_MIN_CARD_SIGNIFICANT_DIGITS = 8;
const KEYBOARD_INACTIVITY_TIMEOUT_MS = 1000;
const HID_IDLE_FINALIZATION_MS = 75;
const CONFIRMATION_WINDOW_MS = 4000;
const MAX_STANDARDIZED_LENGTH = 64;

export interface RfidConfig {
  reader_type: 'hid' | 'keyboard';
  debounce_ms: number;
  vendor_id?: number;
  product_id?: number;
  device_path?: string;
  kiosk_id?: string;
  full_uid_enforcement?: boolean;
}

export interface RfidScanEvent {
  card_id: string;
  scan_time: Date;
  reader_id: string;
  signal_strength?: number;
  request_id?: string;
  raw_uid_hex?: string;
  standardized_uid_hex?: string;
}

export class RfidHandler extends EventEmitter {
  private config: RfidConfig;
  private device: HID.HID | null = null;
  private lastScanTime: number = 0;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private cardBuffer: string = '';
  private activeKeyCodes: number[] = [];
  private keyboardIdleTimer: NodeJS.Timeout | null = null;
  private hidReportBuffers: Buffer[] = [];
  private hidFinalizeTimer: NodeJS.Timeout | null = null;
  private shortScanState: { uid: string; expiresAt: number } | null = null;
  private confirmationState:
    | { uid: string; expiresAt: number; remainingReads: number }
    | null = null;

  constructor(config: RfidConfig) {
    super();
    this.config = config;
  }

  private isFullUidEnforcementEnabled(): boolean {
    return Boolean(this.config.full_uid_enforcement);
  }

  /**
   * Initialize the RFID reader connection
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.reader_type === 'hid') {
        await this.initializeHidReader();
      } else {
        await this.initializeKeyboardReader();
      }
      this.isConnected = true;
      this.emit('connected');
    } catch (error) {
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Initialize HID-based RFID reader
   */
  private async initializeHidReader(): Promise<void> {
    const devices = HID.devices();
    
    let targetDevice;
    if (this.config.vendor_id && this.config.product_id) {
      targetDevice = devices.find((d: any) => 
        d.vendorId === this.config.vendor_id && 
        d.productId === this.config.product_id
      );
    } else if (this.config.device_path) {
      targetDevice = devices.find((d: any) => d.path === this.config.device_path);
    } else {
      // Auto-detect common RFID reader patterns
      targetDevice = devices.find((d: any) => 
        d.product?.toLowerCase().includes('rfid') ||
        d.manufacturer?.toLowerCase().includes('rfid') ||
        (d.vendorId === 0x08ff) || // AuthenTec/Upek readers
        (d.vendorId === 0x0483)    // STMicroelectronics readers
      );
    }

    if (!targetDevice) {
      throw new Error('RFID reader not found');
    }

    this.device = new HID.HID(targetDevice.path!);
    this.device.on('data', this.handleHidData.bind(this));
    this.device.on('error', this.handleDeviceError.bind(this));
  }

  /**
   * Initialize keyboard-mode RFID reader
   */
  private async initializeKeyboardReader(): Promise<void> {
    // For keyboard mode, we'll listen to stdin for card data
    // This is a simplified implementation - in production, you might use
    // a more sophisticated keyboard hook library
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this.handleKeyboardData.bind(this));
  }

  /**
   * Handle data from HID device
   */
  private handleHidData(data: Buffer): void {
    try {
      const keyboardResult = this.handleHidKeyboardReport(data);
      if (keyboardResult.handled) {
        if (keyboardResult.cardId) {
          this.processCardScan({
            rawData: keyboardResult.cardId,
            source: 'keyboard'
          });
        }
        return;
      }

      this.enqueueHidReport(data);
    } catch (error) {
      this.emit('error', error);
    }
  }

  private handleHidKeyboardReport(
    data: Buffer
  ): { handled: boolean; cardId: string | null } {
    if (data.length < 3) {
      return { handled: false, cardId: null };
    }

    const keyCodes = Array.from(data.slice(2));
    const pressedCodes = keyCodes.filter(code => code !== 0);

    if (pressedCodes.length === 0) {
      this.activeKeyCodes = [];
      return { handled: this.cardBuffer.length > 0, cardId: null };
    }

    const hasRecognizedCodes = pressedCodes.some(
      code => code === HID_ENTER_KEY_CODE || HID_KEY_CODE_MAP[code] !== undefined
    );

    if (!hasRecognizedCodes) {
      return { handled: false, cardId: null };
    }

    const newPresses = pressedCodes.filter(
      code => !this.activeKeyCodes.includes(code)
    );

    let enterPressed = false;
    let appendedDigit = false;

    for (const code of newPresses) {
      if (code === HID_ENTER_KEY_CODE) {
        enterPressed = true;
        continue;
      }

      const digit = HID_KEY_CODE_MAP[code];
      if (digit !== undefined) {
        this.cardBuffer += digit;
        appendedDigit = true;
      }
    }

    if (appendedDigit) {
      this.scheduleKeyboardTimeout('hid-keyboard');
    }

    this.activeKeyCodes = pressedCodes;

    if (enterPressed) {
      const completedCard = this.cardBuffer;
      this.cardBuffer = '';
      this.clearKeyboardTimeout();
      return { handled: true, cardId: completedCard };
    }

    return { handled: true, cardId: null };
  }

  private enqueueHidReport(data: Buffer): void {
    this.hidReportBuffers.push(Buffer.from(data));

    if (this.hidFinalizeTimer) {
      clearTimeout(this.hidFinalizeTimer);
    }

    this.hidFinalizeTimer = setTimeout(() => {
      this.hidFinalizeTimer = null;
      this.finalizeHidAssembly();
    }, HID_IDLE_FINALIZATION_MS);
  }

  private finalizeHidAssembly(): void {
    if (this.hidReportBuffers.length === 0) {
      return;
    }

    const combined = Buffer.concat(this.hidReportBuffers);
    this.hidReportBuffers = [];

    const rawHex = combined.toString('hex').toUpperCase();
    if (rawHex.length === 0) {
      return;
    }

    this.processCardScan({
      rawData: rawHex,
      rawBuffer: combined,
      source: 'hid'
    });
  }

  /**
   * Handle keyboard input data
   */
  private handleKeyboardData(data: string): void {
    try {
      if (!data) {
        return;
      }

      // Accumulate keyboard input until we get a complete card ID
      this.cardBuffer += data;
      this.scheduleKeyboardTimeout('keyboard');

      // Look for card termination (usually Enter key or specific pattern)
      if (data.includes('\r') || data.includes('\n')) {
        const cardId = this.cardBuffer.replace(/[\r\n]/g, '').trim();
        this.cardBuffer = '';
        this.clearKeyboardTimeout();

        if (cardId.length > 0) {
          this.processCardScan({
            rawData: cardId,
            source: 'keyboard'
          });
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private scheduleKeyboardTimeout(source: 'keyboard' | 'hid-keyboard'): void {
    if (this.keyboardIdleTimer) {
      clearTimeout(this.keyboardIdleTimer);
    }

    this.keyboardIdleTimer = setTimeout(() => {
      const buffered = this.cardBuffer.replace(/[\r\n]/g, '');
      this.cardBuffer = '';
      this.keyboardIdleTimer = null;

      if (buffered.length === 0) {
        return;
      }

      this.logScanFailure('KEYBOARD_TIMEOUT', {
        rawData: buffered,
        source: source === 'hid-keyboard' ? 'hid' : 'keyboard'
      });
    }, KEYBOARD_INACTIVITY_TIMEOUT_MS);
  }

  private clearKeyboardTimeout(): void {
    if (this.keyboardIdleTimer) {
      clearTimeout(this.keyboardIdleTimer);
      this.keyboardIdleTimer = null;
    }
  }

  /**
   * Process a card scan with debouncing and validation
   */
  private processCardScan(scan: { rawData: string; source: 'hid' | 'keyboard'; rawBuffer?: Buffer }): void {
    const now = Date.now();

    if (now - this.lastScanTime < this.config.debounce_ms) {
      return;
    }

    const requestId = randomUUID();
    const { rawHex, rawBytes } = this.prepareRawHex(scan.rawData, scan.rawBuffer);

    if (rawHex.length === 0) {
      this.logScanFailure('EMPTY_UID', {
        rawHex,
        rawBytes,
        source: scan.source,
        requestId
      });
      return;
    }

    const standardization = this.standardizeCardId(rawHex);
    if (!standardization) {
      this.logScanFailure('INVALID_UID', {
        rawHex,
        rawBytes,
        source: scan.source,
        requestId
      });
      return;
    }

    const minDigits = this.isFullUidEnforcementEnabled()
      ? ENFORCED_MIN_CARD_SIGNIFICANT_DIGITS
      : LEGACY_MIN_CARD_SIGNIFICANT_DIGITS;

    const enforcementEnabled = this.isFullUidEnforcementEnabled();
    const isShortUid = standardization.significantLength < minDigits;

    if (isShortUid) {
      if (enforcementEnabled) {
        const existingShort = this.shortScanState;
        if (
          !existingShort ||
          existingShort.expiresAt < now ||
          existingShort.uid !== standardization.standardized
        ) {
          this.shortScanState = {
            uid: standardization.standardized,
            expiresAt: now + CONFIRMATION_WINDOW_MS
          };
          this.confirmationState = {
            uid: standardization.standardized,
            expiresAt: now + CONFIRMATION_WINDOW_MS,
            remainingReads: 1
          };
          this.logScanFailure('SHORT_UID', {
            rawHex,
            rawBytes,
            standardizedHex: standardization.standardized,
            standardizedBytes: standardization.standardized.length / 2,
            source: scan.source,
            requestId,
            confirmationRemainingReads: 1
          });
          return;
        }
      } else {
        this.logScanFailure('SHORT_UID_LEGACY', {
          rawHex,
          rawBytes,
          source: scan.source,
          requestId
        });
        return;
      }
    }

    if (enforcementEnabled) {
      if (this.shortScanState && this.shortScanState.expiresAt >= now) {
        if (!this.confirmationState || this.confirmationState.expiresAt < now) {
          this.confirmationState = {
            uid: standardization.standardized,
            expiresAt: now + CONFIRMATION_WINDOW_MS,
            remainingReads: 1
          };
          this.shortScanState.expiresAt = now + CONFIRMATION_WINDOW_MS;
          this.logScanFailure('CONFIRMATION_REQUIRED', {
            rawHex,
            rawBytes,
            standardizedHex: standardization.standardized,
            standardizedBytes: standardization.standardized.length / 2,
            source: scan.source,
            requestId,
            confirmationRemainingReads: 1
          });
          return;
        }

        if (this.confirmationState.uid !== standardization.standardized) {
          this.confirmationState = {
            uid: standardization.standardized,
            expiresAt: now + CONFIRMATION_WINDOW_MS,
            remainingReads: 1
          };
          this.shortScanState.expiresAt = now + CONFIRMATION_WINDOW_MS;
          this.logScanFailure('CONFIRMATION_MISMATCH', {
            rawHex,
            rawBytes,
            standardizedHex: standardization.standardized,
            standardizedBytes: standardization.standardized.length / 2,
            source: scan.source,
            requestId,
            confirmationRemainingReads: 1
          });
          return;
        }

        if (this.confirmationState.remainingReads > 0) {
          this.confirmationState.remainingReads -= 1;
          if (this.confirmationState.remainingReads > 0) {
            this.confirmationState.expiresAt = now + CONFIRMATION_WINDOW_MS;
            this.shortScanState.expiresAt = now + CONFIRMATION_WINDOW_MS;
            this.logScanFailure('CONFIRMATION_REQUIRED', {
              rawHex,
              rawBytes,
              standardizedHex: standardization.standardized,
              standardizedBytes: standardization.standardized.length / 2,
              source: scan.source,
              requestId,
              confirmationRemainingReads: this.confirmationState.remainingReads
            });
            return;
          }
        }

        this.shortScanState = null;
        this.confirmationState = null;
      } else {
        this.shortScanState = null;
        this.confirmationState = null;
      }
    }

    this.lastScanTime = now;
    const hashedCardId = this.hashCardId(standardization.standardized);

    this.logScanSuccess({
      requestId,
      rawHex,
      rawBytes,
      standardizedHex: standardization.standardized,
      standardizedBytes: standardization.standardized.length / 2,
      hashedCardId,
      source: scan.source
    });

    const scanEvent: RfidScanEvent = {
      card_id: hashedCardId,
      scan_time: new Date(),
      reader_id: this.getReaderId(),
      signal_strength: undefined,
      request_id: requestId,
      raw_uid_hex: rawHex,
      standardized_uid_hex: standardization.standardized
    };

    this.emit('card_scanned', scanEvent);
  }

  /**
   * Standardize card ID format for consistent identification
   */
  private standardizeCardId(rawHex: string): { standardized: string; significantLength: number } | null {
    let standardized = rawHex.replace(/[^a-fA-F0-9]/g, '').toUpperCase();

    if (standardized.length === 0) {
      return null;
    }

    if (standardized.length % 2 !== 0) {
      standardized = `0${standardized}`;
    }

    if (standardized.length > MAX_STANDARDIZED_LENGTH) {
      standardized = standardized.substring(0, MAX_STANDARDIZED_LENGTH);
    }

    const significantLength = standardized.replace(/^0+/, '').length;

    return {
      standardized,
      significantLength
    };
  }

  /**
   * Hash card ID for consistent storage and privacy
   */
  private hashCardId(cardId: string): string {
    // Use SHA-256 hash for consistent card identification
    // This ensures privacy while maintaining uniqueness
    const hash = createHash('sha256');
    hash.update(cardId);
    return hash.digest('hex').substring(0, 16); // Use first 16 chars for storage efficiency
  }

  private prepareRawHex(rawData: string, rawBuffer?: Buffer): { rawHex: string; rawBytes: number } {
    if (rawBuffer) {
      return {
        rawHex: rawBuffer.toString('hex').toUpperCase(),
        rawBytes: rawBuffer.length
      };
    }

    const rawHex = rawData.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    return {
      rawHex,
      rawBytes: Math.ceil(rawHex.length / 2)
    };
  }

  private logScanSuccess(context: {
    requestId: string;
    rawHex: string;
    rawBytes: number;
    standardizedHex: string;
    standardizedBytes: number;
    hashedCardId: string;
    source: 'hid' | 'keyboard';
  }): void {
    console.info('RFID_SCAN', {
      request_id: context.requestId,
      raw_uid_hex: context.rawHex,
      raw_uid_len_bytes: context.rawBytes,
      standardized_uid_hex: context.standardizedHex,
      standardized_uid_len_bytes: context.standardizedBytes,
      owner_key: context.hashedCardId,
      reader_mode: this.config.reader_type,
      reader_source: context.source,
      vendor_id: this.config.vendor_id ?? null,
      product_id: this.config.product_id ?? null,
      kiosk_id: this.config.kiosk_id ?? 'unknown',
      timestamp: new Date().toISOString()
    });
  }

  private logScanFailure(reason: string, context: {
    rawHex?: string;
    rawBytes?: number;
    rawData?: string;
    standardizedHex?: string;
    standardizedBytes?: number;
    source: 'hid' | 'keyboard';
    requestId?: string;
    confirmationRemainingReads?: number;
  }): void {
    const requestId = context.requestId ?? randomUUID();

    let rawHex = context.rawHex;
    let rawBytes = context.rawBytes;

    if (!rawHex && context.rawData !== undefined) {
      const prepared = this.prepareRawHex(context.rawData);
      rawHex = prepared.rawHex;
      rawBytes = prepared.rawBytes;
    }

    const logPayload: Record<string, unknown> = {
      request_id: requestId,
      reason,
      raw_uid_hex: rawHex ?? '',
      raw_uid_len_bytes: rawBytes ?? 0,
      standardized_uid_hex: context.standardizedHex,
      standardized_uid_len_bytes: context.standardizedBytes,
      reader_mode: this.config.reader_type,
      reader_source: context.source,
      vendor_id: this.config.vendor_id ?? null,
      product_id: this.config.product_id ?? null,
      kiosk_id: this.config.kiosk_id ?? 'unknown',
      timestamp: new Date().toISOString()
    };

    if (context.confirmationRemainingReads !== undefined) {
      logPayload.confirmation_remaining_reads = context.confirmationRemainingReads;
    }

    console.warn('RFID_SCAN_FAIL', logPayload);
  }

  /**
   * Get reader identifier
   */
  private getReaderId(): string {
    if (this.device && this.config.reader_type === 'hid') {
      // Try to get device serial number or path
      return this.config.device_path || 'hid-reader';
    }
    return 'keyboard-reader';
  }

  /**
   * Handle device errors
   */
  private handleDeviceError(error: Error): void {
    this.isConnected = false;
    this.emit('error', error);
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      this.initialize().catch(() => {
        // Retry again if initialization fails
        this.scheduleReconnect();
      });
    }, 5000); // Retry every 5 seconds
  }

  /**
   * Check if reader is connected
   */
  isReaderConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get reader status information
   */
  getStatus(): {
    connected: boolean;
    reader_type: string;
    last_scan: number;
    device_info?: any;
  } {
    return {
      connected: this.isConnected,
      reader_type: this.config.reader_type,
      last_scan: this.lastScanTime,
      device_info: this.device ? {
        path: this.config.device_path,
        vendor_id: this.config.vendor_id,
        product_id: this.config.product_id
      } : undefined
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.hidFinalizeTimer) {
      clearTimeout(this.hidFinalizeTimer);
      this.hidFinalizeTimer = null;
    }

    if (this.keyboardIdleTimer) {
      clearTimeout(this.keyboardIdleTimer);
      this.keyboardIdleTimer = null;
    }

    this.hidReportBuffers = [];
    this.cardBuffer = '';

    if (this.device) {
      try {
        this.device.close();
      } catch (error) {
        // Ignore close errors
      }
      this.device = null;
    }

    if (this.config.reader_type === 'keyboard') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    this.isConnected = false;
    this.emit('disconnected');
  }

  setFullUidEnforcement(enabled: boolean): void {
    this.config.full_uid_enforcement = enabled;
  }
}
