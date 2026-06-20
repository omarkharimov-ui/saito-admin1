\'use client\';

import { useState, useEffect, useCallback, useRef, useMemo } from \'react\';
import { useSearchParams, useRouter } from \'next/navigation\';
import { motion, AnimatePresence } from \'framer-motion\';
import {
  Package, Plus, TrendingDown, TrendingUp,
  X, Loader2, RefreshCw,
  ShieldAlert, Search,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Lightbulb, Calculator, Trash2,
  Sparkles, Layers3, ArrowUpRight, Database, BarChart3, Clock3, Filter,
} from \'lucide-react\';
import { toast } from \'@/lib/toast\';
import { useTheme } from \'@/lib/theme/ThemeContext\';
import {
  InventoryStatusRow, InventoryDashboardData,
  IngredientUnit, LowStockAlert,
  InventoryLog, DisplayUnit, normalizeToStorage, formatWithUnit, parseInputQuantity,
  Supplier,
} from \'@/types/inventory\';
import { getStatusMeta, StockStatusBar } from \'@/components/StockStatusBadge\';
import ProcurementTab from \'./components/ProcurementTab\';
import IntelligenceTabComponent from \'./components/IntelligenceTab\';
import { CalibrationSuggestionsPanel, CalibrationSuggestion } from \'./components/CalibrationSuggestionsPanel\';
import { InventoryHealthCard } from \'./components/InventoryHealthCard\'; // <-- IMPORT THE NEW COMPONENT
import { supabase } from \'@/lib/supabase\';
import { createRealtimeChannel, removeRealtimeChannel } from \'@/lib/realtime\';
import { PageTransition } from \'@/components/PageTransition\';
import { GlassCard } from \'@/components/GlassCard\';
import { InspectorPanel } from \'./components/InspectorPanel\';

// ... (rest of the file remains the same, only the render part will be changed)

