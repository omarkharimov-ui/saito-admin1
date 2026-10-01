-- ============================================================================
-- 2026-10-02 (12c): COURIER LOCATION → SUPABASE REALTIME (keyless, $0).
--
-- The 12a admin map POLLED /api/courier/live every 30 s and recreated the
-- marker at each answer → the courier dot JUMPED between pings (the "ucuz
-- hiss" that Wolt avoids with realtime + interpolation). 12c:
--   • `courier_location` joins the `supabase_realtime` publication,
--   • anon SELECT is allowed (the table holds ONLY coordinates + a
--     courier id — no names, phones, addresses: the customer-facing
--     /track page reads positions without any auth),
--   • the clients (admin dispatch map + /track) subscribe to
--     postgres_changes and feed a client-side interpolation engine
--     (src/lib/smooth-marker.ts) that glides the marker between pings.
--
-- Polling stays as a 30 s fallback (WS drops, mobile backgrounding).
-- ============================================================================

ALTER TABLE public.courier_location ENABLE ROW LEVEL SECURITY;

-- Anon read: coordinates only. No PII column exists on this table.
DROP POLICY IF EXISTS "courier_location_anon_select" ON public.courier_location;
CREATE POLICY "courier_location_anon_select" ON public.courier_location
  FOR SELECT TO anon USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_location;
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- already in the publication
    END;
  END IF;
END$$;
