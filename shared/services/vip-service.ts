import { Database } from 'sqlite3';
import { ContractRepository, Contract, CreateContractData, UpdateContractData, ContractWithPayments, ExpiringContract } from '../database/contract-repository';
import { PaymentRepository, Payment, CreatePaymentData, PaymentSummary } from '../database/payment-repository';
import { PDFService, ContractPDFData, PDFGenerationOptions } from './pdf-service';

/**
 * VIP Plan definitions with pricing and features
 */
export interface VipPlan {
  id: 'basic' | 'premium' | 'executive';
  name: string;
  description: string;
  basePrice: number; // Monthly base price
  features: string[];
  maxDuration: number; // Maximum contract duration in months
  minDuration: number; // Minimum contract duration in months
}

/**
 * Contract creation request with validation
 */
export interface CreateVipContract {
  member_name: string;
  phone: string;
  email?: string;
  plan: 'basic' | 'premium' | 'executive';
  duration_months: number;
  start_at: string; // ISO date string
  created_by: string;
  kiosk_id: string;
  locker_id: number;
  rfid_card: string;
  backup_card?: string;
  notes?: string;
  initial_payment?: {
    amount: number;
    method: 'cash' | 'card' | 'transfer' | 'other';
    reference?: string;
    notes?: string;
  };
}

/**
 * Contract renewal request
 */
export interface RenewContractRequest {
  duration_months: number;
  new_plan?: 'basic' | 'premium' | 'executive';
  payment?: {
    amount: number;
    method: 'cash' | 'card' | 'transfer' | 'other';
    reference?: string;
    notes?: string;
  };
}

/**
 * Contract cancellation request
 */
export interface CancelContractRequest {
  reason: string;
  refund_amount?: number;
  refund_method?: 'cash' | 'card' | 'transfer' | 'other';
  refund_reference?: string;
  notes?: string;
}

/**
 * Business rule validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Contract statistics
 */
export interface ContractStatistics {
  total_contracts: number;
  active_contracts: number;
  expired_contracts: number;
  cancelled_contracts: number;
  expiring_soon: number;
  revenue: {
    total: number;
    this_month: number;
    last_month: number;
  };
  by_plan: {
    basic: { count: number; revenue: number };
    premium: { count: number; revenue: number };
    executive: { count: number; revenue: number };
  };
}

/**
 * Enhanced VIP Service for contract and payment management
 * Implements business rules, validation, and comprehensive tracking
 */
export class VipService {
  private contractRepo: ContractRepository;
  private paymentRepo: PaymentRepository;
  private pdfService: PDFService;
  private db: Database;

  // VIP Plan definitions
  private readonly VIP_PLANS: Record<string, VipPlan> = {
    basic: {
      id: 'basic',
      name: 'Basic VIP',
      description: 'Standard VIP locker with basic features',
      basePrice: 50.00,
      features: ['Dedicated locker', 'RFID access', 'Basic support'],
      maxDuration: 12,
      minDuration: 1
    },
    premium: {
      id: 'premium',
      name: 'Premium VIP',
      description: 'Enhanced VIP locker with premium features',
      basePrice: 75.00,
      features: ['Dedicated locker', 'RFID access', 'Backup card', 'Priority support', 'Extended hours'],
      maxDuration: 24,
      minDuration: 3
    },
    executive: {
      id: 'executive',
      name: 'Executive VIP',
      description: 'Top-tier VIP locker with all premium features',
      basePrice: 100.00,
      features: ['Dedicated locker', 'RFID access', 'Backup card', 'Priority support', 'Extended hours', 'Concierge service'],
      maxDuration: 36,
      minDuration: 6
    }
  };

  constructor(database: Database) {
    this.db = database;
    this.contractRepo = new ContractRepository(database);
    this.paymentRepo = new PaymentRepository(database);
    this.pdfService = new PDFService();
  }

  /**
   * Get available VIP plans
   */
  getVipPlans(): VipPlan[] {
    return Object.values(this.VIP_PLANS);
  }

  /**
   * Get specific VIP plan by ID
   */
  getVipPlan(planId: string): VipPlan | null {
    return this.VIP_PLANS[planId] || null;
  }

