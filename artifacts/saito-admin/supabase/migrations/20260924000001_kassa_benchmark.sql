-- 2026-09-23 (owner): Kassa benchmark pass (Toast/Square feature parity).
-- ADDITIVE ONLY: no existing column/RPC touched.
--   * cash_drawer_log.type: + no_sale, cash_drop, deposit
--   * cash_drawer_sessions.status: + paused ("count later" / multi-drawer)
--   * cash_drawer_sessions.locked: drawer lock (manager PIN)
--   * denomination_counts: bill-by-bill counting (documented in the feature
--     map for years but the table never existed in this DB — PGRST205 proved
--     it missing; the close UI now actually uses it)
--   * deposits: expected vs actual deposit per closed drawer (overage/shortage)
BEGIN;

ALTER TABLE cash_drawer_log DROP CONSTRAINT cash_drawer_log_type_check;
ALTER TABLE cash_drawer_log ADD CONSTRAINT cash_drawer_log_type_check
  CHECK (type = ANY (ARRAY[
    'cash_in','cash_out','payment','card_payment','voucher_payment',
    'open','close','refund','void','reopen','no_sale','cash_drop','deposit'
  ]::text[]));

ALTER TABLE cash_drawer_sessions DROP CONSTRAINT cash_drawer_sessions_status_check;
ALTER TABLE cash_drawer_sessions ADD CONSTRAINT cash_drawer_sessions_status_check
  CHECK (status = ANY (ARRAY['open','closed','paused']::text[]));

ALTER TABLE cash_drawer_sessions ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE cash_drawer_sessions ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES staff(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS denomination_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cash_drawer_sessions(id) ON DELETE CASCADE,
  denomination numeric(10,2) NOT NULL CHECK (denomination > 0),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS denomination_counts_session_idx ON denomination_counts(session_id);

CREATE TABLE IF NOT EXISTS deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cash_drawer_sessions(id) ON DELETE CASCADE,
  expected_amount numeric(12,2) NOT NULL DEFAULT 0,
  actual_amount numeric(12,2) NOT NULL DEFAULT 0,
  difference numeric(12,2) GENERATED ALWAYS AS (actual_amount - expected_amount) STORED,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deposits_session_idx ON deposits(session_id);

COMMIT;
