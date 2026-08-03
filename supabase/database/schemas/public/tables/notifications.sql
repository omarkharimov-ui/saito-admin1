CREATE TABLE public.notifications (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  type           text                     NOT NULL,
  title          text                     NOT NULL,
  body           text,
  data           jsonb,
  recipient_role text,
  is_read        boolean                  DEFAULT false NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  read_at        timestamp with time zone,
  message        text
);

CREATE INDEX idx_notifications_type ON public.notifications (TYPE);

CREATE INDEX idx_notifications_is_read ON public.notifications (is_read);

CREATE INDEX idx_notifications_created_at ON public.notifications (created_at DESC);

CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT
  USING (true);

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE
  USING (true);

ALTER TABLE public.notifications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY['payment'::text, 'reservation'::text, 'order'::text, 'kitchen'::text, 'stock'::text, 'campaign'::text, 'system'::text, 'order_cancelled'::text]));

GRANT ALL ON public.notifications TO anon;

GRANT ALL ON public.notifications TO authenticated;

GRANT ALL ON public.notifications TO service_role;