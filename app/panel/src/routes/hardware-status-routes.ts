import { FastifyInstance } from 'fastify';
import si from 'systeminformation';

export async function hardwareStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/api/performance/hardware-status', async (request, reply) => {
    try {
      const [cpu, mem, temp] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.cpuTemperature(),
      ]);

      const hardwareStatus = {
        cpu: {
          load: cpu.currentLoad.toFixed(2),
        },
        ram: {
          used: (mem.used / 1024 / 1024).toFixed(0),
          total: (mem.total / 1024 / 1024).toFixed(0),
          percent: ((mem.used / mem.total) * 100).toFixed(2),
        },
        temp: {
          main: temp.main,
          max: temp.max,
        },
      };

      reply.send(hardwareStatus);
    } catch (error) {
      fastify.log.error('Error fetching hardware status:', error);
      reply.status(500).send({ error: 'Failed to fetch hardware status' });
    }
  });
}
