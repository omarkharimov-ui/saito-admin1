import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function svc() {
  return createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

type SupplierRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

type InvoiceRow = {
  id: string;
  supplier_id: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
  applied_at?: string | null;
};

type ReceiptRow = {
  id: string;
  supplier_id: string;
  supplier_invoice_id?: string | null;
  status?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
  received_at?: string | null;
};

type AnomalyRow = {
  id: string;
  supplier_id?: string | null;
  supplier_invoice_id?: string | null;
  goods_receipt_id?: string | null;
  ingredient_id?: string | null;
  anomaly_type: string;
  severity: string;
  status: string;
  title: string;
  description?: string | null;
  expected_value?: number | null;
  actual_value?: number | null;
  delta_value?: number | null;
  created_at?: string | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(later: Date, earlier: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 86400000);
}

function weightBySeverity(severity?: string | null) {
  switch ((severity || '').toLowerCase()) {
    case 'critical': return 3;
    case 'high': return 2;
    case 'medium': return 1;
    default: return 0.5;
  }
}

export async function buildProcurementIntelligence() {
  const supabase = svc();
  const now = new Date();

  const [suppliersRes, invoicesRes, receiptsRes, anomaliesRes, ingredientsRes, recipesRes, inventoryRes] = await Promise.all([
    supabase.from('suppliers').select('id, name, is_active, created_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('supplier_invoices').select('id, supplier_id, invoice_number, invoice_date, total_amount, status, created_at, applied_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('goods_receipts').select('id, supplier_id, supplier_invoice_id, status, total_amount, created_at, received_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('procurement_anomalies').select('id, supplier_id, supplier_invoice_id, goods_receipt_id, ingredient_id, anomaly_type, severity, status, title, description, expected_value, actual_value, delta_value, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('ingredients').select('id, name, unit, current_stock, theoretical_stock, critical_limit, average_cost_per_unit, purchase_price, cold_waste_percentage').order('name', { ascending: true }).limit(1000),
    supabase.from('recipes').select('menu_item_id, ingredient_id, quantity_required, quantity_brutto, hot_waste_percentage, is_ai_suggested'),
    supabase.from('inventory_status').select('*').limit(1000),
  ]);

  const externalError = suppliersRes.error || invoicesRes.error || receiptsRes.error || anomaliesRes.error || ingredientsRes.error || recipesRes.error || inventoryRes.error;
  if (externalError) {
    throw new Error(externalError.message || 'Failed to load procurement intelligence data');
  }

  const suppliers = (suppliersRes.data ?? []) as SupplierRow[];
  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const receipts = (receiptsRes.data ?? []) as ReceiptRow[];
  const anomalies = (anomaliesRes.data ?? []) as AnomalyRow[];
  const ingredients = (ingredientsRes.data ?? []) as Array<{ id: string; name: string; unit: string; current_stock: number; theoretical_stock: number; critical_limit: number; average_cost_per_unit: number; purchase_price: number; cold_waste_percentage: number }>;
  const recipes = recipesRes.data ?? [] as Array<{ menu_item_id: string; ingredient_id: string; quantity_required: number; quantity_brutto?: number | null; hot_waste_percentage?: number | null; is_ai_suggested?: boolean | null }>;
  const inventory = (inventoryRes.data ?? []) as Array<{ id: string; name: string; unit: string; current_stock: number; critical_limit: number; status?: string | null; stock_ratio?: number | null; monthly_waste_cost?: number | null }>;

  const recipesByIngredient = new Map<string, number>();
  for (const recipe of recipes) {
    const qty = Number(recipe.quantity_brutto ?? recipe.quantity_required ?? 0);
    recipesByIngredient.set(recipe.ingredient_id, (recipesByIngredient.get(recipe.ingredient_id) || 0) + qty);
  }

  const invoicesBySupplier = new Map<string, InvoiceRow[]>();
  for (const invoice of invoices) {
    if (!invoice.supplier_id) continue;
    const arr = invoicesBySupplier.get(invoice.supplier_id) ?? [];
    arr.push(invoice);
    invoicesBySupplier.set(invoice.supplier_id, arr);
  }

  const receiptsBySupplier = new Map<string, ReceiptRow[]>();
  for (const receipt of receipts) {
    if (!receipt.supplier_id) continue;
    const arr = receiptsBySupplier.get(receipt.supplier_id) ?? [];
    arr.push(receipt);
    receiptsBySupplier.set(receipt.supplier_id, arr);
  }

  const anomaliesBySupplier = new Map<string, AnomalyRow[]>();
  for (const anomaly of anomalies) {
    if (!anomaly.supplier_id) continue;
    const arr = anomaliesBySupplier.get(anomaly.supplier_id) ?? [];
    arr.push(anomaly);
    anomaliesBySupplier.set(anomaly.supplier_id, arr);
  }

  const supplierScores = suppliers.map((supplier) => {
    const supplierInvoices = invoicesBySupplier.get(supplier.id) ?? [];
    const supplierReceipts = receiptsBySupplier.get(supplier.id) ?? [];
    const supplierAnomalies = anomaliesBySupplier.get(supplier.id) ?? [];

    const invoiceCount = supplierInvoices.length;
    const receiptCount = supplierReceipts.length;
    const unresolvedCount = supplierAnomalies.filter(a => a.status === 'open' || a.status === 'reviewing').length;
    const duplicateCount = supplierAnomalies.filter(a => a.anomaly_type === 'duplicate_invoice').length;
    const criticalCount = supplierAnomalies.filter(a => a.severity === 'critical').length;

    const avgInvoiceAgeDays = supplierInvoices.length
      ? supplierInvoices
          .map(inv => daysBetween(now, parseDate(inv.created_at) || now))
          .reduce((sum, value) => sum + value, 0) / supplierInvoices.length
      : 0;

    const onTimeRate = clamp(100 - avgInvoiceAgeDays * 3);
    const accuracyRate = clamp(100 - unresolvedCount * 12 - duplicateCount * 18 - criticalCount * 25);
    const stabilityRate = clamp(100 - Math.min(45, supplierAnomalies.length * 7));

    const rawScore = (onTimeRate * 0.35) + (accuracyRate * 0.4) + (stabilityRate * 0.25);
    const score = round(rawScore, 1);

    const riskLevel = score >= 82 ? 'stable' : score >= 65 ? 'watch' : 'risk';
    const latestInvoice = supplierInvoices[0] ?? null;

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceCount,
      receiptCount,
      unresolvedCount,
      duplicateCount,
      criticalCount,
      onTimeRate: round(onTimeRate, 1),
      quantityAccuracyRate: round(accuracyRate, 1),
      priceStabilityRate: round(stabilityRate, 1),
      supplierScore: score,
      riskLevel,
      latestInvoiceNumber: latestInvoice?.invoice_number ?? null,
      latestInvoiceAmount: latestInvoice?.total_amount ?? null,
    };
  });

  const reorderSuggestions = ingredients
    .map((ingredient) => {
      const statusRow = inventory.find(item => item.id === ingredient.id);
      const currentStock = Number(statusRow?.current_stock ?? ingredient.current_stock ?? 0);
      const criticalLimit = Number(statusRow?.critical_limit ?? ingredient.critical_limit ?? 0);
      const recipeUse = recipesByIngredient.get(ingredient.id) ?? 0;
      const wastePressure = Number(ingredient.cold_waste_percentage ?? 0);
      const monthlyWasteCost = Number(statusRow?.monthly_waste_cost ?? 0);

      const stockGap = Math.max(0, criticalLimit - currentStock);
      const consumptionSignal = recipeUse > 0 ? recipeUse : Math.max(criticalLimit * 0.6, 1);
      const suggestedQuantity = round(Math.max(stockGap, consumptionSignal * 2.5), 3);

      const urgency = currentStock <= 0 ? 'critical' : currentStock < criticalLimit ? 'high' : stockGap > 0 ? 'medium' : 'low';
      const confidence = clamp(70 + (stockGap > 0 ? 10 : 0) + (recipeUse > 0 ? 8 : 0) - wastePressure * 0.2, 20, 96);

      if (suggestedQuantity <= 0) return null;

      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        currentStock: round(currentStock, 3),
        criticalLimit: round(criticalLimit, 3),
        suggestedQuantity,
        urgency,
        confidence: round(confidence, 1),
        monthlyWasteCost: round(monthlyWasteCost, 2),
        reason: currentStock <= 0
          ? 'Stok sıfırlanıb — dərhal sifariş lazımdır'
          : currentStock < criticalLimit
            ? 'Kritik limitin altındadır, replenishment tövsiyə olunur'
            : 'Resept tələbi və stok burn-u əsasında erkən replenishment tövsiyəsi',
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const urgencyRank = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
      return urgencyRank[a.urgency] - urgencyRank[b.urgency] || b.confidence - a.confidence;
    })
    .slice(0, 12);

  const anomalyHighlights = anomalies
    .map((item) => ({
      ...item,
      score: weightBySeverity(item.severity) + (item.status === 'open' ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const anomalyCountsByType = anomalies.reduce<Record<string, number>>((acc, item) => {
    acc[item.anomaly_type] = (acc[item.anomaly_type] ?? 0) + 1;
    return acc;
  }, {});

  const openInvoiceCount = invoices.filter((invoice) => invoice.status !== 'applied').length;
  const draftInvoiceCount = invoices.filter((invoice) => invoice.status === 'draft' || invoice.status === 'reviewing').length;
  const reviewRequiredInvoiceCount = invoices.filter((invoice) => invoice.status === 'reviewing').length;

  const recipeInsights = ingredients.map((ingredient) => {
    const recipeUsage = recipesByIngredient.get(ingredient.id) ?? 0;
    const stock = Number(ingredient.current_stock ?? 0);
    const criticalLimit = Number(ingredient.critical_limit ?? 0);
    const pressure = recipeUsage > 0 && stock > 0 ? recipeUsage / Math.max(stock, 1) : 0;
    const flag = pressure > 0.2 || stock < criticalLimit ? 'attention' : 'healthy';
    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      recipeUsage: round(recipeUsage, 3),
      currentStock: round(stock, 3),
      pressure: round(pressure, 4),
      flag,
      suggestion: stock < criticalLimit
        ? 'Recipe risk yüksəkdir — replenishment lazımdır'
        : pressure > 0.2
          ? 'Recipe burn yüksəkdir — portions/yield yoxlanılsın'
          : 'Recipe coverage stabildir',
    };
  }).filter((item) => item.recipeUsage > 0 || item.flag !== 'healthy')
    .sort((a, b) => b.pressure - a.pressure)
    .slice(0, 12);

  const statusSummary = {
    supplierCount: suppliers.length,
    activeSuppliers: suppliers.filter(s => s.is_active !== false).length,
    invoiceCount: invoices.length,
    openInvoiceCount,
    draftInvoiceCount,
    reviewRequiredInvoiceCount,
    receiptCount: receipts.length,
    openAnomalies: anomalies.filter(a => a.status === 'open' || a.status === 'reviewing').length,
    criticalAnomalies: anomalies.filter(a => a.severity === 'critical').length,
    reorderSuggestions: reorderSuggestions.length,
    anomalyCountsByType,
  };

  return {
    statusSummary,
    supplierScores,
    anomalies: anomalyHighlights,
    reorderSuggestions,
    recipeInsights,
  };
}

export type ProcurementIntelligence = Awaited<ReturnType<typeof buildProcurementIntelligence>>;
