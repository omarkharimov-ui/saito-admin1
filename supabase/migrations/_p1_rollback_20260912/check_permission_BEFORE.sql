┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ pg_get_functiondef                                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ CREATE OR REPLACE FUNCTION public.check_permission(p_staff_id uuid, p_permission_code text) │
│  RETURNS json                                                                               │
│  LANGUAGE plpgsql                                                                           │
│  SECURITY DEFINER                                                                           │
│  SET search_path TO 'public'                                                                │
│ AS $function$                                                                               │
│ DECLARE                                                                                     │
│   v_has_permission BOOLEAN;                                                                 │
│   v_override BOOLEAN;                                                                       │
│ BEGIN                                                                                       │
│   SELECT spo.is_allowed INTO v_override                                                     │
│   FROM public.staff_permission_overrides spo                                                │
│   JOIN public.permissions p ON p.key = spo.permission_key                                   │
│   WHERE spo.staff_id = p_staff_id AND p.code = p_permission_code;                           │
│                                                                                             │
│   IF FOUND THEN                                                                             │
│     RETURN json_build_object('has_permission', v_override, 'source', 'override');           │
│   END IF;                                                                                   │
│                                                                                             │
│   SELECT EXISTS (                                                                           │
│     SELECT 1                                                                                │
│     FROM public.staff st                                                                    │
│     JOIN public.role_permissions rp ON rp.role_id = st.role_id                              │
│     JOIN public.permissions p ON p.key = rp.permission_key                                  │
│     WHERE st.id = p_staff_id AND p.code = p_permission_code                                 │
│   ) INTO v_has_permission;                                                                  │
│                                                                                             │
│   RETURN json_build_object('has_permission', v_has_permission, 'source', 'role');           │
│ END;                                                                                        │
│ $function$                                                                                  │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
