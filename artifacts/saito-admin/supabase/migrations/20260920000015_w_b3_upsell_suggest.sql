-- 20260920000015 — Wave B #3: predictive "smart suggestions" engine (upsell v1)
--
-- EVIDENCE (live, 2026-09-20):
--   * NO recommendation/upsell tables or functions exist (map claim
--     "backend var, UI yoxdur" was STALE — verified against information_schema
--     + pg_proc). The "Sensei" system is an LLM menu-description helper,
--     not a recommendation engine.
--   * Real history available: ~242 orders / 90 days, ~14 active products,
--     avg 2.2 items/order, statuses: paid 186 / closed 52 / confirmed 25 /
--     served 1 (cancelled excluded). category_type is uniformly 'food', so
--     drink detection uses category NAME keywords (içki/kofe/çay/ice/...).
--
-- DESIGN (v1 — deterministic, data-backed, zero new tables):
--   suggest_addons(p_cart, p_limit) returns up to N candidates ranked by
--   score with an EVIDENCE reason per suggestion (the "predict" feel comes
--   from showing the concrete number, not a fake confidence):
--     1. co-occurrence: partner bought in the same order as a cart item
--        (≥2 shared orders) — reason 'co', pct = together/orders_of_item
--     2. drink gap: cart has no drink-category item → top-selling drinks —
--        reason 'drink' (skipped when the cart already has a drink)
--     3. popularity: best sellers not in the cart — reason 'popular'
--   Filters: active + in-stock products only; never re-suggests a cart item;
--   window = 90 days, statuses paid|closed|confirmed|served.
--   READ-ONLY (no state, no writes) — STABLE, service_role EXECUTE only
--   (house default-privileges quirk (f)).
BEGIN;

CREATE OR REPLACE FUNCTION public.suggest_addons(p_cart uuid[], p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = 'public'
AS $function$
DECLARE
  v_limit int;
  v_drink_cats uuid[];
  v_cart_has_drink boolean;
BEGIN
  v_limit := least(greatest(coalesce(p_limit, 4), 1), 6);
  IF p_cart IS NULL THEN p_cart := ARRAY[]::uuid[]; END IF;

  SELECT array_agg(id) INTO v_drink_cats FROM categories
   WHERE lower(coalesce(name,'') || ' ' || coalesce(name_az,'') || ' ' || coalesce(name_en,''))
         ~ 'içki|ice|coffee|kofe|çay|tea|juice|şirə|su|buz|cola|lemonade';

  SELECT count(*) > 0 INTO v_cart_has_drink FROM products p
   WHERE p.id = ANY(p_cart) AND p.category_id = ANY(coalesce(v_drink_cats, ARRAY[]::uuid[]));

  RETURN (
    SELECT coalesce(jsonb_agg(r ORDER BY r.score DESC, r.name), '[]'::jsonb)
    FROM (
      SELECT * FROM (
      SELECT DISTINCT ON (cand.partner)
        cand.partner AS product_id,
        coalesce(pr.name_az, pr.name) AS name,
        pr.name AS name_en,
        pr.price,
        pr.discount_price,
        pr.image_url,
        cat.name AS category_name,
        cand.reason,
        cand.ref_name,
        cand.pct,
        cand.score
      FROM (
        -- 1) co-occurrence (basket affinity with the current cart)
        SELECT b.partner,
               'co'::text AS reason,
               (SELECT coalesce(pr2.name_az, pr2.name) FROM products pr2 WHERE pr2.id = b.cart_p) AS ref_name,
               round(100.0 * b.together / nullif(o.n, 0))::int AS pct,
               300 + least(b.together, 25) * 4 AS score
        FROM (
          SELECT x.cart_p, y.product_id AS partner, count(DISTINCT x.order_id) AS together
          FROM (
            SELECT DISTINCT oi.order_id, oi.product_id AS cart_p
            FROM order_items oi
            WHERE oi.product_id = ANY(p_cart)
              AND oi.order_id IN (SELECT id FROM orders
                                  WHERE status IN ('paid','closed','confirmed','served')
                                    AND created_at > now() - interval '90 days')
          ) x
          JOIN order_items y ON y.order_id = x.order_id AND y.product_id <> x.cart_p
          GROUP BY x.cart_p, y.product_id
        ) b
        JOIN (
          SELECT z.product_id, count(*) AS n
          FROM (
            SELECT DISTINCT oi.order_id, oi.product_id
            FROM order_items oi
            WHERE oi.product_id = ANY(p_cart)
              AND oi.order_id IN (SELECT id FROM orders
                                  WHERE status IN ('paid','closed','confirmed','served')
                                    AND created_at > now() - interval '90 days')
          ) z
          GROUP BY z.product_id
        ) o ON o.product_id = b.cart_p
        WHERE b.together >= 2

        UNION ALL

        -- 2) drink gap (cart has no drink-category item)
        SELECT d.pid, 'drink'::text, NULL::text, NULL::int,
               200 + least(d.n, 25) * 3
        FROM (
          SELECT p.id AS pid, count(DISTINCT oi.order_id) AS n
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          WHERE p.category_id = ANY(coalesce(v_drink_cats, ARRAY[]::uuid[]))
            AND p.is_active AND p.is_in_stock
            AND oi.order_id IN (SELECT id FROM orders
                                WHERE status IN ('paid','closed','confirmed','served')
                                  AND created_at > now() - interval '90 days')
          GROUP BY p.id
        ) d
        WHERE NOT v_cart_has_drink AND v_drink_cats IS NOT NULL

        UNION ALL

        -- 3) popularity fallback
        SELECT pp.pid, 'popular'::text, NULL::text, NULL::int,
               100 + least(pp.n, 25) * 2
        FROM (
          SELECT p.id AS pid, count(DISTINCT oi.order_id) AS n
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          WHERE p.is_active AND p.is_in_stock
            AND p.id <> ALL(p_cart)
            AND oi.order_id IN (SELECT id FROM orders
                                WHERE status IN ('paid','closed','confirmed','served')
                                  AND created_at > now() - interval '90 days')
          GROUP BY p.id
        ) pp
      ) cand
      JOIN products pr ON pr.id = cand.partner
        AND pr.is_active AND pr.is_in_stock
        AND pr.id <> ALL(p_cart)
      LEFT JOIN categories cat ON cat.id = pr.category_id
      ORDER BY cand.partner, cand.score DESC
      ) deduped
      ORDER BY deduped.score DESC, deduped.name
      LIMIT v_limit
    ) r
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.suggest_addons(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_addons(uuid[], integer) TO service_role;

COMMIT;
