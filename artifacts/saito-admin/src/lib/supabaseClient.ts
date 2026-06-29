import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: Json;
          description: Json | null;
          price: number;
          discount_price: number | null;
          category_id: string | null;
          image_url: string | null;
          ingredients: Json | null;
          tags: string[] | null;
          calories: number | null;
          is_spicy: boolean | null;
          is_special: boolean | null;
          is_in_stock: boolean | null;
          is_available: boolean | null;
          views_count: number | null;
          translations: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: Json;
          description?: Json | null;
          price: number;
          discount_price?: number | null;
          category_id?: string | null;
          image_url?: string | null;
          ingredients?: Json | null;
          tags?: string[] | null;
          calories?: number | null;
          is_spicy?: boolean | null;
          is_special?: boolean | null;
          is_in_stock?: boolean | null;
          is_available?: boolean | null;
          views_count?: number | null;
          translations?: Json | null;
          created_at?: string | null;
        };
        Update: {
          name?: Json;
          description?: Json | null;
          price?: number;
          discount_price?: number | null;
          category_id?: string | null;
          image_url?: string | null;
          ingredients?: Json | null;
          tags?: string[] | null;
          calories?: number | null;
          is_spicy?: boolean | null;
          is_special?: boolean | null;
          is_in_stock?: boolean | null;
          is_available?: boolean | null;
          views_count?: number | null;
          translations?: Json | null;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          image_url: string | null;
          translations: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          image_url?: string | null;
          translations?: Json | null;
          created_at?: string | null;
        };
        Update: {
          name?: string;
          slug?: string | null;
          image_url?: string | null;
          translations?: Json | null;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          table_number: number | null;
          total_amount: number | null;
          status: 'new' | 'confirmed' | 'paid' | 'cancelled' | string;
          customer_note: string | null;
          returned_amount: number | null;
          items: Json | null;
          created_at: string | null;
          order_type: string | null;
          customer_id: string | null;
          kitchen_status: string | null;
          kitchen_accepted_at: string | null;
          kitchen_ready_at: string | null;
          payment_method: string | null;
          discount_type: string | null;
          discount_value: number | null;
          paid_amount: number | null;
          split_count: number | null;
          guest_count: number | null;
          tip_amount: number | null;
          cancelled_at: string | null;
          paid_at: string | null;
          closed_at: string | null;
          version: number | null;
          merged_into: string | null;
          reservation_id: string | null;
          is_draft: boolean | null;
          checkin_at: string | null;
        };
        Insert: {
          id?: string;
          table_number?: number | null;
          total_amount?: number | null;
          status: 'new' | 'confirmed' | 'paid' | 'cancelled' | string;
          customer_note?: string | null;
          returned_amount?: number | null;
          items?: Json | null;
          created_at?: string | null;
          order_type?: string | null;
          customer_id?: string | null;
          kitchen_status?: string | null;
          kitchen_accepted_at?: string | null;
          kitchen_ready_at?: string | null;
          payment_method?: string | null;
          discount_type?: string | null;
          discount_value?: number | null;
          paid_amount?: number | null;
          split_count?: number | null;
          guest_count?: number | null;
          tip_amount?: number | null;
          cancelled_at?: string | null;
          paid_at?: string | null;
          closed_at?: string | null;
          version?: number | null;
          merged_into?: string | null;
          reservation_id?: string | null;
          is_draft?: boolean | null;
          checkin_at?: string | null;
        };
        Update: {
          table_number?: number | null;
          total_amount?: number | null;
          status?: 'new' | 'confirmed' | 'paid' | 'cancelled' | string;
          customer_note?: string | null;
          returned_amount?: number | null;
          items?: Json | null;
          order_type?: string | null;
          customer_id?: string | null;
          kitchen_status?: string | null;
          kitchen_accepted_at?: string | null;
          kitchen_ready_at?: string | null;
          payment_method?: string | null;
          discount_type?: string | null;
          discount_value?: number | null;
          paid_amount?: number | null;
          split_count?: number | null;
          guest_count?: number | null;
          tip_amount?: number | null;
          cancelled_at?: string | null;
          paid_at?: string | null;
          closed_at?: string | null;
          version?: number | null;
          merged_into?: string | null;
          reservation_id?: string | null;
          is_draft?: boolean | null;
          checkin_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          variant_id: string | null;
          product_name: string | null;
          quantity: number | null;
          unit_price: number | null;
          total_price: number | null;
          created_at: string | null;
          course: string | null;
          modifiers: Json | null;
          special_notes: string | null;
          kitchen_status: string | null;
          is_ready_product: boolean | null;
          direct_ingredient_id: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          unit_price?: number | null;
          total_price?: number | null;
          created_at?: string | null;
          course?: string | null;
          modifiers?: Json | null;
          special_notes?: string | null;
          kitchen_status?: string | null;
          is_ready_product?: boolean | null;
          direct_ingredient_id?: string | null;
        };
        Update: {
          product_id?: string | null;
          variant_id?: string | null;
          product_name?: string | null;
          quantity?: number | null;
          unit_price?: number | null;
          total_price?: number | null;
          course?: string | null;
          modifiers?: Json | null;
          special_notes?: string | null;
          kitchen_status?: string | null;
          is_ready_product?: boolean | null;
          direct_ingredient_id?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          total_visits: number | null;
          total_spent: number | null;
          last_order_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          total_visits?: number | null;
          total_spent?: number | null;
          last_order_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          name?: string;
          phone?: string | null;
          total_visits?: number | null;
          total_spent?: number | null;
          last_order_at?: string | null;
        };
        Relationships: [];
      };
      clock_events: {
        Row: {
          id: string;
          staff_id: string;
          clock_in: string;
          clock_out: string | null;
        };
        Insert: {
          id?: string;
          staff_id: string;
          clock_in?: string;
          clock_out?: string | null;
        };
        Update: {
          staff_id?: string;
          clock_in?: string;
          clock_out?: string | null;
        };
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          name: string | null;
          phone: string | null;
          guests: number | null;
          date: string | null;
          time: string | null;
          status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'checked_in' | 'completed' | 'no_show' | string;
          note: string | null;
          created_at: string | null;
          customer_name: string | null;
          table_ids: Json | null;
          pre_order_items: Json | null;
          pre_order_total: number | null;
          kitchen_scheduled_at: string | null;
          table_number: number | null;
          checked_in_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          name?: string | null;
          phone?: string | null;
          guests?: number | null;
          date?: string | null;
          time?: string | null;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'checked_in' | 'completed' | 'no_show' | string;
          note?: string | null;
          created_at?: string | null;
          customer_name?: string | null;
          table_ids?: Json | null;
          pre_order_items?: Json | null;
          pre_order_total?: number | null;
          kitchen_scheduled_at?: string | null;
          table_number?: number | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          name?: string | null;
          phone?: string | null;
          guests?: number | null;
          date?: string | null;
          time?: string | null;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'checked_in' | 'completed' | 'no_show' | string;
          note?: string | null;
          customer_name?: string | null;
          table_ids?: Json | null;
          pre_order_items?: Json | null;
          pre_order_total?: number | null;
          kitchen_scheduled_at?: string | null;
          table_number?: number | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          title: string | null;
          description: string | null;
          type: string | null;
          target_type: string | null;
          target_id: string | null;
          discount_value: number | null;
          start_time: string | null;
          end_time: string | null;
          end_date: string | null;
          status: string | null;
          image_url: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          title?: string | null;
          description?: string | null;
          type?: string | null;
          target_type?: string | null;
          target_id?: string | null;
          discount_value?: number | null;
          start_time?: string | null;
          end_time?: string | null;
          end_date?: string | null;
          status?: string | null;
          image_url?: string | null;
          created_at?: string | null;
        };
        Update: {
          title?: string | null;
          description?: string | null;
          type?: string | null;
          target_type?: string | null;
          target_id?: string | null;
          discount_value?: number | null;
          start_time?: string | null;
          end_time?: string | null;
          end_date?: string | null;
          status?: string | null;
          image_url?: string | null;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          opening_hours: string | null;
          qr_table_count: number | null;
        };
        Insert: {
          id: string;
          opening_hours?: string | null;
          qr_table_count?: number | null;
        };
        Update: {
          opening_hours?: string | null;
          qr_table_count?: number | null;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          price: number;
          discount_price: number | null;
          image_url: string | null;
          is_default: boolean;
          variant_type: 'olcu' | 'nov' | null;
          description: string | null;
          ingredients: string | null;
          is_special: boolean;
          is_spicy: boolean;
          parent_variant_id: string | null;
          translations: Record<string, unknown> | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          price: number;
          discount_price?: number | null;
          image_url?: string | null;
          is_default?: boolean;
          variant_type?: 'olcu' | 'nov' | null;
          description?: string | null;
          ingredients?: string | null;
          is_special?: boolean;
          is_spicy?: boolean;
          parent_variant_id?: string | null;
          translations?: Record<string, unknown> | null;
          created_at?: string | null;
        };
        Update: {
          product_id?: string;
          name?: string;
          price?: number;
          discount_price?: number | null;
          image_url?: string | null;
          is_default?: boolean;
          variant_type?: 'olcu' | 'nov' | null;
          description?: string | null;
          ingredients?: string | null;
          is_special?: boolean;
          is_spicy?: boolean;
          parent_variant_id?: string | null;
          translations?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
      cancelled_orders: {
        Row: {
          id: string;
          order_id: string | null;
          table_number: number | null;
          reason: string | null;
          reason_text: string | null;
          total_amount: number | null;
          items: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          table_number?: number | null;
          reason?: string | null;
          reason_text?: string | null;
          total_amount?: number | null;
          items?: Json | null;
          created_at?: string | null;
        };
        Update: {
          reason?: string | null;
          reason_text?: string | null;
          total_amount?: number | null;
          items?: Json | null;
        };
        Relationships: [];
      };
      table_floors: {
        Row: {
          id: string;
          table_number: number;
          floor_name: string;
          sort_order: number;
          status: string | null;
          reservation_id: string | null;
          reservation_name: string | null;
          reservation_phone: string | null;
          reservation_time: string | null;
          guest_count: number | null;
          merged_into_table: number | null;
        };
        Insert: {
          id?: string;
          table_number: number;
          floor_name?: string;
          sort_order?: number;
          status?: string | null;
          reservation_id?: string | null;
          reservation_name?: string | null;
          reservation_phone?: string | null;
          reservation_time?: string | null;
          guest_count?: number | null;
          merged_into_table?: number | null;
        };
        Update: {
          table_number?: number;
          floor_name?: string;
          sort_order?: number;
          status?: string | null;
          reservation_id?: string | null;
          reservation_name?: string | null;
          reservation_phone?: string | null;
          reservation_time?: string | null;
          guest_count?: number | null;
          merged_into_table?: number | null;
        };
        Relationships: [];
      };
      ingredients: {
        Row: {
          id: string;
          name: string;
          unit: 'gram' | 'piece' | 'ml';
          current_stock: number;
          theoretical_stock: number;
          critical_limit: number;
          average_cost_per_unit: number;
          purchase_price: number;
          cold_waste_percentage: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          unit: 'gram' | 'piece' | 'ml';
          current_stock?: number;
          theoretical_stock?: number;
          critical_limit?: number;
          average_cost_per_unit?: number;
          purchase_price?: number;
          cold_waste_percentage?: number;
        };
        Update: {
          name?: string;
          unit?: 'gram' | 'piece' | 'ml';
          current_stock?: number;
          theoretical_stock?: number;
          critical_limit?: number;
          average_cost_per_unit?: number;
          purchase_price?: number;
          cold_waste_percentage?: number;
        };
        Relationships: [];
      };
      inventory_logs: {
        Row: {
          id: string;
          ingredient_id: string;
          type: 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
          quantity: number;
          cost_per_unit: number | null;
          reason: string | null;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ingredient_id: string;
          type: 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
          quantity: number;
          cost_per_unit?: number | null;
          reason?: string | null;
          order_id?: string | null;
        };
        Update: {
          ingredient_id?: string;
          type?: 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
          quantity?: number;
          cost_per_unit?: number | null;
          reason?: string | null;
          order_id?: string | null;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          id: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required: number;
          quantity_brutto: number | null;
          hot_waste_percentage: number | null;
          is_ai_suggested: boolean | null;
          recipe_header_id: string | null;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required: number;
          quantity_brutto?: number | null;
          hot_waste_percentage?: number | null;
          is_ai_suggested?: boolean | null;
          recipe_header_id?: string | null;
        };
        Update: {
          menu_item_id?: string;
          ingredient_id?: string;
          quantity_required?: number;
          quantity_brutto?: number | null;
          hot_waste_percentage?: number | null;
          is_ai_suggested?: boolean | null;
          recipe_header_id?: string | null;
        };
        Relationships: [];
      };
      waste_standards: {
        Row: {
          id: string;
          keyword: string;
          keyword_en: string | null;
          waste_percentage: number;
          note: string | null;
          category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          keyword: string;
          keyword_en?: string | null;
          waste_percentage: number;
          note?: string | null;
          category?: string | null;
        };
        Update: {
          keyword?: string;
          keyword_en?: string | null;
          waste_percentage?: number;
          note?: string | null;
          category?: string | null;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          tax_id: string | null;
          notes: string | null;
          status: 'active' | 'inactive';
          score: number | null;
          total_orders: number;
          on_time_delivery_rate: number | null;
          avg_price_stability: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          tax_id?: string | null;
          notes?: string | null;
          status?: 'active' | 'inactive';
          score?: number | null;
          total_orders?: number;
          on_time_delivery_rate?: number | null;
          avg_price_stability?: number | null;
        };
        Update: {
          name?: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          tax_id?: string | null;
          notes?: string | null;
          status?: 'active' | 'inactive';
          score?: number | null;
          total_orders?: number;
          on_time_delivery_rate?: number | null;
          avg_price_stability?: number | null;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          supplier_id: string;
          order_number: string;
          status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
          total_amount: number;
          notes: string | null;
          ordered_at: string;
          received_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          supplier_id: string;
          order_number: string;
          status?: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
          total_amount?: number;
          notes?: string | null;
          ordered_at?: string;
          received_at?: string | null;
        };
        Update: {
          supplier_id?: string;
          order_number?: string;
          status?: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
          total_amount?: number;
          notes?: string | null;
          ordered_at?: string;
          received_at?: string | null;
        };
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          ingredient_id: string | null;
          product_name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          received_quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          ingredient_id?: string | null;
          product_name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          received_quantity?: number;
        };
        Update: {
          ingredient_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          total_cost?: number;
          received_quantity?: number;
        };
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          supplier_id: string;
          purchase_order_id: string | null;
          invoice_number: string;
          invoice_date: string | null;
          total_amount: number;
          tax_amount: number;
          currency: string;
          status: 'draft' | 'matched' | 'needs_review' | 'approved' | 'applied' | 'rejected' | 'rolled_back' | 'partially_applied';
          notes: string | null;
          ocr_raw: unknown | null;
          created_at: string;
          updated_at: string;
          applied_at: string | null;
        };
        Insert: {
          id?: string;
          supplier_id: string;
          purchase_order_id?: string | null;
          invoice_number: string;
          invoice_date?: string | null;
          total_amount: number;
          tax_amount?: number;
          currency?: string;
          status?: 'draft' | 'matched' | 'needs_review' | 'approved' | 'applied' | 'rejected' | 'rolled_back' | 'partially_applied';
          notes?: string | null;
          ocr_raw?: unknown | null;
          applied_at?: string | null;
        };
        Update: {
          supplier_id?: string;
          purchase_order_id?: string | null;
          invoice_number?: string;
          invoice_date?: string | null;
          total_amount?: number;
          tax_amount?: number;
          currency?: string;
          status?: 'draft' | 'matched' | 'needs_review' | 'approved' | 'applied' | 'rejected' | 'rolled_back' | 'partially_applied';
          notes?: string | null;
          ocr_raw?: unknown | null;
          applied_at?: string | null;
        };
        Relationships: [];
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          purchase_order_item_id: string | null;
          product_name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          matched: boolean;
          variance_quantity: number;
          variance_cost: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          purchase_order_item_id?: string | null;
          product_name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          total_cost: number;
          matched?: boolean;
          variance_quantity?: number;
          variance_cost?: number;
        };
        Update: {
          invoice_id?: string;
          purchase_order_item_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          total_cost?: number;
          matched?: boolean;
          variance_quantity?: number;
          variance_cost?: number;
        };
        Relationships: [];
      };
      procurement_reviews: {
        Row: {
          id: string;
          purchase_order_id: string | null;
          invoice_id: string | null;
          product_name: string;
          quantity: number;
          unit: string;
          unit_cost: number;
          suggested_ingredient_id: string | null;
          match_confidence: number | null;
          status: 'pending' | 'approved' | 'rejected' | 'mapped' | 'rolled_back';
          notes: string | null;
          created_at: string;
          severity: 'critical' | 'high' | 'medium' | 'low';
        };
        Insert: {
          id?: string;
          purchase_order_id?: string | null;
          invoice_id?: string | null;
          product_name: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          suggested_ingredient_id?: string | null;
          match_confidence?: number | null;
          status?: 'pending' | 'approved' | 'rejected' | 'mapped' | 'rolled_back';
          notes?: string | null;
          severity?: 'critical' | 'high' | 'medium' | 'low';
        };
        Update: {
          purchase_order_id?: string | null;
          invoice_id?: string | null;
          product_name?: string;
          quantity?: number;
          unit?: string;
          unit_cost?: number;
          suggested_ingredient_id?: string | null;
          match_confidence?: number | null;
          status?: 'pending' | 'approved' | 'rejected' | 'mapped' | 'rolled_back';
          notes?: string | null;
          severity?: 'critical' | 'high' | 'medium' | 'low';
        };
        Relationships: [];
      };
      discrepancy_alerts: {
        Row: {
          id: string;
          type: 'invoice_amount' | 'received_qty' | 'stock_vs_sales' | 'recipe_vs_actual' | 'supplier_price' | 'waste_vs_norm' | 'margin_drop';
          severity: 'critical' | 'high' | 'medium' | 'low';
          title: string;
          description: string | null;
          source_id: string | null;
          source_table: string | null;
          value: number;
          expected_value: number;
          variance_pct: number;
          status: 'open' | 'acknowledged' | 'resolved';
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          type: 'invoice_amount' | 'received_qty' | 'stock_vs_sales' | 'recipe_vs_actual' | 'supplier_price' | 'waste_vs_norm' | 'margin_drop';
          severity?: 'critical' | 'high' | 'medium' | 'low';
          title: string;
          description?: string | null;
          source_id?: string | null;
          source_table?: string | null;
          value?: number;
          expected_value?: number;
          variance_pct?: number;
          status?: 'open' | 'acknowledged' | 'resolved';
          resolved_at?: string | null;
        };
        Update: {
          type?: 'invoice_amount' | 'received_qty' | 'stock_vs_sales' | 'recipe_vs_actual' | 'supplier_price' | 'waste_vs_norm' | 'margin_drop';
          severity?: 'critical' | 'high' | 'medium' | 'low';
          title?: string;
          description?: string | null;
          source_id?: string | null;
          source_table?: string | null;
          value?: number;
          expected_value?: number;
          variance_pct?: number;
          status?: 'open' | 'acknowledged' | 'resolved';
          resolved_at?: string | null;
        };
        Relationships: [];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
