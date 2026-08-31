# Toast POS-Level Staff & Shifts Module - Complete Implementation Plan

## Overview
Implement all missing features to reach Toast POS level staff management quality.

## Phase 1: Time Clock System (Critical)

### 1.1 Database Tables
```sql
-- Time clock entries
CREATE TABLE time_clock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  location_id UUID REFERENCES locations(id),
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pin_verified BOOLEAN DEFAULT false,
  biometric_verified BOOLEAN DEFAULT false,
  gps_location POINT,
  device_id UUID REFERENCES devices(id),
  notes TEXT,
  approved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Break tracking
CREATE TABLE shift_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  break_type VARCHAR(20) NOT NULL CHECK (break_type IN ('paid', 'unpaid', 'lunch', 'rest')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  is_compliant BOOLEAN DEFAULT true,
  violation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Overtime tracking
CREATE TABLE overtime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  shift_id UUID REFERENCES shifts(id),
  overtime_type VARCHAR(20) NOT NULL CHECK (overtime_type IN ('daily', 'weekly', 'double', 'holiday')),
  hours DECIMAL(5,2) NOT NULL,
  rate_multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.5,
  approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 RPCs
- `clock_in(p_staff_id UUID, p_pin TEXT, p_location_id UUID, p_device_id UUID)`
- `clock_out(p_staff_id UUID, p_pin TEXT, p_notes TEXT)`
- `start_break(p_staff_id UUID, p_break_type TEXT)`
- `end_break(p_staff_id UUID)`
- `get_time_clock_status(p_staff_id UUID)`
- `get_active_breaks(p_location_id UUID)`
- `calculate_overtime(p_staff_id UUID, p_date DATE)`

### 1.3 API Routes
- `/api/time-clock/clock-in`
- `/api/time-clock/clock-out`
- `/api/time-clock/break-start`
- `/api/time-clock/break-end`
- `/api/time-clock/status/[staff_id]`
- `/api/time-clock/active-breaks`

### 1.4 UI Components
- TimeClockPanel - PIN pad, clock in/out buttons, status display
- BreakTimer - Active break display with countdown
- OvertimeAlert - Warning when approaching overtime
- TimeClockHistory - Daily/weekly time entries

## Phase 2: Scheduling System (Critical)

### 2.1 Database Tables
```sql
-- Schedule templates
CREATE TABLE schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location_id UUID REFERENCES locations(id),
  role_id UUID REFERENCES roles(id),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL, -- [0,1,2,3,4,5,6] for Sun-Sat
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff availability
CREATE TABLE staff_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shift swap requests
CREATE TABLE shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_shift_id UUID NOT NULL REFERENCES schedule(id),
  target_staff_id UUID REFERENCES staff(id),
  target_shift_id UUID REFERENCES schedule(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES staff(id),
  approved_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedule conflicts
CREATE TABLE schedule_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedule(id),
  conflict_type VARCHAR(50) NOT NULL,
  description TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 RPCs
- `create_schedule(p_staff_id UUID, p_date DATE, p_start TIME, p_end TIME, p_location_id UUID)`
- `update_schedule(p_schedule_id UUID, p_start TIME, p_end TIME, p_notes TEXT)`
- `delete_schedule(p_schedule_id UUID)`
- `get_weekly_schedule(p_location_id UUID, p_start_date DATE, p_end_date DATE)`
- `request_shift_swap(p_requester_shift_id UUID, p_target_staff_id UUID, p_target_shift_id UUID)`
- `approve_shift_swap(p_swap_id UUID, p_approved_by UUID)`
- `check_schedule_conflicts(p_staff_id UUID, p_date DATE, p_start TIME, p_end TIME)`
- `auto_schedule(p_location_id UUID, p_date DATE)`

### 2.3 API Routes
- `/api/schedule/weekly`
- `/api/schedule/create`
- `/api/schedule/[id]/update`
- `/api/schedule/[id]/delete`
- `/api/schedule/swap-request`
- `/api/schedule/swap/[id]/approve`
- `/api/schedule/conflicts`
- `/api/schedule/auto-schedule`

### 2.4 UI Components
- ScheduleCalendar - Drag-and-drop weekly calendar
- ShiftCard - Draggable shift block
- SwapRequestModal - Request/approve shift swaps
- ConflictWarning - Display scheduling conflicts
- AvailabilityEditor - Set staff availability

## Phase 3: Tip Management (Critical)

### 3.1 Database Tables
```sql
-- Tip pools
CREATE TABLE tip_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id),
  pool_date DATE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'distributed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip pool contributions
CREATE TABLE tip_pool_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES tip_pools(id),
  order_id UUID REFERENCES orders(id),
  amount DECIMAL(10,2) NOT NULL,
  contribution_type VARCHAR(20) NOT NULL CHECK (contribution_type IN ('cash', 'credit', 'auto_gratuity')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip distributions
CREATE TABLE tip_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES tip_pools(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  role_id UUID REFERENCES roles(id),
  percentage DECIMAL(5,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  hours_worked DECIMAL(5,2),
  points DECIMAL(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip distribution rules
CREATE TABLE tip_distribution_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  percentage DECIMAL(5,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 RPCs
- `create_tip_pool(p_location_id UUID, p_date DATE)`
- `add_tip_contribution(p_pool_id UUID, p_order_id UUID, p_amount DECIMAL, p_type TEXT)`
- `distribute_tips(p_pool_id UUID)`
- `get_tip_pool_summary(p_pool_id UUID)`
- `get_staff_tips(p_staff_id UUID, p_start_date DATE, p_end_date DATE)`
- `set_tip_distribution_rule(p_location_id UUID, p_role_id UUID, p_percentage DECIMAL)`

### 3.3 API Routes
- `/api/tips/pool/create`
- `/api/tips/pool/[id]/contribute`
- `/api/tips/pool/[id]/distribute`
- `/api/tips/pool/[id]/summary`
- `/api/tips/staff/[staff_id]`
- `/api/tips/rules`

### 3.4 UI Components
- TipPoolCard - Pool summary with distribute button
- TipContributionForm - Add tips to pool
- TipDistributionTable - Show distribution breakdown
- TipRulesEditor - Configure distribution rules
- StaffTipHistory - Individual tip history

## Phase 4: Cash Reconciliation (Critical)

### 4.1 Database Tables
```sql
-- Cash reconciliation
CREATE TABLE cash_reconciliations (
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
CREATE TABLE denomination_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES cash_reconciliations(id),
  denomination DECIMAL(10,2) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  total DECIMAL(10,2) GENERATED ALWAYS AS (denomination * count) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 RPCs
- `create_reconciliation(p_shift_id UUID, p_staff_id UUID, p_denominations JSONB)`
- `approve_reconciliation(p_reconciliation_id UUID, p_approved_by UUID)`
- `dispute_reconciliation(p_reconciliation_id UUID, p_reason TEXT)`
- `get_reconciliation_summary(p_shift_id UUID)`
- `get_cash_variance_report(p_location_id UUID, p_start_date DATE, p_end_date DATE)`

### 4.3 API Routes
- `/api/cash/reconciliation/create`
- `/api/cash/reconciliation/[id]/approve`
- `/api/cash/reconciliation/[id]/dispute`
- `/api/cash/reconciliation/[shift_id]`
- `/api/cash/variance-report`

### 4.4 UI Components
- CashReconciliationForm - Denomination counting interface
- DenominationCounter - Individual denomination input
- ReconciliationSummary - Display reconciliation results
- VarianceReport - Cash variance analytics

## Phase 5: Break Management (Critical)

### 5.1 Database Tables (already defined in Phase 1)

### 5.2 RPCs
- `get_break_compliance(p_staff_id UUID, p_date DATE)`
- `get_break_violations(p_location_id UUID, p_date DATE)`
- `auto_deduct_breaks(p_shift_id UUID)`

### 5.3 API Routes
- `/api/breaks/active`
- `/api/breaks/start`
- `/api/breaks/end`
- `/api/breaks/compliance/[staff_id]`
- `/api/breaks/violations`

### 5.4 UI Components
- BreakTimer - Active break countdown
- BreakHistory - Break log
- ComplianceAlert - Break violation warnings
- BreakRulesEditor - Configure break rules

## Phase 6: Overtime Tracking (Critical)

### 6.1 Database Tables (already defined in Phase 1)

### 6.2 RPCs
- `calculate_daily_overtime(p_staff_id UUID, p_date DATE)`
- `calculate_weekly_overtime(p_staff_id UUID, p_week_start DATE)`
- `get_overtime_summary(p_staff_id UUID, p_start_date DATE, p_end_date DATE)`
- `approve_overtime(p_overtime_id UUID, p_approved_by UUID)`

### 6.3 API Routes
- `/api/overtime/daily/[staff_id]`
- `/api/overtime/weekly/[staff_id]`
- `/api/overtime/summary/[staff_id]`
- `/api/overtime/[id]/approve`

### 6.4 UI Components
- OvertimeAlert - Warning when approaching overtime
- OvertimeSummary - Weekly/daily overtime display
- OvertimeApprovalModal - Manager approval workflow

## Phase 7: Shift Handover (High)

### 7.1 Database Tables
```sql
-- Shift handover notes
CREATE TABLE shift_handover_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id),
  from_staff_id UUID NOT NULL REFERENCES staff(id),
  to_staff_id UUID REFERENCES staff(id),
  note_type VARCHAR(30) NOT NULL CHECK (note_type IN ('general', 'cash', 'issues', 'tasks', 'vip', 'maintenance')),
  priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 RPCs
- `create_handover_note(p_shift_id UUID, p_from_staff_id UUID, p_to_staff_id UUID, p_type TEXT, p_priority TEXT, p_content TEXT)`
- `get_handover_notes(p_shift_id UUID)`
- `mark_handover_read(p_note_id UUID)`

### 7.3 API Routes
- `/api/handover/create`
- `/api/handover/[shift_id]`
- `/api/handover/[id]/read`

### 7.4 UI Components
- HandoverNoteForm - Create handover note
- HandoverNotesList - Display notes for shift
- HandoverSummary - Summary for incoming shift

## Phase 8: Staff Onboarding (High)

### 8.1 Database Tables
```sql
-- Onboarding workflows
CREATE TABLE onboarding_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding tasks
CREATE TABLE onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES onboarding_workflows(id),
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

-- Staff documents
CREATE TABLE staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
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
```

### 8.2 RPCs
- `start_onboarding(p_staff_id UUID, p_role_id UUID)`
- `complete_onboarding_task(p_task_id UUID, p_completed_by UUID)`
- `upload_staff_document(p_staff_id UUID, p_document_type TEXT, p_file_name TEXT, p_file_path TEXT)`
- `verify_document(p_document_id UUID, p_verified_by UUID)`
- `get_onboarding_status(p_staff_id UUID)`

### 8.3 API Routes
- `/api/onboarding/start`
- `/api/onboarding/task/[id]/complete`
- `/api/onboarding/document/upload`
- `/api/onboarding/document/[id]/verify`
- `/api/onboarding/status/[staff_id]`

### 8.4 UI Components
- OnboardingWizard - Multi-step onboarding flow
- TaskChecklist - Onboarding task list
- DocumentUploader - Upload staff documents
- OnboardingProgress - Progress indicator

## Phase 9: Document Management (High)

### 9.1 Database Tables (already defined in Phase 8)

### 9.2 RPCs
- `get_staff_documents(p_staff_id UUID)`
- `get_expiring_documents(p_location_id UUID, p_days_threshold INTEGER)`
- `delete_document(p_document_id UUID)`

### 9.3 API Routes
- `/api/documents/[staff_id]`
- `/api/documents/expiring`
- `/api/documents/[id]/delete`

### 9.4 UI Components
- DocumentList - Staff documents list
- DocumentUploader - Upload interface
- ExpirationAlert - Document expiration warnings

## Phase 10: Multi-location Support (High)

### 10.1 Database Tables
```sql
-- Locations
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  timezone VARCHAR(50) DEFAULT 'Asia/Baku',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff-location assignments
CREATE TABLE staff_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  is_primary BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, location_id)
);
```

### 10.2 RPCs
- `assign_staff_to_location(p_staff_id UUID, p_location_id UUID, p_is_primary BOOLEAN)`
- `get_staff_locations(p_staff_id UUID)`
- `get_location_staff(p_location_id UUID)`
- `transfer_staff(p_staff_id UUID, p_from_location_id UUID, p_to_location_id UUID)`

### 10.3 API Routes
- `/api/locations`
- `/api/locations/[id]/staff`
- `/api/locations/assign`
- `/api/locations/transfer`

### 10.4 UI Components
- LocationSelector - Switch between locations
- LocationStaffList - Staff at location
- TransferModal - Transfer staff between locations

## Phase 11: Compliance Tracking (Medium)

### 11.1 Database Tables
```sql
-- Compliance rules
CREATE TABLE compliance_rules (
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
CREATE TABLE compliance_violations (
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
```

### 11.2 RPCs
- `check_compliance(p_staff_id UUID, p_date DATE)`
- `get_compliance_violations(p_location_id UUID, p_date DATE)`
- `resolve_violation(p_violation_id UUID, p_resolved_by UUID)`

### 11.3 API Routes
- `/api/compliance/check/[staff_id]`
- `/api/compliance/violations`
- `/api/compliance/violation/[id]/resolve`

### 11.4 UI Components
- ComplianceDashboard - Overview of compliance status
- ViolationAlert - Display violations
- ComplianceReport - Generate compliance reports

## Phase 12: Staff Communication (Medium)

### 12.1 Database Tables
```sql
-- Staff messages
CREATE TABLE staff_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_staff_id UUID NOT NULL REFERENCES staff(id),
  to_staff_id UUID REFERENCES staff.id,
  location_id UUID REFERENCES locations(id),
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('direct', 'broadcast', 'announcement', 'shift_note')),
  subject VARCHAR(200),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 12.2 RPCs
- `send_message(p_from_staff_id UUID, p_to_staff_id UUID, p_location_id UUID, p_type TEXT, p_subject TEXT, p_content TEXT)`
- `get_messages(p_staff_id UUID, p_limit INTEGER, p_offset INTEGER)`
- `mark_message_read(p_message_id UUID)`

### 12.3 API Routes
- `/api/messages/send`
- `/api/messages/[staff_id]`
- `/api/messages/[id]/read`

### 12.4 UI Components
- MessageInbox - Staff messages
- MessageComposer - Send messages
- AnnouncementBanner - Display announcements

## Phase 13: Payroll Export (Medium)

### 13.1 Database Tables
```sql
-- Payroll exports
CREATE TABLE payroll_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payroll_periods(id),
  export_format VARCHAR(20) NOT NULL CHECK (export_format IN ('csv', 'xlsx', 'pdf', 'quickbooks', 'adp')),
  file_path TEXT,
  exported_by UUID NOT NULL REFERENCES staff(id),
  exported_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 13.2 RPCs
- `generate_payroll_export(p_period_id UUID, p_format TEXT, p_exported_by UUID)`
- `get_payroll_export_data(p_period_id UUID)`

### 13.3 API Routes
- `/api/payroll/export`
- `/api/payroll/export/[period_id]/data`

### 13.4 UI Components
- PayrollExportForm - Configure export
- ExportHistory - Past exports

## Phase 14: Performance Reviews (Medium)

### 14.1 Database Tables
```sql
-- Performance reviews
CREATE TABLE performance_reviews (
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
CREATE TABLE review_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES performance_reviews(id),
  criteria VARCHAR(50) NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 14.2 RPCs
- `create_review(p_staff_id UUID, p_reviewer_id UUID, p_period_start DATE, p_period_end DATE)`
- `submit_review(p_review_id UUID)`
- `acknowledge_review(p_review_id UUID)`
- `get_review_history(p_staff_id UUID)`

### 14.3 API Routes
- `/api/reviews/create`
- `/api/reviews/[id]/submit`
- `/api/reviews/[id]/acknowledge`
- `/api/reviews/[staff_id]/history`

### 14.4 UI Components
- ReviewForm - Create/submit review
- ReviewHistory - Past reviews
- ReviewSummary - Review display

## Phase 15: Advanced Permissions (Medium)

### 15.1 Database Tables (already defined in previous migrations)

### 15.2 RPCs
- `check_permission(p_staff_id UUID, p_permission TEXT, p_location_id UUID)`
- `get_effective_permissions(p_staff_id UUID, p_location_id UUID)`
- `grant_permission_override(p_staff_id UUID, p_permission TEXT, p_allowed BOOLEAN, p_location_id UUID)`

### 15.3 API Routes
- `/api/permissions/check`
- `/api/permissions/[staff_id]`
- `/api/permissions/override`

### 15.4 UI Components
- PermissionMatrix - Visual permission editor
- PermissionOverrideModal - Grant/deny specific permissions

## Implementation Order

1. **Phase 1: Time Clock** - Most critical, used daily
2. **Phase 2: Scheduling** - Core workforce management
3. **Phase 3: Tip Management** - Revenue related
4. **Phase 4: Cash Reconciliation** - Financial control
5. **Phase 5: Break Management** - Compliance
6. **Phase 6: Overtime Tracking** - Cost control
7. **Phase 7: Shift Handover** - Operations
8. **Phase 8: Staff Onboarding** - HR
9. **Phase 9: Document Management** - HR
10. **Phase 10: Multi-location** - Scalability
11. **Phase 11: Compliance Tracking** - Legal
12. **Phase 12: Staff Communication** - Operations
13. **Phase 13: Payroll Export** - Finance
14. **Phase 14: Performance Reviews** - HR
15. **Phase 15: Advanced Permissions** - Security

## Estimated Time
- Phase 1-6: 2-3 weeks (Critical features)
- Phase 7-10: 1-2 weeks (High priority)
- Phase 11-15: 1-2 weeks (Medium priority)

Total: 4-7 weeks for complete Toast POS-level implementation
