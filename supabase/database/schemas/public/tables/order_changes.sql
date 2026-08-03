CREATE TABLE public.order_changes (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  order_id     uuid,
  change_type  text                     NOT NULL,
  old_values   jsonb,
  new_values   jsonb,
  performed_by uuid,
  created_at   timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_order_changes_order_id ON public.order_changes (order_id);

CREATE INDEX idx_order_changes_created_at ON public.order_changes (created_at DESC);

ALTER TABLE public.order_changes
  ADD CONSTRAINT order_changes_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.admin_users(id);

ALTER TABLE public.order_changes
  ADD CONSTRAINT order_changes_pkey PRIMARY KEY (id);

ALTER TABLE public.order_changes
  ADD CONSTRAINT order_changes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

GRANT ALL ON public.order_changes TO anon;

GRANT ALL ON public.order_changes TO authenticated;

GRANT ALL ON public.order_changes TO service_role;