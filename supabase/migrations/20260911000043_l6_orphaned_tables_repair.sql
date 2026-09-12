-- ============================================================================
-- 20260911000043 — L6 (D1, ratified): repair the 3 ORPHANED stuck tables
--                  (8 @ Main Location, 401 @ Main Location, 402 @ Saito
--                  Dənizkənarı) -> 'empty', with per-table fail-safe +
--                  reconciliation evidence
--
-- ROOT CAUSE (L1-2, proven): these tables were 'occupied' with an order that
--   was removed/cancelled out-of-band (a direct order DELETE, not the
--   canonical dismiss/release path). The table_release_guard (F-05) correctly
--   forbids the sync trigger from re-pointing a released table while open
--   orders exist, and the O floor-sync (pre-042) silently failed
--   (39x status_change_failed) — so the table was left permanently stuck at
--   'occupied' with current_order_id NULL, total_amount 0 and NO open orders:
--   the documented D1 stuck shape (reproduced in .k-l5-probe.cjs L5-3c).
--
-- FAIL-SAFE (per table, RAISE = abort the whole migration, no partial repair):
--   * the table exists, is not archived, and status = 'occupied'
--   * current_order_id IS NULL (an active pointer means NOT an orphan)
--   * ZERO open orders on (table, location)  [same final-state set the
--     canonical dismiss/release fns use]
--   * total_amount = 0
--   Only then: single guarded UPDATE -> 'empty' + clear the release fields
--   (table_release_guard BEFORE trigger re-validates), then assert 1 row.
--   A reconciliation evidence row is written to audit_logs per table with the
--   full pre-repair snapshot (old_data) and the reason (new_data).
--
-- This is a DATA REPAIR (F-05 style), not a contract change: no registry edge,
-- no function, no permission, no RLS is touched.
-- ============================================================================

-- Three explicit, individually fail-safe blocks (clear + auditable), then a
-- post-condition fail-safe that aborts if any of the 3 is not repaired or if
-- additional orphans exist (no silent partial repair).

-- ---- table 8 @ Main Location ----
DO $$
DECLARE
  v_old table_floors%ROWTYPE;
  v_open int;
BEGIN
  SELECT * INTO v_old FROM table_floors
   WHERE table_number = 8 AND location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
  IF NOT FOUND OR v_old.is_archived THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 @ Main Location missing/archived (not a repair candidate)';
  END IF;
  IF v_old.status IS DISTINCT FROM 'occupied' THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 status is % (expected occupied orphan)', v_old.status;
  END IF;
  IF v_old.current_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 has an active current_order_id % (not an orphan)', v_old.current_order_id;
  END IF;
  SELECT count(*) INTO v_open FROM orders
   WHERE table_number = 8 AND location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d'
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 has % open orders (not an orphan)', v_open;
  END IF;
  IF COALESCE(v_old.total_amount,0) <> 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 total_amount=% (orphan expected 0)', v_old.total_amount;
  END IF;
  IF COALESCE(v_old.guest_count,0) <> 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 guest_count=% (a SEATED table, not an orphan — do not clobber)', v_old.guest_count;
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES ('table_floors', v_old.id, 'orphan_repair',
    jsonb_build_object('table_number', v_old.table_number, 'status', v_old.status,
      'current_order_id', v_old.current_order_id, 'total_amount', v_old.total_amount,
      'guest_count', v_old.guest_count, 'merged_into_table', v_old.merged_into_table,
      'open_orders', 0),
    jsonb_build_object('action', 'set_empty', 'reason',
      'L6/D1 orphan repair (20260911000043): occupied with no open order, NULL pointer, total 0'),
    NULL, now());

  UPDATE table_floors SET
    status = 'empty',
    current_order_id = NULL,
    total_amount = 0,
    guest_count = NULL,
    order_count = 0,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = now()
  WHERE table_number = 8 AND location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d'
    AND status = 'occupied' AND current_order_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 8 repair UPDATE affected 0 rows';
  END IF;
END $$;

-- ---- table 401 @ Main Location ----
DO $$
DECLARE
  v_old table_floors%ROWTYPE;
  v_open int;
BEGIN
  SELECT * INTO v_old FROM table_floors
   WHERE table_number = 401 AND location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d';
  IF NOT FOUND OR v_old.is_archived THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 @ Main Location missing/archived (not a repair candidate)';
  END IF;
  IF v_old.status IS DISTINCT FROM 'occupied' THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 status is % (expected occupied orphan)', v_old.status;
  END IF;
  IF v_old.current_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 has an active current_order_id % (not an orphan)', v_old.current_order_id;
  END IF;
  SELECT count(*) INTO v_open FROM orders
   WHERE table_number = 401 AND location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d'
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 has % open orders (not an orphan)', v_open;
  END IF;
  IF COALESCE(v_old.total_amount,0) <> 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 total_amount=% (orphan expected 0)', v_old.total_amount;
  END IF;
  IF COALESCE(v_old.guest_count,0) <> 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 guest_count=% (a SEATED table, not an orphan — do not clobber)', v_old.guest_count;
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES ('table_floors', v_old.id, 'orphan_repair',
    jsonb_build_object('table_number', v_old.table_number, 'status', v_old.status,
      'current_order_id', v_old.current_order_id, 'total_amount', v_old.total_amount,
      'guest_count', v_old.guest_count, 'merged_into_table', v_old.merged_into_table,
      'open_orders', 0),
    jsonb_build_object('action', 'set_empty', 'reason',
      'L6/D1 orphan repair (20260911000043): occupied with no open order, NULL pointer, total 0'),
    NULL, now());

  UPDATE table_floors SET
    status = 'empty',
    current_order_id = NULL,
    total_amount = 0,
    guest_count = NULL,
    order_count = 0,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = now()
  WHERE table_number = 401 AND location_id = 'f1f830b3-cf15-47e3-a538-01abd8222c6d'
    AND status = 'occupied' AND current_order_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 401 repair UPDATE affected 0 rows';
  END IF;
