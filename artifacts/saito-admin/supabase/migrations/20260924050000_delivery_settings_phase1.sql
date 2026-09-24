-- =============================================================================
-- 20260924050000 — Delivery Settings, Phase 1 (owner-approved 2026-09-24)
--
-- Scope (configuration only — the /admin/delivery operations page is Phase 2):
--   1) delivery_zones: km range + per-zone min order + priority + ETA range
--      (min_km DEFAULT 0 / max_km NULL = unlimited, so the existing
--       "Bakı Mərkəz" row keeps behaving EXACTLY as before: 0–∞)
--   2) locations.delivery_mode: own | third_party | both (per-location)
--   3) settings: delivery_enabled + delivery_accepting_orders (global,
--      both default true — feature is on unless the owner turns it off)
--   4) NEW distance-aware overload calculate_delivery_fee(text, numeric,
--      numeric) — the OLD (text, numeric, text) version stays FROZEN and is
--      not modified (existing POS flow keeps calling it unchanged).
--
-- Distance resolution rules (new overload):
--   * explicit zone name (POS selection) wins over distance;
--   * otherwise: active zones WHERE min_km <= d < max_km (NULL bound = open),
--     ORDER BY priority ASC (lower = closer/more important), name ASC;
--   * fee / free-threshold / min-order: zone value first, global settings
--     (v_settings_delivery) as fallback.
-- =============================================================================

-- 1) delivery_zones -----------------------------------------------------------
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS min_km numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_km numeric(6,2),
  ADD COLUMN IF NOT EXISTS min_order numeric(10,2),
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS est_minutes_min integer,
  ADD COLUMN IF NOT EXISTS est_minutes_max integer;

COMMENT ON COLUMN public.delivery_zones.min_km IS 'Lower distance bound in km (inclusive). DEFAULT 0.';
COMMENT ON COLUMN public.delivery_zones.max_km IS 'Upper distance bound in km (exclusive). NULL = unlimited.';
COMMENT ON COLUMN public.delivery_zones.min_order IS 'Zone min order amount. NULL = use settings.min_order_amount.';
COMMENT ON COLUMN public.delivery_zones.priority IS 'Distance-resolution priority, LOWER wins (DEFAULT 100).';
COMMENT ON COLUMN public.delivery_zones.est_minutes_min IS 'ETA range low (min). NULL = fall back to estimated_minutes.';
COMMENT ON COLUMN public.delivery_zones.est_minutes_max IS 'ETA range high (max). NULL = fall back to estimated_minutes.';

-- 2) locations.delivery_mode ---------------------------------------------------
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'own';
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_delivery_mode_check;
ALTER TABLE public.locations
  ADD CONSTRAINT locations_delivery_mode_check
  CHECK (delivery_mode IN ('own', 'third_party', 'both'));
COMMENT ON COLUMN public.locations.delivery_mode IS 'Who fulfils delivery: own couriers | third party | both.';

-- 3) settings globals ----------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_accepting_orders boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.settings.delivery_enabled IS 'Master switch for the delivery feature (POS zone list hidden when false).';
COMMENT ON COLUMN public.settings.delivery_accepting_orders IS 'Operational: whether new delivery orders are currently accepted.';

-- 4) Distance-aware fee RPC (overload — old signature untouched) ---------------
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

  v_fee       := COALESCE(v_zone.fee, v_global.delivery_fee, 0);
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
    'resolved_by', CASE WHEN v_by_name THEN 'name' ELSE 'distance' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_delivery_fee(text, numeric, numeric)
  TO authenticated, service_role, test_rls_role;

COMMENT ON FUNCTION public.calculate_delivery_fee(text, numeric, numeric) IS
  'Distance-aware fee resolution (Phase 1 2026-09-24). Explicit p_zone_name wins; otherwise nearest active zone by p_distance_km (min_km <= d < max_km, priority ASC). Zone fields fall back to global settings. The legacy (text, numeric, text) overload is frozen and unchanged.';
