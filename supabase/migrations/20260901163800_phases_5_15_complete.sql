-- =============================================
-- PHASE 5: BREAK MANAGEMENT (Enhanced)
-- =============================================

-- Break compliance tracking
CREATE TABLE IF NOT EXISTS break_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  shift_id UUID REFERENCES shifts(id),
  break_date DATE NOT NULL,
  required_breaks INTEGER NOT NULL DEFAULT 0,
  taken_breaks INTEGER NOT NULL DEFAULT 0,
  compliant BOOLEAN DEFAULT true,
  violation_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 6: OVERTIME TRACKING (Enhanced)
-- =============================================

-- Overtime thresholds configuration
CREATE TABLE IF NOT EXISTS overtime_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  threshold_type VARCHAR(20) NOT NULL CHECK (threshold_type IN ('daily', 'weekly', 'double')),
  hours DECIMAL(5,2) NOT NULL,
  rate_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 7: SHIFT HANDOVER
-- =============================================

-- Shift handover notes
CREATE TABLE IF NOT EXISTS shift_handover_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  from_staff_id UUID NOT NULL REFERENCES staff(id),
  to_staff_id UUID REFERENCES staff(id),
  note_type VARCHAR(30) NOT NULL CHECK (note_type IN ('general', 'cash', 'issues', 'tasks', 'vip', 'maintenance')),
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 8: STAFF ONBOARDING
-- =============================================

-- Onboarding workflows
CREATE TABLE IF NOT EXISTS onboarding_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding tasks
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES onboarding_workflows(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT true,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES staff(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 9: DOCUMENT MANAGEMENT
-- =============================================

-- Staff documents
CREATE TABLE IF NOT EXISTS staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('contract', 'id', 'certification', 'training', 'medical', 'other')),
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  expiration_date DATE,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 10: MULTI-LOCATION SUPPORT
-- =============================================

-- Locations
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  timezone VARCHAR(50) DEFAULT 'Asia/Baku',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff-location assignments
CREATE TABLE IF NOT EXISTS staff_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, location_id)
);

-- =============================================
-- PHASE 11: COMPLIANCE TRACKING
-- =============================================

-- Compliance rules
CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_hours_per_day DECIMAL(5,2),
  max_hours_per_week DECIMAL(5,2),
  min_break_minutes INTEGER,
  min_rest_hours DECIMAL(4,2),
  applies_to_minors BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance violations
CREATE TABLE IF NOT EXISTS compliance_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  rule_id UUID NOT NULL REFERENCES compliance_rules(id),
  violation_date DATE NOT NULL,
  description TEXT,
  severity VARCHAR(20) DEFAULT 'warning' CHECK (severity IN ('warning', 'minor', 'major', 'critical')),
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 12: STAFF COMMUNICATION
-- =============================================

-- Staff messages
CREATE TABLE IF NOT EXISTS staff_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_staff_id UUID NOT NULL REFERENCES staff(id),
  to_staff_id UUID REFERENCES staff(id),
  location_id UUID REFERENCES locations(id),
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('direct', 'broadcast', 'announcement', 'shift_note')),
  subject VARCHAR(200),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 13: PAYROLL EXPORT
-- =============================================

-- Payroll exports
CREATE TABLE IF NOT EXISTS payroll_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payroll_periods(id),
  export_format VARCHAR(20) NOT NULL CHECK (export_format IN ('csv', 'xlsx', 'pdf', 'quickbooks', 'adp')),
  file_path TEXT,
  exported_by UUID NOT NULL REFERENCES staff(id),
  exported_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 14: PERFORMANCE REVIEWS
-- =============================================

-- Performance reviews
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  reviewer_id UUID NOT NULL REFERENCES staff(id),
  review_period_start DATE NOT NULL,
  review_period_end DATE NOT NULL,
  overall_rating DECIMAL(3,2),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'acknowledged', 'disputed')),
  goals TEXT[],
  strengths TEXT[],
  improvements TEXT[],
  comments TEXT,
  staff_comments TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review criteria scores
CREATE TABLE IF NOT EXISTS review_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  criteria VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PHASE 15: ADVANCED PERMISSIONS
-- =============================================

-- Permission categories
CREATE TABLE IF NOT EXISTS permission_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Detailed permissions
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES permission_categories(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  is_granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- Staff permission overrides
CREATE TABLE IF NOT EXISTS staff_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  is_granted BOOLEAN NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, permission_id)
);

