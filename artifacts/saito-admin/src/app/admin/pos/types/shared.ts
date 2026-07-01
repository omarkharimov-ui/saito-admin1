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
  product_image?: string | null;
  variant_id?: string | null;
  quantity: number;
  sentQuantity?: number;
  unit_price: number;
  total_price: number;
  modifiers?: PosModifierSelection[];
  notes?: string;
  special_notes?: string;
  is_combo?: boolean;
  combo_id?: string | null;
  combo_components?: Array<{
    product_id: string;
    product_name?: string;
    variant_id?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
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
  merged_into_table?: number | null;
  last_activity_at?: string | null;
  lastOrderTime?: string | null;
  opened_at?: string | null;
  order_count?: number | null;
  order_ids?: string[];
  floor_name?: string | null;
  sort_order?: number | null;
  has_pending?: boolean;
  oldest_pending_at?: string | null;
  kitchen_status?: string | null;
  // Rezervasiya sahələri
  reservation_id?: string | null;
  reservation_name?: string | null;
  reservation_phone?: string | null;
  reservation_time?: string | null;
}

export type TableStatus = 'empty' | 'active' | 'waiting_bill' | 'cooking' | 'problem' | 'merged' | 'reserved' | string;

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
  discount_price?: number | null;
  category_id: string | null;
  image_url?: string | null;
  name_az?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
  effective_price?: {
    base_price: number;
    effective_price: number;
    discount_amount: number;
    discount_type: string | null;
    campaign_id: string | null;
    campaign_label: string | null;
    campaign_badge: string | null;
  } | null;
}

export interface PaymentInfo {
  method: 'cash' | 'card';
  cash_amount: number;
  card_amount: number;
  tip: number;
}

export interface LossItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}
