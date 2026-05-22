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
  discount_price: number | null;
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
  description?: string;
  type: 'BOGO' | 'BUY2GET1' | 'PERCENTAGE' | 'HAPPY_HOUR' | 'FREE_DELIVERY';
  target_type: 'category' | 'product';
  target_id: string;
  discount_value?: number;
  start_time?: string; // Format: HH:mm
  end_time?: string;   // Format: HH:mm
  end_date?: string;
  status: 'active' | 'inactive';
  image_url?: string;
  created_at?: string;
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
  discount_price?: number | null;
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
  phone: string;
  guests: number;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  note?: string;
  created_at: string;
}
