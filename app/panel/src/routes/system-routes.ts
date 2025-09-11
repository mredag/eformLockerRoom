import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { exec } from "child_process";
import { promisify } from "util";
import { User } from "../services/auth-service";
import { PermissionService, Permission } from "../services/permission-service";

const execAsync = promisify(exec);

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
              output: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              output: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { stdout, stderr } = await execAsync(
          "bash /home/pi/eform-locker/scripts/maintenance/restart-systemd-services.sh"
        );

        if (stderr) {
          fastify.log.warn("Restart script produced stderr:", stderr);
        }

        fastify.log.info("System restart initiated by user:", (request.user as User).username);

        reply.send({
          success: true,
          message: "System restart initiated successfully.",
          output: stdout,
        });
      } catch (error: any) {
        fastify.log.error("Failed to restart system:", error);
        reply.code(500).send({
          error: "Failed to execute restart script.",
          output: error.stderr || error.stdout || error.message,
        });
      }
    }
  );
}
