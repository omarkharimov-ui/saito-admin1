-- ============================================================
-- CLEANUP: 9 boş və istifadə olunmayan cədvəllər
-- ============================================================
DROP TABLE IF EXISTS goods_receipt_lines CASCADE;
DROP TABLE IF EXISTS invoice_line_mappings CASCADE;
DROP TABLE IF EXISTS order_item_modifiers CASCADE;
DROP TABLE IF EXISTS procurement_anomalies CASCADE;
DROP TABLE IF EXISTS product_recommendations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS reorder_suggestions CASCADE;
DROP TABLE IF EXISTS supplier_invoice_lines CASCADE;
DROP TABLE IF EXISTS supplier_metrics CASCADE;

-- ============================================================
-- PIN AUTH: admin_users yenilə
-- ============================================================
-- 1. password_hash sütununu sil (artıq Supabase Auth istifadə olunmur)
ALTER TABLE admin_users DROP COLUMN IF EXISTS password_hash;

-- 2. pin sütununu əlavə et (4 rəqəmli unikal PIN)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS pin TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_admin_users_pin ON admin_users(pin);

-- 3. email-i nullable et (indiki adminlərin emaili qalsın, yeni user-lər PIN-lə girəcək)
-- email qalsın optional olaraq, məcbur deyil
ALTER TABLE admin_users ALTER COLUMN email DROP NOT NULL;

-- ============================================================
-- SESSIONS: token əsaslı session cədvəli
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- QEYD: clock_events kodda istifadə olunur — saxlanılır
-- ============================================================
