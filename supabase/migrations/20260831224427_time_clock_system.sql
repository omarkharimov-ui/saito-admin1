-- =============================================
-- TIME CLOCK SYSTEM
-- =============================================

-- Time clock entries for clock in/out and breaks
CREATE TABLE IF NOT EXISTS time_clock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pin_verified BOOLEAN DEFAULT false,
  notes TEXT,
  approved_by UUID REFERENCES staff(id),
  is_manual_entry BOOLEAN DEFAULT false,
  source VARCHAR(30) DEFAULT 'pos_terminal' CHECK (source IN ('pos_terminal', 'mobile_app', 'web_portal', 'admin_panel', 'kiosk')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Break tracking during shifts
CREATE TABLE IF NOT EXISTS shift_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  break_type VARCHAR(20) NOT NULL CHECK (break_type IN ('paid', 'unpaid', 'lunch', 'rest', 'personal')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_compliant BOOLEAN DEFAULT true,
  violation_reason TEXT,
  auto_deducted BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Overtime tracking records
CREATE TABLE IF NOT EXISTS overtime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  shift_id UUID REFERENCES shifts(id),
  overtime_type VARCHAR(20) NOT NULL CHECK (overtime_type IN ('daily', 'weekly', 'double', 'holiday', 'minor_violation')),
  hours DECIMAL(5,2) NOT NULL,
  rate_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.5,
  calculated_amount DECIMAL(10,2),
  approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Break rules configuration
CREATE TABLE IF NOT EXISTS break_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  work_duration_minutes INTEGER NOT NULL,
  break_duration_minutes INTEGER NOT NULL,
  break_type VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  is_paid BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  applies_to_minors BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time clock audit log
CREATE TABLE IF NOT EXISTS time_clock_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_clock_entry_id UUID REFERENCES time_clock_entries(id),
  action VARCHAR(50) NOT NULL,
  performed_by UUID REFERENCES staff(id),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_time_clock_staff ON time_clock_entries(staff_id);
CREATE INDEX IF NOT EXISTS idx_time_clock_timestamp ON time_clock_entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_type ON time_clock_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_shift ON shift_breaks(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_active ON shift_breaks(started_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_overtime_staff ON overtime_records(staff_id);
CREATE INDEX IF NOT EXISTS idx_overtime_date ON overtime_records(created_at DESC);

-- =============================================
-- ENABLE RLS
-- =============================================

ALTER TABLE time_clock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock_audit ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES
-- =============================================

CREATE POLICY "Allow all for authenticated" ON time_clock_entries FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON shift_breaks FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON overtime_records FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON break_rules FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated" ON time_clock_audit FOR ALL USING (true);

-- =============================================
-- RPCs
-- =============================================

-- Clock in with PIN verification
CREATE OR REPLACE FUNCTION clock_in(
  p_staff_id UUID,
  p_pin TEXT,
  p_source TEXT DEFAULT 'pos_terminal'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff RECORD;
  v_latest_entry RECORD;
  v_shift_id UUID;
BEGIN
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Staff not found or inactive');
  END IF;

  IF v_staff.pin_hash != md5(p_pin) THEN
    INSERT INTO time_clock_audit (action, performed_by, details)
    VALUES ('failed_clock_in', p_staff_id, jsonb_build_object('reason', 'invalid_pin'));
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_staff_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;

  IF v_latest_entry.entry_type IN ('clock_in', 'break_end') THEN
    RETURN json_build_object('success', false, 'error', 'Already clocked in');
  END IF;

  INSERT INTO shifts (staff_id, opened_at, starting_cash)
  VALUES (p_staff_id, NOW(), 0)
  RETURNING id INTO v_shift_id;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, source, timestamp)
  VALUES (p_staff_id, 'clock_in', true, p_source, NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_in', p_staff_id, jsonb_build_object('shift_id', v_shift_id));

  RETURN json_build_object(
    'success', true,
    'shift_id', v_shift_id,
    'staff_name', v_staff.full_name,
    'timestamp', NOW()
  );
END;
$$;

-- Clock out with optional notes
CREATE OR REPLACE FUNCTION clock_out(
  p_staff_id UUID,
  p_pin TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_entry RECORD;
  v_active_break RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id AND pin_hash = md5(p_pin)) THEN
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;

  SELECT * INTO v_latest_entry FROM time_clock_entries
  WHERE staff_id = p_staff_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;

  IF v_latest_entry IS NULL OR v_latest_entry.entry_type = 'clock_out' THEN
    RETURN json_build_object('success', false, 'error', 'Not clocked in');
  END IF;

  SELECT * INTO v_active_break FROM shift_breaks sb
  JOIN shifts s ON s.id = sb.shift_id
  WHERE s.staff_id = p_staff_id AND sb.ended_at IS NULL;

  IF FOUND THEN
    UPDATE shift_breaks SET ended_at = NOW() WHERE id = v_active_break.id;
    INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
    VALUES (p_staff_id, 'break_end', 'auto', NOW());
  END IF;

  UPDATE shifts SET closed_at = NOW(), notes = COALESCE(p_notes, notes)
  WHERE staff_id = p_staff_id AND closed_at IS NULL;

  INSERT INTO time_clock_entries (staff_id, entry_type, pin_verified, notes, source, timestamp)
  VALUES (p_staff_id, 'clock_out', true, p_notes, 'pos_terminal', NOW());

  INSERT INTO time_clock_audit (action, performed_by, details)
  VALUES ('clock_out', p_staff_id, jsonb_build_object('notes', p_notes));

  RETURN json_build_object('success', true, 'timestamp', NOW());
END;
$$;

-- Start break
CREATE OR REPLACE FUNCTION start_break(
  p_staff_id UUID,
  p_break_type TEXT DEFAULT 'unpaid'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_active_break RECORD;
BEGIN
  SELECT * INTO v_shift FROM shifts
  WHERE staff_id = p_staff_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active shift');
  END IF;

  SELECT * INTO v_active_break FROM shift_breaks
  WHERE shift_id = v_shift.id AND ended_at IS NULL;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Break already in progress');
  END IF;

  INSERT INTO shift_breaks (shift_id, break_type, started_at)
  VALUES (v_shift.id, p_break_type, NOW());

  INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
  VALUES (p_staff_id, 'break_start', 'pos_terminal', NOW());

  RETURN json_build_object(
    'success', true,
    'break_id', currval('shift_breaks_id_seq'),
    'started_at', NOW()
  );
END;
$$;

-- End break
CREATE OR REPLACE FUNCTION end_break(
  p_staff_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_break RECORD;
  v_duration INTEGER;
BEGIN
  SELECT * INTO v_shift FROM shifts
  WHERE staff_id = p_staff_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active shift');
  END IF;

  SELECT * INTO v_break FROM shift_breaks
  WHERE shift_id = v_shift.id AND ended_at IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active break');
  END IF;

  UPDATE shift_breaks SET ended_at = NOW() WHERE id = v_break.id;

  v_duration := EXTRACT(EPOCH FROM (NOW() - v_break.started_at)) / 60;

  IF v_duration > 30 AND v_break.break_type = 'unpaid' THEN
    UPDATE shift_breaks SET is_compliant = false, violation_reason = 'Break exceeded 30 minutes' WHERE id = v_break.id;
  END IF;

  INSERT INTO time_clock_entries (staff_id, entry_type, source, timestamp)
  VALUES (p_staff_id, 'break_end', 'pos_terminal', NOW());

  RETURN json_build_object(
    'success', true,
    'duration_minutes', v_duration,
    'ended_at', NOW()
  );
END;
$$;

-- Get time clock status
CREATE OR REPLACE FUNCTION get_time_clock_status(
  p_staff_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest RECORD;
  v_active_shift RECORD;
  v_active_break RECORD;
  v_today_hours DECIMAL;
  v_weekly_hours DECIMAL;
BEGIN
  SELECT * INTO v_latest FROM time_clock_entries
  WHERE staff_id = p_staff_id AND timestamp > CURRENT_DATE
  ORDER BY timestamp DESC LIMIT 1;

  SELECT * INTO v_active_shift FROM shifts
  WHERE staff_id = p_staff_id AND closed_at IS NULL;

  IF v_active_shift.id IS NOT NULL THEN
    SELECT * INTO v_active_break FROM shift_breaks
    WHERE shift_id = v_active_shift.id AND ended_at IS NULL;
  END IF;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600
  ), 0) INTO v_today_hours
  FROM shifts
  WHERE staff_id = p_staff_id AND DATE(opened_at) = CURRENT_DATE;

  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600
  ), 0) INTO v_weekly_hours
  FROM shifts
  WHERE staff_id = p_staff_id
  AND opened_at >= date_trunc('week', CURRENT_DATE)
  AND opened_at < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days';

  RETURN json_build_object(
    'is_clocked_in', COALESCE(v_latest.entry_type IN ('clock_in', 'break_end'), false),
    'on_break', v_active_break.id IS NOT NULL,
    'current_entry_type', v_latest.entry_type,
    'last_entry', v_latest.timestamp,
    'active_shift_id', v_active_shift.id,
    'active_break_id', v_active_break.id,
    'break_started_at', v_active_break.started_at,
    'today_hours', ROUND(v_today_hours, 2),
    'weekly_hours', ROUND(v_weekly_hours, 2),
    'approaching_daily_ot', v_today_hours >= 7.5,
    'approaching_weekly_ot', v_weekly_hours >= 37.5
  );
END;
$$;

-- Get active breaks
CREATE OR REPLACE FUNCTION get_active_breaks()
RETURNS TABLE (
  break_id UUID,
  staff_id UUID,
  staff_name TEXT,
  break_type VARCHAR,
  started_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  shift_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sb.id,
    s.staff_id,
    st.full_name,
    sb.break_type,
    sb.started_at,
    EXTRACT(EPOCH FROM (NOW() - sb.started_at)) / 60,
    sb.shift_id
  FROM shift_breaks sb
  JOIN shifts s ON s.id = sb.shift_id
  JOIN staff st ON st.id = s.staff_id
  WHERE sb.ended_at IS NULL
  AND s.closed_at IS NULL
  ORDER BY sb.started_at;
END;
$$;

-- Get time clock history
CREATE OR REPLACE FUNCTION get_time_clock_history(
  p_staff_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  entry_id UUID,
  entry_type VARCHAR,
  entry_timestamp TIMESTAMPTZ,
  pin_verified BOOLEAN,
  source VARCHAR,
  notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tce.id,
    tce.entry_type,
    tce.timestamp,
    tce.pin_verified,
    tce.source,
    tce.notes
  FROM time_clock_entries tce
  WHERE tce.staff_id = p_staff_id
  AND DATE(tce.timestamp) BETWEEN p_start_date AND p_end_date
  ORDER BY tce.timestamp DESC;
END;
$$;

-- Insert default break rules
INSERT INTO break_rules (name, work_duration_minutes, break_duration_minutes, break_type, is_paid, applies_to_minors)
VALUES
  ('Short Break', 240, 10, 'paid', true, false),
  ('Lunch Break', 360, 30, 'unpaid', false, false),
  ('Minor Short Break', 180, 15, 'paid', true, true),
  ('Minor Lunch Break', 240, 30, 'unpaid', false, true)
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT EXECUTE ON FUNCTION clock_in TO anon, authenticated;
GRANT EXECUTE ON FUNCTION clock_out TO anon, authenticated;
GRANT EXECUTE ON FUNCTION start_break TO anon, authenticated;
GRANT EXECUTE ON FUNCTION end_break TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_time_clock_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_active_breaks TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_time_clock_history TO anon, authenticated;
