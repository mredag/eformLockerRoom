import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ConfigManager } from '../../../../shared/services/config-manager';

export class HardwareConfigRoutes {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  async registerRoutes(fastify: FastifyInstance) {
    // Serve hardware configuration page
    fastify.get('/panel/hardware-config', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.serveHardwareConfigPage(request, reply);
    });

    // Get current hardware configuration
    fastify.get('/api/hardware-config', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getHardwareConfig(request, reply);
    });

    // Update hardware configuration
    fastify.post('/api/hardware-config', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.updateHardwareConfig(request, reply);
    });

    // Test Modbus connection
    fastify.post('/api/hardware-config/test-modbus', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.testModbusConnection(request, reply);
    });

    // Test single locker
    fastify.post('/api/hardware-config/test-locker', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.testSingleLocker(request, reply);
    });

    // Test all lockers
    fastify.post('/api/hardware-config/test-all-lockers', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.testAllLockers(request, reply);
    });

    // Emergency stop
    fastify.post('/api/hardware-config/emergency-stop', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.emergencyStop(request, reply);
    });

    // Get hardware statistics
    fastify.get('/api/hardware-config/stats', async (request: FastifyRequest, reply: FastifyReply) => {
      return this.getHardwareStats(request, reply);
    });
  }

  private async serveHardwareConfigPage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const htmlPath = join(__dirname, '../views/hardware-config.html');
      const html = await readFile(htmlPath, 'utf-8');
      
      reply.type('text/html');
      return html;
    } catch (error) {
      console.error('Error serving hardware config page:', error);
      reply.code(500);
      return { error: 'Failed to load hardware configuration page' };
    }
  }

  private async getHardwareConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      await this.configManager.initialize();
      const config = this.configManager.getConfiguration();
      
      return {
        success: true,
        ...config
      };
    } catch (error) {
      console.error('Error getting hardware config:', error);
      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async updateHardwareConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const updates = request.body as any;
      const staffUser = 'admin'; // TODO: Get from session

      // Pre-normalize zones to avoid validation failures when a zone loses all cards
      try {
        if (Array.isArray(updates?.zones)) {
          // Determine available cards from incoming hardware (fallback to current config if not provided)
          const current = this.configManager.getConfiguration();
          const hwCards = Array.isArray(updates?.hardware?.relay_cards)
            ? updates.hardware.relay_cards
            : current.hardware.relay_cards;
          const availableCards: number[] = hwCards
            .filter((c: any) => c && c.enabled !== false)
            .map((c: any) => Number(c.slave_address));

          updates.zones = updates.zones.map((z: any) => {
            const relayCards = Array.isArray(z.relay_cards) ? z.relay_cards : [];
            const pruned = relayCards.filter((id: any) => availableCards.includes(Number(id))).sort((a: number, b: number) => a - b);
            // Auto-disable zones that have no relay cards
            const enabled = pruned.length > 0 ? (z.enabled !== false) : false;
            return { ...z, enabled, relay_cards: pruned };
          });
        }
      } catch (normErr) {
        request.log?.warn?.({ normErr }, 'Zone pre-normalization failed; continuing to validate as-is');
      }

      // Validate the configuration
      const validation = this.configManager.validateConfiguration(updates);
      if (!validation.valid) {
        reply.code(400);
        return {
          success: false,
          error: 'Configuration validation failed',
          details: validation.errors
        };
      }

      // Update hardware section
      if (updates.hardware) {
        await this.configManager.updateConfiguration(
          'hardware',
          updates.hardware,
          staffUser,
          'Hardware configuration updated via admin panel'
        );
      }

      // Update lockers section
      if (updates.lockers) {
        await this.configManager.updateConfiguration(
          'lockers',
          updates.lockers,
          staffUser,
          'Locker configuration updated via admin panel'
        );
      }

      // Update features (e.g., zones_enabled)
      if (updates.features) {
        await this.configManager.updateConfiguration(
          'features',
          updates.features,
          staffUser,
          'Features updated via admin panel'
        );
      }

      // Update zones mapping (assign relay_cards to zones)
      if (updates.zones) {
        await this.configManager.updateConfiguration(
          'zones',
          updates.zones,
          staffUser,
          'Zones configuration updated via admin panel'
        );
      }

      // Update other sections as needed
      const sectionsToUpdate = ['system', 'database', 'services', 'security', 'qr', 'logging', 'i18n'];
      for (const section of sectionsToUpdate) {
        if (updates[section]) {
          await this.configManager.updateConfiguration(
            section as any,
            updates[section],
            staffUser,
            `${section} configuration updated via admin panel`
          );
        }
      }

      return {
        success: true,
        message: 'Configuration updated successfully',
        warnings: validation.warnings || []
      };
    } catch (error) {
      console.error('Error updating hardware config:', error);
      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async testModbusConnection(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Test Modbus connection by trying to communicate with the first relay card
      const config = this.configManager.getConfiguration();
      const firstCard = config.hardware.relay_cards.find(card => card.enabled);
      
      if (!firstCard) {
        return {
          success: false,
          error: 'No enabled relay cards found'
        };
      }

      // Make a test request to the kiosk service to test Modbus
      const kioskUrl = process.env.KIOSK_URL || 'http://127.0.0.1:3002';
      const testResponse = await fetch(`${kioskUrl}/api/hardware/status`, {
        method: 'GET',
        timeout: 5000
      });

      if (testResponse.ok) {
        const status = await testResponse.json();
        return {
          success: true,
          message: 'Modbus connection successful',
          hardware_status: status
        };
      } else {
        return {
          success: false,
          error: 'Modbus connection failed - hardware service not responding'
        };
      }
    } catch (error) {
      console.error('Error testing Modbus connection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  private async testSingleLocker(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { locker_id } = request.body as { locker_id: number };
      
      if (!locker_id || locker_id < 1) {
        reply.code(400);
        return {
          success: false,
          error: 'Invalid locker ID'
        };
      }

      // Test the locker by sending an open command to the kiosk service
      const kioskUrl = process.env.KIOSK_URL || 'http://127.0.0.1:3002';
      const testResponse = await fetch(`${kioskUrl}/api/locker/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          locker_id,
          staff_user: 'admin-panel-test',
          reason: 'Hardware configuration test'
        }),
        timeout: 10000
      });

      if (testResponse.ok) {
        const result = await testResponse.json();
        return {
          success: result.success,
          message: result.success ? `Locker ${locker_id} test successful` : result.error,
          locker_id
        };
      } else {
        return {
          success: false,
          error: `Test failed - HTTP ${testResponse.status}`,
          locker_id
        };
      }
    } catch (error) {
      console.error('Error testing single locker:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
        locker_id: (request.body as any)?.locker_id
      };
    }
  }

  private async testAllLockers(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = this.configManager.getConfiguration();
      const totalLockers = config.lockers.total_count;
      
      let successful = 0;
      let failed = 0;
      const results: Array<{ locker_id: number; success: boolean; error?: string }> = [];

      // Test each locker with a delay to avoid overwhelming the hardware
      for (let lockerId = 1; lockerId <= totalLockers; lockerId++) {
        try {
          const kioskUrl = process.env.KIOSK_URL || 'http://127.0.0.1:3002';
          const testResponse = await fetch(`${kioskUrl}/api/locker/open`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              locker_id: lockerId,
              staff_user: 'admin-panel-bulk-test',
              reason: 'Bulk hardware test'
            }),
            timeout: 5000
          });

          if (testResponse.ok) {
            const result = await testResponse.json();
            if (result.success) {
              successful++;
              results.push({ locker_id: lockerId, success: true });
            } else {
              failed++;
              results.push({ locker_id: lockerId, success: false, error: result.error });
            }
          } else {
            failed++;
            results.push({ locker_id: lockerId, success: false, error: `HTTP ${testResponse.status}` });
          }

          // Add delay between tests to avoid overwhelming the hardware
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          failed++;
          results.push({ 
            locker_id: lockerId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      return {
        success: true,
        message: `Bulk test completed: ${successful} successful, ${failed} failed`,
        successful,
        failed,
        total: totalLockers,
        results
      };
    } catch (error) {
      console.error('Error testing all lockers:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bulk test failed'
      };
    }
  }

  private async emergencyStop(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = this.configManager.getConfiguration();
      const totalLockers = config.lockers.total_count;
      
      // Send emergency close commands to all lockers
      const kioskUrl = process.env.KIOSK_URL || 'http://127.0.0.1:3002';
      const promises = [];

      for (let lockerId = 1; lockerId <= totalLockers; lockerId++) {
        const promise = fetch(`${kioskUrl}/api/locker/close`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            locker_id: lockerId,
            staff_user: 'admin-panel-emergency',
            reason: 'Emergency stop from admin panel'
          }),
          timeout: 2000
        }).catch(error => {
          console.warn(`Emergency close failed for locker ${lockerId}:`, error);
          return null;
        });
        
        promises.push(promise);
      }

      // Wait for all emergency close commands to complete
      await Promise.all(promises);

      return {
        success: true,
        message: 'Emergency stop commands sent to all lockers'
      };
    } catch (error) {
      console.error('Error during emergency stop:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Emergency stop failed'
      };
    }
  }

  private async getHardwareStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const config = this.configManager.getConfiguration();
      
      const totalCards = config.hardware.relay_cards.length;
      const enabledCards = config.hardware.relay_cards.filter(card => card.enabled).length;
      const totalChannels = config.hardware.relay_cards
        .filter(card => card.enabled)
        .reduce((sum, card) => sum + card.channels, 0);
      
      const configMismatch = config.lockers.total_count !== totalChannels;

      return {
        success: true,
        stats: {
          total_lockers: config.lockers.total_count,
          total_cards: totalCards,
          enabled_cards: enabledCards,
          total_channels: totalChannels,
          config_mismatch: configMismatch,
          maintenance_mode: config.lockers.maintenance_mode
        }
      };
    } catch (error) {
      console.error('Error getting hardware stats:', error);
      reply.code(500);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get hardware stats'
      };
    }
  }
}
