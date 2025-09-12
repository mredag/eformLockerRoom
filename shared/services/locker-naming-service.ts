import { DatabaseConnection } from '../database/connection';
import { LockerRepository } from '../database/locker-repository';

/**
 * Represents the result of a name validation check.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  suggestions?: string[];
}

/**
 * Represents a single entry in the locker name audit trail.
 */
export interface LockerNameAudit {
  id: number;
  kiosk_id: string;
  locker_id: number;
  old_name: string | null;
  new_name: string | null;
  changed_by: string;
  changed_at: Date;
}

/**
 * Represents the data structure for a printable map of lockers for installers.
 */
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
 * A service for managing the display names of lockers.
 * It handles setting, retrieving, validating, and auditing custom locker names,
 * with special considerations for Turkish character support and name uniqueness.
 */
export class LockerNamingService {
  private db: DatabaseConnection;
  private lockerRepository: LockerRepository;

  private readonly TURKISH_CHAR_REGEX = /^[a-zA-ZçÇğĞıİöÖşŞüÜ0-9\s\-\.]+$/;
  private readonly MAX_NAME_LENGTH = 20;

  /**
   * Creates an instance of LockerNamingService.
   * @param {DatabaseConnection} db - The database connection instance.
   */
  constructor(db: DatabaseConnection) {
    this.db = db;
    this.lockerRepository = new LockerRepository(db);
  }

  /**
   * Sets the display name for a specific locker after validating it.
   * This operation is audited.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} name - The new display name for the locker.
   * @param {string} updatedBy - The identifier of the user or system making the change.
   * @throws {Error} If the name is invalid or already in use.
   */
  async setDisplayName(
    kioskId: string, 
    lockerId: number, 
    name: string, 
    updatedBy: string
  ): Promise<void> {
    const validation = this.validateName(name);
    if (!validation.isValid) {
      throw new Error(`Invalid locker name: ${validation.errors.join(', ')}`);
    }

    const existingLocker = await this.findLockerByDisplayName(kioskId, name, lockerId);
    if (existingLocker) {
      throw new Error(`Display name "${name}" is already used by locker ${existingLocker.id} in this kiosk`);
    }

    const currentLocker = await this.lockerRepository.findByKioskAndId(kioskId, lockerId);
    if (!currentLocker) {
      throw new Error(`Locker ${lockerId} not found in kiosk ${kioskId}`);
    }

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
   * Retrieves the display name for a locker. If no custom name is set,
   * it returns a default name (e.g., "Dolap 1").
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @returns {Promise<string>} The custom or default display name.
   */
  async getDisplayName(kioskId: string, lockerId: number): Promise<string> {
    const locker = await this.lockerRepository.findByKioskAndId(kioskId, lockerId);
    if (!locker) {
      throw new Error(`Locker ${lockerId} not found in kiosk ${kioskId}`);
    }

    if (locker.display_name && locker.display_name.trim()) {
      return locker.display_name.trim();
    }

    return `Dolap ${lockerId}`;
  }

  /**
   * Validates a locker name against the defined rules (length, characters, etc.).
   * @param {string} name - The name to validate.
   * @returns {ValidationResult} The result of the validation, including any errors or suggestions.
   */
  validateName(name: string): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (name === null || name === undefined || typeof name !== 'string') {
      errors.push('Name is required and must be a string');
      return { isValid: false, errors, suggestions };
    }

    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      errors.push('Name cannot be empty');
      return { isValid: false, errors, suggestions };
    }

    if (trimmedName.length > this.MAX_NAME_LENGTH) {
      errors.push(`Name must be ${this.MAX_NAME_LENGTH} characters or less (current: ${trimmedName.length})`);
      suggestions.push(`Try shortening to: "${trimmedName.substring(0, this.MAX_NAME_LENGTH)}"`);
    }

    if (!this.TURKISH_CHAR_REGEX.test(trimmedName)) {
      errors.push('Name contains invalid characters. Only Turkish letters, numbers, spaces, hyphens, and dots are allowed');
      
      const cleanedName = trimmedName.replace(/[^a-zA-ZçÇğĞıİöÖşŞüÜ0-9\s\-\.]/g, '');
      if (cleanedName.length > 0 && cleanedName !== trimmedName) {
        suggestions.push(`Try: "${cleanedName}"`);
      }
    }

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
   * Generates a list of preset name suggestions, including Turkish examples.
   * @returns {string[]} An array of preset name strings.
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
   * Retrieves the audit history of name changes for a kiosk or a specific locker.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} [lockerId] - An optional locker ID to filter the history.
   * @returns {Promise<LockerNameAudit[]>} An array of audit records.
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
   * Generates a data structure for a printable map of lockers,
   * which can be used by installers to label the physical hardware.
   * @param {string} kioskId - The ID of the kiosk.
   * @returns {Promise<PrintableMap>} The data for the printable map.
   */
  async exportPrintableMap(kioskId: string): Promise<PrintableMap> {
    const lockers = await this.lockerRepository.findAll({ kiosk_id: kioskId });
    
    const mapData: PrintableMap = {
      kiosk_id: kioskId,
      generated_at: new Date(),
      lockers: lockers.map(locker => ({
        id: locker.id,
        display_name: locker.display_name?.trim() || `Dolap ${locker.id}`,
        relay_number: locker.id,
        position: this.calculateGridPosition(locker.id)
      }))
    };

    return mapData;
  }

  /**
   * Updates the names of multiple lockers at once from a provided mapping.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {Record<number, string>} nameMapping - An object mapping locker IDs to their new names.
   * @param {string} updatedBy - The identifier of the user or system making the change.
   * @returns {Promise<object>} An object summarizing the successful and failed updates.
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
   * Clears the custom display name for a locker, reverting it to its default name.
   * @param {string} kioskId - The ID of the kiosk.
   * @param {number} lockerId - The ID of the locker.
   * @param {string} updatedBy - The identifier of the user or system making the change.
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
   * Finds a locker by its display name within a specific kiosk.
   * This is used to enforce name uniqueness.
   * @private
   */
  private async findLockerByDisplayName(
    kioskId: string, 
    displayName: string, 
    excludeLockerId?: number
  ): Promise<{ id: number } | null> {
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
    
    const matchingRow = rows.find((row: any) => 
      row.display_name && row.display_name.trim().toLowerCase() === normalizedSearchName
    );
    
    return matchingRow ? { id: (matchingRow as any).id } : null;
  }

  /**
   * Calculates the grid position (row, column) for a locker.
   * @private
   */
  private calculateGridPosition(lockerId: number): { row: number; col: number } {
    const cols = 4;
    const row = Math.ceil(lockerId / cols);
    const col = ((lockerId - 1) % cols) + 1;
    
    return { row, col };
  }
}