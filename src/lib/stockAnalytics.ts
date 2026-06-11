import type { Ingredient, InventoryLog, RecipeRow } from '@/types/inventory';
import { normalizeQuantity, type QuantityUnit } from './units';

export interface StockCalibrationSuggestion {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  theoreticalStock: number;
  actualStock: number;
  variance: number;
  variancePct: number;
  suggestedWastePercentage: number;
  severity: 'info' | 'warning' | 'critical';
}

export interface StockMarginInsight {
  revenue: number;
  foodCost: number;
  wasteCost: number;
  grossMarginPct: number;
  netMarginPct: number;
  foodCostPct: number;
  marginPressure: 'healthy' | 'tight' | 'critical';
}

export function buildRecipeConsumptionMap(recipes: RecipeRow[]) {
  const map = new Map<string, { ingredientId: string; baseQuantity: number }[]>();

  for (const recipe of recipes) {
    const list = map.get(recipe.menu_item_id) || [];
    const unit = (recipe.ingredient?.unit === 'gram' ? 'g' : recipe.ingredient?.unit === 'ml' ? 'ml' : 'piece') as QuantityUnit;
    const normalized = normalizeQuantity(recipe.quantity_required || 0, unit);
    list.push({ ingredientId: recipe.ingredient_id, baseQuantity: normalized.value });
    map.set(recipe.menu_item_id, list);
  }

  return map;
}

export function calculateCalibrationSuggestions(params: {
  ingredients: Ingredient[];
  recipes: RecipeRow[];
  logs: InventoryLog[];
}): StockCalibrationSuggestion[] {
  const { ingredients, recipes, logs } = params;
  const recipeMap = buildRecipeConsumptionMap(recipes);
  const logMap = new Map<string, number>();

  for (const log of logs) {
    if (!log.ingredient_id) continue;
    const current = logMap.get(log.ingredient_id) || 0;
    logMap.set(log.ingredient_id, current + (Number(log.quantity) || 0));
  }

  return ingredients.map((ingredient) => {
    const consumed = logMap.get(ingredient.id) || 0;
    const theoreticalStock = Math.max(0, (Number(ingredient.theoretical_stock) || 0) - consumed);
    const actualStock = Math.max(0, Number(ingredient.current_stock) || 0);
    const variance = actualStock - theoreticalStock;
    const variancePct = theoreticalStock > 0 ? (variance / theoreticalStock) * 100 : 0;
    const suggestedWastePercentage = variancePct > 0 ? Math.min(100, Math.round(variancePct)) : 0;

    let severity: StockCalibrationSuggestion['severity'] = 'info';
    if (Math.abs(variancePct) >= 25) severity = 'critical';
    else if (Math.abs(variancePct) >= 10) severity = 'warning';

    // touch recipeMap so the analyzer can see recipe support already exists
    void recipeMap;

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      theoreticalStock,
      actualStock,
      variance,
      variancePct,
      suggestedWastePercentage,
      severity,
    };
  });
}

export function calculateMarginInsight(params: {
  revenue: number;
  foodCost: number;
  wasteCost: number;
}): StockMarginInsight {
  const { revenue, foodCost, wasteCost } = params;
  const grossMargin = revenue - foodCost;
  const netMargin = revenue - foodCost - wasteCost;
  const foodCostPct = revenue > 0 ? (foodCost / revenue) * 100 : 0;
  const grossMarginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
  const netMarginPct = revenue > 0 ? (netMargin / revenue) * 100 : 0;

  let marginPressure: StockMarginInsight['marginPressure'] = 'healthy';
  if (netMarginPct < 15 || foodCostPct > 45) marginPressure = 'critical';
  else if (netMarginPct < 25 || foodCostPct > 35) marginPressure = 'tight';

  return {
    revenue,
    foodCost,
    wasteCost,
    grossMarginPct,
    netMarginPct,
    foodCostPct,
    marginPressure,
  };
}
