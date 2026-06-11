// ─── Inventory Management System — TypeScript Types ──────────────────────────

export type IngredientUnit = 'gram' | 'piece' | 'ml';

// Display units that normalize to storage units
export type DisplayUnit = IngredientUnit | 'kg' | 'liter';

export function normalizeUnit(value: number, from: DisplayUnit, to: IngredientUnit): number {
  const conversions: Record<string, Record<string, number>> = {
    kg: { gram: 1000 },
    liter: { ml: 1000 },
  };
  const factor = conversions[from]?.[to];
  return factor ? value * factor : value;
}

export function normalizeToStorage(value: number, unit: DisplayUnit): { value: number; unit: IngredientUnit } {
  if (unit === 'kg') return { value: value * 1000, unit: 'gram' };
  if (unit === 'liter') return { value: value * 1000, unit: 'ml' };
  return { value, unit: unit as IngredientUnit };
}

export function formatWithUnit(value: number, unit: IngredientUnit, target?: DisplayUnit): string {
  const t = target || unit;
  if (unit === 'gram' && t === 'kg') return `${(value / 1000).toFixed(3)} kg`;
  if (unit === 'ml' && t === 'liter') return `${(value / 1000).toFixed(3)} l`;
  return `${value.toFixed(unit === 'piece' ? 0 : 2)} ${unit}`;
}

// OCR/input text normalization
export function parseInputUnit(raw: string): DisplayUnit {
  const s = raw.trim().toLowerCase();
  if (/^k[gq]$/.test(s)) return 'kg';
  if (/^litr/i.test(s) || /^l\b/.test(s)) return 'liter';
  if (/^qram/i.test(s) || /^q\b/.test(s) || /^gr/.test(s)) return 'gram';
  if (/^ml\b/.test(s) || /^mililitr/i.test(s)) return 'ml';
  if (/^(piece|pcs|ədəd|adet)$/i.test(s)) return 'piece';
  return 'gram';
}

export function parseInputQuantity(raw: string): { value: number; unit: DisplayUnit } | null {
  const match = raw.match(/^([\d.,]+)\s*([a-zA-Zçəğıöşü]+)?$/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(',', '.'));
  if (isNaN(value)) return null;
  const unit = match[2] ? parseInputUnit(match[2]) : 'gram';
  return { value, unit };
}
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

export type { NormalizedRecipeSuggestion, NormalizedRecipeIngredient, RecipeSourceType, InventoryImportPayload, InventoryImportLine } from './recipes';

export type AiRecipeSuggestion = import('./recipes').NormalizedRecipeSuggestion;
export type CookbookRecipe = import('./recipes').NormalizedRecipeSuggestion;
