export type PurchaseOrderStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'cancelled';

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  ingredient_id: string;
  ingredient_name?: string | null;
  ordered_qty: number;
  received_qty?: number;
  unit: string;
  unit_cost: number;
  line_total?: number;
  created_at?: string;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  supplier?: Supplier | null;
  order_number: string;
  status: PurchaseOrderStatus;
  expected_at?: string | null;
  received_at?: string | null;
  subtotal?: number;
  tax?: number;
  total?: number;
  invoice_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseOrderItem[];
}

export interface GoodsReceivingLine {
  ingredient_id: string;
  quantity: number;
  unit: string;
  cost_per_unit: number;
}

export interface PurchasingAnalytics {
  spend_total: number;
  open_orders: number;
  received_orders: number;
  suppliers_count: number;
  average_order_value: number;
  top_supplier_name?: string | null;
}
