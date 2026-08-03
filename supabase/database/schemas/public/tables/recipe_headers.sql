CREATE TABLE public.recipe_headers (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  menu_item_id uuid                     NOT NULL,
  instructions text,
  created_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE public.recipe_headers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_headers
  ADD CONSTRAINT recipe_headers_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.recipe_headers
  ADD CONSTRAINT recipe_headers_menu_item_id_key UNIQUE (menu_item_id);

ALTER TABLE public.recipe_headers
  ADD CONSTRAINT recipe_headers_pkey PRIMARY KEY (id);

GRANT ALL ON public.recipe_headers TO anon;

GRANT ALL ON public.recipe_headers TO authenticated;

GRANT ALL ON public.recipe_headers TO service_role;