CREATE TABLE public.reservation_preorder_items (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  reservation_id uuid                     NOT NULL,
  product_id     uuid,
  product_name   text,
  quantity       integer                  DEFAULT 1 NOT NULL,
  unit_price     numeric                  NOT NULL,
  modifiers      jsonb                    DEFAULT '[]'::jsonb,
  special_notes  text                     DEFAULT ''::text,
  course         text                     DEFAULT 'main'::text,
  created_at     timestamp with time zone DEFAULT now(),
  combo_id       uuid
);

ALTER TABLE public.reservation_preorder_items
  ADD CONSTRAINT reservation_preorder_items_combo_id_fkey FOREIGN KEY (combo_id) REFERENCES public.combos(id) ON DELETE SET NULL;

ALTER TABLE public.reservation_preorder_items
  ADD CONSTRAINT reservation_preorder_items_pkey PRIMARY KEY (id);

ALTER TABLE public.reservation_preorder_items
  ADD CONSTRAINT reservation_preorder_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.reservation_preorder_items
  ADD CONSTRAINT reservation_preorder_items_product_or_combo_check CHECK (product_id IS NOT NULL AND combo_id IS NULL OR product_id IS NULL AND combo_id IS NOT NULL);

ALTER TABLE public.reservation_preorder_items
  ADD CONSTRAINT reservation_preorder_items_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;

GRANT ALL ON public.reservation_preorder_items TO anon;

GRANT ALL ON public.reservation_preorder_items TO authenticated;

GRANT ALL ON public.reservation_preorder_items TO service_role;