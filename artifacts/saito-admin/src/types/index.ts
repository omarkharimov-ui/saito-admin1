export interface ProductTranslation {
  name?: string;
  description?: string;
  ingredients?: string;
}

export interface CategoryTranslation {
  name?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  image_url?: string;
  category_type?: 'drink' | 'dessert' | 'food';
  name_az?: string;
  name_en?: string;
  name_ru?: string;
  translations?: Record<string, CategoryTranslation>;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  cost_price: number;
  profit_margin: number;
  category_id: string;
  category?: Category;
  image_url: string;
  ingredients: string[];
  tags?: string[];
  calories: number;
  is_spicy: boolean;
  is_special: boolean;
  is_in_stock: boolean;
  views_count: number;
  created_at?: string;
  variants?: ProductVariant[];
  name_az?: string;
  name_en?: string;
  name_ru?: string;
  description_az?: string;
  description_en?: string;
  description_ru?: string;
  ingredients_az?: string;
  ingredients_en?: string;
  ingredients_ru?: string;
  translations?: Record<string, ProductTranslation>;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  discount_price: number | null;
  image_url: string | null;
  is_default: boolean;
  variant_type: 'olcu' | null;
  translations?: Record<string, { name: string }> | null;
  is_in_stock?: boolean;
}

export interface Campaign {
  id: string;
  title: string;
  name?: string;
  description?: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'BUY_X_PAY_Y' | 'BUY_X_GET_Y' | 'HAPPY_HOUR' | 'FREE_DELIVERY' | 'COMBO';
  status: 'active' | 'inactive' | 'draft' | 'expired';
  priority?: number;
  stackable?: boolean;
  exclusive?: boolean;
  max_uses?: number;
  max_uses_per_customer?: number;
  max_uses_per_day?: number;
  max_uses_per_order?: number;
  min_order_amount?: number;
  max_order_amount?: number;
  customer_tags?: string[];
  dining_type?: string[];
  table_numbers?: number[];
  branch_id?: string;
  auto_apply?: boolean;
  requires_coupon?: boolean;
  coupon_code?: string;
  is_active?: boolean;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
  current_uses?: number;
  rules?: any[];
  targets?: any[];
  schedules?: any[];
}

export interface CampaignRule {
  id: string;
  campaign_id: string;
  rule_type: 'percentage' | 'fixed_amount' | 'buy_x_pay_y' | 'buy_x_get_y' | 'happy_hour' | 'free_delivery' | 'combo';
  percentage?: number;
  fixed_amount?: number;
  min_purchase_amount?: number;
  buy_quantity?: number;
  pay_quantity?: number;
  free_quantity?: number;
  reward_product_id?: string;
  reward_category_id?: string;
  reward_same_as_buy?: boolean;
  start_time?: string;
  end_time?: string;
  weekdays?: number[];
  is_recurring?: boolean;
  delivery_min_order?: number;
  delivery_zones?: string[];
  combo_id?: string;
  combo_discount_type?: string;
  combo_discount_value?: number;
}

export interface CampaignTarget {
  id: string;
  campaign_id: string;
  target_type: 'product' | 'category' | 'whole_order' | 'combo';
  target_id?: string;
}

export interface CampaignSchedule {
  id: string;
  campaign_id: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  weekdays?: number[];
  is_recurring?: boolean;
}

export interface ComboItem {
  id: string;
  combo_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  product?: Product;
  variant?: ProductVariant;
}

export interface Combo {
  id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string | null;
  is_in_stock: boolean;
  is_active: boolean;
  views_count: number;
  translations?: Record<string, { name?: string; description?: string }> | null;
  name_az?: string;
  name_en?: string;
  name_ru?: string;
  description_az?: string;
  description_en?: string;
  description_ru?: string;
  created_at?: string;
  items?: ComboItem[];
}

export interface Reservation {
  id: string;
  name: string;
  customer_name?: string;
  phone: string;
  guests: number;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'checked_in' | 'completed' | 'no_show' | 'archived' | 'expired';
  note?: string;
  notes?: string;
  created_at: string;
  table_number?: number | null;
  table_ids?: string[] | null;
  pre_order_items?: PreOrderItem[] | null;
  pre_order_total?: number | null;
  kitchen_scheduled_at?: string | null;
  visitCount?: number;
}

export interface PreOrderItem {
  id?: string;
  product_id: string;
  product_name: string;
  product_image?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  modifiers?: { id: string; name: string; price: number; quantity: number }[];
  special_notes?: string;
  course?: string;
}
