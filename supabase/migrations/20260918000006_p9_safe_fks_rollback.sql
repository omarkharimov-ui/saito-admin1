-- P-9 M6 ROLLBACK — drop the 10 FKs added by 20260918000006_p9_safe_fks.sql.
-- (The 4 plan items that already existed / were views were NOT touched by
-- M6 and need no rollback.)
BEGIN;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS p9_fk_expenses_staff_id;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS p9_fk_order_items_variant_id;
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS p9_fk_reservations_floor_id;
ALTER TABLE public.table_floors DROP CONSTRAINT IF EXISTS p9_fk_table_floors_current_order_id;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS p9_fk_payments_refund_of_payment_id;
ALTER TABLE public.price_overrides DROP CONSTRAINT IF EXISTS p9_fk_price_overrides_order_item_id;
ALTER TABLE public.price_overrides DROP CONSTRAINT IF EXISTS p9_fk_price_overrides_product_id;
ALTER TABLE public.login_attempts DROP CONSTRAINT IF EXISTS p9_fk_login_attempts_staff_id;
ALTER TABLE public.notification_read_state DROP CONSTRAINT IF EXISTS p9_fk_notification_read_state_user_id;
ALTER TABLE public.combos DROP CONSTRAINT IF EXISTS p9_fk_combos_category_id;
COMMIT;
