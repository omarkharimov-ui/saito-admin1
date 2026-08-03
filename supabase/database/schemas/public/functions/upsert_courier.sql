CREATE FUNCTION public.upsert_courier (
  p_id           uuid DEFAULT NULL::uuid,
  p_name         text DEFAULT ''::text,
  p_phone        text DEFAULT NULL::text,
  p_vehicle_type text DEFAULT 'car'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_name = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE couriers SET
      name = p_name,
      phone = COALESCE(p_phone, phone),
      vehicle_type = COALESCE(p_vehicle_type, vehicle_type),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      INSERT INTO couriers (name, phone, vehicle_type)
      VALUES (p_name, p_phone, p_vehicle_type)
      RETURNING id INTO v_id;
    END IF;
  ELSE
    INSERT INTO couriers (name, phone, vehicle_type)
    VALUES (p_name, p_phone, p_vehicle_type)
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'courier_id', v_id);
END;
$function$;

GRANT ALL ON FUNCTION public.upsert_courier(uuid, text, text, text) TO anon;

GRANT ALL ON FUNCTION public.upsert_courier(uuid, text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.upsert_courier(uuid, text, text, text) TO service_role;