// ─── Constants ────────────────────────────────────────────────────────────────
const UNITS: DisplayUnit[] = [\'gram\', \'piece\', \'ml\', \'kg\', \'liter\'];

const UNIT_LABELS: Record<DisplayUnit, string> = {
  gram: \'qram\', piece: \'ədəd\', ml: \'ml\',
  kg: \'kq\', liter: \'litr\',
};

const LOG_LABELS: Record<string, string> = {
  stock_in: \'Giriş\', waste: \'İtki\', adjustment: \'Tənzimləmə\', order_consumption: \'Sifariş\',
};
const LOG_COLORS: Record<string, string> = {
  stock_in: \'text-emerald-400\', waste: \'text-red-400\', adjustment: \'text-gold\', order_consumption: \'text-white/40\',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0) {
  return Number(n).toLocaleString(\'az-AZ\', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCost(n: number) {
  return Number(n).toLocaleString(\'az-AZ\', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Modal variants ────────────────────────────────────────────────────────────

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1,    y: 0, transition: { type: \'spring\' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryStrip() {
  return null;
}

function StockBar({ ratio, status }: { ratio: number; status: string }) {
  const pct = Math.min(Math.max(ratio, 0), 100);
  return <StockStatusBar status={status} pct={pct} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ModalMode = \'stock_in\' | \'waste\' | \'new_ingredient\' | \'edit_ingredient\' | \'audit\' | \'history\' | null;
interface ActiveModal { mode: ModalMode; row?: InventoryStatusRow }\

export default function StockPage() {
  const { lightMode } = useTheme();
  const [data, setData]       = useState<InventoryDashboardData & { alerts: LowStockAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<ActiveModal>({ mode: null });
  const [selectedRow, setSelectedRow] = useState<InventoryStatusRow | null>(null);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState(\'\');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter]   = useState<\'all\' | \'critical\' | \'out_of_stock\'>(\'all\');
  const [viewMode, setViewMode] = useState<\'stock\' | \'intelligence\' | \'history\'>(\'stock\');
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get(\'tab\');
  useEffect(() => {
    if (tabParam && [\'stock\', \'intelligence\', \'history\'].includes(tabParam)) {
      setViewMode(tabParam as typeof viewMode);
    }
  }, [tabParam]);
  const now = new Date();
  const [historyMonth, setHistoryMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, \'0\')}`);
  const [historyDay, setHistoryDay] = useState<string | null>(null);

  // Form fields
  const [qty, setQty]           = useState(\'\');
  const [cost, setCost]         = useState(\'\');
  const [reason, setReason]     = useState(\'\');
  const [newName, setNewName]   = useState(\'\');
  const [newUnit, setNewUnit]   = useState<DisplayUnit>(\'gram\');
  const [newLimit, setNewLimit] = useState(\'500\');
  const [newCost, setNewCost]   = useState(\'\');
  const [newTotalQty, setNewTotalQty] = useState(\'\');
  const [newTotalAmount, setNewTotalAmount] = useState(\'\');
  const [newWastePct, setNewWastePct] = useState(\'\');
  const [newSupplier, setNewSupplier] = useState(\'\');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [qsName, setQsName] = useState(\'\');
  const [qsPhone, setQsPhone] = useState(\'\');
  const [qsContact, setQsContact] = useState(\'\');
  const [editRow, setEditRow] = useState<InventoryStatusRow | null>(null);
  const [editQsName, setEditQsName] = useState(\'\');
  const [editQsPhone, setEditQsPhone] = useState(\'\');
  const [editQsContact, setEditQsContact] = useState(\'\');
  const [auditQty, setAuditQty] = useState(\'\');
  const [showWasteCalc, setShowWasteCalc] = useState(false);
  const [calcRaw, setCalcRaw] = useState(\'\');
  const [calcClean, setCalcClean] = useState(\'\');
  const [wasteStandards, setWasteStandards] = useState<any[]>([]);
  const [selectedLogsIngredient, setSelectedLogsIngredient] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [historyLogs, setHistoryLogs] = useState<InventoryLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allLogs, setAllLogs] = useState<InventoryLog[]>([]);
  const [allLogsLoading, setAllLogsLoading] = useState(false);

  // ── Calibration morph overlay ──────────────────────────────────────────
  const [morph, setMorph] = useState<{
    from: { left: number; top: number; width: number; height: number };
    to: { left: number; top: number; width: number; height: number };
    name: string;
  } | null>(null);

  const handleCalibrationApplyStart = (item: CalibrationSuggestion, el: HTMLElement) => {
    const from = el.getBoundingClientRect();
    const targetRow = document.getElementById(\'row-\' + item.ingredient_id);
    if (!targetRow) return;
    const to = targetRow.getBoundingClientRect();
    setMorph({ from, to, name: item.ingredient_name });
    setTimeout(() => {
      setMorph(null);
      targetRow.scrollIntoView({ behavior: \'smooth\', block: \'center\' });
    }, 500);
  };

  const handleCalibrationApplied = (item: CalibrationSuggestion) => {
    // Optimistic update — sync current_stock → theoretical_stock immediately
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(i =>
          i.id === item.ingredient_id
            ? { ...i, current_stock: item.theoretical_stock, theoretical_stock: item.theoretical_stock }
            : i
        ),
      };
    });
    // Background refresh (user doesn\'t notice)
    setTimeout(fetchData, 3000);
  };

  // Auto-calculated unit cost from total qty/amount
  const calculatedUnitCost = (() => {
    const q = parseFloat(newTotalQty);
    const a = parseFloat(newTotalAmount);
    if (q > 0 && a > 0) return a / q;
    return null;
  })();

  // Effective cost after waste %
  const effectiveUnitCost = (() => {
    const base = calculatedUnitCost ?? (newCost ? parseFloat(newCost) : 0);
    const wp = parseFloat(newWastePct) || 0;
    if (wp <= 0 || wp >= 100) return base;
    return base / (1 - wp / 100);
  })();

  const toastStyle = { background: \'#0f0f0f\', color: \'#fff\', border: \'1px solid rgba(212,175,55,0.2)\', borderRadius: \'12px\' };

  // Filter logs by search when in history view
  const monthlyLogs = useMemo(() => {
    return allLogs.filter((log) => {
      const d = new Date(log.created_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, \'0\')}`;\n      if (ym !== historyMonth) return false;
      if (historyDay) {
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, \'0\')}-${String(d.getDate()).padStart(2, \'0\')}`;\n        return ymd === historyDay;
      }
      return true;
    });
  }, [allLogs, historyMonth, historyDay]);

  const filteredLogs = useMemo(() => {
    const source = viewMode === \'history\' ? monthlyLogs : allLogs;
    if (!source.length) return [];
    if (!search.trim()) return source;
    const q = search.toLowerCase();
    const typeLabels: Record<string, string> = {
      stock_in: \'stoka giriş\',
      waste: \'itki\',
      adjustment: \'tənzimləmə\',
      order_consumption: \'sifariş sərfiyyatı\',
    };
    return source.filter((log) => {
      const name = ((log as any).ingredient?.name || log.ingredient_id || \'\').toLowerCase();
      const label = (typeLabels[log.type] || log.type || \'\').toLowerCase();
      const note = ((log as any).note || log.reason || \'\').toLowerCase();
      return name.includes(q) || label.includes(q) || note.includes(q);
    });
  }, [allLogs, monthlyLogs, search, viewMode]);

  const monthlySummary = useMemo(() => {
    let stockIn = 0, waste = 0, adjustment = 0, orderConsumption = 0;
    for (const log of monthlyLogs) {
      const q = Math.abs(Number(log.quantity) || 0);
      if (log.type === \'stock_in\') stockIn += q;
      else if (log.type === \'waste\') waste += q;
      else if (log.type === \'adjustment\') adjustment += q;
      else if (log.type === \'order_consumption\') orderConsumption += q;
    }
    return { stockIn, waste, adjustment, orderConsumption, total: monthlyLogs.length };
  }, [monthlyLogs]);

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
  const calibrationSuggestions = useMemo(() => {
    return (data?.items ?? [])
      .filter((item: any) => {
        const theoretical = Number(item.theoretical_stock) || 0;
        const actual = Number(item.current_stock) || 0;
        if (theoretical === 0) return false;
        const variancePct = Math.abs((actual - theoretical) / theoretical) * 100;
        return variancePct >= 10;
      })
      .map((item: any) => {
        const theoretical = Number(item.theoretical_stock) || 0;
        const actual = Number(item.current_stock) || 0;
        const variance = actual - theoretical;
        const variancePct = theoretical > 0 ? (variance / theoretical) * 100 : 0;
        const severity = Math.abs(variancePct) >= 25 ? \'critical\' : \'warning\';
        return {
          ingredient_id: item.id,
          ingredient_name: item.name,
          suggested_adjustment_pct: Math.abs(Math.round(variancePct * 10) / 10),
          confidence: Math.min(0.95, Math.max(0.35, Math.abs(variancePct) / 100)),
          reason: severity === \'critical\' ? \'Critical stock variance detected\' : \'Stock variance needs review\',
          actual_stock: actual,
          theoretical_stock: theoretical,
        };
      });
  }, [data?.items]);

  const monthPickerRef = useRef<HTMLDivElement>(null);

  // Close month picker on outside click
  useEffect(() => {
    if (!showMonthPicker) return;
    const handler = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener(\'mousedown\', handler);
    return () => document.removeEventListener(\'mousedown\', handler);
  }, [showMonthPicker]);

  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

  const AZ_MONTHS = [\'Yan\', \'Fev\', \'Mar\', \'Apr\', \'May\', \'İyn\', \'İyl\', \'Avq\', \'Sen\', \'Okt\', \'Noy\', \'Dek\'];

  useEffect(() => {
    const [y] = historyMonth.split(\'-\').map(Number);
    setPickerYear(y);
  }, [historyMonth]);

  const lastFetchTimeRef = useRef(0);

const fetchData = useCallback(async () => {
    lastFetchTimeRef.current = Date.now();
    setLoading(true);
    try {
        const invRes = await fetch('/api/inventory');
        if (invRes.ok) {
            setData(await invRes.json());
        } else {
            // Set data to a default empty state on failure
            setData({ items: [], stats: { total: 0, critical: 0, out_of_stock: 0, monthly_waste_cost: 0 }, alerts: [] });
            toast.error('Inventory data could not be loaded.', { style: toastStyle });
        }
    } catch (error) {
        console.error("Failed to fetch inventory:", error);
        setData({ items: [], stats: { total: 0, critical: 0, out_of_stock: 0, monthly_waste_cost: 0 }, alerts: [] });
        toast.error('An error occurred while fetching inventory.', { style: toastStyle });
    }

    try {
        const supRes = await fetch('/api/suppliers');
        if (supRes.ok) {
            setSuppliers(await supRes.json());
        } else {
            setSuppliers([]);
            toast.error('Supplier data could not be loaded.', { style: toastStyle });
        }
    } catch (error) {
        console.error("Failed to fetch suppliers:", error);
        setSuppliers([]);
        toast.error('An error occurred while fetching suppliers.', { style: toastStyle });
    }

    setLoading(false);
}, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscription — inventory_logs, ingredients, orders
  // Guard: skip if data was fetched within the last 1.5 s (avoids double-fire after manual save)
  useEffect(() => {
    const guard = () => { if (Date.now() - lastFetchTimeRef.current > 1500) fetchData(); };
    const channel = createRealtimeChannel(\'stock-page\')
      .on(\'postgres_changes\', { event: \'*\', schema: \'public\', table: \'inventory_logs\' }, guard)
      .on(\'postgres_changes\', { event: \'*\', schema: \'public\', table: \'ingredients\' }, guard)
      .on(\'postgres_changes\', { event: \'INSERT\', schema: \'public\', table: \'orders\' }, guard)
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, [fetchData]);



  // Waste standards - əvvəlcə cached datanı çək
  useEffect(() => {
    fetch(\'/api/inventory/waste-standards\').then(r => r.ok && r.json()).then(d => { if (d) setWasteStandards(d); }).catch(() => {});
  }, []);

  // AI lookup debounce — istifadəçi yazmağı dayandırandan 800ms sonra AI soruş
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupWasteStandard = useCallback((name: string) => {
    if (!name.trim()) return;
    const lower = name.toLowerCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const cached = wasteStandards.find((s: any) => s.keyword && lower.includes(s.keyword.toLowerCase()));
      if (cached) return;
      try {
        const res = await fetch(`/api/inventory/waste-standards?q=${encodeURIComponent(lower)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            setWasteStandards(prev => {
              const exists = prev.find(s => s.keyword === data[0].keyword);
              if (exists) return prev;
              return [...prev, data[0]];
            });
          }
        }
      } catch {}\n    }, 800);
  }, [wasteStandards]);

  // ── View History ─────────────────────────────────────────────────────────
  const handleViewHistory = async (row: InventoryStatusRow) => {
    setModal({ mode: \'history\', row });
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/inventory/logs?ingredientId=${row.id}&limit=100`);
      setHistoryLogs(res.ok ? await res.json() : []);
    } catch { setHistoryLogs([]); }
    finally { setHistoryLoading(false); }
  };

  // ── All History (page view) ─────────────────────────────────────────────
  const fetchAllLogs = useCallback(async () => {
    setAllLogsLoading(true);
    try {
      const res = await fetch(\'/api/inventory/logs?limit=200\');
      setAllLogs(res.ok ? await res.json() : []);
    } catch { setAllLogs([]); }
    finally { setAllLogsLoading(false); }
  }, []);

  useEffect(() => { if (viewMode === \'history\') fetchAllLogs(); }, [viewMode, fetchAllLogs]);

  const closeModal = () => {
    setModal({ mode: null });
    setQty(\'\'); setCost(\'\'); setReason(\'\');
    setNewName(\'\'); setNewUnit(\'gram\'); setNewLimit(\'500\'); setNewCost(\'\');
    setNewTotalQty(\'\'); setNewTotalAmount(\'\'); setNewWastePct(\'\'); setNewSupplier(\'\');
    setAuditQty(\'\'); setShowWasteCalc(false); setCalcRaw(\'\'); setCalcClean(\'\');
    setFormErrors({});
    setEditRow(null); setEditQsName(\'\'); setEditQsPhone(\'\'); setEditQsContact(\'\');
  };

  // ── Stock In ────────────────────────────────────────────────────────────
  const handleStockIn = async () => {
    if (!modal.row || !qty.trim()) return;
    const numQty = parseFloat(qty);
    if (isNaN(numQty) || numQty <= 0) { toast.error(\'Düzgün miqdar daxil edin\', { style: toastStyle }); return; }
    setSaving(true);
    try {
      const res = await fetch(\'/api/inventory/logs\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({
          type: \'stock_in\',
          ingredientId: modal.row.id,
          quantity: numQty,
          costPerUnit: cost ? parseFloat(cost) : undefined,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`${modal.row.name} — stok əlavə edildi`, { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || \'Xəta baş verdi\', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Report Waste ────────────────────────────────────────────────────────
  const handleWaste = async () => {
    if (!modal.row || !qty.trim() || !reason.trim()) {
      toast.error(\'Miqdar və səbəb daxil edin\', { style: toastStyle }); return;
    }
    const numQty = parseFloat(qty);
    if (isNaN(numQty) || numQty <= 0) { toast.error(\'Düzgün miqdar daxil edin\', { style: toastStyle }); return; }
    setSaving(true);
    try {
      const res = await fetch(\'/api/inventory/logs\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({ type: \'waste\', ingredientId: modal.row.id, quantity: numQty, reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`${modal.row.name} — itki qeyd edildi`, { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || \'Xəta baş verdi\', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Stock Audit ─────────────────────────────────────────────────────────
  const handleAudit = async () => {
    if (!modal.row || !auditQty.trim()) return;
    const numQty = parseFloat(auditQty);
    if (isNaN(numQty) || numQty < 0) { toast.error(\'Düzgün miqdar daxil edin\', { style: toastStyle }); return; }
    setSaving(true);
    try {
      const res = await fetch(\'/api/inventory/audit\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({ ingredientId: modal.row.id, actualQty: numQty }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const result = await res.json();
      const diffSign = result.difference >= 0 ? \'+\' : \'\';
      toast.success(
        `${modal.row.name} — inventarizasiya tamamlandı · fərq: ${diffSign}${Number(result.difference).toFixed(2)} ₼${Number(result.adjustment_cost).toFixed(2)}`,
        { style: toastStyle, duration: 4000 }
      );
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || \'Xəta baş verdi\', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── New Ingredient ──────────────────────────────────────────────────────
  const handleNewIngredient = async () => {
    const errors: Record<string, boolean> = {};
    if (!newName.trim()) errors.name = true;
    if (!newLimit.trim()) errors.criticalLimit = true;
    if (!newTotalQty.trim()) errors.totalQty = true;
    if (!newTotalAmount.trim()) errors.totalAmount = true;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error(\'Zəhmət olmasa tələb olunan sahələri doldurun\', { style: toastStyle });
      return;
    }
    setSaving(true);
    try {
      const unitCost = calculatedUnitCost ?? (newCost ? parseFloat(newCost) : 0);
      const effectiveCost = effectiveUnitCost || unitCost;
      const { value: normQty, unit: normUnit } = normalizeToStorage(parseFloat(newTotalQty) || 0, newUnit);

      // Create or find supplier
      let supplierId = newSupplier;
      if (qsName.trim()) {
        const existing = suppliers.find(s => s.name.toLowerCase() === qsName.trim().toLowerCase());
        if (existing) {
          supplierId = existing.id;
        } else {
          const supRes = await fetch(\'/api/suppliers\', {
            method: \'POST\',
            headers: { \'Content-Type\': \'application/json\' },
            body: JSON.stringify({ name: qsName.trim(), phone: qsPhone.trim() || undefined, contact_person: qsContact.trim() || undefined }),
          });
          if (supRes.ok) {
            const created = await supRes.json();
            supplierId = created.id;
            setSuppliers(prev => [...prev, created]);
          }
        }
      }
      if (!supplierId) {
        toast.error(\'Tədarükçü adı daxil edin\', { style: toastStyle });
        setSaving(false);
        return;
      }

      const res = await fetch(\'/api/inventory\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({
          name: newName.trim(), unit: normUnit,
          criticalLimit: normalizeToStorage(parseFloat(newLimit) || 0, newUnit).value,
          averageCostPerUnit: effectiveCost,
          purchasePrice: unitCost,
          coldWastePercentage: parseFloat(newWastePct) || 0,
          supplierId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const created = await res.json();

      // Əgər ilkin miqdar daxil edilibsə, avtomatik stock_in et (normallaşdırılmış vahiddə)
      if (normQty > 0) {
        const logRes = await fetch(\'/api/inventory/logs\', {
          method: \'POST\',
          headers: { \'Content-Type\': \'application/json\' },
          body: JSON.stringify({
            type: \'stock_in\',
            ingredientId: created.id,
            quantity: normQty,
            costPerUnit: unitCost > 0 ? unitCost : undefined,
            reason: \'İlkin qeydiyyat — \' + newName.trim(),
          }),
        });
        if (!logRes.ok) {
          const errText = await logRes.text();
          toast.error(\'Xammal yaradıldı, amma stoka əlavə edilə bilmədi: \' + errText, { style: toastStyle });
        }
      }

      toast.success(\'İnqredient əlavə edildi\', { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || \'Xəta baş verdi\', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Update Ingredient ──────────────────────────────────────────────────────────
  const [updateSaving, setUpdateSaving] = useState(false);
  const [deletingIngredient, setDeletingIngredient] = useState(false);

  const handleDeleteIngredient = async () => {
    if (!editRow) return;
    if (!window.confirm(`\"${editRow.name}\" xammalını silmək istədiyinizə əminsiniz?`)) return;
    setDeletingIngredient(true);
    try {
      const res = await fetch(`/api/inventory/${editRow.id}`, { method: \'DELETE\' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${editRow.name} silindi`, { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || \'Silinə bilmədi\', { style: toastStyle });
    } finally {
      setDeletingIngredient(false);
    }
  };
  const handleUpdateIngredient = async () => {
    if (!editRow) return;
    if (!newName.trim()) { toast.error(\'Ad tələb olunur\', { style: toastStyle }); return; }
    if (!newLimit.trim()) { toast.error(\'Kritik limit tələb olunur\', { style: toastStyle }); return; }
    setUpdateSaving(true);
    try {
      let supplierId = editRow.supplier_id;
      if (editQsName.trim()) {
        const existing = suppliers.find(s => s.name.toLowerCase() === editQsName.trim().toLowerCase());
        if (existing) {
          supplierId = existing.id;
        } else {
          const supRes = await fetch(\'/api/suppliers\', {
            method: \'POST\',
            headers: { \'Content-Type\': \'application/json\' },
            body: JSON.stringify({ name: editQsName.trim(), phone: editQsPhone.trim() || undefined, contact_person: editQsContact.trim() || undefined }),
          });
          if (supRes.ok) {
            const created = await supRes.json();
            supplierId = created.id;
            setSuppliers(prev => [...prev, created]);
          }
        }
      }
      const { value: normLimit } = normalizeToStorage(parseFloat(newLimit) || 0, newUnit);
      const body: Record<string, any> = {
        name: newName.trim(),
        unit: newUnit,
        critical_limit: normLimit,
        cold_waste_percentage: parseFloat(newWastePct) || 0,
      };
      if (supplierId) body.supplier_id = supplierId;

      const res = await fetch(`/api/inventory/${editRow.id}`, {\n        method: \'PATCH\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(\'Yeniləndi\', { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || \'Xəta baş verdi\', { style: toastStyle });
    } finally {
      setUpdateSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (row: InventoryStatusRow) => {
    if (!window.confirm(`${row.name} — bu xammalı silmək istədiyinizə əminsiniz?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory?id=${row.id}`, { method: \'DELETE\' });
      if (!res.ok) throw new Error((await res.json()).error || \'Silinə bilmədi\');
      toast.success(`${row.name} silindi`, { style: toastStyle });
      setSelectedRow(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered rows ────────────────────────────────────────────────────────
  const rows = (data?.items ?? []).filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === \'all\' || r.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = useMemo(() => {
    if (!data?.stats) return undefined;
    const { total, critical, out_of_stock } = data.stats;
    const normal = Math.max(0, total - critical - out_of_stock);
    return { ...data.stats, normal };
  }, [data?.stats]);

  const heroMetrics = [
    {
      label: \'Ümumi xammal\',
      value: loading ? \'—\' : fmt(stats?.total ?? 0),
      icon: Database,
      note: \'Aktiv məhsul bazası\',
    },
    {
      label: \'Kritik risk\',
      value: loading ? \'—\' : fmt((stats?.critical ?? 0) + (stats?.out_of_stock ?? 0)),
      icon: ShieldAlert,
      note: \'Diqqət tələb edənlər\',
    },
    {
      label: \'Ağır itki\',
      value: loading ? \'—\' : `₼${fmtCost(stats?.monthly_waste_cost ?? 0)}`,
      icon: TrendingDown,
      note: \'Aylıq israf xərci\',
    },
  ];

  const [expandedHeroCard, setExpandedHeroCard] = useState<number | null>(null);
  const expandedHeroMetric = expandedHeroCard != null ? heroMetrics[expandedHeroCard] : null;

  return (
    <PageTransition className=\"min-h-screen bg-[#070707] text-white pb-24\">
      <div className=\"absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_42%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_30%)] pointer-events-none\" />
      <div className=\"max-w-none mx-auto px-4 sm:px-6 pt-6 sm:pt-10 relative\">
        <div className=\"space-y-6 min-w-0\">\n          <section className=\"relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-white/[0.03] px-6 py-6 sm:px-8 sm:py-8 backdrop-blur-2xl shadow-[0_30px_120px_rgba(0,0,0,0.28)]\">\n              <div className=\"absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_36%,transparent_64%,rgba(212,175,55,0.08))]\" />\n              <div className=\"relative flex flex-col gap-6\">\n                <div className=\"flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between\">\n                    <div className=\"max-w-2xl space-y-5\">\n                        <div className=\"inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.22em] text-white/55 uppercase\">\n                            <Sparkles size={12} className=\"text-[#D4AF37]\" />
                            Premium inventory control
                        </div>
                        <div className=\"space-y-3\">\n                            <h1 className=\"text-4xl sm:text-5xl font-semibold tracking-[-0.06em] leading-[0.95] text-white/95\">Stok</h1>
                            <p className=\"max-w-xl text-sm sm:text-base leading-6 text-white/46\">\n                            İnqredientlərin canlı vəziyyəti, kritik risklər və hərəkət tarixçəsi üçün sakit, premium iş səthi.
                            </p>
                        </div>
                    </div>
                    <div className=\"flex flex-wrap gap-3\">\n                        <button
                            onClick={() => setModal({ mode: \'new_ingredient\' })}
                            className=\"inline-flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white text-black px-5 py-3 text-sm font-semibold tracking-[-0.01em] transition-transform active:scale-[0.98]\"\n                        >\n                            <Plus size={16} /> Yeni Xammal
                        </button>
                    </div>
                </div>

                {/* <-- ADDING THE HEALTH CARD HERE --> */}
                <InventoryHealthCard stats={stats} loading={loading} />

              </div>
            </section>

          {/* ── Tab Bar ── */}
          <section className=\"rounded-[28px] border border-white/[0.08] bg-white/[0.03] px-2 py-2 backdrop-blur-xl\">\n            <div className=\"flex items-center gap-1\">\n              {([\'stock\', \'intelligence\', \'history\'] as const).map(t => (\n                <button
                  key={t}
                  onClick={() => setViewMode(t)}
                  className={`relative px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all ${\n                    viewMode === t
                      ? \'text-white\'
                      : \'text-white/35 hover:text-white/70\'
                  }`}\n                >\n                  {viewMode === t && (\n                    <motion.span
                      layoutId=\"tab-indicator\"
                      className=\"absolute inset-0 rounded-2xl bg-white/[0.08] border border-white/[0.06]\"\n                      transition={{ type: \'spring\', stiffness: 380, damping: 30 }}\n                    />
                  )}\n                  <span className=\"relative z-10\">\n                    {t === \'stock\' ? \'Stok\' : t === \'intelligence\' ? \'İntellekt\' : \'Tarixçə\'}\n                  </span>
                </button>
              ))}\n            </div>
          </section>

          {viewMode === \'stock\' && (\n            <section className=\"rounded-[36px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] p-4 sm:p-5 backdrop-blur-2xl shadow-[0_24px_100px_rgba(0,0,0,0.28)]\">\n                <div className=\"flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between\">\n                  <div className=\"max-w-2xl space-y-4\">\n                    <div className=\"inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.24em] text-white/50 uppercase\">\n                      <Sparkles size={12} className=\"text-[#D4AF37]\" />
                      Live stock surface
                    </div>
                    <div>\n                      <h2 className=\"text-2xl sm:text-3xl font-semibold tracking-[-0.05em] text-white/95\">Sakit, tam ekran iş səthi</h2>
                      <p className=\"mt-2 max-w-xl text-sm leading-6 text-white/45\">Tək bir geniş paneldə xammal vəziyyətini göstər, sonra kartı açaraq detalları morf kimi dərinləşdir.</p>
                    </div>
                  </div>
                  <div className=\"grid gap-3 sm:grid-cols-3 xl:w-full\">\n                    {heroMetrics.map((metric, index) => {
                      const Icon = metric.icon;
                      const isActive = expandedHeroCard === index;
                      return (
                        <motion.button
                          key={metric.label}
                          layout
                          onClick={() => setExpandedHeroCard(isActive ? null : index)}
                          className={`group relative overflow-hidden rounded-[32px] border border-white/[0.06] bg-white/[0.03] px-5 py-6 text-left transition-all duration-300 ${isActive ? \'bg-white/[0.08]\' : \'hover:bg-white/[0.05]\'}`}\n                          style={{ minHeight: 210 }}\n                        >\n                          <motion.div layout className=\"flex h-full min-h-[180px] flex-col justify-between gap-6\">\n                            <div className=\"flex items-start justify-between gap-4\">\n                              <div>\n                                <p className=\"text-[10px] font-medium uppercase tracking-[0.28em] text-white/28\">{metric.label}</p>\n                                <p className=\"mt-3 text-3xl font-semibold tracking-[-0.05em] tabular-nums text-white/95\">{metric.value}</p>\n                              </div>\n                              <span className=\"flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] text-white/70 transition-transform duration-300 group-hover:scale-[1.03]\">\n                                <Icon size={18} />\n                              </span>\n                            </div>\n                            <div className=\"space-y-3\">\n                              <div className=\"h-px w-full bg-white/[0.08]\" />\n                              <p className=\"text-[11px] leading-5 text-white/34\">{metric.note}</p>\n                              <p className=\"text-[11px] uppercase tracking-[0.24em] text-white/22\">Tap to expand</p>\n                            </div>\n                          </motion.div>\n                        </motion.button>\n                      );\n                    })}\n                  </div>\n                </div>\n              </section>\n            )}\n\n            {viewMode === \'stock\' && (\n              <div className=\"grid gap-4\">\n                <section className=\"rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5 backdrop-blur-xl\">\n                  <div className=\"flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between\">\n                    <div className=\"flex items-center gap-3\">\n                      <span className=\"flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/70\">\n                        <Filter size={16} />\n                      </span>\n                      <div>\n                        <p className=\"text-sm font-semibold text-white/90\">Axtarış və filtrlər</p>\n                        <p className=\"text-xs text-white/35\">Dəqiq axtar, riskə görə ayır və məhsulu seç.</p>\n                      </div>\n                    </div>\n                    <div className=\"flex flex-wrap gap-2\">\n                      {([\'all\', \'critical\', \'out_of_stock\'] as const).map(f => (\n                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${filter === f ? \'bg-white text-black\' : \'border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-white/80\'}`}\n                        >\n                          {f === \'all\' ? \'Hamısı\' : f === \'critical\' ? \'Kritik\' : \'Bitib\'}\n                        </button>\n                      ))}\n                    </div>\n                  </div>\n                  <div className=\"mt-4 flex flex-col gap-3 lg:flex-row lg:items-center\">\n                    <div className=\"relative flex-1\">\n                      <Search size={14} className=\"pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/25\" />\n                      <input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder=\"Xammal axtar...\"
                        className=\"w-full rounded-2xl border border-white/[0.08] bg-black/20 py-3 pl-10 pr-10 text-sm text-white outline-none placeholder:text-white/22 focus:border-white/20\"\n                        onKeyDown={e => { if (e.key === \'Escape\') { setSearch(\'\'); setIsSearchOpen(false); } }}\n                      />\n                      {search && (\n                        <button onClick={() => setSearch(\'\')} className=\"absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/70\">\n                          <X size={14} />\n                        </button>\n                      )}\n                    </div>\n                  </div>\n                </section>\n              </div>\n            )}\n\n            {viewMode === \'stock\' && (\n              <div className=\"grid gap-4\">\n                <CalibrationSuggestionsPanel
                  suggestions={calibrationSuggestions}
                  onApplyStart={handleCalibrationApplyStart}
                  onApplied={handleCalibrationApplied}
                />\n              </div>\n            )}\n\n            {viewMode === \'stock\' && (\n              <>\n                <AnimatePresence>\n                  {expandedHeroMetric && (\n                    <motion.div
                      className=\"fixed inset-0 z-[70] flex items-stretch justify-stretch p-0\"\n                      initial={{ opacity: 0 }}\n                      animate={{ opacity: 1 }}\n                      exit={{ opacity: 0 }}\n                      onClick={() => setExpandedHeroCard(null)}\n                    >\n                      <motion.div
                        className=\"absolute inset-0 bg-black/70 backdrop-blur-md\"\n                        initial={{ opacity: 0 }}\n                        animate={{ opacity: 1 }}\n                        exit={{ opacity: 0 }}\n                      />\n                      <motion.div
                        layoutId={`hero-metric-${expandedHeroCard}`}\n                        className=\"relative z-10 h-full w-full rounded-none border border-white/[0.08] bg-[#0c0c0c] p-6 sm:p-10 shadow-[0_40px_140px_rgba(0,0,0,0.55)]\"\n                        initial={{ scale: 0.96, y: 20 }}\n                        animate={{ scale: 1, y: 0 }}\n                        exit={{ scale: 0.96, y: 20 }}\n                        transition={{ type: \'spring\', stiffness: 320, damping: 30 }}\n                        onClick={e => e.stopPropagation()}\n                      >\n                        <div className=\"flex items-start justify-between gap-4\">\n                          <div>\n                            <p className=\"text-[11px] font-medium uppercase tracking-[0.3em] text-white/30\">{expandedHeroMetric.label}</p>\n                            <p className=\"mt-4 text-5xl sm:text-6xl font-semibold tracking-[-0.06em] tabular-nums text-white/96\">{expandedHeroMetric.value}</p>\n                            <p className=\"mt-3 max-w-lg text-sm leading-6 text-white/45\">{expandedHeroMetric.note}. Bu kart toxunulduqda açılır və daha böyük səthdə detalları göstərir.</p>\n                          </div>\n                          <button onClick={() => setExpandedHeroCard(null)} className=\"rounded-full border border-white/[0.08] bg-white/[0.04] p-3 text-white/70 transition-colors hover:bg-white/[0.08]\">\n                            <X size={16} />\n                          </button>\n                        </div>\n                        <div className=\"mt-10 grid gap-3 sm:grid-cols-3\">\n                          <div className=\"rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4\">\n                            <p className=\"text-[11px] uppercase tracking-[0.24em] text-white/30\">Fokus</p>\n                            <p className=\"mt-2 text-sm text-white/70\">Məlumatı genişləndirilmiş səthdə oxu</p>\n                          </div>\n                          <div className=\"rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4\">\n                            <p className=\"text-[11px] uppercase tracking-[0.24em] text-white/30\">Əlaqə</p>\n                            <p className=\"mt-2 text-sm text-white/70\">Kart və panel arasında keçid morf kimi görünür</p>\n                          </div>\n                          <div className=\"rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4\">\n                            <p className=\"text-[11px] uppercase tracking-[0.24em] text-white/30\">Növbəti addım</p>\n                            <p className=\"mt-2 text-sm text-white/70\">İstəsən burada ayrıca daxili drill-down da qura bilərik</p>\n                          </div>\n                        </div>\n                      </motion.div>\n                    </motion.div>\n                  )}\n                </AnimatePresence>\n\n                {/* ── Inventory Table ── */}\n                {loading ? (\n                  <div className=\"flex items-center justify-center min-h-[28rem] rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl\">\n                    <Loader2 size={28} className=\"animate-spin text-white/15\" />\n                  </div>\n                ) : rows.length === 0 ? (\n                  <GlassCard intensity=\"light\" padding=\"xl\" className=\"text-center xl:min-h-[28rem] flex flex-col justify-center\">\n                    <Package size={44} className=\"mx-auto mb-4 opacity-20 text-white/30\" />\n                    <p className=\"text-sm font-medium text-white/30\">\n                      {search || filter !== \'all\' ? \'Axtarış nəticəsi tapılmadı\' : \'Hələ xammal əlavə edilməyib\'}\n                    </p>\n                    {!search && filter === \'all\' && (\n                      <div className=\"mt-4 space-y-2 text-xs text-white/20\">\n                        <p>📍 \"Yeni Xammal\" düyməsi ilə anbara məhsul əlavə edin</p>\n                        <p>📄 \"Tədarük\" sekmesinden faktura yükləyərək OCR ilə avtomatik əlavə edin</p>\n                        <p>⚙️ Hər xammal üçün kritik limit və vahid maya dəyəri təyin edin</p>\n                      </div>\n                    )}\n                  </GlassCard>\n                ) : (\n                  <GlassCard intensity=\"light\" padding=\"none\" className=\"overflow-hidden bg-white/[0.04] backdrop-blur-xl xl:min-h-[36rem]\">\n                    {/* Table head */}\n                    <div
                      className=\"hidden lg:grid gap-4 px-6 py-3 text-[11px] font-medium uppercase text-white/25 tracking-wider\"\n                      style={{\n                        gridTemplateColumns: \'1fr 120px 100px 140px 100px 90px\',\n                        borderBottom: \'1px solid rgba(255,255,255,0.05)\',\n                      }}\n                    >\n              <span>Ad</span>\n              <span>Stok Səviyyəsi</span>\n              <span className=\"text-right\">Stok</span>\n              <span className=\"text-right\">Maya Dəyəri</span>\n              <span className=\"text-center\">Status</span>\n              <span className=\"text-center\">Əməliyyat</span>\n            </div>\n\n            {rows.map((row) => {\n              const meta = getStatusMeta(row.status);\n              return (\n                <div
                  id={\'row-\' + row.id}\n                  key={row.id}\n                  className=\"px-4 lg:px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors duration-150 cursor-pointer\"\n                  onClick={() => setSelectedRow(row)}\n                >\n                  {/* Desktop row */}\n                  <div
                    className=\"hidden lg:grid gap-4 items-center\"\n                    style={{ gridTemplateColumns: \'1fr 120px 100px 140px 100px 90px\' }}\n                  >\n                    {/* Name */}\n                    <div className=\"min-w-0\">\n                      <p className=\"text-sm font-medium text-white/90 truncate leading-none\">{row.name}</p>\n                      <p className=\"text-[11px] text-white/25 mt-1\">{UNIT_LABELS[row.unit]}</p>\n                    </div>\n\n                    {/* Stock Level bar */}\n                    <div className=\"pr-8\">\n                      <StockBar ratio={Number(row.stock_ratio)} status={row.status} />\n                      {(row as any).cold_waste_percentage > 0 && (\n                        <p className=\"text-[10px] text-rose-400/40 mt-1\">itki: {row.cold_waste_percentage}%</p>\n                      )}\n                    </div>\n\n                    {/* Current stock */}\n                    <div className=\"text-right\">\n                      <span className=\"text-base font-semibold tabular-nums text-white/90\">\n                        {fmt(row.current_stock, 1)}\n                      </span>\n                    </div>\n\n                    {/* Cost */}\n                    <div className=\"text-right\">\n                      <p className=\"text-sm font-semibold tabular-nums text-white/95\">\n                        ₼{fmtCost((row.current_stock || 0) * (row.purchase_price ?? row.average_cost_per_unit))}\n                      </p>\n                      <p className=\"text-[11px] text-white/30 mt-0.5\">\n                        ₼{fmtCost(row.purchase_price ?? row.average_cost_per_unit)} / {UNIT_LABELS[row.unit]}\n                      </p>\n                    </div>\n\n                    {/* Status */}\n                    <div className=\"flex justify-center\">\n                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold ${meta.bg} ${meta.text}`}>\n                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />\n                        {meta.label}\n                      </span>\n                    </div>\n\n                    {/* Action */}\n                    <div className=\"flex justify-center\">\n                      {(row.status === \'out_of_stock\' || row.status === \'critical\') && (\n                        <span className=\"inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-red-300 bg-red-400/10 border border-red-400/20\">\n                          Kritik\n                        </span>\n                      )}\n                    </div>\n                  </div>\n\n                  {/* Mobile card */}\n                  <div className=\"lg:hidden space-y-3\">\n                    <div className=\"flex items-start justify-between gap-2\">\n                      <div className=\"min-w-0 flex-1\">\n                        <p className=\"text-sm font-semibold text-white/90\">{row.name}</p>\n                        <p className=\"text-[11px] text-white/25\">{UNIT_LABELS[row.unit]}</p>\n                      </div>\n                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${meta.bg} ${meta.text}`}>\n                        <span className={`w-1 h-1 rounded-full ${meta.dot}`} />\n                        {meta.label}\n                      </span>\n                    </div>\n                    <StockBar ratio={Number(row.stock_ratio)} status={row.status} />\n                    <div className=\"flex items-center justify-between text-sm\">\n                      <span className=\"font-semibold tabular-nums text-white/90\">{fmt(row.current_stock, 1)} {UNIT_LABELS[row.unit]}</span>\n                      <span className=\"font-semibold tabular-nums text-white/95\">\n                        ₼{fmtCost((row.current_stock || 0) * (row.purchase_price ?? row.average_cost_per_unit))}\n                      </span>\n                    </div>\n                    {(row.status === \'out_of_stock\' || row.status === \'critical\') && (\n                      <span className=\"mt-2 w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold text-red-300 bg-red-400/10 border border-red-400/20\">\n                        Kritik\n                      </span>\n                    )}\n                  </div>\n                </div>\n              );\n            })}\n          </GlassCard>\n        )}\n      </> )}\n\n        {viewMode === \'intelligence\' && (\n          <div className=\"max-w-3xl\">\n            <IntelligenceTabComponent />\n          </div>\n        )}\n\n        {viewMode === \'history\' && (\n          <>\n          <div className=\"space-y-4\">\n            {/* ── Premium Calendar Picker ── */}\n            <div className=\"flex items-center justify-between\">\n          <div className=\"flex items-center gap-2\">\n            <p className=\"text-xs font-bold uppercase tracking-[0.15em] text-white/40\">\n              {historyDay ? \'Günlük Tarixçə\' : \'Aylıq Tarixçə\'} <span className=\"text-white/15\">({filteredLogs.length})</span>\n            </p>\n            {historyDay && (\n              <motion.button\n                initial={{ opacity: 0, scale: 0.9 }}\n                animate={{ opacity: 1, scale: 1 }}\n                onClick={() => setHistoryDay(null)}\n                className=\"text-[10px] font-bold px-2 py-1 rounded-lg text-white/40 hover:text-white transition-all\"\n                style={{ background: \'rgba(255,255,255,0.05)\', border: \'1px solid rgba(255,255,255,0.08)\' }}\n              >\n                Bütün ay\n              </motion.button>\n            )}\n          </div>\n          <div className=\"flex items-center gap-2\">\n            <div ref={monthPickerRef} className=\"relative\">\n              <motion.button\n                onClick={() => setShowMonthPicker(!showMonthPicker)}\n                className=\"flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all\"\n                style={{\n                  background: showMonthPicker ? \'rgba(212,175,55,0.1)\' : \'rgba(255,255,255,0.04)\',\n                  border: showMonthPicker ? \'1px solid rgba(212,175,55,0.25)\' : \'1px solid rgba(255,255,255,0.08)\',\n                  color: showMonthPicker ? \'#D4AF37\' : \'rgba(255,255,255,0.7)\',\n                }}\n              >\n                <span>\n                  {historyDay\n                    ? new Date(historyDay).toLocaleDateString(\'az-AZ\', { day: \'numeric\', year: \'numeric\', month: \'long\' })\n                    : new Date(historyMonth + \'-01\').toLocaleDateString(\'az-AZ\', { year: \'numeric\', month: \'long\' })}\n                </span>\n                <motion.svg\n                  animate={{ rotate: showMonthPicker ? 180 : 0 }}\n                  transition={{ type: \'spring\', stiffness: 300, damping: 20 }}\n                  width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"2\"\n                >\n                  <path d=\"M6 9l6 6 6-6\" />\n                </motion.svg>\n              </motion.button>\n\n              <AnimatePresence>\n                {showMonthPicker && (\n                  <motion.div\n                    initial={{ opacity: 0, y: 6, scale: 0.96 }}\n                    animate={{ opacity: 1, y: 0, scale: 1 }}\n                    exit={{ opacity: 0, y: 6, scale: 0.96 }}\n                    transition={{ type: \'spring\', stiffness: 350, damping: 25 }}\n                    className=\"absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl overflow-hidden\"\n                    style={{\n                      background: \'#121212\',\n                      border: \'1px solid rgba(255,255,255,0.08)\',\n                      boxShadow: \'0 24px 64px rgba(0,0,0,0.6)\',\n                    }}\n                  >\n                    {/* Month/Year navigator */}\n                    <div className=\"flex items-center justify-between px-5 pt-4 pb-1\">\n                      <motion.button\n                        onClick={() => setPickerYear(p => p - 1)}\n                        className=\"p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors\"\n                      >\n                        <ChevronLeft size={16} />\n                      </motion.button>\n                      <div className=\"flex items-center gap-2\">\n                        <motion.span\n                          key={pickerYear + \'y\'}\n                          initial={{ opacity: 0, y: -4 }}\n                          animate={{ opacity: 1, y: 0 }}\n                          className=\"text-sm font-bold text-white/80\"\n                        >\n                          {pickerYear}\n                        </motion.span>\n                        <span className=\"text-sm font-bold text-white/40\">·</span>\n                        <motion.span\n                          key={pickerYear + \'m\'}\n                          initial={{ opacity: 0, y: 4 }}\n                          animate={{ opacity: 1, y: 0 }}\n                          className=\"text-sm font-bold text-[#D4AF37]\"\n                        >\n                          {AZ_MONTHS[parseInt(historyMonth.split(\'-\')[1]) - 1]}\n                        </motion.span>\n                      </div>\n                      <motion.button\n                        onClick={() => setPickerYear(p => p + 1)}\n                        className=\"p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors\"\n                      >\n                        <ChevronRight size={16} />\n                      </motion.button>\n                    </div>\n\n                    {/* Day-of-week headers */}\n                    <div className=\"grid grid-cols-7 gap-1 px-4 pt-3 pb-1\">\n                      {[\'B.e\', \'Ç.a\', \'Ç\', \'C.a\', \'C\', \'Ş\', \'B\'].map(d => (\n                        <span key={d} className=\"text-center text-[10px] font-bold uppercase tracking-wider text-white/20\">\n                          {d}\n                        </span>\n                      ))}\n                    </div>\n\n                    {/* Days grid */}\n                    <div className=\"grid grid-cols-7 gap-1 px-4 pb-3\">\n                      {(() => {\n                        const [y, m] = [pickerYear, parseInt(historyMonth.split(\'-\')[1])];\n                        const firstDay = new Date(y, m - 1, 1).getDay();\n                        const daysInMonth = new Date(y, m, 0).getDate();\n                        const days: React.ReactNode[] = [];\n                        // Empty cells before first day\n                        for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {\n                          days.push(<div key={`e-${i}`} />);\n                        }\n                        // Day cells\n                        for (let d = 1; d <= daysInMonth; d++) {\n                          const dateStr = `${y}-${String(m).padStart(2, \'0\')}-${String(d).padStart(2, \'0\')}`;\n                          const isSelected = dateStr === historyDay;\n                          const isToday = dateStr === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, \'0\')}-${String(new Date().getDate()).padStart(2, \'0\')}`;\n                          days.push(\n                            <motion.button
                              key={dateStr}
                              onClick={() => {\n                                setHistoryDay(dateStr);\n                                setShowMonthPicker(false);\n                              }}\n                              className=\"relative flex items-center justify-center h-9 rounded-xl text-xs font-semibold transition-colors\"\n                              style={{\n                                background: isSelected\n                                  ? \'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(212,175,55,0.1))\'\n                                  : isToday && !isSelected\n                                    ? \'rgba(255,255,255,0.06)\'\n                                    : \'transparent\',\n                                border: isSelected\n                                  ? \'1px solid rgba(212,175,55,0.35)\'\n                                  : isToday && !isSelected\n                                    ? \'1px solid rgba(255,255,255,0.1)\'\n                                    : \'1px solid transparent\',\n                                color: isSelected ? \'#D4AF37\' : isToday ? \'rgba(255,255,255,0.8)\' : \'rgba(255,255,255,0.4)\',\n                              }}\n                            >\n                              {d}\n                              {isToday && !isSelected && (\n                                <span className=\"absolute bottom-1 w-1 h-0.5 rounded-full bg-[#D4AF37]/40\" />\n                              )}\n                            </motion.button>\n                          );\n                        }\n                        return days;\n                      })()}\n                    </div>\n\n                    {/* Month pills */}\n                    <div className=\"border-t border-white/[0.06] px-4 py-3\" style={{ background: \'rgba(255,255,255,0.015)\' }}>\n                      <div className=\"flex gap-1.5 overflow-x-auto pb-0.5\">\n                        {AZ_MONTHS.map((name, idx) => {\n                          const monthStr = `${pickerYear}-${String(idx + 1).padStart(2, \'0\')}`;\n                          const isSelected = monthStr === historyMonth;\n                          return (\n                            <motion.button
                              key={monthStr}
                              onClick={() => {\n                                setHistoryMonth(monthStr);\n                                setHistoryDay(null);\n                                setShowMonthPicker(false);\n                              }}\n                              className=\"shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide transition-colors\"\n                              style={{\n                                background: isSelected ? \'rgba(212,175,55,0.15)\' : \'rgba(255,255,255,0.04)\',\n                                color: isSelected ? \'#D4AF37\' : \'rgba(255,255,255,0.4)\',\n                              }}\n                            >\n                              {name}\n                            </motion.button>\n                          );\n                        })}\n                      </div>\n                    </div>\n                  </motion.div>\n                )}\n              </AnimatePresence>\n            </div>\n\n          </div>\n          </div>\n        </div>\n\n        {/* ── Monthly summary cards ── */}\n        <div className=\"grid grid-cols-2 lg:grid-cols-4 gap-3\">\n          <GlassCard intensity=\"light\" padding=\"md\" className=\"border-emerald-500/15\">\n            <p className=\"text-[10px] uppercase tracking-wider text-emerald-400/60 font-bold\">Stoka Giriş</p>\n            <p className=\"text-lg font-black text-emerald-400 tabular-nums mt-1\">\n              {fmt(monthlySummary.stockIn, 1)}\n            </p>\n          </GlassCard>\n          <GlassCard intensity=\"light\" padding=\"md\" className=\"border-red-500/15\">\n            <p className=\"text-[10px] uppercase tracking-wider text-red-400/60 font-bold\">İtki</p>\n            <p className=\"text-lg font-black text-red-400 tabular-nums mt-1\">\n              {fmt(monthlySummary.waste, 1)}\n            </p>\n          </GlassCard>\n          <GlassCard intensity=\"light\" padding=\"md\" className=\"border-amber-500/15\">\n            <p className=\"text-[10px] uppercase tracking-wider text-gold/60 font-bold\">Tənzimləmə</p>\n            <p className=\"text-lg font-black text-gold tabular-nums mt-1\">\n              {fmt(monthlySummary.adjustment, 1)}\n            </p>\n          </GlassCard>\n          <GlassCard intensity=\"light\" padding=\"md\" className=\"border-white/10\">\n            <p className=\"text-[10px] uppercase tracking-wider text-white/40 font-bold\">Sifariş Sərfiyyatı</p>\n            <p className=\"text-lg font-black text-white/70 tabular-nums mt-1\">\n              {fmt(monthlySummary.orderConsumption, 1)}\n            </p>\n          </GlassCard>\n        </div>\n\n        {/* ── History table ── */}\n        <div className=\"rounded-2xl overflow-hidden\"\n          style={{ border: \'1px solid rgba(255,255,255,0.06)\' }}>\n          <div className=\"hidden lg:grid gap-4 px-6 py-3 text-[11px] font-bold tracking-[0.15em] uppercase text-white/30\"\n            style={{\n              gridTemplateColumns: \'120px 1fr 100px 90px 110px 1fr\',\n              background: \'rgba(255,255,255,0.018)\',\n              borderBottom: \'1px solid rgba(255,255,255,0.05)\',\n            }}>\n            <span>Növ</span>\n            <span>Xammal</span>\n            <span className=\"text-right\">Miqdar</span>\n            <span className=\"text-right\">Maya</span>\n            <span className=\"text-right\">Tarix</span>\n            <span>Qeyd</span>\n          </div>\n          {allLogsLoading ? (\n            <div className=\"flex items-center justify-center h-48\">\n              <Loader2 size={24} className=\"animate-spin text-white/[0.12]\" />\n            </div>\n          ) : filteredLogs.length === 0 ? (\n            <GlassCard intensity=\"light\" padding=\"xl\" className=\"text-center\">\n              <Package size={36} className=\"mx-auto mb-3 opacity-20 text-white/30\" />\n              <p className=\"text-sm text-white/30\">\n                {search.trim() ? \'Axtarış nəticəsi tapılmadı\' : \'Hələ heç bir əməliyyat qeydə alınmayıb\'}\n              </p>\n              {!search.trim() && (\n                <p className=\"text-xs text-white/15 mt-2\">\n                  Stok girişi, itki və ya inventarizasiya əməliyyatları etdikdən sonra\n                  <br />bütün hərəkətlər burada görünəcək.\n                </p>\n              )}\n            </GlassCard>\n          ) : (\n            <div className=\"divide-y divide-white/[0.04]\">\n              {filteredLogs.map((log: any, idx: number) => {\n                const dt = new Date(log.created_at);\n                const sign = log.type === \'stock_in\' ? \'+\' : log.type === \'adjustment\' && log.quantity > 0 ? \'+\' : \'-\';\n                const color = LOG_COLORS[log.type] || \'text-white/40\';\n                const bgMap: Record<string, string> = {\n                  stock_in: \'rgba(16,185,129,0.1)\',\n                  waste: \'rgba(239,68,68,0.08)\',\n                  adjustment: \'rgba(212,175,55,0.08)\',\n                };\n                return (\n                  <div key={log.id || idx} className=\"space-y-2 px-4 py-3 lg:grid lg:grid-cols-[120px_1fr_100px_90px_110px_1fr] lg:gap-4 lg:px-6 lg:py-4 lg:items-center transition-colors hover:bg-white/[0.018]\">\n                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider ${color}`}\n                      style={{ background: bgMap[log.type] || \'rgba(255,255,255,0.04)\' }}>\n                      {LOG_LABELS[log.type] || log.type}\n                    </span>\n                    <span className=\"truncate text-sm font-semibold text-white/90\">\n                      {log.ingredient?.name || log.ingredient_id?.slice(0, 8)}\n                    </span>\n                    <span className={`text-right text-sm font-bold tabular-nums ${color}`}>\n                      {sign}{fmt(Math.abs(log.quantity), 1)} {log.ingredient?.unit || \'\'}\n                    </span>\n                    <span className=\"text-right text-xs text-white/50 tabular-nums\">\n                      {log.type === \'order_consumption\' ? \'—\' : log.cost_per_unit != null ? `₼${fmtCost(log.cost_per_unit)}` : \'—\'}\n                    </span>\n                    <span className=\"text-right text-xs text-white/50\">\n                      {dt.toLocaleDateString(\'az-AZ\', { day: \'2-digit\', month: \'short\', hour: \'2-digit\', minute: \'2-digit\' })}\n                    </span>\n                    <span className=\"text-xs text-white/40 truncate\">\n                      {log.type === \'order_consumption\' ? \'—\' : log.note || \'—\'}\n                    </span>\n                  </div>\n                );\n              })}\n            </div>\n          )}\n          </div>\n          </> )}\n        <InspectorPanel
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          UNIT_LABELS={UNIT_LABELS}
          onStockIn={(r) => { setSelectedRow(null); setModal({ mode: \'stock_in\', row: r }); }}\n          onWaste={(r) => { setSelectedRow(null); setModal({ mode: \'waste\', row: r }); }}\n          onAudit={(r) => { setSelectedRow(null); setModal({ mode: \'audit\', row: r }); }}\n          onHistory={(r) => { setSelectedRow(null); setModal({ mode: \'history\', row: r }); }}\n          onDelete={(r) => handleDelete(r)}\n        />\n\n        {/* ═══════════════════════════════════════════════════════\n            MODALS\n        ════════════════════════════════════════════════════════ */}\n        <AnimatePresence>\n          {modal.mode && (\n          <div className=\"fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4\">\n            <motion.div\n              className=\"absolute inset-0 bg-black/75 backdrop-blur-sm\"\n              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}\n              onClick={closeModal}\n            />\n\n            <motion.div\n              variants={modalV} initial=\"hidden\" animate=\"show\" exit=\"exit\"\n              className=\"relative z-10 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl flex flex-col gap-0 overflow-hidden\"\n              style={{ background: lightMode ? \'#ffffff\' : \'#0e0e0e\', border: lightMode ? \'1px solid #e5e7eb\' : \'1px solid rgba(255,255,255,0.08)\', boxShadow: lightMode ? \'0 32px 80px rgba(0,0,0,0.12)\' : \'0 32px 80px rgba(0,0,0,0.7)\' }}\n              onClick={e => e.stopPropagation()}\n            >\n              {/* Drag handle (mobile) */}\n              <div className=\"sm:hidden flex justify-center pt-3 pb-1\">\n                <div className=\"w-10 h-1 rounded-full bg-white/15\" />\n              </div>\n\n              {/* ── STOCK IN ── */}\n              {modal.mode === \'stock_in\' && modal.row && (\n                <div className=\"p-6 space-y-5\">\n                  <div className=\"flex items-start justify-between\">\n                    <div>\n                      <span className=\"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400\">\n                        <TrendingUp size={10} /> Mal Qəbulu\n                      </span>\n                      <h2 className=\"text-xl font-bold leading-tight\">{modal.row.name}</h2>\n                      <p className=\"text-white/30 text-xs mt-0.5\">\n                        Cari: <span className={`font-semibold ${getStatusMeta(modal.row.status).text}`}>\n                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}\n                        </span>\n                      </p>\n                    </div>\n                    <button onClick={closeModal} className=\"text-white/25 hover:text-white transition-colors mt-1\">\n                      <X size={18} />\n                    </button>\n                  </div>\n\n                  <div className=\"space-y-3\">\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                        Miqdar ({UNIT_LABELS[modal.row!.unit]})\n                      </label>\n                      <input type=\"number\" min=\"0.001\" step=\"0.001\" value={qty}\n                        onChange={e => setQty(e.target.value)} placeholder=\"0.000\" autoFocus\n                        className=\"w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-emerald-500/40 transition-colors text-base font-bold\"\n                      />\n                    </div>\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                        Maya dəyəri / {UNIT_LABELS[modal.row!.unit]} (₼) — istəyə görə\n                      </label>\n                      <input type=\"number\" min=\"0\" step=\"0.0001\" value={cost}\n                        onChange={e => setCost(e.target.value)} placeholder=\"0.0000\"\n                        className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-emerald-500/40 transition-colors text-sm\"\n                      />\n                    </div>\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                        Qeyd — istəyə görə\n                      </label>\n                      <input type=\"text\" value={reason}\n                        onChange={e => setReason(e.target.value)} placeholder=\"Məs: Limasol çatdırılması\"\n                        className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-emerald-500/40 transition-colors text-sm\"\n                      />\n                    </div>\n                  </div>\n\n                  <button onClick={handleStockIn} disabled={saving || !qty.trim()}\n                    className=\"w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]\"\n                    style={{ background: \'linear-gradient(135deg,#0a5c41,#0f7a57)\', color: \'#fff\', border: \'1px solid rgba(16,185,129,0.25)\' }}\n                  >\n                    {saving ? <Loader2 size={16} className=\"animate-spin\" /> : <><TrendingUp size={15} /> Stoku Artır</>}\n                  </button>\n                </div>\n              )}\n\n              {/* ── WASTE ── */}\n              {modal.mode === \'waste\' && modal.row && (\n                <div className=\"p-6 space-y-5\">\n                  <div className=\"flex items-start justify-between\">\n                    <div>\n                      <span className=\"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5 bg-red-500/10 border border-red-500/25 text-red-400\">\n                        <TrendingDown size={10} /> İtki / Zay Qeydi\n                      </span>\n                      <h2 className=\"text-xl font-bold leading-tight\">{modal.row.name}</h2>\n                      <p className=\"text-white/30 text-xs mt-0.5\">\n                        Cari: <span className={`font-semibold ${getStatusMeta(modal.row.status).text}`}>\n                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}\n                        </span>\n                      </p>\n                    </div>\n                    <button onClick={closeModal} className=\"text-white/25 hover:text-white transition-colors mt-1\">\n                      <X size={18} />\n                    </button>\n                  </div>\n\n                  <div className=\"space-y-3\">\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                        Miqdar ({UNIT_LABELS[modal.row!.unit]})\n                      </label>\n                      <input type=\"number\" min=\"0.001\" step=\"0.001\" value={qty}\n                        onChange={e => setQty(e.target.value)} placeholder=\"0.000\" autoFocus\n                        className=\"w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-red-500/40 transition-colors text-base font-bold\"\n                      />\n                    </div>\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                        Səbəb <span className=\"text-red-400\">*</span>\n                      </label>\n                      <input type=\"text\" value={reason}\n                        onChange={e => setReason(e.target.value)} placeholder=\"Məs: Bitmə tarixi keçdi, Zədəli\"\n                        className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-red-500/40 transition-colors text-sm\"\n                      />\n                    </div>\n                  </div>\n\n                  <button onClick={handleWaste} disabled={saving || !qty.trim() || !reason.trim()}\n                    className=\"w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]\"\n                    style={{ background: \'linear-gradient(135deg,#7f1d1d,#991b1b)\', color: \'#fff\', border: \'1px solid rgba(239,68,68,0.3)\' }}\n                  >\n                    {saving ? <Loader2 size={16} className=\"animate-spin\" /> : <><TrendingDown size={15} /> İtki Qeyd Et</>}\n                  </button>\n                </div>\n              )}\n\n              {/* ── AUDIT ── */}\n              {modal.mode === \'audit\' && modal.row && (\n                <div className=\"p-6 space-y-5\">\n                  <div className=\"flex items-start justify-between\">\n                    <div>\n                      <span className=\"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5\"\n                        style={{ background: \'rgba(212,175,55,0.08)\', border: \'1px solid rgba(212,175,55,0.2)\', color: \'#D4AF37\' }}>\n                        <RefreshCw size={10} /> İnventarizasiya\n                      </span>\n                      <h2 className=\"text-xl font-bold leading-tight\">{modal.row.name}</h2>\n                      <p className=\"text-white/30 text-xs mt-0.5 space-y-0.5\">\n                        <span>Cari (sistem): <span className=\"font-semibold text-white/60\">\n                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}\n                        </span></span>\n                        <br />\n                        <span>Nəzəri: <span className=\"font-semibold text-white/60\">\n                          {fmt(modal.row.theoretical_stock, 1)} {UNIT_LABELS[modal.row!.unit]}\n                        </span></span>\n                      </p>\n                    </div>\n                    <button onClick={closeModal} className=\"text-white/25 hover:text-white transition-colors mt-1\">\n                      <X size={18} />\n                    </button>\n                  </div>\n\n                  <div className=\"rounded-xl p-4\"\n                    style={{ background: \'rgba(212,175,55,0.04)\', border: \'1px solid rgba(212,175,55,0.12)\' }}>\n                    <p className=\"text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-0.5\">Real Faktiki Stok</p>\n                    <p className=\"text-[10px] text-white/20 mb-3\">Fiziki olaraq hazırda anbarda olan miqdarı daxil edin. Sistem nəzəri stoku bu dəyərlə əvəzləyəcək və fərqi adjustment kimi qeydə alacaq.</p>\n                    <input type=\"number\" min=\"0\" step=\"0.001\" value={auditQty}\n                      onChange={e => setAuditQty(e.target.value)} placeholder=\"0.000\" autoFocus\n                      className=\"w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-base font-bold\"\n                    />\n                    {auditQty.trim() && !isNaN(parseFloat(auditQty)) && (\n                      <motion.div\n                        initial={{ opacity: 0, y: -4 }}\n                        animate={{ opacity: 1, y: 0 }}\n                        className=\"mt-3 flex items-center justify-between px-3 py-2 rounded-lg\"\n                        style={{ background: \'rgba(212,175,55,0.06)\', border: \'1px solid rgba(212,175,55,0.12)\' }}\n                      >\n                        <span className=\"text-[10px] uppercase tracking-wider text-white/40 font-semibold\">Gözlənilən Fərq</span>\n                        <span className={`text-sm font-black tabular-nums ${(parseFloat(auditQty) - modal.row.current_stock) !== 0 ? \'text-amber-400\' : \'text-emerald-400\'}`}>\n                          {(parseFloat(auditQty) - modal.row.current_stock) > 0 ? \'+\' : \'\'}\n                          {(parseFloat(auditQty) - modal.row.current_stock).toFixed(2)} {UNIT_LABELS[modal.row!.unit]}\n                        </span>\n                      </motion.div>\n                    )}\n                  </div>\n\n                  <button onClick={handleAudit} disabled={saving || !auditQty.trim()}\n                    className=\"w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]\"\n                    style={{ background: \'#111111\', color: \'#ffffff\', border: \'1px solid rgba(255,255,255,0.16)\' }}\n                  >\n                    {saving ? <Loader2 size={16} className=\"animate-spin\" /> : <><RefreshCw size={15} /> Təsdiq Et</>}\n                  </button>\n                </div>\n              )}\n\n              {/* ── NEW INGREDIENT ── */}\n              {modal.mode === \'new_ingredient\' && (\n                <div className=\"p-6 space-y-5\">\n                  <div className=\"flex items-start justify-between\">\n                    <div>\n                      <span className=\"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5\"\n                        style={{ background: \'rgba(212,175,55,0.08)\', border: \'1px solid rgba(212,175,55,0.2)\', color: \'#D4AF37\' }}>\n                        <Plus size={10} /> Yeni Xammal\n                      </span>\n                      <h2 className=\"text-xl font-bold\">İnqredient əlavə et</h2>\n                    </div>\n                    <button onClick={closeModal} className=\"text-white/25 hover:text-white transition-colors mt-1\">\n                      <X size={18} />\n                    </button>\n                  </div>\n\n                  <div className=\"space-y-3\">\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Ad</label>\n                      <input type=\"text\" value={newName} onChange={e => { setNewName(e.target.value); setFormErrors(p => ({ ...p, name: false })); setShowWasteCalc(false); lookupWasteStandard(e.target.value); }}\n                        placeholder=\"Məs: Avokado\" autoFocus\n                        className=\"w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border outline-none transition-colors text-sm font-semibold\"\n                        style={{\n                          borderColor: formErrors.name ? \'rgba(239,68,68,0.5)\' : \'rgba(255,255,255,0.09)\',\n                          background: formErrors.name ? \'rgba(239,68,68,0.04)\' : \'rgba(255,255,255,0.04)\',\n                        }}\n                      />\n                      {(() => {\n                        if (!newName.trim() || wasteStandards.length === 0) return null;\n                        const lower = newName.toLowerCase();\n                        const match = wasteStandards.find(s =>\n                          s.keyword && lower.includes(s.keyword.toLowerCase())\n                        );\n                        if (!match) return null;\n                        return (\n                          <motion.div\n                            initial={{ opacity: 0, y: -4 }}\n                            animate={{ opacity: 1, y: 0 }}\n                            className=\"mt-2 flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all active:scale-[0.98]\"\n                            style={{ background: \'rgba(212,175,55,0.06)\', border: \'1px solid rgba(212,175,55,0.15)\' }}\n                            onClick={() => { setNewWastePct(String(match.waste_percentage)); }}\n                          >\n                            <div className=\"flex items-center gap-2\">\n                              <Lightbulb size={12} className=\"text-gold\" />\n                              <span className=\"text-[10px] text-white/40\">\n                                Standart itki: <span className=\"font-bold text-gold\">{match.waste_percentage}%</span>\n                                <span className=\"text-white/20 ml-1\">· {match.note || \'\'}</span>\n                              </span>\n                            </div>\n                            <span className=\"text-[9px] font-bold text-gold hover:text-white transition-colors\">Tətbiq et →</span>\n                          </motion.div>\n                        );\n                      })()}\n                    </div>\n\n                    <div>\n                      <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                        Təchizatçı <span className=\"text-red-400/60\">*</span>\n                      </label>\n                      <div className=\"space-y-2\">\n                        <input value={qsName} onChange={e => setQsName(e.target.value)}\n                          placeholder=\"Tədarükçü adı\"\n                          className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                        <div className=\"flex gap-2\">\n                          <input value={qsPhone} onChange={e => setQsPhone(e.target.value)} placeholder=\"Telefon\"\n                            className=\"flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                          <input value={qsContact} onChange={e => setQsContact(e.target.value)} placeholder=\"Əlaqə şəxs\"\n                            className=\"flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                        </div>\n                      </div>\n                    </div>\n\n                    <div className=\"grid grid-cols-2 gap-3\">\n                      <div>\n                        <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Vahid</label>\n                        <select value={newUnit} onChange={e => setNewUnit(e.target.value as IngredientUnit)}\n                          className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\"\n                        >\n                          {UNITS.map(u => (\n                            <option key={u} value={u} style={{ background: \'#111\' }}>{UNIT_LABELS[u]}</option>\n                          ))}\n                        </select>\n                      </div>\n                      <div>\n                        <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Kritik limit</label>\n                        <input type=\"number\" min=\"0\" step=\"1\" value={newLimit}\n                          onChange={e => { setNewLimit(e.target.value); setFormErrors(p => ({ ...p, criticalLimit: false })); }}\n                          className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\"\n                          style={{\n                            borderColor: formErrors.criticalLimit ? \'rgba(239,68,68,0.5)\' : \'rgba(255,255,255,0.09)\',\n                            background: formErrors.criticalLimit ? \'rgba(239,68,68,0.04)\' : \'rgba(255,255,255,0.04)\',\n                          }}\n                        />\n                      </div>\n                    </div>\n\n                    {/* Satınalma məlumatları — Alınan Miqdar + Ödənilən Məbləğ */}\n                    <div className=\"rounded-xl p-4 space-y-3\"\n                      style={{ background: \'rgba(212,175,55,0.04)\', border: \'1px solid rgba(212,175,55,0.12)\' }}>\n                      <p className=\"text-[10px] font-bold uppercase tracking-wider text-gold/60\">Son Alış Fakturası</p>\n                      <div className=\"grid grid-cols-2 gap-3\">\n                        <div>\n                          <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                            Alınan Miqdar\n                          </label>\n                          <input type=\"number\" min=\"0\" step=\"1\" value={newTotalQty}\n                            onChange={e => { setNewTotalQty(e.target.value); setFormErrors(p => ({ ...p, totalQty: false })); }}\n                            placeholder=\"Məs: 5000\"\n                            className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border outline-none transition-colors text-sm font-bold\"\n                            style={{\n                              borderColor: formErrors.totalQty ? \'rgba(239,68,68,0.5)\' : \'rgba(255,255,255,0.09)\',\n                              background: formErrors.totalQty ? \'rgba(239,68,68,0.04)\' : \'rgba(255,255,255,0.04)\',\n                            }}\n                          />\n                        </div>\n                        <div>\n                          <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n            Ümumi Məbləğ (₼)\n                          </label>\n                          <input type=\"number\" min=\"0\" step=\"0.01\" value={newTotalAmount}\n                            onChange={e => { setNewTotalAmount(e.target.value); setFormErrors(p => ({ ...p, totalAmount: false })); }}\n                            placeholder=\"Məs: 150\"\n                            className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border outline-none transition-colors text-sm font-bold\"\n                            style={{\n                              borderColor: formErrors.totalAmount ? \'rgba(239,68,68,0.5)\' : \'rgba(255,255,255,0.09)\',\n                              background: formErrors.totalAmount ? \'rgba(239,68,68,0.04)\' : \'rgba(255,255,255,0.04)\',\n                            }}\n                          />\n                        </div>\n                      </div>\n                      {calculatedUnitCost !== null && (\n                        <motion.div\n                          initial={{ opacity: 0, y: -4 }}\n                          animate={{ opacity: 1, y: 0 }}\n                          className=\"flex items-center justify-between px-3 py-2 rounded-lg\"\n                          style={{ background: \'rgba(212,175,55,0.08)\', border: \'1px solid rgba(212,175,55,0.15)\' }}\n                        >\n                          <span className=\"text-[10px] uppercase tracking-wider text-white/40 font-semibold\">Vahid Maya Dəyəri</span>\n                          <span className=\"text-sm font-black text-gold tabular-nums\">\n                            ₼{fmtCost(calculatedUnitCost)} / {UNIT_LABELS[newUnit]}\n                          </span>\n                        </motion.div>\n                      )}\n                    </div>\n\n                    {/* İtki faizi */}\n                    <div className=\"grid grid-cols-2 gap-3\">\n                      <div>\n                        <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                          İtki Faizi (%) <span className=\"text-white/20\">— istəyə görə</span>\n                        </label>\n                        <input type=\"number\" min=\"0\" max=\"99\" step=\"1\" value={newWastePct}\n                          onChange={e => setNewWastePct(e.target.value)}\n                          placeholder=\"Məs: 10\"\n                          className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\"\n                        />\n                      </div>\n                      <div>\n                        <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">\n                          Maya dəyəri / vahid (₼) <span className=\"text-white/20\">— manual</span>\n                        </label>\n                        <input type=\"number\" min=\"0\" step=\"0.0001\" value={newCost}\n                          onChange={e => setNewCost(e.target.value)} placeholder=\"0.0000\"\n                          className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\"\n                        />\n                      </div>\n                    </div>\n\n                    {/* Effektiv maya dəyəri (itki daxil olmaqla) */}\n                    {parseFloat(newWastePct) > 0 && effectiveUnitCost > 0 && (\n                      <motion.div\n                        initial={{ opacity: 0, y: -4 }}\n                        animate={{ opacity: 1, y: 0 }}\n                        className=\"flex items-center justify-between px-3 py-2 rounded-lg\"\n                        style={{ background: \'rgba(239,68,68,0.06)\', border: \'1px solid rgba(239,68,68,0.15)\' }}\n                      >\n                        <div>\n                          <span className=\"text-[10px] uppercase tracking-wider text-red-400/60 font-semibold\">Effektiv Maya (itki daxil)</span>\n                          <p className=\"text-[9px] text-white/20\">+{parseFloat(newWastePct)}% itki uyğunlaşdırması</p>\n                        </div>\n                        <span className=\"text-sm font-black text-red-400 tabular-nums\">\n                          ₼{fmtCost(effectiveUnitCost)} / {UNIT_LABELS[newUnit]}\n                        </span>\n                      </motion.div>\n                    )}\n\n                    {/* İtki kalkulyatoru */}\n                    <div>\n                      <button\n                        onClick={() => setShowWasteCalc(!showWasteCalc)}\n                        className=\"w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all active:scale-[0.99]\"\n                        style={{ background: \'rgba(212,175,55,0.04)\', border: \'1px solid rgba(212,175,55,0.1)\' }}\n                      >\n                        <div className=\"flex items-center gap-2\">\n                          <Calculator size={12} className=\"text-gold/60\" />\n                          <span className=\"text-[10px] font-bold uppercase tracking-wider text-gold/60\">\n                            {showWasteCalc ? \'Kalkulyatoru bağla\' : \'🧮 İtki Kalkulyatoru\'}\n                          </span>\n                        </div>\n                        {showWasteCalc ? <ChevronUp size={12} className=\"text-gold/40\" /> : <ChevronDown size={12} className=\"text-gold/40\" />}\n                      </button>\n\n                      <AnimatePresence>\n                        {showWasteCalc && (\n                          <motion.div\n                            initial={{ opacity: 0, height: 0 }}\n                            animate={{ opacity: 1, height: \'auto\' }}\n                            exit={{ opacity: 0, height: 0 }}\n                            className=\"overflow-hidden\"\n                          >\n                            <div className=\"mt-2 p-3 rounded-xl space-y-2\"\n                              style={{ background: \'rgba(212,175,55,0.03)\', border: \'1px solid rgba(212,175,55,0.08)\' }}\n                            >\n                              <p className=\"text-[9px] text-white/25 leading-relaxed\">\n                                Sınaq bişirilməsi: götürdüyünüz çəki və təmizləndikdən sonra qalan çəkini daxil edin, proqram itki faizini avtomatik hesablasın.\n                              </p>\n                              <div className=\"grid grid-cols-2 gap-2\">\n                                <div>\n                                  <label className=\"text-[8px] text-white/30 uppercase tracking-wider block mb-1\">Götürülən (qr)</label>\n                                  <input type=\"number\" min=\"0\" step=\"1\" value={calcRaw}\n                                    onChange={e => setCalcRaw(e.target.value)} placeholder=\"1000\"\n                                    className=\"w-full px-3 py-2 rounded-lg text-white bg-white/[0.04] border border-white/[0.07] outline-none focus:border-gold/30 transition-colors text-sm\"\n                                  />\n                                </div>\n                                <div>\n                                  <label className=\"text-[8px] text-white/30 uppercase tracking-wider block mb-1\">Təmiz qalan (qr)</label>\n                                  <input type=\"number\" min=\"0\" step=\"1\" value={calcClean}\n                                    onChange={e => setCalcClean(e.target.value)} placeholder=\"880\"\n                                    className=\"w-full px-3 py-2 rounded-lg text-white bg-white/[0.04] border border-white/[0.07] outline-none focus:border-gold/30 transition-colors text-sm\"\n                                  />\n                                </div>\n                              </div>\n                              {calcRaw && calcClean && !isNaN(parseFloat(calcRaw)) && !isNaN(parseFloat(calcClean)) && parseFloat(calcRaw) > 0 && (() => {\n                                const pct = ((parseFloat(calcRaw) - parseFloat(calcClean)) / parseFloat(calcRaw)) * 100;\n                                return (\n                                  <motion.div\n                                    initial={{ opacity: 0 }}\n                                    animate={{ opacity: 1 }}\n                                    className=\"flex items-center justify-between px-3 py-2 rounded-lg\"\n                                    style={{ background: \'rgba(212,175,55,0.08)\', border: \'1px solid rgba(212,175,55,0.12)\' }}\n                                  >\n                                    <span className=\"text-[9px] text-white/40\">Hesablanmış itki faizi</span>\n                                    <div className=\"flex items-center gap-2\">\n                                      <span className=\"text-sm font-black text-gold tabular-nums\">{pct.toFixed(1)}%</span>\n                                      <button\n                                        onClick={() => { setNewWastePct(pct.toFixed(0)); setShowWasteCalc(false); }}\n                                        className=\"text-[9px] font-bold px-2 py-1 rounded-lg transition-all active:scale-95\"\n                                        style={{ background: \'rgba(212,175,55,0.15)\', color: \'#D4AF37\' }}\n                                      >\n                                        Tətbiq et\n                                      </button>\n                                    </div>\n                                  </motion.div>\n                                );\n                              })()}\n                            </div>\n                          </motion.div>\n                        )}\n                      </AnimatePresence>\n                    </div>\n                  </div>\n\n                  <button onClick={handleNewIngredient} disabled={saving}\n                    className=\"w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]\"\n                    style={{ background: \'#111111\', color: \'#ffffff\', border: \'1px solid rgba(255,255,255,0.16)\' }}\n                  >\n                    {saving ? <Loader2 size={16} className=\"animate-spin text-white\" /> : <><Plus size={15} /> Əlavə Et</>}\n                  </button>\n                </div>\n              )}\n\n              {/* ── EDIT INGREDIENT ── */}\n              {modal.mode === \'edit_ingredient\' && editRow && (\n                (() => {\n                  const existingSupplier = editRow.supplier_id ? suppliers.find(s => s.id === editRow.supplier_id) : null;\n                  return (\n                    <div className=\"p-6 space-y-4\">\n                      <div className=\"flex items-center justify-between mb-1\">\n                        <h2 className=\"text-lg font-bold\">Xammalı Redaktə Et</h2>\n                        <button onClick={closeModal} className=\"text-white/25 hover:text-white transition-colors\"><X size={18} /></button>\n                      </div>\n                      <div className=\"space-y-3\">\n                        <div>\n                          <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Ad</label>\n                          <input value={newName} onChange={e => setNewName(e.target.value)}\n                            className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                        </div>\n                        <div>\n                          <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Təchizatçı</label>\n                          <input value={editQsName} onChange={e => setEditQsName(e.target.value)}\n                            placeholder={existingSupplier?.name || \'Tədarükçü adı\'}\n                            className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                          <div className=\"flex gap-2 mt-2\">\n                            <input value={editQsPhone} onChange={e => setEditQsPhone(e.target.value)} placeholder={existingSupplier?.phone || \'Telefon\'}\n                              className=\"flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                            <input value={editQsContact} onChange={e => setEditQsContact(e.target.value)} placeholder={existingSupplier?.contact_person || \'Əlaqə şəxs\'}\n                              className=\"flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                          </div>\n                        </div>\n                        <div className=\"grid grid-cols-2 gap-3\">\n                          <div>\n                            <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Vahid</label>\n                            <select value={newUnit} onChange={e => setNewUnit(e.target.value as IngredientUnit)}\n                              className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\">\n                              {UNITS.map(u => <option key={u} value={u} style={{ background: \'#111\' }}>{UNIT_LABELS[u]}</option>)}\n                            </select>\n                          </div>\n                          <div>\n                            <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">Kritik limit</label>\n                            <input type=\"number\" min=\"0\" step=\"1\" value={newLimit} onChange={e => setNewLimit(e.target.value)}\n                              className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                          </div>\n                        </div>\n                        <div>\n                          <label className=\"text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block\">İtki Faizi (%)</label>\n                          <input type=\"number\" min=\"0\" max=\"99\" step=\"1\" value={newWastePct} onChange={e => setNewWastePct(e.target.value)}\n                            className=\"w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm\" />\n                        </div>\n                      </div>\n                      <div className=\"flex gap-2\">\n                        <button onClick={handleUpdateIngredient} disabled={updateSaving || deletingIngredient}\n                          className=\"flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]\"\n                          style={{ background: \'#111111\', color: \'#ffffff\', border: \'1px solid rgba(255,255,255,0.16)\' }}>\n                          {updateSaving ? <Loader2 size={16} className=\"animate-spin text-white\" /> : <><Pencil size={15} /> Yadda saxla</>}\n                        </button>\n                        <button onClick={handleDeleteIngredient} disabled={deletingIngredient || updateSaving}\n                          className=\"px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]\"\n                          style={{ background: \'rgba(239,68,68,0.1)\', color: \'#f87171\', border: \'1px solid rgba(239,68,68,0.25)\' }}>\n                          {deletingIngredient ? <Loader2 size={16} className=\"animate-spin\" /> : <Trash2 size={16} />}\n                        </button>\n                      </div>\n                    </div>\n                  );\n                })()\n              )}\n\n              {/* ── HISTORY ── */}\n              {modal.mode === \'history\' && modal.row && (\n                <div className=\"p-6 space-y-4\">\n                  <div className=\"flex items-start justify-between\">\n                    <div>\n                      <span className=\"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5\"\n                        style={{ background: \'rgba(255,255,255,0.06)\', border: \'1px solid rgba(255,255,255,0.12)\', color: \'#a0a0a0\' }}>\n                        <RefreshCw size={10} /> Tarixçə\n                      </span>\n                      <h2 className=\"text-xl font-bold leading-tight\">{modal.row.name}</h2>\n                      <p className=\"text-white/30 text-xs mt-0.5\">\n                        Cari stok: <span className={`font-semibold ${getStatusMeta(modal.row.status).text}`}>\n                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}\n                        </span>\n                      </p>\n                    </div>\n                    <button onClick={closeModal} className=\"text-white/25 hover:text-white transition-colors mt-1\">\n                      <X size={18} />\n                    </button>\n                  </div>\n\n                  <div className=\"max-h-[50vh] overflow-y-auto space-y-1 pr-1\">\n                    {historyLoading ? (\n                      <div className=\"flex items-center justify-center py-12\">\n                        <Loader2 size={20} className=\"animate-spin text-white/15\" />\n                      </div>\n                    ) : historyLogs.length === 0 ? (\n                      <div className=\"text-center py-12 text-white/20 text-xs\">\n                        <Package size={28} className=\"mx-auto mb-2 opacity-30\" />\n                        Heç bir əməliyyat tapılmadı\n                      </div>\n                    ) : (\n                      historyLogs.map((log: any, idx: number) => {\n                        const dt = new Date(log.created_at);\n                        const sign = log.type === \'stock_in\' ? \'+\' : log.type === \'adjustment\' && log.quantity > 0 ? \'+\' : \'-\';\n                        const color = LOG_COLORS[log.type] || \'text-white/40\';\n                        return (\n                          <div key={log.id || idx}\n                            className=\"flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.02]\"\n                          >\n                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold ${color}`}\n                              style={{ background: log.type === \'stock_in\' ? \'rgba(16,185,129,0.1)\' : log.type === \'waste\' ? \'rgba(239,68,68,0.08)\' : \'rgba(212,175,55,0.08)\' }}>\n                              {log.type === \'stock_in\' ? \'G\' : log.type === \'waste\' ? \'İ\' : log.type === \'adjustment\' ? \'T\' : \'S\'}\n                            </span>\n                            <div className=\"flex-1 min-w-0\">\n                              <div className=\"flex items-center gap-2\">\n                                <span className={`text-xs font-bold ${color}`}>{LOG_LABELS[log.type] || log.type}</span>\n                                <span className=\"text-[9px] text-white/20\">\n                                  {dt.toLocaleDateString(\'az-AZ\', { day: \'2-digit\', month: \'short\', hour: \'2-digit\', minute: \'2-digit\' })}\n                                </span>\n                              </div>\n                              {log.reason && <p className=\"text-[10px] text-white/25 truncate\">{log.reason}</p>}\n                            </div>\n                            <div className=\"text-right flex-shrink-0\">\n                              <span className={`text-sm font-black tabular-nums ${color}`}>\n                                {sign}{fmt(Math.abs(log.quantity), 1)}\n                              </span>\n                              <span className=\"text-[9px] text-white/20 ml-0.5\">{UNIT_LABELS[modal.row!.unit]}</span>\n                              {log.cost_per_unit != null && (\n                                <p className=\"text-[9px] text-white/20\">₼{fmtCost(log.cost_per_unit)}/{UNIT_LABELS[modal.row!.unit]}</p>\n                              )}\n                            </div>\n                          </div>\n                        );\n                      })\n                    )}\n                  </div>\n                </div>\n              )}\n            </motion.div>\n          </div>\n        )}\n      </AnimatePresence>\n        </div>\n      </div>\n\n      {/* ── Calibration morph overlay ── */}\n      <AnimatePresence>\n        {morph && (\n          <motion.div\n            initial={{\n              position: \'fixed\',\n              left: morph.from.left,\n              top: morph.from.top,\n              width: morph.from.width,\n              height: morph.from.height,\n              opacity: 1,\n            }}\n            animate={{\n              left: morph.to.left,\n              top: morph.to.top,\n              width: morph.to.width,\n              height: morph.to.height,\n              opacity: 0,\n            }}\n            exit={{ opacity: 0 }}\n            transition={{ type: \'spring\', stiffness: 300, damping: 28, mass: 0.8 }}\n            className=\"z-50 flex items-center justify-center rounded-xl pointer-events-none\"\n            style={{\n              background: \'rgba(52,211,153,0.15)\',\n              border: \'1px solid rgba(52,211,153,0.3)\',\n              backdropFilter: \'blur(8px)\',\n            }}\n          >\n            <span className=\"text-sm font-bold text-emerald-300\">{morph.name}</span>\n          </motion.div>\n        )}\n      </AnimatePresence>\n    </PageTransition>\n  );\n}\n