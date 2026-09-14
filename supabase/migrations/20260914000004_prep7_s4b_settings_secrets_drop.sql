-- ═══════════════════════════════════════════════════════════════════════════════
-- S-4b (Pre-P7 cleanup, ratified 2026-09-14): drop the 8 plaintext-credential
-- columns from `settings` (single-row config table).
--
-- Reference scan (ratified step 1/6, done FIRST):
--   * 0 code references (artifacts/saito-admin/src): only i18n label strings in
--     locales (admin_password / superadmin_password display names) and a
--     documentation comment in settings-svc.ts.
--   * 0 UI render sites (no component reads these i18n keys).
--   * 0 DB references: no function/trigger/RPC body mentions any of the 8 columns.
--   * 0 route exposure: no route returns or writes them (S-2 pre-condition, re-verified).
--   * Email is sent via Supabase Auth (send-code → auth flow), NOT SMTP — the
--     smtp_* columns are dead.
--   * admin/superadmin/kitchen passwords: login is 4-digit PBKDF2 PIN (staff
--     table) since the A freeze; these settings columns are pre-freeze legacy.
--
-- Data preservation (ratified step 2): the 8 current values were copied to
-- artifacts/saito-admin/.env.local (gitignored, untracked) as
-- SETTINGS_LEGACY_* variables BEFORE the drop.
--
-- Scope: ONLY these 8 columns. No other settings column, table, or grant is
-- touched.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE settings
  DROP COLUMN IF EXISTS admin_password,
  DROP COLUMN IF EXISTS superadmin_password,
  DROP COLUMN IF EXISTS kitchen_password,
  DROP COLUMN IF EXISTS smtp_host,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS smtp_user,
  DROP COLUMN IF EXISTS smtp_pass,
  DROP COLUMN IF EXISTS smtp_from_name;
