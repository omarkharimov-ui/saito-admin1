-- ============================================================================
-- 11y (owner: "ünvan seçdikdə qiymət görünməlidir + zonaya ehtiyac qalmayacaq"):
-- OUT-OF-RANGE DISTANCE FEE. Before: km beyond every zone band → "Zone not
-- found", fee 0 → the POS showed no price. Now: furthest active zone + a
-- per-km surcharge for the overage (settings.delivery_per_km_rate, default
-- ₼0.50). No zones at all → pure distance fee (km × rate). The fee is ALWAYS
-- resolved from a distance → the operator never needs to pick a zone.
-- ============================================================================

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS delivery_per_km_rate numeric(6,2) DEFAULT 0.50;

COMMENT ON COLUMN public.settings.delivery_per_km_rate IS
  '11y: per-km surcharge beyond the furthest active zone (distance fee when out of radius).';

DROP VIEW IF EXISTS public.v_settings_delivery;
CREATE VIEW public.v_settings_delivery AS
SELECT delivery_fee,
       free_delivery_threshold,
       min_order_amount,
       qr_table_count,
       revenue_limit,
       delivery_per_km_rate
  FROM settings
 LIMIT 1;

CREATE OR REPLACE FUNCTION public.calculate_delivery_fee(
  p_zone_name text DEFAULT NULL,
  p_order_amount numeric DEFAULT 0,
  p_distance_km numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
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
  -- 11y
  v_rate        numeric := 0.50;
  v_out_of_range boolean := false;
  v_over_km     numeric := 0;
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

  -- 11y 4.3 OUT-OF-RANGE fallback — no band contains the distance:
  --   a) furthest active zone + (km - its max_km) × per-km rate
  --   b) no zones at all → pure distance fee (km × rate)
  -- The distance therefore ALWAYS resolves a fee (the price is always shown).
  IF NOT FOUND AND p_distance_km IS NOT NULL AND p_distance_km > 0 THEN
    SELECT * INTO v_zone
      FROM public.delivery_zones
     WHERE is_active = true
     ORDER BY COALESCE(max_km, 1e9) DESC, priority ASC
     LIMIT 1;
    IF FOUND THEN
      v_out_of_range := true;
      v_over_km := GREATEST(p_distance_km - COALESCE(v_zone.max_km, 0), 0);
    ELSE
      v_out_of_range := true;
      v_zone := NULL;
      v_over_km := p_distance_km;
    END IF;
  END IF;

  IF NOT FOUND AND p_distance_km IS NULL THEN
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
  SELECT COALESCE(delivery_per_km_rate, 0.50) INTO v_rate FROM public.settings LIMIT 1;

  v_threshold := COALESCE(v_zone.free_delivery_threshold, v_global.free_delivery_threshold);
  v_min_order := COALESCE(v_zone.min_order, v_global.min_order_amount);
  v_eta_min   := COALESCE(v_zone.est_minutes_min, v_zone.estimated_minutes);
  v_eta_max   := COALESCE(v_zone.est_minutes_max, v_zone.estimated_minutes);

  IF v_zone IS NULL THEN
    -- no zones configured at all: pure distance fee
    v_fee := round(p_distance_km * v_rate * v_mult, 2);
  ELSE
    v_fee := round(
      (COALESCE(v_zone.fee, v_global.delivery_fee, 0) * v_mult)
      + CASE WHEN v_out_of_range THEN v_over_km * v_rate ELSE 0 END,
      2);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'zone', v_zone.name,
    'zone_id', v_zone_id,
    'fee', v_fee,
    'free_delivery_threshold', v_threshold,
    'min_order_amount', v_min_order,
    'estimated_minutes_min', v_eta_min,
    'estimated_minutes_max', v_eta_max,
    'is_free', (NOT v_out_of_range AND v_threshold IS NOT NULL AND p_order_amount >= v_threshold),
    'min_order_ok', (v_min_order IS NULL OR p_order_amount >= v_min_order),
    'fee_multiplier', v_mult,
    -- 11y
    'out_of_range', v_out_of_range,
    'per_km_rate', v_rate,
    'over_km', CASE WHEN v_out_of_range THEN round(v_over_km, 1) ELSE 0 END,
    'resolved_by', CASE WHEN v_by_name THEN 'name' WHEN v_out_of_range THEN 'distance_oob' ELSE 'distance' END
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_delivery_fee(text, numeric, numeric) IS
  'Distance-aware fee resolution (11y): explicit name wins; else km band; else OUT-OF-RANGE = furthest zone + (km-max_km) × settings.delivery_per_km_rate; no zones → km × rate. A distance ALWAYS resolves a fee.';
