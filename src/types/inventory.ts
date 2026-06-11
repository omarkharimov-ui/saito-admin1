// ─── Inventory Management System — TypeScript Types ──────────────────────────

export type IngredientUnit = 'gram' | 'piece' | 'ml' | 'kg' | 'l' | 'pcs';
export type InventoryLogType = 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
export type InventoryStatus = 'normal' | 'critical' | 'out_of_stock';

// ── Raw DB rows ───────────────────────────────────────────────────────────────

export type ProductInventoryKind = 'direct_stock_item' | 'recipe_based_product';

export interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  current_stock: number;
  theoretical_stock: number;
  critical_limit: number;
  average_cost_per_unit: number;
  purchase_price: number;
  cold_waste_percentage: number;
  inventory_value?: number;
  moving_average_cost?: number;
  health_score?: number;
  discrepancy_qty?: number;
  discrepancy_value?: number;
  normalized_unit?: 'g' | 'ml' | 'pcs';
  updated_at: string;
}

export interface MeasurementUnit {
  unit: IngredientUnit;
  category: 'weight' | 'volume' | 'count';
  normalized_unit: 'g' | 'ml' | 'pcs';
  multiplier: number;
}

export interface InventoryMovementItem {
  ingredientId: string;
  quantity: number;
  unit: IngredientUnit;
  reason: string;
  sourceAction: string;
}

export interface InventoryAuditEntry {
  id: string;
  actor_name?: string | null;
  reason: string | null;
  source_action: string | null;
  created_at: string;
  payload?: Record<string, unknown> | null;
}

export interface Recipe {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_required: number;
  quantity_brutto?: number;
  hot_waste_percentage?: number;
  is_ai_suggested?: boolean;
  recipe_header_id?: string;
}

export interface RecipeHeader {
  id: string;
  menu_item_id: string;
  instructions: string;
  created_at: string;
}

export interface InventoryLog {
  id: string;
  ingredient_id: string;
  type: InventoryLogType;
  quantity: number;
  cost_per_unit: number | null;
  reason: string | null;
  order_id: string | null;
  created_at: string;
}

// ── View row (inventory_status VIEW) ─────────────────────────────────────────

export interface InventoryStatusRow extends Ingredient {
  status: InventoryStatus;
  stock_ratio: number;       // current_stock / critical_limit * 100
  monthly_waste_cost: number;
  inventory_value?: number;
  health_score?: number;
  discrepancy_qty?: number;
  discrepancy_value?: number;
}

// ── API payloads ──────────────────────────────────────────────────────────────

export interface AddStockInPayload {
  ingredientId: string;
  quantity: number;
  costPerUnit?: number;
  reason?: string;
}

export interface ReportWastePayload {
  ingredientId: string;
  quantity: number;
  reason: string;
}

export interface CreateIngredientPayload {
  name: string;
  unit: IngredientUnit;
  criticalLimit: number;
  averageCostPerUnit?: number;
  purchasePrice?: number;
  coldWastePercentage?: number;
}

export interface CreateRecipePayload {
  menuItemId: string;
  ingredientId: string;
  quantityRequired: number;
  quantityBrutto?: number;
  hotWastePercentage?: number;
}

// ── API responses ─────────────────────────────────────────────────────────────

export interface InventoryDashboardData {
  items: InventoryStatusRow[];
  stats: {
    total: number;
    critical: number;
    out_of_stock: number;
    monthly_waste_cost: number;
    inventory_value?: number;
    health_score?: number;
    discrepancy_count?: number;
    moving_average_cost?: number;
  };
}

export interface LowStockAlert {
  ingredientId: string;
  name: string;
  unit: IngredientUnit;
  current_stock: number;
  critical_limit: number;
  status: 'critical' | 'out_of_stock';
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  name_az?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
  image_url?: string | null;
  price: number;
  has_active_recipe?: boolean | null;
  is_ready_product?: boolean | null;
  direct_ingredient_id?: string | null;
  inventory_kind?: ProductInventoryKind | null;
  moving_average_cost?: number | null;
  gross_margin?: number | null;
  net_margin?: number | null;
  margin_alert?: boolean | null;
  inventory_value?: number | null;
  health_score?: number | null;
  discrepancy_value?: number | null;
}

export interface RecipeIngredientRow {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: number;
  quantity_brutto: number;
  hot_waste_percentage: number;
  cost: number;
}

export interface RecipeRow {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity_required: number;
  quantity_brutto?: number | null;
  hot_waste_percentage?: number | null;
  is_ai_suggested?: boolean | null;
  ingredient?: Ingredient;
}

export type { NormalizedRecipeSuggestion, NormalizedRecipeIngredient, RecipeSourceType, InventoryImportPayload, InventoryImportLine } from './recipes';

export type AiRecipeSuggestion = NormalizedRecipeSuggestion;
export type CookbookRecipe = NormalizedRecipeSuggestion;
