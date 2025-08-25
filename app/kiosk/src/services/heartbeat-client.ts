import { EventType, Command } from '../../../../src/types/core-entities';

export interface HeartbeatConfig {
  gatewayUrl: string;
  kioskId: string;
  zone: string;
  version: string;
  heartbeatIntervalMs: number; // Default: 10000 (10 seconds)
  pollIntervalMs: number;      // Default: 2000 (2 seconds)
  maxRetries: number;          // Default: 3
  retryDelayMs: number;        // Default: 5000 (5 seconds)
}

export interface CommandHandler {
  (command: Command): Promise<{ success: boolean; error?: string }>;
}

export class HeartbeatClient {
  private config: HeartbeatConfig;
  private heartbeatTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private isRunning = false;
  private isRegistered = false;
  private commandHandlers = new Map<string, CommandHandler>();
  private retryCount = 0;

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  /**
   * Start the heartbeat client
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`Starting heartbeat client for kiosk ${this.config.kioskId}...`);

    try {
      // Wait a moment for gateway to be fully ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Register with gateway
      await this.registerKiosk();
      
      // Start heartbeat timer
      this.startHeartbeat();
      
      // Start command polling
      this.startCommandPolling();
      
      // Clear any pending commands from previous session
      await this.clearPendingCommands();
      
      console.log(`Heartbeat client started for kiosk ${this.config.kioskId}`);
    } catch (error) {
      console.error('Failed to start heartbeat client:', error);
      // Continue running and retry registration
      this.scheduleRetry();
    }
  }

  /**
   * Stop the heartbeat client
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    console.log(`Heartbeat client stopped for kiosk ${this.config.kioskId}`);
  }

  /**
   * Register a command handler
   */
  registerCommandHandler(commandType: string, handler: CommandHandler): void {
    this.commandHandlers.set(commandType, handler);
  }

