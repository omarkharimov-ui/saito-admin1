-- ============================================================
-- 0.4-B: Order Item Contract
-- Immutable snapshots (price/tax/modifier) + item kitchen state
-- machine + void/restore + edit rules + canonical atomic ops.
--
--  CONTRACT (per order_item):
--   PRODUCT ─► price_snapshot ─► unit_price (= base − discount + Σ modifiers)
--             tax_rate/tax_amount ─► tax_snapshot in price_snapshot
--             modifiers[{id,name,price,quantity}] ─► modifier_total
--             station/station_id (same-location enforced by legacy trigger)
--             course + seat_number (routing)
--
--  INVARIANTS:
--   * unit_price ≥ 0 ; quantity > 0 ; total_price = unit_price × quantity
--   * EXCEPTION (void contract): status ∈ {voided,cancelled,wasted,comped}
--     ⇒ total_price may be 0 regardless of unit×qty (zeroed item).
--   * price/tax/snapshot/station_id are IMMUTABLE once the item leaves
--     the cart (state ∈ {sent,accepted,preparing,ready,served,completed});
--     quantity rescale (total = unit × new_qty) stays legal (legacy waste).
--   * item lifecycle (kitchen_status) is governed by the SAME
--     state_transitions registry as orders (entity='item').
--   * idempotency_key is unique (dedupe for concurrent adds).
-- ============================================================

BEGIN;

-- 1. Identity + tax snapshot columns + idempotency uniqueness
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.order_items.tax_rate IS '0.4-B tax snapshot rate (default 0, snapshot immutable after SENT)';
COMMENT ON COLUMN public.order_items.tax_amount IS '0.4-B tax amount = round(total_price*tax_rate,2) (informational; not added to orders.total_amount)';

