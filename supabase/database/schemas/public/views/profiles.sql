CREATE VIEW public.profiles AS SELECT id,
    name,
    full_name AS name_full,
    role,
    is_active,
    created_at
   FROM public.staff;

GRANT ALL ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;