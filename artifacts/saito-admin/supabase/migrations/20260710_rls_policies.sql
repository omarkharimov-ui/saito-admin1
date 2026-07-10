-- ============================================================
-- RLS Policies for Production
-- Enable RLS + grant CRUD to authenticated users on all admin tables
-- ============================================================

-- Helper: enable RLS on all tables that need it
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'products', 'categories', 'product_variants', 'product_modifiers',
      'recipes', 'recipe_items',
      'orders', 'order_items',
      'settings', 'staff', 'table_floors',
      'ingredients', 'inventory_logs', 'inventory_counts', 'inventory_count_items',
      'suppliers', 'purchase_orders', 'purchase_order_items',
      'invoices', 'invoice_items',
      'clock_events', 'customers', 'cancelled_orders',
      'reservations',
      'campaigns', 'combos',
      'transaction_logs', 'discrepancy_alerts', 'audit_log', 'notifications',
      'stock_returns', 'stock_return_items'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- ============================================================
-- READ policies — authenticated users can read everything
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'products', 'categories', 'product_variants', 'product_modifiers',
      'recipes', 'recipe_items',
      'orders', 'order_items',
      'settings', 'staff', 'table_floors',
      'ingredients', 'inventory_logs', 'inventory_counts', 'inventory_count_items',
      'suppliers', 'purchase_orders', 'purchase_order_items',
      'invoices', 'invoice_items',
      'clock_events', 'customers', 'cancelled_orders',
      'reservations',
      'campaigns', 'combos',
      'transaction_logs', 'discrepancy_alerts', 'audit_log', 'notifications',
      'stock_returns', 'stock_return_items'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_read ON %I FOR SELECT TO authenticated USING (true);', t, t);
  END LOOP;
END $$;

-- ============================================================
-- WRITE policies — authenticated users can INSERT/UPDATE/DELETE
-- ============================================================
-- Products
DROP POLICY IF EXISTS products_insert ON products;
CREATE POLICY products_insert ON products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS products_delete ON products;
CREATE POLICY products_delete ON products FOR DELETE TO authenticated USING (true);

-- Categories
DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS categories_delete ON categories;
CREATE POLICY categories_delete ON categories FOR DELETE TO authenticated USING (true);

-- Product Variants
DROP POLICY IF EXISTS product_variants_insert ON product_variants;
CREATE POLICY product_variants_insert ON product_variants FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS product_variants_update ON product_variants;
CREATE POLICY product_variants_update ON product_variants FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS product_variants_delete ON product_variants;
CREATE POLICY product_variants_delete ON product_variants FOR DELETE TO authenticated USING (true);

-- Product Modifiers
DROP POLICY IF EXISTS product_modifiers_insert ON product_modifiers;
CREATE POLICY product_modifiers_insert ON product_modifiers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS product_modifiers_update ON product_modifiers;
CREATE POLICY product_modifiers_update ON product_modifiers FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS product_modifiers_delete ON product_modifiers;
CREATE POLICY product_modifiers_delete ON product_modifiers FOR DELETE TO authenticated USING (true);

-- Recipes
DROP POLICY IF EXISTS recipes_insert ON recipes;
CREATE POLICY recipes_insert ON recipes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS recipes_update ON recipes;
CREATE POLICY recipes_update ON recipes FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS recipes_delete ON recipes;
CREATE POLICY recipes_delete ON recipes FOR DELETE TO authenticated USING (true);

-- Recipe Items
DROP POLICY IF EXISTS recipe_items_insert ON recipe_items;
CREATE POLICY recipe_items_insert ON recipe_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS recipe_items_update ON recipe_items;
CREATE POLICY recipe_items_update ON recipe_items FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS recipe_items_delete ON recipe_items;
CREATE POLICY recipe_items_delete ON recipe_items FOR DELETE TO authenticated USING (true);

-- Orders
DROP POLICY IF EXISTS orders_insert ON orders;
CREATE POLICY orders_insert ON orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS orders_update ON orders;
CREATE POLICY orders_update ON orders FOR UPDATE TO authenticated USING (true);

-- Order Items
DROP POLICY IF EXISTS order_items_insert ON order_items;
CREATE POLICY order_items_insert ON order_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS order_items_update ON order_items;
CREATE POLICY order_items_update ON order_items FOR UPDATE TO authenticated USING (true);

-- Settings
DROP POLICY IF EXISTS settings_insert ON settings;
CREATE POLICY settings_insert ON settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS settings_update ON settings;
CREATE POLICY settings_update ON settings FOR UPDATE TO authenticated USING (true);

-- Staff
DROP POLICY IF EXISTS staff_insert ON staff;
CREATE POLICY staff_insert ON staff FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS staff_update ON staff;
CREATE POLICY staff_update ON staff FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS staff_delete ON staff;
CREATE POLICY staff_delete ON staff FOR DELETE TO authenticated USING (true);

-- Table Floors (read-only for anon, but admins can update status via RPCs)
DROP POLICY IF EXISTS table_floors_update ON table_floors;
CREATE POLICY table_floors_update ON table_floors FOR UPDATE TO authenticated USING (true);

