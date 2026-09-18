-- =============================================================================
-- P-9 M6 — safe FK additions (ratified D-7 "GO per-FK", plan listed 14)
--
-- M6-R1 (2026-09-17, post-M5 scope correction, user-visible in M6 report):
-- The plan's 14-item list contained 4 items that cannot be NEW FKs:
--   (a) staff_stats.staff_id->staff      : staff_stats is a VIEW (relkind=v);
--                                           derived per-staff via LEFT JOIN
--                                           from staff — no real relation to
--                                           constrain.
--   (b) labor_summaries.staff_id->staff  : labor_summaries is a VIEW over
--                                           (shifts JOIN staff); its base
--                                           relation shifts.staff_id ALREADY
--                                           has shifts_staff_id_fkey
--                                           (ON DELETE RESTRICT, validated).
--   (c) current_stock.ingredient_id->ingredients : current_stock is a VIEW
--                                           over (ingredients LEFT JOIN
--                                           stock_transactions); its base
--                                           relation stock_transactions.
--                                           ingredient_id ALREADY has
--                                           stock_transactions_ingredient_id_
--                                           fkey (ON DELETE CASCADE,
--                                           validated).
--   (d) staff_metrics.staff_id->staff    : staff_metrics_staff_id_fkey
--                                           ALREADY EXISTS (ON DELETE
--                                           CASCADE, validated).
-- => 10 NEW FKs below (all orphan=0 PROVEN live 2026-09-17, re-verified in
--    the same session after M5; none of the 10 columns had prior FK
--    coverage — pg_constraint scan 2026-09-17).
-- ON DELETE = RESTRICT for all 10 (plan safety default).
-- Pre-existing CASCADE rules in (c)/(d) are OUT OF SCOPE (no behavior change
-- ratified for existing constraints) — recorded as observations in the M6
-- report.
--
-- Rollback: see 20260918000006_p9_safe_fks_rollback.sql
-- =============================================================================
BEGIN;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): expenses.staff_id
ALTER TABLE public.expenses ADD CONSTRAINT p9_fk_expenses_staff_id
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): order_items.variant_id
ALTER TABLE public.order_items ADD CONSTRAINT p9_fk_order_items_variant_id
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): reservations.floor_id
ALTER TABLE public.reservations ADD CONSTRAINT p9_fk_reservations_floor_id
  FOREIGN KEY (floor_id) REFERENCES public.table_floors(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): table_floors.current_order_id
ALTER TABLE public.table_floors ADD CONSTRAINT p9_fk_table_floors_current_order_id
  FOREIGN KEY (current_order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): payments.refund_of_payment_id
ALTER TABLE public.payments ADD CONSTRAINT p9_fk_payments_refund_of_payment_id
  FOREIGN KEY (refund_of_payment_id) REFERENCES public.order_payments(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): price_overrides.order_item_id
ALTER TABLE public.price_overrides ADD CONSTRAINT p9_fk_price_overrides_order_item_id
  FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): price_overrides.product_id
ALTER TABLE public.price_overrides ADD CONSTRAINT p9_fk_price_overrides_product_id
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): login_attempts.staff_id
ALTER TABLE public.login_attempts ADD CONSTRAINT p9_fk_login_attempts_staff_id
  FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): notification_read_state.user_id
ALTER TABLE public.notification_read_state ADD CONSTRAINT p9_fk_notification_read_state_user_id
  FOREIGN KEY (user_id) REFERENCES public.staff(id) ON DELETE RESTRICT;

-- orphan=0 PROVEN 2026-09-17 (live re-verify): combos.category_id
ALTER TABLE public.combos ADD CONSTRAINT p9_fk_combos_category_id
  FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;

COMMIT;
