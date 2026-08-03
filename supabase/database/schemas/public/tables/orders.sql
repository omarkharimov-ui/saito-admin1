CREATE TABLE public.orders (
  id                      uuid                     DEFAULT gen_random_uuid() NOT NULL,
  total_amount            numeric(10,2)            NOT NULL,
  status                  text                     DEFAULT 'new'::text,
  items                   jsonb,
  created_at              timestamp with time zone DEFAULT now(),
  table_number            integer,
  customer_name           text,
  customer_note           text,
  total_price             numeric                  DEFAULT 0,
  returned_amount         numeric(10,2)            DEFAULT 0 NOT NULL,
  kitchen_status          text                     DEFAULT 'pending'::text,
  kitchen_accepted_at     timestamp with time zone,
  kitchen_ready_at        timestamp with time zone,
  kitchen_target_section  character varying(20),
  kitchen_reopened_at     timestamp with time zone,
  is_rush                 boolean                  DEFAULT false,
  void_reason             text,
  merged_into             uuid,
  payment_method          text,
  discount_type           text,
  discount_value          numeric                  DEFAULT 0,
  paid_amount             numeric,
  split_count             integer                  DEFAULT 1,
  order_type              text                     DEFAULT 'dine_in'::text,
  customer_id             uuid,
  guest_count             integer                  DEFAULT 1,
  tip_amount              numeric                  DEFAULT 0,
  reservation_id          uuid,
  is_draft                boolean                  DEFAULT false,
  is_split                boolean                  DEFAULT false,
  version                 integer                  DEFAULT 1,
  checkin_at              timestamp with time zone,
  closed_at               timestamp with time zone,
  created_by              uuid,
  assigned_to             uuid,
  priority                integer                  DEFAULT 0,
  cancelled_at            timestamp with time zone,
  paid_at                 timestamp with time zone,
  special_request         text,
  is_served               boolean                  DEFAULT false,
  cogs                    numeric(12,2)            DEFAULT 0,
  profit                  numeric(12,2)            DEFAULT 0,
  campaign_id             uuid,
  updated_at              timestamp with time zone DEFAULT now(),
  cancelled_reason        text,
  original_total_amount   numeric,
  discount_amount         numeric                  DEFAULT 0,
  cash_amount             numeric                  DEFAULT 0,
  card_amount             numeric                  DEFAULT 0,
  group_id                uuid,
  inventory_deducted      boolean                  DEFAULT false,
  customer_phone          text,
  order_source            text                     DEFAULT 'dine_in'::text,
  delivery_address        text,
  delivery_fee            numeric                  DEFAULT 0,
  estimated_delivery_time timestamp with time zone,
  delivery_status         text,
  courier_id              uuid,
  courier_name            text,
  tracking_number         text,
  delivered_at            timestamp with time zone,
  service_charge_pct      numeric(5,2)             DEFAULT 0,
  service_charge_amount   numeric(12,2)            DEFAULT 0,
  tax_pct                 numeric(5,2)             DEFAULT 0,
  tax_amount              numeric(12,2)            DEFAULT 0,
  order_number            text,
  delivery_district       text,
  delivery_street         text,
  delivery_building       text,
  delivery_floor          text,
  delivery_apartment      text,
  delivery_intercom       text,
  delivery_zone           text,
  scheduled_date          text,
  station_id              uuid,
  updated_by_terminal_id  text,
  delivery_notified       boolean                  DEFAULT false,
  kitchen_notified        boolean                  DEFAULT false,
  kitchen_scheduled_for   timestamp with time zone,
  assigned_to_name        text,
  completed_at            timestamp with time zone,
  subtotal                numeric(12,2)            DEFAULT 0,
  discount                numeric(12,2)            DEFAULT 0,
  merged_from_table       integer,
  course_status           text                     DEFAULT 'none'::text,
  is_late                 boolean                  DEFAULT false,
  late_reason             text,
  printer_status          text                     DEFAULT 'online'::text,
  kitchen_notes           text
);

CREATE INDEX idx_orders_priority ON public.orders (priority);

CREATE INDEX idx_orders_merged_into ON public.orders (merged_into);

CREATE INDEX idx_orders_order_source ON public.orders (order_source);

CREATE INDEX idx_orders_table_number_nullable ON public.orders (table_number)
  WHERE table_number IS NULL;

CREATE UNIQUE INDEX idx_orders_active_table ON public.orders (table_number)
  WHERE (status <> ALL (ARRAY['paid'::text, 'cancelled'::text, 'closed'::text])) AND is_split IS DISTINCT FROM true AND merged_into IS NULL;

CREATE INDEX idx_orders_table_status ON public.orders (table_number, status);

CREATE INDEX idx_orders_delivery_status ON public.orders (delivery_status);

CREATE INDEX idx_orders_tracking_number ON public.orders (tracking_number);

CREATE INDEX idx_orders_courier_id ON public.orders (courier_id);

CREATE INDEX idx_orders_reservation ON public.orders (reservation_id);

CREATE INDEX idx_orders_paid_at ON public.orders (paid_at);

CREATE INDEX idx_orders_reservation_id ON public.orders (reservation_id);

