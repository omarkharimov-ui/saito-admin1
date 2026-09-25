-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-26 (owner, Task 46): get_kitchen_summary RPC
--
-- The POS MƏTBƏX button's hint (hazırlanır / hazır / draft — ALL open
-- orders) used to poll /api/orders every 5s. That endpoint returns every
-- open order with deep nested joins (~1.5 MB per tick for 365 open orders,
-- ≈180 MB/hour) and — in the current dev-server fetch layer — reliably
-- trips UND_ERR_HEADERS_OVERFLOW for the un-scoped status-only variant,
-- so the hint never rendered.
--
-- Fix: a dedicated lightweight aggregation that returns exactly three
-- integers. Same semantics as the old per-cart statusCounts the button
-- replaced (served_quantity + kitchen_status), scoped to the caller's
-- location. SECURITY DEFINER so a location-scoped reader can aggregate.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.get_kitchen_summary(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ready', coalesce(sum(case when o.served > 0 and o.ks in ('ready','completed','served')
                               then o.served else 0 end), 0)::int,
    'prep',  coalesce(sum(case when o.served > 0 and o.ks not in ('ready','completed','served')
                               then o.served else 0 end), 0)::int,
    'draft', coalesce(sum(greatest(o.qty - o.served, 0)), 0)::int
  )
  from (
    select oi.served_quantity as served,
           oi.quantity        as qty,
           coalesce(oi.kitchen_status, 'pending') as ks
    from public.order_items oi
    join public.orders od on od.id = oi.order_id
    where od.location_id = p_location_id
      and od.status not in ('served','cancelled','closed','refunded','partially_refunded','voided')
      and oi.kitchen_status is distinct from 'voided'
  ) o;
$$;

revoke execute on function public.get_kitchen_summary(uuid) from public, anon;
grant execute on function public.get_kitchen_summary(uuid) to authenticated, service_role;
