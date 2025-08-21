import { User } from '../services/auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}