CREATE INDEX idx_orders_kitchen_target ON public.orders (kitchen_target_section);

CREATE INDEX idx_orders_kitchen_status ON public.orders (kitchen_status);

CREATE INDEX idx_orders_campaign ON public.orders (campaign_id);

CREATE INDEX idx_orders_source_status ON public.orders (order_source, status);

CREATE INDEX idx_orders_takeaway_active ON public.orders (order_source, status)
  WHERE order_source = 'takeaway'::text AND (status <> ALL (ARRAY['paid'::text, 'closed'::text, 'cancelled'::text]));

CREATE INDEX idx_orders_group_id ON public.orders (group_id);

CREATE INDEX idx_orders_is_late ON public.orders (is_late)
  WHERE is_late = true;

CREATE INDEX idx_orders_reservation_id_status ON public.orders (reservation_id, status);

CREATE INDEX idx_orders_table_number_status ON public.orders (table_number, status);

CREATE INDEX idx_orders_status ON public.orders (status)
  WHERE status <> ALL (ARRAY['paid'::text, 'closed'::text, 'cancelled'::text]);

CREATE INDEX idx_orders_delivery_active ON public.orders (order_source, delivery_status)
  WHERE order_source = 'delivery'::text AND (delivery_status <> ALL (ARRAY['delivered'::text, 'cancelled'::text]));

CREATE INDEX idx_orders_rush ON public.orders (is_rush)
  WHERE is_rush = true;

CREATE INDEX idx_orders_created_at_status ON public.orders (created_at DESC, status);

CREATE UNIQUE INDEX idx_orders_order_number ON public.orders (order_number)
  WHERE order_number IS NOT NULL;

CREATE INDEX idx_orders_station_id ON public.orders (station_id);

CREATE INDEX idx_orders_terminal_id ON public.orders (updated_by_terminal_id);

CREATE TRIGGER trg_clear_bill_requested_on_payment
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (new.status = 'paid'::text AND old.status <> 'paid'::text)
  EXECUTE FUNCTION public.clear_bill_requested_on_payment();

CREATE TRIGGER trg_record_cash_payment
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (new.status = 'paid'::text AND old.status IS DISTINCT FROM 'paid'::text)
  EXECUTE FUNCTION public.fn_record_cash_payment();

CREATE TRIGGER trg_sync_table_kitchen_status
  AFTER UPDATE OF kitchen_status ON public.orders
  FOR EACH ROW
  WHEN (old.kitchen_status IS DISTINCT FROM new.kitchen_status)
  EXECUTE FUNCTION public.sync_table_kitchen_status();

CREATE POLICY auth_read_orders ON public.orders
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY orders_insert_public ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (((COALESCE(status, 'new'::text) = ANY (ARRAY['new'::text, 'confirmed'::text])) AND (table_number IS NOT NULL) AND (table_number >= 1) AND (table_number <= 200)));

CREATE POLICY orders_select_public ON public.orders
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY orders_update_public ON public.orders
  FOR UPDATE
  TO anon
  USING ((status = ANY (ARRAY['new'::text, 'confirmed'::text])))
  WITH CHECK ((status = ANY (ARRAY['new'::text, 'confirmed'::text, 'paid'::text, 'cancelled'::text])));

CREATE POLICY orders_write_staff ON public.orders
  TO authenticated
  USING ((public.is_admin_staff() OR public.is_kitchen_staff()))
  WITH CHECK ((public.is_admin_staff() OR public.is_kitchen_staff()));

CREATE POLICY service_full_orders ON public.orders
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_full_orders ON public.orders
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_orders ON public.orders
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text, 'kitchen'::text]))))));

ALTER TABLE public.orders
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders
  REPLICA IDENTITY FULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_course_status_check CHECK (course_status = ANY (ARRAY['none'::text, 'appetizers'::text, 'mains'::text, 'desserts'::text, 'completed'::text]));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_status_check
    CHECK
    (delivery_status IS NULL OR (delivery_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'waiting_courier'::text, 'picked_up'::text,
    'in_transit'::text, 'delivered'::text, 'completed'::text, 'cancelled'::text])));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.dining_groups(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_kitchen_status_check
    CHECK
    (kitchen_status IS NULL OR (kitchen_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'preparing'::text, 'cooking'::text, 'partially_ready'::text, 'ready'::text,
    'completed'::text, 'cancelled'::text, 'reserved'::text, 'served'::text])));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_source_check CHECK (order_source = ANY (ARRAY['dine_in'::text, 'takeaway'::text, 'delivery'::text]));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_printer_status_check CHECK (printer_status = ANY (ARRAY['online'::text, 'offline'::text, 'error'::text, 'low_paper'::text]));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
    CHECK
    (status = ANY (ARRAY['draft'::text, 'new'::text, 'open'::text, 'confirmed'::text, 'in_kitchen'::text, 'preparing'::text, 'partially_ready'::text, 'ready'::text, 'served'::text,
    'payment_pending'::text, 'paid'::text, 'closed'::text, 'cancelled'::text, 'refunded'::text]));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE SET NULL;

GRANT ALL ON public.orders TO anon;

GRANT ALL ON public.orders TO authenticated;

GRANT ALL ON public.orders TO service_role;