'use client';

export type TableStatus = 'empty' | 'active' | 'waiting_bill' | 'cooking' | 'problem';

export interface PosTable {
  id: string;
  table_number: number;
  floor_name: string;
  sort_order: number;
  status: TableStatus;
  guest_count: number;
  opened_at: string | null;
  total_amount: number;
  order_count: number;
  order_ids: string[];
  merged_orders?: { id: string; table_number: number }[];
}

export interface Modifier {
  id: string;
  type: 'doneness' | 'extra' | 'remove' | 'variant';
  label: string;
  price_adjust: number;
  ingredient_id?: string;
  ingredient_qty?: number;
}

export interface ModifierSelection {
  modifier_id: string;
  label: string;
  price_adjust: number;
  ingredient_id?: string;
  ingredient_qty?: number;
}

export interface PosCartItem {
  product_id: string;
  product_name: string;
  product_image: string | null;
  unit_price: number;
  quantity: number;
  modifiers: ModifierSelection[];
  special_notes: string;
  variant_id?: string;
  variant_name?: string;
}

export interface PosCart {
  table_id: string;
  table_number: number;
  items: PosCartItem[];
  guest_count: number;
  notes: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
}

export type PaymentMethod = 'cash' | 'card' | 'mixed';

export interface PaymentInfo {
  method: PaymentMethod;
  cash_amount: number;
  card_amount: number;
  tip: number;
}

export interface BillSplit {
  type: 'equal' | 'by_item' | 'custom';
  splits: { guest: number; items: PosCartItem[]; amount: number }[];
}

export interface FloorConfig {
  id: string;
  name: string;
  tables: PosTable[];
}
