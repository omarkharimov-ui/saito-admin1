-- =============================================================================
-- P-3 AMOUNT / IMMUTABILITY / UNDERPAYMENT BATCH (ratified 2026-09-13) — single
-- clean migration. P-1 (location) + P-2 (payment state machine) stay FROZEN.
--
--   A: P3-F3 — order_payments financial-record immutability
--        INSERT ok; UPDATE status -> P-2 guard (separate); UPDATE amount/method/
--        is_refund -> BLOCKED; DELETE -> BLOCKED (except the trusted, audited
--        reopen_order_atomic full-reversal path, via a transaction-scoped flag).
--        payment_method is NOT blocked by design: saito_reverse_payment uses
--        payment_method='reversed' as its soft-delete marker (live canonical fn).
--   B: P3-F4(b) — underpayment close block
--        an order may not enter status 'paid'/'closed' while 0 < paid_amount <
--        total_amount (partial pay). Stable domain error PAYMENT_INCOMPLETE; the
--        order stays open. Zero-amount closes (void/cancel) and full-amount
--        closes are unaffected. Legacy underpaid-closed rows are untouched
--        (guard is on UPDATE, not existing rows).
--
-- DO-NOT (ratified): no historical backfill (342 paid-without-record, 42 mismatch,
-- 45 NULL payments); no drawer trigger change; no P-1 location contract change;
-- no P-2 registry change; no UI change.
-- =============================================================================

-- ===== A: order_payments immutability guard (P3-F3) =====
CREATE OR REPLACE FUNCTION public.trg_order_payment_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Trusted exception: reopen_order_atomic's authorized, actor-validated,
    -- audited FULL order reversal (order -> new, paid_amount -> 0, inventory
    -- reversed). It is transaction-scoped (set_config ... , true) and set only
    -- inside that SECURITY DEFINER fn, so external callers cannot forge it.
    IF coalesce(current_setting('app.payment_ledger_reopen', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'PAYMENT_RECORD_IMMUTABLE: order_payments rows cannot be deleted (corrections are new refund/reverse rows) [order=%]', OLD.order_id USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: the financial identity is immutable; status is handled by the
  -- separate P-2 state-machine guard (trg_payment_state_machine_guard).
  IF (OLD.amount   IS DISTINCT FROM NEW.amount)
     OR (OLD.method IS DISTINCT FROM NEW.method)
     OR (OLD.is_refund IS DISTINCT FROM NEW.is_refund) THEN
    RAISE EXCEPTION 'PAYMENT_RECORD_IMMUTABLE: amount/method/is_refund are immutable [payment=%, order=%]', NEW.id, NEW.order_id USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_payment_immutable ON public.order_payments;
CREATE TRIGGER trg_order_payment_immutable
BEFORE UPDATE OR DELETE ON public.order_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_order_payment_immutable();

COMMENT ON FUNCTION public.trg_order_payment_immutable() IS 'P-3: order_payments financial identity (amount/method/is_refund) is immutable; rows are append-only. DELETE only via the trusted reopen_order_atomic full-reversal flag. status transitions remain P-2''s trg_payment_state_machine_guard.';

-- ===== A2: grant reopen_order_atomic its trusted full-reversal flag =====
-- (idempotent CREATE OR REPLACE with the flag added; body otherwise unchanged)
CREATE OR REPLACE FUNCTION public.reopen_order_atomic(p_order_id uuid, p_reason text DEFAULT NULL::text, p_performed_by uuid DEFAULT NULL::uuid, p_performed_by_terminal_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order RECORD;
  v_item  RECORD;
  v_rev   jsonb;
  v_reversed integer := 0;
BEGIN
  -- P-3: this is the single trusted path allowed to remove an order's payment
  -- records (full authorized reversal). Transaction-scoped flag read by
  -- trg_order_payment_immutable; external callers cannot forge it.
  PERFORM set_config('app.payment_ledger_reopen', 'on', true);

  PERFORM public.validate_actor(p_performed_by);

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status NOT IN ('paid','completed','partially_refunded','refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not paid/completed/refunded');
  END IF;

  FOR v_item IN
    SELECT oi.id FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    v_rev := public._inventory_reverse_item(v_item.id, 'reopen', p_performed_by);
    IF (v_rev->>'reversed')::int > 0 THEN
      v_reversed := v_reversed + (v_rev->>'reversed')::int;
    END IF;
  END LOOP;

  DELETE FROM public.order_payments WHERE order_id = p_order_id;

  UPDATE public.orders SET
    status = 'new',
    paid_amount = 0,
    cash_amount = 0,
    card_amount = 0,
    tip_amount = 0,
    paid_at = NULL,
    version = COALESCE(v_order.version, 0) + 1,
    updated_by_terminal_id = p_performed_by_terminal_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO public.operation_logs (
    table_number, order_id, action, old_values, new_values, performed_by
  ) VALUES (
    v_order.table_number, p_order_id, 'reopen_order',
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'new', 'reason', p_reason),
    p_performed_by
  );

  RETURN jsonb_build_object('success', true, 'reversed', v_reversed);
END;
$function$;

-- ===== B: underpayment close block (P3-F4b) =====
CREATE OR REPLACE FUNCTION public.trg_order_underpayment_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IN ('paid','closed')
     AND COALESCE(NEW.paid_amount, 0) > 0
     AND COALESCE(NEW.paid_amount, 0) < COALESCE(NEW.total_amount, 0) - 0.01 THEN
    RAISE EXCEPTION 'PAYMENT_INCOMPLETE: order cannot be % with paid_amount % < total_amount % (partial pay; keep the order open or void it)', NEW.status, NEW.paid_amount, NEW.total_amount USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_order_underpayment_guard ON public.orders;
CREATE TRIGGER trg_order_underpayment_guard
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_order_underpayment_guard();

COMMENT ON FUNCTION public.trg_order_underpayment_guard() IS 'P-3 (P3-F4b): an order may not enter paid/closed while partially paid (0 < paid_amount < total_amount). Full-amount and zero-amount (void) closes are unaffected. Legacy underpaid-closed rows are untouched (UPDATE-only guard).';

-- ===== sanity =====
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname='trg_order_payment_immutable';
  IF n <> 1 THEN RAISE EXCEPTION 'P-3 sanity: immutability trigger = % (expect 1)', n; END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE tgname='trg_order_underpayment_guard';
  IF n <> 1 THEN RAISE EXCEPTION 'P-3 sanity: underpayment trigger = % (expect 1)', n; END IF;
  SELECT count(*) INTO n FROM pg_proc WHERE proname='reopen_order_atomic' AND pronargs=4 AND pg_get_functiondef(oid) LIKE '%app.payment_ledger_reopen%';
  IF n <> 1 THEN RAISE EXCEPTION 'P-3 sanity: reopen flag patch = % (expect 1)', n; END IF;
  -- reopen must still reference its full body (flag added, not gutted)
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='reopen_order_atomic' AND pronargs=4 AND pg_get_functiondef(oid) LIKE '%DELETE FROM public.order_payments%') THEN
    RAISE EXCEPTION 'P-3 sanity: reopen_order_atomic lost its DELETE (rewrite truncated)';
  END IF;
END $$;
