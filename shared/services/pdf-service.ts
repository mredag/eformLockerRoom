import PDFDocument from 'pdfkit';
import { Contract } from '../database/contract-repository';
import { Payment } from '../database/payment-repository';

export interface ContractPDFData extends Contract {
  payments?: Payment[];
  total_paid?: number;
  remaining_balance?: number;
}

export interface PDFGenerationOptions {
  includePayments?: boolean;
  includeTerms?: boolean;
  companyInfo?: CompanyInfo;
}

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  logo?: string; // Base64 encoded image or file path
}

/**
 * PDF Service for generating professional contract documents
 * Uses PDFKit for high-quality PDF generation with proper formatting
 */
export class PDFService {
  private defaultCompanyInfo: CompanyInfo = {
    name: 'Gym Locker Management System',
    address: '123 Fitness Street, Gym City, 12345',
    phone: '+90 (555) 123-4567',
    email: 'info@gymlocker.com',
    website: 'www.gymlocker.com'
  };

  /**
   * Generate a professional VIP contract PDF
   */
  async generateContractPDF(
    contractData: ContractPDFData,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        const chunks: Buffer[] = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Build PDF content
        this.addHeader(doc, options.companyInfo || this.defaultCompanyInfo);
        this.addContractTitle(doc, contractData);
        this.addMemberInformation(doc, contractData);
        this.addContractDetails(doc, contractData);
        this.addPricingInformation(doc, contractData);
        
        if (options.includePayments && contractData.payments) {
          this.addPaymentHistory(doc, contractData.payments);
        }
        
        if (options.includeTerms !== false) {
          this.addTermsAndConditions(doc);
        }
        
        this.addSignatureSection(doc);
        this.addFooter(doc, options.companyInfo || this.defaultCompanyInfo);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Add company header with logo and contact information
   */
  private addHeader(doc: PDFKit.PDFDocument, companyInfo: CompanyInfo): void {
    // Company name and title
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text(companyInfo.name, 50, 50);

    // Contact information
    doc.fontSize(10)
       .font('Helvetica')
       .text(companyInfo.address, 50, 75)
       .text(`Phone: ${companyInfo.phone} | Email: ${companyInfo.email}`, 50, 90);

    if (companyInfo.website) {
      doc.text(`Website: ${companyInfo.website}`, 50, 105);
    }

    // Add a line separator
    doc.moveTo(50, 130)
       .lineTo(545, 130)
       .stroke();
  }

  /**
   * Add contract title and basic information
   */
  private addContractTitle(doc: PDFKit.PDFDocument, contract: ContractPDFData): void {
    const currentY = 150;

    doc.fontSize(18)
       .font('Helvetica-Bold')
       .text('VIP LOCKER CONTRACT', 50, currentY, { align: 'center' });

    doc.fontSize(12)
       .font('Helvetica')
       .text(`Contract #${contract.id}`, 50, currentY + 30)
       .text(`Date: ${new Date(contract.created_at || new Date()).toLocaleDateString()}`, 400, currentY + 30);
  }

  /**
   * Add member information section
   */
  private addMemberInformation(doc: PDFKit.PDFDocument, contract: ContractPDFData): void {
    const startY = 220;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('MEMBER INFORMATION', 50, startY);

    doc.fontSize(11)
       .font('Helvetica')
       .text(`Name: ${contract.member_name}`, 50, startY + 25)
       .text(`Phone: ${contract.phone}`, 50, startY + 45);

    if (contract.email) {
      doc.text(`Email: ${contract.email}`, 50, startY + 65);
    }

    // Add member signature line
    doc.moveTo(300, startY + 80)
       .lineTo(500, startY + 80)
       .stroke();
    
    doc.fontSize(9)
       .text('Member Signature', 300, startY + 85);
  }

  /**
   * Add contract details section
   */
  private addContractDetails(doc: PDFKit.PDFDocument, contract: ContractPDFData): void {
    const startY = 340;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('CONTRACT DETAILS', 50, startY);

    // Plan information
    doc.fontSize(11)
       .font('Helvetica')
       .text(`Plan Type: ${this.formatPlanName(contract.plan)}`, 50, startY + 25)
       .text(`Contract Period: ${new Date(contract.start_at).toLocaleDateString()} - ${new Date(contract.end_at).toLocaleDateString()}`, 50, startY + 45);

    // Locker information
    doc.text(`Assigned Locker: Kiosk ${contract.kiosk_id}, Locker #${contract.locker_id}`, 50, startY + 65)
       .text(`RFID Card: ${contract.rfid_card}`, 50, startY + 85);

    if (contract.backup_card) {
      doc.text(`Backup Card: ${contract.backup_card}`, 50, startY + 105);
    }

    // Plan features
    const features = this.getPlanFeatures(contract.plan);
    if (features.length > 0) {
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Plan Features:', 300, startY + 25);

      doc.fontSize(10)
         .font('Helvetica');
      
      features.forEach((feature, index) => {
        doc.text(`• ${feature}`, 300, startY + 45 + (index * 15));
      });
    }
  }

  /**
   * Add pricing information section
   */
  private addPricingInformation(doc: PDFKit.PDFDocument, contract: ContractPDFData): void {
    const startY = 480;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('PRICING INFORMATION', 50, startY);

    // Create a simple table for pricing
    const tableTop = startY + 30;
    const itemX = 50;
    const amountX = 450;

    // Table headers
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .text('Description', itemX, tableTop)
       .text('Amount', amountX, tableTop);

    // Draw header line
    doc.moveTo(itemX, tableTop + 15)
       .lineTo(500, tableTop + 15)
       .stroke();

    // Contract value
    doc.fontSize(10)
       .font('Helvetica')
       .text('Total Contract Value', itemX, tableTop + 25)
       .text(`₺${contract.price.toFixed(2)}`, amountX, tableTop + 25);

    if (contract.total_paid && contract.total_paid > 0) {
      doc.text('Total Paid', itemX, tableTop + 45)
         .text(`₺${contract.total_paid.toFixed(2)}`, amountX, tableTop + 45);

      const remaining = contract.price - contract.total_paid;
      if (remaining > 0) {
        doc.font('Helvetica-Bold')
           .text('Remaining Balance', itemX, tableTop + 65)
           .text(`₺${remaining.toFixed(2)}`, amountX, tableTop + 65);
      }
    }

    // Draw bottom line
    doc.moveTo(itemX, tableTop + 85)
       .lineTo(500, tableTop + 85)
       .stroke();
  }

  /**
   * Add payment history section
   */
  private addPaymentHistory(doc: PDFKit.PDFDocument, payments: Payment[]): void {
    if (payments.length === 0) return;

    const startY = 600;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('PAYMENT HISTORY', 50, startY);

    const tableTop = startY + 25;
    const dateX = 50;
    const methodX = 150;
    const amountX = 250;
    const refX = 350;

    // Table headers
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text('Date', dateX, tableTop)
       .text('Method', methodX, tableTop)
       .text('Amount', amountX, tableTop)
       .text('Reference', refX, tableTop);

    // Draw header line
    doc.moveTo(dateX, tableTop + 15)
       .lineTo(500, tableTop + 15)
       .stroke();

    // Payment rows
    doc.font('Helvetica');
    payments.slice(0, 10).forEach((payment, index) => { // Limit to 10 payments
      const rowY = tableTop + 25 + (index * 15);
      
      doc.text(new Date(payment.paid_at || new Date()).toLocaleDateString(), dateX, rowY)
         .text(payment.method.toUpperCase(), methodX, rowY)
         .text(`₺${payment.amount.toFixed(2)}`, amountX, rowY)
         .text(payment.reference || '-', refX, rowY);
    });

    if (payments.length > 10) {
      doc.text(`... and ${payments.length - 10} more payments`, dateX, tableTop + 25 + (10 * 15));
    }
  }

  /**
   * Add terms and conditions section
   */
  private addTermsAndConditions(doc: PDFKit.PDFDocument): void {
    // Start new page for terms
    doc.addPage();

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text('TERMS AND CONDITIONS', 50, 50);

    const terms = [
      '1. The member agrees to use the assigned locker in accordance with gym policies.',
      '2. The RFID card remains the property of the gym and must be returned upon contract termination.',
      '3. Lost or damaged RFID cards will be replaced for a fee of ₺25.',
      '4. The locker must be emptied by the contract end date.',
      '5. The gym reserves the right to terminate this contract with 30 days notice.',
      '6. No refunds will be provided for early termination by the member.',
      '7. The member is responsible for any damage to the locker.',
      '8. This contract is non-transferable.',
      '9. Payment is due in advance for the contract period.',
      '10. The gym is not responsible for items left in the locker.'
    ];

    doc.fontSize(10)
       .font('Helvetica');

    terms.forEach((term, index) => {
      doc.text(term, 50, 80 + (index * 20), {
        width: 495,
        align: 'justify'
      });
    });
  }

  /**
   * Add signature section
   */
  private addSignatureSection(doc: PDFKit.PDFDocument): void {
    const startY = doc.y + 40;

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('SIGNATURES', 50, startY);

    // Member signature
    doc.fontSize(10)
       .font('Helvetica')
       .text('Member:', 50, startY + 40);

    doc.moveTo(100, startY + 60)
       .lineTo(250, startY + 60)
       .stroke();

    doc.text('Signature', 100, startY + 65)
       .text('Date: _______________', 100, startY + 85);

    // Staff signature
    doc.text('Staff:', 300, startY + 40);

    doc.moveTo(350, startY + 60)
       .lineTo(500, startY + 60)
       .stroke();

    doc.text('Signature', 350, startY + 65)
       .text('Date: _______________', 350, startY + 85);
  }

  /**
   * Add footer with page numbers and company info
   */
  private addFooter(doc: PDFKit.PDFDocument, companyInfo: CompanyInfo): void {
    const pages = doc.bufferedPageRange();
    
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i + pages.start);
      
      // Add page number
      doc.fontSize(8)
         .font('Helvetica')
         .text(`Page ${i + 1} of ${pages.count}`, 50, 750, { align: 'center' });

      // Add company info in footer
      doc.text(`${companyInfo.name} - ${companyInfo.phone}`, 50, 770, { align: 'center' });
    }
  }

  /**
   * Format plan name for display
   */
  private formatPlanName(plan: string): string {
    const planNames: Record<string, string> = {
      basic: 'Basic VIP',
      premium: 'Premium VIP',
      executive: 'Executive VIP'
    };
    return planNames[plan] || plan.toUpperCase();
  }

  /**
   * Get plan features for display
   */
  private getPlanFeatures(plan: string): string[] {
    const features: Record<string, string[]> = {
      basic: [
        'Dedicated locker access',
        'RFID card included',
        'Basic customer support'
      ],
      premium: [
        'Dedicated locker access',
        'RFID card + backup card',
        'Priority customer support',
        'Extended access hours'
      ],
      executive: [
        'Dedicated locker access',
        'RFID card + backup card',
        'Priority customer support',
        'Extended access hours',
        'Concierge service',
        'Premium locker location'
      ]
    };
    return features[plan] || [];
  }
}