END $$;

-- ---- table 402 @ Saito Dənizkənarı ----
DO $$
DECLARE
  v_old table_floors%ROWTYPE;
  v_open int;
BEGIN
  SELECT * INTO v_old FROM table_floors
   WHERE table_number = 402 AND location_id = '70000000-0000-4000-8000-000000000002';
  IF NOT FOUND OR v_old.is_archived THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 @ Saito Dənizkənarı missing/archived (not a repair candidate)';
  END IF;
  IF v_old.status IS DISTINCT FROM 'occupied' THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 status is % (expected occupied orphan)', v_old.status;
  END IF;
  IF v_old.current_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 has an active current_order_id % (not an orphan)', v_old.current_order_id;
  END IF;
  SELECT count(*) INTO v_open FROM orders
   WHERE table_number = 402 AND location_id = '70000000-0000-4000-8000-000000000002'
     AND status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided');
  IF v_open > 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 has % open orders (not an orphan)', v_open;
  END IF;
  IF COALESCE(v_old.total_amount,0) <> 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 total_amount=% (orphan expected 0)', v_old.total_amount;
  END IF;
  IF COALESCE(v_old.guest_count,0) <> 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 guest_count=% (a SEATED table, not an orphan — do not clobber)', v_old.guest_count;
  END IF;

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, performed_by, created_at)
  VALUES ('table_floors', v_old.id, 'orphan_repair',
    jsonb_build_object('table_number', v_old.table_number, 'status', v_old.status,
      'current_order_id', v_old.current_order_id, 'total_amount', v_old.total_amount,
      'guest_count', v_old.guest_count, 'merged_into_table', v_old.merged_into_table,
      'open_orders', 0),
    jsonb_build_object('action', 'set_empty', 'reason',
      'L6/D1 orphan repair (20260911000043): occupied with no open order, NULL pointer, total 0'),
    NULL, now());

  UPDATE table_floors SET
    status = 'empty',
    current_order_id = NULL,
    total_amount = 0,
    guest_count = NULL,
    order_count = 0,
    has_pending = false,
    oldest_pending_at = NULL,
    bill_requested = false,
    updated_at = now()
  WHERE table_number = 402 AND location_id = '70000000-0000-4000-8000-000000000002'
    AND status = 'occupied' AND current_order_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: table 402 repair UPDATE affected 0 rows';
  END IF;
END $$;

-- ---- post-condition: the 3 tables are empty, 3 evidence rows written, and NO
--      other 'occupied' orphan remains (fail-safe = no silent partial repair) ----
DO $$
DECLARE
  v_empty int;
  v_evidence int;
  v_stuck int;
BEGIN
  SELECT count(*) INTO v_empty FROM table_floors
   WHERE (table_number, location_id) IN (
     (8,'f1f830b3-cf15-47e3-a538-01abd8222c6d'),
     (401,'f1f830b3-cf15-47e3-a538-01abd8222c6d'),
     (402,'70000000-0000-4000-8000-000000000002'))
     AND status = 'empty' AND current_order_id IS NULL;
  IF v_empty <> 3 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: expected 3 repaired empty tables, got %', v_empty;
  END IF;
  SELECT count(*) INTO v_evidence FROM audit_logs
   WHERE action = 'orphan_repair' AND table_name = 'table_floors'
     AND created_at > (now() - interval '10 minutes');
  IF v_evidence <> 3 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: expected 3 orphan_repair evidence rows, got %', v_evidence;
  END IF;
  -- A D1 orphan = occupied + NULL pointer + 0 open orders + NO guests (guest_count
  -- 0/NULL). A legitimately SEATED table (customer sitting, no order yet) has
  -- guest_count >= 1, so it is NOT an orphan and is never flagged here.
  SELECT count(*) INTO v_stuck FROM table_floors tf
   WHERE tf.status = 'occupied' AND tf.is_archived = false
     AND tf.current_order_id IS NULL
     AND COALESCE(tf.guest_count,0) = 0
     AND COALESCE(tf.total_amount,0) = 0
     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.table_number = tf.table_number
                      AND o.location_id = tf.location_id
                      AND o.status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided'));
  IF v_stuck > 0 THEN
    RAISE EXCEPTION 'L6 FAIL-SAFE: % occupied-orphan table(s) remain beyond the repaired 3; investigate before freeze', v_stuck;
  END IF;
END $$;
