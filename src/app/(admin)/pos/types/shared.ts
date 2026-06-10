'use client';

export interface PosModifier {
  id: string;
  name: string;
  price?: number | null;
  quantity?: number;
}

export interface PosModifierSelection {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface PosCartItem {
  id?: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  modifiers?: PosModifierSelection[];
  notes?: string;
}

export interface PosCart {
  table_id: string;
  table_number: number;
  guest_count: number;
  items: PosCartItem[];
  notes: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
}

export interface PosTable {
  id: string;
  table_number: number;
  guest_count?: number | null;
  status: TableStatus;
  total_amount: number;
  merged_orders?: unknown[] | null;
  last_activity_at?: string | null;
  opened_at?: string | null;
  order_count?: number | null;
  order_ids?: string[];
  floor_name?: string | null;
  sort_order?: number | null;
}

export type TableStatus = 'empty' | 'active' | 'waiting_bill' | 'cooking' | 'problem' | string;

export interface FloorConfig {
  id: string;
  name: string;
  tables?: PosTable[];
  sort_order?: number | null;
}

export interface PosProduct {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url?: string | null;
  name_az?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
}

export interface PaymentInfo {
  method: 'cash' | 'card';
  cash_amount: number;
  card_amount: number;
  tip: number;
}
