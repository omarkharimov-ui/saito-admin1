'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Percent, Plus, X, Loader2, Search, ChevronDown, Copy, ToggleLeft, Trash2,
} from 'lucide-react';
import { toast } from '@/lib/toast';
import { PageTransition } from '@/components/PageTransition';
import { GlassCard } from '@/components/GlassCard';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  title: string | null;
  description: string | null;
  type: string | null;
  discount_value: number | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  priority: number | null;
  min_purchase_amount: number | null;
  min_items: number | null;
  target_type: string | null;
  target_id: string | null;
  max_discount_amount: number | null;
  current_uses: number | null;
  max_uses: number | null;
  label: string | null;
  badge_color: string | null;
  image_url: string | null;
  created_at: string | null;
}

interface CampaignForm {
  title: string;
  type: string;
  discount_value: string;
  status: string;
  start_date: string;
  end_date: string;
  priority: string;
  min_purchase_amount: string;
  min_items: string;
  target_type: string;
  target_id: string;
  max_discount_amount: string;
  max_uses: string;
  label: string;
  badge_color: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CAMPAIGN_TYPES = ['PERCENTAGE', 'HAPPY_HOUR', 'BOGO', 'BUY2GET1', 'FIXED_AMOUNT'] as const;

const CAMPAIGN_STATUSES = ['active', 'inactive', 'draft', 'expired'] as const;

const TARGET_TYPES = ['product', 'category', 'combo', 'all'] as const;

const TYPE_META: Record<string, { label: string; cls: string }> = {
  PERCENTAGE:  { label: 'Faiz', cls: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  HAPPY_HOUR:  { label: 'Xoşbəxt saat', cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  BOGO:        { label: 'BOGO', cls: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  BUY2GET1:    { label: '2 al 1 ödə', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  FIXED_AMOUNT:{ label: 'Sabit məbləğ', cls: 'text-rose-400 bg-rose-500/15 border-rose-500/30' },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active:   { label: 'Aktiv', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  inactive: { label: 'Deaktiv', cls: 'text-zinc-400 bg-zinc-500/15 border-zinc-500/30' },
  draft:    { label: 'Qaralama', cls: 'text-amber-400/80 bg-amber-500/10 border-amber-500/20' },
  expired:  { label: 'Vaxtı bitib', cls: 'text-red-400/80 bg-red-500/10 border-red-500/20' },
};

const EMPTY_FORM: CampaignForm = {
  title: '',
  type: 'PERCENTAGE',
  discount_value: '',
  status: 'draft',
  start_date: '',
  end_date: '',
  priority: '0',
  min_purchase_amount: '',
  min_items: '0',
  target_type: 'all',
  target_id: '',
  max_discount_amount: '',
  max_uses: '',
  label: '',
  badge_color: '#D4AF37',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('az-AZ', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateRange(start: string | null, end: string | null) {
  if (!start && !end) return '—';
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

// ─── Modal variants ────────────────────────────────────────────────────────

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

// ─── Badges ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string | null }) {
  const m = TYPE_META[type || ''] || { label: type || '—', cls: 'text-white/40 bg-white/[0.04] border-white/[0.08]' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const m = STATUS_META[status || ''] || { label: status || '—', cls: 'text-white/40 bg-white/[0.04] border-white/[0.08]' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${m.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {m.label}
    </span>
  );
}

// ─── Label helper ──────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
      {children}{required && <span className="text-red-400"> *</span>}
    </label>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      setCampaigns(json.data || json || []);
    } catch (e: any) {
      toast.error('Məlumatlar yüklənərkən xəta baş verdi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filter ───────────────────────────────────────────────────────────────

  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(c =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q) ||
      (STATUS_META[c.status || '']?.label || '').toLowerCase().includes(q),
    );
  }, [campaigns, search]);

  // ── Form helpers ─────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (camp: Campaign) => {
    setEditingId(camp.id);
    setForm({
      title: camp.title || '',
      type: camp.type || 'PERCENTAGE',
      discount_value: camp.discount_value != null ? String(camp.discount_value) : '',
      status: camp.status || 'draft',
      start_date: camp.start_date || '',
      end_date: camp.end_date || '',
      priority: String(camp.priority ?? 0),
      min_purchase_amount: camp.min_purchase_amount != null ? String(camp.min_purchase_amount) : '',
      min_items: String(camp.min_items ?? 0),
      target_type: camp.target_type || 'all',
      target_id: camp.target_id || '',
      max_discount_amount: camp.max_discount_amount != null ? String(camp.max_discount_amount) : '',
      max_uses: camp.max_uses != null ? String(camp.max_uses) : '',
      label: camp.label || '',
      badge_color: camp.badge_color || '#D4AF37',
    });
    setShowModal(true);
  };

  const updateForm = (field: keyof CampaignForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors";
  const selectCls = "w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-[#D4AF37]/40 transition-colors text-sm appearance-none";

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('Kampaniya adı daxil edin'); return; }
    if (!form.discount_value) { toast.error('Endirim dəyəri daxil edin'); return; }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        type: form.type,
        discount_value: parseFloat(form.discount_value) || 0,
        status: form.status,
        start_date: form.start_date ? form.start_date.split('T')[0] : null,
        end_date: form.end_date ? form.end_date.split('T')[0] : null,
        priority: parseInt(form.priority) || 0,
        min_purchase_amount: parseFloat(form.min_purchase_amount) || 0,
        min_items: parseInt(form.min_items) || 0,
        target_type: form.target_type,
        target_id: form.target_id || null,
        max_discount_amount: form.max_discount_amount ? parseFloat(form.max_discount_amount) : null,
        max_uses: form.max_uses ? parseInt(form.max_uses) : 0,
        label: form.label.trim() || null,
        badge_color: form.badge_color || '#D4AF37',
      };

      if (editingId) payload.id = editingId;

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error((await res.json()).error);

      toast.success(editingId ? 'Kampaniya yeniləndi' : 'Kampaniya yaradıldı');
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle status ────────────────────────────────────────────────────────

  const handleToggleStatus = async (camp: Campaign) => {
    const newStatus = camp.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/campaigns?id=${camp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(newStatus === 'active' ? 'Kampaniya aktivləşdirildi' : 'Kampaniya deaktiv edildi');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
  };

  // ── Duplicate ────────────────────────────────────────────────────────────

  const handleDuplicate = async (camp: Campaign) => {
    try {
      const payload: Record<string, any> = {
        title: `${camp.title || 'Kampaniya'} (Kopya)`,
        type: camp.type,
        discount_value: camp.discount_value,
        status: 'draft',
        start_date: camp.start_date,
        end_date: camp.end_date,
        priority: camp.priority || 0,
        min_purchase_amount: camp.min_purchase_amount || 0,
        min_items: camp.min_items || 0,
        target_type: camp.target_type || 'all',
        target_id: camp.target_id || null,
        max_discount_amount: camp.max_discount_amount,
        max_uses: camp.max_uses,
        label: camp.label,
        badge_color: camp.badge_color || '#D4AF37',
      };

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Kampaniya kopyalandı');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Kampaniya silindi');
      setDeleteConfirm(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const renderFormField = (
    field: keyof CampaignForm,
    label: string,
    type: 'text' | 'number' | 'select' | 'datetime-local' | 'color' = 'text',
    options?: readonly string[],
    placeholder?: string,
  ) => {
    if (type === 'select' && options) {
      return (
        <div className="relative">
          <select
            value={form[field]}
            onChange={e => updateForm(field, e.target.value)}
            className={selectCls}
          >
            {options.map(opt => (
              <option key={opt} value={opt} style={{ background: '#111' }}>
                {STATUS_META[opt]?.label || TYPE_META[opt]?.label || opt}
              </option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/30" />
        </div>
      );
    }

    if (type === 'color') {
      return (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form[field]}
            onChange={e => updateForm(field, e.target.value)}
            className="w-10 h-10 rounded-xl border border-white/[0.09] bg-transparent cursor-pointer"
          />
          <input
            type="text"
            value={form[field]}
            onChange={e => updateForm(field, e.target.value)}
            placeholder="#D4AF37"
            className={`${inputCls} flex-1`}
          />
        </div>
      );
    }

    return (
      <input
        type={type}
        value={form[field]}
        onChange={e => updateForm(field, e.target.value)}
        placeholder={placeholder}
        min={type === 'number' ? '0' : undefined}
        step={type === 'number' ? 'any' : undefined}
        className={inputCls}
      />
    );
  };

  return (
    <PageTransition className="min-h-screen bg-[var(--theme-bg)] text-[var(--theme-text)] pb-20">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-48 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(ellipse,#D4AF37,transparent 70%)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1e1600,#140f00)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Percent size={20} className="text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight leading-none">
                Qiymət Kampaniyaları
              </h1>
              <p className="text-[11px] text-[var(--theme-text-muted)] uppercase tracking-[0.2em] mt-1">
                Pricing Campaigns
              </p>
            </div>
          </div>

          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97]"
            style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
          >
            <Plus size={15} /> Yeni Kampaniya
          </button>
        </motion.div>

        {/* ── Search ── */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--theme-text-muted)] pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Kampaniya axtar..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] outline-none focus:border-[#D4AF37]/30 transition-colors"
          />
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-white/15" />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <GlassCard intensity="light" padding="xl" className="text-center">
            <Percent size={44} className="mx-auto mb-4 opacity-20 text-[var(--theme-text-muted)]" />
            <p className="text-sm font-medium text-[var(--theme-text-secondary)]">
              {search ? 'Axtarış nəticəsi tapılmadı' : 'Hələ kampaniya yaradılmayıb'}
            </p>
            {!search && (
              <div className="mt-4 space-y-2 text-xs text-[var(--theme-text-muted)]">
                <p>"Yeni Kampaniya" düyməsi ilə ilk kampaniyanı yaradın</p>
              </div>
            )}
          </GlassCard>
        ) : (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Table head */}
            <div
              className="hidden lg:grid gap-4 px-6 py-3 text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--theme-text-muted)]"
              style={{
                gridTemplateColumns: '1fr 80px 80px 90px 140px 100px 100px 100px',
                background: 'rgba(255,255,255,0.018)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span>Ad</span>
              <span>Növ</span>
              <span>Status</span>
              <span className="text-right">Endirim</span>
              <span className="text-right">Tarix</span>
              <span className="text-right">İstifadə</span>
              <span className="text-right">Prioritet</span>
              <span className="text-right">Əməliyyat</span>
            </div>

            {filteredCampaigns.map((camp, i) => (
              <motion.div
                key={camp.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="group px-4 lg:px-6 py-4 transition-colors hover:bg-white/[0.018]"
                style={{ borderBottom: i < filteredCampaigns.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                {/* Desktop row */}
                <div
                  className="hidden lg:grid gap-4 items-center"
                  style={{ gridTemplateColumns: '1fr 80px 80px 90px 140px 100px 100px 100px' }}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    {camp.badge_color && (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: camp.badge_color }} />
                    )}
                    <p className="text-sm font-semibold truncate">{camp.title || 'Adsız'}</p>
                  </div>
                  <div><TypeBadge type={camp.type} /></div>
                  <div><StatusBadge status={camp.status} /></div>
                  <div className="text-right">
                    <span className="text-sm font-bold tabular-nums">
                      {camp.type === 'PERCENTAGE' || camp.type === 'HAPPY_HOUR'
                        ? `%${fmtCurrency(camp.discount_value)}`
                        : `₼${fmtCurrency(camp.discount_value)}`}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[var(--theme-text-secondary)]">
                      {fmtDateRange(camp.start_date, camp.end_date)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs tabular-nums text-[var(--theme-text-secondary)]">
                      {camp.current_uses ?? 0}/{camp.max_uses ?? '∞'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs tabular-nums text-[var(--theme-text-secondary)]">{camp.priority ?? 0}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleToggleStatus(camp)}
                      className={`w-7 h-7 rounded-lg transition-all flex items-center justify-center ${
                        camp.status === 'active'
                          ? 'text-emerald-400 hover:bg-emerald-500/10'
                          : 'text-zinc-500 hover:bg-white/[0.06]'
                      }`}
                      title={camp.status === 'active' ? 'Deaktiv et' : 'Aktivləşdir'}
                    >
                      <ToggleLeft size={14} />
                    </button>

                    <button
                      onClick={() => handleDuplicate(camp)}
                      className="w-7 h-7 rounded-lg hover:bg-white/[0.06] transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"
                      title="Kopyala"
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      onClick={() => openEdit(camp)}
                      className="w-7 h-7 rounded-lg hover:bg-white/[0.06] transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] text-xs font-bold"
                      title="Redaktə et"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>

                    <button
                      onClick={() => setDeleteConfirm(camp.id)}
                      className="w-7 h-7 rounded-lg hover:bg-red-500/10 transition-all flex items-center justify-center text-[var(--theme-text-muted)] hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Mobile card */}
                <div className="lg:hidden space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      {camp.badge_color && (
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: camp.badge_color }} />
                      )}
                      <div>
                        <p className="text-sm font-semibold">{camp.title || 'Adsız'}</p>
                        <p className="text-xs text-[var(--theme-text-muted)] mt-0.5">{camp.label}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <StatusBadge status={camp.status} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[var(--theme-text-secondary)]">
                    <span><TypeBadge type={camp.type} /></span>
                    <span className="tabular-nums">
                      {camp.type === 'PERCENTAGE' || camp.type === 'HAPPY_HOUR'
                        ? `%${fmtCurrency(camp.discount_value)}`
                        : `₼${fmtCurrency(camp.discount_value)}`}
                    </span>
                    <span className="tabular-nums">
                      {camp.current_uses ?? 0}/{camp.max_uses ?? '∞'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[var(--theme-text-muted)]">{fmtDateRange(camp.start_date, camp.end_date)}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleStatus(camp)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          camp.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-white/[0.04] text-zinc-500 border border-white/[0.08]'
                        }`}
                      >
                        <ToggleLeft size={14} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(camp)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text-muted)]"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => openEdit(camp)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] border border-white/[0.08] text-[var(--theme-text-muted)]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(camp.id)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════
          CREATE / EDIT MODAL
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl flex flex-col gap-0"
              style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="sm:hidden flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              <div className="p-6 space-y-6">
                {/* Modal header */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2.5"
                      style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                      {editingId ? <Percent size={10} /> : <Plus size={10} />} {editingId ? 'Redaktə' : 'Yeni Kampaniya'}
                    </span>
                    <h2 className="text-xl font-bold">{editingId ? 'Kampaniyanı redaktə et' : 'Yeni kampaniya yarat'}</h2>
                  </div>
                  <button onClick={() => setShowModal(false)} className="text-white/25 hover:text-white transition-colors mt-1">
                    <X size={18} />
                  </button>
                </div>

                {/* ── Basic Info ── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Əsas məlumatlar</p>
                  <div>
                    <Label required>Ad</Label>
                    {renderFormField('title', 'Ad', 'text', undefined, 'Kampaniya adı')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label required>Növ</Label>
                      {renderFormField('type', 'Növ', 'select', CAMPAIGN_TYPES)}
                    </div>
                    <div>
                      <Label required>Endirim dəyəri</Label>
                      {renderFormField('discount_value', 'Endirim dəyəri', 'number', undefined, '0')}
                    </div>
                    <div>
                      <Label>Status</Label>
                      {renderFormField('status', 'Status', 'select', CAMPAIGN_STATUSES)}
                    </div>
                  </div>
                </div>

                {/* ── Schedule ── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Tarix</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Başlama tarixi</Label>
                      {renderFormField('start_date', 'Başlama tarixi', 'datetime-local')}
                    </div>
                    <div>
                      <Label>Bitmə tarixi</Label>
                      {renderFormField('end_date', 'Bitmə tarixi', 'datetime-local')}
                    </div>
                  </div>
                </div>

                {/* ── Targeting ── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Hədəfləmə</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Hədəf növü</Label>
                      {renderFormField('target_type', 'Hədəf növü', 'select', TARGET_TYPES)}
                    </div>
                    <div>
                      <Label>Hədəf ID</Label>
                      {renderFormField('target_id', 'Hədəf ID', 'text', undefined, 'Məhsul/kateqoriya/kombinasiya UUID')}
                    </div>
                  </div>
                </div>

                {/* ── Limits & Rules ── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Məhdudiyyətlər</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <Label>Prioritet</Label>
                      {renderFormField('priority', 'Prioritet', 'number')}
                    </div>
                    <div>
                      <Label>Min. məbləğ</Label>
                      {renderFormField('min_purchase_amount', 'Min. məbləğ', 'number')}
                    </div>
                    <div>
                      <Label>Min. say</Label>
                      {renderFormField('min_items', 'Min. say', 'number')}
                    </div>
                    <div>
                      <Label>Maks. endirim</Label>
                      {renderFormField('max_discount_amount', 'Maks. endirim', 'number')}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Maks. istifadə</Label>
                      {renderFormField('max_uses', 'Maks. istifadə', 'number')}
                    </div>
                  </div>
                </div>

                {/* ── Display ── */}
                <div className="space-y-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--theme-text-muted)]">Ekran</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Etiket (POS-da göstərilir)</Label>
                      {renderFormField('label', 'Etiket', 'text', undefined, 'Məs: Endirim 20%')}
                    </div>
                    <div>
                      <Label>Nişan rəngi</Label>
                      {renderFormField('badge_color', 'Nişan rəngi', 'color')}
                    </div>
                  </div>
                </div>

                {/* ── Submit ── */}
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: '#111111', color: '#ffffff', border: '1px solid rgba(255,255,255,0.16)' }}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <><Percent size={15} /> {editingId ? 'Yenilə' : 'Yarat'}</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════
          DELETE CONFIRM
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
            />
            <motion.div
              variants={modalV} initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full max-w-sm rounded-2xl p-6 text-center space-y-4"
              style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-red-500/10 border border-red-500/20">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Kampaniya silinsin?</h3>
                <p className="text-sm text-[var(--theme-text-secondary)] mt-1">Bu əməliyyat geri alına bilməz.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/[0.08] text-[var(--theme-text-secondary)] hover:bg-white/[0.04] transition-all"
                >
                  Ləğv et
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                >
                  Sil
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
