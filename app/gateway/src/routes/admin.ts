/**
 * Admin Routes for Gateway Service
 * Provides administrative locker control endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface AdminLockerOpenRequest {
  Body: {
    staff_user: string;
    reason?: string;
  };
}

interface AdminBulkOpenRequest {
  Body: {
    locker_ids: number[];
    staff_user: string;
    reason?: string;
    exclude_vip?: boolean;
  };
}

export async function registerAdminRoutes(fastify: FastifyInstance) {
  
  // Open single locker (admin)
  fastify.post('/api/admin/lockers/:lockerId/open', async (
    request: FastifyRequest<{
      Params: { lockerId: string };
      Body: AdminLockerOpenRequest['Body'];
    }>,
    reply: FastifyReply
  ) => {
    try {
      const lockerId = parseInt(request.params.lockerId);
      const { staff_user, reason } = request.body;

      if (!lockerId || lockerId < 1 || lockerId > 30) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid locker ID. Must be between 1 and 30.'
        });
      }

      if (!staff_user) {
        return reply.status(400).send({
          success: false,
          error: 'staff_user is required'
        });
      }

      console.log(`🔓 Admin opening locker ${lockerId} by ${staff_user}`);

      // For now, send a direct request to the Kiosk service
      try {
        const kioskUrl = process.env.KIOSK_URL || 'http://localhost:3002';
        const response = await fetch(`${kioskUrl}/api/locker/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            locker_id: lockerId,
            staff_user,
            reason: reason || 'Admin panel access'
          })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          return reply.send({
            success: true,
            message: `Locker ${lockerId} opened successfully`,
            locker_id: lockerId,
            staff_user,
            reason,
            timestamp: new Date().toISOString()
          });
        } else {
          throw new Error(result.error || 'Kiosk service error');
        }
      } catch (kioskError) {
        console.error('❌ Failed to communicate with Kiosk service:', kioskError);
        return reply.status(500).send({
          success: false,
          error: 'Failed to communicate with Kiosk service',
          details: kioskError instanceof Error ? kioskError.message : String(kioskError)
        });
      }

    } catch (error) {
      console.error('❌ Admin locker open error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Bulk open lockers (admin)
  fastify.post('/api/admin/lockers/bulk-open', async (
    request: FastifyRequest<AdminBulkOpenRequest>,
    reply: FastifyReply
  ) => {
    try {
      const { locker_ids, staff_user, reason, exclude_vip = false } = request.body;

      if (!locker_ids || !Array.isArray(locker_ids) || locker_ids.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'locker_ids must be a non-empty array'
        });
      }

      if (!staff_user) {
        return reply.status(400).send({
          success: false,
          error: 'staff_user is required'
        });
      }

      // Validate locker IDs
      const invalidIds = locker_ids.filter(id => id < 1 || id > 30);
      if (invalidIds.length > 0) {
        return reply.status(400).send({
          success: false,
          error: `Invalid locker IDs: ${invalidIds.join(', ')}. Must be between 1 and 30.`
        });
      }

      console.log(`🔓 Admin bulk opening ${locker_ids.length} lockers by ${staff_user}`);

      // For now, send individual requests to Kiosk service
      const results = [];
      const kioskUrl = process.env.KIOSK_URL || 'http://localhost:3002';

      for (const lockerId of locker_ids) {
        try {
          const response = await fetch(`${kioskUrl}/api/locker/open`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              locker_id: lockerId,
              staff_user,
              reason: reason || 'Admin bulk operation'
            })
          });

          const result = await response.json();
          results.push({
            locker_id: lockerId,
            success: response.ok && result.success,
            error: result.error || null
          });

          // Small delay between requests to avoid overwhelming the Kiosk
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          results.push({
            locker_id: lockerId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return reply.send({
        success: failed === 0,
        message: `Bulk operation completed: ${successful} successful, ${failed} failed`,
        results,
        locker_ids,
        staff_user,
        reason,
        exclude_vip,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Admin bulk open error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get locker status (admin)
  fastify.get('/api/admin/lockers/:lockerId/status', async (
    request: FastifyRequest<{ Params: { lockerId: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const lockerId = parseInt(request.params.lockerId);

      if (!lockerId || lockerId < 1 || lockerId > 30) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid locker ID. Must be between 1 and 30.'
        });
      }

      // For now, return basic status
      // In a full implementation, this would check actual locker state
      return reply.send({
        success: true,
        locker_id: lockerId,
        status: 'available', // This would be dynamic in real implementation
        last_accessed: null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Admin locker status error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  console.log('✅ Admin routes registered');
}