  /**
   * Update configuration hash (for config sync)
   */
  async updateConfigHash(configHash: string): Promise<void> {
    try {
      await this.sendHeartbeat(configHash);
    } catch (error) {
      console.error('Failed to update config hash:', error);
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.isRegistered && this.isRunning;
  }

  /**
   * Private method to register kiosk with gateway
   */
  private async registerKiosk(): Promise<void> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/heartbeat/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kiosk_id: this.config.kioskId,
          zone: this.config.zone,
          version: this.config.version,
          hardware_id: this.getHardwareId()
        }),
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Registration failed: ${result.error}`);
      }

      this.isRegistered = true;
      this.retryCount = 0;

      console.log(`Kiosk ${this.config.kioskId} registered successfully`);
    } catch (error) {
      console.error('Failed to register kiosk:', error);
      this.isRegistered = false;
      throw error;
    }
  }

  /**
   * Private method to send heartbeat
   */
  private async sendHeartbeat(configHash?: string): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/heartbeat/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kiosk_id: this.config.kioskId,
          version: this.config.version,
          config_hash: configHash
        }),
      });

      if (!response.ok) {
        throw new Error(`Heartbeat failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Heartbeat failed: ${result.error}`);
      }

      // Update polling configuration if provided
      if (result.polling_config) {
        this.updatePollingConfig(result.polling_config);
      }

      this.retryCount = 0;
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Private method to start heartbeat timer
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Private method to start command polling
   */
  private startCommandPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(async () => {
      await this.pollCommands();
    }, this.config.pollIntervalMs);
  }

  /**
   * Private method to poll for commands
   */
  private async pollCommands(): Promise<void> {
    if (!this.isRunning || !this.isRegistered) {
      return;
    }

    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/heartbeat/commands/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kiosk_id: this.config.kioskId,
          limit: 10
        }),
      });

      if (!response.ok) {
        throw new Error(`Command poll failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`Command poll failed: ${result.error}`);
      }

      const commands = result.data || [];
      
      // Execute commands
      for (const command of commands) {
        await this.executeCommand(command);
      }
    } catch (error) {
      console.error('Failed to poll commands:', error);
      this.handleConnectionError();
    }
  }

  /**
   * Private method to execute a command
   */
  private async executeCommand(command: Command): Promise<void> {
    const handler = this.commandHandlers.get(command.command_type);
    
    if (!handler) {
      console.warn(`No handler registered for command type: ${command.command_type}`);
      await this.markCommandFailed(command.command_id, `No handler for command type: ${command.command_type}`);
      return;
    }

    try {
      console.log(`Executing command ${command.command_id} (${command.command_type})`);
      
      const result = await handler(command);
      
      if (result.success) {
        await this.markCommandCompleted(command.command_id);
        console.log(`Command ${command.command_id} completed successfully`);
      } else {
        await this.markCommandFailed(command.command_id, result.error || 'Command execution failed');
        console.error(`Command ${command.command_id} failed: ${result.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.markCommandFailed(command.command_id, errorMessage);
      console.error(`Command ${command.command_id} execution error:`, error);
    }
  }

  /**
   * Private method to mark command as completed
   */
  private async markCommandCompleted(commandId: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/heartbeat/commands/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: commandId,
          success: true
        }),
      });

      if (!response.ok) {
        console.error(`Failed to mark command ${commandId} as completed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to mark command ${commandId} as completed:`, error);
    }
  }

  /**
   * Private method to mark command as failed
   */
  private async markCommandFailed(commandId: string, error: string): Promise<void> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/heartbeat/commands/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command_id: commandId,
          success: false,
          error
        }),
      });

      if (!response.ok) {
        console.error(`Failed to mark command ${commandId} as failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to mark command ${commandId} as failed:`, error);
    }
  }

  /**
   * Private method to clear pending commands
   */
  private async clearPendingCommands(): Promise<void> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/heartbeat/kiosks/${this.config.kioskId}/clear-commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        console.error(`Failed to clear pending commands: ${response.status}`);
        return;
      }

      const result = await response.json();
      if (result.success && result.data.cleared_count > 0) {
        console.log(`Cleared ${result.data.cleared_count} pending commands from previous session`);
      }
    } catch (error) {
      console.error('Failed to clear pending commands:', error);
    }
  }

  /**
   * Private method to handle connection errors
   */
  private handleConnectionError(): void {
    this.isRegistered = false;
    this.retryCount++;
    
    if (this.retryCount <= this.config.maxRetries) {
      this.scheduleRetry();
    } else {
      console.error(`Max retries (${this.config.maxRetries}) exceeded. Will continue trying...`);
      // Reset retry count to continue trying
      this.retryCount = 0;
      this.scheduleRetry();
    }
  }

  /**
   * Private method to schedule retry
   */
  private scheduleRetry(): void {
    const delay = this.config.retryDelayMs * Math.pow(2, Math.min(this.retryCount, 5)); // Exponential backoff, max 32x
    
    console.log(`Scheduling reconnection attempt in ${delay}ms (attempt ${this.retryCount + 1})`);
    
    setTimeout(async () => {
      if (this.isRunning) {
        try {
          await this.registerKiosk();
          this.startHeartbeat();
        } catch (error) {
          console.error('Retry registration failed:', error);
          this.handleConnectionError();
        }
      }
    }, delay);
  }

  /**
   * Private method to update polling configuration
   */
  private updatePollingConfig(config: { heartbeatIntervalMs: number; pollIntervalMs: number }): void {
    let configChanged = false;
    
    if (config.heartbeatIntervalMs !== this.config.heartbeatIntervalMs) {
      this.config.heartbeatIntervalMs = config.heartbeatIntervalMs;
      configChanged = true;
    }
    
    if (config.pollIntervalMs !== this.config.pollIntervalMs) {
      this.config.pollIntervalMs = config.pollIntervalMs;
      configChanged = true;
    }
    
    if (configChanged) {
      console.log('Polling configuration updated:', config);
      this.startHeartbeat();
      this.startCommandPolling();
    }
  }

  /**
   * Private method to get hardware ID
   */
  private getHardwareId(): string {
    // In a real implementation, this would get actual hardware ID
    // For now, use a combination of hostname and MAC address or similar
    const os = require('os');
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    
    // Get first non-internal MAC address
    let macAddress = '';
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      if (interfaces) {
        for (const iface of interfaces) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddress = iface.mac;
            break;
          }
        }
      }
      if (macAddress) break;
    }
    
    return `${hostname}-${macAddress}`.replace(/[^a-zA-Z0-9-]/g, '');
  }
}
