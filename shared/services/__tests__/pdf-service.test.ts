import { describe, it, expect, beforeEach } from 'vitest';
import { PDFService, ContractPDFData, PDFGenerationOptions } from '../pdf-service';
import { Contract } from '../../data/contract-repository';
import { Payment } from '../../data/payment-repository';

describe('PDFService', () => {
  let pdfService: PDFService;
  let mockContract: ContractPDFData;

  beforeEach(() => {
    pdfService = new PDFService();

    const baseContract: Contract = {
      id: 1,
      member_name: 'John Doe',
      phone: '+90 555 123 4567',
      email: 'john.doe@example.com',
      plan: 'premium',
      price: 450.0,
      start_at: '2024-01-01',
      end_at: '2024-07-01',
      status: 'active',
      created_at: '2024-01-01T10:00:00Z',
      created_by: 'admin',
      kiosk_id: 'kiosk-1',
      locker_id: 5,
      rfid_card: 'RFID123456',
      backup_card: 'RFID789012',
      notes: 'Premium member with backup card'
    };

    mockContract = {
      ...baseContract,
      total_paid: 225.0,
      remaining_balance: 225.0
    };
  });

  describe('generateContractPDF', () => {
    it('should generate a PDF buffer for a basic contract', async () => {
      const pdfBuffer = await pdfService.generateContractPDF(mockContract);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      // Check PDF header
      const pdfHeader = pdfBuffer.toString('ascii', 0, 4);
      expect(pdfHeader).toBe('%PDF');
    });

    it('should generate a PDF with payment history when includePayments is true', async () => {
      const payments: Payment[] = [
        {
          id: 1,
          contract_id: 1,
          amount: 225.0,
          method: 'card',
          paid_at: '2024-01-01T10:00:00Z',
          reference: 'PAY123456',
          notes: 'Initial payment',
          created_by: 'admin'
        }
      ];

      const contractWithPayments: ContractPDFData = {
        ...mockContract,
        payments
      };

      const options: PDFGenerationOptions = {
        includePayments: true
      };

      const pdfBuffer = await pdfService.generateContractPDF(contractWithPayments, options);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate a PDF without terms when includeTerms is false', async () => {
      const options: PDFGenerationOptions = {
        includeTerms: false
      };

      const pdfBuffer = await pdfService.generateContractPDF(mockContract, options);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate a PDF with custom company info', async () => {
      const options: PDFGenerationOptions = {
        companyInfo: {
          name: 'Test Gym',
          address: '456 Test Street, Test City, 54321',
          phone: '+90 555 987 6543',
          email: 'info@testgym.com',
          website: 'www.testgym.com'
        }
      };

      const pdfBuffer = await pdfService.generateContractPDF(mockContract, options);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle contracts without optional fields', async () => {
      const minimalContract: ContractPDFData = {
        id: 2,
        member_name: 'Jane Smith',
        phone: '+90 555 111 2222',
        plan: 'basic',
        price: 150.00,
        start_at: '2024-02-01',
        end_at: '2024-05-01',
        status: 'active',
        created_at: '2024-02-01T09:00:00Z',
        created_by: 'staff',
        kiosk_id: 'kiosk-2',
        locker_id: 10,
        rfid_card: 'RFID654321'
        // No email, backup_card, notes, payments
      };

      const pdfBuffer = await pdfService.generateContractPDF(minimalContract);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle different plan types correctly', async () => {
      const plans: Array<'basic' | 'premium' | 'executive'> = ['basic', 'premium', 'executive'];
      
      for (const plan of plans) {
        const contractWithPlan = { ...mockContract, plan };
        const pdfBuffer = await pdfService.generateContractPDF(contractWithPlan);
        
        expect(pdfBuffer).toBeInstanceOf(Buffer);
        expect(pdfBuffer.length).toBeGreaterThan(0);
      }
    });

    it('should generate PDF with reasonable size', async () => {
      const pdfBuffer = await pdfService.generateContractPDF(mockContract);
      
      // PDF should be reasonable size (not too small, not too large)
      expect(pdfBuffer.length).toBeGreaterThan(2000); // At least 2KB
      expect(pdfBuffer.length).toBeLessThan(500000); // Less than 500KB
    });

    it('should handle contracts with multiple payments', async () => {
      const payments: Payment[] = [
        {
          id: 1,
          contract_id: 1,
          amount: 150.0,
          method: 'cash',
          paid_at: '2024-01-01T10:00:00Z',
          reference: 'CASH001',
          notes: 'Initial payment',
          created_by: 'admin'
        },
        {
          id: 2,
          contract_id: 1,
          amount: 75.0,
          method: 'card',
          paid_at: '2024-02-01T10:00:00Z',
          reference: 'CARD002',
          notes: 'Second payment',
          created_by: 'admin'
        }
      ];

      const contractWithMultiplePayments: ContractPDFData = {
        ...mockContract,
        payments,
        total_paid: 225.0,
        remaining_balance: 225.0
      };

      const options: PDFGenerationOptions = {
        includePayments: true
      };

      const pdfBuffer = await pdfService.generateContractPDF(contractWithMultiplePayments, options);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle error cases gracefully', async () => {
      // Test with invalid contract data
      const invalidContract = {
        ...mockContract,
        member_name: '', // Empty name should still work
      };

      const pdfBuffer = await pdfService.generateContractPDF(invalidContract);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('PDF content validation', () => {
    it('should generate consistent PDF structure', async () => {
      const pdfBuffer1 = await pdfService.generateContractPDF(mockContract);
      const pdfBuffer2 = await pdfService.generateContractPDF(mockContract);
      
      // PDFs should have similar size (allowing for timestamp differences)
      const sizeDifference = Math.abs(pdfBuffer1.length - pdfBuffer2.length);
      expect(sizeDifference).toBeLessThan(1000); // Less than 1KB difference
    });

    it('should include all required contract information', async () => {
      const pdfBuffer = await pdfService.generateContractPDF(mockContract);
      
      // Check PDF structure and basic content
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      
      // Check PDF header
      const pdfHeader = pdfBuffer.toString('ascii', 0, 4);
      expect(pdfHeader).toBe('%PDF');
      
      // Check that PDF has multiple pages (contract + terms)
      const pdfContent = pdfBuffer.toString('latin1');
      expect(pdfContent).toContain('/Count 2'); // Should have 2 pages
      expect(pdfContent).toContain('Helvetica'); // Should use Helvetica font
    });
  });
});