-- =============================================
-- PHASE 2: SCHEDULING SYSTEM
-- =============================================

-- Schedule templates
CREATE TABLE IF NOT EXISTS schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  role_id UUID REFERENCES roles(id),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{}',
  color VARCHAR(7) DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff availability
CREATE TABLE IF NOT EXISTS staff_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, day_of_week)
);

-- Shift swap requests
CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_shift_id UUID NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  target_staff_id UUID REFERENCES staff(id),
  target_shift_id UUID REFERENCES schedule(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES staff(id),
  approved_by UUID REFERENCES staff(id),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedule conflicts
CREATE TABLE IF NOT EXISTS schedule_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedule(id) ON DELETE CASCADE,
  conflict_type VARCHAR(50) NOT NULL,
  description TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 3: TIP MANAGEMENT
-- =============================================

-- Tip pools
CREATE TABLE IF NOT EXISTS tip_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'distributed')),
  distributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip pool contributions
CREATE TABLE IF NOT EXISTS tip_pool_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  amount DECIMAL(10,2) NOT NULL,
  contribution_type VARCHAR(20) NOT NULL CHECK (contribution_type IN ('cash', 'credit', 'auto_gratuity')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip distributions
CREATE TABLE IF NOT EXISTS tip_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES tip_pools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  role_id UUID REFERENCES roles(id),
  percentage DECIMAL(5,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  hours_worked DECIMAL(5,2),
  points DECIMAL(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip distribution rules
CREATE TABLE IF NOT EXISTS tip_distribution_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  percentage DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id)
);

-- =============================================
-- PHASE 4: CASH RECONCILIATION
-- =============================================

-- Cash reconciliation
CREATE TABLE IF NOT EXISTS cash_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  starting_cash DECIMAL(10,2) NOT NULL,
  expected_cash DECIMAL(10,2) NOT NULL,
  actual_cash DECIMAL(10,2) NOT NULL,
  difference DECIMAL(10,2) NOT NULL,
  over_short VARCHAR(10) CHECK (over_short IN ('over', 'short')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disputed')),
  approved_by UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Denomination counts
CREATE TABLE IF NOT EXISTS denomination_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id) ON DELETE CASCADE,
  denomination DECIMAL(10,2) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- Scheduling indexes
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedule_staff ON schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_availability_staff ON staff_availability(staff_id);
CREATE INDEX IF NOT EXISTS idx_swap_requests_requester ON shift_swap_requests(requester_shift_id);
CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON shift_swap_requests(status);

-- Tip management indexes
CREATE INDEX IF NOT EXISTS idx_tip_pools_date ON tip_pools(pool_date);
CREATE INDEX IF NOT EXISTS idx_tip_contributions_pool ON tip_pool_contributions(pool_id);
CREATE INDEX IF NOT EXISTS idx_tip_distributions_pool ON tip_distributions(pool_id);
CREATE INDEX IF NOT EXISTS idx_tip_distributions_staff ON tip_distributions(staff_id);

-- Cash reconciliation indexes
CREATE INDEX IF NOT EXISTS idx_reconciliation_shift ON cash_reconciliations(shift_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_staff ON cash_reconciliations(staff_id);
CREATE INDEX IF NOT EXISTS idx_denomination_reconciliation ON denomination_counts(reconciliation_id);

-- =============================================
-- ENABLE RLS
-- =============================================

ALTER TABLE schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_pool_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_distribution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE denomination_counts ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES
-- =============================================

CREATE POLICY "Allow all for authenticated" ON schedule_templates FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON staff_availability FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON shift_swap_requests FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON schedule_conflicts FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON tip_pools FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON tip_pool_contributions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON tip_distributions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON tip_distribution_rules FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON cash_reconciliations FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON denomination_counts FOR ALL USING (true);

-- =============================================
-- PHASE 2: SCHEDULING RPCs
-- =============================================

-- Create schedule entry
CREATE OR REPLACE FUNCTION create_schedule(
  p_staff_id UUID,
  p_date DATE,
  p_start TIME,
  p_end TIME,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_id UUID;
BEGIN
  -- Check for conflicts
  IF EXISTS (
    SELECT 1 FROM schedule
    WHERE staff_id = p_staff_id
    AND schedule_date = p_date
    AND (
      (planned_start, planned_end) OVERLAPS (p_start, p_end)
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Schedule conflict detected');
  END IF;

  INSERT INTO schedule (staff_id, schedule_date, planned_start, planned_end, notes)
  VALUES (p_staff_id, p_date, p_start, p_end, p_notes)
  RETURNING id INTO v_schedule_id;

  RETURN json_build_object('success', true, 'schedule_id', v_schedule_id);
END;
$$;

-- Update schedule entry
CREATE OR REPLACE FUNCTION update_schedule(
  p_schedule_id UUID,
  p_start TIME,
  p_end TIME,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE schedule
  SET planned_start = COALESCE(p_start, planned_start),
      planned_end = COALESCE(p_end, planned_end),
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
  WHERE id = p_schedule_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Delete schedule entry
CREATE OR REPLACE FUNCTION delete_schedule_entry(
  p_schedule_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM schedule WHERE id = p_schedule_id;
  RETURN json_build_object('success', true);
END;
$$;

-- Get weekly schedule
CREATE OR REPLACE FUNCTION get_weekly_schedule(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  schedule_id UUID,
  staff_id UUID,
  staff_name TEXT,
  role_name TEXT,
  schedule_date DATE,
  planned_start TIME,
  planned_end TIME,
  notes TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.staff_id,
    st.full_name,
    r.name,
    s.schedule_date,
    s.planned_start,
    s.planned_end,
    s.notes
  FROM schedule s
  JOIN staff st ON st.id = s.staff_id
  LEFT JOIN roles r ON r.id = st.role_id
  WHERE s.schedule_date BETWEEN p_start_date AND p_end_date
  ORDER BY s.schedule_date, s.planned_start;
END;
$$;

-- Request shift swap
CREATE OR REPLACE FUNCTION request_shift_swap(
  p_requester_shift_id UUID,
  p_target_staff_id UUID,
  p_target_shift_id UUID,
  p_requested_by UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap_id UUID;
BEGIN
  INSERT INTO shift_swap_requests (requester_shift_id, target_staff_id, target_shift_id, requested_by, message)
  VALUES (p_requester_shift_id, p_target_staff_id, p_target_shift_id, p_requested_by, p_message)
  RETURNING id INTO v_swap_id;

  RETURN json_build_object('success', true, 'swap_id', v_swap_id);
END;
$$;

-- Respond to shift swap
CREATE OR REPLACE FUNCTION respond_shift_swap(
  p_swap_id UUID,
  p_approved BOOLEAN,
  p_responded_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap RECORD;
BEGIN
  SELECT * INTO v_swap FROM shift_swap_requests WHERE id = p_swap_id;

  IF v_swap.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Swap request already processed');
  END IF;

  IF p_approved THEN
    -- Swap the schedules
    UPDATE schedule SET staff_id = v_swap.target_staff_id WHERE id = v_swap.requester_shift_id;
    UPDATE schedule SET staff_id = (SELECT staff_id FROM schedule WHERE id = v_swap.requester_shift_id) WHERE id = v_swap.target_shift_id;

    UPDATE shift_swap_requests SET status = 'accepted', approved_by = p_responded_by, updated_at = NOW() WHERE id = p_swap_id;
  ELSE
    UPDATE shift_swap_requests SET status = 'rejected', approved_by = p_responded_by, updated_at = NOW() WHERE id = p_swap_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- =============================================
-- PHASE 3: TIP MANAGEMENT RPCs
-- =============================================

-- Create tip pool
CREATE OR REPLACE FUNCTION create_tip_pool(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_id UUID;
  v_total DECIMAL;
BEGIN
  -- Calculate total tips from orders
  SELECT COALESCE(SUM(tip_amount), 0) INTO v_total
  FROM orders
  WHERE DATE(created_at) = p_date
  AND tip_amount > 0;

  INSERT INTO tip_pools (pool_date, total_amount)
  VALUES (p_date, v_total)
  RETURNING id INTO v_pool_id;

  RETURN json_build_object('success', true, 'pool_id', v_pool_id, 'total', v_total);
END;
$$;

-- Distribute tips
CREATE OR REPLACE FUNCTION distribute_tips(
  p_pool_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool RECORD;
  v_rule RECORD;
  v_staff RECORD;
  v_total_hours DECIMAL;
  v_distribution_amount DECIMAL;
BEGIN
  SELECT * INTO v_pool FROM tip_pools WHERE id = p_pool_id;

  IF v_pool.status = 'distributed' THEN
    RETURN json_build_object('success', false, 'error', 'Tips already distributed');
  END IF;

  -- Get total hours worked for the day
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600), 0) INTO v_total_hours
  FROM shifts
  WHERE DATE(opened_at) = v_pool.pool_date
  AND closed_at IS NOT NULL;

  -- Distribute based on rules
  FOR v_rule IN SELECT * FROM tip_distribution_rules WHERE is_active = true
  LOOP
    FOR v_staff IN
      SELECT s.staff_id, SUM(EXTRACT(EPOCH FROM (s.closed_at - s.opened_at)) / 3600) as hours
      FROM shifts s
      JOIN staff st ON st.id = s.staff_id
      WHERE DATE(s.opened_at) = v_pool.pool_date
      AND s.closed_at IS NOT NULL
      AND st.role_id = v_rule.role_id
      GROUP BY s.staff_id
    LOOP
      IF v_total_hours > 0 THEN
        v_distribution_amount := (v_staff.hours / v_total_hours) * v_pool.total_amount * (v_rule.percentage / 100);

        INSERT INTO tip_distributions (pool_id, staff_id, role_id, percentage, amount, hours_worked, points)
        VALUES (p_pool_id, v_staff.staff_id, v_rule.role_id, v_rule.percentage, v_distribution_amount, v_staff.hours, v_staff.hours * v_rule.percentage);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE tip_pools SET status = 'distributed', distributed_at = NOW() WHERE id = p_pool_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Get tip pool summary
CREATE OR REPLACE FUNCTION get_tip_pool_summary(
  p_pool_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool RECORD;
  v_total_distributed DECIMAL;
  v_staff_count INTEGER;
BEGIN
  SELECT * INTO v_pool FROM tip_pools WHERE id = p_pool_id;

  SELECT COALESCE(SUM(amount), 0), COUNT(DISTINCT staff_id)
  INTO v_total_distributed, v_staff_count
  FROM tip_distributions
  WHERE pool_id = p_pool_id;

  RETURN json_build_object(
    'pool_id', v_pool.id,
    'date', v_pool.pool_date,
    'total_amount', v_pool.total_amount,
    'status', v_pool.status,
    'distributed_amount', v_total_distributed,
    'staff_count', v_staff_count,
    'distributed_at', v_pool.distributed_at
  );
END;
$$;

-- Set tip distribution rule
CREATE OR REPLACE FUNCTION set_tip_distribution_rule(
  p_role_id UUID,
  p_percentage DECIMAL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tip_distribution_rules (role_id, percentage)
  VALUES (p_role_id, p_percentage)
  ON CONFLICT (role_id)
  DO UPDATE SET percentage = p_percentage, is_active = true;

  RETURN json_build_object('success', true);
END;
$$;

-- =============================================
-- PHASE 4: CASH RECONCILIATION RPCs
-- =============================================

-- Create reconciliation
CREATE OR REPLACE FUNCTION create_reconciliation(
  p_shift_id UUID,
  p_staff_id UUID,
  p_denominations JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reconciliation_id UUID;
  v_shift RECORD;
  v_actual_cash DECIMAL;
  v_denomination RECORD;
  v_expected DECIMAL;
  v_difference DECIMAL;
BEGIN
  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;

  -- Calculate actual cash from denominations
  v_actual_cash := 0;
  FOR v_denomination IN SELECT * FROM jsonb_array_elements(p_denominations)
  LOOP
    v_actual_cash := v_actual_cash + (v_denomination->>'denomination')::DECIMAL * (v_denomination->>'count')::INTEGER;

    INSERT INTO denomination_counts (reconciliation_id, denomination, count)
    VALUES (v_reconciliation_id, (v_denomination->>'denomination')::DECIMAL, (v_denomination->>'count')::INTEGER);
  END LOOP;

  v_expected := COALESCE(v_shift.expected_cash, 0);
  v_difference := v_actual_cash - v_expected;

  INSERT INTO cash_reconciliations (shift_id, staff_id, starting_cash, expected_cash, actual_cash, difference, over_short)
  VALUES (p_shift_id, p_staff_id, v_shift.starting_cash, v_expected, v_actual_cash, v_difference, CASE WHEN v_difference >= 0 THEN 'over' ELSE 'short' END)
  RETURNING id INTO v_reconciliation_id;

  RETURN json_build_object(
    'success', true,
    'reconciliation_id', v_reconciliation_id,
    'expected', v_expected,
    'actual', v_actual_cash,
    'difference', v_difference
  );
END;
$$;

-- Approve reconciliation
CREATE OR REPLACE FUNCTION approve_reconciliation(
  p_reconciliation_id UUID,
  p_approved_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cash_reconciliations
  SET status = 'approved', approved_by = p_approved_by
  WHERE id = p_reconciliation_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Dispute reconciliation
CREATE OR REPLACE FUNCTION dispute_reconciliation(
  p_reconciliation_id UUID,
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE cash_reconciliations
  SET status = 'disputed', notes = COALESCE(notes || E'\n' || p_reason, p_reason)
  WHERE id = p_reconciliation_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Get reconciliation summary
CREATE OR REPLACE FUNCTION get_reconciliation_summary(
  p_shift_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recon RECORD;
BEGIN
  SELECT * INTO v_recon FROM cash_reconciliations WHERE shift_id = p_shift_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No reconciliation found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'reconciliation_id', v_recon.id,
    'starting_cash', v_recon.starting_cash,
    'expected_cash', v_recon.expected_cash,
    'actual_cash', v_recon.actual_cash,
    'difference', v_recon.difference,
    'over_short', v_recon.over_short,
    'status', v_recon.status
  );
END;
$$;

-- =============================================
-- INSERT DEFAULT TIP DISTRIBUTION RULES
-- =============================================

INSERT INTO tip_distribution_rules (role_id, percentage)
SELECT id, CASE
  WHEN name = 'waiter' THEN 50
  WHEN name = 'bartender' THEN 25
  WHEN name = 'kitchen' THEN 15
  WHEN name = 'host' THEN 10
  ELSE 0
END
FROM roles
WHERE name IN ('waiter', 'bartender', 'kitchen', 'host')
ON CONFLICT (role_id) DO NOTHING;

-- =============================================
-- GRANT PERMISSIONS
-- =============================================

GRANT EXECUTE ON FUNCTION create_schedule TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_schedule TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_schedule_entry TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_weekly_schedule TO anon, authenticated;
GRANT EXECUTE ON FUNCTION request_shift_swap TO anon, authenticated;
GRANT EXECUTE ON FUNCTION respond_shift_swap TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_tip_pool TO anon, authenticated;
GRANT EXECUTE ON FUNCTION distribute_tips TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_tip_pool_summary TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_tip_distribution_rule TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_reconciliation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_reconciliation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION dispute_reconciliation TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_reconciliation_summary TO anon, authenticated;
