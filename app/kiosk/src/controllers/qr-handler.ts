import { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHmac } from 'crypto';
import { LockerStateManager } from '../../../../shared/services/locker-state-manager';
import { LockerNamingService } from '../../../../shared/services/locker-naming-service';
import { ModbusController } from '../hardware/modbus-controller';
import { QrResponse, QrActionToken, EventType } from '../../../../shared/types/core-entities';
import { RateLimiter } from '../services/rate-limiter';

export class QrHandler {
  private lockerStateManager: LockerStateManager;
  private modbusController: ModbusController;
  private lockerNamingService: LockerNamingService;
  private rateLimiter: RateLimiter;
  private readonly QR_TOKEN_TTL_SECONDS = 5;
  private readonly QR_HMAC_SECRET = process.env.QR_HMAC_SECRET || 'default-secret-change-in-production';

  constructor(lockerStateManager: LockerStateManager, modbusController: ModbusController, lockerNamingService: LockerNamingService) {
    this.lockerStateManager = lockerStateManager;
    this.modbusController = modbusController;
    this.lockerNamingService = lockerNamingService;
    this.rateLimiter = new RateLimiter();
    
    // Start cleanup timer for rate limiter
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Get the display name for a locker
   */
  private async getLockerDisplayName(kioskId: string, lockerId: number): Promise<string> {
    try {
      return await this.lockerNamingService.getDisplayName(kioskId, lockerId);
    } catch (error) {
      console.warn(`Failed to get display name for locker ${lockerId}, using default:`, error);
      return `Dolap ${lockerId}`;
    }
  }

  /**
   * Handle GET /lock/{id} - Display QR interface and generate device ID
   */
  async handleQrGet(
    kioskId: string, 
    lockerId: number, 
    request: FastifyRequest, 
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Get or create device ID
      let deviceId = this.getDeviceId(request);
      if (!deviceId) {
        deviceId = this.generateDeviceId();
        this.setDeviceIdCookie(reply, deviceId);
      }

      // Check if locker exists
      const locker = await this.lockerStateManager.getLocker(kioskId, lockerId);
      if (!locker) {
        reply.code(404).type('text/html').send(this.generateErrorPage('Locker not found', 'tr'));
        return;
      }

      // Check if VIP locker - return 423 status as per requirements
      if (locker.is_vip) {
        reply.code(423).type('text/html').send(
          this.generateErrorPage('VIP dolap. QR kapalı', 'tr', 'VIP locker. QR disabled')
        );
        return;
      }

      // Detect private/incognito mode
      const isPrivateMode = this.detectPrivateMode(request);
      
      // Generate action token
      const actionToken = this.generateActionToken(lockerId, deviceId);

      // Determine current action based on locker status and ownership
      let action: 'assign' | 'release' = 'assign';
      let message = 'Dolapı açmak için butona basın';
      let englishMessage = 'Press button to open locker';

      if (locker.status === 'Owned' && locker.owner_key === deviceId && locker.owner_type === 'device') {
        action = 'release';
        message = 'Dolapı açıp bırakmak için butona basın';
        englishMessage = 'Press button to open and release locker';
      } else if (locker.status !== 'Free') {
        reply.code(409).type('text/html').send(
          this.generateErrorPage('Dolap meşgul', 'tr', 'Locker busy')
        );
        return;
      }

      // Generate HTML response
      const html = this.generateQrInterface(
        lockerId, 
        deviceId, 
        actionToken, 
        action, 
        message, 
        englishMessage,
        isPrivateMode
      );

      reply.type('text/html').send(html);
    } catch (error) {
      console.error('Error handling QR GET request:', error);
      reply.code(500).type('text/html').send(
        this.generateErrorPage('Sistem hatası', 'tr', 'System error')
      );
    }
  }

