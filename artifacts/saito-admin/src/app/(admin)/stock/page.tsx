'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, TrendingDown, TrendingUp,
  X, Loader2, RefreshCw,
  ShieldAlert, Search,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Pencil, Lightbulb, Calculator, Trash2,
  Sparkles, Layers3, ArrowUpRight, Database, BarChart3, Clock3, Filter,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import {
  InventoryStatusRow, InventoryDashboardData,
  IngredientUnit, LowStockAlert,
  InventoryLog, DisplayUnit, normalizeToStorage, formatWithUnit, parseInputQuantity,
  Supplier,
} from '@/types/inventory';
import { getStatusMeta, StockStatusBar } from '@/components/StockStatusBadge';
import ProcurementTab from './components/ProcurementTab';
import IntelligenceTabComponent from './components/IntelligenceTab';
import { CalibrationSuggestionsPanel, CalibrationSuggestion } from './components/CalibrationSuggestionsPanel';
import { InventoryHealthCard } from './components/InventoryHealthCard'; // <-- IMPORT THE NEW COMPONENT
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';
import { InspectorPanel } from './components/InspectorPanel';

// ... (rest of the file remains the same, only the render part will be changed)

// ─── Constants ────────────────────────────────────────────────────────────────
const UNITS: DisplayUnit[] = ['gram', 'piece', 'ml', 'kg', 'liter'];

const UNIT_LABELS: Record<DisplayUnit, string> = {
  gram: 'qram', piece: 'ədəd', ml: 'ml',
  kg: 'kq', liter: 'litr',
};

