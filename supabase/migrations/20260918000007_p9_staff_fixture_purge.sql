-- =============================================================================
-- P-9 M7 — staff fixture purge (ratified D-8, scope 1,055 = 1,025 inactive +
-- 30 active; M7-R1 2026-09-17 expanded residue list after live re-verify —
-- the 30 active fixtures carried children not in the original D-8 sweep).
--
-- HARD-STOP DESIGN (user-ratified 2026-09-17, 10 requirements):
--   R1  53 real staff protected by EXACT ID denylist (hardcoded below) — not
--       just name patterns.
--   R2  1,055 fixture IDs materialized as exact set (p9_m7_fixture_ids);
--       denylist ∩ fixture = 0 asserted; staff total = 1,108 asserted.
--   R3  RESTRICT-aware delete order precomputed; every child delete
--       verified to 0 residue inside the txn.
--   R4  p9_archive_staff_purge + 10 child archives + 3 SET-NULL archives —
--       rollback restores staff, deleted children AND pre-null staff refs.
--   R5  every archive row count asserted == pre-delete snapshot constant.
--   R6  login_preflight pool: pre=39 asserted; post ≤ 9 asserted (=9).
--   R7  M6's 10 FKs: 0 orphan / 0 violation asserted post-delete.
--   R8  frozen-gate real-staff identity: post-delete staff set == the 53-ID
--       denylist (both directions); 9 active real asserted.
--   R9  trg_staff_prevent_delete: DISABLE → DELETE → ENABLE with explicit
--       EXCEPTION-guarded re-enable; final state asserted enabled.
--   R10 ALL assertions run BEFORE any DELETE; any failure = RAISE EXCEPTION
--       = transaction abort = zero side effects (transactional DDL/DML).
--
-- Snapshots (live-verified 2026-09-17, pre-M7; source: M7 preflight):
--   fixture=1,055 | real=53 (9 active) | staff_total=1,108 | pool=39
--   shift_breaks=2 cash_drawer_sessions=2 cash_drawer_log=4 sessions=6
--   login_attempts=82 approval_requests=25 staff_locations=111
--   security_events=288 schedule=2 shifts=43
--   time_clock_audit=7 time_clock_entries=6 overtime_records=1 (DELETED —
--   staff_id NOT NULL + "SET NULL" FK catalog oddity enforces NO ACTION)
--   neutralize target (inactive fixtures)=1,025
-- Soft refs left as-is (no FK, append-only/legacy, 2026-09-11 gate residue):
--   audit_logs_canonical.actor_id=16, operation_logs.performed_by=4,
--   outbox_events.aggregate_id=16 (staff.active/staff.inactive),
--   cash_drawer_logs.staff_id=1 (legacy plural, 0 app reads).
-- Rollback: 20260918000007_p9_staff_fixture_purge_rollback.sql
-- =============================================================================
DO $m7$
DECLARE
  v_n bigint;
  v_trigger_state char;
  v_denylist uuid[] := ARRAY[
    -- 9 ACTIVE real staff
    '4e25370a-66cf-4362-ad72-95e8e892355d', -- Admin Updated
    '3ab7b025-b264-4a93-b186-644e4c7f5f6e', -- ESGmtwse8zs_CASH (out of D-8 pattern scope)
    '93bab381-e9c7-490a-9a16-f935248fb14d', -- ESGmtwse8zs_MGR
    'ca4ef143-e60f-463d-aed3-0efc0a7e3ebb', -- ESGmtwse8zs_NOL
    '0f387c45-b5ab-4bdd-b859-d93e9456a670', -- ESGmtwse8zs_WTR
    '96baaa16-8779-4d1d-a500-a3ce9084810e', -- Kassir
    'a3d650b1-9635-456a-9bb0-e37d12b475fb', -- kitchen
    'c814879d-5378-4791-8c5f-8ee5aee51994', -- superadmin
    'bc2cda50-7336-407e-8540-5b5896126372', -- Tural Memmedov
    -- 44 INACTIVE real staff
    '15000000-0000-4000-8000-000000000007', 'e84f7796-7b5a-402b-a6af-d5a55b0de771',
    '89524095-0357-4fb4-a224-4b4c579170c8', '626d985f-b7ff-4d3d-a636-093bea57f618',
    '15000000-0000-4000-8000-000000000004', 'bde8908d-e375-4c80-81a2-49997383c605',
    'a84d7887-2727-4522-a7fe-376d58c9af96', '71b3c067-2ef9-4db7-8432-ac86b456028f',
    '16eb272a-736b-418c-9027-f3ccbaa8186c', '9573fd2e-8091-42c0-b642-36a2d7190ce8',
    '0fcb1fbd-6719-4a64-aede-090960a9c895', '15000000-0000-4000-8000-000000000008',
    '6d94dbd8-6900-4bdb-b539-2cfb302a4ecc', '00b2b3f7-b2a8-4df2-878a-41a7384a1d6a',
    '66601115-bf4c-4fda-b7ca-9e86f74bd098',     '7fe08d1e-df63-4bb4-9a68-79fc41054081',
    '8aa0edcf-15e5-42c9-9c9d-77a7598fb36c', 'a598f0c4-3995-4299-8fd4-345a41beb834',
    '1a2577eb-f631-4ff6-b893-199ded007190',     '4f0a5179-7b07-4d2d-b3d3-5f6cd082a58b',
    'b7cac2bf-259e-419c-b017-e3000818a392', 'fe3ca1cd-9518-4d88-8768-bcb669cf27b0',
    '15000000-0000-4000-8000-000000000001', '1b9b04e4-6be4-4fce-a1d1-7fd4dbb7d2aa',
    '93a01f90-43df-42c7-98e8-e821d7183921', '3a1d026c-b199-4e69-9bd7-b93200892a5e',
    'f71f31e2-026c-413b-b43a-887f8ae997ae', '15000000-0000-4000-8000-000000000005',
    '8ba82d41-271e-4524-a73b-6e186c7bd5d1', '2e4f68d1-3a4e-46b0-a884-460ebcf39b2c',
    '15000000-0000-4000-8000-000000000002', 'ea961624-3e89-4c25-8f75-050988b6a431',
    '39793dbc-3445-4d84-8629-62493a4dea1d', '6e9eeb24-71eb-4790-8e7d-b3ca1a78ad25',
    '7bc8812e-cae0-4f49-9986-b884123c37e9', 'd84dd70a-052a-415d-9525-edb064f86618',
    'c6c9a03d-9694-44a2-8a00-dbe2edc9c546', '11d93740-9df4-462b-b638-2dd4207379c8',
    '15000000-0000-4000-8000-000000000003', 'd7c0e890-6604-43a3-8a63-acb086b2e404',
    'f40062d2-a7ee-416d-94cf-465a588e24df', '834e29cd-246d-4ab3-ae10-37e9bdfb434e',
    '15000000-0000-4000-8000-000000000006', '34ef7734-7920-484a-af54-5d660071c187'
  ];