  /**
   * Handle POST /act - Execute QR action
   */
  async handleQrAction(
    kioskId: string, 
    request: FastifyRequest, 
    reply: FastifyReply
  ): Promise<QrResponse> {
    try {
      const body = request.body as any;
      const { token } = body;

      if (!token) {
        return {
          success: false,
          action: 'network_required',
          message: 'Token required'
        };
      }

      // Validate action token
      const tokenData = this.validateActionToken(token);
      if (!tokenData) {
        return {
          success: false,
          action: 'network_required',
          message: 'Invalid or expired token'
        };
      }

      const { locker_id: lockerId, device_id: deviceId, action } = tokenData;

      // Get client IP
      const clientIp = this.getClientIp(request);

      // Check rate limits (IP: 30/min, locker: 6/min, device: 1/20sec)
      const rateLimitResult = await this.rateLimiter.checkRateLimit(clientIp, lockerId, deviceId, kioskId);
      if (!rateLimitResult.allowed) {
        reply.code(429);
        if (rateLimitResult.retryAfter) {
          reply.header('Retry-After', rateLimitResult.retryAfter.toString());
        }
        return {
          success: false,
          action: 'network_required',
          message: `Rate limit exceeded: ${rateLimitResult.reason}`
        };
      }

      // Validate Origin/Referer headers as per requirements
      if (!this.validateOriginReferer(request)) {
        reply.code(403);
        return {
          success: false,
          action: 'network_required',
          message: 'Invalid origin'
        };
      }

      // Get locker
      const locker = await this.lockerStateManager.getLocker(kioskId, lockerId);
      if (!locker) {
        return {
          success: false,
          action: 'network_required',
          message: 'Locker not found'
        };
      }

      // Check if VIP locker - return 423 status
      if (locker.is_vip) {
        reply.code(423);
        return {
          success: false,
          action: 'vip_blocked',
          message: 'VIP dolap. QR kapalı'
        };
      }

      // Execute action based on current state
      if (action === 'assign') {
        return await this.handleAssignAction(kioskId, lockerId, deviceId, locker);
      } else if (action === 'release') {
        return await this.handleReleaseAction(kioskId, lockerId, deviceId, locker);
      }

      return {
        success: false,
        action: 'network_required',
        message: 'Invalid action'
      };

    } catch (error) {
      console.error('Error handling QR action:', error);
      return {
        success: false,
        action: 'network_required',
        message: 'System error'
      };
    }
  }

  /**
   * Handle assign action (Free -> Reserved -> Owned)
   */
  private async handleAssignAction(
    kioskId: string, 
    lockerId: number, 
    deviceId: string, 
    locker: any
  ): Promise<QrResponse> {
    if (locker.status !== 'Free') {
      return {
        success: false,
        action: 'busy',
        message: 'Dolap meşgul'
      };
    }

    // Check if device already has a locker (one device, one locker rule)
    const existingLocker = await this.lockerStateManager.checkExistingOwnership(deviceId, 'device');
    if (existingLocker) {
      return {
        success: false,
        action: 'busy',
        message: 'Zaten bir dolapınız var'
      };
    }

    // Assign locker
    const assigned = await this.lockerStateManager.assignLocker(kioskId, lockerId, 'device', deviceId);
    if (!assigned) {
      return {
        success: false,
        action: 'busy',
        message: 'Dolap atanamadı'
      };
    }

    // Open locker
    const opened = await this.modbusController.openLocker(lockerId);
    if (opened) {
      // Confirm ownership (Reserved -> Owned)
      await this.lockerStateManager.confirmOwnership(kioskId, lockerId);
      
      const lockerName = await this.getLockerDisplayName(kioskId, lockerId);
      return {
        success: true,
        action: 'assign',
        message: `${lockerName} açıldı`,
        locker_id: lockerId,
        device_id: deviceId
      };
    } else {
      // Release if opening failed
      await this.lockerStateManager.releaseLocker(kioskId, lockerId, deviceId);
      return {
        success: false,
        action: 'network_required',
        message: 'Dolap açılamadı'
      };
    }
  }

