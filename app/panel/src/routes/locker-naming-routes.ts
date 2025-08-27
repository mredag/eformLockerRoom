import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { DatabaseManager } from '../../../../shared/database/database-manager';
import { LockerNamingService } from '../../../../shared/services/locker-naming-service';
import { requirePermission, requireCsrfToken } from '../middleware/auth-middleware';
import { Permission } from '../services/permission-service';
import { User } from '../services/auth-service';

interface LockerNamingRouteOptions extends FastifyPluginOptions {
  dbManager: DatabaseManager;
}

export async function lockerNamingRoutes(fastify: FastifyInstance, options: LockerNamingRouteOptions) {
  const { dbManager } = options;
  const namingService = new LockerNamingService(dbManager.getConnection());

  // Get locker naming presets
  fastify.get('/presets', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    try {
      const presets = namingService.generatePresets();
      reply.send({ presets });
    } catch (error) {
      fastify.log.error('Failed to get naming presets:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to get naming presets'
      });
    }
  });

  // Get locker display name
  fastify.get('/:kioskId/:lockerId/name', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };

    try {
      const displayName = await namingService.getDisplayName(kioskId, parseInt(lockerId));
      reply.send({ displayName });
    } catch (error) {
      fastify.log.error('Failed to get locker display name:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to get locker display name'
      });
    }
  });

  // Set locker display name
  fastify.post('/:kioskId/:lockerId/name', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['displayName'],
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 20 }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const { displayName } = request.body as { displayName: string };
    const user = (request as any).user as User;

    try {
      // Validate the name first
      const validation = namingService.validateName(displayName);
      if (!validation.isValid) {
        return reply.code(400).send({
          code: 'validation_error',
          message: validation.errors.join(', '),
          suggestions: validation.suggestions
        });
      }

      await namingService.setDisplayName(kioskId, parseInt(lockerId), displayName, user.username);
      
      reply.send({ 
        success: true, 
        message: 'Locker name updated successfully',
        displayName: displayName.trim()
      });
    } catch (error) {
      fastify.log.error('Failed to set locker display name:', error);
      
      if (error instanceof Error && error.message.includes('already used')) {
        return reply.code(409).send({
          code: 'conflict',
          message: error.message
        });
      }
      
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to update locker name'
      });
    }
  });

  // Clear locker display name (revert to default)
  fastify.delete('/:kioskId/:lockerId/name', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()]
  }, async (request, reply) => {
    const { kioskId, lockerId } = request.params as { kioskId: string; lockerId: string };
    const user = (request as any).user as User;

    try {
      await namingService.clearDisplayName(kioskId, parseInt(lockerId), user.username);
      
      const defaultName = await namingService.getDisplayName(kioskId, parseInt(lockerId));
      
      reply.send({ 
        success: true, 
        message: 'Locker name cleared successfully',
        displayName: defaultName
      });
    } catch (error) {
      fastify.log.error('Failed to clear locker display name:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to clear locker name'
      });
    }
  });

  // Validate locker name
  fastify.post('/validate', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { name } = request.body as { name: string };

    try {
      const validation = namingService.validateName(name);
      reply.send(validation);
    } catch (error) {
      fastify.log.error('Failed to validate locker name:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to validate name'
      });
    }
  });

  // Get name audit history
  fastify.get('/:kioskId/audit', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const { kioskId } = request.params as { kioskId: string };
    const { lockerId } = request.query as { lockerId?: string };

    try {
      const auditHistory = await namingService.getNameAuditHistory(
        kioskId, 
        lockerId ? parseInt(lockerId) : undefined
      );
      
      reply.send({ auditHistory });
    } catch (error) {
      fastify.log.error('Failed to get name audit history:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to get audit history'
      });
    }
  });

  // Export printable map
  fastify.get('/:kioskId/printable-map', {
    preHandler: [requirePermission(Permission.VIEW_LOCKERS)]
  }, async (request, reply) => {
    const { kioskId } = request.params as { kioskId: string };

    try {
      const printableMap = await namingService.exportPrintableMap(kioskId);
      
      // Generate HTML for printable map
      const html = generatePrintableMapHTML(printableMap);
      
      reply
        .header('Content-Type', 'text/html')
        .header('Content-Disposition', `inline; filename="locker-map-${kioskId}-${new Date().toISOString().split('T')[0]}.html"`)
        .send(html);
    } catch (error) {
      fastify.log.error('Failed to generate printable map:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to generate printable map'
      });
    }
  });

  // Bulk update locker names
  fastify.post('/:kioskId/bulk-update', {
    preHandler: [requirePermission(Permission.MANAGE_LOCKERS), requireCsrfToken()],
    schema: {
      body: {
        type: 'object',
        required: ['nameMapping'],
        properties: {
          nameMapping: {
            type: 'object',
            patternProperties: {
              '^[0-9]+$': { type: 'string', minLength: 1, maxLength: 20 }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { kioskId } = request.params as { kioskId: string };
    const { nameMapping } = request.body as { nameMapping: Record<string, string> };
    const user = (request as any).user as User;

    try {
      // Convert string keys to numbers
      const numericMapping: Record<number, string> = {};
      for (const [lockerId, name] of Object.entries(nameMapping)) {
        numericMapping[parseInt(lockerId)] = name;
      }

      const results = await namingService.bulkUpdateNames(kioskId, numericMapping, user.username);
      
      reply.send({
        success: true,
        message: `Updated ${results.success} locker names successfully`,
        results
      });
    } catch (error) {
      fastify.log.error('Failed to bulk update locker names:', error);
      reply.code(500).send({
        code: 'server_error',
        message: 'Failed to bulk update locker names'
      });
    }
  });
}

function generatePrintableMapHTML(printableMap: any): string {
  const { kiosk_id, generated_at, lockers } = printableMap;
  
  // Sort lockers by ID for consistent layout
  const sortedLockers = lockers.sort((a: any, b: any) => a.id - b.id);
  
  // Calculate grid layout (4 columns)
  const cols = 4;
  const rows = Math.ceil(sortedLockers.length / cols);
  
  let gridHTML = '';
  for (let row = 0; row < rows; row++) {
    gridHTML += '<tr>';
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const locker = sortedLockers[index];
      
      if (locker) {
        gridHTML += `
          <td class="locker-cell">
            <div class="locker-number">${locker.id}</div>
            <div class="locker-name">${locker.display_name}</div>
            <div class="locker-relay">Röle: ${locker.relay_number}</div>
          </td>
        `;
      } else {
        gridHTML += '<td class="locker-cell empty"></td>';
      }
    }
    gridHTML += '</tr>';
  }

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dolap Haritası - ${kiosk_id}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          background: white;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #333;
          padding-bottom: 20px;
        }
        
        .header h1 {
          margin: 0;
          color: #333;
          font-size: 2rem;
        }
        
        .header .info {
          margin-top: 10px;
          color: #666;
          font-size: 1rem;
        }
        
        .locker-grid {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        
        .locker-cell {
          border: 2px solid #333;
          padding: 15px;
          text-align: center;
          width: 25%;
          height: 120px;
          vertical-align: middle;
          background: #f8f9fa;
        }
        
        .locker-cell.empty {
          background: #e9ecef;
          border-style: dashed;
          border-color: #ccc;
        }
        
        .locker-number {
          font-size: 1.5rem;
          font-weight: bold;
          color: #007bff;
          margin-bottom: 5px;
        }
        
        .locker-name {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
          margin-bottom: 5px;
          word-wrap: break-word;
        }
        
        .locker-relay {
          font-size: 0.9rem;
          color: #666;
        }
        
        .footer {
          margin-top: 30px;
          text-align: center;
          color: #666;
          font-size: 0.9rem;
          border-top: 1px solid #ddd;
          padding-top: 20px;
        }
        
        .print-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 1rem;
          margin: 20px 0;
        }
        
        .print-button:hover {
          background: #0056b3;
        }
        
        .legend {
          margin: 20px 0;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 5px;
          border: 1px solid #ddd;
        }
        
        .legend h3 {
          margin-top: 0;
          color: #333;
        }
        
        .legend-item {
          margin: 5px 0;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Dolap Haritası</h1>
        <div class="info">
          <strong>Kiosk:</strong> ${kiosk_id} | 
          <strong>Oluşturulma:</strong> ${new Date(generated_at).toLocaleString('tr-TR')} |
          <strong>Toplam Dolap:</strong> ${lockers.length}
        </div>
      </div>
      
      <button class="print-button no-print" onclick="window.print()">🖨️ Yazdır</button>
      
      <div class="legend no-print">
        <h3>Açıklamalar</h3>
        <div class="legend-item">• <strong>Dolap Numarası:</strong> Sistem içindeki dolap ID'si</div>
        <div class="legend-item">• <strong>Dolap Adı:</strong> Özel atanmış isim veya varsayılan isim</div>
        <div class="legend-item">• <strong>Röle:</strong> Donanım röle numarası</div>
      </div>
      
      <table class="locker-grid">
        ${gridHTML}
      </table>
      
      <div class="footer">
        <p>Bu harita ${new Date(generated_at).toLocaleString('tr-TR')} tarihinde oluşturulmuştur.</p>
        <p>Kurulum sırasında dolap konumlarını bu haritaya göre etiketleyiniz.</p>
      </div>
    </body>
    </html>
  `;
}