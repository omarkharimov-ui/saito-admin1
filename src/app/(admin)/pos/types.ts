'use client';

export type PosProduct = {
  id: string;
  name: string;
  price: number;
  category_id?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
  [key: string]: any;
};

export type Modifier = {
  id: string;
  type: 'doneness' | 'extra' | 'remove';
  label: string;
  price_adjust: number;
  ingredient_id?: string;
  ingredient_qty?: number;
};

export type ModifierSelection = {
  modifier_id: string;
  label: string;
  price_adjust: number;
  ingredient_id?: string;
  ingredient_qty?: number;
};

export type PosCartItem = {
  product_id: string;
  product_name: string;
  product_image?: string | null;
  unit_price: number;
  quantity: number;
  modifiers: ModifierSelection[];
  special_notes: string;
  variant_id?: string;
};

export type PosCart = {
  table_id?: string;
  table_number: number;
  guest_count: number;
  notes?: string;
  order_type?: 'dine_in' | 'takeaway' | 'delivery';
  items: PosCartItem[];
};

export type PosTable = {
  id: string;
  table_number: number;
  guest_count?: number | null;
  status: 'empty' | 'active' | 'waiting_bill' | 'cooking' | 'problem' | string;
  total_amount: number;
  merged_orders?: unknown[] | null;
  last_activity_at?: string | null;
  opened_at?: string | null;
  order_count?: number | null;
  order_ids?: string[];
};

export type PaymentInfo = {
  method: 'cash' | 'card';
  cash_amount: number;
  card_amount: number;
  tip: number;
};

export type FloorConfig = {
  id: string;
  name: string;
  table_count?: number;
  tables?: PosTable[];
};

export type TableStatus = PosTable['status'];
