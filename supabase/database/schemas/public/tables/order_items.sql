CREATE TABLE public.order_items (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id               uuid,
  product_id             uuid,
  quantity               integer                  DEFAULT 1 NOT NULL,
  unit_price             numeric(10,2)            NOT NULL,
  created_at             timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  variant_id             uuid,
  product_name           text,
  total_price            numeric,
  kitchen_status         character varying(20)    DEFAULT 'pending'::character varying,
  image_url              text,
  prepared_quantity      integer                  DEFAULT 0 NOT NULL,
  variant_name           text,
  modifiers              jsonb                    DEFAULT '[]'::jsonb,
  course                 text                     DEFAULT 'main'::text,
  served_quantity        integer                  DEFAULT 0,
  special_notes          text                     DEFAULT ''::text,
  combo_group_id         uuid,
  is_combo_parent        boolean                  DEFAULT false,
  parent_order_item_id   uuid,
  served_at              timestamp with time zone,
  station                text                     DEFAULT 'all'::text,
  allergens              jsonb                    DEFAULT '[]'::jsonb,
  hold_reason            text,
  hold_by                uuid,
  is_hold                boolean                  DEFAULT false,
  seat_number            integer,
  hold_until             timestamp with time zone,
  price_snapshot         jsonb,
  station_id             uuid,
  updated_by_terminal_id text,
  updated_at             timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_order_items_created_at ON public.order_items (created_at DESC);

CREATE INDEX idx_order_items_station_status ON public.order_items (station, kitchen_status)
  WHERE kitchen_status::text <> ALL (ARRAY['completed'::character varying, 'cancelled'::character varying, 'served'::character varying]::text[]);

CREATE INDEX idx_order_items_station_id ON public.order_items (station_id);

CREATE INDEX idx_order_items_parent ON public.order_items (parent_order_item_id);

CREATE INDEX idx_order_items_kitchen_section ON public.order_items (kitchen_status);

CREATE INDEX idx_order_items_seat ON public.order_items (order_id, seat_number)
  WHERE seat_number IS NOT NULL;

CREATE INDEX idx_order_items_order_kitchen ON public.order_items (order_id, kitchen_status);

CREATE INDEX idx_order_items_kitchen_status ON public.order_items (kitchen_status)
  WHERE kitchen_status::text <> ALL (ARRAY['completed'::character varying, 'cancelled'::character varying]::text[]);

CREATE INDEX idx_order_items_terminal_id ON public.order_items (updated_by_terminal_id);

CREATE TRIGGER set_order_item_kitchen_section_trigger
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_item_kitchen_section();

CREATE TRIGGER trg_sync_order_kitchen_status
  AFTER INSERT OR DELETE OR UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_kitchen_status();

CREATE TRIGGER trg_sync_table_kitchen_status_items
  AFTER UPDATE OF kitchen_status ON public.order_items
  FOR EACH ROW
  WHEN (old.kitchen_status::text IS DISTINCT FROM new.kitchen_status::text)
  EXECUTE FUNCTION public.sync_table_kitchen_status();

CREATE TRIGGER trigger_set_kitchen_section
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_item_kitchen_section();

CREATE POLICY auth_read_order_items ON public.order_items
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY order_items_insert_public ON public.order_items
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY order_items_select_public ON public.order_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY order_items_update_public ON public.order_items
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY order_items_write_staff ON public.order_items
  TO authenticated
  USING ((public.is_admin_staff() OR public.is_kitchen_staff()))
  WITH CHECK ((public.is_admin_staff() OR public.is_kitchen_staff()));

CREATE POLICY service_full_order_items ON public.order_items
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_full_order_items ON public.order_items
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_order_items ON public.order_items
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text, 'cashier'::text, 'kitchen'::text]))))));

ALTER TABLE public.order_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_kitchen_status_check
    CHECK
    (kitchen_status IS NULL OR (kitchen_status::text = ANY (ARRAY['pending'::text, 'accepted'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'completed'::text,
    'cancelled'::text, 'bar'::text, 'hot'::text, 'sushi'::text, 'reserved'::text, 'sent'::text, 'recalled'::text, 'comped'::text, 'wasted'::text])));

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_parent_order_item_id_fkey FOREIGN KEY (parent_order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_hold_by_fkey FOREIGN KEY (hold_by) REFERENCES public.staff(id);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_station_id_fkey FOREIGN KEY (station_id) REFERENCES public.stations(id) ON DELETE SET NULL;

GRANT ALL ON public.order_items TO anon;

GRANT ALL ON public.order_items TO authenticated;

GRANT ALL ON public.order_items TO service_role;