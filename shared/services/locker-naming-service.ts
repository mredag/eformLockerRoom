import { DatabaseConnection } from '../database/connection';
import { LockerRepository } from '../database/locker-repository';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  suggestions?: string[];
}

export interface LockerNameAudit {
  id: number;
  kiosk_id: string;
  locker_id: number;
  old_name: string | null;
  new_name: string | null;
  changed_by: string;
  changed_at: Date;
}

export interface PrintableMap {
  kiosk_id: string;
  generated_at: Date;
  lockers: Array<{
    id: number;
    display_name: string;
    relay_number: number;
    position?: { row: number; col: number };
  }>;
}

/**
 * Service for managing locker display names with Turkish character support
 * Implements requirements 5.1, 5.3, 5.5, 5.10 from the locker UI improvements spec
 */
export class LockerNamingService {
  private db: DatabaseConnection;
  private lockerRepository: LockerRepository;

  // Turkish character validation regex - allows Turkish letters, numbers, spaces, and common punctuation
  private readonly TURKISH_CHAR_REGEX = /^[a-zA-ZçÇğĞıİöÖşŞüÜ0-9\s\-\.]+$/;
  private readonly MAX_NAME_LENGTH = 20;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.lockerRepository = new LockerRepository(db);
  }

  /**
   * Set display name for a locker with validation and audit logging
   * Requirement 5.1: Turkish letters and numbers with maximum 20 characters
   * Requirement 5.8: Keep audit note for tracking
   */
  async setDisplayName(
    kioskId: string, 
    lockerId: number, 
    name: string, 
    updatedBy: string
  ): Promise<void> {
    // Validate the name
    const validation = this.validateName(name);
    if (!validation.isValid) {
      throw new Error(`Invalid locker name: ${validation.errors.join(', ')}`);
    }

    // Check if name is unique within the kiosk (excluding current locker)
    const existingLocker = await this.findLockerByDisplayName(kioskId, name, lockerId);
    if (existingLocker) {
      throw new Error(`Display name "${name}" is already used by locker ${existingLocker.id} in this kiosk`);
    }

    // Get current locker to check version
    const currentLocker = await this.lockerRepository.findByKioskAndId(kioskId, lockerId);
    if (!currentLocker) {
      throw new Error(`Locker ${lockerId} not found in kiosk ${kioskId}`);
    }

    // Update the locker with new display name and audit info
    await this.lockerRepository.updateLocker(
      kioskId,
      lockerId,
      {
        display_name: name.trim(),
        name_updated_by: updatedBy
      },
      currentLocker.version
    );
  }

  /**
   * Get display name for a locker
   * Requirement 5.6: Returns custom name or fallback to "Dolap [relay_number]"
   */
  async getDisplayName(kioskId: string, lockerId: number): Promise<string> {
    const locker = await this.lockerRepository.findByKioskAndId(kioskId, lockerId);
    if (!locker) {
      throw new Error(`Locker ${lockerId} not found in kiosk ${kioskId}`);
    }

    // Return custom name if set, otherwise fallback to default format
    if (locker.display_name && locker.display_name.trim()) {
      return locker.display_name.trim();
    }

    return `Dolap ${lockerId}`;
  }

  /**
   * Validate locker name according to Turkish character requirements
   * Requirement 5.1: Turkish letters and numbers with maximum 20 characters
   * Requirement 5.3: Validation for Turkish character support
   */
  validateName(name: string): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    // Check if name is provided and is a string
    if (name === null || name === undefined || typeof name !== 'string') {
      errors.push('Name is required and must be a string');
      return { isValid: false, errors, suggestions };
    }

    const trimmedName = name.trim();

    // Check if name is empty after trimming (this covers both empty string and whitespace-only)
    if (trimmedName.length === 0) {
      errors.push('Name cannot be empty');
      return { isValid: false, errors, suggestions };
    }

    // Check length constraint
    if (trimmedName.length > this.MAX_NAME_LENGTH) {
      errors.push(`Name must be ${this.MAX_NAME_LENGTH} characters or less (current: ${trimmedName.length})`);
      suggestions.push(`Try shortening to: "${trimmedName.substring(0, this.MAX_NAME_LENGTH)}"`);
    }

    // Check Turkish character constraint
    if (!this.TURKISH_CHAR_REGEX.test(trimmedName)) {
      errors.push('Name contains invalid characters. Only Turkish letters, numbers, spaces, hyphens, and dots are allowed');
      
      // Suggest removing invalid characters
      const cleanedName = trimmedName.replace(/[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9\s\-\.]/g, '');
      if (cleanedName.length > 0 && cleanedName !== trimmedName) {
        suggestions.push(`Try: "${cleanedName}"`);
      }
    }

    // Check for excessive whitespace
    if (trimmedName.includes('  ')) {
      suggestions.push(`Remove extra spaces: "${trimmedName.replace(/\s+/g, ' ')}"`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }

  /**
   * Generate preset name suggestions with Turkish examples
   * Requirement 5.5: Generate presets with Turkish examples ("Kapı A1", "Dolap 101")
   */
  generatePresets(): string[] {
    return [
      'Kapı A1',
      'Kapı A2', 
      'Kapı B1',
      'Kapı B2',
      'Dolap 101',
      'Dolap 102',
      'Dolap 201',
      'Dolap 202',
      'Oda 1',
      'Oda 2',
      'Oda 3',
      'Büro A',
      'Büro B',
      'Depo 1',
      'Depo 2',
      'Giriş Sol',
      'Giriş Sağ',
      'Merkez 1',
      'Merkez 2',
      'Üst Kat',
      'Alt Kat',
      'Lobi',
      'Resepsiyon',
      'Güvenlik',
      'Acil Çıkış'
    ];
  }

  /**
   * Get audit history for locker name changes
   * Requirement 5.8: Audit logging for name changes
   */
  async getNameAuditHistory(kioskId: string, lockerId?: number): Promise<LockerNameAudit[]> {
    let sql = `
      SELECT id, kiosk_id, locker_id, old_name, new_name, changed_by, changed_at
      FROM locker_name_audit 
      WHERE kiosk_id = ?
    `;
    const params: any[] = [kioskId];

    if (lockerId !== undefined) {
      sql += ' AND locker_id = ?';
      params.push(lockerId);
    }

    sql += ' ORDER BY changed_at DESC';

    const rows = await this.db.all(sql, params);
    return rows.map((row: any) => ({
      id: row.id,
      kiosk_id: row.kiosk_id,
      locker_id: row.locker_id,
      old_name: row.old_name,
      new_name: row.new_name,
      changed_by: row.changed_by,
      changed_at: new Date(row.changed_at)
    }));
  }

  /**
   * Export printable map for installers
   * Requirement 5.9: Printable map generation for installers
   */
  async exportPrintableMap(kioskId: string): Promise<PrintableMap> {
    const lockers = await this.lockerRepository.findAll({ kiosk_id: kioskId });
    
    const mapData: PrintableMap = {
      kiosk_id: kioskId,
      generated_at: new Date(),
      lockers: lockers.map(locker => ({
        id: locker.id,
        display_name: locker.display_name?.trim() || `Dolap ${locker.id}`,
        relay_number: locker.id, // In this system, locker ID is the relay number
        position: this.calculateGridPosition(locker.id) // Optional grid positioning
      }))
    };

    return mapData;
  }

  /**
   * Bulk update locker names from a mapping
   * Useful for initial setup or mass updates
   */
  async bulkUpdateNames(
    kioskId: string, 
    nameMapping: Record<number, string>, 
    updatedBy: string
  ): Promise<{ success: number; failed: Array<{ lockerId: number; error: string }> }> {
    const results = { success: 0, failed: [] as Array<{ lockerId: number; error: string }> };

    for (const [lockerId, name] of Object.entries(nameMapping)) {
      try {
        await this.setDisplayName(kioskId, parseInt(lockerId), name, updatedBy);
        results.success++;
      } catch (error) {
        results.failed.push({
          lockerId: parseInt(lockerId),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Clear display name for a locker (revert to default)
   */
  async clearDisplayName(kioskId: string, lockerId: number, updatedBy: string): Promise<void> {
    const currentLocker = await this.lockerRepository.findByKioskAndId(kioskId, lockerId);
    if (!currentLocker) {
      throw new Error(`Locker ${lockerId} not found in kiosk ${kioskId}`);
    }

    await this.lockerRepository.updateLocker(
      kioskId,
      lockerId,
      {
        display_name: undefined,
        name_updated_by: updatedBy
      },
      currentLocker.version
    );
  }

  /**
   * Find locker by display name within a kiosk
   * Used for uniqueness validation
   */
  private async findLockerByDisplayName(
    kioskId: string, 
    displayName: string, 
    excludeLockerId?: number
  ): Promise<{ id: number } | null> {
    // Use case-insensitive comparison by normalizing both strings in JavaScript
    // This ensures proper handling of Turkish characters
    const normalizedSearchName = displayName.trim().toLowerCase();
    
    let sql = `
      SELECT id, display_name FROM lockers 
      WHERE kiosk_id = ? AND display_name IS NOT NULL
    `;
    const params: any[] = [kioskId];

    if (excludeLockerId !== undefined) {
      sql += ' AND id != ?';
      params.push(excludeLockerId);
    }

    const rows = await this.db.all(sql, params);
    
    // Find matching name using JavaScript comparison for proper Turkish character handling
    const matchingRow = rows.find((row: any) => 
      row.display_name && row.display_name.trim().toLowerCase() === normalizedSearchName
    );
    
    return matchingRow ? { id: (matchingRow as any).id } : null;
  }

  /**
   * Calculate grid position for locker (optional feature for map layout)
   * Assumes a standard grid layout - can be customized per installation
   */
  private calculateGridPosition(lockerId: number): { row: number; col: number } {
    // Standard 4-column grid layout
    const cols = 4;
    const row = Math.ceil(lockerId / cols);
    const col = ((lockerId - 1) % cols) + 1;
    
    return { row, col };
  }
}