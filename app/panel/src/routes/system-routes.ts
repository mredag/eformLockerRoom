import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { spawn } from "child_process";
import { User } from "../services/auth-service";
import { PermissionService, Permission } from "../services/permission-service";

export async function systemRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Pre-handler to ensure user is an admin
  const requireAdmin = async (request: any, reply: any) => {
    const user = request.user as User;
    if (!user || !PermissionService.hasPermission(user.role, Permission.MANAGE_SYSTEM)) {
      reply.code(403).send({ error: "Insufficient permissions" });
      return;
    }
  };

  fastify.post(
    "/restart",
    {
      preHandler: requireAdmin,
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as User;
      fastify.log.info(`System restart initiated by user: ${user.username}`);

      // The restart script should be executed in a detached process so that it doesn't
      // get terminated when the panel service itself is restarted.
      const restartScript = "/home/pi/eform-locker/scripts/maintenance/restart-systemd-services.sh";

      try {
        const child = spawn("bash", [restartScript], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();

        reply.send({
          success: true,
          message: "System restart initiated. Services should be back online shortly.",
        });
      } catch (error: any) {
        fastify.log.error("Failed to spawn restart process:", error);
        reply.code(500).send({
          error: "Failed to start the restart script.",
        });
      }
    }
  );
}