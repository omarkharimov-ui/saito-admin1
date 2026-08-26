-- ============================================================
-- PAYMENT SYSTEM V2: Full lifecycle, idempotency, gift cards
-- ============================================================

-- 1. payment_methods — configurable payment method definitions
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key           text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  display_name_az text,
  icon          text,
  is_active     boolean DEFAULT true,
  allows_split  boolean DEFAULT true,
  allows_refund boolean DEFAULT true,
  allows_tip    boolean DEFAULT false,
  min_amount    numeric DEFAULT 0,
  max_amount    numeric,
  requires_authorization boolean DEFAULT false,
  sort_order    int DEFAULT 0,
  config        jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT NOW(),
  updated_at    timestamptz DEFAULT NOW()
);

-- Seed default payment methods
INSERT INTO public.payment_methods (key, display_name, display_name_az, icon, allows_tip, sort_order) VALUES
  ('cash', 'Cash', 'Nağd', 'Banknotes', true, 1),
  ('card', 'Card', 'Kart', 'CreditCard', true, 2),
  ('gift_card', 'Gift Card', 'Hədiyyə kartı', 'Gift', false, 3),
  ('room_charge', 'Room Charge', 'Otağa yazma', 'Hotel', false, 4),
  ('external', 'External', 'Xarici', 'ExternalLink', false, 5),
  ('transfer', 'Bank Transfer', 'Bank köçürməsi', 'Building2', false, 6),
  ('corporate', 'Corporate', 'Korporativ', 'Building', false, 7),
  ('online', 'Online', 'Onlayn', 'Globe', false, 8)
ON CONFLICT (key) DO NOTHING;


-- 2. payments — canonical payment records (replaces order_payments as primary)
CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id            uuid NOT NULL,
  payment_method      text NOT NULL,
  amount              numeric NOT NULL,
  tip_amount          numeric DEFAULT 0,
  cash_received       numeric,
  change_amount       numeric DEFAULT 0,
  currency            text DEFAULT 'AZN',
  status              text NOT NULL DEFAULT 'pending',
  provider            text,
  provider_transaction_id text,
  terminal_id         text,
  idempotency_key     text,
  split_group_id      uuid,
  is_partial          boolean DEFAULT false,
  is_refund           boolean DEFAULT false,
  refund_of_payment_id uuid,
  performed_by        uuid,
  performed_by_name   text,
  notes               text,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT NOW(),
  updated_at          timestamptz DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments (created_at);


-- 3. payment_attempts — each attempt to charge, with provider response
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id      uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  attempt_number  int NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pending',
  provider_response jsonb,
  provider_error  text,
  amount          numeric NOT NULL,
  terminal_id     text,
  started_at      timestamptz DEFAULT NOW(),
  completed_at    timestamptz,
  duration_ms     int
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON public.payment_attempts (payment_id);


-- 4. payment_refunds — dedicated refund records
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id          uuid NOT NULL REFERENCES public.payments(id),
  order_id            uuid NOT NULL,
  amount              numeric NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  reason              text,
  reason_text         text,
  provider_refund_id  text,
  performed_by        uuid,
  performed_by_name   text,
  approved_by         uuid,
  approved_by_name    text,
  requires_approval   boolean DEFAULT false,
  metadata            jsonb DEFAULT '{}'::jsonb,
  created_at          timestamptz DEFAULT NOW(),
  updated_at          timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON public.payment_refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order ON public.payment_refunds (order_id);


