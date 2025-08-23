/**
 * RFID Handler for Eform Locker System
 * Supports both node-hid and HID keyboard input modes
 * Implements card scanning with debouncing and UID standardization
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
// @ts-ignore
import HID from 'node-hid';

export interface RfidConfig {
  reader_type: 'hid' | 'keyboard';
  debounce_ms: number;
  vendor_id?: number;
  product_id?: number;
  device_path?: string;
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
  private keyboardBuffer: number[] = [];

  constructor(config: RfidConfig) {
    super();
    this.config = config;
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
      // Convert buffer to string and extract card ID
      const cardData = this.parseHidData(data);
      if (cardData) {
        this.processCardScan(cardData);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle keyboard input data
   */
  private handleKeyboardData(data: string): void {
    try {
      // Accumulate keyboard input until we get a complete card ID
      this.cardBuffer += data;
      
      // Look for card termination (usually Enter key or specific pattern)
      if (data.includes('\r') || data.includes('\n')) {
        const cardId = this.cardBuffer.trim();
        this.cardBuffer = '';
        
        if (cardId.length > 0) {
          this.processCardScan(cardId);
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
    
    if (data.length < 4) {
      return null;
    }

    // Try to extract card ID from common HID formats
    let cardId = '';
    
    // Method 1: Direct hex conversion
    if (data.length >= 4) {
      const hex = data.toString('hex').toUpperCase();
      if (hex.length >= 8) {
        cardId = hex.substring(0, 8);
      }
    }

    // Method 2: Wiegand 26-bit format
    if (!cardId && data.length >= 4) {
      const value = data.readUInt32BE(0);
      if (value > 0) {
        cardId = value.toString(16).toUpperCase().padStart(8, '0');
      }
    }

    return cardId || null;
  }

  /**
   * Process a card scan with debouncing
   */
  private processCardScan(rawCardId: string): void {
    const now = Date.now();
    
    // Apply debouncing
    if (now - this.lastScanTime < this.config.debounce_ms) {
      return;
    }
    
    this.lastScanTime = now;
    
    // Standardize and hash the card ID
    const standardizedCardId = this.standardizeCardId(rawCardId);
    const hashedCardId = this.hashCardId(standardizedCardId);
    
    const scanEvent: RfidScanEvent = {
      card_id: hashedCardId,
      scan_time: new Date(),
      reader_id: this.getReaderId(),
      signal_strength: undefined // Could be extracted from some readers
    };
    
    this.emit('card_scanned', scanEvent);
  }

  /**
   * Standardize card ID format for consistent identification
   */
  private standardizeCardId(cardId: string): string {
    // Remove any non-alphanumeric characters
    let standardized = cardId.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    
    // Ensure minimum length (pad with zeros if needed)
    if (standardized.length < 8) {
      standardized = standardized.padStart(8, '0');
    }
    
    // Truncate to maximum reasonable length
    if (standardized.length > 16) {
      standardized = standardized.substring(0, 16);
    }
    
    return standardized;
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
