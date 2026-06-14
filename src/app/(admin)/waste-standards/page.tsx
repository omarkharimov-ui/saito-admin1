'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Trash2, Edit3, X, Loader2, Percent } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import MobileModal from '@/components/ui/MobileModal';

interface WasteStandard {
  id: string;
  keyword: string;
  keyword_en: string | null;
  waste_percentage: number;
  note: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

interface ModalState {
  mode: 'add' | 'edit' | null;
  data: WasteStandard | null;
}

const toastStyle = { background: '#0f0f0f', color: '#fff', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px' };

const modalV = {
  hidden: { opacity: 0, scale: 0.96, y: 14 },
  show:   { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 32 } },
  exit:   { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.14 } },
};

export default function WasteStandardsPage() {
  const { lightMode } = useTheme();
  const [data, setData] = useState<WasteStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>({ mode: null, data: null });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const filtered = data.filter(s =>
    s.keyword.toLowerCase().includes(search.toLowerCase()) ||
    (s.keyword_en?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (s.category?.toLowerCase() || '').includes(search.toLowerCase())
  );

  const fetchData = async () => {
    try {
      const res = await fetch('/api/inventory/waste-standards');
      const json = await res.json();
      if (Array.isArray(json)) setData(json);
    } catch {
      toast.error('Məlumat yüklənə bilmədi', { style: toastStyle });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/inventory/waste-standards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: fd.get('keyword'),
          keyword_en: fd.get('keyword_en') || null,
          waste_percentage: parseFloat(fd.get('waste_percentage') as string) || 0,
          note: fd.get('note') || null,
          category: fd.get('category') || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Xəta');
      }
      toast.success('Standart əlavə edildi', { style: toastStyle });
      setModal({ mode: null, data: null });
      fetchData();
    } catch (e: any) {
      toast.error(e.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!modal.data) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/inventory/waste-standards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modal.data.id,
          keyword: fd.get('keyword'),
          keyword_en: fd.get('keyword_en') || null,
          waste_percentage: parseFloat(fd.get('waste_percentage') as string) || 0,
          note: fd.get('note') || null,
          category: fd.get('category') || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Xəta');
      }
      toast.success('Standart yeniləndi', { style: toastStyle });
      setModal({ mode: null, data: null });
      fetchData();
    } catch (e: any) {
      toast.error(e.message, { style: toastStyle });
    } finally {
      setSaving(false);
    }
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    setPendingDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const startInlineEdit = (s: WasteStandard) => {
    setEditingId(s.id);
    setEditValue(String(s.waste_percentage));
  };

  const saveInlineEdit = async (s: WasteStandard) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0 || val >= 100) {
      toast.error('0-99 arası dəyər daxil edin', { style: toastStyle });
      return;
    }
    try {
      const res = await fetch('/api/inventory/waste-standards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, waste_percentage: val }),
      });
      if (!res.ok) throw new Error('Xəta');
      setEditingId(null);
      fetchData();
    } catch {
      toast.error('Yenilənmə xətası', { style: toastStyle });
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white pb-20 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.015]"
          style={{ background: 'radial-gradient(circle, #D4AF37, transparent)' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full opacity-[0.01]"
          style={{ background: 'radial-gradient(circle, #ffffff, transparent)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold mb-2"
              style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
              <Percent size={10} /> İtki Standartları
            </span>
            <h1 className="text-xl sm:text-2xl font-bold">İtki Standartları</h1>
            <p className="text-[11px] text-white/30 mt-1">İnqrediyentlər üçün standart soyuq itki faizləri</p>
          </div>
          <button onClick={() => setModal({ mode: 'add', data: null })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0a0a0a' }}>
            <Plus size={13} /> Yeni Standart
          </button>
        </div>

        {/* ── Search ── */}
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Axtar..."
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-white/[0.04] border border-white/[0.07] text-white placeholder:text-white/20 outline-none focus:border-gold/30 transition-colors"
          />
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-white/15" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-white/20">
            <Percent size={44} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm font-medium">Standart tapılmadı</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Table head */}
            <div
              className="hidden lg:grid gap-4 px-6 py-3 text-[10px] font-bold tracking-[0.15em] uppercase text-white/20"
              style={{
                gridTemplateColumns: '1fr 1fr 100px 1fr 120px 80px',
                background: 'rgba(255,255,255,0.018)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <span>Keyword (AZ)</span>
              <span>Keyword (EN)</span>
              <span className="text-right">İtki %</span>
              <span>Qeyd</span>
              <span>Kateqoriya</span>
              <span className="text-right"></span>
            </div>

            {filtered.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className="hidden lg:grid gap-4 px-6 py-3 items-center text-sm hover:bg-white/[0.02] transition-colors"
                style={{
                  gridTemplateColumns: '1fr 1fr 100px 1fr 120px 80px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}
              >
                <span className="text-white/90 truncate">{s.keyword}</span>
                <span className="text-white/40 truncate">{s.keyword_en || '—'}</span>
                <div className="text-right">
                  {editingId === s.id ? (
                    <input
                      type="number" min="0" max="99" step="0.1"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => saveInlineEdit(s)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveInlineEdit(s);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-20 text-right bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-gold/30 tabular-nums"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="tabular-nums font-semibold cursor-pointer hover:text-gold transition-colors"
                      style={{ color: s.waste_percentage > 20 ? '#F59E0B' : s.waste_percentage > 0 ? '#D4AF37' : '#fff' }}
                      onClick={() => startInlineEdit(s)}
                    >
                      {s.waste_percentage}%
                    </span>
                  )}
                </div>
                <span className="text-white/40 truncate">{s.note || '—'}</span>
                <span className="text-white/30 truncate text-xs">{s.category || '—'}</span>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setModal({ mode: 'edit', data: s })}
                    className="w-7 h-7 rounded-lg hover:bg-[var(--theme-surface-soft)] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-all flex items-center justify-center">
                    <Edit3 size={12} />
                  </button>
                  <button onClick={() => handleDelete(s.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all flex items-center justify-center">
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            ))}

            {/* ── Mobile cards ── */}
            <div className="lg:hidden space-y-2 p-3">
              {filtered.map((s) => (
                <div key={s.id}
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{s.keyword}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal({ mode: 'edit', data: s })}
                        className="w-7 h-7 rounded-lg hover:bg-white/5 text-white/20 hover:text-white/60 transition-all flex items-center justify-center">
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => handleDelete(s.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all flex items-center justify-center">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-white/40">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-white/20">İtki</span>
                      <strong className="tabular-nums text-white/90">{s.waste_percentage}%</strong>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-white/20">EN</span>
                      <span>{s.keyword_en || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-white/20">Qeyd</span>
                      <span>{s.note || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-white/20">Kateqoriya</span>
                      <span>{s.category || '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            ADD / EDIT MODAL
        ════════════════════════════════════════════════ */}
        <AnimatePresence>
          {modal.mode && (
            <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setModal({ mode: null, data: null })}
              />
              <motion.div
                variants={modalV} initial="hidden" animate="show" exit="exit"
                className="relative z-10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl flex flex-col gap-0 overflow-hidden"
                style={{ background: lightMode ? '#ffffff' : '#0e0e0e', border: lightMode ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.08)', boxShadow: lightMode ? '0 32px 80px rgba(0,0,0,0.12)' : '0 32px 80px rgba(0,0,0,0.7)' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="sm:hidden flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-white/15" />
                </div>

                <form onSubmit={modal.mode === 'add' ? handleCreate : handleUpdate}>
                  <div className="overflow-y-auto p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-lg font-bold">{modal.mode === 'add' ? 'Yeni Standart' : 'Standartı Redaktə Et'}</h2>
                      </div>
                      <button type="button" onClick={() => setModal({ mode: null, data: null })}
                        className="text-white/25 hover:text-white transition-colors mt-1">
                        <X size={18} />
                      </button>
                    </div>

                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Keyword (AZ) <span className="text-red-400">*</span>
                      </label>
                      <input name="keyword" required
                        defaultValue={modal.data?.keyword || ''}
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Keyword (EN)
                      </label>
                      <input name="keyword_en"
                        defaultValue={modal.data?.keyword_en || ''}
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        İtki Faizi (%) <span className="text-red-400">*</span>
                      </label>
                      <input name="waste_percentage" type="number" min="0" max="99" step="0.1" required
                        defaultValue={modal.data?.waste_percentage ?? ''}
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Qeyd
                      </label>
                      <input name="note"
                        defaultValue={modal.data?.note || ''}
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-white/35 font-semibold uppercase tracking-wider mb-1.5 block">
                        Kateqoriya
                      </label>
                      <input name="category"
                        defaultValue={modal.data?.category || ''}
                        placeholder="məs: tərəvəz, meyvə, ət..."
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/[0.04] border border-white/[0.09] outline-none focus:border-gold/40 transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex-shrink-0 p-4 border-t border-white/[0.06] flex items-center gap-3">
                    <button type="button" onClick={() => setModal({ mode: null, data: null })}
                      className="flex-1 py-3 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.98] text-white/40 hover:text-white/60 border border-white/10">
                      Ləğv et
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 py-3 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0a0a0a' }}>
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={15} />}
                      {modal.mode === 'add' ? 'Əlavə et' : 'Yadda saxla'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
      <MobileModal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <div className="space-y-4 text-center">
          <h3 className="text-lg font-bold">Bu standart silinsin?</h3>
          <p className="text-sm text-[var(--theme-text-secondary)]">Bu əməliyyat geri alına bilməz.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setDeleteConfirmOpen(false)}
              className="px-4 py-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]"
            >
              Ləğv
            </button>
            <button
              onClick={async () => {
                if (!pendingDeleteId) return;
                setDeleteConfirmOpen(false);
                const id = pendingDeleteId;
                setPendingDeleteId(null);
                try {
                  const res = await fetch(`/api/inventory/waste-standards?id=${id}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error('Xəta');
                  toast.success('Standart silindi', { style: toastStyle });
                  fetchData();
                } catch {
                  toast.error('Silinmə xətası', { style: toastStyle });
                }
              }}
              className="px-4 py-2 rounded-xl bg-[var(--theme-accent)] text-black font-semibold"
            >
              Sil
            </button>
          </div>
        </div>
      </MobileModal>
    </div>
  );
}
