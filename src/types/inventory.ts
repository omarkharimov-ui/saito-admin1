// ─── Inventory Management System — TypeScript Types ──────────────────────────

export type IngredientUnit = 'gram' | 'piece' | 'ml';
export type InventoryLogType = 'stock_in' | 'waste' | 'adjustment' | 'order_consumption';
export type InventoryStatus = 'normal' | 'critical' | 'out_of_stock';

// ── Raw DB rows ───────────────────────────────────────────────────────────────

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
  updated_at: string;
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

export interface AiRecipeSuggestion {
  product_id: string;
  product_name: string;
  total_sold: number;
  recipe: {
    ingredient_id: string;
    ingredient_name: string;
    quantity_required: number;
    unit: string;
  }[];
}

export interface CookbookRecipe {
  recipeName: string;
  suggestedProductId: string | null;
  suggestedProductName: string | null;
  confidence: number;
  ingredients: RecipeIngredientRow[];
  unmatchedIngredients: number;
}
