-- Phase 5: Staff Audit Trail Foundation
-- Purpose: Prepare database for /admin/staff/audit page
-- Uses existing audit_logs and operation_logs tables

-- ============================================
-- STEP 1: Verify audit_logs structure
-- ============================================
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'audit_logs'
    AND column_name IN ('id', 'action', 'order_id', 'item_id', 'user_id', 'old_amount', 'new_amount', 'reason', 'approved_by', 'snapshot', 'created_at', 'table_name', 'record_id', 'old_data', 'new_data', 'performed_by', 'ip_address', 'staff_id', 'staff_name', 'target_type', 'target_id', 'details');
  
  RAISE NOTICE 'audit_logs columns found: %', col_count;
END $$;

-- ============================================
-- STEP 2: Verify operation_logs structure
-- ============================================
DO $$
DECLARE
  col_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO col_count
  FROM information_schema.columns
  WHERE table_name = 'operation_logs'
    AND column_name IN ('id', 'operation', 'order_id', 'source_table_number', 'target_table_number', 'old_state', 'new_state', 'undo_payload', 'is_undone', 'undone_at', 'undone_by', 'performed_by', 'employee_name', 'reason', 'ip_address', 'device_id', 'created_at', 'table_number', 'action', 'old_values', 'new_values', 'reservation_id', 'table_name', 'record_id', 'old_data', 'new_data', 'type', 'payload', 'inverse_payload');
  
  RAISE NOTICE 'operation_logs columns found: %', col_count;
END $$;

-- ============================================
-- STEP 3: Add indexes for audit queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_staff_id ON audit_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_operation_logs_performed_by ON operation_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_table_name ON operation_logs(table_name);

-- ============================================
-- STEP 4: Ensure created_at has default
-- ============================================
ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE operation_logs ALTER COLUMN created_at SET DEFAULT now();

-- ============================================
-- VERIFICATION
-- ============================================
-- SELECT COUNT(*) AS audit_logs_count FROM audit_logs;
-- SELECT COUNT(*) AS operation_logs_count FROM operation_logs;
-- SELECT DISTINCT table_name FROM audit_logs ORDER BY table_name;
