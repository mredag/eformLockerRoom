/**
 * Test Server Helper
 * Creates a test Fastify server instance for integration testing
 */

import Fastify, { FastifyInstance } from 'fastify';
import { HardwareConfigRoutes } from '../../app/panel/src/routes/hardware-config-routes';

export async function createTestServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false // Disable logging during tests
  });

  // Register hardware config routes
  const hardwareRoutes = new HardwareConfigRoutes();
  await hardwareRoutes.registerRoutes(server);

  // Add WebSocket support for real-time testing
  await server.register(require('@fastify/websocket'));
  
  server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      connection.socket.on('message', (message) => {
        // Echo back for testing
        connection.socket.send(message);
      });
    });
  });

  return server;
}