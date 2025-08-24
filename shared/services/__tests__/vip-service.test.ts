import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Database } from 'sqlite3';
import { VipService, CreateVipContract, RenewContractRequest, CancelContractRequest } from '../vip-service';
import { ContractRepository } from '../../data/contract-repository';
import { PaymentRepository } from '../../data/payment-repository';

// Mock the repositories
vi.mock('../../data/contract-repository');
vi.mock('../../data/payment-repository');

describe('VipService', () => {
  let vipService: VipService;
  let mockDb: Database;
  let mockContractRepo: vi.Mocked<ContractRepository>;
  let mockPaymentRepo: vi.Mocked<PaymentRepository>;

  beforeEach(() => {
    mockDb = {} as Database;
    mockContractRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByRfidCard: vi.fn(),
      findByPhone: vi.fn(),
      findActive: vi.fn(),
      findActiveWithPayments: vi.fn(),
      findExpiring: vi.fn(),
      update: vi.fn(),
      isLockerAvailable: vi.fn(),
      isRfidCardAvailable: vi.fn(),
      getStatistics: vi.fn()
    } as any;

    mockPaymentRepo = {
      create: vi.fn(),
      findByContractId: vi.fn(),
      findAllWithDetails: vi.fn(),
      getContractPaymentSummary: vi.fn(),
      getStatistics: vi.fn()
    } as any;

    // Mock the constructors
    vi.mocked(ContractRepository).mockImplementation(() => mockContractRepo);
    vi.mocked(PaymentRepository).mockImplementation(() => mockPaymentRepo);

    vipService = new VipService(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getVipPlans', () => {
    it('should return all available VIP plans', () => {
      const plans = vipService.getVipPlans();
      
      expect(plans).toHaveLength(3);
      expect(plans.map(p => p.id)).toEqual(['basic', 'premium', 'executive']);
      expect(plans[0]).toMatchObject({
        id: 'basic',
        name: 'Basic VIP',
        basePrice: 50.00,
        minDuration: 1,
        maxDuration: 12
      });
    });
  });

  describe('getVipPlan', () => {
    it('should return specific plan by ID', () => {
      const plan = vipService.getVipPlan('premium');
      
      expect(plan).toMatchObject({
        id: 'premium',
        name: 'Premium VIP',
        basePrice: 75.00,
        minDuration: 3,
        maxDuration: 24
      });
    });

    it('should return null for invalid plan ID', () => {
      const plan = vipService.getVipPlan('invalid');
      expect(plan).toBeNull();
    });
  });

  describe('calculateContractValue', () => {
    it('should calculate basic plan value without discount', async () => {
      const value = await vipService.calculateContractValue('basic', 3);
      expect(value).toBe(150.00); // 50 * 3
    });

    it('should apply 5% discount for 6+ months', async () => {
      const value = await vipService.calculateContractValue('premium', 6);
      expect(value).toBe(427.50); // 75 * 6 * 0.95
    });

    it('should apply 10% discount for 12+ months', async () => {
      const value = await vipService.calculateContractValue('executive', 12);
      expect(value).toBe(1080.00); // 100 * 12 * 0.90
    });

    it('should throw error for invalid plan', async () => {
      await expect(vipService.calculateContractValue('invalid' as any, 6))
        .rejects.toThrow('Invalid VIP plan: invalid');
    });
  });

  describe('validateContractCreation', () => {
    const validRequest: CreateVipContract = {
      member_name: 'John Doe',
      phone: '+1234567890',
      email: 'john@example.com',
      plan: 'basic',
      duration_months: 6,
      start_at: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
      created_by: 'staff1',
      kiosk_id: 'kiosk1',
      locker_id: 1,
      rfid_card: 'CARD123'
    };

    beforeEach(() => {
      mockContractRepo.isLockerAvailable.mockResolvedValue(true);
      mockContractRepo.isRfidCardAvailable.mockResolvedValue(true);
      mockContractRepo.findByPhone.mockResolvedValue([]);
    });

    it('should validate a valid contract request', async () => {
      const result = await vipService.validateContractCreation(validRequest);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid plan', async () => {
      const request = { ...validRequest, plan: 'invalid' as any };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid VIP plan: invalid');
    });

    it('should reject duration below minimum', async () => {
      const request = { ...validRequest, plan: 'premium', duration_months: 1 };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duration must be at least 3 months for Premium VIP');
    });

    it('should reject duration above maximum', async () => {
      const request = { ...validRequest, duration_months: 50 };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duration cannot exceed 12 months for Basic VIP');
    });

    it('should reject short member name', async () => {
      const request = { ...validRequest, member_name: 'A' };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Member name must be at least 2 characters');
    });

    it('should reject invalid phone number', async () => {
      const request = { ...validRequest, phone: '123' };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Valid phone number is required');
    });

    it('should reject invalid email format', async () => {
      const request = { ...validRequest, email: 'invalid-email' };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject past start date', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const request = { ...validRequest, start_at: yesterday };
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Start date cannot be in the past');
    });

    it('should reject unavailable locker', async () => {
      mockContractRepo.isLockerAvailable.mockResolvedValue(false);
      const result = await vipService.validateContractCreation(validRequest);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Locker 1 in kiosk kiosk1 is already assigned');
    });

    it('should reject unavailable RFID card', async () => {
      mockContractRepo.isRfidCardAvailable.mockResolvedValue(false);
      const result = await vipService.validateContractCreation(validRequest);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('RFID card CARD123 is already in use');
    });

    it('should warn about existing active contracts', async () => {
      mockContractRepo.findByPhone.mockResolvedValue([
        { id: 1, status: 'active' } as any,
        { id: 2, status: 'expired' } as any
      ]);
      
      const result = await vipService.validateContractCreation(validRequest);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Member already has 1 active contract(s)');
    });

    it('should validate initial payment amount', async () => {
      const request = {
        ...validRequest,
        initial_payment: { amount: -10, method: 'cash' as const }
      };
      
      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Initial payment amount must be greater than 0');
    });
  });

  describe('createContract', () => {
    const validRequest: CreateVipContract = {
      member_name: 'John Doe',
      phone: '+1234567890',
      plan: 'basic',
      duration_months: 6,
      start_at: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      created_by: 'staff1',
      kiosk_id: 'kiosk1',
      locker_id: 1,
      rfid_card: 'CARD123'
    };

    beforeEach(() => {
      mockContractRepo.isLockerAvailable.mockResolvedValue(true);
      mockContractRepo.isRfidCardAvailable.mockResolvedValue(true);
      mockContractRepo.findByPhone.mockResolvedValue([]);
      mockContractRepo.create.mockResolvedValue({
        id: 1,
        ...validRequest,
        price: 285,
        status: 'active',
        created_at: new Date().toISOString()
      } as any);
    });

    it('should create contract successfully', async () => {
      const contract = await vipService.createContract(validRequest);
      
      expect(mockContractRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          member_name: 'John Doe',
          phone: '+1234567890',
          plan: 'basic',
          price: 285, // 50 * 6 * 0.95 (5% discount for 6+ months)
          kiosk_id: 'kiosk1',
          locker_id: 1,
          rfid_card: 'CARD123'
        })
      );
      expect(contract.id).toBe(1);
    });

    it('should create contract with initial payment', async () => {
      const requestWithPayment = {
        ...validRequest,
        initial_payment: {
          amount: 150,
          method: 'card' as const,
          reference: 'REF123'
        }
      };

      await vipService.createContract(requestWithPayment);
      
      expect(mockPaymentRepo.create).toHaveBeenCalledWith({
        contract_id: 1,
        amount: 150,
        method: 'card',
        reference: 'REF123',
        notes: undefined,
        created_by: 'staff1'
      });
    });

    it('should throw error for invalid request', async () => {
      const invalidRequest = { ...validRequest, member_name: '' };
      
      await expect(vipService.createContract(invalidRequest))
        .rejects.toThrow('Contract validation failed');
    });
  });

  describe('renewContract', () => {
    const mockContract = {
      id: 1,
      member_name: 'John Doe',
      plan: 'basic',
      price: 300,
      end_at: '2024-12-31',
      status: 'active'
    } as any;

    beforeEach(() => {
      mockContractRepo.findById.mockResolvedValue(mockContract);
      mockContractRepo.update.mockResolvedValue({ ...mockContract, price: 585 });
    });

    it('should renew contract successfully', async () => {
      const renewRequest: RenewContractRequest = {
        duration_months: 6,
        payment: {
          amount: 300,
          method: 'cash'
        }
      };

      const renewed = await vipService.renewContract(1, renewRequest);
      
      expect(mockContractRepo.update).toHaveBeenCalledWith(1, 
        expect.objectContaining({
          end_at: '2025-07-01', // 6 months from 2024-12-31 (actual calculation)
          price: 585, // 300 + 285 (with 5% discount)
          status: 'active'
        })
      );
      expect(mockPaymentRepo.create).toHaveBeenCalled();
    });

    it('should throw error for non-existent contract', async () => {
      mockContractRepo.findById.mockResolvedValue(null);
      
      await expect(vipService.renewContract(999, { duration_months: 6 }))
        .rejects.toThrow('Contract 999 not found');
    });

    it('should throw error for non-active contract', async () => {
      mockContractRepo.findById.mockResolvedValue({ ...mockContract, status: 'expired' });
      
      await expect(vipService.renewContract(1, { duration_months: 6 }))
        .rejects.toThrow('Cannot renew contract with status: expired');
    });

    it('should validate duration limits', async () => {
      const renewRequest: RenewContractRequest = {
        duration_months: 50 // Exceeds basic plan maximum
      };

      await expect(vipService.renewContract(1, renewRequest))
        .rejects.toThrow('Duration must be between 1 and 12 months for Basic VIP');
    });
  });

  describe('cancelContract', () => {
    const mockContract = {
      id: 1,
      member_name: 'John Doe',
      status: 'active',
      notes: 'Original notes'
    } as any;

    beforeEach(() => {
      mockContractRepo.findById.mockResolvedValue(mockContract);
      mockContractRepo.update.mockResolvedValue({ ...mockContract, status: 'cancelled' });
    });

    it('should cancel contract successfully', async () => {
      const cancelRequest: CancelContractRequest = {
        reason: 'Member request'
      };

      const cancelled = await vipService.cancelContract(1, cancelRequest);
      
      expect(mockContractRepo.update).toHaveBeenCalledWith(1, {
        status: 'cancelled',
        notes: 'Original notes\nCancelled: Member request'
      });
    });

    it('should process refund when provided', async () => {
      const cancelRequest: CancelContractRequest = {
        reason: 'Service issue',
        refund_amount: 100,
        refund_method: 'card'
      };

      await vipService.cancelContract(1, cancelRequest);
      
      expect(mockPaymentRepo.create).toHaveBeenCalledWith({
        contract_id: 1,
        amount: -100, // Negative for refund
        method: 'card',
        reference: undefined,
        notes: 'Refund - Service issue',
        created_by: 'system'
      });
    });

    it('should throw error for non-active contract', async () => {
      mockContractRepo.findById.mockResolvedValue({ ...mockContract, status: 'cancelled' });
      
      await expect(vipService.cancelContract(1, { reason: 'Test' }))
        .rejects.toThrow('Cannot cancel contract with status: cancelled');
    });
  });

  describe('updateExpiredContracts', () => {
    it('should update expired contracts', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      
      mockContractRepo.findActive.mockResolvedValue([
        { id: 1, end_at: yesterday, status: 'active' } as any, // Expired
        { id: 2, end_at: today, status: 'active' } as any, // Expired (end_at <= today)
        { id: 3, end_at: tomorrow, status: 'active' } as any // Future - not expired
      ]);

      const updatedCount = await vipService.updateExpiredContracts();
      
      expect(updatedCount).toBe(2);
      expect(mockContractRepo.update).toHaveBeenCalledWith(1, { status: 'expired' });
      expect(mockContractRepo.update).toHaveBeenCalledWith(2, { status: 'expired' });
      expect(mockContractRepo.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('getContractStatistics', () => {
    beforeEach(() => {
      mockContractRepo.getStatistics.mockResolvedValue({
        total: 100,
        active: 80,
        expired: 15,
        cancelled: 5,
        expiring_soon: 10,
        by_plan: { basic: 30, premium: 35, executive: 15 }
      });

      mockPaymentRepo.getStatistics.mockResolvedValue({
        total_amount: 50000,
        this_month: { amount: 5000 },
        total_payments: 200,
        average_payment: 250,
        by_method: {},
        today: { count: 0, amount: 0 },
        this_week: { count: 0, amount: 0 }
      });

      mockContractRepo.findActiveWithPayments.mockResolvedValue([
        { plan: 'basic', total_paid: 1000 } as any,
        { plan: 'premium', total_paid: 2000 } as any,
        { plan: 'executive', total_paid: 3000 } as any
      ]);
    });

    it('should return comprehensive statistics', async () => {
      const stats = await vipService.getContractStatistics();
      
      expect(stats).toMatchObject({
        total_contracts: 100,
        active_contracts: 80,
        expired_contracts: 15,
        cancelled_contracts: 5,
        expiring_soon: 10,
        revenue: {
          total: 50000,
          this_month: 5000
        },
        by_plan: {
          basic: { count: 30, revenue: 1000 },
          premium: { count: 35, revenue: 2000 },
          executive: { count: 15, revenue: 3000 }
        }
      });
    });
  });

  describe('business rule validation', () => {
    it('should enforce maximum contracts per phone', async () => {
      const request: CreateVipContract = {
        member_name: 'John Doe',
        phone: '+1234567890',
        plan: 'basic',
        duration_months: 6,
        start_at: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        created_by: 'staff1',
        kiosk_id: 'kiosk1',
        locker_id: 1,
        rfid_card: 'CARD123'
      };

      // Mock 3 active contracts for the same phone (this should trigger the business rule)
      mockContractRepo.findByPhone.mockResolvedValue([
        { status: 'active' } as any,
        { status: 'active' } as any,
        { status: 'active' } as any
      ]);
      mockContractRepo.isLockerAvailable.mockResolvedValue(true);
      mockContractRepo.isRfidCardAvailable.mockResolvedValue(true);

      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Maximum 3 active contracts allowed per phone number');
    });

    it('should warn about future start dates', async () => {
      const futureDate = new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0]; // 45 days
      const request: CreateVipContract = {
        member_name: 'John Doe',
        phone: '+1234567890',
        plan: 'basic',
        duration_months: 6,
        start_at: futureDate,
        created_by: 'staff1',
        kiosk_id: 'kiosk1',
        locker_id: 1,
        rfid_card: 'CARD123'
      };

      mockContractRepo.isLockerAvailable.mockResolvedValue(true);
      mockContractRepo.isRfidCardAvailable.mockResolvedValue(true);
      mockContractRepo.findByPhone.mockResolvedValue([]);

      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Contract start date is more than 30 days in the future');
    });

    it('should enforce executive plan minimum duration', async () => {
      const request: CreateVipContract = {
        member_name: 'John Doe',
        phone: '+1234567890',
        plan: 'executive',
        duration_months: 3, // Below minimum of 6
        start_at: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        created_by: 'staff1',
        kiosk_id: 'kiosk1',
        locker_id: 1,
        rfid_card: 'CARD123'
      };

      mockContractRepo.isLockerAvailable.mockResolvedValue(true);
      mockContractRepo.isRfidCardAvailable.mockResolvedValue(true);
      mockContractRepo.findByPhone.mockResolvedValue([]);

      const result = await vipService.validateContractCreation(request);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Executive plans require minimum 6 months duration');
    });
  });
});