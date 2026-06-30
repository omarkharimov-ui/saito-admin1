-- =====================================================
-- P6: PRODUCTION FIXES — Missing Tables & Columns
-- =====================================================
-- Run this in Supabase Dashboard → SQL Editor.

-- 1. TABLE_FLOORS — Full create in case it's missing
CREATE TABLE IF NOT EXISTS table_floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_number INTEGER NOT NULL,
    floor_name TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'empty',
    capacity INTEGER DEFAULT 4,
    x_pos NUMERIC,
    y_pos NUMERIC,
    shape TEXT DEFAULT 'circle',
    width NUMERIC,
    height NUMERIC,
    reservation_id UUID,
    reservation_name TEXT,
    reservation_phone TEXT,
    reservation_time TEXT,
    guest_count INTEGER DEFAULT 0,
    merged_into_table INTEGER,
    last_activity_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABLE_FLOORS — Add columns if table already exists
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS floor_name TEXT;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS x_pos NUMERIC;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS y_pos NUMERIC;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS shape TEXT DEFAULT 'circle';
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS width NUMERIC;
ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS height NUMERIC;

-- 3. SETTINGS — Add columns used by code
ALTER TABLE settings ADD COLUMN IF NOT EXISTS qr_table_count INTEGER DEFAULT 12;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS opening_hours TEXT DEFAULT '10:00-22:00';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Baku';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS morning_greeting_enabled BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS revenue_limit NUMERIC(10,2);

-- 4. SESSIONS — Table for PIN-based auth tokens
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- =====================================================
-- INDEXES for table_floors
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_table_floors_floor ON table_floors (floor_name);
CREATE INDEX IF NOT EXISTS idx_table_floors_number ON table_floors (table_number);
CREATE INDEX IF NOT EXISTS idx_table_floors_status ON table_floors (status);

-- =====================================================
-- Row-Level Security (RLS) for new tables
-- =====================================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access to sessions
DROP POLICY IF EXISTS "Service role manages sessions" ON sessions;
CREATE POLICY "Service role manages sessions" ON sessions
    USING (true)
    WITH CHECK (true);
