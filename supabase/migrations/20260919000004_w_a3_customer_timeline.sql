-- W-A3 (2026-09-19, Wave A #2 backend): customer timeline aggregation.
-- T2: all stats computed live from orders (SSOT) — customers.total_visits /
-- total_spent / last_order_at are dead denormalized columns (no writer exists;
-- verified via pg_trigger + prosrc scan) and are deliberately NOT exposed.
-- READ-ONLY: pure SELECT aggregation, no writes anywhere.
-- Additive only: one new function.

CREATE OR REPLACE FUNCTION public.get_customer_timeline(p_customer_id uuid, p_limit int)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
                                'created_at', c.created_at)
      FROM customers c WHERE c.id = p_customer_id
    ),
    'stats', (
      SELECT jsonb_build_object(
        'visit_count',   count(*),
        'total_spent',   coalesce(sum(o.paid_amount), 0),
        'avg_order',     coalesce(round(avg(o.total_amount), 2), 0),
        'first_visit',   min(o.created_at),
        'last_visit',    max(o.created_at),
        'items_ordered', (
          SELECT coalesce(sum(oi.quantity), 0)
          FROM order_items oi
          WHERE oi.order_id IN (
            SELECT id FROM orders
            WHERE customer_id = p_customer_id
              AND status NOT IN ('cancelled', 'voided'))
        )
      )
      FROM orders o
      WHERE o.customer_id = p_customer_id
        AND o.status NOT IN ('cancelled', 'voided')
    ),
    'orders', (
      SELECT coalesce(jsonb_agg(j ORDER BY created_at DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', o.id,
          'table_number', o.table_number,
          'order_type', o.order_type,
          'status', o.status,
          'total_amount', o.total_amount,
          'paid_amount', coalesce(o.paid_amount, 0),
          'created_at', o.created_at,
          'items', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'name', oi.product_name, 'qty', oi.quantity,
              'unit_price', oi.unit_price, 'total_price', oi.total_price)),
              '[]'::jsonb)
            FROM order_items oi WHERE oi.order_id = o.id
          ),
          'payments', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'method', op.method, 'amount', op.amount,
              'status', op.status, 'is_refund', op.is_refund)),
              '[]'::jsonb)
            FROM order_payments op WHERE op.order_id = o.id
          )
        ) AS j, o.created_at
        FROM orders o
        WHERE o.customer_id = p_customer_id
        ORDER BY o.created_at DESC
        LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 100)
      ) t
    ),
    'favorites', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('name', n, 'qty', q)
                               ORDER BY q DESC, n), '[]'::jsonb)
      FROM (
        SELECT oi.product_name AS n, sum(oi.quantity) AS q
        FROM order_items oi
        JOIN orders o3 ON o3.id = oi.order_id
        WHERE o3.customer_id = p_customer_id
          AND o3.status NOT IN ('cancelled', 'voided')
        GROUP BY oi.product_name
        ORDER BY sum(oi.quantity) DESC, oi.product_name
        LIMIT 10
      ) f
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_timeline(uuid, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_timeline(uuid, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_timeline(uuid, int) TO service_role;