const LOG_LABELS: Record<string, string> = {
  stock_in: 'Giriş', waste: 'İtki', adjustment: 'Tənzimləmə', order_consumption: 'Sifariş',
};
const LOG_COLORS: Record<string, string> = {
  stock_in: 'text-emerald-400', waste: 'text-red-400', adjustment: 'text-gold', order_consumption: 'text-white/40',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCost(n: number) {
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Modal variants ────────────────────────────────────────────────────────────

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1,    y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
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

type ModalMode = 'stock_in' | 'waste' | 'new_ingredient' | 'edit_ingredient' | 'audit' | 'history' | null;
interface ActiveModal { mode: ModalMode; row?: InventoryStatusRow }

export default function StockPage() {
  const { lightMode } = useTheme();
  const [data, setData]       = useState<InventoryDashboardData & { alerts: LowStockAlert[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<ActiveModal>({ mode: null });
  const [selectedRow, setSelectedRow] = useState<InventoryStatusRow | null>(null);
  const [saving, setSaving]   = useState(false);
  const [search, setSearch]   = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter]   = useState<'all' | 'critical' | 'out_of_stock'>('all');
  const [viewMode, setViewMode] = useState<'stock' | 'intelligence' | 'history'>('stock');
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam && ['stock', 'intelligence', 'history'].includes(tabParam)) {
      setViewMode(tabParam as typeof viewMode);
    }
  }, [tabParam]);
  const now = new Date();
  const [historyMonth, setHistoryMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [historyDay, setHistoryDay] = useState<string | null>(null);

  // Form fields
  const [qty, setQty]           = useState('');
  const [cost, setCost]         = useState('');
  const [reason, setReason]     = useState('');
  const [newName, setNewName]   = useState('');
  const [newUnit, setNewUnit]   = useState<DisplayUnit>('gram');
  const [newLimit, setNewLimit] = useState('500');
  const [newCost, setNewCost]   = useState('');
  const [newTotalQty, setNewTotalQty] = useState('');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newWastePct, setNewWastePct] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [qsName, setQsName] = useState('');
  const [qsPhone, setQsPhone] = useState('');
  const [qsContact, setQsContact] = useState('');
  const [editRow, setEditRow] = useState<InventoryStatusRow | null>(null);
  const [editQsName, setEditQsName] = useState('');
  const [editQsPhone, setEditQsPhone] = useState('');
  const [editQsContact, setEditQsContact] = useState('');
  const [auditQty, setAuditQty] = useState('');
  const [showWasteCalc, setShowWasteCalc] = useState(false);
  const [calcRaw, setCalcRaw] = useState('');
  const [calcClean, setCalcClean] = useState('');
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
    const targetRow = document.getElementById('row-' + item.ingredient_id);
    if (!targetRow) return;
    const to = targetRow.getBoundingClientRect();
    setMorph({ from, to, name: item.ingredient_name });
    setTimeout(() => {
      setMorph(null);
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    // Background refresh (user doesn't notice)
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

  const toastStyle = { background: '#0f0f0f', color: '#fff', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px' };

  // Filter logs by search when in history view
  const monthlyLogs = useMemo(() => {
    return allLogs.filter((log) => {
      const d = new Date(log.created_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (ym !== historyMonth) return false;
      if (historyDay) {
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return ymd === historyDay;
      }
      return true;
    });
  }, [allLogs, historyMonth, historyDay]);

  const filteredLogs = useMemo(() => {
    const source = viewMode === 'history' ? monthlyLogs : allLogs;
    if (!source.length) return [];
    if (!search.trim()) return source;
    const q = search.toLowerCase();
    const typeLabels: Record<string, string> = {
      stock_in: 'stoka giriş',
      waste: 'itki',
      adjustment: 'tənzimləmə',
      order_consumption: 'sifariş sərfiyyatı',
    };
    return source.filter((log) => {
      const name = ((log as any).ingredient?.name || log.ingredient_id || '').toLowerCase();
      const label = (typeLabels[log.type] || log.type || '').toLowerCase();
      const note = ((log as any).note || log.reason || '').toLowerCase();
      return name.includes(q) || label.includes(q) || note.includes(q);
    });
  }, [allLogs, monthlyLogs, search, viewMode]);

  const monthlySummary = useMemo(() => {
    let stockIn = 0, waste = 0, adjustment = 0, orderConsumption = 0;
    for (const log of monthlyLogs) {
      const q = Math.abs(Number(log.quantity) || 0);
      if (log.type === 'stock_in') stockIn += q;
      else if (log.type === 'waste') waste += q;
      else if (log.type === 'adjustment') adjustment += q;
      else if (log.type === 'order_consumption') orderConsumption += q;
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
        const severity = Math.abs(variancePct) >= 25 ? 'critical' : 'warning';
        return {
          ingredient_id: item.id,
          ingredient_name: item.name,
          suggested_adjustment_pct: Math.abs(Math.round(variancePct * 10) / 10),
          confidence: Math.min(0.95, Math.max(0.35, Math.abs(variancePct) / 100)),
          reason: severity === 'critical' ? 'Critical stock variance detected' : 'Stock variance needs review',
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
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMonthPicker]);

  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

  const AZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

  useEffect(() => {
    const [y] = historyMonth.split('-').map(Number);
    setPickerYear(y);
  }, [historyMonth]);

  const lastFetchTimeRef = useRef(0);

  const fetchData = useCallback(async () => {
    lastFetchTimeRef.current = Date.now();
    setLoading(true);
    try {
      const [invRes, supRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/suppliers'),
      ]);
      if (invRes.ok) setData(await invRes.json());
      if (supRes.ok) setSuppliers(await supRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time subscription — inventory_logs, ingredients, orders
  // Guard: skip if data was fetched within the last 1.5 s (avoids double-fire after manual save)
  useEffect(() => {
    const guard = () => { if (Date.now() - lastFetchTimeRef.current > 1500) fetchData(); };
    const channel = createRealtimeChannel('stock-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_logs' }, guard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, guard)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, guard)
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, [fetchData]);



  // Waste standards - əvvəlcə cached datanı çək
  useEffect(() => {
    fetch('/api/inventory/waste-standards').then(r => r.ok && r.json()).then(d => { if (d) setWasteStandards(d); }).catch(() => {});
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
      } catch {}
    }, 800);
  }, [wasteStandards]);

  // ── View History ─────────────────────────────────────────────────────────
  const handleViewHistory = async (row: InventoryStatusRow) => {
    setModal({ mode: 'history', row });
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
      const res = await fetch('/api/inventory/logs?limit=200');
      setAllLogs(res.ok ? await res.json() : []);
    } catch { setAllLogs([]); }
    finally { setAllLogsLoading(false); }
  }, []);

  useEffect(() => { if (viewMode === 'history') fetchAllLogs(); }, [viewMode, fetchAllLogs]);

  const closeModal = () => {
    setModal({ mode: null });
    setQty(''); setCost(''); setReason('');
    setNewName(''); setNewUnit('gram'); setNewLimit('500'); setNewCost('');
    setNewTotalQty(''); setNewTotalAmount(''); setNewWastePct(''); setNewSupplier('');
    setAuditQty(''); setShowWasteCalc(false); setCalcRaw(''); setCalcClean('');
    setFormErrors({});
    setEditRow(null); setEditQsName(''); setEditQsPhone(''); setEditQsContact('');
  };

  // ── Stock In ────────────────────────────────────────────────────────────
  const handleStockIn = async () => {
    if (!modal.row || !qty.trim()) return;
    const numQty = parseFloat(qty);
    if (isNaN(numQty) || numQty <= 0) { toast.error('Düzgün miqdar daxil edin', { style: toastStyle }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'stock_in',
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
      toast.error(e.message || 'Xəta baş verdi', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Report Waste ────────────────────────────────────────────────────────
  const handleWaste = async () => {
    if (!modal.row || !qty.trim() || !reason.trim()) {
      toast.error('Miqdar və səbəb daxil edin', { style: toastStyle }); return;
    }
    const numQty = parseFloat(qty);
    if (isNaN(numQty) || numQty <= 0) { toast.error('Düzgün miqdar daxil edin', { style: toastStyle }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'waste', ingredientId: modal.row.id, quantity: numQty, reason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`${modal.row.name} — itki qeyd edildi`, { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Stock Audit ─────────────────────────────────────────────────────────
  const handleAudit = async () => {
    if (!modal.row || !auditQty.trim()) return;
    const numQty = parseFloat(auditQty);
    if (isNaN(numQty) || numQty < 0) { toast.error('Düzgün miqdar daxil edin', { style: toastStyle }); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientId: modal.row.id, actualQty: numQty }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const result = await res.json();
      const diffSign = result.difference >= 0 ? '+' : '';
      toast.success(
        `${modal.row.name} — inventarizasiya tamamlandı · fərq: ${diffSign}${Number(result.difference).toFixed(2)} ₼${Number(result.adjustment_cost).toFixed(2)}`,
        { style: toastStyle, duration: 4000 }
      );
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi', { style: toastStyle });
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
      toast.error('Zəhmət olmasa tələb olunan sahələri doldurun', { style: toastStyle });
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
          const supRes = await fetch('/api/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        toast.error('Tədarükçü adı daxil edin', { style: toastStyle });
        setSaving(false);
        return;
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        const logRes = await fetch('/api/inventory/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'stock_in',
            ingredientId: created.id,
            quantity: normQty,
            costPerUnit: unitCost > 0 ? unitCost : undefined,
            reason: 'İlkin qeydiyyat — ' + newName.trim(),
          }),
        });
        if (!logRes.ok) {
          const errText = await logRes.text();
          toast.error('Xammal yaradıldı, amma stoka əlavə edilə bilmədi: ' + errText, { style: toastStyle });
        }
      }

      toast.success('İnqredient əlavə edildi', { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi', { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  // ── Update Ingredient ──────────────────────────────────────────────────────────
  const [updateSaving, setUpdateSaving] = useState(false);
  const [deletingIngredient, setDeletingIngredient] = useState(false);

  const handleDeleteIngredient = async () => {
    if (!editRow) return;
    if (!window.confirm(`"${editRow.name}" xammalını silmək istədiyinizə əminsiniz?`)) return;
    setDeletingIngredient(true);
    try {
      const res = await fetch(`/api/inventory/${editRow.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${editRow.name} silindi`, { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Silinə bilmədi', { style: toastStyle });
    } finally {
      setDeletingIngredient(false);
    }
  };
  const handleUpdateIngredient = async () => {
    if (!editRow) return;
    if (!newName.trim()) { toast.error('Ad tələb olunur', { style: toastStyle }); return; }
    if (!newLimit.trim()) { toast.error('Kritik limit tələb olunur', { style: toastStyle }); return; }
    setUpdateSaving(true);
    try {
      let supplierId = editRow.supplier_id;
      if (editQsName.trim()) {
        const existing = suppliers.find(s => s.name.toLowerCase() === editQsName.trim().toLowerCase());
        if (existing) {
          supplierId = existing.id;
        } else {
          const supRes = await fetch('/api/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

      const res = await fetch(`/api/inventory/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Yeniləndi', { style: toastStyle });
      closeModal();
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi', { style: toastStyle });
    } finally {
      setUpdateSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (row: InventoryStatusRow) => {
    if (!window.confirm(`${row.name} — bu xammalı silmək istədiyinizə əminsiniz?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory?id=${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Silinə bilmədi');
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
    const matchFilter = filter === 'all' || r.status === filter;
    return matchSearch && matchFilter;
  });

  const stats = data?.stats;
  const heroMetrics = [
    {
      label: 'Ümumi xammal',
      value: loading ? '—' : fmt(stats?.total ?? 0),
      icon: Database,
      note: 'Aktiv məhsul bazası',
    },
    {
      label: 'Kritik risk',
      value: loading ? '—' : fmt((stats?.critical ?? 0) + (stats?.out_of_stock ?? 0)),
      icon: ShieldAlert,
      note: 'Diqqət tələb edənlər',
    },
    {
      label: 'Ağır itki',
      value: loading ? '—' : `₼${fmtCost(stats?.monthly_waste_cost ?? 0)}`,
      icon: TrendingDown,
      note: 'Aylıq israf xərci',
    },
  ];

  const [expandedHeroCard, setExpandedHeroCard] = useState<number | null>(null);
  const expandedHeroMetric = expandedHeroCard != null ? heroMetrics[expandedHeroCard] : null;

  return (
    <PageTransition className="min-h-screen bg-[#070707] text-white pb-24">
      <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_42%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_30%)] pointer-events-none" />
      <div className="max-w-none mx-auto px-4 sm:px-6 pt-6 sm:pt-10 relative">
        <div className="space-y-6 min-w-0">
          <section className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-white/[0.03] px-6 py-6 sm:px-8 sm:py-8 backdrop-blur-2xl shadow-[0_30px_120px_rgba(0,0,0,0.28)]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_36%,transparent_64%,rgba(212,175,55,0.08))]" />
              <div className="relative flex flex-col gap-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl space-y-5">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.22em] text-white/55 uppercase">
                            <Sparkles size={12} className="text-[#D4AF37]" />
                            Premium inventory control
                        </div>
                        <div className="space-y-3">
                            <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.06em] leading-[0.95] text-white/95">Stok</h1>
                            <p className="max-w-xl text-sm sm:text-base leading-6 text-white/46">
                            İnqredientlərin canlı vəziyyəti, kritik risklər və hərəkət tarixçəsi üçün sakit, premium iş səthi.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => setModal({ mode: 'new_ingredient' })}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.12] bg-white text-black px-5 py-3 text-sm font-semibold tracking-[-0.01em] transition-transform active:scale-[0.98]"
                        >
                            <Plus size={16} /> Yeni Xammal
                        </button>
                    </div>
                </div>

                {/* <-- ADDING THE HEALTH CARD HERE --> */}
                <InventoryHealthCard stats={stats} loading={loading} />

              </div>
            </section>

          {/* ── Tab Bar ── */}
          <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] px-2 py-2 backdrop-blur-xl">
            <div className="flex items-center gap-1">
              {(['stock', 'intelligence', 'history'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setViewMode(t); router.push(`/admin/stock${t === 'stock' ? '' : `?tab=${t}`}`); }}
                  className={`relative px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                    viewMode === t
                      ? 'text-white'
                      : 'text-white/35 hover:text-white/70'
                  }`}
                >
                  {viewMode === t && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute inset-0 rounded-2xl bg-white/[0.08] border border-white/[0.06]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {t === 'stock' ? 'Stok' : t === 'intelligence' ? 'İntellekt' : 'Tarixçə'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {viewMode === 'stock' && (
            <section className="rounded-[36px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] p-4 sm:p-5 backdrop-blur-2xl shadow-[0_24px_100px_rgba(0,0,0,0.28)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-[0.24em] text-white/50 uppercase">
                      <Sparkles size={12} className="text-[#D4AF37]" />
                      Live stock surface
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.05em] text-white/95">Sakit, tam ekran iş səthi</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">Tək bir geniş paneldə xammal vəziyyətini göstər, sonra kartı açaraq detalları morf kimi dərinləşdir.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 xl:w-full">
                    {heroMetrics.map((metric, index) => {
                      const Icon = metric.icon;
                      const isActive = expandedHeroCard === index;
                      return (
                        <motion.button
                          key={metric.label}
                          layout
                          onClick={() => setExpandedHeroCard(isActive ? null : index)}
                          className={`group relative overflow-hidden rounded-[32px] border border-white/[0.06] bg-white/[0.03] px-5 py-6 text-left transition-all duration-300 ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'}`}
                          style={{ minHeight: 210 }}
                        >
                          <motion.div layout className="flex h-full min-h-[180px] flex-col justify-between gap-6">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/28">{metric.label}</p>
                                <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] tabular-nums text-white/95">{metric.value}</p>
                              </div>
                              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] text-white/70 transition-transform duration-300 group-hover:scale-[1.03]">
                                <Icon size={18} />
                              </span>
                            </div>
                            <div className="space-y-3">
                              <div className="h-px w-full bg-white/[0.08]" />
                              <p className="text-[11px] leading-5 text-white/34">{metric.note}</p>
                              <p className="text-[11px] uppercase tracking-[0.24em] text-white/22">Tap to expand</p>
                            </div>
                          </motion.div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {viewMode === 'stock' && (
              <div className="grid gap-4">
                <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5 backdrop-blur-xl">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/70">
                        <Filter size={16} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white/90">Axtarış və filtrlər</p>
                        <p className="text-xs text-white/35">Dəqiq axtar, riskə görə ayır və məhsulu seç.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(['all', 'critical', 'out_of_stock'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={`rounded-full px-4 py-2 text-xs font-medium transition-all ${filter === f ? 'bg-white text-black' : 'border border-white/[0.08] bg-white/[0.03] text-white/55 hover:text-white/80'}`}
                        >
                          {f === 'all' ? 'Hamısı' : f === 'critical' ? 'Kritik' : 'Bitib'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                      <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/25" />
                      <input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Xammal axtar..."
                        className="w-full rounded-2xl border border-white/[0.08] bg-black/20 py-3 pl-10 pr-10 text-sm text-white outline-none placeholder:text-white/22 focus:border-white/20"
                        onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setIsSearchOpen(false); } }}
                      />
                      {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/70">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {viewMode === 'stock' && (
              <div className="grid gap-4">
                <CalibrationSuggestionsPanel
                  suggestions={calibrationSuggestions}
                  onApplyStart={handleCalibrationApplyStart}
                  onApplied={handleCalibrationApplied}
                />
              </div>
            )}

            {viewMode === 'stock' && (
              <>
                <AnimatePresence>
                  {expandedHeroMetric && (
                    <motion.div
                      className="fixed inset-0 z-[70] flex items-stretch justify-stretch p-0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setExpandedHeroCard(null)}
                    >
                      <motion.div
                        className="absolute inset-0 bg-black/70 backdrop-blur-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                      <motion.div
                        layoutId={`hero-metric-${expandedHeroCard}`}
                        className="relative z-10 h-full w-full rounded-none border border-white/[0.08] bg-[#0c0c0c] p-6 sm:p-10 shadow-[0_40px_140px_rgba(0,0,0,0.55)]"
                        initial={{ scale: 0.96, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.96, y: 20 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/30">{expandedHeroMetric.label}</p>
                            <p className="mt-4 text-5xl sm:text-6xl font-semibold tracking-[-0.06em] tabular-nums text-white/96">{expandedHeroMetric.value}</p>
                            <p className="mt-3 max-w-lg text-sm leading-6 text-white/45">{expandedHeroMetric.note}. Bu kart toxunulduqda açılır və daha böyük səthdə detalları göstərir.</p>
                          </div>
                          <button onClick={() => setExpandedHeroCard(null)} className="rounded-full border border-white/[0.08] bg-white/[0.04] p-3 text-white/70 transition-colors hover:bg-white/[0.08]">
                            <X size={16} />
                          </button>
                        </div>
                        <div className="mt-10 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-white/30">Fokus</p>
                            <p className="mt-2 text-sm text-white/70">Məlumatı genişləndirilmiş səthdə oxu</p>
                          </div>
                          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-white/30">Əlaqə</p>
                            <p className="mt-2 text-sm text-white/70">Kart və panel arasında keçid morf kimi görünür</p>
                          </div>
                          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.24em] text-white/30">Növbəti addım</p>
                            <p className="mt-2 text-sm text-white/70">İstəsən burada ayrıca daxili drill-down da qura bilərik</p>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Inventory Table ── */}
                {loading ? (
                  <div className="flex items-center justify-center min-h-[28rem] rounded-[28px] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
                    <Loader2 size={28} className="animate-spin text-white/15" />
                  </div>
                ) : rows.length === 0 ? (
                  <GlassCard intensity="light" padding="xl" className="text-center xl:min-h-[28rem] flex flex-col justify-center">
                    <Package size={44} className="mx-auto mb-4 opacity-20 text-white/30" />
                    <p className="text-sm font-medium text-white/30">
                      {search || filter !== 'all' ? 'Axtarış nəticəsi tapılmadı' : 'Hələ xammal əlavə edilməyib'}
                    </p>
                    {!search && filter === 'all' && (
                      <div className="mt-4 space-y-2 text-xs text-white/20">
                        <p>📍 "Yeni Xammal" düyməsi ilə anbara məhsul əlavə edin</p>
                        <p>📄 "Tədarük" sekmesinden faktura yükləyərək OCR ilə avtomatik əlavə edin</p>
                        <p>⚙️ Hər xammal üçün kritik limit və vahid maya dəyəri təyin edin</p>
                      </div>
                    )}
                  </GlassCard>
                ) : (
                  <GlassCard intensity="light" padding="none" className="overflow-hidden bg-white/[0.04] backdrop-blur-xl xl:min-h-[36rem]">
                    {/* Table head */}
                    <div
                      className="hidden lg:grid gap-4 px-6 py-3 text-[11px] font-medium uppercase text-white/25 tracking-wider"
                      style={{
                        gridTemplateColumns: '1fr 120px 100px 140px 100px 90px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
              <span>Ad</span>
              <span>Stok Səviyyəsi</span>
              <span className="text-right">Stok</span>
              <span className="text-right">Maya Dəyəri</span>
              <span className="text-center">Status</span>
              <span className="text-center">Əməliyyat</span>
            </div>

            {rows.map((row) => {
              const meta = getStatusMeta(row.status);
              return (
                <div
                  id={'row-' + row.id}
                  key={row.id}
                  className="px-4 lg:px-6 py-4 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors duration-150 cursor-pointer"
                  onClick={() => setSelectedRow(row)}
                >
                  {/* Desktop row */}
                  <div
                    className="hidden lg:grid gap-4 items-center"
                    style={{ gridTemplateColumns: '1fr 120px 100px 140px 100px 90px' }}
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/90 truncate leading-none">{row.name}</p>
                      <p className="text-[11px] text-white/25 mt-1">{UNIT_LABELS[row.unit]}</p>
                    </div>

                    {/* Stock Level bar */}
                    <div className="pr-8">
                      <StockBar ratio={Number(row.stock_ratio)} status={row.status} />
                      {(row as any).cold_waste_percentage > 0 && (
                        <p className="text-[10px] text-rose-400/40 mt-1">itki: {row.cold_waste_percentage}%</p>
                      )}
                    </div>

                    {/* Current stock */}
                    <div className="text-right">
                      <span className="text-base font-semibold tabular-nums text-white/90">
                        {fmt(row.current_stock, 1)}
                      </span>
                    </div>

                    {/* Cost */}
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-white/95">
                        ₼{fmtCost((row.current_stock || 0) * (row.purchase_price ?? row.average_cost_per_unit))}
                      </p>
                      <p className="text-[11px] text-white/30 mt-0.5">
                        ₼{fmtCost(row.purchase_price ?? row.average_cost_per_unit)} / {UNIT_LABELS[row.unit]}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold ${meta.bg} ${meta.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>

                    {/* Action */}
                    <div className="flex justify-center">
                      {(row.status === 'out_of_stock' || row.status === 'critical') && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-red-300 bg-red-400/10 border border-red-400/20">
                          Kritik
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/90">{row.name}</p>
                        <p className="text-[11px] text-white/25">{UNIT_LABELS[row.unit]}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${meta.bg} ${meta.text}`}>
                        <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <StockBar ratio={Number(row.stock_ratio)} status={row.status} />
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold tabular-nums text-white/90">{fmt(row.current_stock, 1)} {UNIT_LABELS[row.unit]}</span>
                      <span className="font-semibold tabular-nums text-white/95">
                        ₼{fmtCost((row.current_stock || 0) * (row.purchase_price ?? row.average_cost_per_unit))}
                      </span>
                    </div>
                    {(row.status === 'out_of_stock' || row.status === 'critical') && (
                      <span className="mt-2 w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold text-red-300 bg-red-400/10 border border-red-400/20">
                        Kritik
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </GlassCard>
        )}
      </> )}

        {viewMode === 'intelligence' && (
          <div className="max-w-3xl">
            <IntelligenceTabComponent />
          </div>
        )}

        {viewMode === 'history' && (
          <>
          <div className="space-y-4">
            {/* ── Premium Calendar Picker ── */}
            <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-white/40">
              {historyDay ? 'Günlük Tarixçə' : 'Aylıq Tarixçə'} <span className="text-white/15">({filteredLogs.length})</span>
            </p>
            {historyDay && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setHistoryDay(null)}
                className="text-[10px] font-bold px-2 py-1 rounded-lg text-white/40 hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Bütün ay
              </motion.button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div ref={monthPickerRef} className="relative">
              <motion.button
                onClick={() => setShowMonthPicker(!showMonthPicker)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all"
                style={{
                  background: showMonthPicker ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.04)',
                  border: showMonthPicker ? '1px solid rgba(212,175,55,0.25)' : '1px solid rgba(255,255,255,0.08)',
                  color: showMonthPicker ? '#D4AF37' : 'rgba(255,255,255,0.7)',
                }}
              >
                <span>
                  {historyDay
                    ? new Date(historyDay).toLocaleDateString('az-AZ', { day: 'numeric', year: 'numeric', month: 'long' })
                    : new Date(historyMonth + '-01').toLocaleDateString('az-AZ', { year: 'numeric', month: 'long' })}
                </span>
                <motion.svg
                  animate={{ rotate: showMonthPicker ? 180 : 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </motion.svg>
              </motion.button>

              <AnimatePresence>
                {showMonthPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl overflow-hidden"
                    style={{
                      background: '#121212',
                      border: '1px solid rgba(255,255,255,0.08)',
                      boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    }}
                  >
                    {/* Month/Year navigator */}
                    <div className="flex items-center justify-between px-5 pt-4 pb-1">
                      <motion.button
                        onClick={() => setPickerYear(p => p - 1)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </motion.button>
                      <div className="flex items-center gap-2">
                        <motion.span
                          key={pickerYear + 'y'}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm font-bold text-white/80"
                        >
                          {pickerYear}
                        </motion.span>
                        <span className="text-sm font-bold text-white/40">·</span>
                        <motion.span
                          key={pickerYear + 'm'}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm font-bold text-[#D4AF37]"
                        >
                          {AZ_MONTHS[parseInt(historyMonth.split('-')[1]) - 1]}
                        </motion.span>
                      </div>
                      <motion.button
                        onClick={() => setPickerYear(p => p + 1)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </motion.button>
                    </div>

                    {/* Day-of-week headers */}
                    <div className="grid grid-cols-7 gap-1 px-4 pt-3 pb-1">
                      {['B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş', 'B'].map(d => (
                        <span key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-white/20">
                          {d}
                        </span>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1 px-4 pb-3">
                      {(() => {
                        const [y, m] = [pickerYear, parseInt(historyMonth.split('-')[1])];
                        const firstDay = new Date(y, m - 1, 1).getDay();
                        const daysInMonth = new Date(y, m, 0).getDate();
                        const days: React.ReactNode[] = [];
                        // Empty cells before first day
                        for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
                          days.push(<div key={`e-${i}`} />);
                        }
                        // Day cells
                        for (let d = 1; d <= daysInMonth; d++) {
                          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          const isSelected = dateStr === historyDay;
                          const isToday = dateStr === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                          days.push(
                            <motion.button
                              key={dateStr}
                              onClick={() => {
                                setHistoryDay(dateStr);
                                setShowMonthPicker(false);
                              }}
                              className="relative flex items-center justify-center h-9 rounded-xl text-xs font-semibold transition-colors"
                              style={{
                                background: isSelected
                                  ? 'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(212,175,55,0.1))'
                                  : isToday && !isSelected
                                    ? 'rgba(255,255,255,0.06)'
                                    : 'transparent',
                                border: isSelected
                                  ? '1px solid rgba(212,175,55,0.35)'
                                  : isToday && !isSelected
                                    ? '1px solid rgba(255,255,255,0.1)'
                                    : '1px solid transparent',
                                color: isSelected ? '#D4AF37' : isToday ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
                              }}
                            >
                              {d}
                              {isToday && !isSelected && (
                                <span className="absolute bottom-1 w-1 h-0.5 rounded-full bg-[#D4AF37]/40" />
                              )}
                            </motion.button>
                          );
                        }
                        return days;
                      })()}
                    </div>

                    {/* Month pills */}
                    <div className="border-t border-white/[0.06] px-4 py-3" style={{ background: 'rgba(255,255,255,0.015)' }}>
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {AZ_MONTHS.map((name, idx) => {
                          const monthStr = `${pickerYear}-${String(idx + 1).padStart(2, '0')}`;
                          const isSelected = monthStr === historyMonth;
                          return (
                            <motion.button
                              key={monthStr}
                              onClick={() => {
                                setHistoryMonth(monthStr);
                                setHistoryDay(null);
                                setShowMonthPicker(false);
                              }}
                              className="shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide transition-colors"
                              style={{
                                background: isSelected ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                                color: isSelected ? '#D4AF37' : 'rgba(255,255,255,0.4)',
                              }}
                            >
                              {name}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
          </div>
        </div>

        {/* ── Monthly summary cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <GlassCard intensity="light" padding="md" className="border-emerald-500/15">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400/60 font-bold">Stoka Giriş</p>
            <p className="text-lg font-black text-emerald-400 tabular-nums mt-1">
              {fmt(monthlySummary.stockIn, 1)}
            </p>
          </GlassCard>
          <GlassCard intensity="light" padding="md" className="border-red-500/15">
            <p className="text-[10px] uppercase tracking-wider text-red-400/60 font-bold">İtki</p>
            <p className="text-lg font-black text-red-400 tabular-nums mt-1">
              {fmt(monthlySummary.waste, 1)}
            </p>
          </GlassCard>
          <GlassCard intensity="light" padding="md" className="border-amber-500/15">
            <p className="text-[10px] uppercase tracking-wider text-gold/60 font-bold">Tənzimləmə</p>
            <p className="text-lg font-black text-gold tabular-nums mt-1">
              {fmt(monthlySummary.adjustment, 1)}
            </p>
          </GlassCard>
          <GlassCard intensity="light" padding="md" className="border-white/10">
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Sifariş Sərfiyyatı</p>
            <p className="text-lg font-black text-white/70 tabular-nums mt-1">
              {fmt(monthlySummary.orderConsumption, 1)}
            </p>
          </GlassCard>
        </div>

        {/* ── History table ── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="hidden lg:grid gap-4 px-6 py-3 text-[11px] font-bold tracking-[0.15em] uppercase text-white/30"
            style={{
              gridTemplateColumns: '120px 1fr 100px 90px 110px 1fr',
              background: 'rgba(255,255,255,0.018)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
            <span>Növ</span>
            <span>Xammal</span>
            <span className="text-right">Miqdar</span>
            <span className="text-right">Maya</span>
            <span className="text-right">Tarix</span>
            <span>Qeyd</span>
          </div>
          {allLogsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={24} className="animate-spin text-white/[0.12]" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <GlassCard intensity="light" padding="xl" className="text-center">
              <Package size={36} className="mx-auto mb-3 opacity-20 text-white/30" />
              <p className="text-sm text-white/30">
                {search.trim() ? 'Axtarış nəticəsi tapılmadı' : 'Hələ heç bir əməliyyat qeydə alınmayıb'}
              </p>
              {!search.trim() && (
                <p className="text-xs text-white/15 mt-2">
                  Stok girişi, itki və ya inventarizasiya əməliyyatları etdikdən sonra
                  <br />bütün hərəkətlər burada görünəcək.
                </p>
              )}
            </GlassCard>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filteredLogs.map((log: any, idx: number) => {
                const dt = new Date(log.created_at);
                const sign = log.type === 'stock_in' ? '+' : log.type === 'adjustment' && log.quantity > 0 ? '+' : '-';
                const color = LOG_COLORS[log.type] || 'text-white/40';
                const bgMap: Record<string, string> = {
                  stock_in: 'rgba(16,185,129,0.1)',
                  waste: 'rgba(239,68,68,0.08)',
                  adjustment: 'rgba(212,175,55,0.08)',
                };
                return (
                  <div key={log.id || idx} className="space-y-2 px-4 py-3 lg:grid lg:grid-cols-[120px_1fr_100px_90px_110px_1fr] lg:gap-4 lg:px-6 lg:py-4 lg:items-center transition-colors hover:bg-white/[0.018]">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider ${color}`}
                      style={{ background: bgMap[log.type] || 'rgba(255,255,255,0.04)' }}>
                      {LOG_LABELS[log.type] || log.type}
                    </span>
                    <span className="truncate text-sm font-semibold text-white/90">
                      {log.ingredient?.name || log.ingredient_id?.slice(0, 8)}
                    </span>
                    <span className={`text-right text-sm font-bold tabular-nums ${color}`}>
                      {sign}{fmt(Math.abs(log.quantity), 1)} {log.ingredient?.unit || ''}
                    </span>
                    <span className="text-right text-xs text-white/50 tabular-nums">
                      {log.type === 'order_consumption' ? '—' : log.cost_per_unit != null ? `₼${fmtCost(log.cost_per_unit)}` : '—'}
                    </span>
                    <span className="text-right text-xs text-white/50">
                      {dt.toLocaleDateString('az-AZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs text-white/40 truncate">
                      {log.type === 'order_consumption' ? '—' : log.note || '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          </div>
          </> )}
        <InspectorPanel
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          UNIT_LABELS={UNIT_LABELS}
          onStockIn={(r) => { setSelectedRow(null); setModal({ mode: 'stock_in', row: r }); }}
          onWaste={(r) => { setSelectedRow(null); setModal({ mode: 'waste', row: r }); }}
          onAudit={(r) => { setSelectedRow(null); setModal({ mode: 'audit', row: r }); }}
          onHistory={(r) => { setSelectedRow(null); setModal({ mode: 'history', row: r }); }}
          onDelete={(r) => handleDelete(r)}
        />

        {/* ═══════════════════════════════════════════════════════
            MODALS
        ════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {modal.mode && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeModal}
            />

            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl flex flex-col gap-0 overflow-hidden"
              style={{ background: lightMode ? '#ffffff' : '#0e0e0e', border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.08)', boxShadow: lightMode ? '0 32px 80px rgba(0,0,0,0.12)' : '0 32px 80px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle (mobile) */}
              <div className="sm:hidden flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* ── STOCK IN ── */}
              {modal.mode === 'stock_in' && modal.row && (
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                        <TrendingUp size={10} /> Mal Qəbulu
                      </span>
                      <h2 className="text-xl font-bold leading-tight">{modal.row.name}</h2>
                      <p className="text-white/30 text-xs mt-0.5">
                        Cari: <span className={`font-semibold ${getStatusMeta(modal.row.status).text}`}>
                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}
                        </span>
                      </p>
                    </div>
                    <button onClick={closeModal} className="text-white/25 hover:text-white transition-colors mt-1">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Miqdar ({UNIT_LABELS[modal.row!.unit]})
                      </label>
                      <input type="number" min="0.001" step="0.001" value={qty}
                        onChange={e => setQty(e.target.value)} placeholder="0.000" autoFocus
                        className="w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-emerald-500/40 transition-colors text-base font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Maya dəyəri / {UNIT_LABELS[modal.row!.unit]} (₼) — istəyə görə
                      </label>
                      <input type="number" min="0" step="0.0001" value={cost}
                        onChange={e => setCost(e.target.value)} placeholder="0.0000"
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-emerald-500/40 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Qeyd — istəyə görə
                      </label>
                      <input type="text" value={reason}
                        onChange={e => setReason(e.target.value)} placeholder="Məs: Limasol çatdırılması"
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-emerald-500/40 transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <button onClick={handleStockIn} disabled={saving || !qty.trim()}
                    className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg,#0a5c41,#0f7a57)', color: '#fff', border: '1px solid rgba(16,185,129,0.25)' }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <><TrendingUp size={15} /> Stoku Artır</>}
                  </button>
                </div>
              )}

              {/* ── WASTE ── */}
              {modal.mode === 'waste' && modal.row && (
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5 bg-red-500/10 border border-red-500/25 text-red-400">
                        <TrendingDown size={10} /> İtki / Zay Qeydi
                      </span>
                      <h2 className="text-xl font-bold leading-tight">{modal.row.name}</h2>
                      <p className="text-white/30 text-xs mt-0.5">
                        Cari: <span className={`font-semibold ${getStatusMeta(modal.row.status).text}`}>
                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}
                        </span>
                      </p>
                    </div>
                    <button onClick={closeModal} className="text-white/25 hover:text-white transition-colors mt-1">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Miqdar ({UNIT_LABELS[modal.row!.unit]})
                      </label>
                      <input type="number" min="0.001" step="0.001" value={qty}
                        onChange={e => setQty(e.target.value)} placeholder="0.000" autoFocus
                        className="w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-red-500/40 transition-colors text-base font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Səbəb <span className="text-red-400">*</span>
                      </label>
                      <input type="text" value={reason}
                        onChange={e => setReason(e.target.value)} placeholder="Məs: Bitmə tarixi keçdi, Zədəli"
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-red-500/40 transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <button onClick={handleWaste} disabled={saving || !qty.trim() || !reason.trim()}
                    className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg,#7f1d1d,#991b1b)', color: '#fff', border: '1px solid rgba(239,68,68,0.3)' }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <><TrendingDown size={15} /> İtki Qeyd Et</>}
                  </button>
                </div>
              )}

              {/* ── AUDIT ── */}
              {modal.mode === 'audit' && modal.row && (
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                        <RefreshCw size={10} /> İnventarizasiya
                      </span>
                      <h2 className="text-xl font-bold leading-tight">{modal.row.name}</h2>
                      <p className="text-white/30 text-xs mt-0.5 space-y-0.5">
                        <span>Cari (sistem): <span className="font-semibold text-white/60">
                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}
                        </span></span>
                        <br />
                        <span>Nəzəri: <span className="font-semibold text-white/60">
                          {fmt(modal.row.theoretical_stock, 1)} {UNIT_LABELS[modal.row!.unit]}
                        </span></span>
                      </p>
                    </div>
                    <button onClick={closeModal} className="text-white/25 hover:text-white transition-colors mt-1">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="rounded-xl p-4"
                    style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-0.5">Real Faktiki Stok</p>
                    <p className="text-[10px] text-white/20 mb-3">Fiziki olaraq hazırda anbarda olan miqdarı daxil edin. Sistem nəzəri stoku bu dəyərlə əvəzləyəcək və fərqi adjustment kimi qeydə alacaq.</p>
                    <input type="number" min="0" step="0.001" value={auditQty}
                      onChange={e => setAuditQty(e.target.value)} placeholder="0.000" autoFocus
                      className="w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-base font-bold"
                    />
                    {auditQty.trim() && !isNaN(parseFloat(auditQty)) && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-3 flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.12)' }}
                      >
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Gözlənilən Fərq</span>
                        <span className={`text-sm font-black tabular-nums ${(parseFloat(auditQty) - modal.row.current_stock) !== 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {(parseFloat(auditQty) - modal.row.current_stock) > 0 ? '+' : ''}
                          {(parseFloat(auditQty) - modal.row.current_stock).toFixed(2)} {UNIT_LABELS[modal.row!.unit]}
                        </span>
                      </motion.div>
                    )}
                  </div>

                  <button onClick={handleAudit} disabled={saving || !auditQty.trim()}
                    className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                    style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <><RefreshCw size={15} /> Təsdiq Et</>}
                  </button>
                </div>
              )}

              {/* ── NEW INGREDIENT ── */}
              {modal.mode === 'new_ingredient' && (
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                        style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                        <Plus size={10} /> Yeni Xammal
                      </span>
                      <h2 className="text-xl font-bold">İnqredient əlavə et</h2>
                    </div>
                    <button onClick={closeModal} className="text-white/25 hover:text-white transition-colors mt-1">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Ad</label>
                      <input type="text" value={newName} onChange={e => { setNewName(e.target.value); setFormErrors(p => ({ ...p, name: false })); setShowWasteCalc(false); lookupWasteStandard(e.target.value); }}
                        placeholder="Məs: Avokado" autoFocus
                        className="w-full px-4 py-3.5 rounded-xl text-white bg-white/[0.04] border outline-none transition-colors text-sm font-semibold"
                        style={{
                          borderColor: formErrors.name ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.09)',
                          background: formErrors.name ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.04)',
                        }}
                      />
                      {(() => {
                        if (!newName.trim() || wasteStandards.length === 0) return null;
                        const lower = newName.toLowerCase();
                        const match = wasteStandards.find(s =>
                          s.keyword && lower.includes(s.keyword.toLowerCase())
                        );
                        if (!match) return null;
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all active:scale-[0.98]"
                            style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)' }}
                            onClick={() => { setNewWastePct(String(match.waste_percentage)); }}
                          >
                            <div className="flex items-center gap-2">
                              <Lightbulb size={12} className="text-gold" />
                              <span className="text-[10px] text-white/40">
                                Standart itki: <span className="font-bold text-gold">{match.waste_percentage}%</span>
                                <span className="text-white/20 ml-1">· {match.note || ''}</span>
                              </span>
                            </div>
                            <span className="text-[9px] font-bold text-gold hover:text-white transition-colors">Tətbiq et →</span>
                          </motion.div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Təchizatçı <span className="text-red-400/60">*</span>
                      </label>
                      <div className="space-y-2">
                        <input value={qsName} onChange={e => setQsName(e.target.value)}
                          placeholder="Tədarükçü adı"
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                        <div className="flex gap-2">
                          <input value={qsPhone} onChange={e => setQsPhone(e.target.value)} placeholder="Telefon"
                            className="flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                          <input value={qsContact} onChange={e => setQsContact(e.target.value)} placeholder="Əlaqə şəxs"
                            className="flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Vahid</label>
                        <select value={newUnit} onChange={e => setNewUnit(e.target.value as IngredientUnit)}
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                        >
                          {UNITS.map(u => (
                            <option key={u} value={u} style={{ background: '#111' }}>{UNIT_LABELS[u]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Kritik limit</label>
                        <input type="number" min="0" step="1" value={newLimit}
                          onChange={e => { setNewLimit(e.target.value); setFormErrors(p => ({ ...p, criticalLimit: false })); }}
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                          style={{
                            borderColor: formErrors.criticalLimit ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.09)',
                            background: formErrors.criticalLimit ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.04)',
                          }}
                        />
                      </div>
                    </div>

                    {/* Satınalma məlumatları — Alınan Miqdar + Ödənilən Məbləğ */}
                    <div className="rounded-xl p-4 space-y-3"
                      style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gold/60">Son Alış Fakturası</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                            Alınan Miqdar
                          </label>
                          <input type="number" min="0" step="1" value={newTotalQty}
                            onChange={e => { setNewTotalQty(e.target.value); setFormErrors(p => ({ ...p, totalQty: false })); }}
                            placeholder="Məs: 5000"
                            className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border outline-none transition-colors text-sm font-bold"
                            style={{
                              borderColor: formErrors.totalQty ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.09)',
                              background: formErrors.totalQty ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.04)',
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
            Ümumi Məbləğ (₼)
                          </label>
                          <input type="number" min="0" step="0.01" value={newTotalAmount}
                            onChange={e => { setNewTotalAmount(e.target.value); setFormErrors(p => ({ ...p, totalAmount: false })); }}
                            placeholder="Məs: 150"
                            className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border outline-none transition-colors text-sm font-bold"
                            style={{
                              borderColor: formErrors.totalAmount ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.09)',
                              background: formErrors.totalAmount ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.04)',
                            }}
                          />
                        </div>
                      </div>
                      {calculatedUnitCost !== null && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}
                        >
                          <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Vahid Maya Dəyəri</span>
                          <span className="text-sm font-black text-gold tabular-nums">
                            ₼{fmtCost(calculatedUnitCost)} / {UNIT_LABELS[newUnit]}
                          </span>
                        </motion.div>
                      )}
                    </div>

                    {/* İtki faizi */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                          İtki Faizi (%) <span className="text-white/20">— istəyə görə</span>
                        </label>
                        <input type="number" min="0" max="99" step="1" value={newWastePct}
                          onChange={e => setNewWastePct(e.target.value)}
                          placeholder="Məs: 10"
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                          Maya dəyəri / vahid (₼) <span className="text-white/20">— manual</span>
                        </label>
                        <input type="number" min="0" step="0.0001" value={newCost}
                          onChange={e => setNewCost(e.target.value)} placeholder="0.0000"
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                        />
                      </div>
                    </div>

                    {/* Effektiv maya dəyəri (itki daxil olmaqla) */}
                    {parseFloat(newWastePct) > 0 && effectiveUnitCost > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
                      >
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-red-400/60 font-semibold">Effektiv Maya (itki daxil)</span>
                          <p className="text-[9px] text-white/20">+{parseFloat(newWastePct)}% itki uyğunlaşdırması</p>
                        </div>
                        <span className="text-sm font-black text-red-400 tabular-nums">
                          ₼{fmtCost(effectiveUnitCost)} / {UNIT_LABELS[newUnit]}
                        </span>
                      </motion.div>
                    )}

                    {/* İtki kalkulyatoru */}
                    <div>
                      <button
                        onClick={() => setShowWasteCalc(!showWasteCalc)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all active:scale-[0.99]"
                        style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.1)' }}
                      >
                        <div className="flex items-center gap-2">
                          <Calculator size={12} className="text-gold/60" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gold/60">
                            {showWasteCalc ? 'Kalkulyatoru bağla' : '🧮 İtki Kalkulyatoru'}
                          </span>
                        </div>
                        {showWasteCalc ? <ChevronUp size={12} className="text-gold/40" /> : <ChevronDown size={12} className="text-gold/40" />}
                      </button>

                      <AnimatePresence>
                        {showWasteCalc && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-2 p-3 rounded-xl space-y-2"
                              style={{ background: 'rgba(212,175,55,0.03)', border: '1px solid rgba(212,175,55,0.08)' }}
                            >
                              <p className="text-[9px] text-white/25 leading-relaxed">
                                Sınaq bişirilməsi: götürdüyünüz çəki və təmizləndikdən sonra qalan çəkini daxil edin, proqram itki faizini avtomatik hesablasın.
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[8px] text-white/30 uppercase tracking-wider block mb-1">Götürülən (qr)</label>
                                  <input type="number" min="0" step="1" value={calcRaw}
                                    onChange={e => setCalcRaw(e.target.value)} placeholder="1000"
                                    className="w-full px-3 py-2 rounded-lg text-white bg-white/[0.04] border border-white/[0.07] outline-none focus:border-gold/30 transition-colors text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="text-[8px] text-white/30 uppercase tracking-wider block mb-1">Təmiz qalan (qr)</label>
                                  <input type="number" min="0" step="1" value={calcClean}
                                    onChange={e => setCalcClean(e.target.value)} placeholder="880"
                                    className="w-full px-3 py-2 rounded-lg text-white bg-white/[0.04] border border-white/[0.07] outline-none focus:border-gold/30 transition-colors text-sm"
                                  />
                                </div>
                              </div>
                              {calcRaw && calcClean && !isNaN(parseFloat(calcRaw)) && !isNaN(parseFloat(calcClean)) && parseFloat(calcRaw) > 0 && (() => {
                                const pct = ((parseFloat(calcRaw) - parseFloat(calcClean)) / parseFloat(calcRaw)) * 100;
                                return (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                                    style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.12)' }}
                                  >
                                    <span className="text-[9px] text-white/40">Hesablanmış itki faizi</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-black text-gold tabular-nums">{pct.toFixed(1)}%</span>
                                      <button
                                        onClick={() => { setNewWastePct(pct.toFixed(0)); setShowWasteCalc(false); }}
                                        className="text-[9px] font-bold px-2 py-1 rounded-lg transition-all active:scale-95"
                                        style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}
                                      >
                                        Tətbiq et
                                      </button>
                                    </div>
                                  </motion.div>
                                );
                              })()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <button onClick={handleNewIngredient} disabled={saving}
                    className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                    style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin text-white" /> : <><Plus size={15} /> Əlavə Et</>}
                  </button>
                </div>
              )}

              {/* ── EDIT INGREDIENT ── */}
              {modal.mode === 'edit_ingredient' && editRow && (
                (() => {
                  const existingSupplier = editRow.supplier_id ? suppliers.find(s => s.id === editRow.supplier_id) : null;
                  return (
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between mb-1">
                        <h2 className="text-lg font-bold">Xammalı Redaktə Et</h2>
                        <button onClick={closeModal} className="text-white/25 hover:text-white transition-colors"><X size={18} /></button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Ad</label>
                          <input value={newName} onChange={e => setNewName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                        </div>
                        <div>
                          <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Təchizatçı</label>
                          <input value={editQsName} onChange={e => setEditQsName(e.target.value)}
                            placeholder={existingSupplier?.name || 'Tədarükçü adı'}
                            className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                          <div className="flex gap-2 mt-2">
                            <input value={editQsPhone} onChange={e => setEditQsPhone(e.target.value)} placeholder={existingSupplier?.phone || 'Telefon'}
                              className="flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                            <input value={editQsContact} onChange={e => setEditQsContact(e.target.value)} placeholder={existingSupplier?.contact_person || 'Əlaqə şəxs'}
                              className="flex-1 px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Vahid</label>
                            <select value={newUnit} onChange={e => setNewUnit(e.target.value as IngredientUnit)}
                              className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm">
                              {UNITS.map(u => <option key={u} value={u} style={{ background: '#111' }}>{UNIT_LABELS[u]}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">Kritik limit</label>
                            <input type="number" min="0" step="1" value={newLimit} onChange={e => setNewLimit(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">İtki Faizi (%)</label>
                          <input type="number" min="0" max="99" step="1" value={newWastePct} onChange={e => setNewWastePct(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleUpdateIngredient} disabled={updateSaving || deletingIngredient}
                          className="flex-1 py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                          style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}>
                          {updateSaving ? <Loader2 size={16} className="animate-spin text-white" /> : <><Pencil size={15} /> Yadda saxla</>}
                        </button>
                        <button onClick={handleDeleteIngredient} disabled={deletingIngredient || updateSaving}
                          className="px-4 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                          {deletingIngredient ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* ── HISTORY ── */}
              {modal.mode === 'history' && modal.row && (
                <div className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#a0a0a0' }}>
                        <RefreshCw size={10} /> Tarixçə
                      </span>
                      <h2 className="text-xl font-bold leading-tight">{modal.row.name}</h2>
                      <p className="text-white/30 text-xs mt-0.5">
                        Cari stok: <span className={`font-semibold ${getStatusMeta(modal.row.status).text}`}>
                          {fmt(modal.row.current_stock, 1)} {UNIT_LABELS[modal.row!.unit]}
                        </span>
                      </p>
                    </div>
                    <button onClick={closeModal} className="text-white/25 hover:text-white transition-colors mt-1">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-1">
                    {historyLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 size={20} className="animate-spin text-white/15" />
                      </div>
                    ) : historyLogs.length === 0 ? (
                      <div className="text-center py-12 text-white/20 text-xs">
                        <Package size={28} className="mx-auto mb-2 opacity-30" />
                        Heç bir əməliyyat tapılmadı
                      </div>
                    ) : (
                      historyLogs.map((log: any, idx: number) => {
                        const dt = new Date(log.created_at);
                        const sign = log.type === 'stock_in' ? '+' : log.type === 'adjustment' && log.quantity > 0 ? '+' : '-';
                        const color = LOG_COLORS[log.type] || 'text-white/40';
                        return (
                          <div key={log.id || idx}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.02]"
                          >
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold ${color}`}
                              style={{ background: log.type === 'stock_in' ? 'rgba(16,185,129,0.1)' : log.type === 'waste' ? 'rgba(239,68,68,0.08)' : 'rgba(212,175,55,0.08)' }}>
                              {log.type === 'stock_in' ? 'G' : log.type === 'waste' ? 'İ' : log.type === 'adjustment' ? 'T' : 'S'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${color}`}>{LOG_LABELS[log.type] || log.type}</span>
                                <span className="text-[9px] text-white/20">
                                  {dt.toLocaleDateString('az-AZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {log.reason && <p className="text-[10px] text-white/25 truncate">{log.reason}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span className={`text-sm font-black tabular-nums ${color}`}>
                                {sign}{fmt(Math.abs(log.quantity), 1)}
                              </span>
                              <span className="text-[9px] text-white/20 ml-0.5">{UNIT_LABELS[modal.row!.unit]}</span>
                              {log.cost_per_unit != null && (
                                <p className="text-[9px] text-white/20">₼{fmtCost(log.cost_per_unit)}/{UNIT_LABELS[modal.row!.unit]}</p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </div>
      </div>

      {/* ── Calibration morph overlay ── */}
      <AnimatePresence>
        {morph && (
          <motion.div
            initial={{
              position: 'fixed',
              left: morph.from.left,
              top: morph.from.top,
              width: morph.from.width,
              height: morph.from.height,
              opacity: 1,
            }}
            animate={{
              left: morph.to.left,
              top: morph.to.top,
              width: morph.to.width,
              height: morph.to.height,
              opacity: 0,
            }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.8 }}
            className="z-50 flex items-center justify-center rounded-xl pointer-events-none"
            style={{
              background: 'rgba(52,211,153,0.15)',
              border: '1px solid rgba(52,211,153,0.3)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="text-sm font-bold text-emerald-300">{morph.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
