import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VipService, CreateVipContract, RenewContractRequest, CancelContractRequest } from '@eform/shared/services/vip-service';
import { Database } from 'sqlite3';

interface VipRouteOptions {
  database: Database;
}

interface CreateContractBody extends CreateVipContract {}

interface RenewContractBody extends RenewContractRequest {}

interface CancelContractBody extends CancelContractRequest {}

interface ContractParams {
  id: string;
}

interface PaymentBody {
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'other';
  reference?: string;
  notes?: string;
}

interface LockerAvailabilityQuery {
  kiosk_id?: string;
}

export async function vipRoutes(fastify: FastifyInstance, options: VipRouteOptions) {
  const vipService = new VipService(options.database);

  // Get VIP plans
  fastify.get('/plans', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const plans = vipService.getVipPlans();
      return { success: true, data: plans };
    } catch (error) {
      fastify.log.error('Failed to get VIP plans:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get VIP plans'
      });
    }
  });

  // Calculate contract value
  fastify.post('/calculate-price', async (request: FastifyRequest<{
    Body: { plan: 'basic' | 'premium' | 'executive'; duration: number }
  }>, reply: FastifyReply) => {
    try {
      const { plan, duration } = request.body;
      
      if (!plan || !duration || duration <= 0) {
        return reply.status(400).send({
          success: false,
          error: 'Plan and duration are required'
        });
      }

      const price = await vipService.calculateContractValue(plan, duration);
      return { success: true, data: { price } };
    } catch (error) {
      fastify.log.error('Failed to calculate contract price:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to calculate contract price'
      });
    }
  });

  // Check locker availability
  fastify.get('/lockers/available', async (request: FastifyRequest<{
    Querystring: LockerAvailabilityQuery
  }>, reply: FastifyReply) => {
    try {
      // This is a simplified implementation - in a real system you'd query the locker service
      // For now, return mock available lockers
      const availableLockers = [
        { kiosk_id: 'kiosk-1', locker_id: 1, size: 'small' },
        { kiosk_id: 'kiosk-1', locker_id: 2, size: 'medium' },
        { kiosk_id: 'kiosk-1', locker_id: 3, size: 'large' },
        { kiosk_id: 'kiosk-2', locker_id: 1, size: 'small' },
        { kiosk_id: 'kiosk-2', locker_id: 2, size: 'medium' },
      ];

      const { kiosk_id } = request.query;
      const filtered = kiosk_id 
        ? availableLockers.filter(l => l.kiosk_id === kiosk_id)
        : availableLockers;

      return { success: true, data: filtered };
    } catch (error) {
      fastify.log.error('Failed to get available lockers:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get available lockers'
      });
    }
  });

  // Create VIP contract
  fastify.post('/', async (request: FastifyRequest<{
    Body: CreateContractBody
  }>, reply: FastifyReply) => {
    try {
      const contractData = request.body;
      
      // Add created_by from session (simplified - in real app get from auth context)
      contractData.created_by = 'admin'; // TODO: Get from authenticated user

      const contract = await vipService.createContract(contractData);
      
      fastify.log.info(`VIP contract created: ${contract.id}`);
      return { success: true, data: contract };
    } catch (error) {
      fastify.log.error('Failed to create VIP contract:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create VIP contract'
      });
    }
  });

  // Get contract by ID
  fastify.get('/:id', async (request: FastifyRequest<{
    Params: ContractParams
  }>, reply: FastifyReply) => {
    try {
      const contractId = parseInt(request.params.id);
      if (isNaN(contractId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid contract ID'
        });
      }

      const contract = await vipService.getContract(contractId);
      if (!contract) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      return { success: true, data: contract };
    } catch (error) {
      fastify.log.error('Failed to get contract:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get contract'
      });
    }
  });

  // Get all active contracts
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const contracts = await vipService.getActiveContractsWithPayments();
      return { success: true, data: contracts };
    } catch (error) {
      fastify.log.error('Failed to get contracts:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get contracts'
      });
    }
  });

  // Renew contract
  fastify.post('/:id/renew', async (request: FastifyRequest<{
    Params: ContractParams;
    Body: RenewContractBody;
  }>, reply: FastifyReply) => {
    try {
      const contractId = parseInt(request.params.id);
      if (isNaN(contractId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid contract ID'
        });
      }

      const renewalData = request.body;
      const contract = await vipService.renewContract(contractId, renewalData);
      
      fastify.log.info(`VIP contract renewed: ${contractId}`);
      return { success: true, data: contract };
    } catch (error) {
      fastify.log.error('Failed to renew contract:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to renew contract'
      });
    }
  });

  // Cancel contract
  fastify.post('/:id/cancel', async (request: FastifyRequest<{
    Params: ContractParams;
    Body: CancelContractBody;
  }>, reply: FastifyReply) => {
    try {
      const contractId = parseInt(request.params.id);
      if (isNaN(contractId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid contract ID'
        });
      }

      const cancellationData = request.body;
      const contract = await vipService.cancelContract(contractId, cancellationData);
      
      fastify.log.info(`VIP contract cancelled: ${contractId}`);
      return { success: true, data: contract };
    } catch (error) {
      fastify.log.error('Failed to cancel contract:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel contract'
      });
    }
  });

  // Add payment to contract
  fastify.post('/:id/payments', async (request: FastifyRequest<{
    Params: ContractParams;
    Body: PaymentBody;
  }>, reply: FastifyReply) => {
    try {
      const contractId = parseInt(request.params.id);
      if (isNaN(contractId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid contract ID'
        });
      }

      const paymentData = {
        ...request.body,
        contract_id: contractId,
        created_by: 'admin' // TODO: Get from authenticated user
      };

      const payment = await vipService.recordPayment(paymentData);
      
      fastify.log.info(`Payment recorded for contract ${contractId}: ${payment.id}`);
      return { success: true, data: payment };
    } catch (error) {
      fastify.log.error('Failed to record payment:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record payment'
      });
    }
  });

  // Get contract payments
  fastify.get('/:id/payments', async (request: FastifyRequest<{
    Params: ContractParams
  }>, reply: FastifyReply) => {
    try {
      const contractId = parseInt(request.params.id);
      if (isNaN(contractId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid contract ID'
        });
      }

      const payments = await vipService.getContractPayments(contractId);
      return { success: true, data: payments };
    } catch (error) {
      fastify.log.error('Failed to get contract payments:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get contract payments'
      });
    }
  });

  // Generate contract PDF
  fastify.get('/:id/pdf', async (request: FastifyRequest<{
    Params: ContractParams;
    Querystring: { 
      download?: string;
      includePayments?: string;
      includeTerms?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const contractId = parseInt(request.params.id);
      if (isNaN(contractId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid contract ID'
        });
      }

      // Get contract to use in filename
      const contract = await vipService.getContract(contractId);
      if (!contract) {
        return reply.status(404).send({
          success: false,
          error: 'Contract not found'
        });
      }

      // Parse options from query parameters
      const options = {
        includePayments: request.query.includePayments !== 'false',
        includeTerms: request.query.includeTerms !== 'false'
      };

      // Generate PDF
      const pdfBuffer = await vipService.generateContractPDF(contractId, options);
      
      // Set appropriate headers
      const filename = `contract-${contractId}-${contract.member_name.replace(/\s+/g, '-')}.pdf`;
      const isDownload = request.query.download === 'true';
      
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', pdfBuffer.length);
      
      if (isDownload) {
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        reply.header('Content-Disposition', `inline; filename="${filename}"`);
      }

      fastify.log.info(`Generated PDF for contract ${contractId}: ${filename}`);
      return reply.send(pdfBuffer);
    } catch (error) {
      fastify.log.error('Failed to generate contract PDF:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate contract PDF'
      });
    }
  });

  // Get contract statistics
  fastify.get('/stats/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await vipService.getContractStatistics();
      return { success: true, data: stats };
    } catch (error) {
      fastify.log.error('Failed to get contract statistics:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get contract statistics'
      });
    }
  });
}