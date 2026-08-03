CREATE TABLE public.inventory_logs (
  id                       uuid                      DEFAULT gen_random_uuid() NOT NULL,
  ingredient_id            uuid                      NOT NULL,
  type                     public.inventory_log_type NOT NULL,
  quantity                 numeric(12,3)             NOT NULL,
  cost_per_unit            numeric(10,4),
  reason                   text,
  order_id                 uuid,
  created_at               timestamp with time zone  DEFAULT now() NOT NULL,
  supplier_invoice_line_id uuid,
  goods_receipt_line_id    uuid,
  procurement_anomaly_id   uuid,
  source_type              text,
  reference_type           text,
  reference_id             uuid,
  unit_cost                numeric(12,4),
  notes                    text,
  order_item_id            uuid,
  item_quantity            numeric                   DEFAULT 1
);

CREATE INDEX idx_invlogs_type ON public.inventory_logs (TYPE);

CREATE INDEX idx_inventory_logs_order_item ON public.inventory_logs (order_item_id);

CREATE INDEX idx_invlogs_ingredient ON public.inventory_logs (ingredient_id);

CREATE INDEX idx_inventory_logs_ingredient ON public.inventory_logs (ingredient_id);

CREATE INDEX idx_invlogs_created ON public.inventory_logs (created_at DESC);

CREATE INDEX inventory_logs_supplier_invoice_line_idx ON public.inventory_logs (supplier_invoice_line_id);

CREATE INDEX idx_inventory_logs_reference ON public.inventory_logs (reference_type, reference_id)
  WHERE reference_type IS NOT NULL;

CREATE INDEX idx_inventory_logs_type ON public.inventory_logs (TYPE);

CREATE INDEX inventory_logs_goods_receipt_line_idx ON public.inventory_logs (goods_receipt_line_id);

CREATE INDEX idx_inventory_logs_order_id ON public.inventory_logs (order_id);

CREATE INDEX inventory_logs_procurement_anomaly_idx ON public.inventory_logs (procurement_anomaly_id);

CREATE INDEX idx_inventory_logs_order ON public.inventory_logs (reference_id)
  WHERE reference_type = 'order'::text;

CREATE TRIGGER trg_inventory_logs_after_insert
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_stock_on_consumption();

CREATE TRIGGER trg_product_availability_on_stock
  AFTER INSERT OR DELETE OR UPDATE ON public.inventory_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.update_product_availability();

CREATE TRIGGER trg_set_inventory_log_unit_cost
  BEFORE INSERT ON public.inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inventory_log_unit_cost();

CREATE TRIGGER trg_theoretical_stock
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_theoretical_stock();

CREATE TRIGGER trg_update_stock_on_log
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stock_on_log();

CREATE TRIGGER trg_wac_on_stock_in
  AFTER INSERT ON public.inventory_logs
  FOR EACH ROW
  WHEN (new.type = 'stock_in'::public.inventory_log_type)
  EXECUTE FUNCTION public.apply_wac_on_stock_in();

CREATE POLICY auth_read_inventory_logs ON public.inventory_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY inv_inventory_logs_all ON public.inventory_logs
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_full_inventory_logs ON public.inventory_logs
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_full_inventory_logs ON public.inventory_logs
  USING (true)
  WITH CHECK (true);

CREATE POLICY auth_modify_inventory_logs ON public.inventory_logs
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.id = auth.uid()) AND (staff.role = ANY (ARRAY['superadmin'::text, 'admin'::text]))))));

ALTER TABLE public.inventory_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_logs
  ADD CONSTRAINT inventory_logs_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;

ALTER TABLE public.inventory_logs
  ADD CONSTRAINT inventory_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.inventory_logs
  ADD CONSTRAINT inventory_logs_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;

GRANT ALL ON public.inventory_logs TO anon;

GRANT ALL ON public.inventory_logs TO authenticated;

GRANT ALL ON public.inventory_logs TO service_role;