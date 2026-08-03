CREATE TABLE public.reservations (
  id                            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name                          text                     NOT NULL,
  phone                         text                     NOT NULL,
  guests                        integer                  NOT NULL,
  date                          date                     NOT NULL,
  "time"                        time without time zone   NOT NULL,
  status                        text                     DEFAULT 'pending'::text,
  note                          text,
  created_at                    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  ai_kitchen_timeline           jsonb                    DEFAULT '{}'::jsonb,
  floor_id                      uuid,
  table_number                  integer,
  kitchen_scheduled_at          timestamp with time zone,
  checked_in_at                 timestamp with time zone,
  completed_at                  timestamp with time zone,
  archived_at                   timestamp with time zone,
  cancelled_at                  timestamp with time zone,
  no_show_at                    timestamp with time zone,
  cancelled_reason              text,
  archived_reason               text,
  source                        text                     DEFAULT 'manual'::text,
  kitchen_notify_before_minutes integer                  DEFAULT 120,
  kitchen_notified_at           timestamp with time zone,
  kitchen_hint_sent             boolean                  DEFAULT false,
  updated_at                    timestamp with time zone DEFAULT now(),
  customer_id                   uuid,
  reservation_type              text                     DEFAULT 'reservation'::text,
  is_vip                        boolean                  DEFAULT false,
  deleted_at                    timestamp with time zone,
  kitchen_prep_time_minutes     integer                  DEFAULT 20,
  kitchen_scheduled_for         timestamp with time zone,
  notes                         text,
  order_type                    text,
  reservation_merge_group_id    uuid,
  table_ids                     integer[]                DEFAULT '{}'::integer[]
);

CREATE INDEX idx_reservations_customer_id ON public.reservations (customer_id);

CREATE INDEX idx_reservations_status ON public.reservations (status);

CREATE INDEX idx_reservations_date_status ON public.reservations (date, status);

CREATE INDEX idx_reservations_date ON public.reservations (date);

CREATE INDEX idx_reservations_type ON public.reservations (reservation_type);

CREATE INDEX idx_reservations_table_id ON public.reservations (table_number);

CREATE INDEX idx_reservations_status_date_time ON public.reservations (status, date, "time");

CREATE TRIGGER set_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timestamp();

CREATE TRIGGER trg_cleanup_reservation_draft_orders
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_reservation_draft_orders();

CREATE TRIGGER trg_clear_table_on_reservation_delete
  AFTER DELETE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_table_on_reservation_delete();

CREATE TRIGGER trg_normalize_table_after_reservation_change
  AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_table_after_reservation_change();

CREATE POLICY auth_read_reservations ON public.reservations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY public_create_reservation ON public.reservations
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY reservations_delete_staff ON public.reservations
  FOR DELETE
  TO authenticated
  USING (public.is_admin_staff());

CREATE POLICY reservations_insert_public ON public.reservations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (((COALESCE(status, 'pending'::text) = 'pending'::text) AND (guests IS NOT NULL) AND (guests >= 1) AND (guests <= 50) AND (name IS NOT NULL) AND (phone IS NOT NULL)));

CREATE POLICY reservations_select_staff ON public.reservations
  FOR SELECT
  TO authenticated
  USING (public.is_admin_staff());

CREATE POLICY reservations_update_staff ON public.reservations
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

CREATE POLICY service_full_reservations ON public.reservations
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_full_reservations ON public.reservations
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_reservations ON public.reservations
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))));

ALTER TABLE public.reservations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_reservation_type_check CHECK (reservation_type = ANY (ARRAY['reservation'::text, 'walkin'::text, 'event'::text]));

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'seated'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]));

GRANT ALL ON public.reservations TO anon;

GRANT ALL ON public.reservations TO authenticated;

GRANT ALL ON public.reservations TO service_role;