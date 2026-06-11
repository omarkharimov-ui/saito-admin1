import type { IngredientUnit, InventoryLogType, ProductCatalogItem, RecipeRow } from '@/types/inventory';
import { normalizeQuantity, type BaseQuantityUnit, type QuantityUnit } from './units';

export type InventoryProductKind = 'direct_stock_item' | 'recipe_based_item';

export interface InventoryProductProfile {
  kind: InventoryProductKind;
  isReadyProduct: boolean;
  hasActiveRecipe: boolean;
  directIngredientId: string | null;
}

export interface InventoryDeductionLogInput {
  ingredient_id: string;
  type: InventoryLogType;
  quantity: number;
  reason: string;
}

export interface InventoryDeductionPlan {
  logs: InventoryDeductionLogInput[];
}

const RECIPE_BASE_UNIT: Record<string, QuantityUnit> = {
  gram: 'g',
  g: 'g',
  kg: 'kg',
  milliliter: 'ml',
  millilitre: 'ml',
  ml: 'ml',
  liter: 'l',
  litre: 'l',
  l: 'l',
  piece: 'piece',
  pcs: 'pcs',
};

export function getInventoryProductProfile(product?: Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'> | null): InventoryProductProfile {
  const isReadyProduct = Boolean(product?.is_ready_product);
  const hasActiveRecipe = Boolean(product?.has_active_recipe);
  const directIngredientId = product?.direct_ingredient_id || null;

  return {
    kind: isReadyProduct && directIngredientId ? 'direct_stock_item' : 'recipe_based_item',
    isReadyProduct,
    hasActiveRecipe,
    directIngredientId,
  };
}

export function isDirectStockItem(product?: Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'> | null): boolean {
  return getInventoryProductProfile(product).kind === 'direct_stock_item';
}

export function isRecipeBasedItem(product?: Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'> | null): boolean {
  return getInventoryProductProfile(product).kind === 'recipe_based_item';
}

export function normalizeRecipeQuantity(quantity: number, unit: string): { value: number; unit: BaseQuantityUnit } {
  const normalizedUnit = normalizeInventoryUnit(unit);
  return normalizeQuantity(quantity, normalizedUnit);
}

export function normalizeRecipeUnit(unit: string): QuantityUnit {
  const safeUnit = unit?.toLowerCase().trim();
  return RECIPE_BASE_UNIT[safeUnit] || normalizeInventoryUnit(safeUnit);
}

export function normalizeInventoryUnit(unit: string): QuantityUnit {
  const safeUnit = unit?.toLowerCase().trim();

  if (safeUnit === 'mg' || safeUnit === 'g' || safeUnit === 'kg') return safeUnit;
  if (safeUnit === 'ml' || safeUnit === 'l') return safeUnit;
  if (safeUnit === 'pcs' || safeUnit === 'piece') return 'piece';

  return 'piece';
}

export function buildOrderConsumptionPlan(params: {
  items: Array<{
    quantity: number;
    product_id: string | null;
    products?: Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'> | Pick<ProductCatalogItem, 'has_active_recipe' | 'is_ready_product' | 'direct_ingredient_id'>[] | null;
  }>;
  recipes: RecipeRow[];
  orderId: string;
}): InventoryDeductionPlan {
  const { items, recipes, orderId } = params;
  const logs: InventoryDeductionLogInput[] = [];

  const recipeMap = new Map<string, RecipeRow[]>();
  for (const recipe of recipes) {
    const list = recipeMap.get(recipe.menu_item_id) || [];
    list.push(recipe);
    recipeMap.set(recipe.menu_item_id, list);
  }

  for (const item of items) {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    const profile = getInventoryProductProfile(product ?? null);
    const qty = Number(item.quantity) || 0;

    if (!item.product_id || qty <= 0) continue;

    if (profile.kind === 'direct_stock_item' && profile.directIngredientId) {
      logs.push({
        ingredient_id: profile.directIngredientId,
        type: 'order_consumption',
        quantity: qty,
        reason: `Hazır məhsul satışı — Sifariş #${orderId.slice(0, 8)}`,
      });
      continue;
    }

    const itemRecipes = recipeMap.get(item.product_id) || [];
    for (const rec of itemRecipes) {
      const rawQty = Number(rec.quantity_brutto ?? rec.quantity_required ?? 0);
      const normalized = normalizeRecipeQuantity(rawQty, rec.ingredient?.unit || 'g');
      logs.push({
        ingredient_id: rec.ingredient_id,
        type: 'order_consumption',
        quantity: normalized.value * qty,
        reason: `Reseptli satış — Sifariş #${orderId.slice(0, 8)}`,
      });
    }
  }

  return { logs };
}

export function calculateIngredientCost(quantity: number, unitCost: number): number {
  const safeQuantity = Number(quantity) || 0;
  const safeUnitCost = Number(unitCost) || 0;
  return safeQuantity * safeUnitCost;
}

export function getIngredientBaseUnit(unit: IngredientUnit): BaseQuantityUnit {
  if (unit === 'gram') return 'g';
  if (unit === 'ml') return 'ml';
  return 'piece';
}