-- Ingredients
DROP POLICY IF EXISTS ingredients_insert ON ingredients;
CREATE POLICY ingredients_insert ON ingredients FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS ingredients_update ON ingredients;
CREATE POLICY ingredients_update ON ingredients FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS ingredients_delete ON ingredients;
CREATE POLICY ingredients_delete ON ingredients FOR DELETE TO authenticated USING (true);

-- Inventory Logs
DROP POLICY IF EXISTS inventory_logs_insert ON inventory_logs;
CREATE POLICY inventory_logs_insert ON inventory_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Inventory Counts
DROP POLICY IF EXISTS inventory_counts_insert ON inventory_counts;
CREATE POLICY inventory_counts_insert ON inventory_counts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS inventory_counts_update ON inventory_counts;
CREATE POLICY inventory_counts_update ON inventory_counts FOR UPDATE TO authenticated USING (true);

-- Inventory Count Items
DROP POLICY IF EXISTS inventory_count_items_insert ON inventory_count_items;
CREATE POLICY inventory_count_items_insert ON inventory_count_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS inventory_count_items_update ON inventory_count_items;
CREATE POLICY inventory_count_items_update ON inventory_count_items FOR UPDATE TO authenticated USING (true);

-- Suppliers
DROP POLICY IF EXISTS suppliers_insert ON suppliers;
CREATE POLICY suppliers_insert ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS suppliers_update ON suppliers;
CREATE POLICY suppliers_update ON suppliers FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS suppliers_delete ON suppliers;
CREATE POLICY suppliers_delete ON suppliers FOR DELETE TO authenticated USING (true);

-- Purchase Orders
DROP POLICY IF EXISTS purchase_orders_insert ON purchase_orders;
CREATE POLICY purchase_orders_insert ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS purchase_orders_update ON purchase_orders;
CREATE POLICY purchase_orders_update ON purchase_orders FOR UPDATE TO authenticated USING (true);

-- Purchase Order Items
DROP POLICY IF EXISTS purchase_order_items_insert ON purchase_order_items;
CREATE POLICY purchase_order_items_insert ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS purchase_order_items_update ON purchase_order_items;
CREATE POLICY purchase_order_items_update ON purchase_order_items FOR UPDATE TO authenticated USING (true);

-- Invoices
DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices FOR UPDATE TO authenticated USING (true);

-- Invoice Items
DROP POLICY IF EXISTS invoice_items_insert ON invoice_items;
CREATE POLICY invoice_items_insert ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS invoice_items_update ON invoice_items;
CREATE POLICY invoice_items_update ON invoice_items FOR UPDATE TO authenticated USING (true);

-- Clock Events
DROP POLICY IF EXISTS clock_events_insert ON clock_events;
CREATE POLICY clock_events_insert ON clock_events FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS clock_events_update ON clock_events;
CREATE POLICY clock_events_update ON clock_events FOR UPDATE TO authenticated USING (true);

-- Customers
DROP POLICY IF EXISTS customers_insert ON customers;
CREATE POLICY customers_insert ON customers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS customers_update ON customers;
CREATE POLICY customers_update ON customers FOR UPDATE TO authenticated USING (true);

-- Cancelled Orders
DROP POLICY IF EXISTS cancelled_orders_insert ON cancelled_orders;
CREATE POLICY cancelled_orders_insert ON cancelled_orders FOR INSERT TO authenticated WITH CHECK (true);

-- Reservations
DROP POLICY IF EXISTS reservations_insert ON reservations;
CREATE POLICY reservations_insert ON reservations FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS reservations_update ON reservations;
CREATE POLICY reservations_update ON reservations FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS reservations_delete ON reservations;
CREATE POLICY reservations_delete ON reservations FOR DELETE TO authenticated USING (true);

-- Campaigns
DROP POLICY IF EXISTS campaigns_update ON campaigns;
CREATE POLICY campaigns_update ON campaigns FOR UPDATE TO authenticated USING (true);

-- Combos
DROP POLICY IF EXISTS combos_insert ON combos;
CREATE POLICY combos_insert ON combos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS combos_update ON combos;
CREATE POLICY combos_update ON combos FOR UPDATE TO authenticated USING (true);

-- Transaction Logs
DROP POLICY IF EXISTS transaction_logs_insert ON transaction_logs;
CREATE POLICY transaction_logs_insert ON transaction_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Discrepancy Alerts
DROP POLICY IF EXISTS discrepancy_alerts_insert ON discrepancy_alerts;
CREATE POLICY discrepancy_alerts_insert ON discrepancy_alerts FOR INSERT TO authenticated WITH CHECK (true);

-- Stock Returns
DROP POLICY IF EXISTS stock_returns_insert ON stock_returns;
CREATE POLICY stock_returns_insert ON stock_returns FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS stock_returns_update ON stock_returns;
CREATE POLICY stock_returns_update ON stock_returns FOR UPDATE TO authenticated USING (true);

-- Stock Return Items
DROP POLICY IF EXISTS stock_return_items_insert ON stock_return_items;
CREATE POLICY stock_return_items_insert ON stock_return_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS stock_return_items_update ON stock_return_items;
CREATE POLICY stock_return_items_update ON stock_return_items FOR UPDATE TO authenticated USING (true);

-- Notifications
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Audit Log
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
