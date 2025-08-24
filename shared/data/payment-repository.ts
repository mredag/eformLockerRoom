export interface Payment {
  id: number;
  contract_id: number;
  amount: number;
  method: string;
  paid_at: string;
  reference?: string;
  notes?: string;
  created_by?: string;
}

// Placeholder repository class for dependency mocks.
export class PaymentRepository {}
