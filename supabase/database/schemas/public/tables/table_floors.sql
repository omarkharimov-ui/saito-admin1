CREATE TABLE public.table_floors (
  id                          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  table_number                integer                  NOT NULL,
  floor_name                  text                     DEFAULT '1-ci Mərtəbə'::text NOT NULL,
  sort_order                  integer                  DEFAULT 0,
  merged_into_table           integer,
  reservation_id              uuid,
  reservation_name            text,
  reservation_time            text,
  status                      text                     DEFAULT 'empty'::text,
  last_activity_at            timestamp with time zone,
  opened_at                   timestamp with time zone,
  total_amount                numeric                  DEFAULT 0,
  order_count                 integer                  DEFAULT 0,
  order_ids                   text[]                   DEFAULT '{}'::text[],
  has_pending                 boolean                  DEFAULT false,
  oldest_pending_at           timestamp with time zone,
  merged_orders               jsonb                    DEFAULT '[]'::jsonb,
  capacity                    integer                  DEFAULT 4,
  x_pos                       numeric,
  y_pos                       numeric,
  shape                       text                     DEFAULT 'circle'::text,
  width                       numeric,
  height                      numeric,
  reserved_at                 timestamp with time zone,
  reserved_until              timestamp with time zone,
  reservation_status_snapshot text,
  reservation_updated_at      timestamp with time zone,
  updated_at                  timestamp with time zone DEFAULT now(),
  reservation_phone           text,
  guest_count                 integer,
  bill_requested              boolean                  DEFAULT false,
  current_order_id            uuid,
  updated_by_terminal_id      text,
  kitchen_status              text,
  table_name                  text,
  area                        text,
  priority                    text                     DEFAULT 'normal'::text,
  connection_status           text                     DEFAULT 'online'::text,
  printer_status              text                     DEFAULT 'online'::text,
  course_status               text                     DEFAULT 'none'::text,
  cleaning_status             text                     DEFAULT 'clean'::text,
  waiter_id                   uuid,
  waiter_name                 text,
  started_at                  timestamp with time zone,
  payment_status              text                     DEFAULT 'none'::text,
  notes                       text,
  metadata                    jsonb                    DEFAULT '{}'::jsonb
);

CREATE INDEX idx_table_floors_floor ON public.table_floors (floor_name);

CREATE INDEX idx_table_floors_current_order_id ON public.table_floors (current_order_id);

CREATE INDEX idx_table_floors_status ON public.table_floors (status);

CREATE INDEX idx_table_floors_number ON public.table_floors (table_number);

CREATE INDEX idx_table_floors_reservation ON public.table_floors (reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX idx_table_floors_priority ON public.table_floors (priority);

CREATE INDEX idx_table_floors_payment_status ON public.table_floors (payment_status);

CREATE INDEX idx_table_floors_reservation_id ON public.table_floors (reservation_id);

CREATE INDEX idx_table_floors_area ON public.table_floors (area);

CREATE TRIGGER trg_clear_table_badges_on_release
  AFTER UPDATE ON public.table_floors
  FOR EACH ROW
  WHEN
    ((new.status = ANY (ARRAY['empty'::text, 'cleaning'::text, 'reserved'::text])) AND (old.status = ANY (ARRAY['payment_pending'::text, 'occupied'::text, 'dirty'::text,
    'cooking'::text, 'ordering'::text])))
  EXECUTE FUNCTION public.clear_table_badges_on_release();

CREATE TRIGGER trg_complete_reservation_on_table_clear
  AFTER UPDATE OF status ON public.table_floors
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_reservation_on_table_clear();

CREATE POLICY anon_delete ON public.table_floors
  FOR DELETE
  USING (true);

CREATE POLICY anon_insert ON public.table_floors
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY anon_select ON public.table_floors
  FOR SELECT
  USING (true);

CREATE POLICY auth_modify_table_floors ON public.table_floors
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text]))))));

CREATE POLICY auth_read_table_floors ON public.table_floors
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY service_full_table_floors ON public.table_floors
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_full_table_floors ON public.table_floors
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.table_floors
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.table_floors
  ADD CONSTRAINT fk_table_floors_reservation FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE SET NULL;

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_cleaning_status_check CHECK (cleaning_status = ANY (ARRAY['clean'::text, 'needs_cleaning'::text, 'cleaning_in_progress'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_connection_status_check CHECK (connection_status = ANY (ARRAY['online'::text, 'offline'::text, 'error'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_course_status_check CHECK (course_status = ANY (ARRAY['none'::text, 'appetizers'::text, 'mains'::text, 'desserts'::text, 'completed'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_payment_status_check CHECK (payment_status = ANY (ARRAY['none'::text, 'requested'::text, 'partial'::text, 'paid'::text, 'split'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_pkey PRIMARY KEY (id);

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_printer_status_check CHECK (printer_status = ANY (ARRAY['online'::text, 'offline'::text, 'error'::text, 'low_paper'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_priority_check CHECK (priority = ANY (ARRAY['normal'::text, 'high'::text, 'vip'::text, 'birthday'::text, 'allergy'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_status_check
    CHECK
    (status = ANY (ARRAY['empty'::text, 'reserved'::text, 'seated'::text, 'ordering'::text, 'in_kitchen'::text, 'dining'::text, 'bill_requested'::text, 'payment_pending'::text,
    'paid'::text, 'cleaning'::text, 'merged'::text, 'out_of_service'::text, 'occupied'::text, 'dirty'::text]));

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_table_number_key UNIQUE (table_number);

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_merged_into_table_fkey FOREIGN KEY (merged_into_table) REFERENCES public.table_floors(table_number);

ALTER TABLE public.table_floors
  ADD CONSTRAINT table_floors_waiter_id_fkey FOREIGN KEY (waiter_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;

GRANT ALL ON public.table_floors TO anon;

GRANT ALL ON public.table_floors TO authenticated;

GRANT ALL ON public.table_floors TO service_role;