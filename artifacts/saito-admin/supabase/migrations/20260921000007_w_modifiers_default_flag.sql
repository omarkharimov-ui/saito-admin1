-- ============================================================================
-- 20260921000007_w_modifiers_default_flag.sql
-- Owner request (2026-09-21): "serving usulunda standart seçimi olmasında
-- mence" — in a max-1 (exclusive) modifier group the house-standard option
-- (e.g. "Standart") should be PRESELECTED when the product editor opens.
-- Adds product_modifiers.is_default (admin toggle); the POS editor
-- auto-selects the default member of an exclusive group (fallback: first
-- ₼0 member). No schema migration for existing rows needed — Standart is
-- flagged below for the live menu.
-- ============================================================================

ALTER TABLE public.product_modifiers
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_modifiers.is_default IS
  'When true inside a max-1 (exclusive) modifier group, the POS editor preselects this option (e.g. "Standart").';

-- Client writes (anon/authenticated) already covered by 20260921000005.
GRANT UPDATE ON public.product_modifiers TO anon, authenticated;

-- Live menu: flag the ₼0 "Standart" serving-style option on Filadelfiya.
UPDATE public.product_modifiers pm
SET is_default = true
WHERE pm.name = 'Standart'
  AND pm.price = 0
  AND EXISTS (
    SELECT 1 FROM modifier_group_items gi
    JOIN modifier_groups g ON g.id = gi.group_id
    JOIN product_modifier_groups pl ON pl.group_id = g.id
    WHERE gi.modifier_id = pm.id AND pl.product_id = pm.product_id
      AND g.max_select = 1
  );
