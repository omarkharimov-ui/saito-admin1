-- Phase 1: Canonical staff identity for sessions
-- Forensic result: existing sessions.user_id values are already staff.id
-- No data mapping required, only FK target change

-- Step 1: Verify data integrity
DO $$
DECLARE
  session_count INTEGER;
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO session_count FROM sessions;
  SELECT COUNT(*) INTO invalid_count FROM sessions s
  WHERE NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = s.user_id);
  
  RAISE NOTICE 'Phase 1: sessions count=%, invalid=%', session_count, invalid_count;
  
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 ABORTED: % sessions reference non-existent staff IDs', invalid_count;
  END IF;
END $$;

-- Step 2: Drop old FK if exists
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;

-- Step 3: Add new FK (RESTRICT - preserve historical sessions)
-- Staff cannot be hard-deleted if sessions exist
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES staff(id) ON DELETE RESTRICT;

-- Step 4: Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_staff_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Step 5: Add revoked_at for Phase 4 (session revocation)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON sessions(revoked_at) WHERE revoked_at IS NULL;
