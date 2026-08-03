CREATE TABLE public.state_transitions (
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

CREATE INDEX idx_state_transitions_entity ON public.state_transitions (entity, from_status);

CREATE INDEX idx_state_transitions_lookup ON public.state_transitions (entity, from_status, is_active);

CREATE POLICY service_role_full_state_transitions ON public.state_transitions
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.state_transitions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.state_transitions
  ADD CONSTRAINT state_transitions_entity_from_status_to_status_key UNIQUE (entity, from_status, to_status);

ALTER TABLE public.state_transitions
  ADD CONSTRAINT state_transitions_pkey PRIMARY KEY (id);

GRANT ALL ON public.state_transitions TO anon;

GRANT ALL ON public.state_transitions TO authenticated;

GRANT ALL ON public.state_transitions TO service_role;