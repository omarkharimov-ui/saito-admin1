export interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: { image_url: string | null; translations?: Record<string, { name?: string }> | null } | null;
  is_on_hold?: boolean;
  prepared_quantity?: number;
}

export interface Order {
  id: string;
  customer_note: string | null;
  table_number: number | null;
  total_amount: number;
  status: 'new' | 'confirmed' | 'paid';
  kitchen_status: 'pending' | 'cooking' | 'preparing' | 'ready' | 'cancelled' | null;
  kitchen_accepted_at: string | null;
  kitchen_ready_at: string | null;
  created_at: string;
  is_rush?: boolean;
  merged_into?: string | null;
  merged_orders?: { id: string; table_number: number | null }[];
  order_items?: OrderItem[];
  void_reason?: string | null;
  is_served?: boolean | null;
}

export interface Product {
  id: string;
  name: string;
  name_az?: string;
  name_en?: string;
  name_ru?: string;
  price: number;
  image_url: string | null;
  is_available?: boolean;
  category_id?: string | null;
  category?: { name: string }[] | { name: string } | null;
  translations?: Record<string, { name?: string }> | null;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  is_default: boolean;
}

export interface ManualItem {
  product: Product;
  variant: ProductVariant | null;
  quantity: number;
  note?: string;
}

export type TabKey = 'active' | 'archive';
export type BadgeType = 'ready' | 'preparing' | 'waiting' | 'confirmed' | null;
export type TableFilterType = 'all' | 'active' | 'empty' | 'new';
