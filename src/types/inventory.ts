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
  supplier_id?: string;
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
  supplierId?: string;
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

// ─── Supplier ──────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  status: 'active' | 'inactive';
  score: number | null;
  total_orders: number;
  on_time_delivery_rate: number | null;
  avg_price_stability: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierPayload {
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  notes?: string;
}

// ─── Purchase Order ────────────────────────────────────────────────────────────

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  order_number: string;
  status: PurchaseOrderStatus;
  total_amount: number;
  notes: string | null;
  ordered_at: string;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  ingredient_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  received_quantity: number;
  created_at: string;
}

export interface CreatePurchaseOrderPayload {
  supplier_id: string;
  notes?: string;
  items: {
    ingredient_id?: string | null;
    product_name: string;
    quantity: number;
    unit: string;
    unit_cost: number;
  }[];
}

// ─── Invoice Reconciliation ────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'matched' | 'needs_review' | 'approved' | 'applied' | 'rejected' | 'rolled_back' | 'partially_applied';

export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['matched', 'needs_review'],
  matched: ['approved', 'applied'],
  needs_review: ['matched', 'rejected'],
  approved: ['applied', 'rolled_back'],
  applied: ['rolled_back'],
  rejected: ['draft'],
  rolled_back: ['draft'],
  partially_applied: ['rolled_back'],
};

export function canTransitionInvoice(from: InvoiceStatus, to: string): boolean {
  return INVOICE_STATUS_TRANSITIONS[from]?.includes(to as InvoiceStatus) ?? false;
}

export interface Invoice {
  id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number;
  tax_amount: number;
  currency: string;
  status: InvoiceStatus;
  notes: string | null;
  ocr_raw: unknown | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  purchase_order_item_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  matched: boolean;
  variance_quantity: number;
  variance_cost: number;
  created_at: string;
}

export interface CreateInvoicePayload {
  supplier_id: string;
  purchase_order_id?: string | null;
  invoice_number: string;
  invoice_date?: string | null;
  total_amount: number;
  tax_amount?: number;
  currency?: string;
  notes?: string | null;
  ocr_raw?: unknown | null;
  items: {
    product_name: string;
    quantity: number;
    unit: string;
    unit_cost: number;
    total_cost: number;
  }[];
}

export interface InvoiceReconciliation {
  invoice: Invoice;
  items: InvoiceItem[];
  summary: {
    total_variance: number;
    item_discrepancies: number;
    price_anomalies: {
      product_name: string;
      invoice_unit_cost: number;
      expected_unit_cost: number;
      variance_pct: number;
      severity: 'low' | 'medium' | 'high';
    }[];
    margin_impact: {
      product_name: string;
      cost_increase_pct: number;
      estimated_margin_impact_pct: number;
    }[];
  };
}

export interface PriceAnomaly {
  product_name: string;
  current_unit_cost: number;
  avg_unit_cost: number;
  min_unit_cost: number;
  max_unit_cost: number;
  variance_pct: number;
  occurrences: number;
  last_occurrence: string;
  severity: 'low' | 'medium' | 'high';
}

// ─── Stock Suggestions (Phase 3b) ─────────────────────────────────────────────

export interface StockSuggestion {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  current_stock: number;
  critical_limit: number;
  daily_consumption_rate: number;
  days_remaining: number;
  suggested_reorder_qty: number;
  reorder_point: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  consumption_trend: 'rising' | 'stable' | 'falling';
  avg_cost_per_unit: number;
  estimated_reorder_cost: number;
  lead_time_days: number;
}

export interface ConsumptionTrend {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  daily: { date: string; consumption: number }[];
  weekly_avg: number;
  monthly_avg: number;
  trend_pct: number;
}

// ─── Recipe Intelligence (Phase 3c) ────────────────────────────────────────────

export interface RecipeIntelligence {
  menu_item_id: string;
  product_name: string;
  total_servings: number;
  theoretical_cost_per_serving: number;
  actual_cost_per_serving: number;
  cost_variance_pct: number;
  theoretical_consumption: Record<string, number>;
  actual_consumption: Record<string, number>;
  waste_analysis: {
    ingredient_name: string;
    theoretical_qty: number;
    actual_qty: number;
    waste_qty: number;
    waste_pct: number;
  }[];
  margin_analysis: {
    selling_price: number;
    theoretical_cost: number;
    actual_cost: number;
    theoretical_margin_pct: number;
    actual_margin_pct: number;
  };
}

export interface DishMarginBreakdown {
  menu_item_id: string;
  product_name: string;
  selling_price: number;
  cost_price: number;
  margin_pct: number;
  profit_per_unit: number;
  monthly_units_sold: number;
  monthly_profit: number;
  cost_drivers: { ingredient_name: string; cost_pct: number }[];
  optimization_potential: 'high' | 'medium' | 'low';
}

// ─── Procurement / Receiving (Phase 4) ─────────────────────────────────────────

export interface ProcurementReview {
  id: string;
  purchase_order_id: string | null;
  invoice_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  suggested_ingredient_id: string | null;
  match_confidence: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'mapped';
  notes: string | null;
  created_at: string;
}

export interface DiscrepancyAlert {
  id: string;
  type: 'invoice_amount' | 'received_qty' | 'stock_vs_sales' | 'recipe_vs_actual' | 'supplier_price' | 'waste_vs_norm' | 'margin_drop';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string | null;
  source_id: string | null;
  source_table: string | null;
  value: number;
  expected_value: number;
  variance_pct: number;
  status: 'open' | 'acknowledged' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

export interface AIInsight {
  type: 'reorder' | 'trend' | 'supplier' | 'waste' | 'margin' | 'optimization';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action_url: string | null;
  created_at: string;
}