BEGIN
  -- ================= GUARD: idempotency =================
  IF to_regclass('public.p9_archive_staff_purge') IS NOT NULL THEN
    RAISE EXCEPTION 'M7 GUARD: p9_archive_staff_purge already exists — M7 already applied or partial state. ABORT.';
  END IF;

  -- ============ PHASE 0 — EXACT SETS (R1, R2, R10: before any mutation) ============
  CREATE TABLE public.p9_m7_fixture_ids AS
    SELECT id FROM staff
    WHERE (name ~ '^[A-Z0-9_]{1,4}_' OR name ~ '^G2mt' OR name LIKE 'P8\_S%');

  SELECT count(*) INTO v_n FROM public.p9_m7_fixture_ids;
  IF v_n <> 1055 THEN
    RAISE EXCEPTION 'M7 PHASE0 [R2]: fixture set = %, expected 1055. ABORT.', v_n;
  END IF;

  -- R1: all 53 denylist IDs must exist in staff
  SELECT count(*) INTO v_n FROM staff s WHERE s.id = ANY(v_denylist);
  IF v_n <> 53 THEN
    RAISE EXCEPTION 'M7 PHASE0 [R1]: denylist IDs present = %, expected 53 (exact IDs must all exist). ABORT.', v_n;
  END IF;

  -- R2: denylist ∩ fixture = 0
  SELECT count(*) INTO v_n FROM staff s
  WHERE s.id = ANY(v_denylist) AND s.id IN (SELECT id FROM public.p9_m7_fixture_ids);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'M7 PHASE0 [R2]: denylist ∩ fixture = % ≠ 0 — real staff in purge set. ABORT.', v_n;
  END IF;

  -- drift guard: 1055 + 53 = 1108
  SELECT count(*) INTO v_n FROM staff;
  IF v_n <> 1108 THEN
    RAISE EXCEPTION 'M7 PHASE0 [R2]: staff total = %, expected 1108. Drift. ABORT.', v_n;
  END IF;

  -- R8: active real = 9 (pre)
  SELECT count(*) INTO v_n FROM staff s WHERE s.id = ANY(v_denylist) AND s.is_active;
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'M7 PHASE0 [R8]: active real = %, expected 9. ABORT.', v_n;
  END IF;

  -- R6: pre-purge pool = 39
  SELECT count(*) INTO v_n FROM staff s
  WHERE s.is_active AND s.status = 'ACTIVE' AND s.pin_hash IS NOT NULL AND s.pin_hash <> '';
  IF v_n <> 39 THEN
    RAISE EXCEPTION 'M7 PHASE0 [R6]: login_preflight pool = %, expected 39. ABORT.', v_n;
  END IF;

  -- ============ PHASE 1 — ARCHIVES (R4, R5: before any mutation) ============
  -- staff full fidelity (BEFORE neutralize — preserves original pin_hash)
  CREATE TABLE public.p9_archive_staff_purge AS
    SELECT * FROM staff WHERE id IN (SELECT id FROM public.p9_m7_fixture_ids);

  -- deleted children (RESTRICT/NO ACTION/CASCADE)
  CREATE TABLE public.p9_archive_shift_breaks_purge AS
    SELECT * FROM shift_breaks t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_cash_drawer_sessions_purge AS
    SELECT * FROM cash_drawer_sessions t WHERE t.opened_by IN (SELECT id FROM public.p9_m7_fixture_ids)
       OR t.closed_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_cash_drawer_log_purge AS
    SELECT * FROM cash_drawer_log t WHERE t.created_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_sessions_purge AS
    SELECT * FROM sessions t WHERE t.user_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_login_attempts_purge AS
    SELECT * FROM login_attempts t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_approval_requests_purge AS
    SELECT * FROM approval_requests t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids)
       OR t.reviewed_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_staff_locations_purge AS
    SELECT * FROM staff_locations t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_security_events_purge AS
    SELECT * FROM security_events t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_schedule_purge AS
    SELECT * FROM schedule t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_shifts_purge AS
    SELECT * FROM shifts t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  -- SET-NULL children (rows stay; pre-null values archived for R4 rollback)
  CREATE TABLE public.p9_archive_time_clock_audit_purge AS
    SELECT * FROM time_clock_audit t WHERE t.performed_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_overtime_records_purge AS
    SELECT * FROM overtime_records t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids)
       OR t.approved_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  CREATE TABLE public.p9_archive_time_clock_entries_purge AS
    SELECT * FROM time_clock_entries t WHERE t.staff_id IN (SELECT id FROM public.p9_m7_fixture_ids)
       OR t.approved_by IN (SELECT id FROM public.p9_m7_fixture_ids);

  -- R5: archive counts == pre-delete snapshot constants (live-verified 2026-09-17)
  SELECT count(*) INTO v_n FROM public.p9_archive_staff_purge;         IF v_n <> 1055 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: staff archive = %, expected 1055.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_shift_breaks_purge;  IF v_n <> 2    THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: shift_breaks archive = %, expected 2.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_cash_drawer_sessions_purge; IF v_n <> 2 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: cash_drawer_sessions archive = %, expected 2.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_cash_drawer_log_purge;      IF v_n <> 4 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: cash_drawer_log archive = %, expected 4.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_sessions_purge;      IF v_n <> 6    THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: sessions archive = %, expected 6.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_login_attempts_purge; IF v_n <> 82  THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: login_attempts archive = %, expected 82.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_approval_requests_purge; IF v_n <> 25 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: approval_requests archive = %, expected 25.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_staff_locations_purge; IF v_n <> 111 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: staff_locations archive = %, expected 111.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_security_events_purge; IF v_n <> 288 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: security_events archive = %, expected 288.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_schedule_purge;      IF v_n <> 2    THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: schedule archive = %, expected 2.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_shifts_purge;        IF v_n <> 43   THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: shifts archive = %, expected 43.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_time_clock_audit_purge;   IF v_n <> 7 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: time_clock_audit archive = %, expected 7.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_overtime_records_purge;   IF v_n <> 1 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: overtime_records archive = %, expected 1.', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.p9_archive_time_clock_entries_purge; IF v_n <> 6 THEN RAISE EXCEPTION 'M7 PHASE1 [R5]: time_clock_entries archive = %, expected 6.', v_n; END IF;

  -- ============ PHASE 2 — NEUTRALIZE (proven pattern; AFTER archive so ============
  -- ============ original pin_hash is preserved in p9_archive_staff_purge) =======
  UPDATE staff
     SET pin_hash = '', locked_until = NULL
   WHERE id IN (SELECT id FROM public.p9_m7_fixture_ids) AND is_active = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1025 THEN
    RAISE EXCEPTION 'M7 PHASE2: neutralized %, expected 1025 inactive fixtures. ABORT.', v_n;
  END IF;

  -- ============ PHASE 3 — CHILD DELETES (R3: RESTRICT-aware order) ============
  -- 1) shift_breaks (before shifts: FK→shifts CASCADE + FK→staff CASCADE)
  DELETE FROM shift_breaks WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 2 THEN RAISE EXCEPTION 'M7 PHASE3: shift_breaks deleted %, expected 2.', v_n; END IF;
  -- 2) cash_drawer_log (FK→staff NO ACTION; FK→shifts RESTRICT but 0 refs;
  --     MUST precede cash_drawer_sessions: cash_drawer_log.session_id →
  --     cash_drawer_sessions is CASCADE, would silently eat these 4 rows)
  DELETE FROM cash_drawer_log WHERE created_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 4 THEN RAISE EXCEPTION 'M7 PHASE3: cash_drawer_log deleted %, expected 4.', v_n; END IF;
  -- 3) cash_drawer_sessions (FK→staff NO ACTION ×2; references fixture shifts)
  DELETE FROM cash_drawer_sessions
   WHERE opened_by IN (SELECT id FROM public.p9_m7_fixture_ids)
      OR closed_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 2 THEN RAISE EXCEPTION 'M7 PHASE3: cash_drawer_sessions deleted %, expected 2.', v_n; END IF;
  -- 4) sessions (FK→staff RESTRICT)
  DELETE FROM sessions WHERE user_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 6 THEN RAISE EXCEPTION 'M7 PHASE3: sessions deleted %, expected 6.', v_n; END IF;
  -- 5) login_attempts (FK→staff RESTRICT, M6)
  DELETE FROM login_attempts WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 82 THEN RAISE EXCEPTION 'M7 PHASE3: login_attempts deleted %, expected 82.', v_n; END IF;
  -- 6) approval_requests (FK→staff RESTRICT; 0 real co-refs proven)
  DELETE FROM approval_requests
   WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids)
      OR reviewed_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 25 THEN RAISE EXCEPTION 'M7 PHASE3: approval_requests deleted %, expected 25.', v_n; END IF;
  -- 7) staff_locations (FK→staff CASCADE — explicit for archive control)
  DELETE FROM staff_locations WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 111 THEN RAISE EXCEPTION 'M7 PHASE3: staff_locations deleted %, expected 111.', v_n; END IF;
  -- 8) security_events (FK→staff NO ACTION)
  DELETE FROM security_events WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 288 THEN RAISE EXCEPTION 'M7 PHASE3: security_events deleted %, expected 288.', v_n; END IF;
  -- 9) schedule (FK→staff CASCADE — explicit)
  DELETE FROM schedule WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 2 THEN RAISE EXCEPTION 'M7 PHASE3: schedule deleted %, expected 2.', v_n; END IF;
  -- 10) time_clock_audit (FK→staff "SET NULL" but performed_by rows also are
  --     gate residue; MUST precede time_clock_entries: time_clock_audit.
  --     time_clock_entry_id → time_clock_entries FK blocks entry deletes)
  DELETE FROM time_clock_audit WHERE performed_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 7 THEN RAISE EXCEPTION 'M7 PHASE3: time_clock_audit deleted %, expected 7.', v_n; END IF;
  -- 11) time_clock_entries — staff_id is NOT NULL, so the "SET NULL" FK
  --     (pre-existing catalog oddity: confdeltype='a' but no ON DELETE
  --     clause, enforces NO ACTION) CANNOT auto-null; rows must be deleted
  --     (archived PHASE 1; 0 audit rows reference these entries — proven)
  DELETE FROM time_clock_entries
   WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids)
      OR approved_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 6 THEN RAISE EXCEPTION 'M7 PHASE3: time_clock_entries deleted %, expected 6.', v_n; END IF;
  -- 12) overtime_records — staff_id NOT NULL (same reason as 11); the 1 row
  --     is archived; its shift_id (fixture shift) must be cleared before
  --     shifts delete → deleting the row handles it
  DELETE FROM overtime_records
   WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids)
      OR approved_by IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 1 THEN RAISE EXCEPTION 'M7 PHASE3: overtime_records deleted %, expected 1.', v_n; END IF;
  -- 13) shifts (FK→staff RESTRICT; all its children cleared above:
  --     shift_breaks deleted, cash_drawer_log deleted, overtime deleted,
  --     tip_shortfalls=0, shift_reviews=0)
  DELETE FROM shifts WHERE staff_id IN (SELECT id FROM public.p9_m7_fixture_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; IF v_n <> 43 THEN RAISE EXCEPTION 'M7 PHASE3: shifts deleted %, expected 43.', v_n; END IF;

  -- R3: 0 residue — no child row of any staff-FK column may reference fixture set
  IF EXISTS (
    SELECT 1 FROM (
      SELECT user_id    FROM sessions            WHERE user_id    IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM shifts              WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM shift_breaks        WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM staff_locations     WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM login_attempts      WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM security_events     WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM approval_requests   WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT staff_id   FROM schedule            WHERE staff_id   IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT created_by FROM cash_drawer_log     WHERE created_by IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT opened_by  FROM cash_drawer_sessions WHERE opened_by IN (SELECT id FROM public.p9_m7_fixture_ids)
      UNION ALL SELECT closed_by  FROM cash_drawer_sessions WHERE closed_by IN (SELECT id FROM public.p9_m7_fixture_ids)
    ) r
  ) THEN
    RAISE EXCEPTION 'M7 PHASE3 [R3]: residue found in child tables after deletes. ABORT.';
  END IF;

  -- ============ PHASE 4 — TRIGGER-GUARDED STAFF DELETE (R9, R10) ============
  -- (All staff-referencing rows cleared in PHASE 3 — including the 3 tables
  -- whose "SET NULL" FKs are a pre-existing catalog oddity: confdeltype='a'
  -- but no ON DELETE clause, i.e. they enforce NO ACTION and the columns are
  -- NOT NULL, so the rows were deleted (archived) instead of nulled.)
  BEGIN
    ALTER TABLE public.staff DISABLE TRIGGER trg_staff_prevent_delete;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'M7 PHASE4 [R9]: DISABLE TRIGGER failed (nothing disabled, safe abort): %', SQLERRM;
  END;
  BEGIN
    DELETE FROM staff WHERE id IN (SELECT id FROM public.p9_m7_fixture_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1055 THEN
      RAISE EXCEPTION 'M7 PHASE4: staff deleted %, expected 1055.', v_n;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- R9: guaranteed restore on failure (txn also rolls back catalog state,
    -- but re-enable explicitly before re-raising)
    BEGIN
      ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- best-effort; transaction abort reverts DISABLE regardless
    END;
    RAISE EXCEPTION 'M7 PHASE4 [R9]: staff DELETE failed — trigger re-enabled, aborting: %', SQLERRM;
  END;
  BEGIN
    ALTER TABLE public.staff ENABLE TRIGGER trg_staff_prevent_delete;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'M7 PHASE4 [R9]: re-ENABLE TRIGGER failed — aborting (txn rollback reverts state): %', SQLERRM;
  END;

  -- ============ PHASE 5 — POST-DELETE ASSERTS (R6, R7, R8, R9) ============
  -- R8: remaining staff set == 53-ID denylist, both directions
  SELECT count(*) INTO v_n FROM staff;
  IF v_n <> 53 THEN RAISE EXCEPTION 'M7 PHASE5 [R8]: staff remaining = %, expected 53.', v_n; END IF;
  SELECT count(*) INTO v_n FROM staff s WHERE NOT (s.id = ANY(v_denylist));
  IF v_n <> 0 THEN RAISE EXCEPTION 'M7 PHASE5 [R8]: % remaining staff NOT in denylist — identity leak. ABORT.', v_n; END IF;
  SELECT count(*) INTO v_n FROM unnest(v_denylist) d
  WHERE NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = d);
  IF v_n <> 0 THEN RAISE EXCEPTION 'M7 PHASE5 [R8]: % denylist staff missing — real staff lost. ABORT.', v_n; END IF;
  -- R8: 9 active real
  SELECT count(*) INTO v_n FROM staff s WHERE s.id = ANY(v_denylist) AND s.is_active;
  IF v_n <> 9 THEN RAISE EXCEPTION 'M7 PHASE5 [R8]: active real = %, expected 9.', v_n; END IF;
  -- R6: pool 39 → ≤ 9 (all 9 real active are in pool ⇒ exactly 9)
  SELECT count(*) INTO v_n FROM staff s
  WHERE s.is_active AND s.status = 'ACTIVE' AND s.pin_hash IS NOT NULL AND s.pin_hash <> '';
  IF v_n > 9 THEN RAISE EXCEPTION 'M7 PHASE5 [R6]: pool = %, expected ≤ 9.', v_n; END IF;
  IF v_n <> 9 THEN RAISE EXCEPTION 'M7 PHASE5 [R6]: pool = %, expected 9 (all 9 real active must stay in pool).', v_n; END IF;
  -- R7: M6's 10 FKs — 0 orphans post-delete
  IF EXISTS (
    SELECT 1 FROM expenses e WHERE e.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=e.staff_id)
    UNION ALL SELECT 1 FROM order_items o WHERE o.variant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.id=o.variant_id)
    UNION ALL SELECT 1 FROM reservations r WHERE r.floor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM table_floors f WHERE f.id=r.floor_id)
    UNION ALL SELECT 1 FROM table_floors f WHERE f.current_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=f.current_order_id)
    UNION ALL SELECT 1 FROM payments p WHERE p.refund_of_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_payments o WHERE o.id=p.refund_of_payment_id)
    UNION ALL SELECT 1 FROM price_overrides p WHERE p.order_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_items o WHERE o.id=p.order_item_id)
    UNION ALL SELECT 1 FROM price_overrides p WHERE p.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.id=p.product_id)
    UNION ALL SELECT 1 FROM login_attempts l WHERE l.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=l.staff_id)
    UNION ALL SELECT 1 FROM notification_read_state n WHERE n.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=n.user_id)
    UNION ALL SELECT 1 FROM combos c WHERE c.category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.id=c.category_id)
  ) THEN
    RAISE EXCEPTION 'M7 PHASE5 [R7]: orphan found on M6 FKs post-delete. ABORT.';
  END IF;
  -- R7b: no dangling staff refs anywhere in the 13 staff-FK child columns
  IF EXISTS (
    SELECT 1 FROM shifts t WHERE t.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.staff_id)
    UNION ALL SELECT 1 FROM security_events t WHERE t.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.staff_id)
    UNION ALL SELECT 1 FROM approval_requests t WHERE (t.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.staff_id))
      OR (t.reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.reviewed_by))
    UNION ALL SELECT 1 FROM cash_drawer_log t WHERE t.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.created_by)
    UNION ALL SELECT 1 FROM cash_drawer_sessions t WHERE (t.opened_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.opened_by))
      OR (t.closed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.closed_by))
    UNION ALL SELECT 1 FROM time_clock_audit t WHERE t.performed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.performed_by)
    UNION ALL SELECT 1 FROM time_clock_entries t WHERE (t.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.staff_id))
      OR (t.approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.approved_by))
    UNION ALL SELECT 1 FROM overtime_records t WHERE (t.staff_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.staff_id))
      OR (t.approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=t.approved_by))
  ) THEN
    RAISE EXCEPTION 'M7 PHASE5 [R7b]: dangling staff reference post-delete. ABORT.';
  END IF;
  -- R9: trigger state final = enabled
  SELECT tgenabled INTO v_trigger_state FROM pg_trigger WHERE tgname='trg_staff_prevent_delete' AND tgrelid='staff'::regclass;
  IF v_trigger_state = 'D' THEN
    RAISE EXCEPTION 'M7 PHASE5 [R9]: trg_staff_prevent_delete still DISABLED. ABORT.';
  END IF;
  -- R4/R5: archive integrity re-assert (counts stable post-delete)
  SELECT count(*) INTO v_n FROM public.p9_archive_staff_purge;
  IF v_n <> 1055 THEN RAISE EXCEPTION 'M7 PHASE5 [R5]: staff archive drifted to %. ABORT.', v_n; END IF;

  RAISE NOTICE 'M7 COMPLETE: 1055 fixtures purged, 53 real staff intact (9 active), pool 39->9, all 14 archives verified.';
END
$m7$;
