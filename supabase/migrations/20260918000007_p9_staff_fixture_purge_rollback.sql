-- P-9 M7 ROLLBACK — full restore from the 14 p9_archive_*_purge tables.
-- Restores: staff (1,055, original pre-neutralize fidelity incl. pin_hash),
-- 10 deleted child tables, and the 3 SET-NULL staff references.
-- Order: staff first (parent), then shifts, then shift_breaks (child of
-- shifts), then remaining children.
BEGIN;

INSERT INTO public.staff
  SELECT * FROM public.p9_archive_staff_purge;

INSERT INTO public.shifts
  SELECT * FROM public.p9_archive_shifts_purge;

INSERT INTO public.shift_breaks
  SELECT * FROM public.p9_archive_shift_breaks_purge;

INSERT INTO public.cash_drawer_sessions
  SELECT * FROM public.p9_archive_cash_drawer_sessions_purge;

INSERT INTO public.cash_drawer_log
  SELECT * FROM public.p9_archive_cash_drawer_log_purge;

INSERT INTO public.sessions
  SELECT * FROM public.p9_archive_sessions_purge;

INSERT INTO public.login_attempts
  SELECT * FROM public.p9_archive_login_attempts_purge;

INSERT INTO public.approval_requests
  SELECT * FROM public.p9_archive_approval_requests_purge;

INSERT INTO public.staff_locations
  SELECT * FROM public.p9_archive_staff_locations_purge;

INSERT INTO public.security_events
  SELECT * FROM public.p9_archive_security_events_purge;

INSERT INTO public.schedule
  SELECT * FROM public.p9_archive_schedule_purge;

-- time_clock_* + overtime_records rows were DELETED (their staff_id columns
-- are NOT NULL — the "SET NULL" FKs are a pre-existing catalog oddity that
-- enforces NO ACTION). Order: time_clock_entries before time_clock_audit
-- (audit.time_clock_entry_id → entries FK); overtime_records last of these
-- (its shift_id → shifts FK, shifts already restored above).
INSERT INTO public.time_clock_entries
  SELECT * FROM public.p9_archive_time_clock_entries_purge;

INSERT INTO public.time_clock_audit
  SELECT * FROM public.p9_archive_time_clock_audit_purge;

INSERT INTO public.overtime_records
  SELECT * FROM public.p9_archive_overtime_records_purge;

COMMIT;
-- Note: p9_archive_*_purge tables and p9_m7_fixture_ids are intentionally
-- KEPT after rollback (audit record of the purge set). Drop manually if the
-- purge is being re-attempted (the M7 guard checks p9_archive_staff_purge).