  /**
   * Calculate contract value based on plan and duration
   */
  async calculateContractValue(plan: 'basic' | 'premium' | 'executive', duration: number): Promise<number> {
    const vipPlan = this.VIP_PLANS[plan];
    if (!vipPlan) {
      throw new Error(`Invalid VIP plan: ${plan}`);
    }

    // Apply duration-based discounts
    let discount = 0;
    if (duration >= 12) {
      discount = 0.10; // 10% discount for 12+ months
    } else if (duration >= 6) {
      discount = 0.05; // 5% discount for 6+ months
    }

    const baseTotal = vipPlan.basePrice * duration;
    const discountAmount = baseTotal * discount;
    return Math.round((baseTotal - discountAmount) * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Validate contract creation request
   */
  async validateContractCreation(request: CreateVipContract): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate plan
    const plan = this.VIP_PLANS[request.plan];
    if (!plan) {
      errors.push(`Invalid VIP plan: ${request.plan}`);
    } else {
      // Validate duration
      if (request.duration_months < plan.minDuration) {
        errors.push(`Duration must be at least ${plan.minDuration} months for ${plan.name}`);
      }
      if (request.duration_months > plan.maxDuration) {
        errors.push(`Duration cannot exceed ${plan.maxDuration} months for ${plan.name}`);
      }
    }

    // Validate member information
    if (!request.member_name || request.member_name.trim().length < 2) {
      errors.push('Member name must be at least 2 characters');
    }

    if (!request.phone || !/^\+?[\d\s\-\(\)]{10,}$/.test(request.phone)) {
      errors.push('Valid phone number is required');
    }

    if (request.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) {
      errors.push('Invalid email format');
    }

    // Validate dates
    const startDate = new Date(request.start_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (startDate < today) {
      errors.push('Start date cannot be in the past');
    }

    // Check locker availability
    const isLockerAvailable = await this.contractRepo.isLockerAvailable(request.kiosk_id, request.locker_id);
    if (!isLockerAvailable) {
      errors.push(`Locker ${request.locker_id} in kiosk ${request.kiosk_id} is already assigned`);
    }

    // Check RFID card availability
    const isRfidAvailable = await this.contractRepo.isRfidCardAvailable(request.rfid_card);
    if (!isRfidAvailable) {
      errors.push(`RFID card ${request.rfid_card} is already in use`);
    }

    if (request.backup_card) {
      const isBackupAvailable = await this.contractRepo.isRfidCardAvailable(request.backup_card);
      if (!isBackupAvailable) {
        errors.push(`Backup RFID card ${request.backup_card} is already in use`);
      }
    }

    // Check for existing contracts with same phone
    const existingContracts = await this.contractRepo.findByPhone(request.phone);
    const activeContracts = existingContracts.filter(c => c.status === 'active');
    if (activeContracts.length > 0) {
      warnings.push(`Member already has ${activeContracts.length} active contract(s)`);
    }

    // Validate initial payment if provided
    if (request.initial_payment) {
      if (request.initial_payment.amount <= 0) {
        errors.push('Initial payment amount must be greater than 0');
      }
      
      const expectedAmount = await this.calculateContractValue(request.plan, request.duration_months);
      if (request.initial_payment.amount > expectedAmount) {
        warnings.push(`Initial payment (${request.initial_payment.amount}) exceeds contract value (${expectedAmount})`);
      }
    }

    // Apply business rules validation
    const businessRules = await this.validateBusinessRules(request);
    errors.push(...businessRules.errors);
    warnings.push(...businessRules.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a new VIP contract with optional initial payment
   */
  async createContract(request: CreateVipContract): Promise<Contract> {
    // Validate the request
    const validation = await this.validateContractCreation(request);
    if (!validation.valid) {
      throw new Error(`Contract validation failed: ${validation.errors.join(', ')}`);
    }

    // Calculate contract price
    const contractPrice = await this.calculateContractValue(request.plan, request.duration_months);

    // Calculate end date
    const startDate = new Date(request.start_at);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + request.duration_months);

    // Create contract data
    const contractData: CreateContractData = {
      member_name: request.member_name,
      phone: request.phone,
      email: request.email,
      plan: request.plan,
      price: contractPrice,
      start_at: request.start_at,
      end_at: endDate.toISOString().split('T')[0], // YYYY-MM-DD format
      created_by: request.created_by,
      kiosk_id: request.kiosk_id,
      locker_id: request.locker_id,
      rfid_card: request.rfid_card,
      backup_card: request.backup_card,
      notes: request.notes
    };

    // Create the contract
    const contract = await this.contractRepo.create(contractData);

    // Record initial payment if provided
    if (request.initial_payment && contract.id) {
      const paymentData: CreatePaymentData = {
        contract_id: contract.id,
        amount: request.initial_payment.amount,
        method: request.initial_payment.method,
        reference: request.initial_payment.reference,
        notes: request.initial_payment.notes,
        created_by: request.created_by
      };

      await this.paymentRepo.create(paymentData);
    }

    return contract;
  }

  /**
   * Renew an existing contract
   */
  async renewContract(contractId: number, request: RenewContractRequest): Promise<Contract> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    if (contract.status !== 'active') {
      throw new Error(`Cannot renew contract with status: ${contract.status}`);
    }

    // Validate new plan if provided
    const newPlan = request.new_plan || contract.plan;
    const plan = this.VIP_PLANS[newPlan];
    if (!plan) {
      throw new Error(`Invalid VIP plan: ${newPlan}`);
    }

    // Validate duration
    if (request.duration_months < plan.minDuration || request.duration_months > plan.maxDuration) {
      throw new Error(`Duration must be between ${plan.minDuration} and ${plan.maxDuration} months for ${plan.name}`);
    }

    // Calculate new end date (extend from current end date)
    const currentEndDate = new Date(contract.end_at);
    const newEndDate = new Date(currentEndDate);
    newEndDate.setMonth(newEndDate.getMonth() + request.duration_months);

    // Calculate renewal price
    const renewalPrice = await this.calculateContractValue(newPlan, request.duration_months);

    // Update contract
    const updateData: UpdateContractData = {
      plan: newPlan,
      end_at: newEndDate.toISOString().split('T')[0],
      price: contract.price + renewalPrice, // Add to existing price
      status: 'active'
    };

    const updatedContract = await this.contractRepo.update(contractId, updateData);
    if (!updatedContract) {
      throw new Error('Failed to update contract');
    }

    // Record renewal payment if provided
    if (request.payment) {
      const paymentData: CreatePaymentData = {
        contract_id: contractId,
        amount: request.payment.amount,
        method: request.payment.method,
        reference: request.payment.reference,
        notes: `Renewal payment - ${request.payment.notes || ''}`.trim(),
        created_by: 'system' // TODO: Get from context
      };

      await this.paymentRepo.create(paymentData);
    }

    return updatedContract;
  }

  /**
   * Cancel a contract
   */
  async cancelContract(contractId: number, request: CancelContractRequest): Promise<Contract> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    if (contract.status !== 'active') {
      throw new Error(`Cannot cancel contract with status: ${contract.status}`);
    }

    // Update contract status
    const updateData: UpdateContractData = {
      status: 'cancelled',
      notes: `${contract.notes || ''}\nCancelled: ${request.reason}`.trim()
    };

    const updatedContract = await this.contractRepo.update(contractId, updateData);
    if (!updatedContract) {
      throw new Error('Failed to cancel contract');
    }

    // Record refund payment if provided
    if (request.refund_amount && request.refund_amount > 0) {
      const paymentData: CreatePaymentData = {
        contract_id: contractId,
        amount: -request.refund_amount, // Negative amount for refund
        method: request.refund_method || 'cash',
        reference: request.refund_reference,
        notes: `Refund - ${request.notes || request.reason}`.trim(),
        created_by: 'system' // TODO: Get from context
      };

      await this.paymentRepo.create(paymentData);
    }

    return updatedContract;
  }

  /**
   * Get all active contracts
   */
  async getActiveContracts(): Promise<Contract[]> {
    return this.contractRepo.findActive();
  }

  /**
   * Get active contracts with payment information
   */
  async getActiveContractsWithPayments(): Promise<ContractWithPayments[]> {
    return this.contractRepo.findActiveWithPayments();
  }

  /**
   * Get contracts expiring within specified days
   */
  async getExpiringContracts(days: number = 30): Promise<ExpiringContract[]> {
    return this.contractRepo.findExpiring(days);
  }

  /**
   * Record a payment for a contract
   */
  async recordPayment(payment: CreatePaymentData): Promise<Payment> {
    // Validate contract exists and is active
    const contract = await this.contractRepo.findById(payment.contract_id);
    if (!contract) {
      throw new Error(`Contract ${payment.contract_id} not found`);
    }

    if (payment.amount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    return this.paymentRepo.create(payment);
  }

  /**
   * Get all payments for a contract
   */
  async getContractPayments(contractId: number): Promise<Payment[]> {
    return this.paymentRepo.findByContractId(contractId);
  }

  /**
   * Get payment history with optional contract filter
   */
  async getPaymentHistory(contractId?: number): Promise<Payment[]> {
    if (contractId) {
      return this.paymentRepo.findByContractId(contractId);
    }
    return this.paymentRepo.findAllWithDetails();
  }

  /**
   * Get payment summary for a contract
   */
  async getContractPaymentSummary(contractId: number): Promise<PaymentSummary | null> {
    return this.paymentRepo.getContractPaymentSummary(contractId);
  }

  /**
   * Get contract by ID
   */
  async getContract(contractId: number): Promise<Contract | null> {
    return this.contractRepo.findById(contractId);
  }

  /**
   * Get contract by RFID card
   */
  async getContractByRfidCard(rfidCard: string): Promise<Contract | null> {
    return this.contractRepo.findByRfidCard(rfidCard);
  }

  /**
   * Get contracts by member phone
   */
  async getContractsByPhone(phone: string): Promise<Contract[]> {
    return this.contractRepo.findByPhone(phone);
  }

  /**
   * Check contract status and handle expiration
   */
  async updateExpiredContracts(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    
    // Find active contracts that have expired
    const activeContracts = await this.contractRepo.findActive();
    const expiredContracts = activeContracts.filter(contract => contract.end_at <= today);

    let updatedCount = 0;
    for (const contract of expiredContracts) {
      if (contract.id) {
        await this.contractRepo.update(contract.id, { status: 'expired' });
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Get comprehensive contract statistics
   */
  async getContractStatistics(): Promise<ContractStatistics> {
    const [contractStats, paymentStats] = await Promise.all([
      this.contractRepo.getStatistics(),
      this.paymentRepo.getStatistics()
    ]);

    // Calculate revenue by plan
    const planRevenue = { basic: 0, premium: 0, executive: 0 };
    
    // Get active contracts with payments to calculate plan-specific revenue
    const activeContractsWithPayments = await this.contractRepo.findActiveWithPayments();
    activeContractsWithPayments.forEach(contract => {
      if (contract.plan in planRevenue) {
        planRevenue[contract.plan as keyof typeof planRevenue] += contract.total_paid;
      }
    });

    return {
      total_contracts: contractStats.total,
      active_contracts: contractStats.active,
      expired_contracts: contractStats.expired,
      cancelled_contracts: contractStats.cancelled,
      expiring_soon: contractStats.expiring_soon,
      revenue: {
        total: paymentStats.total_amount,
        this_month: paymentStats.this_month.amount,
        last_month: 0 // TODO: Calculate last month revenue
      },
      by_plan: {
        basic: { count: contractStats.by_plan.basic, revenue: planRevenue.basic },
        premium: { count: contractStats.by_plan.premium, revenue: planRevenue.premium },
        executive: { count: contractStats.by_plan.executive, revenue: planRevenue.executive }
      }
    };
  }

  /**
   * Generate PDF contract document
   */
  async generateContractPDF(contractId: number, options: PDFGenerationOptions = {}): Promise<Buffer> {
    const contract = await this.contractRepo.findById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    // Get payment information if requested
    let contractData: ContractPDFData = contract;
    if (options.includePayments !== false) {
      const payments = await this.paymentRepo.findByContractId(contractId);
      const paymentSummary = await this.paymentRepo.getContractPaymentSummary(contractId);
      
      contractData = {
        ...contract,
        payments,
        total_paid: paymentSummary?.total_amount || 0,
        remaining_balance: contract.price - (paymentSummary?.total_amount || 0)
      };
    }

    return this.pdfService.generateContractPDF(contractData, options);
  }

  /**
   * Validate contract business rules
   */
  private async validateBusinessRules(contract: CreateVipContract): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get existing contracts for this phone (this will be called again, but we need it for business rules)
    const existingContracts = await this.contractRepo.findByPhone(contract.phone);
    const activeCount = existingContracts.filter(c => c.status === 'active').length;

    // Business rule: Maximum 3 active contracts per phone number
    if (activeCount >= 3) {
      errors.push('Maximum 3 active contracts allowed per phone number');
    }

    // Business rule: Contract start date should be within next 30 days
    const startDate = new Date(contract.start_at);
    const maxStartDate = new Date();
    maxStartDate.setDate(maxStartDate.getDate() + 30);
    
    if (startDate > maxStartDate) {
      warnings.push('Contract start date is more than 30 days in the future');
    }

    // Business rule: Executive plans require minimum 6 months
    if (contract.plan === 'executive' && contract.duration_months < 6) {
      errors.push('Executive plans require minimum 6 months duration');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}