CREATE UNIQUE INDEX IF NOT EXISTS order_items_idempotency_key_uidx
  ON public.order_items (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Item snackseat seat validation (course CHECK already exists)
CREATE OR REPLACE FUNCTION trg_item_seat_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.seat_number IS NOT NULL AND NEW.seat_number < 1 THEN
    RAISE EXCEPTION 'INVALID_SEAT: seat_number must be ≥ 1 (got %)', NEW.seat_number
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.course IS NOT NULL AND NEW.course NOT IN ('main','appetizer','dessert','drink','side','combo') THEN
    RAISE EXCEPTION 'INVALID_COURSE: % (allowed main/appetizer/dessert/drink/side/combo)', NEW.course
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_seat_guard ON public.order_items;
CREATE TRIGGER trg_item_seat_guard
  BEFORE INSERT OR UPDATE OF seat_number, course ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_seat_guard();

-- 3. Fix latent void bug: void/cancel/waste/comp zeroing must not
--    violate the 0.1.41 total = unit*qty invariant.
CREATE OR REPLACE FUNCTION validate_order_item_price_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.unit_price < 0 THEN
    RAISE EXCEPTION 'Order item unit_price cannot be negative (0.1.10)' USING ERRCODE='P0001';
  END IF;
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Order item quantity must be positive (0.1.36)' USING ERRCODE='P0001';
  END IF;
  IF NEW.total_price IS NOT NULL AND NEW.total_price != (NEW.unit_price * NEW.quantity)
     AND NOT (NEW.kitchen_status IN ('voided','cancelled','wasted','comped') AND NEW.total_price = 0)
  THEN
    RAISE EXCEPTION 'Order item total_price must equal unit_price * quantity (0.1.41) [void-exempt]'
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. ITEM STATE MACHINE — same registry as orders (entity='item').
--    canonical progression goes pending → accepted/preparing → ready → served → completed
--    (reserved/sent are pre-kitchen aliases; hot/bar/sushi are routing sections).
INSERT INTO public.state_transitions
  (entity, from_status, to_status, requires_permission, requires_manager_override, description)
VALUES
  -- --- progression (kitchen) ---
  ('item','pending','sent','kitchen.manage',false,'cart → kitchen queue (legacy)'),
  ('item','pending','accepted','kitchen.manage',false,'cart → accepted'),
  ('item','pending','preparing','kitchen.manage',false,'cart → preparing'),
  ('item','pending','ready','kitchen.manage',false,'cart → ready (fast track)'),
  ('item','pending','served','kitchen.manage',false,'cart → served (fast track)'),
  ('item','pending','completed','kitchen.manage',false,'cart → completed'),
  ('item','reserved','pending','kitchen.manage',false,'reservation hold released'),
  ('item','reserved','accepted','kitchen.manage',false,'reservation → accepted'),
  ('item','reserved','preparing','kitchen.manage',false,'reservation → preparing'),
  ('item','reserved','sent','kitchen.manage',false,'reservation → sent'),
  ('item','reserved','ready','kitchen.manage',false,'reservation → ready'),
  ('item','sent','accepted','kitchen.manage',false,'sent → accepted'),
  ('item','sent','preparing','kitchen.manage',false,'sent → preparing'),
  ('item','sent','ready','kitchen.manage',false,'sent → ready'),
  ('item','sent','served','kitchen.manage',false,'sent → served'),
  ('item','sent','completed','kitchen.manage',false,'sent → completed'),
  ('item','sent','pending','kitchen.manage',false,'sent → cart (undo/recall)'),
  ('item','accepted','preparing','kitchen.manage',false,'accepted → preparing'),
  ('item','accepted','ready','kitchen.manage',false,'accepted → ready'),
  ('item','accepted','served','kitchen.manage',false,'accepted → served'),
  ('item','accepted','completed','kitchen.manage',false,'accepted → completed'),
  ('item','accepted','pending','kitchen.manage',false,'accepted → cart (undo)'),
  ('item','preparing','ready','kitchen.manage',false,'preparing → ready'),
  ('item','preparing','served','kitchen.manage',false,'preparing → served'),
  ('item','preparing','completed','kitchen.manage',false,'preparing → completed'),
  ('item','ready','served','kitchen.manage',false,'ready → served'),
  ('item','ready','completed','kitchen.manage',false,'ready → completed'),
  ('item','ready','preparing','kitchen.manage',false,'recall: ready → preparing (legacy recall_order_items)'),
  ('item','ready','pending','kitchen.manage',false,'recall: ready → cart'),
  ('item','served','completed','kitchen.manage',false,'served → completed'),
  ('item','served','pending','kitchen.manage',false,'served → cart (un-serve, reversal)'),
  ('item','completed','pending','orders.edit',true,'reverse payment: completed → pending (manager)'),
  ('item','completed','preparing','kitchen.manage',false,'re-cook: completed → preparing'),
  ('item','completed','served','kitchen.manage',false,'completed → served (correction)'),
  -- --- routing sections (set by legacy kitchen-section triggers) ---
  ('item','hot','preparing','kitchen.manage',false,'routing hot → preparing'),
  ('item','hot','ready','kitchen.manage',false,'routing hot → ready'),
  ('item','hot','served','kitchen.manage',false,'routing hot → served'),
  ('item','hot','completed','kitchen.manage',false,'routing hot → completed'),
  ('item','hot','pending','kitchen.manage',false,'routing hot → cart'),
  ('item','bar','preparing','kitchen.manage',false,'routing bar → preparing'),
  ('item','bar','ready','kitchen.manage',false,'routing bar → ready'),
  ('item','bar','served','kitchen.manage',false,'routing bar → served'),
  ('item','bar','completed','kitchen.manage',false,'routing bar → completed'),
  ('item','sushi','preparing','kitchen.manage',false,'routing sushi → preparing'),
  ('item','sushi','ready','kitchen.manage',false,'routing sushi → ready'),
  ('item','sushi','served','kitchen.manage',false,'routing sushi → served'),
  ('item','sushi','completed','kitchen.manage',false,'routing sushi → completed'),
  -- --- terminal: VOIDED (order.void; manager post-production) ---
  ('item','pending','voided','order.void',false,'void cart item'),
  ('item','reserved','voided','order.void',false,'void reserved'),
  ('item','sent','voided','order.void',false,'void sent'),
  ('item','accepted','voided','order.void',false,'void accepted'),
  ('item','preparing','voided','order.void',false,'void preparing'),
  ('item','ready','voided','order.void',true,'void ready (manager)'),
  ('item','served','voided','order.void',true,'void served (manager)'),
  ('item','completed','voided','order.void',true,'void completed (manager)'),
  ('item','hot','voided','order.void',false,'void routing hot'),
  ('item','bar','voided','order.void',false,'void routing bar'),
  ('item','sushi','voided','order.void',false,'void routing sushi'),
  -- --- terminal: CANCELLED (legacy void_order_item_atomic writes 'cancelled') ---
  ('item','pending','cancelled','order.void',false,'cancel cart item'),
  ('item','reserved','cancelled','order.void',false,'cancel reserved'),
  ('item','sent','cancelled','order.void',false,'cancel sent'),
  ('item','accepted','cancelled','order.void',false,'cancel accepted'),
  ('item','preparing','cancelled','order.void',false,'cancel preparing'),
  ('item','ready','cancelled','order.void',true,'cancel ready (manager)'),
  ('item','served','cancelled','order.void',true,'cancel served (manager)'),
  ('item','completed','cancelled','order.void',true,'cancel completed (manager)'),
  ('item','hot','cancelled','order.void',false,'cancel routing hot'),
  ('item','bar','cancelled','order.void',false,'cancel routing bar'),
  ('item','sushi','cancelled','order.void',false,'cancel routing sushi'),
  ('item','recalled','cancelled','order.void',false,'cancel recalled'),
  ('item','comped','cancelled','order.void',false,'cancel comped'),
  ('item','wasted','cancelled','order.void',false,'cancel wasted'),
  ('item','voided','cancelled','order.void',false,'voided → cancelled archive'),
  -- --- terminal: COMPED / WASTED (compensation, manager) ---
  ('item','pending','comped','pos.void',true,'comp cart item'),
  ('item','reserved','comped','pos.void',true,'comp reserved'),
  ('item','sent','comped','pos.void',true,'comp sent'),
  ('item','accepted','comped','pos.void',true,'comp accepted'),
  ('item','preparing','comped','pos.void',true,'comp preparing'),
  ('item','ready','comped','pos.void',true,'comp ready'),
  ('item','served','comped','pos.void',true,'comp served'),
  ('item','hot','comped','pos.void',true,'comp routing'),
  ('item','bar','comped','pos.void',true,'comp routing'),
  ('item','sushi','comped','pos.void',true,'comp routing'),
  ('item','recalled','comped','pos.void',true,'comp recalled'),
  ('item','pending','wasted','order.void',true,'waste cart item'),
  ('item','reserved','wasted','order.void',true,'waste reserved'),
  ('item','sent','wasted','order.void',true,'waste sent'),
  ('item','accepted','wasted','order.void',true,'waste accepted'),
  ('item','preparing','wasted','order.void',true,'waste preparing'),
  ('item','ready','wasted','order.void',true,'waste ready'),
  ('item','served','wasted','order.void',true,'waste served'),
  ('item','hot','wasted','order.void',true,'waste routing'),
  ('item','bar','wasted','order.void',true,'waste routing'),
  ('item','sushi','wasted','order.void',true,'waste routing'),
  -- --- restore / undo (manager-gated) ---
  ('item','voided','pending','orders.edit',true,'undo void → cart (restore)'),
  ('item','cancelled','pending','orders.edit',true,'undo cancel → cart (restore)'),
  ('item','comped','voided','order.void',true,'comp finalized as void'),
  ('item','wasted','voided','order.void',true,'waste finalized as void'),
  ('item','recalled','pending','kitchen.manage',false,'recalled → cart'),
  ('item','recalled','preparing','kitchen.manage',false,'recalled → resume'),
  ('item','recalled','ready','kitchen.manage',false,'recalled → ready'),
  ('item','recalled','served','kitchen.manage',false,'recalled → served')
ON CONFLICT (entity, from_status, to_status) DO UPDATE SET
  requires_permission = EXCLUDED.requires_permission,
  requires_manager_override = EXCLUDED.requires_manager_override,
  is_active = true,
  description = EXCLUDED.description;

-- 5. ITEM STATE MACHINE GUARD (registry = source of truth) + served_at stamping
CREATE OR REPLACE FUNCTION trg_item_state_machine_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_valid jsonb;
BEGIN
  IF OLD.kitchen_status IS NOT DISTINCT FROM NEW.kitchen_status THEN
    RETURN NEW;
  END IF;

  v_valid := validate_transition('item', OLD.kitchen_status, NEW.kitchen_status);
  IF NOT (v_valid->>'valid')::boolean THEN
    RAISE EXCEPTION 'INVALID_ITEM_TRANSITION [% → %]: % (item %)',
      OLD.kitchen_status, NEW.kitchen_status, v_valid->>'error', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.kitchen_status = 'served' AND NEW.served_at IS NULL THEN
    NEW.served_at := now();
  END IF;
  IF NEW.kitchen_status IN ('voided','cancelled','comped','wasted') THEN
    NEW.served_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_state_machine_guard ON public.order_items;
CREATE TRIGGER trg_item_state_machine_guard
  BEFORE UPDATE OF kitchen_status ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_state_machine_guard();

-- 6. MONEY LOCK: price / tax / snapshot / station_id immutable after cart.
--    Exceptions: (a) same-UPDATE void/cancel/waste/comp (zeroing),
--    (b) quantity rescale total = unit × new_qty (legacy waste, refund),
--    (c) session GUC app.order_item_money_bypass set by correction RPCs.
CREATE OR REPLACE FUNCTION trg_item_money_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_locked boolean;
BEGIN
  v_locked := COALESCE(NEW.kitchen_status, OLD.kitchen_status) IN
              ('sent','accepted','preparing','ready','served','completed');

  -- void/cancel/waste/comp zeroing in same UPDATE is legal
  IF OLD.kitchen_status IS DISTINCT FROM NEW.kitchen_status
     AND NEW.kitchen_status IN ('voided','cancelled','wasted','comped') THEN
    RETURN NEW;
  END IF;

  IF NOT v_locked THEN
    RETURN NEW;
  END IF;

  IF COALESCE(current_setting('app.order_item_money_bypass', true), '') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
    RAISE EXCEPTION 'ITEM_PRICE_FROZEN: cannot change unit_price in state % (use void + re-add)',
      COALESCE(NEW.kitchen_status, '') USING ERRCODE = 'P0001';
  END IF;
  IF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    RAISE EXCEPTION 'ITEM_SNAPSHOT_FROZEN: price_snapshot immutable in state %',
      COALESCE(NEW.kitchen_status, '') USING ERRCODE = 'P0001';
  END IF;
  IF NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount THEN
    RAISE EXCEPTION 'ITEM_TAX_FROZEN: tax snapshot immutable in state %',
      COALESCE(NEW.kitchen_status, '') USING ERRCODE = 'P0001';
  END IF;
  IF NEW.station_id IS DISTINCT FROM OLD.station_id THEN
    RAISE EXCEPTION 'ITEM_STATION_FROZEN: station routing immutable in state %',
      COALESCE(NEW.kitchen_status, '') USING ERRCODE = 'P0001';
  END IF;
  -- total_price allowed only as exact quantity rescale
  IF NEW.total_price IS DISTINCT FROM OLD.total_price
     AND GREATEST(NEW.total_price, 0) != GREATEST(NEW.unit_price * NEW.quantity, 0) THEN
    RAISE EXCEPTION 'ITEM_TOTAL_FROZEN: total_price must equal unit_price × quantity (state %)',
      COALESCE(NEW.kitchen_status, '') USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_item_money_lock ON public.order_items;
CREATE TRIGGER trg_item_money_lock
  BEFORE UPDATE OF unit_price, total_price, price_snapshot, tax_rate, tax_amount, station_id, kitchen_status
  ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_money_lock();

COMMIT;