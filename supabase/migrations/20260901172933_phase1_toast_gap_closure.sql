-- =============================================
-- PHASE 1: Toast Gap Closure - Operations & Financials
-- =============================================

-- =============================================
-- 1. AUTO CLOCK-OUT
-- =============================================

-- Add auto clock-out fields to shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN DEFAULT false;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS auto_closed_at TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS auto_closed_by UUID REFERENCES staff(id);

-- Create index for finding shifts that need auto-close
CREATE INDEX IF NOT EXISTS idx_shifts_auto_close ON shifts(auto_closed, closed_at) WHERE auto_closed = false AND closed_at IS NULL;

-- =============================================
-- 2. SHIFT REVIEW + DECLARED TIPS
-- =============================================

-- Shift reviews table
CREATE TABLE IF NOT EXISTS shift_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  review_status VARCHAR(20) DEFAULT 'pending' CHECK (review_status IN ('pending', 'submitted', 'approved', 'disputed')),
  hours_worked DECIMAL(5,2),
  total_sales DECIMAL(10,2) DEFAULT 0,
  non_cash_tips DECIMAL(10,2) DEFAULT 0,
  declared_cash_tips DECIMAL(10,2) DEFAULT 0,
  declared_tip_out DECIMAL(10,2) DEFAULT 0,
  declared_notes TEXT,
  manager_notes TEXT,
  reviewed_by UUID REFERENCES staff(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_reviews_shift ON shift_reviews(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_reviews_staff ON shift_reviews(staff_id);

-- Add declared tips to time_clock_entries for quick access
ALTER TABLE time_clock_entries ADD COLUMN IF NOT EXISTS declared_cash_tips DECIMAL(10,2);
ALTER TABLE time_clock_entries ADD COLUMN IF NOT EXISTS declared_tip_out DECIMAL(10,2);
ALTER TABLE time_clock_entries ADD COLUMN IF NOT EXISTS negative_tips DECIMAL(10,2) DEFAULT 0;

-- =============================================
-- 3. TIPOUT CONFIGURATION
-- =============================================

-- TipOut configuration per location
CREATE TABLE IF NOT EXISTS tipout_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  distribution_type VARCHAR(20) DEFAULT 'percentage' CHECK (distribution_type IN ('percentage', 'hourly', 'sales')),
  percentage DECIMAL(5,2) DEFAULT 0,
  minimum_tipout DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(location_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_tipout_configs_role ON tipout_configs(role_id);

-- =============================================
-- 4. TIP SHORTFALL TRACKING
-- =============================================

CREATE TABLE IF NOT EXISTS tip_shortfalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  shift_id UUID REFERENCES shifts(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  hours_worked DECIMAL(5,2) NOT NULL,
  tipped_wage_rate DECIMAL(10,2) NOT NULL,
  minimum_wage DECIMAL(10,2) NOT NULL,
  tips_earned DECIMAL(10,2) DEFAULT 0,
  shortfall_amount DECIMAL(10,2) DEFAULT 0,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES staff(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tip_shortfalls_staff ON tip_shortfalls(staff_id);
CREATE INDEX IF NOT EXISTS idx_tip_shortfalls_period ON tip_shortfalls(period_start, period_end);

-- =============================================
-- 5. BREAK ADHERENCE
-- =============================================

CREATE TABLE IF NOT EXISTS break_adherence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  break_type VARCHAR(20) NOT NULL CHECK (break_type IN ('meal', 'rest')),
  scheduled_break_start TIMESTAMPTZ,
  scheduled_break_end TIMESTAMPTZ,
  actual_break_start TIMESTAMPTZ,
  actual_break_end TIMESTAMPTZ,
  is_compliant BOOLEAN DEFAULT false,
  compliance_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_break_adherence_staff ON break_adherence(staff_id);
CREATE INDEX IF NOT EXISTS idx_break_adherence_shift ON break_adherence(shift_id);

-- =============================================
-- 6. AUTO CLOCK-OUT RPC
-- =============================================

CREATE OR REPLACE FUNCTION auto_clockout_staff()
RETURNS JSON AS $$
DECLARE
  v_shift RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_shift IN
    SELECT s.id, s.staff_id, s.opened_at
    FROM shifts s
    WHERE s.closed_at IS NULL
      AND s.auto_closed = false
      AND s.opened_at < NOW() - INTERVAL '16 hours'
  LOOP
    UPDATE shifts
    SET
      closed_at = NOW(),
      auto_closed = true,
      auto_closed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_shift.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'auto_closed_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 7. SHIFT REVIEW RPCs
-- =============================================

CREATE OR REPLACE FUNCTION submit_shift_review(
  p_shift_id UUID,
  p_staff_id UUID,
  p_declared_cash_tips DECIMAL DEFAULT 0,
  p_declared_tip_out DECIMAL DEFAULT 0,
  p_declared_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_review_id UUID;
BEGIN
  INSERT INTO shift_reviews (
    shift_id, staff_id, review_status,
    declared_cash_tips, declared_tip_out, declared_notes
  ) VALUES (
    p_shift_id, p_staff_id, 'submitted',
    p_declared_cash_tips, p_declared_tip_out, p_declared_notes
  )
  ON CONFLICT (shift_id) WHERE review_status = 'pending'
  DO UPDATE SET
    declared_cash_tips = EXCLUDED.declared_cash_tips,
    declared_tip_out = EXCLUDED.declared_tip_out,
    declared_notes = EXCLUDED.declared_notes,
    review_status = 'submitted',
    updated_at = NOW()
  RETURNING id INTO v_review_id;

  RETURN json_build_object('success', true, 'review_id', v_review_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION approve_shift_review(
  p_review_id UUID,
  p_manager_id UUID,
  p_manager_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
  UPDATE shift_reviews
  SET
    review_status = 'approved',
    manager_notes = p_manager_notes,
    reviewed_by = p_manager_id,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_review_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 8. BREAK ADHERENCE RPC
-- =============================================

CREATE OR REPLACE FUNCTION check_break_eligibility(
  p_staff_id UUID,
  p_shift_id UUID,
  p_break_type VARCHAR
)
RETURNS JSON AS $$
DECLARE
  v_hours_worked DECIMAL;
  v_eligible BOOLEAN := false;
  v_reason TEXT := '';
BEGIN
  SELECT EXTRACT(EPOCH FROM (NOW() - opened_at)) / 3600
  INTO v_hours_worked
  FROM shifts
  WHERE id = p_shift_id AND closed_at IS NULL;

  IF p_break_type = 'meal' THEN
    IF v_hours_worked >= 5 THEN
      v_eligible := true;
    ELSE
      v_eligible := false;
      v_reason := 'Meal break requires 5+ hours worked';
    END IF;
  ELSIF p_break_type = 'rest' THEN
    IF v_hours_worked >= 2 THEN
      v_eligible := true;
    ELSE
      v_eligible := false;
      v_reason := 'Rest break requires 2+ hours worked';
    END IF;
  END IF;

  RETURN json_build_object('eligible', v_eligible, 'hours_worked', v_hours_worked, 'reason', v_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9. TIP SHORTFALL RPC
-- =============================================

CREATE OR REPLACE FUNCTION calculate_tip_shortfall(
  p_staff_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSON AS $$
DECLARE
  v_hours DECIMAL := 0;
  v_tips DECIMAL := 0;
  v_min_wage DECIMAL := 15.0;
  v_tipped_wage DECIMAL := 5.0;
  v_shortfall DECIMAL := 0;
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600), 0)
  INTO v_hours
  FROM time_clock_entries
  WHERE staff_id = p_staff_id
    AND DATE(clock_in) BETWEEN p_period_start AND p_period_end;

  SELECT COALESCE(SUM(declared_cash_tips + non_cash_tips), 0)
  INTO v_tips
  FROM shift_reviews sr
  JOIN shifts s ON s.id = sr.shift_id
  WHERE sr.staff_id = p_staff_id
    AND DATE(s.opened_at) BETWEEN p_period_start AND p_period_end;

  IF (v_hours * v_tipped_wage + v_tips) < (v_hours * v_min_wage) THEN
    v_shortfall := (v_hours * v_min_wage) - (v_hours * v_tipped_wage + v_tips);
  END IF;

  RETURN json_build_object(
    'hours_worked', v_hours,
    'tips_earned', v_tips,
    'shortfall_amount', v_shortfall,
    'minimum_wage', v_min_wage
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 10. SPLH HELPER RPC
-- =============================================

CREATE OR REPLACE FUNCTION get_splh_metrics(
  p_staff_id UUID DEFAULT NULL,
  p_period_start DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_period_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_revenue', COALESCE(SUM(o.total_amount), 0),
    'total_hours', COALESCE(SUM(EXTRACT(EPOCH FROM (tce.clock_out - tce.clock_in)) / 3600), 0),
    'splh', CASE WHEN SUM(EXTRACT(EPOCH FROM (tce.clock_out - tce.clock_in)) / 3600) > 0
                 THEN COALESCE(SUM(o.total_amount), 0) / SUM(EXTRACT(EPOCH FROM (tce.clock_out - tce.clock_in)) / 3600)
                 ELSE 0 END
  ) INTO result
  FROM time_clock_entries tce
  LEFT JOIN orders o ON o.assigned_to = tce.staff_id AND DATE(o.created_at) BETWEEN p_period_start AND p_period_end
  WHERE tce.staff_id = COALESCE(p_staff_id, tce.staff_id)
    AND DATE(tce.clock_in) BETWEEN p_period_start AND p_period_end
    AND tce.clock_out IS NOT NULL;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- GRANTS
-- =============================================

GRANT EXECUTE ON FUNCTION auto_clockout_staff TO authenticated;
GRANT EXECUTE ON FUNCTION submit_shift_review TO authenticated;
GRANT EXECUTE ON FUNCTION approve_shift_review TO authenticated;
GRANT EXECUTE ON FUNCTION check_break_eligibility TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_tip_shortfall TO authenticated;
GRANT EXECUTE ON FUNCTION get_splh_metrics TO authenticated;
