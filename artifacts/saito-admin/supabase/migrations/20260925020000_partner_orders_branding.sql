-- 2026-09-25 (owner): "partner api üçün logolar olsun... hansı qoşulubsa onun
-- logosu bəllinin (Bolt oldugu) + kartın arxa planında tetbiqin rengi +
-- kurye təyin olunubsa adı/soyadı/nömrəsi — POS/BDS/KDS mətbəxlərin hamısında"
--
-- ADDITIVE ONLY — no frozen columns/functions touched:
--   orders.partner_source        bolt | uber_eats | glovo | wolt | NULL
--   orders.external_order_id     the partner-side order number (BOLT-1234)
--   orders.courier_phone         partner courier phone (courier_name existed)
--   orders.courier_assigned_at   when the courier was attached
--   settings.delivery_partners   jsonb: {bolt:{connected,connected_at}, ...}
--   settings.sms_settings        jsonb: {provider, enabled, sid, token, ...}
--     (ready-state config for the SMS notifications tab — nothing sends
--      until the owner connects a provider)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_source text,
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS courier_phone text,
  ADD COLUMN IF NOT EXISTS courier_assigned_at timestamptz;

COMMENT ON COLUMN public.orders.partner_source IS 'Connected delivery-partner source: bolt|uber_eats|glovo|wolt (NULL = in-house/POS)';
COMMENT ON COLUMN public.orders.external_order_id IS 'Partner-side order number for traceability (e.g. BOLT-104231)';
COMMENT ON COLUMN public.orders.courier_phone IS 'Partner courier phone (shown on POS/KDS cards)';
COMMENT ON COLUMN public.orders.courier_assigned_at IS 'When the partner courier was assigned';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS delivery_partners jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.settings.delivery_partners IS 'Partner connect state: {bolt:{connected,connected_at},uber_eats:{...},glovo:{...},wolt:{...}}';
COMMENT ON COLUMN public.settings.sms_settings IS 'Ready-state SMS config (provider/sid/token/templates); no sending until enabled+connected';

-- Fast lookup for "partner orders on the floor" (POS delivery/takeaway boards, KDS)
CREATE INDEX IF NOT EXISTS idx_orders_partner_source ON public.orders (partner_source) WHERE partner_source IS NOT NULL;
