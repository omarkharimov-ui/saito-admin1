-- 2026-09-25 — FROZEN DRAFT (owner: "burada frozen edək; Settings tab
-- yaxanda gələndə configure edəcəyik"). DO NOT APPLY yet. When the partner
-- Settings phase activates, apply with: supabase db push / psql -f.
--
-- 2026-09-25 (owner, Phase 1a): partner (3rd-party) orders get their OWN
-- storage — statuslar ayri, odenisler ayri (owner rule). See
-- /PARTNER_API_DESIGN.md for the full research + schema rationale.
--
-- partner_orders = 1:1 with orders.id. Holds the PARTNER-side payload:
-- partner status (we never edit it), partner payment (owner/method/status/
-- tip — NEVER mixed with our POS payment_status), customer snapshot (API
-- payload, no POS inputs), courier (the partner's courier, not ours).
create table if not exists public.partner_orders (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null unique references public.orders(id) on delete cascade,
  partner              text not null check (partner in ('bolt','uber_eats','glovo','wolt')),
  external_order_id    text not null,
  external_order_no    text,

  -- PARTNER STATUS (API yazir, biz degisdirmirik)
  partner_status       text,
  partner_status_at    timestamptz,

  -- QEBUL axini (owner qarari, 2026-09-25): AUTO-ACCEPT YOX — operator POS-da
  -- "QEBUL ET" basmali; qebul olmeden KDS-ye getmir.
  accept_status        text not null default 'pending' check (accept_status in ('pending','accepted','rejected')),
  accepted_at          timestamptz,

  -- PARTNER PAYMENT (bizim payment_status ile qarishdirilmir)
  payment_owner        text not null default 'partner' check (payment_owner in ('partner','restaurant')),
  payment_method       text,
  payment_status       text,
  payment_amount       numeric(12,2),
  tip_amount           numeric(12,2) default 0,

  -- CUSTOMER snapshot (API payload)
  customer_name        text,
  customer_phone       text,
  delivery_instructions text,
  address_line         text,
  address_district     text,
  address_zone         text,

  -- COURIER (partner kuryesi)
  courier_name         text,
  courier_phone        text,
  courier_assigned_at  timestamptz,
  courier_eta          text,

  -- SYNC / AUDIT
  last_webhook_at      timestamptz,
  last_sync_error      text,
  raw_payload          jsonb,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_partner_orders_partner_status on public.partner_orders (partner, partner_status);
create index if not exists idx_partner_orders_external        on public.partner_orders (partner, external_order_id);
create index if not exists idx_partner_orders_accept          on public.partner_orders (accept_status) where accept_status = 'pending';

-- Webhook event log (idempotency + signature audit)
create table if not exists public.partner_webhook_events (
  id                bigint generated always as identity primary key,
  partner           text not null,
  event_id          text,
  event_type        text not null,
  external_order_id text,
  signature_valid   boolean not null default false,
  processed         boolean not null default false,
  error             text,
  payload           jsonb not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_partner_wh_dedup on public.partner_webhook_events (partner, event_id) where event_id is not null;
create index if not exists idx_partner_wh_created on public.partner_webhook_events (created_at desc);

-- orders: minimal denorm — who owns the payment (null = in-house order)
alter table public.orders add column if not exists partner_payment_owner text;
comment on column public.orders.partner_payment_owner is
  'partner | restaurant | null (in-house). partner = customer paid in the partner app; restaurant = STORE_CASH/STORE_CARD case, POS records the payment.';

-- Backfill existing partner test orders (created by the test-order endpoint
-- before this table existed) — pending accept where not yet in the kitchen.
insert into public.partner_orders (
  order_id, partner, external_order_id, external_order_no,
  partner_status, partner_status_at,
  accept_status, accepted_at,
  payment_owner, payment_method, payment_status, payment_amount,
  customer_name, customer_phone,
  address_line, address_district, address_zone,
  courier_name, courier_phone, courier_assigned_at, courier_eta,
  last_webhook_at, raw_payload
)
select
  o.id, o.partner_source, o.external_order_id, o.order_number,
  'ORDER_RECEIVED', o.created_at,
  case when o.kitchen_status is null then 'pending' else 'accepted' end,
  o.kitchen_accepted_at,
  'partner', 'CARD', 'PAID', o.total_amount,
  o.customer_name, o.customer_phone,
  nullif(o.delivery_street || coalesce(' ' || o.delivery_building, ''), ''),
  o.delivery_district, o.delivery_zone,
  o.courier_name, o.courier_phone, o.courier_assigned_at, o.courier_eta,
  o.created_at,
  jsonb_build_object('source', 'backfill-20260925', 'order_source', o.order_source)
from public.orders o
where o.partner_source is not null
  and not exists (select 1 from public.partner_orders p where p.order_id = o.id);
