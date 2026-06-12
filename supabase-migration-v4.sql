-- ═══════════════════════════════════════════════════════════════
-- Migration v4: Add merged_into_table to table_floors
-- Allows merge tracking even for empty tables
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE table_floors ADD COLUMN IF NOT EXISTS merged_into_table integer REFERENCES table_floors(table_number);

SELECT 'migration v4 completed' AS status;
