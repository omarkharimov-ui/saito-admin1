CREATE FUNCTION public.fn_record_cash_payment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_session_id uuid;
  v_amount numeric;
BEGIN
  -- Yalnız nağd ödənişləri izlə
  IF NEW.payment_method != 'cash' THEN
    RETURN NEW;
  END IF;

  -- Aktiv kassa sessiyası tap
  SELECT id INTO v_session_id
  FROM cash_drawer_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.paid_amount, 0) - COALESCE(NEW.tip_amount, 0);

  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO cash_drawer_log (session_id, type, amount, description, order_id)
  VALUES (v_session_id, 'payment', v_amount, 'Nağd ödəniş', NEW.id);

  RETURN NEW;
END;
$function$;

GRANT ALL ON FUNCTION public.fn_record_cash_payment() TO anon;

GRANT ALL ON FUNCTION public.fn_record_cash_payment() TO authenticated;

GRANT ALL ON FUNCTION public.fn_record_cash_payment() TO service_role;