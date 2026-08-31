-- =====================================================================
-- SAITO ADMIN 1 — DATABASE AUDIT REPORT
-- Run this in Supabase Dashboard → SQL Editor to see what exists
-- =====================================================================

-- 1. List all tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- 2. Check key table columns
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('staff', 'shifts', 'operation_logs', 'security_events', 'price_overrides', 'approval_requests', 'cash_drawer_sessions', 'cash_drawer_log', 'sessions', 'roles', 'permissions', 'role_permissions') ORDER BY table_name, ordinal_position;

-- 3. Check RPCs
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY proname;

-- 4. Check price_overrides table specifically
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'price_overrides') AS price_overrides_exists;

-- 5. Check security_events table specifically
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_events') AS security_events_exists;

-- 6. Check approval_requests table specifically
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'approval_requests') AS approval_requests_exists;

-- 7. Check operation_logs new columns
SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'operation_logs' AND column_name IN ('entity_type', 'entity_id', 'amount', 'metadata') ORDER BY column_name;

-- 8. Check staff.role_id column exists
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'role_id') AS staff_role_id_exists;

-- 9. Check staff.role column exists (should be FALSE after M10)
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'role') AS staff_role_exists;

-- 10. Check staff.pin_hash column exists
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'pin_hash') AS staff_pin_hash_exists;
