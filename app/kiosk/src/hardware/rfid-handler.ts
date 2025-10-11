/**
 * RFID Handler for Eform Locker System
 * Supports both node-hid and HID keyboard input modes
 * Implements card scanning with debouncing and UID standardization
 */

import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
// @ts-ignore
import HID from 'node-hid';
import { kioskLogger } from '../lib/logger';

const DEFAULT_MIN_SIGNIFICANT_LENGTH = 8;
const DEFAULT_CONFIRMATION_WINDOW_MS = 1000;
const DEFAULT_HID_AGGREGATION_WINDOW_MS = 50;
const DEFAULT_KEYBOARD_TIMEOUT_MS = 1000;

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
const MIN_CARD_SIGNIFICANT_DIGITS = 6;

interface RfidFeatureFlags {
  hidMultiPacketEnabled: boolean;
  hidAggregationWindowMs: number;
  keyboardTimeoutEnabled: boolean;
  keyboardTimeoutMs: number;
  strictMinLengthEnabled: boolean;
  minSignificantLength: number;
  confirmationWindowMs: number;
}

interface RfidSecurityConfig {
  sharedSecret?: string;
  kioskId?: string;
  hmacHeader?: string;
}

export interface RfidConfig {
  reader_type: 'hid' | 'keyboard';
  debounce_ms: number;
  vendor_id?: number;
  product_id?: number;
  device_path?: string;
  kiosk_id?: string;
  operator_id?: string | null;
  feature_flags?: Partial<RfidFeatureFlags>;
  security?: RfidSecurityConfig;
}

export interface RfidScanEvent {
  card_id: string;
  scan_time: Date;
  reader_id: string;
  signal_strength?: number;
}

export class RfidHandler extends EventEmitter {
  private config: RfidConfig;
  private device: HID.HID | null = null;
  private lastScanTime: number = 0;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private cardBuffer: string = '';
  private activeKeyCodes: number[] = [];
  private hidAggregationTimer: NodeJS.Timeout | null = null;
  private hidReportBuffers: Buffer[] = [];
  private pendingShortUid: { value: string; expiresAt: number } | null = null;
  private keyboardFlushTimer: NodeJS.Timeout | null = null;
  private featureFlags: RfidFeatureFlags;
  private readonly securityConfig: RfidSecurityConfig;
  private currentDeviceInfo: {
    vendorId?: number;
    productId?: number;
    manufacturer?: string;
    product?: string;
    serialNumber?: string;
  } | null = null;

  constructor(config: RfidConfig) {
    super();
    this.config = config;
    this.featureFlags = {
      hidMultiPacketEnabled: config.feature_flags?.hidMultiPacketEnabled ?? false,
      hidAggregationWindowMs: config.feature_flags?.hidAggregationWindowMs ?? DEFAULT_HID_AGGREGATION_WINDOW_MS,
      keyboardTimeoutEnabled: config.feature_flags?.keyboardTimeoutEnabled ?? false,
      keyboardTimeoutMs: config.feature_flags?.keyboardTimeoutMs ?? DEFAULT_KEYBOARD_TIMEOUT_MS,
      strictMinLengthEnabled: config.feature_flags?.strictMinLengthEnabled ?? false,
      minSignificantLength: config.feature_flags?.minSignificantLength ?? DEFAULT_MIN_SIGNIFICANT_LENGTH,
      confirmationWindowMs: config.feature_flags?.confirmationWindowMs ?? DEFAULT_CONFIRMATION_WINDOW_MS,
    };
    this.securityConfig = {
      sharedSecret: config.security?.sharedSecret,
      kioskId: config.security?.kioskId,
      hmacHeader: config.security?.hmacHeader ?? 'X-Signature',
    };
  }

