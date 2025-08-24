import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { websocketRoutes } from '../websocket.js';
import { WebSocketManager } from '../../services/websocket-manager.js';

describe('WebSocket Routes', () => {
  let fastify: FastifyInstance;
  let websocketManager: WebSocketManager;

  beforeEach(async () => {
    fastify = Fastify({ logger: false });
    
    // Register WebSocket support
    await fastify.register(import('@fastify/websocket'));
    
    // Create WebSocket manager
    websocketManager = new WebSocketManager(fastify);
    
    // Register WebSocket routes
    await fastify.register(websocketRoutes, { websocketManager });
    
    await fastify.ready();
  });

  afterEach(async () => {
    websocketManager.shutdown();
    await fastify.close();
  });

  describe('WebSocket Status Endpoint', () => {
    it('should return WebSocket status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/websocket/status'
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data).toHaveProperty('status', 'active');
      expect(data).toHaveProperty('namespaces');
      expect(data).toHaveProperty('total_connections');
      expect(data).toHaveProperty('latency_metrics');
      expect(data).toHaveProperty('timestamp');
      
      expect(data.namespaces).toHaveProperty('/ws/lockers');
      expect(data.namespaces).toHaveProperty('/ws/help');
      expect(data.namespaces).toHaveProperty('/ws/events');
    });
  });

  describe('WebSocket Broadcast Endpoint', () => {
    it('should accept broadcast requests', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/websocket/broadcast',
        payload: {
          namespace: '/ws/lockers',
          event: 'test_event',
          data: { message: 'test' }
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('timestamp');
    });

    it('should accept broadcast requests with room', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/websocket/broadcast',
        payload: {
          namespace: '/ws/lockers',
          event: 'test_event',
          data: { message: 'test' },
          room: 'test_room'
        }
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.payload);
      expect(data).toHaveProperty('success', true);
      expect(data.message).toContain('/ws/lockers/test_room');
    });

    it('should validate required fields', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/websocket/broadcast',
        payload: {
          namespace: '/ws/lockers'
          // Missing event and data
        }
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Connection Count Tracking', () => {
    it('should track connections correctly', () => {
      expect(websocketManager.getConnectionCount()).toBe(0);
      expect(websocketManager.getConnectionCount('/ws/lockers')).toBe(0);
      expect(websocketManager.getConnectionCount('/ws/help')).toBe(0);
      expect(websocketManager.getConnectionCount('/ws/events')).toBe(0);
    });
  });

  describe('Latency Metrics', () => {
    it('should provide latency metrics', () => {
      const metrics = websocketManager.getLatencyMetrics();
      
      expect(metrics).toHaveProperty('median');
      expect(metrics).toHaveProperty('p95');
      expect(metrics).toHaveProperty('p99');
      expect(metrics).toHaveProperty('connection_count');
      
      expect(typeof metrics.median).toBe('number');
      expect(typeof metrics.p95).toBe('number');
      expect(typeof metrics.p99).toBe('number');
      expect(typeof metrics.connection_count).toBe('number');
    });
  });
});