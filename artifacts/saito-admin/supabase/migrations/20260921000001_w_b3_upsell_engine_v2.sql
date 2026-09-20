-- 20260921000001 — Wave B #3 (v2): stateful upsell engine — offer history,
-- budget, cooldown, price-jump guard, evidence threshold, offer-type labels.
--
-- Contract (ratified with owner, 2026-09-21):
--   "Məqsəd: bu anda ən relevant olan bir şeyi, bir dəfə, düzgün anda təklif et."
--   * ONE offer at a time (route selects the single top candidate)
--   * Budget per order: MAX 2 shown, MAX 1 accepted
--   * Acceptance ≠ permission to chain: after accept, budget blocks (max 1)
--   * Dismiss: that candidate is never re-shown for this order + 120s engine
--     cooldown (cart-state change lifts the cooldown early)
--   * Unresolved 'shown' + same cart snapshot → route RESUMES the same offer
--     (idempotent re-fetch while the card is on screen; no double count)
--   * Candidate filters: active + in-stock + not-in-cart + not-excluded
--     (history) + client-side guard + price jump ≤ 2.5× max cart item price
--     + co-occurrence evidence ≥ 15%
--   * Offer types (priority baked into v1 scores, relabeled here):
--       complement (co-occurrence) > beverage (drink gap) > generic (popularity)
--     Upgrade (variant) / Add-on (modifier) types are STAGED — they need
--     variant/modifier pairing data that does not exist in this schema yet.
BEGIN;

-- ── 1) Offer history (audit + state machine storage) ─────────────────────
CREATE TABLE public.upsell_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  organization_id uuid,
  candidate_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  offer_type text NOT NULL CHECK (offer_type IN ('complement','beverage','generic')),
  evidence_pct integer,
  cart_snapshot text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'shown' CHECK (outcome IN ('shown','accepted','dismissed')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (order_id, candidate_product_id)
);
CREATE INDEX idx_upsell_offers_order ON public.upsell_offers (order_id, offered_at DESC);

REVOKE ALL ON public.upsell_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.upsell_offers TO service_role;

-- ── 2) Engine v2 — deterministic candidate scoring with guards ────────────
CREATE OR REPLACE FUNCTION public.suggest_addons_v2(
  p_cart uuid[],
  p_limit integer,
  p_excluded uuid[] DEFAULT ARRAY[]::uuid[],
  p_max_price_ratio numeric DEFAULT 2.5,
  p_min_co_pct integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = 'public'
AS $function$
DECLARE
  v_limit int;
  v_excluded uuid[];
  v_drink_cats uuid[];
  v_cart_has_drink boolean;
  v_cart_max_price numeric;
BEGIN
  v_limit := least(greatest(coalesce(p_limit, 4), 1), 6);
  IF p_cart IS NULL THEN p_cart := ARRAY[]::uuid[]; END IF;
  IF p_excluded IS NULL THEN p_excluded := ARRAY[]::uuid[]; END IF;

  SELECT max(coalesce(pr.discount_price, pr.price)) INTO v_cart_max_price
    FROM products pr WHERE pr.id = ANY(p_cart);

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
        CASE cand.reason WHEN 'co' THEN 'complement'
                         WHEN 'drink' THEN 'beverage'
                         ELSE 'generic' END AS offer_type,
        cand.ref_name,
        cand.pct,
        cand.score
      FROM (
        -- 1) complement (basket affinity with the current cart), evidence ≥ p_min_co_pct
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
          AND round(100.0 * b.together / nullif(o.n, 0)) >= p_min_co_pct

        UNION ALL

        -- 2) beverage (cart has no drink-category item)
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

        -- 3) generic (best sellers) — lowest priority, last resort only
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
        AND pr.id <> ALL(p_excluded)
        -- excessive price jump guard: never push something far pricier than
        -- the most expensive item the customer already chose
        AND (v_cart_max_price IS NULL OR coalesce(pr.discount_price, pr.price) <= v_cart_max_price * p_max_price_ratio)
      LEFT JOIN categories cat ON cat.id = pr.category_id
      ORDER BY cand.partner, cand.score DESC
      ) deduped
      ORDER BY deduped.score DESC, deduped.name
      LIMIT v_limit
    ) r
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.suggest_addons_v2(uuid[], integer, uuid[], numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_addons_v2(uuid[], integer, uuid[], numeric, integer) TO service_role;

COMMIT;
