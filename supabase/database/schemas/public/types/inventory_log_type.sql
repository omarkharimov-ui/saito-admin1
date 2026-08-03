CREATE TYPE public.inventory_log_type AS ENUM (
  'stock_in',
  'waste',
  'adjustment',
  'order_consumption',
  'stock_return',
  'order_restore'
);