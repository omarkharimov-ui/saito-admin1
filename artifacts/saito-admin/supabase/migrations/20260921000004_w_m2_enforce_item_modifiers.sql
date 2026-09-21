-- 20260921000004 — QF2 P2: server-side modifier enforcement on order_items
--
-- EVIDENCE (audit 2026-09-21):
--   * The modifier model exists (product_modifiers + modifier_groups
--     [is_required, min_select, max_select, sort_order, is_active] +
--     modifier_group_items + product_modifier_groups, all FK-cascaded).
--   * order_items.modifiers is already an immutable snapshot:
--     [{"id","name","price","quantity"}] — price captured at order time.
--   * BUT nothing server-side validates the snapshot: a client can send an
--     unavailable modifier, a foreign product's modifier, a duplicate row,
--     more selections than max_select, skip a required group, or a wrong price.
--   * This trigger makes the contract DB-enforced (bypass-proof for every
--     API path: create, add-items, edit, reopen, import).
--
-- SEMANTICS (documented contract):
--   * max_select  = max number of DISTINCT selected rows for the group
--                   (not the sum of quantities). "Əlavələr max 5" = up to 5
--                   different add-ons.
--   * per-row quantity is the multiplier ("Losos ×2") — must be >= 1.
--   * duplicates of the same modifier id in one row set are rejected —
--     the canonical form is a single row with quantity N.
--   * required = is_required OR min_select > 0; the minimum is
--     GREATEST(min_select, is_required ? 1 : 0).
--   * price must equal the live catalog price on INSERT (snapshot integrity);
--     on UPDATE the price is NOT re-checked (legitimate orders created before
--     a catalog price change must remain editable) — only membership,
--     availability, quantity and group rules are re-validated.
--   * modifier ids absent from the catalog (pre-group legacy rows without id)
--     are ignored by group math but must be well-formed.
CREATE OR REPLACE FUNCTION public.enforce_item_modifiers()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mods jsonb;
  v_mod  jsonb;
  v_ids  jsonb := '[]';
  v_id   text;
  v_qty  numeric;
  v_pm   record;
  v_groups record;
  v_selected int;
  v_min  int;
BEGIN
  IF NEW.modifiers IS NULL THEN
    NEW.modifiers := '[]'::jsonb;
  END IF;
  v_mods := NEW.modifiers;
  IF jsonb_typeof(v_mods) <> 'array' THEN
    RAISE EXCEPTION 'MODIFIERS_MALFORMED: modifiers must be a JSON array' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Row-level rules: id, availability, ownership, duplicates, quantity.
  FOR v_mod IN SELECT * FROM jsonb_array_elements(v_mods)
  LOOP
    IF jsonb_typeof(v_mod) <> 'object' THEN
      RAISE EXCEPTION 'MODIFIERS_MALFORMED: each modifier must be an object' USING ERRCODE = 'P0001';
    END IF;
    v_id  := v_mod->>'id';
    v_qty := (v_mod->>'quantity')::numeric;

    IF v_qty IS NULL OR v_qty < 1 OR v_qty <> floor(v_qty) THEN
      RAISE EXCEPTION 'MODIFIER_BAD_QUANTITY: quantity must be a positive integer' USING ERRCODE = 'P0001';
    END IF;

    IF v_id IS NOT NULL THEN
      -- Duplicate: canonical form is one row with quantity N.
      IF v_ids ? v_id THEN
        RAISE EXCEPTION 'MODIFIER_DUPLICATE: modifier % listed twice — merge into one row with quantity', v_id USING ERRCODE = 'P0001';
      END IF;
      v_ids := v_ids || to_jsonb(v_id);

      SELECT pm.id, pm.product_id, pm.is_available, pm.price
        INTO v_pm
        FROM public.product_modifiers pm
       WHERE pm.id = v_id::uuid;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'MODIFIER_NOT_FOUND: unknown modifier id %', v_id USING ERRCODE = 'P0001';
      END IF;
      IF v_pm.product_id <> NEW.product_id THEN
        RAISE EXCEPTION 'MODIFIER_PRODUCT_MISMATCH: modifier % does not belong to product %', v_id, NEW.product_id USING ERRCODE = 'P0001';
      END IF;
      IF NOT COALESCE(v_pm.is_available, true) THEN
        RAISE EXCEPTION 'MODIFIER_UNAVAILABLE: modifier % is not available', v_id USING ERRCODE = 'P0001';
      END IF;
      -- Snapshot integrity on creation only (see header semantics).
      IF TG_OP = 'INSERT' AND v_mod->>'price' IS NOT NULL THEN
        IF (v_mod->>'price')::numeric <> v_pm.price THEN
          RAISE EXCEPTION 'MODIFIER_PRICE_DRIFT: modifier % price % does not match catalog %',
            v_id, v_mod->>'price', v_pm.price USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 2) Group rules (per group linked to this product).
  FOR v_groups IN
    SELECT g.id, g.name, g.is_required, g.min_select, g.max_select
      FROM public.modifier_groups g
      JOIN public.product_modifier_groups pmg ON pmg.group_id = g.id
     WHERE pmg.product_id = NEW.product_id
       AND g.is_active
  LOOP
    v_selected := 0;
    FOR v_mod IN SELECT * FROM jsonb_array_elements(v_mods)
    LOOP
      v_id := v_mod->>'id';
      IF v_id IS NULL THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.modifier_group_items mgi
         WHERE mgi.group_id = v_groups.id
           AND mgi.modifier_id = v_id::uuid
      ) THEN
        v_selected := v_selected + 1;
      END IF;
    END LOOP;

    IF v_groups.max_select IS NOT NULL AND v_selected > v_groups.max_select THEN
      RAISE EXCEPTION 'MODIFIER_GROUP_MAX: group "%" allows at most % selections (got %)',
        v_groups.name, v_groups.max_select, v_selected USING ERRCODE = 'P0001';
    END IF;

    v_min := COALESCE(v_groups.min_select, 0);
    IF v_groups.is_required THEN
      v_min := GREATEST(v_min, 1);
    END IF;
    IF v_selected < v_min THEN
      RAISE EXCEPTION 'MODIFIER_GROUP_MIN: group "%" requires at least % selection(s) (got %)',
        v_groups.name, v_min, v_selected USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_item_modifiers ON public.order_items;
CREATE TRIGGER trg_enforce_item_modifiers
BEFORE INSERT OR UPDATE OF modifiers ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_item_modifiers();
