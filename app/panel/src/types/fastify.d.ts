import { User } from '../services/auth-service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}
