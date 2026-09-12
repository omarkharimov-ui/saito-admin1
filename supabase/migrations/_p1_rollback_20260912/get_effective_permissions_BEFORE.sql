┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ pg_get_functiondef                                                                                                                                               │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CREATE OR REPLACE FUNCTION public.get_effective_permissions(p_staff_id uuid)                                                                                     │
│  RETURNS TABLE(permission_code character varying, permission_name character varying, category_name text, is_granted boolean, source character varying)           │
│  LANGUAGE plpgsql                                                                                                                                                │
│  SECURITY DEFINER                                                                                                                                                │
│  SET search_path TO 'public'                                                                                                                                     │
│ AS $function$                                                                                                                                                    │
│ BEGIN                                                                                                                                                            │
│   RETURN QUERY                                                                                                                                                   │
│   SELECT                                                                                                                                                         │
│     p.code, p.name, pc.name::text,                                                                                                                               │
│     COALESCE(spo.is_allowed, (rp.permission_key IS NOT NULL), false)::boolean,                                                                                   │
│     (CASE                                                                                                                                                        │
│       WHEN spo.id IS NOT NULL THEN 'override'                                                                                                                    │
│       WHEN rp.permission_key IS NOT NULL THEN 'role'                                                                                                             │
│       ELSE 'default'                                                                                                                                             │
│     END)::character varying                                                                                                                                      │
│   FROM public.permissions p                                                                                                                                      │
│   LEFT JOIN public.permission_categories pc ON pc.id = p.category_id                                                                                             │
│   LEFT JOIN public.role_permissions rp ON rp.permission_key = p.key AND rp.role_id = (SELECT role_id FROM staff WHERE id = p_staff_id)                           │
│   LEFT JOIN public.staff_permission_overrides spo ON spo.permission_key = p.key AND spo.staff_id = p_staff_id                                                    │
│   ORDER BY pc.sort_order, p.name;                                                                                                                                │
│ END;                                                                                                                                                             │
│ $function$                                                                                                                                                       │
│                                                                                                                                                                  │
│ CREATE OR REPLACE FUNCTION public.get_effective_permissions_v2(p_staff_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_active_role_id uuid DEFAULT NULL::uuid) │
│  RETURNS json                                                                                                                                                    │
│  LANGUAGE plpgsql                                                                                                                                                │
│  SECURITY DEFINER                                                                                                                                                │
│  SET search_path TO 'public'                                                                                                                                     │
│ AS $function$                                                                                                                                                    │
│ DECLARE                                                                                                                                                          │
│   result JSON;                                                                                                                                                   │
│ BEGIN                                                                                                                                                            │
│   WITH staff_base_perms AS (                                                                                                                                     │
│     SELECT DISTINCT rp.permission_key                                                                                                                            │
│     FROM public.staff s                                                                                                                                          │
│     JOIN public.role_permissions rp ON rp.role_id = s.role_id                                                                                                    │
│     WHERE s.id = p_staff_id                                                                                                                                      │
│     UNION                                                                                                                                                        │
│     SELECT DISTINCT spo.permission_key                                                                                                                           │
│     FROM public.staff_permission_overrides spo                                                                                                                   │
│     WHERE spo.staff_id = p_staff_id AND spo.is_allowed = true                                                                                                    │
│   ),                                                                                                                                                             │
│   active_role_perms AS (                                                                                                                                         │
│     SELECT DISTINCT rp.permission_key                                                                                                                            │
│     FROM public.role_permissions rp                                                                                                                              │
│     WHERE rp.role_id = p_active_role_id                                                                                                                          │
│   ),                                                                                                                                                             │
│   effective AS (                                                                                                                                                 │
│     SELECT DISTINCT p.code, p.name, p.key                                                                                                                        │
│     FROM public.permissions p                                                                                                                                    │
│     WHERE p.key IN (                                                                                                                                             │
│         SELECT permission_key FROM active_role_perms                                                                                                             │
│         UNION                                                                                                                                                    │
│         SELECT permission_key FROM staff_base_perms                                                                                                              │
│     )                                                                                                                                                            │
│   )                                                                                                                                                              │
│   SELECT json_agg(e.*) INTO result FROM effective e;                                                                                                             │
│                                                                                                                                                                  │
│   RETURN COALESCE(result, '[]'::json);                                                                                                                           │
│ END;                                                                                                                                                             │
│ $function$                                                                                                                                                       │
│                                                                                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
