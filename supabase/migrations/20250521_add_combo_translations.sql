-- Add translation columns to combos table
ALTER TABLE combos
  ADD COLUMN IF NOT EXISTS name_az TEXT,
  ADD COLUMN IF NOT EXISTS name_en TEXT,
  ADD COLUMN IF NOT EXISTS name_ru TEXT,
  ADD COLUMN IF NOT EXISTS description_az TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_ru TEXT;

-- Backfill: copy existing `name` into all three languages for old combos
UPDATE combos SET
  name_az = COALESCE(NULLIF(name_az, ''), name),
  name_en = COALESCE(NULLIF(name_en, ''), name),
  name_ru = COALESCE(NULLIF(name_ru, ''), name),
  description_az = COALESCE(NULLIF(description_az, ''), description, ''),
  description_en = COALESCE(NULLIF(description_en, ''), description, ''),
  description_ru = COALESCE(NULLIF(description_ru, ''), description, '')
WHERE name_az IS NULL OR name_az = '';
