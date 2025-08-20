import Fastify from 'fastify';
import { DatabaseConnection } from './database/connection.js';
import { provisioningRoutes } from './routes/provisioning.js';
import { configurationRoutes } from './routes/configuration.js';
import { mkdirSync } from 'fs';

const fastify = Fastify({
  logger: true
});

// Ensure data directory exists
try {
  mkdirSync('./data', { recursive: true });
} catch (error) {
  // Directory might already exist
}

// Initialize database
async function initializeDatabase() {
  const db = DatabaseConnection.getInstance();
  await db.initializeSchema();
}

// Register routes
fastify.register(provisioningRoutes, { prefix: '/api/provisioning' });
fastify.register(configurationRoutes, { prefix: '/api/configuration' });

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'eform-provisioning'
  };
});

// Serve configuration panel
fastify.get('/config-panel', async (request, reply) => {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  
  try {
    const htmlPath = join(process.cwd(), 'src', 'views', 'configuration-panel.html');
    const html = readFileSync(htmlPath, 'utf8');
    reply.type('text/html').send(html);
  } catch (error) {
    reply.status(500).send({ error: 'Failed to load configuration panel' });
  }
});

// Start server
const start = async () => {
  try {
    await initializeDatabase();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Eform Provisioning Service started on port 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();