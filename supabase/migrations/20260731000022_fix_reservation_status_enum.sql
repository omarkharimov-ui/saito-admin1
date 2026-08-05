-- Fix reservation status enum: add checked_in and seated to match API and RPC usage
-- The API route /api/reservations/status uses 'checked_in' as a transition target
-- The RPC confirm_and_checkin_atomic sets status to 'confirmed'
-- The RPC seat_guests_atomic sets status to 'seated'

ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'waiting'::text, 'checked_in'::text, 'seated'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'archived'::text, 'expired'::text]));
