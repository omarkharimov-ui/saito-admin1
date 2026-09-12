┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ pg_get_functiondef                                                                                                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CREATE OR REPLACE FUNCTION public.has_permission_v2(p_staff_id uuid, p_permission_code character varying, p_active_role_id uuid DEFAULT NULL::uuid) │
│  RETURNS boolean                                                                                                                                    │
│  LANGUAGE plpgsql                                                                                                                                   │
│  SECURITY DEFINER                                                                                                                                   │
│  SET search_path TO 'public'                                                                                                                        │
│ AS $function$                                                                                                                                       │
│ DECLARE                                                                                                                                             │
│   v_has_permission BOOLEAN := false;                                                                                                                │
│ BEGIN                                                                                                                                               │
│   SELECT EXISTS (                                                                                                                                   │
│     SELECT 1 FROM get_effective_permissions_v2(                                                                                                     │
│       p_staff_id,                                                                                                                                   │
│       NULL,                                                                                                                                         │
│       p_active_role_id                                                                                                                              │
│     ) ep                                                                                                                                            │
│     WHERE ep.code = p_permission_code                                                                                                               │
│   ) INTO v_has_permission;                                                                                                                          │
│                                                                                                                                                     │
│   RETURN v_has_permission;                                                                                                                          │
│ END;                                                                                                                                                │
│ $function$                                                                                                                                          │
│                                                                                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
