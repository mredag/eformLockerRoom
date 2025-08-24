export interface Contract {
  id: number;
  member_name: string;
  phone: string;
  email?: string;
  plan: string;
  price: number;
  start_at: string;
  end_at: string;
  status: string;
  created_at?: string;
  created_by?: string;
  kiosk_id: string;
  locker_id: number;
  rfid_card: string;
  backup_card?: string;
  notes?: string;
}

// Placeholder repository class for dependency mocks.
export class ContractRepository {}