  updateFeatureFlags(flags: Partial<RfidFeatureFlags>): void {
    this.featureFlags = {
      ...this.featureFlags,
      ...flags
    };
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
    this.currentDeviceInfo = {
      vendorId: targetDevice.vendorId,
      productId: targetDevice.productId,
      manufacturer: targetDevice.manufacturer,
      product: targetDevice.product,
      serialNumber: targetDevice.serialNumber
    };
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
          this.processCardScan(keyboardResult.cardId, {
            rawBuffer: data,
            readerMode: 'hid-keyboard'
          });
        }
        return;
      }

      if (this.featureFlags.hidMultiPacketEnabled) {
        this.aggregateHidReport(data);
        return;
      }

      // Convert buffer to string and extract card ID
      const cardData = this.parseHidData(data);
      if (cardData) {
        this.processCardScan(cardData, {
          rawBuffer: data,
          readerMode: 'hid'
        });
      } else {
        this.emitScanFailure('parse_failed', data);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private aggregateHidReport(data: Buffer): void {
    this.hidReportBuffers.push(Buffer.from(data));

    if (this.hidAggregationTimer) {
      clearTimeout(this.hidAggregationTimer);
    }

    this.hidAggregationTimer = setTimeout(() => {
      const aggregated = Buffer.concat(this.hidReportBuffers);
      this.hidReportBuffers = [];
      this.hidAggregationTimer = null;

      const cardData = this.parseHidData(aggregated);
      if (cardData) {
        this.processCardScan(cardData, {
          rawBuffer: aggregated,
          readerMode: 'hid-multi-packet'
        });
      } else {
        this.emitScanFailure('parse_failed', aggregated);
      }
    }, this.featureFlags.hidAggregationWindowMs);
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

    for (const code of newPresses) {
      if (code === HID_ENTER_KEY_CODE) {
        enterPressed = true;
        continue;
      }

      const digit = HID_KEY_CODE_MAP[code];
      if (digit !== undefined) {
        this.cardBuffer += digit;
      }
    }

    this.activeKeyCodes = pressedCodes;

    if (enterPressed) {
      const completedCard = this.cardBuffer;
      this.cardBuffer = '';
      return { handled: true, cardId: completedCard };
    }

    return { handled: true, cardId: null };
  }

  /**
   * Handle keyboard input data
   */
  private handleKeyboardData(data: string): void {
    try {
      // Accumulate keyboard input until we get a complete card ID
      this.cardBuffer += data;

      if (this.featureFlags.keyboardTimeoutEnabled) {
        if (this.keyboardFlushTimer) {
          clearTimeout(this.keyboardFlushTimer);
        }
        this.keyboardFlushTimer = setTimeout(() => {
          if (this.cardBuffer.length > 0) {
            this.emitScanFailure('keyboard_timeout', Buffer.from(this.cardBuffer));
            this.cardBuffer = '';
          }
        }, this.featureFlags.keyboardTimeoutMs);
      }

      // Look for card termination (usually Enter key or specific pattern)
      if (data.includes('\r') || data.includes('\n')) {
        const cardId = this.cardBuffer.trim();
        this.cardBuffer = '';
        if (this.keyboardFlushTimer) {
          clearTimeout(this.keyboardFlushTimer);
          this.keyboardFlushTimer = null;
        }

        if (cardId.length > 0) {
          this.processCardScan(cardId, {
            rawString: cardId,
            readerMode: 'keyboard'
          });
        }
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Parse HID data to extract card ID
   */
  private parseHidData(data: Buffer): string | null {
    // This is a generic parser - specific readers may need custom parsing
    // Common formats: Wiegand 26-bit, 34-bit, or raw hex data
    
    if (data.length === 0) {
      return null;
    }

    const hex = data.toString('hex').toUpperCase();
    const trimmed = hex.replace(/(00)+$/g, '');
    if (trimmed.length > 0) {
      return trimmed;
    }

    return hex.length > 0 ? hex : null;
  }

  /**
   * Process a card scan with debouncing
   */
  private processCardScan(rawCardId: string, context?: { rawBuffer?: Buffer; rawString?: string; readerMode?: string }): void {
    const now = Date.now();

    if (now - this.lastScanTime < this.config.debounce_ms) {
      return;
    }

    const standardization = this.standardizeCardId(rawCardId);
    const standardizedCardId = standardization?.value ?? null;
    const significantLength = standardization?.significantLength ?? 0;
    const rawHex = standardization?.rawHex ?? rawCardId.toUpperCase();

    const requestId = randomUUID();
    const readerMode = context?.readerMode ?? this.config.reader_type;

    kioskLogger.info('RFID_SCAN_ATTEMPT', {
      kiosk_id: this.config.kiosk_id,
      operator_id: this.config.operator_id ?? null,
      reader_mode: readerMode,
      raw_uid_hex: rawHex,
      raw_uid_len: rawHex.length,
      significant_len: significantLength,
      vendor_id: this.currentDeviceInfo?.vendorId ?? this.config.vendor_id ?? null,
      product_id: this.currentDeviceInfo?.productId ?? this.config.product_id ?? null,
      firmware_str: this.currentDeviceInfo?.serialNumber ?? null,
      request_id: requestId,
      ts_iso: new Date(now).toISOString()
    });

    if (!standardizedCardId) {
      this.emitScanFailure('invalid_length', context?.rawBuffer ?? Buffer.from(rawCardId));
      return;
    }

    if (this.featureFlags.strictMinLengthEnabled && significantLength < this.featureFlags.minSignificantLength) {
      if (this.pendingShortUid && this.pendingShortUid.value === standardizedCardId && this.pendingShortUid.expiresAt > now) {
        this.pendingShortUid = null;
      } else {
        this.pendingShortUid = {
          value: standardizedCardId,
          expiresAt: now + this.featureFlags.confirmationWindowMs
        };
        this.emitScanFailure('short_uid_first_read', context?.rawBuffer ?? Buffer.from(rawCardId));
        return;
      }
    }

    this.lastScanTime = now;
    const hashedCardId = this.hashCardId(standardizedCardId);

    const scanEvent: RfidScanEvent = {
      card_id: hashedCardId,
      scan_time: new Date(),
      reader_id: this.getReaderId(),
      signal_strength: undefined
    };

    kioskLogger.info('RFID_SCAN_SUCCESS', {
      kiosk_id: this.config.kiosk_id,
      operator_id: this.config.operator_id ?? null,
      reader_mode: readerMode,
      raw_uid_hex: rawHex,
      raw_uid_len: rawHex.length,
      card_hash: hashedCardId,
      vendor_id: this.currentDeviceInfo?.vendorId ?? this.config.vendor_id ?? null,
      product_id: this.currentDeviceInfo?.productId ?? this.config.product_id ?? null,
      firmware_str: this.currentDeviceInfo?.serialNumber ?? null,
      request_id: requestId,
      ts_iso: new Date(now).toISOString()
    });

    this.emit('card_scanned', scanEvent);
  }

  private standardizeCardId(cardId: string): { value: string; significantLength: number; rawHex: string } | null {
    const rawHex = cardId.replace(/[^a-fA-F0-9]/g, '').toUpperCase();

    if (rawHex.length === 0) {
      return null;
    }

    const significantLength = rawHex.replace(/^0+/, '').length || (rawHex.includes('0') ? 1 : 0);

    if (significantLength < MIN_CARD_SIGNIFICANT_DIGITS) {
      return null;
    }

    let standardized = rawHex;

    if (standardized.length < 8) {
      standardized = standardized.padStart(8, '0');
    }

    if (standardized.length > 32) {
      standardized = standardized.substring(0, 32);
    }

    return {
      value: standardized,
      significantLength,
      rawHex
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

  private emitScanFailure(reason: string, rawData: Buffer): void {
    kioskLogger.warn('RFID_SCAN_FAIL', {
      kiosk_id: this.config.kiosk_id,
      operator_id: this.config.operator_id ?? null,
      reader_mode: this.config.reader_type,
      vendor_id: this.currentDeviceInfo?.vendorId ?? this.config.vendor_id ?? null,
      product_id: this.currentDeviceInfo?.productId ?? this.config.product_id ?? null,
      firmware_str: this.currentDeviceInfo?.serialNumber ?? null,
      raw_uid_hex: rawData.toString('hex').toUpperCase(),
      raw_uid_len: rawData.length,
      reason,
      ts_iso: new Date().toISOString()
    });
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
}