  /**
   * Handle release action (Owned -> Free)
   */
  private async handleReleaseAction(
    kioskId: string, 
    lockerId: number, 
    deviceId: string, 
    locker: any
  ): Promise<QrResponse> {
    // Validate ownership
    if (locker.status !== 'Owned' || locker.owner_key !== deviceId || locker.owner_type !== 'device') {
      return {
        success: false,
        action: 'busy',
        message: 'Bu dolap size ait değil'
      };
    }

    // Open locker and release immediately
    const opened = await this.modbusController.openLocker(lockerId);
    if (opened) {
      const lockerName = await this.getLockerDisplayName(kioskId, lockerId);
      
      // Skip release for VIP lockers
      if (locker.is_vip) {
        return {
          success: true,
          action: 'release',
          message: `VIP ${lockerName} açıldı`,
          locker_id: lockerId,
          device_id: deviceId
        };
      } else {
        // Release ownership immediately upon command execution for non-VIP
        await this.lockerStateManager.releaseLocker(kioskId, lockerId, deviceId);
        
        return {
          success: true,
          action: 'release',
          message: `${lockerName} açıldı ve bırakıldı`,
          locker_id: lockerId,
          device_id: deviceId
        };
      }
    } else {
      return {
        success: false,
        action: 'network_required',
        message: 'Dolap açılamadı'
      };
    }
  }

  /**
   * Get device ID from cookie
   */
  private getDeviceId(request: FastifyRequest): string | null {
    const cookies = this.parseCookies(request.headers.cookie || '');
    return cookies.device_id || null;
  }

  /**
   * Generate 128-bit device ID
   */
  private generateDeviceId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Set device ID cookie (HttpOnly, SameSite=Strict, 1 year expiration)
   */
  private setDeviceIdCookie(reply: FastifyReply, deviceId: string): void {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    
    reply.header('Set-Cookie', 
      `device_id=${deviceId}; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}; Path=/`
    );
  }

  /**
   * Parse cookies from header
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });
    return cookies;
  }

  /**
   * Detect private/incognito mode
   */
  private detectPrivateMode(request: FastifyRequest): boolean {
    // Check for common private mode indicators
    const userAgent = request.headers['user-agent'] || '';
    const dnt = request.headers['dnt'];
    
    // Simple heuristics - in real implementation, this would be more sophisticated
    return dnt === '1' || userAgent.includes('Private');
  }

  /**
   * Generate HMAC-signed action token with 5-second TTL
   */
  private generateActionToken(lockerId: number, deviceId: string): string {
    const expiresAt = new Date(Date.now() + this.QR_TOKEN_TTL_SECONDS * 1000);
    const action = 'assign'; // Default action, will be determined by current state
    
    const payload = {
      locker_id: lockerId,
      device_id: deviceId,
      action,
      expires_at: expiresAt.getTime()
    };
    
    const payloadStr = JSON.stringify(payload);
    const signature = createHmac('sha256', this.QR_HMAC_SECRET)
      .update(payloadStr)
      .digest('hex');
    
    return Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
  }

  /**
   * Validate HMAC-signed action token
   */
  private validateActionToken(token: string): QrActionToken | null {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const { signature, ...payload } = decoded;
      
      // Check expiration
      if (Date.now() > payload.expires_at) {
        return null;
      }
      
      // Verify signature
      const expectedSignature = createHmac('sha256', this.QR_HMAC_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return null;
      }
      
      return {
        locker_id: payload.locker_id,
        device_id: payload.device_id,
        action: payload.action,
        expires_at: new Date(payload.expires_at),
        signature
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get client IP address
   */
  private getClientIp(request: FastifyRequest): string {
    // Check for forwarded headers first
    const forwarded = request.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    const realIp = request.headers['x-real-ip'] as string;
    if (realIp) {
      return realIp;
    }
    
    // Fallback to connection remote address
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * Validate Origin/Referer headers (enhanced security)
   */
  private validateOriginReferer(request: FastifyRequest): boolean {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const host = request.headers.host;
    
    // For QR requests, we expect them to come from the same host
    if (origin) {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return true;
      }
      
      // Allow local network origins
      if (this.isLocalNetworkHost(originUrl.hostname)) {
        return true;
      }
    }
    
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.host === host) {
          return true;
        }
        
        // Allow local network referers
        if (this.isLocalNetworkHost(refererUrl.hostname)) {
          return true;
        }
      } catch (error) {
        // Invalid referer URL
        return false;
      }
    }
    
