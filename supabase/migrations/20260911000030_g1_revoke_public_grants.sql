-- ============================================================================
-- 20260911000030 — O / G1 (hardening): ACL closure on the new/changed order
--                   entry points (drop + recreate reset the explicit grant
--                   list -> defaulted to PUBLIC)
--
-- transition_order_atomic / transition_delivery_status / cancel_loss_table
-- now have explicit proacl; ensure ONLY service_role (canonical server path)
-- keeps EXECUTE. anon / authenticated / PUBLIC must NOT call these over
-- PostgREST. (Verified post-apply: proacl = {postgres=X, service_role=X}.)
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.transition_order_atomic(text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_order_atomic(text, uuid, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_order_atomic(text, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text) FROM anon;

-- ensure the canonical server path keeps EXECUTE
GRANT EXECUTE ON FUNCTION public.transition_order_atomic(text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text) TO service_role;

DO $$
BEGIN
  IF NOT has_function_privilege('service_role','public.transition_order_atomic(text, uuid, text, text, jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text)','EXECUTE')
     OR has_function_privilege('anon','public.transition_order_atomic(text, uuid, text, text, jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.transition_delivery_status(text, uuid, text, uuid, text, text, jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.cancel_loss_table(text, integer, text, text, numeric, jsonb, uuid, text)','EXECUTE')
  THEN
    RAISE EXCEPTION 'G1-HARDEN FAIL-SAFE: entry-point ACL not service-role-only';
  END IF;
END;
$$;
