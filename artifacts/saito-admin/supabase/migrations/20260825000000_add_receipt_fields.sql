-- Add staff name and payment method columns to settings table
-- Used by receipt preview and print

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS receipt_staff_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_payment_method text DEFAULT '';