    // If no origin or referer, allow (some browsers don't send these)
    if (!origin && !referer) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if hostname is in local network range
   */
  private isLocalNetworkHost(hostname: string): boolean {
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    
    // Check private IP ranges
    if (hostname.startsWith('192.168.') || 
        hostname.startsWith('10.') || 
        hostname.startsWith('172.')) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate QR interface HTML
   */
  private generateQrInterface(
    lockerId: number,
    deviceId: string,
    actionToken: string,
    action: 'assign' | 'release',
    message: string,
    englishMessage: string,
    isPrivateMode: boolean
  ): string {
    const privateWarning = isPrivateMode ? `
      <div class="warning">
        <p><strong>⚠️ Uyarı:</strong> Gizli tarama modunda QR erişimi sınırlıdır. Kart kullanmanız önerilir.</p>
        <p><strong>⚠️ Warning:</strong> QR access is limited in private browsing mode. Card usage is recommended.</p>
      </div>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dolap ${lockerId} - Eform Locker</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .locker-number {
            font-size: 48px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 20px;
        }
        .message {
            font-size: 18px;
            margin-bottom: 30px;
            color: #34495e;
        }
        .action-button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 18px;
            border-radius: 5px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 20px;
        }
        .action-button:hover {
            background-color: #2980b9;
        }
        .action-button:disabled {
            background-color: #bdc3c7;
            cursor: not-allowed;
        }
        .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: left;
        }
        .device-info {
            font-size: 12px;
            color: #7f8c8d;
            margin-top: 20px;
        }
        .status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 5px;
            display: none;
        }
        .status.success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="locker-number">${lockerId}</div>
        <div class="message">
            <p>${message}</p>
            <p style="font-size: 14px; color: #7f8c8d;">${englishMessage}</p>
        </div>
        
        ${privateWarning}
        
        <button id="actionButton" class="action-button" onclick="executeAction()">
            ${action === 'assign' ? 'Dolapı Aç / Open Locker' : 'Aç ve Bırak / Open & Release'}
        </button>
        
        <div id="status" class="status"></div>
        
        <div class="device-info">
            Device ID: ${deviceId.substring(0, 8)}...
        </div>
    </div>

    <script>
        async function executeAction() {
            const button = document.getElementById('actionButton');
            const status = document.getElementById('status');
            
            button.disabled = true;
            button.textContent = 'İşleniyor... / Processing...';
            
            try {
                const response = await fetch('/act', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        token: '${actionToken}'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.className = 'status success';
                    status.textContent = result.message;
                    status.style.display = 'block';
                    
                    // Redirect after success
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } else {
                    status.className = 'status error';
                    status.textContent = result.message;
                    status.style.display = 'block';
                    
                    button.disabled = false;
                    button.textContent = '${action === 'assign' ? 'Dolapı Aç / Open Locker' : 'Aç ve Bırak / Open & Release'}';
                }
            } catch (error) {
                status.className = 'status error';
                status.textContent = 'Ağ hatası / Network error';
                status.style.display = 'block';
                
                button.disabled = false;
                button.textContent = '${action === 'assign' ? 'Dolapı Aç / Open Locker' : 'Aç ve Bırak / Open & Release'}';
            }
        }
    </script>
</body>
</html>`;
  }

  /**
   * Generate error page HTML
   */
  private generateErrorPage(message: string, lang: string, englishMessage?: string): string {
    return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hata - Eform Locker</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 400px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .error-icon {
            font-size: 48px;
            color: #e74c3c;
            margin-bottom: 20px;
        }
        .message {
            font-size: 18px;
            color: #34495e;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">⚠️</div>
        <div class="message">
            <p>${message}</p>
            ${englishMessage ? `<p style="font-size: 14px; color: #7f8c8d;">${englishMessage}</p>` : ''}
        </div>
    </div>
</body>
</html>`;
  }
}