-- 5. gift_cards — gift card balances and tracking
CREATE TABLE IF NOT EXISTS public.gift_cards (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code            text NOT NULL UNIQUE,
  initial_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active',
  issued_to       uuid,
  issued_to_name  text,
  issued_by       uuid,
  expires_at      timestamptz,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT NOW(),
  updated_at      timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON public.gift_cards (code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON public.gift_cards (status);


-- 6. gift_card_transactions — every gift card movement
CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gift_card_id    uuid NOT NULL REFERENCES public.gift_cards(id),
  type            text NOT NULL,
  amount          numeric NOT NULL,
  balance_after   numeric NOT NULL,
  order_id        uuid,
  payment_id      uuid,
  performed_by    uuid,
  description     text,
  created_at      timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gct_card ON public.gift_card_transactions (gift_card_id);
CREATE INDEX IF NOT EXISTS idx_gct_type ON public.gift_card_transactions (type);


-- 7. Add cash_received to orders (persist tendered amount)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cash_received'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN cash_received numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'change_amount'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN change_amount numeric DEFAULT 0;
  END IF;
END $$;


-- ============================================================
-- UPDATED RPCs
-- ============================================================

-- complete_payment_atomic V2 — full lifecycle + cash_received + log_audit + idempotency
CREATE OR REPLACE FUNCTION public.complete_payment_atomic_v2(
  p_order_id     uuid,
  p_payments     jsonb DEFAULT '[]'::jsonb,
  p_payment_method text DEFAULT 'cash',
  p_cash_amount  numeric DEFAULT 0,
  p_card_amount  numeric DEFAULT 0,
  p_tip_amount   numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL,
  p_cash_drawer_session_id uuid DEFAULT NULL,
  p_cash_received numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_payment JSONB;
  v_total_paid NUMERIC := 0;
  v_payment_ids jsonb := '[]'::jsonb;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_cash_total NUMERIC := 0;
  v_card_total NUMERIC := 0;
  v_change NUMERIC := 0;
  v_remaining NUMERIC;
  v_new_status TEXT;
  v_new_payment_id uuid;
  v_idempotent_result jsonb;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT jsonb_build_object('success', true, 'idempotent', true, 'payment_id', id, 'amount', amount, 'status', status)
    INTO v_idempotent_result
    FROM public.payments
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN v_idempotent_result;
    END IF;
  END IF;

  -- Lock order
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Get performer name
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- REFUND path
  IF jsonb_array_length(p_payments) > 0 AND (p_payments->0->>'is_refund')::boolean = true THEN
    IF v_order.status != 'paid' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Can only refund paid orders');
    END IF;

    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
      -- Insert refund into payments
      INSERT INTO public.payments (order_id, payment_method, amount, status, is_refund, refund_of_payment_id, performed_by, performed_by_name, idempotency_key, provider, provider_transaction_id, terminal_id, notes, metadata)
      VALUES (
        p_order_id,
        COALESCE(v_payment->>'method', p_payment_method),
        -ABS((v_payment->>'amount')::numeric),
        'refunded',
        true,
        (v_payment->>'refund_of_payment_id')::uuid,
        p_performed_by,
        v_performer_name,
        p_idempotency_key,
        v_payment->>'provider',
        v_payment->>'provider_transaction_id',
        p_performed_by_terminal_id,
        v_payment->>'reason',
        jsonb_build_object('reason', v_payment->>'reason_text', 'source', 'refund')
      ) RETURNING id INTO v_payment_ids;

      -- Record refund attempt
      INSERT INTO public.payment_attempts (payment_id, attempt_number, status, provider_response, amount, terminal_id, started_at, completed_at)
      SELECT (v_payment_ids->>0)::uuid, 1, 'refunded', jsonb_build_object('refund', true), ABS((v_payment->>'amount')::numeric), p_performed_by_terminal_id, v_now, v_now;

      v_total_paid := v_total_paid + ABS((v_payment->>'amount')::numeric);
    END LOOP;

    -- Update order
    UPDATE public.orders SET
      paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_total_paid),
      refund_amount = COALESCE(refund_amount, 0) + v_total_paid,
      refund_reason = (p_payments->0->>'reason_text'),
      refunded_at = v_now,
      updated_at = v_now,
      version = COALESCE(version, 0) + 1
    WHERE id = p_order_id;

    -- Audit
    PERFORM public.log_audit(
      'refund', 'order', p_order_id::text,
      p_performed_by, v_performer_name,
      jsonb_build_object('paid_amount', v_order.paid_amount, 'status', v_order.status),
      jsonb_build_object('refund_amount', v_total_paid, 'new_paid_amount', GREATEST(0, COALESCE(v_order.paid_amount, 0) - v_total_paid)),
      jsonb_build_object('payments', p_payments),
      NULL
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'refund',
      'refund_amount', v_total_paid,
      'new_paid_amount', GREATEST(0, COALESCE(v_order.paid_amount, 0) - v_total_paid),
      'payment_ids', v_payment_ids,
      'timestamp', v_now
    );
  END IF;

  -- NORMAL PAYMENT path
  -- Check if already fully paid
  IF v_order.status = 'paid' AND COALESCE(v_order.paid_amount, 0) >= v_order.total_amount THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'Order already paid');
  END IF;

  -- Calculate cash vs card totals
  IF jsonb_array_length(p_payments) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
      DECLARE
        v_method text := COALESCE(v_payment->>'method', p_payment_method);
        v_amount numeric := (v_payment->>'amount')::numeric;
      BEGIN
        -- Determine status based on method
        v_new_status := CASE
          WHEN v_method = 'cash' THEN 'captured'
          WHEN v_method IN ('card', 'qr') THEN 'authorized'
          WHEN v_method = 'gift_card' THEN 'captured'
          ELSE 'pending'
        END;

        INSERT INTO public.payments (
          order_id, payment_method, amount, tip_amount, cash_received,
          status, provider, provider_transaction_id, terminal_id,
          idempotency_key, split_group_id, is_partial,
          performed_by, performed_by_name, notes, metadata
        ) VALUES (
          p_order_id, v_method, v_amount,
          COALESCE((v_payment->>'tip')::numeric, 0),
          CASE WHEN v_method = 'cash' THEN (v_payment->>'cash_received')::numeric ELSE NULL END,
          v_new_status,
          v_payment->>'provider',
          v_payment->>'transaction_id',
          COALESCE(v_payment->>'terminal_id', p_performed_by_terminal_id),
          CASE WHEN p_idempotency_key IS NOT NULL THEN p_idempotency_key || '-' || v_method ELSE NULL END,
          (v_payment->>'split_group_id')::uuid,
          true,
          p_performed_by, v_performer_name,
          v_payment->>'notes',
          v_payment->'metadata'
        ) RETURNING id INTO v_new_payment_id;

        v_payment_ids := v_payment_ids || to_jsonb(v_new_payment_id);

        -- Record attempt
        INSERT INTO public.payment_attempts (payment_id, attempt_number, status, provider_response, amount, terminal_id, completed_at)
        VALUES (v_new_payment_id, 1, v_new_status, jsonb_build_object('method', v_method), v_amount, p_performed_by_terminal_id, v_now);

        -- Cash change calc
        IF v_method = 'cash' THEN
          v_cash_total := v_cash_total + v_amount;
          IF (v_payment->>'cash_received')::numeric IS NOT NULL THEN
            v_change := v_change + GREATEST(0, (v_payment->>'cash_received')::numeric - v_amount);
          END IF;
        ELSE
          v_card_total := v_card_total + v_amount;
        END IF;

        v_total_paid := v_total_paid + v_amount;
      END;
    END LOOP;
  ELSE
    -- Legacy single payment
    v_new_status := CASE
      WHEN p_payment_method = 'cash' THEN 'captured'
      WHEN p_payment_method IN ('card', 'qr') THEN 'authorized'
      ELSE 'pending'
    END;

    INSERT INTO public.payments (
      order_id, payment_method, amount, tip_amount, cash_received, change_amount,
      status, terminal_id, idempotency_key,
      performed_by, performed_by_name, metadata
    ) VALUES (
      p_order_id, p_payment_method,
      COALESCE(NULLIF(p_cash_amount, 0) + NULLIF(p_card_amount, 0), p_cash_amount + p_card_amount),
      p_tip_amount, p_cash_received,
      CASE WHEN p_payment_method = 'cash' AND p_cash_received > 0 THEN GREATEST(0, p_cash_received - p_cash_amount) ELSE 0 END,
      v_new_status, p_performed_by_terminal_id, p_idempotency_key,
      p_performed_by, v_performer_name,
      jsonb_build_object('legacy', true)
    ) RETURNING id INTO v_new_payment_id;

    v_payment_ids := v_payment_ids || to_jsonb(v_new_payment_id);
    v_total_paid := COALESCE(NULLIF(p_cash_amount, 0) + NULLIF(p_card_amount, 0), p_cash_amount + p_card_amount);
    v_cash_total := p_cash_amount;
    v_card_total := p_card_amount;
    v_change := CASE WHEN p_payment_method = 'cash' AND p_cash_received > 0 THEN GREATEST(0, p_cash_received - p_cash_amount) ELSE 0 END;

    INSERT INTO public.payment_attempts (payment_id, attempt_number, status, amount, terminal_id, completed_at)
    VALUES (v_new_payment_id, 1, v_new_status, v_total_paid, p_performed_by_terminal_id, v_now);
  END IF;

  -- Calculate new totals
  v_remaining := v_order.total_amount - COALESCE(v_order.paid_amount, 0) - v_total_paid;
  v_new_status := CASE
    WHEN v_remaining <= 0 THEN 'paid'
    WHEN COALESCE(v_order.paid_amount, 0) + v_total_paid > 0 THEN v_order.status
    ELSE v_order.status
  END;

  -- Update order
  UPDATE public.orders SET
    paid_amount = COALESCE(paid_amount, 0) + v_total_paid,
    cash_amount = COALESCE(cash_amount, 0) + v_cash_total,
    card_amount = COALESCE(card_amount, 0) + v_card_total,
    tip_amount = COALESCE(tip_amount, 0) + p_tip_amount,
    discount_amount = p_discount_amount,
    discount_type = p_discount_type,
    payment_method = p_payment_method,
    status = v_new_status,
    cash_received = COALESCE(cash_received, 0) + COALESCE(p_cash_received, v_cash_total),
    change_amount = COALESCE(change_amount, 0) + v_change,
    paid_at = CASE WHEN v_new_status = 'paid' AND v_order.status != 'paid' THEN v_now ELSE paid_at END,
    updated_at = v_now,
    version = COALESCE(version, 0) + 1
  WHERE id = p_order_id;

  -- Audit
  PERFORM public.log_audit(
    'payment', 'order', p_order_id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('status', v_order.status, 'paid_amount', v_order.paid_amount),
    jsonb_build_object('status', v_new_status, 'paid_amount', COALESCE(v_order.paid_amount, 0) + v_total_paid, 'payment_method', p_payment_method, 'amount', v_total_paid),
    jsonb_build_object('payments', p_payments, 'cash_received', p_cash_received, 'change', v_change, 'idempotency_key', p_idempotency_key),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'payment',
    'paid_amount', COALESCE(v_order.paid_amount, 0) + v_total_paid,
    'total_amount', v_order.total_amount,
    'remaining', GREATEST(0, v_remaining),
    'is_fully_paid', v_remaining <= 0,
    'status', v_new_status,
    'cash_received', p_cash_received,
    'change', v_change,
    'tip_amount', p_tip_amount,
    'payment_ids', v_payment_ids,
    'idempotent', false,
    'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_payment_atomic_v2(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid, numeric, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_payment_atomic_v2(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.complete_payment_atomic_v2(uuid, jsonb, text, numeric, numeric, numeric, numeric, text, uuid, text, uuid, numeric, text) FROM authenticated;


-- record_payment_attempt — log every attempt
CREATE OR REPLACE FUNCTION public.record_payment_attempt(
  p_payment_id   uuid,
  p_status       text,
  p_amount       numeric,
  p_provider_response jsonb DEFAULT NULL,
  p_provider_error text DEFAULT NULL,
  p_terminal_id  text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_next_attempt int;
  v_attempt_id uuid;
BEGIN
  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt
  FROM public.payment_attempts WHERE payment_id = p_payment_id;

  INSERT INTO public.payment_attempts (payment_id, attempt_number, status, provider_response, provider_error, amount, terminal_id, completed_at)
  VALUES (p_payment_id, v_next_attempt, p_status, p_provider_response, p_provider_error, p_amount, p_terminal_id, NOW())
  RETURNING id INTO v_attempt_id;

  -- Update payment status if terminal response
  IF p_status IN ('authorized', 'captured', 'failed', 'declined') THEN
    UPDATE public.payments SET status = p_status, updated_at = NOW() WHERE id = p_payment_id;
  END IF;

  RETURN v_attempt_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_payment_attempt(uuid, text, numeric, jsonb, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_payment_attempt(uuid, text, numeric, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_payment_attempt(uuid, text, numeric, jsonb, text, text) FROM authenticated;


-- update_payment_status — explicit status transitions with validation
CREATE OR REPLACE FUNCTION public.update_payment_status(
  p_payment_id uuid,
  p_new_status text,
  p_provider_response jsonb DEFAULT NULL,
  p_provider_transaction_id text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_payment RECORD;
  v_valid_transitions jsonb := '{
    "pending": ["processing", "cancelled"],
    "processing": ["authorized", "captured", "failed", "declined", "cancelled", "unknown"],
    "authorized": ["captured", "voided", "cancelled"],
    "captured": ["settled", "refunded", "partially_refunded"],
    "failed": ["pending", "processing"],
    "declined": ["pending", "processing"],
    "unknown": ["captured", "failed", "cancelled"],
    "refunded": [],
    "partially_refunded": ["refunded"],
    "voided": [],
    "cancelled": [],
    "settled": []
  }'::jsonb;
  v_allowed jsonb;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  v_allowed := v_valid_transitions->v_payment.status;
  IF v_allowed IS NULL OR NOT (v_allowed ? p_new_status) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid transition: ' || v_payment.status || ' → ' || p_new_status,
      'current_status', v_payment.status,
      'allowed', v_allowed
    );
  END IF;

  UPDATE public.payments SET
    status = p_new_status,
    provider_transaction_id = COALESCE(p_provider_transaction_id, provider_transaction_id),
    updated_at = NOW()
  WHERE id = p_payment_id;

  -- Record attempt
  PERFORM public.record_payment_attempt(p_payment_id, p_new_status, v_payment.amount, p_provider_response, NULL, v_payment.terminal_id);

  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_payment.status,
    'new_status', p_new_status,
    'payment_id', p_payment_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_payment_status(uuid, text, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.update_payment_status(uuid, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_payment_status(uuid, text, jsonb, text) FROM authenticated;


-- gift_card_issue
CREATE OR REPLACE FUNCTION public.gift_card_issue(
  p_code          text,
  p_initial_balance numeric,
  p_issued_to     uuid DEFAULT NULL,
  p_issued_to_name text DEFAULT NULL,
  p_issued_by     uuid DEFAULT NULL,
  p_expires_at    timestamptz DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_card RECORD;
  v_performer_name TEXT;
BEGIN
  IF p_initial_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance must be positive');
  END IF;

  IF p_issued_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_issued_by;
  END IF;

  INSERT INTO public.gift_cards (code, initial_balance, current_balance, issued_to, issued_to_name, issued_by, expires_at)
  VALUES (UPPER(TRIM(p_code)), p_initial_balance, p_initial_balance, p_issued_to, p_issued_to_name, p_issued_by, p_expires_at)
  RETURNING * INTO v_card;

  INSERT INTO public.gift_card_transactions (gift_card_id, type, amount, balance_after, performed_by, description)
  VALUES (v_card.id, 'issue', p_initial_balance, p_initial_balance, p_issued_by, 'Hədiyyə kartı buraxıldı');

  PERFORM public.log_audit(
    'gift_card_issue', 'gift_card', v_card.id::text,
    p_issued_by, v_performer_name,
    NULL,
    jsonb_build_object('code', p_code, 'balance', p_initial_balance),
    jsonb_build_object('card_id', v_card.id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card.id,
    'code', p_code,
    'balance', p_initial_balance
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gift_card_issue(text, numeric, uuid, text, uuid, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.gift_card_issue(text, numeric, uuid, text, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.gift_card_issue(text, numeric, uuid, text, uuid, timestamptz) FROM authenticated;


-- gift_card_redeem
CREATE OR REPLACE FUNCTION public.gift_card_redeem(
  p_code          text,
  p_amount        numeric,
  p_order_id      uuid DEFAULT NULL,
  p_performed_by  uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_card RECORD;
  v_performer_name TEXT;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
  WHERE code = UPPER(TRIM(p_code)) AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found or inactive');
  END IF;

  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card expired');
  END IF;

  IF v_card.current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_card.current_balance);
  END IF;

  v_new_balance := v_card.current_balance - p_amount;

  UPDATE public.gift_cards SET current_balance = v_new_balance, updated_at = NOW() WHERE id = v_card.id;

  INSERT INTO public.gift_card_transactions (gift_card_id, type, amount, balance_after, order_id, performed_by, description)
  VALUES (v_card.id, 'redeem', p_amount, v_new_balance, p_order_id, p_performed_by, 'Ödəniş üçün istifadə');

  -- Auto-deactivate if depleted
  IF v_new_balance = 0 THEN
    UPDATE public.gift_cards SET status = 'depleted', updated_at = NOW() WHERE id = v_card.id;
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  PERFORM public.log_audit(
    'gift_card_redeem', 'gift_card', v_card.id::text,
    p_performed_by, v_performer_name,
    jsonb_build_object('balance', v_card.current_balance),
    jsonb_build_object('redeemed', p_amount, 'new_balance', v_new_balance, 'order_id', p_order_id),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_card.id,
    'code', p_code,
    'redeemed', p_amount,
    'remaining_balance', v_new_balance
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gift_card_redeem(text, numeric, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gift_card_redeem(text, numeric, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.gift_card_redeem(text, numeric, uuid, uuid) FROM authenticated;


-- void_payment_atomic V2 — with payment table + audit
CREATE OR REPLACE FUNCTION public.void_payment_atomic_v2(
  p_order_id     text,
  p_items        jsonb,
  p_performed_by uuid DEFAULT NULL,
  p_performed_by_terminal_id text DEFAULT NULL,
  p_reason       text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_item JSONB;
  v_oi RECORD;
  v_new_qty INT;
  v_performer_name TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_order_id IS NULL OR p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_id and items required');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id::uuid AND status IN ('active', 'ready', 'confirmed')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or not in voidable status');
  END IF;

  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  -- Reverse stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    PERFORM public.reverse_stock_deduction_for_items(
      jsonb_build_array(
        jsonb_build_object('order_item_id', v_item->>'order_item_id', 'reverse_qty', (v_item->>'quantity')::int)
      )::text
    );
  END LOOP;

  -- Delete/reduce items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF (v_item->>'quantity')::int >= v_oi.quantity THEN
      DELETE FROM public.order_items WHERE id = (v_item->>'order_item_id')::uuid;
    ELSE
      v_new_qty := v_oi.quantity - (v_item->>'quantity')::int;
      UPDATE public.order_items SET quantity = v_new_qty, total_price = COALESCE(unit_price, 0) * v_new_qty
      WHERE id = (v_item->>'order_item_id')::uuid;
    END IF;
  END LOOP;

  -- Record in cancelled_orders
  INSERT INTO public.cancelled_orders (order_id, reason, reason_text, items, created_at)
  VALUES (p_order_id::uuid, 'void', COALESCE(p_reason, 'Kassir tərəfindən ləğv edildi (Void)'), p_items, v_now);

  -- Update order total
  UPDATE public.orders SET
    total_amount = GREATEST(0, (SELECT COALESCE(SUM(total_price), 0) FROM public.order_items WHERE order_id = p_order_id::uuid)),
    kitchen_status = 'pending'
  WHERE id = p_order_id::uuid;

  -- Audit
  PERFORM public.log_audit(
    'void_items', 'order', p_order_id,
    p_performed_by, v_performer_name,
    NULL,
    jsonb_build_object('items', p_items, 'terminal_id', p_performed_by_terminal_id, 'reason', p_reason),
    jsonb_build_object('order_id', p_order_id),
    NULL
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'void',
    'voided_items', jsonb_array_length(p_items),
    'order_id', p_order_id,
    'timestamp', v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_payment_atomic_v2(text, jsonb, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.void_payment_atomic_v2(text, jsonb, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.void_payment_atomic_v2(text, jsonb, uuid, text, text) FROM authenticated;


-- payment_reconciliation — end-of-day payment reconciliation
CREATE OR REPLACE FUNCTION public.payment_reconciliation(
  p_date date DEFAULT CURRENT_DATE,
  p_performed_by uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_performer_name TEXT;
BEGIN
  IF p_performed_by IS NOT NULL THEN
    SELECT name INTO v_performer_name FROM public.staff WHERE id = p_performed_by;
  END IF;

  SELECT jsonb_build_object(
    'date', p_date,
    'summary', (
      SELECT jsonb_build_object(
        'total_payments', COALESCE(SUM(amount), 0),
        'total_tips', COALESCE(SUM(tip_amount), 0),
        'by_method', (
          SELECT jsonb_object_agg(payment_method, method_total)
          FROM (
            SELECT payment_method, jsonb_build_object('count', COUNT(*), 'total', SUM(amount)) as method_total
            FROM public.payments
            WHERE DATE(created_at) = p_date AND status IN ('captured', 'authorized', 'settled') AND is_refund = false
            GROUP BY payment_method
          ) sub
        ),
        'total_refunds', COALESCE((SELECT SUM(ABS(amount)) FROM public.payments WHERE DATE(created_at) = p_date AND is_refund = true AND status = 'refunded'), 0),
        'refund_count', (SELECT COUNT(*) FROM public.payments WHERE DATE(created_at) = p_date AND is_refund = true),
        'failed_count', (SELECT COUNT(*) FROM public.payments WHERE DATE(created_at) = p_date AND status IN ('failed', 'declined')),
        'pending_count', (SELECT COUNT(*) FROM public.payments WHERE DATE(created_at) = p_date AND status IN ('pending', 'processing', 'unknown')),
        'void_count', (SELECT COUNT(*) FROM public.payments WHERE DATE(created_at) = p_date AND status = 'voided')
      )
      FROM public.payments
      WHERE DATE(created_at) = p_date AND is_refund = false
    )
  ) INTO v_result;

  PERFORM public.log_audit(
    'payment_reconciliation', 'system', p_date::text,
    p_performed_by, v_performer_name,
    NULL, v_result, NULL, NULL
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.payment_reconciliation(date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.payment_reconciliation(date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.payment_reconciliation(date, uuid) FROM authenticated;


-- payment_reports — detailed payment analytics
CREATE OR REPLACE FUNCTION public.payment_reports(
  p_from date DEFAULT (CURRENT_DATE - interval '7 days'),
  p_to   date DEFAULT CURRENT_DATE
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', (
      SELECT jsonb_build_object(
        'total_payments', COALESCE(SUM(amount), 0),
        'total_tips', COALESCE(SUM(tip_amount), 0),
        'total_refunds', COALESCE((SELECT SUM(ABS(amount)) FROM public.payments WHERE DATE(created_at) BETWEEN p_from AND p_to AND is_refund = true), 0),
        'net_revenue', COALESCE(SUM(amount), 0) - COALESCE((SELECT SUM(ABS(amount)) FROM public.payments WHERE DATE(created_at) BETWEEN p_from AND p_to AND is_refund = true), 0)
      )
      FROM public.payments
      WHERE DATE(created_at) BETWEEN p_from AND p_to AND is_refund = false AND status IN ('captured', 'authorized', 'settled')
    ),
    'by_method', (
      SELECT jsonb_object_agg(payment_method, method_data)
      FROM (
        SELECT payment_method,
          jsonb_build_object(
            'count', COUNT(*),
            'total', SUM(amount),
            'tips', COALESCE(SUM(tip_amount), 0),
            'refunds', COALESCE((SELECT SUM(ABS(amount)) FROM public.payments r WHERE r.payment_method = p.payment_method AND DATE(r.created_at) BETWEEN p_from AND p_to AND r.is_refund = true), 0)
          ) as method_data
        FROM public.payments p
        WHERE DATE(created_at) BETWEEN p_from AND p_to AND is_refund = false AND status IN ('captured', 'authorized', 'settled')
        GROUP BY payment_method
      ) sub
    ),
    'by_day', (
      SELECT jsonb_object_agg(day, day_data)
      FROM (
        SELECT DATE(created_at) as day,
          jsonb_build_object(
            'total', SUM(amount),
            'tips', COALESCE(SUM(tip_amount), 0),
            'count', COUNT(*)
          ) as day_data
        FROM public.payments
        WHERE DATE(created_at) BETWEEN p_from AND p_to AND is_refund = false AND status IN ('captured', 'authorized', 'settled')
        GROUP BY DATE(created_at)
      ) sub
    ),
    'status_breakdown', (
      SELECT jsonb_object_agg(status, status_count)
      FROM (
        SELECT status, COUNT(*) as status_count
        FROM public.payments
        WHERE DATE(created_at) BETWEEN p_from AND p_to
        GROUP BY status
      ) sub
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.payment_reports(date, date) TO service_role;
REVOKE ALL ON FUNCTION public.payment_reports(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.payment_reports(date, date) FROM authenticated;
