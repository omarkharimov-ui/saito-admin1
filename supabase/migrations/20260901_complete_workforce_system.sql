-- =====================================================================
-- SAITO ADMIN 1 — COMPLETE WORKFORCE MANAGEMENT SYSTEM
-- Toast POS-level Staff Module
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPLOYEE COMPENSATION (Maaş + Effective Dates)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  pay_type text NOT NULL CHECK (pay_type IN ('hourly', 'salary')),
  hourly_rate numeric DEFAULT NULL,
  salary_amount numeric DEFAULT NULL,
  overtime_multiplier numeric DEFAULT 1.5,
  tip_eligible boolean DEFAULT false,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compensation_staff ON employee_compensation(staff_id);
CREATE INDEX IF NOT EXISTS idx_compensation_effective ON employee_compensation(effective_from, effective_to);

-- ---------------------------------------------------------------------
-- 2. SCHEDULE (Planlanmış Növbələr)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  planned_start time NOT NULL,
  planned_end time NOT NULL,
  role_at_time text DEFAULT NULL,
  notes text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_staff ON schedule(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedule_staff_date ON schedule(staff_id, schedule_date);

-- ---------------------------------------------------------------------
-- 3. SHIFT BREAKS (Fasilələr)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  break_type text NOT NULL DEFAULT 'meal' CHECK (break_type IN ('meal', 'rest', 'personal')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz DEFAULT NULL,
  duration interval GENERATED ALWAYS AS (ended_at - started_at) STORED,
  paid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_breaks_shift ON shift_breaks(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_breaks_staff ON shift_breaks(staff_id);

-- ---------------------------------------------------------------------
-- 4. APPROVAL REQUESTS (Təsdiq İstəkləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('void', 'refund', 'discount', 'price_override', 'other')),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  order_id uuid DEFAULT NULL,
  amount numeric DEFAULT NULL,
  original_amount numeric DEFAULT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid DEFAULT NULL,
  approved_at timestamptz DEFAULT NULL,
  rejection_reason text DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_staff ON approval_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_created ON approval_requests(created_at);

-- ---------------------------------------------------------------------
-- 5. PRICE OVERS (Qiymət Dəyişiklikləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  order_id uuid DEFAULT NULL,
  item_name text NOT NULL,
  original_price numeric NOT NULL,
  override_price numeric NOT NULL,
  difference numeric GENERATED ALWAYS AS (override_price - original_price) STORED,
  reason text DEFAULT NULL,
  approved_by uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_overrides_staff ON price_overrides(staff_id);
CREATE INDEX IF NOT EXISTS idx_price_overrides_created ON price_overrides(created_at);

-- ---------------------------------------------------------------------
-- 6. RISK SCORES (Risk Balları)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  score_date date NOT NULL DEFAULT CURRENT_DATE,
  total_score integer DEFAULT 0,
  cash_variance_score integer DEFAULT 0,
  void_score integer DEFAULT 0,
  refund_score integer DEFAULT 0,
  override_score integer DEFAULT 0,
  permission_denied_score integer DEFAULT 0,
  breakdown jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_staff ON risk_scores(staff_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_date ON risk_scores(score_date);

-- ---------------------------------------------------------------------
-- 7. PAYROLL PERIODS (Maaş Dövrləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'approved', 'locked')),
  total_gross_pay numeric DEFAULT 0,
  total_hours numeric DEFAULT 0,
  approved_by uuid DEFAULT NULL,
  approved_at timestamptz DEFAULT NULL,
  locked_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods(period_start, period_end);

-- ---------------------------------------------------------------------
-- 8. PAYROLL ENTRIES (Maaş Qeydləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  regular_hours numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  regular_pay numeric DEFAULT 0,
  overtime_pay numeric DEFAULT 0,
  tips numeric DEFAULT 0,
  gross_pay numeric DEFAULT 0,
  notes text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_staff ON payroll_entries(staff_id);

-- ---------------------------------------------------------------------
-- 9. KITCHEN TICKETS (Mətbəx Sifarişləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'completed', 'cancelled')),
  priority integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz DEFAULT NULL,
  completed_at timestamptz DEFAULT NULL,
  notes text DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_assigned ON kitchen_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_status ON kitchen_tickets(status);
CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_created ON kitchen_tickets(created_at);

-- ---------------------------------------------------------------------
-- 10. KITCHEN TICKET ITEMS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kitchen_ticket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES kitchen_tickets(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  quantity integer DEFAULT 1,
  special_instructions text DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_ticket_items_ticket ON kitchen_ticket_items(ticket_id);

-- ---------------------------------------------------------------------
-- 11. WAITER ASSIGNMENTS (Ofisiant Masa Təyinatları)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waiter_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waiter_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  table_id uuid DEFAULT NULL,
  guest_count integer DEFAULT 0,
  status text DEFAULT 'occupied' CHECK (status IN ('occupied', 'completed', 'cancelled')),
  seated_at timestamptz DEFAULT now(),
  completed_at timestamptz DEFAULT NULL,
  total_amount numeric DEFAULT 0,
  tip_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiter_assignments_waiter ON waiter_assignments(waiter_id);
CREATE INDEX IF NOT EXISTS idx_waiter_assignments_status ON waiter_assignments(status);
CREATE INDEX IF NOT EXISTS idx_waiter_assignments_created ON waiter_assignments(created_at);

-- ---------------------------------------------------------------------
-- 12. JOBS (Vəzifələr / Rolların Bəziləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  department text DEFAULT NULL,
  default_pay_type text DEFAULT 'hourly' CHECK (default_pay_type IN ('hourly', 'salary')),
  default_hourly_rate numeric DEFAULT NULL,
  default_salary numeric DEFAULT NULL,
  is_tipped boolean DEFAULT false,
  cash_access boolean DEFAULT false,
  view_reports boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name);
CREATE INDEX IF NOT EXISTS idx_jobs_department ON jobs(department);

-- ---------------------------------------------------------------------
-- 13. JOB PERMISSIONS (Vəzifə İcazələri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  permission_category text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_job_permissions_job ON job_permissions(job_id);

-- ---------------------------------------------------------------------
-- 14. STAFF PERMISSION OVERRIDERS (Fərdi İcazə Override-ləri)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES staff(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  is_allowed boolean NOT NULL,
  reason text DEFAULT NULL,
  created_by uuid DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_staff_perm_overrides_staff ON staff_permission_overrides(staff_id);

-- ---------------------------------------------------------------------
-- 15. AUDIT LOG (Genişləndirilmiş)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  table_name text DEFAULT NULL,
  record_id text DEFAULT NULL,
  performed_by uuid DEFAULT NULL,
  old_data jsonb DEFAULT NULL,
  new_data jsonb DEFAULT NULL,
  reason text DEFAULT NULL,
  approved_by uuid DEFAULT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ---------------------------------------------------------------------
-- 16. SECURITY EVENTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  staff_id uuid DEFAULT NULL,
  success boolean DEFAULT true,
  ip_address text DEFAULT NULL,
  user_agent text DEFAULT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_staff ON security_events(staff_id);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);

-- ---------------------------------------------------------------------
-- 17. CASH DRAWER SESSIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by uuid REFERENCES staff(id),
  closed_by uuid REFERENCES staff(id) DEFAULT NULL,
  opening_balance numeric DEFAULT 0,
  closing_balance numeric DEFAULT 0,
  expected_balance numeric DEFAULT 0,
  difference numeric DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed', 'force_closed')),
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz DEFAULT NULL,
  notes text DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_opened_by ON cash_drawer_sessions(opened_by);
CREATE INDEX IF NOT EXISTS idx_cash_drawer_status ON cash_drawer_sessions(status);

-- ---------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------
ALTER TABLE employee_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_ticket_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiter_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "employee_compensation_all" ON employee_compensation FOR ALL USING (true);
CREATE POLICY "schedule_all" ON schedule FOR ALL USING (true);
CREATE POLICY "shift_breaks_all" ON shift_breaks FOR ALL USING (true);
CREATE POLICY "approval_requests_all" ON approval_requests FOR ALL USING (true);
CREATE POLICY "price_overrides_all" ON price_overrides FOR ALL USING (true);
CREATE POLICY "risk_scores_all" ON risk_scores FOR ALL USING (true);
CREATE POLICY "payroll_periods_all" ON payroll_periods FOR ALL USING (true);
CREATE POLICY "payroll_entries_all" ON payroll_entries FOR ALL USING (true);
CREATE POLICY "kitchen_tickets_all" ON kitchen_tickets FOR ALL USING (true);
CREATE POLICY "kitchen_ticket_items_all" ON kitchen_ticket_items FOR ALL USING (true);
CREATE POLICY "waiter_assignments_all" ON waiter_assignments FOR ALL USING (true);
CREATE POLICY "jobs_all" ON jobs FOR ALL USING (true);
CREATE POLICY "job_permissions_all" ON job_permissions FOR ALL USING (true);
CREATE POLICY "staff_permission_overrides_all" ON staff_permission_overrides FOR ALL USING (true);

-- =====================================================================
-- INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_staff_role_id ON staff(role_id);
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff(is_active);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_closed_at ON shifts(closed_at);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
