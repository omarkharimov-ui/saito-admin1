-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-26 (owner, Task 50): delivery production — dynamic fee + courier SSOT
--
-- 1) settings.delivery_fee_multiplier — Wolt-style SURGE factor (default 1.0,
--    0.5..10). Manager raises it during rain/rush; both calculate_delivery_fee
--    overloads multiply the resolved zone fee by it and return the factor for
--    transparent UI ("×1.5").
-- 2) get_courier_staff() — "Kuryer təyin et" SSOT fix: the picker read the
--    LEGACY couriers table (0 rows) while Task 37 moved couriers into staff
--    (role 'courier'). New RPC unions active courier-role staff + active
--    legacy couriers. orders.courier_id has NO FK → staff ids assign safely.
-- ══════════════════════════════════════════════════════════════════════════

alter table public.settings
  add column if not exists delivery_fee_multiplier numeric
  constraint settings_delivery_fee_multiplier_check
  check (delivery_fee_multiplier between 0.5 and 10);

update public.settings set delivery_fee_multiplier = 1 where delivery_fee_multiplier is null;

CREATE OR REPLACE FUNCTION public.calculate_delivery_fee(p_zone_name text, p_order_amount numeric DEFAULT 0, p_customer_address text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_zone RECORD;
  v_mult numeric := 1;
BEGIN
  SELECT COALESCE(delivery_fee_multiplier, 1) INTO v_mult FROM public.settings LIMIT 1;
  SELECT * INTO v_zone
  FROM delivery_zones
  WHERE LOWER(name) = LOWER(p_zone_name)
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Zone not found',
      'fee', 0,
      'zone', p_zone_name
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'fee', COALESCE(v_zone.fee, 0) * v_mult,
    'fee_multiplier', v_mult,
    'zone', v_zone.name,
    'free_delivery_threshold', v_zone.free_delivery_threshold,
    'estimated_minutes', v_zone.estimated_minutes,
    'is_free', p_order_amount >= COALESCE(v_zone.free_delivery_threshold, 9999999)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_delivery_fee(p_zone_name text DEFAULT NULL::text, p_order_amount numeric DEFAULT 0, p_distance_km numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_zone    public.delivery_zones%ROWTYPE;
  v_zone_id uuid;
  v_global  record;
  v_fee       numeric;
  v_threshold numeric;
  v_min_order numeric;
  v_eta_min   integer;
  v_eta_max   integer;
  v_by_name   boolean := false;
  v_mult      numeric := 1;
BEGIN
  -- 4.1 explicit zone selection (POS picked a chip) always wins
  IF p_zone_name IS NOT NULL AND btrim(p_zone_name) <> '' THEN
    SELECT * INTO v_zone
      FROM public.delivery_zones
     WHERE LOWER(name) = LOWER(btrim(p_zone_name))
       AND is_active = true
     LIMIT 1;
    IF FOUND THEN
      v_by_name := true;
    ELSE
      v_zone := NULL;
    END IF;
  END IF;

  -- 4.2 fallback: resolve by distance (min_km <= d < max_km; priority ASC)
  IF NOT v_by_name AND p_distance_km IS NOT NULL THEN
    SELECT * INTO v_zone
      FROM public.delivery_zones
     WHERE is_active = true
       AND (min_km IS NULL OR p_distance_km >= min_km)
       AND (max_km IS NULL OR p_distance_km < max_km)
     ORDER BY priority ASC, name ASC
     LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Zone not found',
      'fee', 0,
      'zone', p_zone_name,
      'free_delivery_threshold', NULL,
      'min_order_amount', NULL,
      'estimated_minutes_min', NULL,
      'estimated_minutes_max', NULL,
      'is_free', false,
      'min_order_ok', true,
      'resolved_by', 'none'
    );
  END IF;

  v_zone_id := v_zone.id;

  -- global fallbacks (single settings row)
  SELECT delivery_fee, free_delivery_threshold, min_order_amount
    INTO v_global
    FROM public.v_settings_delivery
   LIMIT 1;

  SELECT COALESCE(delivery_fee_multiplier, 1) INTO v_mult FROM public.settings LIMIT 1;

  v_fee       := round(COALESCE(v_zone.fee, v_global.delivery_fee, 0) * v_mult, 2);
  v_threshold := COALESCE(v_zone.free_delivery_threshold, v_global.free_delivery_threshold);
  v_min_order := COALESCE(v_zone.min_order, v_global.min_order_amount);
  v_eta_min   := COALESCE(v_zone.est_minutes_min, v_zone.estimated_minutes);
  v_eta_max   := COALESCE(v_zone.est_minutes_max, v_zone.estimated_minutes);

  RETURN jsonb_build_object(
    'success', true,
    'zone', v_zone.name,
    'zone_id', v_zone_id,
    'fee', v_fee,
    'free_delivery_threshold', v_threshold,
    'min_order_amount', v_min_order,
    'estimated_minutes_min', v_eta_min,
    'estimated_minutes_max', v_eta_max,
    'is_free', (v_threshold IS NOT NULL AND p_order_amount >= v_threshold),
    'min_order_ok', (v_min_order IS NULL OR p_order_amount >= v_min_order),
    'fee_multiplier', v_mult,
    'resolved_by', CASE WHEN v_by_name THEN 'name' ELSE 'distance' END
  );
END;
$function$;



create or replace function public.get_courier_staff()
returns table (id uuid, name text, phone text, source text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name, s.phone, 'staff'
  from public.staff s
  join public.roles r on r.id = s.role_id
  where r.name = 'courier' and s.is_active = true
  union all
  select c.id, c.name, c.phone, 'legacy'
  from public.couriers c
  where c.is_active = true
  order by 3 nulls last, 2;
$$;

revoke execute on function public.get_courier_staff() from public, anon;
grant execute on function public.get_courier_staff() to authenticated, service_role;
