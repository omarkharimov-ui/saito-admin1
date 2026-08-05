-- Create state_transitions table for SSOT state machine
CREATE TABLE IF NOT EXISTS public.state_transitions (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  entity               text                     NOT NULL,
  from_status          text                     NOT NULL,
  to_status            text                     NOT NULL,
  requires_role        text,
  requires_manager_pin boolean                  DEFAULT false,
  description          text,
  is_active            boolean                  DEFAULT true,
  created_at           timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_state_transitions_entity ON public.state_transitions (entity, from_status);
CREATE INDEX IF NOT EXISTS idx_state_transitions_lookup ON public.state_transitions (entity, from_status, is_active);

ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_full_state_transitions ON public.state_transitions
  USING (true) WITH CHECK (true);

ALTER TABLE public.state_transitions
  ADD CONSTRAINT state_transitions_entity_from_status_to_status_key UNIQUE (entity, from_status, to_status),
  ADD CONSTRAINT state_transitions_pkey PRIMARY KEY (id);

GRANT ALL ON public.state_transitions TO service_role;
REVOKE ALL ON public.state_transitions FROM anon;
REVOKE ALL ON public.state_transitions FROM authenticated;
