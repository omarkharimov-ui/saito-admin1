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
$function$

