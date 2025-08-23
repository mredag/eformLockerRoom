import { randomBytes, createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseConnection } from '../../../../shared/database/connection';
import { 
  KioskRegistrationRequest, 
  KioskRegistrationResponse, 
  ProvisioningToken, 
  ProvisioningStatus,
  KioskHeartbeat 
} from '../../../../shared/types/index';

export class ProvisioningService {
  private db: DatabaseConnection;
  private readonly SECRET_KEY = process.env.PROVISIONING_SECRET || 'default-secret-key';
  private readonly TOKEN_EXPIRY_MINUTES = 30;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Generate a one-time provisioning token for kiosk registration
   */
  async generateProvisioningToken(zone: string): Promise<ProvisioningToken> {
    const token = this.generateSecureToken();
    const kiosk_id = `kiosk-${zone}-${randomBytes(4).toString('hex')}`;
    const expires_at = new Date(Date.now() + this.TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Store token in database
    await this.db.run(
      `INSERT INTO provisioning_tokens (token, kiosk_id, zone, expires_at) 
       VALUES (?, ?, ?, ?)`,
      [token, kiosk_id, zone, expires_at.toISOString()]
    );

    // Log provisioning token generation
    await this.logEvent('provisioning_token_generated', {
      kiosk_id,
      zone,
      expires_at: expires_at.toISOString()
    });

    return {
      token,
      kiosk_id,
      zone,
      expires_at,
      used: false
    };
  }

  /**
   * Initial kiosk registration using provisioning token
   */
  async registerKiosk(token: string, request: KioskRegistrationRequest): Promise<KioskRegistrationResponse> {
    // Start provisioning process
    const provisioningId = await this.startProvisioning(request);

    try {
      // Validate provisioning token
      const tokenData = await this.validateProvisioningToken(token);
      if (!tokenData) {
        await this.rollbackProvisioning(provisioningId, 'Invalid or expired provisioning token');
        throw new Error('Invalid or expired provisioning token');
      }

      // Validate zone matches
      if (tokenData.zone !== request.zone) {
        await this.rollbackProvisioning(provisioningId, 'Zone mismatch');
        throw new Error('Zone mismatch in provisioning token');
      }

      // Generate registration secret
      const registration_secret = this.generateRegistrationSecret(tokenData.kiosk_id, request.hardware_id);

      // Create kiosk heartbeat entry
      await this.db.run(
        `INSERT INTO kiosk_heartbeat 
         (kiosk_id, last_seen, zone, status, version, hardware_id, registration_secret) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tokenData.kiosk_id,
          new Date().toISOString(),
          request.zone,
          'provisioning',
          request.version,
          request.hardware_id,
          registration_secret
        ]
      );

      // Mark token as used
      await this.db.run(
        `UPDATE provisioning_tokens SET used = TRUE, used_at = ? WHERE token = ?`,
        [new Date().toISOString(), token]
      );

      // Complete provisioning
      await this.completeProvisioning(provisioningId, tokenData.kiosk_id);

      // Log successful registration
      await this.logEvent('kiosk_registered', {
        kiosk_id: tokenData.kiosk_id,
        zone: request.zone,
        hardware_id: request.hardware_id,
        version: request.version
      }, tokenData.kiosk_id);

      return {
        kiosk_id: tokenData.kiosk_id,
        registration_secret,
        panel_url: process.env.PANEL_URL || 'http://localhost:3000'
      };

    } catch (error) {
      await this.rollbackProvisioning(provisioningId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Validate kiosk identity using registration secret
   */
  async validateKioskIdentity(kiosk_id: string, provided_secret: string, hardware_id: string): Promise<boolean> {
    const kiosk = await this.db.get<KioskHeartbeat & { registration_secret: string }>(
      `SELECT * FROM kiosk_heartbeat WHERE kiosk_id = ?`,
      [kiosk_id]
    );

    if (!kiosk || !kiosk.registration_secret) {
      return false;
    }

    // Verify registration secret
    const expected_secret = this.generateRegistrationSecret(kiosk_id, hardware_id);
    return provided_secret === expected_secret && kiosk.hardware_id === hardware_id;
  }

  /**
   * Complete kiosk enrollment after successful validation
   */
  async completeEnrollment(kiosk_id: string): Promise<void> {
    // Update kiosk status to online
    await this.db.run(
      `UPDATE kiosk_heartbeat SET status = 'online', last_seen = ? WHERE kiosk_id = ?`,
      [new Date().toISOString(), kiosk_id]
    );

    // Log enrollment completion
    await this.logEvent('kiosk_enrolled', {
      kiosk_id,
      status: 'online'
    }, kiosk_id);
  }

  /**
   * Generate QR code data for provisioning token
   */
  generateProvisioningQR(token: string): string {
    const panel_url = process.env.PANEL_URL || 'http://localhost:3000';
    return `${panel_url}/provision?token=${token}`;
  }

  /**
   * Get provisioning status
   */
  async getProvisioningStatus(provisioningId: number): Promise<ProvisioningStatus | null> {
    return await this.db.get<ProvisioningStatus>(
      `SELECT * FROM provisioning_status WHERE id = ?`,
      [provisioningId]
    );
  }

  /**
   * List all active kiosks
   */
  async listKiosks(): Promise<KioskHeartbeat[]> {
    return await this.db.all<KioskHeartbeat>(
      `SELECT kiosk_id, last_seen, zone, status, version, last_config_hash, offline_threshold_seconds 
       FROM kiosk_heartbeat ORDER BY zone, kiosk_id`
    );
  }

  /**
   * Clean up expired provisioning tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(
      `DELETE FROM provisioning_tokens WHERE expires_at < ? AND used = FALSE`,
      [now]
    );
  }

  // Private helper methods

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateRegistrationSecret(kiosk_id: string, hardware_id: string): string {
    const data = `${kiosk_id}:${hardware_id}:${this.SECRET_KEY}`;
    return createHmac('sha256', this.SECRET_KEY).update(data).digest('hex');
  }

  private async validateProvisioningToken(token: string): Promise<ProvisioningToken | null> {
    const tokenData = await this.db.get<ProvisioningToken>(
      `SELECT * FROM provisioning_tokens WHERE token = ? AND used = FALSE AND expires_at > ?`,
      [token, new Date().toISOString()]
    );

    return tokenData || null;
  }

  private async startProvisioning(request: KioskRegistrationRequest): Promise<number> {
    const result = await this.db.run(
      `INSERT INTO provisioning_status (status, hardware_id, zone) VALUES (?, ?, ?)`,
      ['in_progress', request.hardware_id, request.zone]
    );
    return result.lastID!;
  }

  private async completeProvisioning(provisioningId: number, kiosk_id: string): Promise<void> {
    await this.db.run(
      `UPDATE provisioning_status SET status = ?, kiosk_id = ?, completed_at = ? WHERE id = ?`,
      ['completed', kiosk_id, new Date().toISOString(), provisioningId]
    );
  }

  private async rollbackProvisioning(provisioningId: number, reason: string): Promise<void> {
    await this.db.run(
      `UPDATE provisioning_status SET status = 'rolled_back', error = ?, completed_at = ? WHERE id = ?`,
      [reason, new Date().toISOString(), provisioningId]
    );

    // Log rollback event
    await this.logEvent('provisioning_rollback', {
      provisioning_id: provisioningId,
      reason
    });
  }

  private async logEvent(event_type: string, details: any, kiosk_id?: string): Promise<void> {
    await this.db.run(
      `INSERT INTO events (kiosk_id, event_type, details) VALUES (?, ?, ?)`,
      [kiosk_id || null, event_type, JSON.stringify(details)]
    );
  }
}
