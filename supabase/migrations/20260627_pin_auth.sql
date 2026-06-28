-- Add pin column to admin_users (4-digit unique PIN, nullable for migration)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS pin TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_admin_users_pin ON admin_users(pin);

-- Sessions table for token-based auth
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
