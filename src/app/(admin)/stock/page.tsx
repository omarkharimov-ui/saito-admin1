'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, AlertTriangle, TrendingDown, TrendingUp,
  Trash2, X, Loader2, ChevronRight, FlaskConical,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type StockUnit = 'kq' | 'ədəd' | 'litr' | 'qram';
type TransactionType = 'manual_entry' | 'sale' | 'waste';

interface StockRow {
  ingredient_id: string;
  name: string;
  unit: StockUnit;
  min_limit: number;
  total_stock: number;
  is_low_stock: boolean;
  created_at: string;
}

interface ModalState {
  mode: 'add_stock' | 'waste' | 'new_ingredient' | null;
  ingredient?: StockRow;
}

// ─── Motion variants ──────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 28 } },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  show:   { opacity: 1, scale: 1,    y: 0,  transition: { type: 'spring' as const, stiffness: 380, damping: 30 } },
  exit:   { opacity: 0, scale: 0.95, y: 8,  transition: { duration: 0.15 } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockColor(row: StockRow) {
  if (row.is_low_stock) return 'text-red-400';
  if (row.total_stock < row.min_limit * 1.5) return 'text-amber-400';
  return 'text-emerald-400';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockPage() {
  const [stock, setStock]       = useState<StockRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<ModalState>({ mode: null });
  const [saving, setSaving]     = useState(false);

  // Form state
  const [qty, setQty]           = useState('');
  const [desc, setDesc]         = useState('');
  const [newName, setNewName]   = useState('');
  const [newUnit, setNewUnit]   = useState<StockUnit>('kq');
  const [newLimit, setNewLimit] = useState('5');

  const fetchStock = useCallback(async () => {
    try {
      const res = await fetch('/api/stock/current');
      if (res.ok) setStock(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStock(); }, [fetchStock]);

  const closeModal = () => {
    setModal({ mode: null });
    setQty(''); setDesc(''); setNewName(''); setNewLimit('5'); setNewUnit('kq');
  };

  // ── Add stock / waste ────────────────────────────────────────────────────
  const handleTransaction = async () => {
    if (!modal.ingredient || !qty.trim()) return;
    const numQty = parseFloat(qty);
    if (isNaN(numQty) || numQty <= 0) {
      toast.error('Düzgün miqdar daxil edin');
      return;
    }
    setSaving(true);
    try {
      const isWaste = modal.mode === 'waste';
      const payload = {
        ingredientId: modal.ingredient.ingredient_id,
        quantity: isWaste ? -Math.abs(numQty) : Math.abs(numQty),
        type: (isWaste ? 'waste' : 'manual_entry') as TransactionType,
        description: desc.trim() || undefined,
      };
      const res = await fetch('/api/stock/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(isWaste ? 'Ziyan qeyd edildi' : 'Stok əlavə edildi', {
        style: { background: '#0f0f0f', color: '#fff', border: '1px solid rgba(212,175,55,0.25)' },
      });
      closeModal();
      fetchStock();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  // ── New ingredient ───────────────────────────────────────────────────────
  const handleNewIngredient = async () => {
    if (!newName.trim()) { toast.error('Ad daxil edin'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/stock/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), unit: newUnit, min_limit: parseFloat(newLimit) || 5 }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('İnqredient əlavə edildi', {
        style: { background: '#0f0f0f', color: '#fff', border: '1px solid rgba(212,175,55,0.25)' },
      });
      closeModal();
      fetchStock();
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ingredient ────────────────────────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" silinsin?`)) return;
    try {
      const res = await fetch(`/api/stock/ingredients?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('Silindi');
      fetchStock();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ─── Stats ─────────────────────────────────────────────────────────────
  const lowCount  = stock.filter(s => s.is_low_stock).length;
  const totalItems = stock.length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-4 py-8 sm:px-8">
      <Toaster position="top-right" />

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#2a1f00,#1a1200)', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Package size={18} className="text-[#D4AF37]" />
            </div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">Stok İdarəetmə</h1>
          </div>
          <p className="text-white/30 text-sm ml-12">
            {totalItems} inqredient &nbsp;·&nbsp;
            {lowCount > 0
              ? <span className="text-red-400 font-semibold">{lowCount} azalan stok</span>
              : <span className="text-emerald-400">Bütün stoklar normaldır</span>
            }
          </p>
        </div>

        <button
          onClick={() => setModal({ mode: 'new_ingredient' })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.97] hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0a0a0a' }}
        >
          <Plus size={15} /> Yeni İnqredient
        </button>
      </motion.div>

      {/* ── Stats strip ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8"
      >
        {[
          { label: 'Ümumi inqredient', value: totalItems, icon: <FlaskConical size={14} />, color: 'text-[#D4AF37]' },
          { label: 'Azalan stok',      value: lowCount,   icon: <AlertTriangle size={14} />, color: lowCount > 0 ? 'text-red-400' : 'text-white/25' },
          { label: 'Normal stok',      value: totalItems - lowCount, icon: <TrendingUp size={14} />, color: 'text-emerald-400' },
        ].map((stat) => (
          <div key={stat.label}
            className="rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className={`flex items-center gap-1.5 text-xs mb-1 ${stat.color}`}>
              {stat.icon}
              <span className="font-medium">{stat.label}</span>
            </div>
            <p className="text-2xl font-black">{stat.value}</p>
          </div>
        ))}
      </motion.div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="animate-spin text-white/20" />
        </div>
      ) : stock.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-center py-20 text-white/20"
        >
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Hələ inqredient yoxdur</p>
          <p className="text-xs mt-1">Yuxarıdakı düymə ilə əlavə edin</p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_100px_120px_160px] gap-4 px-5 py-3 text-[11px] font-semibold tracking-widest uppercase text-white/25"
            style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span>İnqredient</span>
            <span className="text-right">Cari Stok</span>
            <span className="text-right">Min Limit</span>
            <span className="text-center">Status</span>
            <span className="text-right">Əməliyyat</span>
          </div>

          {stock.map((row, i) => (
            <motion.div
              key={row.ingredient_id}
              variants={rowVariants}
              className="grid grid-cols-[1fr_100px_100px_120px_160px] gap-4 px-5 py-4 items-center transition-colors hover:bg-white/[0.02]"
              style={{ borderBottom: i < stock.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              {/* Name */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.12)' }}>
                  <FlaskConical size={13} className="text-[#D4AF37]/60" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">{row.name}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">{row.unit}</p>
                </div>
              </div>

              {/* Current stock */}
              <div className="text-right">
                <span className={`text-sm font-bold tabular-nums ${stockColor(row)}`}>
                  {Number(row.total_stock).toFixed(2)}
                </span>
                <span className="text-[10px] text-white/25 ml-1">{row.unit}</span>
              </div>

              {/* Min limit */}
              <div className="text-right">
                <span className="text-sm text-white/40 tabular-nums">{row.min_limit}</span>
                <span className="text-[10px] text-white/20 ml-1">{row.unit}</span>
              </div>

              {/* Status badge */}
              <div className="flex justify-center">
                {row.is_low_stock ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 border border-red-500/25 text-red-400">
                    <AlertTriangle size={9} /> Az Stok
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    <TrendingUp size={9} /> Normal
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setModal({ mode: 'add_stock', ingredient: row }); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:brightness-110 active:scale-95"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7' }}
                >
                  <TrendingUp size={11} /> Əlavə
                </button>
                <button
                  onClick={() => { setModal({ mode: 'waste', ingredient: row }); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:brightness-110 active:scale-95"
                  style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5' }}
                >
                  <TrendingDown size={11} /> Ziyan
                </button>
                <button
                  onClick={() => handleDelete(row.ingredient_id, row.name)}
                  className="p-1.5 rounded-lg transition-all hover:bg-white/5 active:scale-95 text-white/20 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal.mode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={closeModal}
            />
            <motion.div
              variants={modalVariants}
              initial="hidden" animate="show" exit="exit"
              className="relative z-10 w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5"
              style={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Close */}
              <button onClick={closeModal} className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors">
                <X size={18} />
              </button>

              {/* ─ Add / Waste modal ─ */}
              {(modal.mode === 'add_stock' || modal.mode === 'waste') && modal.ingredient && (
                <>
                  <div>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold mb-3 ${
                      modal.mode === 'waste'
                        ? 'bg-red-500/10 border border-red-500/25 text-red-400'
                        : 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
                    }`}>
                      {modal.mode === 'waste' ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                      {modal.mode === 'waste' ? 'Ziyan Qeyd Et' : 'Stok Əlavə Et'}
                    </div>
                    <h2 className="text-lg font-bold">{modal.ingredient.name}</h2>
                    <p className="text-white/30 text-sm mt-0.5">
                      Cari: <span className={`font-semibold ${stockColor(modal.ingredient)}`}>
                        {Number(modal.ingredient.total_stock).toFixed(2)} {modal.ingredient.unit}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/40 font-medium mb-1.5 block">
                        Miqdar ({modal.ingredient.unit})
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={qty}
                        onChange={e => setQty(e.target.value)}
                        placeholder="0.00"
                        autoFocus
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/5 border border-white/10 outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                      />
                    </div>
                    {modal.mode === 'waste' && (
                      <div>
                        <label className="text-xs text-white/40 font-medium mb-1.5 block">
                          Səbəb (istəyə görə)
                        </label>
                        <input
                          type="text"
                          value={desc}
                          onChange={e => setDesc(e.target.value)}
                          placeholder="Məs: Bitmə tarixi keçdi"
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/5 border border-white/10 outline-none focus:border-red-400/40 transition-colors text-sm"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleTransaction}
                    disabled={saving || !qty.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={modal.mode === 'waste'
                      ? { background: 'rgba(239,68,68,0.85)', color: '#fff' }
                      : { background: 'linear-gradient(135deg,#0f7a57,#0a5c41)', color: '#fff', border: '1px solid rgba(16,185,129,0.3)' }
                    }
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : (
                      modal.mode === 'waste' ? <><TrendingDown size={14} /> Ziyani Qeyd Et</> : <><TrendingUp size={14} /> Stoku Yenilə</>
                    )}
                  </button>
                </>
              )}

              {/* ─ New ingredient modal ─ */}
              {modal.mode === 'new_ingredient' && (
                <>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold mb-3"
                      style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
                      <Plus size={11} /> Yeni İnqredient
                    </div>
                    <h2 className="text-lg font-bold">İnqredient Əlavə Et</h2>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/40 font-medium mb-1.5 block">Ad</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Məs: Somon filesi"
                        autoFocus
                        className="w-full px-4 py-3 rounded-xl text-white bg-white/5 border border-white/10 outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-white/40 font-medium mb-1.5 block">Ölçü vahidi</label>
                        <select
                          value={newUnit}
                          onChange={e => setNewUnit(e.target.value as StockUnit)}
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/5 border border-white/10 outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                        >
                          {(['kq', 'ədəd', 'litr', 'qram'] as StockUnit[]).map(u => (
                            <option key={u} value={u} style={{ background: '#111' }}>{u}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 font-medium mb-1.5 block">Min limit</label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={newLimit}
                          onChange={e => setNewLimit(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl text-white bg-white/5 border border-white/10 outline-none focus:border-[#D4AF37]/40 transition-colors text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleNewIngredient}
                    disabled={saving || !newName.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#B8960C,#D4AF37)', color: '#0a0a0a' }}
                  >
                    {saving
                      ? <Loader2 size={15} className="animate-spin" />
                      : <><Plus size={14} /> Əlavə Et</>
                    }
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
