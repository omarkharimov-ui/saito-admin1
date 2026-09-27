-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-27 (owner: "stokda yoxdur real işləyirmi, stok yeniləndə
-- işləyəcəkmi?"): close the 86 cycle automatically.
--
-- BEFORE: products.is_in_stock had NO writers — a product could be 86'd
-- manually (chef) but (a) depletion never auto-86'd it and (b) restocking
-- never reactivated it. POS grid only updated on manual catalog refresh.
--
-- NOW (trigger on ingredients.current_stock — every stock RPC updates it):
--   stock <= 0  → products using that ingredient (direct or via active
--                 recipe BOM) get is_in_stock = false   (AUTO 86)
--   stock  > 0  → those auto-86'd products flip back to
--                 is_in_stock = true when ALL their ingredients are back
--                 (AUTO REACTIVATE)
--   The chef's manual 86 (is_available) is a SEPARATE flag and is never
--   touched — a manual 86 stays manual (POS already blocks on either flag).
--
-- products is already in the supabase_realtime publication (is_in_stock +
-- is_available listed) → the POS live-subscribes (usePos, same day).
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.sync_product_availability(p_ingredient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock numeric;
  v_recipe_id uuid;
  v_bom_in_low text[] := '{}';
begin
  select coalesce(current_stock, 0) into v_stock from ingredients where id = p_ingredient_id;
  if not found then return; end if;

  -- 1) DIRECT products (product.direct_ingredient_id)
  if v_stock <= 0 then
    update products set is_in_stock = false, updated_at = now()
    where direct_ingredient_id = p_ingredient_id and is_in_stock is not false;
  else
    update products set is_in_stock = true, updated_at = now()
    where direct_ingredient_id = p_ingredient_id and is_in_stock = false;
  end if;

  -- 2) RECIPE products: every product with an active recipe that consumes
  --    this ingredient. AUTO-86 when stock <= 0. REACTIVATE only when the
  --    whole BOM is back above zero (no partial reactivation).
  for v_recipe_id in
    select distinct r.product_id
    from recipes r
    join recipe_items ri on ri.recipe_id = r.id
    where ri.ingredient_id = p_ingredient_id
      and r.product_id is not null
      and r.is_active
  loop
    if v_stock <= 0 then
      update products set is_in_stock = false, updated_at = now()
      where id = v_recipe_id and is_in_stock is not false;
    else
      -- all BOM ingredients must be above zero before reactivating
      select array_agg(distinct b.ingredient_id::text)
      into v_bom_in_low
      from recipe_items b
      where b.recipe_id = v_recipe_id
        and (select coalesce(i.current_stock, 0) from ingredients i where i.id = b.ingredient_id) <= 0;
      if not (v_bom_in_low ? p_ingredient_id::text) and (select count(*) from unnest(v_bom_in_low) x) = 0 then
        update products set is_in_stock = true, updated_at = now()
        where id = v_recipe_id and is_in_stock = false;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.availability_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_product_availability(new.id);
  return new;
end;
$$;

create trigger trg_sync_product_availability
after update of current_stock on ingredients
for each row execute function public.availability_trigger_fn();

grant execute on function public.sync_product_availability(uuid) to service_role;
grant execute on function public.availability_trigger_fn() to service_role;
comment on function public.sync_product_availability(uuid) is
  'Auto 86 / auto-reactivate products on ingredient stock changes (2026-09-27).';
