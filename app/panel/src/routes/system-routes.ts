import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as os from "os";
import * as path from "path";
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
      const isWindows = os.platform() === 'win32';
      const user = request.user as User;

      fastify.log.info(`System restart initiated by user: ${user.username} on ${os.platform()}`);

      if (isWindows) {
        // For Windows, run the dev startup script in a new detached process.
        // This is non-blocking and suitable for a dev environment.
        const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'start-dev-windows.ps1');
        
        try {
          const child = spawn('powershell.exe', [
            '-ExecutionPolicy', 'Bypass',
            '-File', scriptPath
          ], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();

          reply.send({
            success: true,
            message: "Windows development services restart initiated.",
            output: "New PowerShell windows should be opening for each service.",
          });
        } catch (error: any) {
            fastify.log.error("Failed to spawn restart process on Windows:", error);
            reply.code(500).send({
              error: "Failed to start Windows restart script.",
              output: error.message,
            });
        }
      } else {
        // For Linux (Pi), execute the systemd restart script.
        try {
          const { stdout, stderr } = await execAsync(
            "bash /home/pi/eform-locker/scripts/maintenance/restart-systemd-services.sh"
          );

          if (stderr) {
            fastify.log.warn("Restart script produced stderr:", stderr);
          }

          reply.send({
            success: true,
            message: "System services restart initiated successfully.",
            output: stdout,
          });
        } catch (error: any) {
          fastify.log.error("Failed to execute restart script on Linux:", error);
          reply.code(500).send({
            error: "Failed to execute restart script.",
            output: error.stderr || error.stdout || error.message,
          });
        }
      }
    }
  );
}