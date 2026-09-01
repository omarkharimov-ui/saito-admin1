-- =============================================
-- PHASE 3: Payroll & Tip Shortfall Automation
-- =============================================

-- =============================================
-- 1. PAYROLL EXPORTS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS payroll_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) DEFAULT 'custom',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  webhook_url TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'completed')),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  entries_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. PAYROLL WEBHOOK CONFIG
-- =============================================

CREATE TABLE IF NOT EXISTS payroll_webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT,
  is_active BOOLEAN DEFAULT true,
  last_export_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. GET PAYROLL EXPORT RPC
-- =============================================

CREATE OR REPLACE FUNCTION get_payroll_export(
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  entries JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'staff_id', s.id,
      'staff_name', s.name,
      'role_name', COALESCE(r.name, '—'),
      'period_start', p_period_start,
      'period_end', p_period_end,
      'hours_worked', 0,
      'hourly_rate', COALESCE(s.hourly_rate, 0),
      'overtime_hours', 0,
      'overtime_rate', COALESCE(s.overtime_rate, 0),
      'tips_earned', 0,
      'tip_shortfall', 0,
      'gross_pay', 0,
      'deductions', 0,
      'net_pay', 0
    )
  ) INTO entries
  FROM staff s
  LEFT JOIN roles r ON r.id = s.role_id
  WHERE s.is_active = true;

  result := json_build_object('entries', COALESCE(entries, '[]'::json));
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 4. TIP SHORTFALL CALCULATION RPC (ENHANCED)
-- =============================================

CREATE OR REPLACE FUNCTION calculate_tip_shortfall_v2(
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
  v_shift_review_id UUID;
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (tce.clock_out - tce.clock_in)) / 3600), 0)
  INTO v_hours
  FROM time_clock_entries tce
  WHERE tce.staff_id = p_staff_id
    AND DATE(tce.clock_in) BETWEEN p_period_start AND p_period_end;

  SELECT COALESCE(SUM(sr.declared_cash_tips), 0)
  INTO v_tips
  FROM shift_reviews sr
  JOIN shifts s ON s.id = sr.shift_id
  WHERE sr.staff_id = p_staff_id
    AND DATE(s.opened_at) BETWEEN p_period_start AND p_period_end;

  IF (v_hours * v_tipped_wage + v_tips) < (v_hours * v_min_wage) THEN
    v_shortfall := (v_hours * v_min_wage) - (v_hours * v_tipped_wage + v_tips);
  END IF;

  INSERT INTO tip_shortfalls (
    staff_id, period_start, period_end, hours_worked, tipped_wage_rate,
    minimum_wage, tips_earned, shortfall_amount
  ) VALUES (
    p_staff_id, p_period_start, p_period_end, v_hours, v_tipped_wage,
    v_min_wage, v_tips, v_shortfall
  )
  ON CONFLICT (staff_id, period_start, period_end)
  DO UPDATE SET
    hours_worked = EXCLUDED.hours_worked,
    tipped_wage_rate = EXCLUDED.tipped_wage_rate,
    minimum_wage = EXCLUDED.minimum_wage,
    tips_earned = EXCLUDED.tips_earned,
    shortfall_amount = EXCLUDED.shortfall_amount;

  RETURN json_build_object(
    'hours_worked', v_hours,
    'tips_earned', v_tips,
    'shortfall_amount', v_shortfall,
    'minimum_wage', v_min_wage
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 5. AUTO CALCULATE TIP SHORTFALLS RPC
-- =============================================

CREATE OR REPLACE FUNCTION auto_calculate_tip_shortfalls(
  p_period_start DATE DEFAULT CURRENT_DATE - INTERVAL '1 week',
  p_period_end DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE
  v_staff RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_staff IN
    SELECT id FROM staff WHERE is_active = true
  LOOP
    PERFORM calculate_tip_shortfall_v2(v_staff.id, p_period_start, p_period_end);
    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'processed_staff', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- GRANTS
-- =============================================

GRANT EXECUTE ON FUNCTION get_payroll_export TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_tip_shortfall_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION auto_calculate_tip_shortfalls TO authenticated;
GRANT ALL ON payroll_exports TO authenticated;
GRANT ALL ON payroll_webhook_configs TO authenticated;
