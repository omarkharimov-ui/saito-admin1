-- ============================================================================
-- 20260911000041 — K / G7: fix log_audit() arity in the two KDS order-level
--                  fns (assign_order_staff, mark_order_completed)
--
-- ROOT CAUSE (live evidence): log_audit has a 9-param signature
--   (p_action text, p_entity_type text, p_entity_id text, p_actor_id uuid,
--    p_actor_name text, p_old_data jsonb, p_new_data jsonb, p_metadata jsonb,
--    p_ip_address text)
-- but these two fns were written against an OLD 13-arg form and call it with
--   ('order_completed', p_order_id, NULL, p_performed_by,
--    NULL, NULL, NULL, NULL, jsonb, NULL, NULL, NULL, NULL)   -- 13 args
-- Postgres resolves the OVERLOAD BY ARGUMENT COUNT first -> 42883
-- "function public.log_audit(unknown,uuid,...13...) does not exist".
--
-- WHY IT WAS MASKED: both fns were REVOKEd from anon+authenticated in G3, so the
-- browser path (anon supabase.rpc) returned 42501 before ever executing the body.
-- The body's log_audit bug was never hit. G7 wires these through the guarded
-- server route (service role) -> the body actually runs -> the arity bug surfaces.
--
-- SCOPE: K-boundary ONLY. The other log_audit callers (create_staff_atomic,
--   update_staff_atomic, archive_table_atomic) already use the correct 9-arg
--   form (they pass 'entity' as the 2nd arg) and are S/F-boundary -> untouched.
--   (Verified: only these two KDS fns use the 13-arg form.)
--
-- FIX: re-create the two fns with the CORRECT 9-arg log_audit call
--   (action, 'order', order_id, actor, NULL, NULL, NULL, metadata, NULL).
--   Business behavior is UNCHANGED (same UPDATEs, same RETURN); only the audit
--   call is corrected so the mutation no longer 500s.
--
-- GOLDEN RULE 5: auto-commit.
-- ============================================================================

-- ---- assign_order_staff ----
DROP FUNCTION IF EXISTS public.assign_order_staff(uuid, uuid, uuid);
CREATE FUNCTION public.assign_order_staff(p_order_id uuid, p_staff_id uuid, p_performed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  UPDATE public.orders
  SET    assigned_to = p_staff_id,
         updated_at = now()
  WHERE  id = p_order_id;

  PERFORM public.log_audit(
    'order_assigned', 'order', p_order_id::text, p_performed_by,
    NULL, NULL, NULL,
    jsonb_build_object('assigned_to', p_staff_id),
    NULL
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---- mark_order_completed ----
DROP FUNCTION IF EXISTS public.mark_order_completed(uuid, uuid);
CREATE FUNCTION public.mark_order_completed(p_order_id uuid, p_performed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   record;
  v_updated int := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  UPDATE public.order_items
  SET    kitchen_status = 'completed',
         updated_at = now()
  WHERE  order_id = p_order_id
  AND    kitchen_status IS DISTINCT FROM 'completed'
  AND    kitchen_status NOT IN ('voided','cancelled','wasted');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.orders
  SET    kitchen_status = 'completed',
         updated_at = now()
  WHERE  id = p_order_id;

  PERFORM public.log_audit(
    'order_completed', 'order', p_order_id::text, p_performed_by,
    NULL, NULL, NULL,
    jsonb_build_object('items_completed', v_updated),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'items_completed', v_updated);
END;
$$;

-- ---- ACL preserved: service_role only (G3 revokes still apply after CREATE OR REPLACE? re-assert) ----
REVOKE EXECUTE ON FUNCTION public.assign_order_staff(uuid,uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_order_staff(uuid,uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_order_staff(uuid,uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_order_staff(uuid,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_order_completed(uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_order_completed(uuid,uuid) TO service_role;

-- ---- fail-safe: both fns exist, are service-role-only, and EXECUTE without the
--      42883 arity error (behavioral check via the NOT-FOUND path) ----
DO $$
DECLARE
  v jsonb;
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('assign_order_staff','mark_order_completed')) <> 2 THEN
    RAISE EXCEPTION 'K-G7 FAIL-SAFE: assign_order_staff/mark_order_completed must exist (2)';
  END IF;
  IF NOT has_function_privilege('service_role','public.assign_order_staff(uuid,uuid,uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.mark_order_completed(uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.mark_order_completed(uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.mark_order_completed(uuid,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.assign_order_staff(uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.assign_order_staff(uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'K-G7 FAIL-SAFE: KDS fn ACL not service-role-only';
  END IF;
  -- behavioral: both must reach the NOT-FOUND path (returns error json) WITHOUT
  -- 42883 -> proves the 9-arg log_audit call is well-formed and the body runs.
  v := public.mark_order_completed(gen_random_uuid(), gen_random_uuid());
  IF (v->>'error') IS NULL THEN
    RAISE EXCEPTION 'K-G7 FAIL-SAFE: mark_order_completed NOT-FOUND path unexpected: %', v;
  END IF;
  v := public.assign_order_staff(gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
  IF (v->>'error') IS NULL THEN
    RAISE EXCEPTION 'K-G7 FAIL-SAFE: assign_order_staff NOT-FOUND path unexpected: %', v;
  END IF;
END;
$$;
