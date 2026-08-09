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
  variant_id?: string | null;
  quantity: number;
  sentQuantity?: number;
  unit_price: number;
  original_unit_price?: number;
  total_price: number;
  modifiers?: PosModifierSelection[];
  special_notes?: string;
  is_combo?: boolean;
  combo_id?: string | null;
  campaign_id?: string | null;
  campaign_discount_amount?: number;
  campaign_discount_type?: string | null;
  combo_components?: Array<{
    product_id: string;
    product_name?: string;
    variant_id?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  seat_number?: number | null;
  hold_until?: string | null;
  is_pre_order?: boolean;
  pre_order_id?: string | null;
  station?: string | null;
  station_id?: string | null;
  course?: string | null;
  priority?: string | null;
}

export interface PosCart {
  table_number: number | null;
  guest_count: number;
  items: PosCartItem[];
  notes: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery';
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_district?: string | null;
  delivery_street?: string | null;
  delivery_building?: string | null;
  delivery_floor?: string | null;
  delivery_apartment?: string | null;
  delivery_intercom?: string | null;
  delivery_zone?: string | null;
  delivery_fee?: number;
  estimated_delivery_time?: string | null;
  scheduled_date?: string | null;
  discount_amount?: number;
  discount_type?: 'percentage' | 'fixed' | null;
  reservation_id?: string | null;
  order_id?: string | null;
  payment_method?: string | null;
  serverTotal?: number | null;
}

export interface PosTable {
  id: string;
  table_number: number;
  status: TableStatus;
  guest_count?: number | null;
  total_amount?: number;
  reservation_name?: string | null;
  reservation_time?: string | null;
  kitchen_status?: string | null;
  parent_table_number?: number | null;
  merged_into_table?: number | null;
  last_activity_at?: string | null;
  lastOrderTime?: string | null;
  opened_at?: string | null;
  order_count?: number | null;
  item_count?: number | null;
  order_ids?: string[];
  floor_name?: string | null;
  sort_order?: number | null;
  has_pending?: boolean;
  oldest_pending_at?: string | null;
  is_group?: boolean;
  merged_with?: number[];
  reservation_id?: string | null;
  reservation_phone?: string | null;
  capacity?: number | null;
  is_vip?: boolean | null;
  bill_requested?: boolean | null;
  assigned_to?: string | null;
  waiter_name?: string | null;
  has_pre_order?: boolean;
  pre_order_count?: number;
  pre_order?: boolean;
  current_order_id?: string | null;
}

export type TableStatus = 'empty' | 'active' | 'waiting_bill' | 'cooking' | 'problem' | 'reserved' | 'waiting' | 'occupied' | 'dirty' | string;

export interface MergedGroup {
  id: string;
  parent: PosTable;
  children: PosTable[];
  total_guests: number;
  total_amount: number;
}

export interface FloorConfig {
  id?: string;
  name: string;
  tables?: PosTable[];
  merged_groups?: MergedGroup[];
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
  campaign_id?: string | null;
  discount_amount?: number;
  discount_type?: string | null;
}

export interface LossItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}