-- =============================================
-- INDEXES
-- =============================================

-- Break management
CREATE INDEX IF NOT EXISTS idx_break_compliance_staff ON break_compliance(staff_id);
CREATE INDEX IF NOT EXISTS idx_break_compliance_date ON break_compliance(break_date);

-- Shift handover
CREATE INDEX IF NOT EXISTS idx_handover_shift ON shift_handover_notes(shift_id);
CREATE INDEX IF NOT EXISTS idx_handover_to_staff ON shift_handover_notes(to_staff_id);

-- Onboarding
CREATE INDEX IF NOT EXISTS idx_onboarding_staff ON onboarding_workflows(staff_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_workflow ON onboarding_tasks(workflow_id);

-- Documents
CREATE INDEX IF NOT EXISTS idx_documents_staff ON staff_documents(staff_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiration ON staff_documents(expiration_date);

-- Locations
CREATE INDEX IF NOT EXISTS idx_staff_locations_staff ON staff_locations(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_locations_location ON staff_locations(location_id);

-- Compliance
CREATE INDEX IF NOT EXISTS idx_compliance_staff ON compliance_violations(staff_id);
CREATE INDEX IF NOT EXISTS idx_compliance_date ON compliance_violations(violation_date);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_to_staff ON staff_messages(to_staff_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON staff_messages(created_at DESC);

-- Reviews
CREATE INDEX IF NOT EXISTS idx_reviews_staff ON performance_reviews(staff_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON performance_reviews(reviewer_id);

-- Permissions
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_staff_overrides_staff ON staff_permission_overrides(staff_id);

-- =============================================
-- ENABLE RLS
-- =============================================

ALTER TABLE break_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_handover_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_permission_overrides ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES
-- =============================================

CREATE POLICY "Allow all for authenticated" ON break_compliance FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON overtime_thresholds FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated" ON shift_handover_notes FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON onboarding_workflows FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON onboarding_tasks FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON staff_documents FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON locations FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON staff_locations FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON compliance_rules FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated" ON compliance_violations FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON staff_messages FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON payroll_exports FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON performance_reviews FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON review_scores FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON permission_categories FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON permissions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON role_permissions FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON staff_permission_overrides FOR ALL USING (true);

-- =============================================
-- RPCs
-- =============================================

-- Phase 5: Break Management
CREATE OR REPLACE FUNCTION get_break_compliance(
  p_staff_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_minutes DECIMAL;
  v_required_breaks INTEGER;
  v_taken_breaks INTEGER;
  v_compliant BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0),
         COUNT(*)
  INTO v_total_minutes, v_taken_breaks
  FROM shift_breaks sb
  JOIN shifts s ON s.id = sb.shift_id
  WHERE s.staff_id = p_staff_id
  AND DATE(sb.started_at) = p_date
  AND sb.ended_at IS NOT NULL;

  SELECT COUNT(*) INTO v_required_breaks
  FROM break_rules
  WHERE is_active = true
  AND work_duration_minutes <= v_total_minutes;

  v_compliant := v_taken_breaks >= v_required_breaks;

  RETURN json_build_object(
    'total_minutes', v_total_minutes,
    'required_breaks', v_required_breaks,
    'taken_breaks', v_taken_breaks,
    'compliant', v_compliant
  );
END;
$$;

-- Phase 6: Overtime
CREATE OR REPLACE FUNCTION get_overtime_summary(
  p_staff_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_ot DECIMAL;
  v_weekly_ot DECIMAL;
  v_total_ot DECIMAL;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN overtime_type = 'daily' THEN hours ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN overtime_type = 'weekly' THEN hours ELSE 0 END), 0),
         COALESCE(SUM(hours), 0)
  INTO v_daily_ot, v_weekly_ot, v_total_ot
  FROM overtime_records
  WHERE staff_id = p_staff_id
  AND created_at::DATE BETWEEN p_start_date AND p_end_date;

  RETURN json_build_object(
    'daily_overtime', v_daily_ot,
    'weekly_overtime', v_weekly_ot,
    'total_overtime', v_total_ot
  );
END;
$$;

-- Phase 7: Shift Handover
CREATE OR REPLACE FUNCTION create_handover_note(
  p_shift_id UUID,
  p_from_staff_id UUID,
  p_to_staff_id UUID,
  p_type TEXT,
  p_priority TEXT,
  p_content TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id UUID;
BEGIN
  INSERT INTO shift_handover_notes (shift_id, from_staff_id, to_staff_id, note_type, priority, content)
  VALUES (p_shift_id, p_from_staff_id, p_to_staff_id, p_type, p_priority, p_content)
  RETURNING id INTO v_note_id;

  RETURN json_build_object('success', true, 'note_id', v_note_id);
END;
$$;

CREATE OR REPLACE FUNCTION get_handover_notes(
  p_shift_id UUID
)
RETURNS TABLE (
  note_id UUID,
  from_staff_name TEXT,
  note_type VARCHAR,
  priority VARCHAR,
  content TEXT,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    shn.id,
    st.full_name,
    shn.note_type,
    shn.priority,
    shn.content,
    shn.is_read,
    shn.created_at
  FROM shift_handover_notes shn
  JOIN staff st ON st.id = shn.from_staff_id
  WHERE shn.shift_id = p_shift_id
  ORDER BY
    CASE shn.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    shn.created_at DESC;
END;
$$;

-- Phase 8: Onboarding
CREATE OR REPLACE FUNCTION start_onboarding(
  p_staff_id UUID,
  p_role_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id UUID;
BEGIN
  INSERT INTO onboarding_workflows (staff_id, role_id, status)
  VALUES (p_staff_id, p_role_id, 'in_progress')
  RETURNING id INTO v_workflow_id;

  -- Create default tasks
  INSERT INTO onboarding_tasks (workflow_id, task_type, title, description, sort_order)
  VALUES
    (v_workflow_id, 'setup', 'Account Setup', 'Complete account setup', 1),
    (v_workflow_id, 'training', 'POS Training', 'Learn POS system basics', 2),
    (v_workflow_id, 'training', 'Safety Training', 'Complete safety training', 3),
    (v_workflow_id, 'documents', 'Submit Documents', 'Upload required documents', 4),
    (v_workflow_id, 'review', 'Manager Review', 'Complete manager review', 5);

  RETURN json_build_object('success', true, 'workflow_id', v_workflow_id);
END;
$$;

CREATE OR REPLACE FUNCTION complete_onboarding_task(
  p_task_id UUID,
  p_completed_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE onboarding_tasks
  SET is_completed = true, completed_at = NOW(), completed_by = p_completed_by
  WHERE id = p_task_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION get_onboarding_status(
  p_staff_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow RECORD;
  v_total_tasks INTEGER;
  v_completed_tasks INTEGER;
BEGIN
  SELECT * INTO v_workflow FROM onboarding_workflows WHERE staff_id = p_staff_id ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No onboarding found');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed = true)
  INTO v_total_tasks, v_completed_tasks
  FROM onboarding_tasks
  WHERE workflow_id = v_workflow.id;

  RETURN json_build_object(
    'workflow_id', v_workflow.id,
    'status', v_workflow.status,
    'total_tasks', v_total_tasks,
    'completed_tasks', v_completed_tasks,
    'progress', CASE WHEN v_total_tasks > 0 THEN (v_completed_tasks::DECIMAL / v_total_tasks * 100) ELSE 0 END
  );
END;
$$;

-- Phase 10: Multi-location
CREATE OR REPLACE FUNCTION assign_staff_to_location(
  p_staff_id UUID,
  p_location_id UUID,
  p_is_primary BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO staff_locations (staff_id, location_id, is_primary)
  VALUES (p_staff_id, p_location_id, p_is_primary)
  ON CONFLICT (staff_id, location_id)
  DO UPDATE SET is_primary = p_is_primary;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION get_staff_locations(
  p_staff_id UUID
)
RETURNS TABLE (
  location_id UUID,
  location_name TEXT,
  is_primary BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.name, sl.is_primary
  FROM staff_locations sl
  JOIN locations l ON l.id = sl.location_id
  WHERE sl.staff_id = p_staff_id
  ORDER BY sl.is_primary DESC;
END;
$$;

-- Phase 11: Compliance
CREATE OR REPLACE FUNCTION check_compliance(
  p_staff_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_hours DECIMAL;
  v_weekly_hours DECIMAL;
  v_violations JSONB := '[]'::JSONB;
BEGIN
  -- Calculate daily hours
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600), 0)
  INTO v_daily_hours
  FROM shifts
  WHERE staff_id = p_staff_id AND DATE(opened_at) = p_date;

  -- Calculate weekly hours
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600), 0)
  INTO v_weekly_hours
  FROM shifts
  WHERE staff_id = p_staff_id
  AND opened_at >= date_trunc('week', p_date::TIMESTAMP)
  AND opened_at < date_trunc('week', p_date::TIMESTAMP) + INTERVAL '7 days';

  -- Check daily limit
  IF v_daily_hours > 8 THEN
    v_violations := v_violations || jsonb_build_object('type', 'daily_overtime', 'hours', v_daily_hours);
  END IF;

  -- Check weekly limit
  IF v_weekly_hours > 40 THEN
    v_violations := v_violations || jsonb_build_object('type', 'weekly_overtime', 'hours', v_weekly_hours);
  END IF;

  RETURN json_build_object(
    'daily_hours', v_daily_hours,
    'weekly_hours', v_weekly_hours,
    'violations', v_violations,
    'compliant', jsonb_array_length(v_violations) = 0
  );
END;
$$;

-- Phase 12: Communication
CREATE OR REPLACE FUNCTION send_message(
  p_from_staff_id UUID,
  p_to_staff_id UUID,
  p_location_id UUID,
  p_type TEXT,
  p_subject TEXT,
  p_content TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO staff_messages (from_staff_id, to_staff_id, location_id, message_type, subject, content)
  VALUES (p_from_staff_id, p_to_staff_id, p_location_id, p_type, p_subject, p_content)
  RETURNING id INTO v_message_id;

  RETURN json_build_object('success', true, 'message_id', v_message_id);
END;
$$;

CREATE OR REPLACE FUNCTION get_messages(
  p_staff_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  message_id UUID,
  from_staff_name TEXT,
  subject TEXT,
  content TEXT,
  message_type VARCHAR,
  is_read BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.id,
    st.full_name,
    sm.subject,
    sm.content,
    sm.message_type,
    sm.is_read,
    sm.created_at
  FROM staff_messages sm
  JOIN staff st ON st.id = sm.from_staff_id
  WHERE sm.to_staff_id = p_staff_id
  ORDER BY sm.created_at DESC
  LIMIT p_limit;
END;
$$;

-- Phase 14: Performance Reviews
CREATE OR REPLACE FUNCTION create_review(
  p_staff_id UUID,
  p_reviewer_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_id UUID;
BEGIN
  INSERT INTO performance_reviews (staff_id, reviewer_id, review_period_start, review_period_end)
  VALUES (p_staff_id, p_reviewer_id, p_period_start, p_period_end)
  RETURNING id INTO v_review_id;

  RETURN json_build_object('success', true, 'review_id', v_review_id);
END;
$$;

CREATE OR REPLACE FUNCTION submit_review(
  p_review_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE performance_reviews SET status = 'submitted' WHERE id = p_review_id;
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION get_review_history(
  p_staff_id UUID
)
RETURNS TABLE (
  review_id UUID,
  reviewer_name TEXT,
  period_start DATE,
  period_end DATE,
  overall_rating DECIMAL,
  status VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    st.full_name,
    pr.review_period_start,
    pr.review_period_end,
    pr.overall_rating,
    pr.status
  FROM performance_reviews pr
  JOIN staff st ON st.id = pr.reviewer_id
  WHERE pr.staff_id = p_staff_id
  ORDER BY pr.created_at DESC;
END;
$$;

-- Phase 15: Advanced Permissions
CREATE OR REPLACE FUNCTION check_permission(
  p_staff_id UUID,
  p_permission_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_permission BOOLEAN;
  v_override BOOLEAN;
BEGIN
  -- Check for override first
  SELECT is_granted INTO v_override
  FROM staff_permission_overrides spo
  JOIN permissions p ON p.id = spo.permission_id
  WHERE spo.staff_id = p_staff_id AND p.code = p_permission_code;

  IF FOUND THEN
    RETURN json_build_object('has_permission', v_override, 'source', 'override');
  END IF;

  -- Check role permission
  SELECT EXISTS (
    SELECT 1
    FROM staff st
    JOIN role_permissions rp ON rp.role_id = st.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE st.id = p_staff_id AND p.code = p_permission_code AND rp.is_granted = true
  ) INTO v_has_permission;

  RETURN json_build_object('has_permission', v_has_permission, 'source', 'role');
END;
$$;

CREATE OR REPLACE FUNCTION get_effective_permissions(
  p_staff_id UUID
)
RETURNS TABLE (
  permission_code VARCHAR,
  permission_name VARCHAR,
  category_name TEXT,
  is_granted BOOLEAN,
  source VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.code,
    p.name,
    pc.name,
    COALESCE(spo.is_granted, rp.is_granted, false),
    CASE
      WHEN spo.id IS NOT NULL THEN 'override'
      WHEN rp.id IS NOT NULL THEN 'role'
      ELSE 'default'
    END
  FROM permissions p
  LEFT JOIN permission_categories pc ON pc.id = p.category_id
  LEFT JOIN role_permissions rp ON rp.permission_id = p.id AND rp.role_id = (SELECT role_id FROM staff WHERE id = p_staff_id)
  LEFT JOIN staff_permission_overrides spo ON spo.permission_id = p.id AND spo.staff_id = p_staff_id
  ORDER BY pc.sort_order, p.name;
END;
$$;

-- =============================================
-- INSERT DEFAULT DATA
-- =============================================

-- Default overtime thresholds
INSERT INTO overtime_thresholds (threshold_type, hours, rate_multiplier) VALUES
  ('daily', 8, 1.5),
  ('weekly', 40, 1.5),
  ('double', 12, 2.0)
ON CONFLICT DO NOTHING;

-- Default compliance rules
INSERT INTO compliance_rules (rule_type, name, description, max_hours_per_day, max_hours_per_week, min_break_minutes) VALUES
  ('overtime', 'Daily Overtime', 'Maximum 8 hours per day', 8, NULL, NULL),
  ('overtime', 'Weekly Overtime', 'Maximum 40 hours per week', NULL, 40, NULL),
  ('break', 'Break Requirement', '30 min break after 6 hours', NULL, NULL, 30)
ON CONFLICT DO NOTHING;

-- Default permission categories
INSERT INTO permission_categories (name, sort_order) VALUES
  ('Orders', 1),
  ('Payments', 2),
  ('Reports', 3),
  ('Staff', 4),
  ('Settings', 5)
ON CONFLICT DO NOTHING;

-- Ensure permissions table structure matches expected schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'category_id') THEN
      ALTER TABLE permissions ADD COLUMN category_id UUID REFERENCES permission_categories(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'name') THEN
      ALTER TABLE permissions ADD COLUMN name VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'code') THEN
      ALTER TABLE permissions ADD COLUMN code VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permissions' AND column_name = 'description') THEN
      ALTER TABLE permissions ADD COLUMN description TEXT;
    END IF;
  END IF;
END $$;

-- Default permissions
INSERT INTO permissions (key, category_id, name, code)
SELECT 'order.discount', pc.id, 'Apply Discount', 'order.discount' FROM permission_categories pc WHERE pc.name = 'Orders'
UNION ALL SELECT 'order.void', pc.id, 'Void Items', 'order.void' FROM permission_categories pc WHERE pc.name = 'Orders'
UNION ALL SELECT 'payment.refund', pc.id, 'Process Refund', 'payment.refund' FROM permission_categories pc WHERE pc.name = 'Payments'
UNION ALL SELECT 'reports.view', pc.id, 'View Reports', 'reports.view' FROM permission_categories pc WHERE pc.name = 'Reports'
UNION ALL SELECT 'staff.manage', pc.id, 'Manage Staff', 'staff.manage' FROM permission_categories pc WHERE pc.name = 'Staff'
UNION ALL SELECT 'settings.manage', pc.id, 'Manage Settings', 'settings.manage' FROM permission_categories pc WHERE pc.name = 'Settings'
ON CONFLICT (key) DO NOTHING;

-- Default location
INSERT INTO locations (name, address) VALUES
  ('Main Location', 'Default location')
ON CONFLICT DO NOTHING;

-- =============================================
-- GRANT PERMISSIONS
-- =============================================

GRANT EXECUTE ON FUNCTION get_break_compliance TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_overtime_summary TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_handover_note TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_handover_notes TO anon, authenticated;
GRANT EXECUTE ON FUNCTION start_onboarding TO anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_onboarding_task TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_onboarding_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION assign_staff_to_location TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_staff_locations TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_compliance TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_message TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_messages TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_review TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_review TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_review_history TO anon, authenticated;
GRANT EXECUTE ON FUNCTION check_permission TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_effective_permissions TO anon, authenticated;
