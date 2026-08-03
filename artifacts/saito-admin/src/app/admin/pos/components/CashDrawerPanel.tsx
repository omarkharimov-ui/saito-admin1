'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Clock, DollarSign, X, Loader2 } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleSheet, appleBackdrop } from '@/lib/modal-transitions';

interface CashDrawerSession {
  id: string;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  difference: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

interface CashDrawerMovement {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface CashDrawerPanelProps {
  open: boolean;
  onClose: () => void;
}

export function CashDrawerPanel({ open, onClose }: CashDrawerPanelProps) {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CashDrawerSession | null>(null);
  const [movements, setMovements] = useState<CashDrawerMovement[]>([]);
  const [todaySessions, setTodaySessions] = useState<CashDrawerSession[]>([]);
  const [openingBalance, setOpeningBalance] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'main' | 'cash-in' | 'cash-out' | 'close'>('main');

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/cash-drawer');
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        setMovements(data.movements || []);
        setTodaySessions(data.todaySessions || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchData();
    }
  }, [open, fetchData]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [open]);

  const currentBalance = movements.reduce((sum, m) => {
    if (m.type === 'cash_in' || m.type === 'payment' || m.type === 'open') return sum + m.amount;
    if (m.type === 'cash_out') return sum - m.amount;
    return sum;
  }, 0);

  const cashInTotal = movements.filter(m => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0);
  const cashOutTotal = movements.filter(m => m.type === 'cash_out').reduce((s, m) => s + m.amount, 0);
  const paymentTotal = movements.filter(m => m.type === 'payment').reduce((s, m) => s + m.amount, 0);

  const handleOpenDrawer = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', amount: Number(openingBalance) || 0 }),
      });
      if (res.ok) {
        toast.success('Kassa açıldı');
        setOpeningBalance('');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta');
      }
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  const handleCashMove = async (type: 'cash_in' | 'cash_out') => {
    if (!session || !cashAmount) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, session_id: session.id, amount: Number(cashAmount), description: cashDesc || null }),
      });
      if (res.ok) {
        toast.success(type === 'cash_in' ? 'Daxilolma qeydə alındı' : 'Xərc qeydə alındı');
        setCashAmount('');
        setCashDesc('');
        setView('main');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta');
      }
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  const handleCloseDrawer = async () => {
    if (!session) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', session_id: session.id, amount: Number(cashAmount) || 0, description: cashDesc || null }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.difference !== 0) {
          toast.error(`Fərq: ${data.difference > 0 ? '+' : ''}${data.difference.toFixed(2)}₼`);
        } else {
          toast.success('Kassa düzgün bağlandı');
        }
        setCashAmount('');
        setCashDesc('');
        setView('main');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Xəta');
      }
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  if (!open) return null;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const typeLabels: Record<string, { label: string; icon: typeof Wallet; color: string }> = {
    open: { label: 'Kassa açıldı', icon: Unlock, color: 'text-green-500' },
    close: { label: 'Kassa bağlandı', icon: Lock, color: 'text-zinc-500' },
    cash_in: { label: 'Daxilolma', icon: ArrowDownCircle, color: 'text-green-500' },
    cash_out: { label: 'Xərc', icon: ArrowUpCircle, color: 'text-red-500' },
    payment: { label: 'Nağd ödəniş', icon: DollarSign, color: 'text-emerald-500' },
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[130] flex items-end justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={appleBackdrop}
          className="fixed inset-0 z-0 pointer-events-auto bg-black/20 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <motion.div
          {...appleSheet}
          className={`relative z-10 pointer-events-auto w-full max-w-md rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] border ${
            lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900/95 border-white/10'
          } overflow-hidden max-h-[85vh] flex flex-col`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-2">
              <Wallet size={20} className="text-gold" />
              <h2 className="text-lg font-black tracking-tight">Kassa</h2>
            </div>
            <button onClick={onClose} className={`p-2 rounded-xl ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/5'}`}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--theme-text-muted)]" />
              </div>
            ) : !session ? (
              /* No open session */
              <div className="space-y-4">
                <div className={`p-5 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <p className={`text-sm font-bold mb-3 ${lightMode ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    Kassa Açılışı
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign size={16} className="text-[var(--theme-text-muted)]" />
                    <input
                      type="number"
                      step="0.01"
                      value={openingBalance}
                      onChange={e => setOpeningBalance(e.target.value)}
                      placeholder="Açılış balansı (₼)"
                      className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                    />
                  </div>
                  <button
                    onClick={handleOpenDrawer}
                    disabled={submitting}
                    className="w-full py-3 rounded-2xl bg-green-500 text-white text-sm font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Kassa Aç'}
                  </button>
                </div>

                {todaySessions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-2">Bu günün sessiyaları</p>
                    {todaySessions.map(s => (
                      <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl mb-2 ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                        <div className="flex items-center gap-2">
                          {s.status === 'open' ? <Unlock size={14} className="text-green-500" /> : <Lock size={14} className="text-zinc-500" />}
                          <span className="text-xs font-bold">{formatTime(s.opened_at)}</span>
                        </div>
                        <span className={`text-xs font-bold ${s.status === 'open' ? 'text-green-500' : 'text-zinc-500'}`}>
                          {s.status === 'open' ? 'Açıq' : 'Bağlı'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Active session */
              <div className="space-y-4">
                {/* Balance card */}
                <div className={`p-5 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-text-muted)]">Cari Balans</p>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-500">
                      <Unlock size={10} /> Açıq
                    </span>
                  </div>
                  <p className="text-3xl font-black tracking-tighter tabular-nums">
                    {currentBalance.toFixed(2)} <span className="text-lg text-[var(--theme-text-muted)]">₼</span>
                  </p>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className={`p-2 rounded-xl ${lightMode ? 'bg-green-50 border border-green-200' : 'bg-green-500/10 border border-green-500/20'}`}>
                      <p className="text-[8px] font-black uppercase tracking-widest text-green-600">Nağd</p>
                      <p className="text-xs font-black tabular-nums text-green-600">{(paymentTotal + cashInTotal).toFixed(2)}₼</p>
                    </div>
                    <div className={`p-2 rounded-xl ${lightMode ? 'bg-blue-50 border border-blue-200' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                      <p className="text-[8px] font-black uppercase tracking-widest text-blue-600">Kart</p>
                      <p className="text-xs font-black tabular-nums text-blue-600">0.00₼</p>
                    </div>
                    <div className={`p-2 rounded-xl ${lightMode ? 'bg-red-50 border border-red-200' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <p className="text-[8px] font-black uppercase tracking-widest text-red-600">Xərc</p>
                      <p className="text-xs font-black tabular-nums text-red-600">-{cashOutTotal.toFixed(2)}₼</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {view === 'main' && (
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => { setView('cash-in'); setCashAmount(''); setCashDesc(''); }}
                      className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-green-50 border-green-200 text-green-600' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}
                    >
                      <ArrowDownCircle size={20} strokeWidth={2.5} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Daxilolma</span>
                    </button>
                    <button
                      onClick={() => { setView('cash-out'); setCashAmount(''); setCashDesc(''); }}
                      className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                    >
                      <ArrowUpCircle size={20} strokeWidth={2.5} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Xərc</span>
                    </button>
                    <button
                      onClick={() => { setView('close'); setCashAmount(String(currentBalance.toFixed(2))); setCashDesc(''); }}
                      className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/10 text-zinc-300'}`}
                    >
                      <Lock size={20} strokeWidth={2.5} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Smenanı Bitir</span>
                    </button>
                  </div>
                )}

                {/* Cash-in / Cash-out form */}
                {(view === 'cash-in' || view === 'cash-out') && (
                  <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                    <p className={`text-sm font-bold ${view === 'cash-in' ? 'text-green-500' : 'text-red-500'}`}>
                      {view === 'cash-in' ? 'Daxilolma' : 'Xərc'}
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder="Məbləğ (₼)"
                      className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                    />
                    <input
                      value={cashDesc}
                      onChange={e => setCashDesc(e.target.value)}
                      placeholder="Açıqlama (ixtiyari)"
                      className={`w-full rounded-xl px-4 py-3 text-sm outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>
                        Geri
                      </button>
                      <button
                        onClick={() => handleCashMove(view as 'cash_in' | 'cash_out')}
                        disabled={submitting || !cashAmount}
                        className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 ${view === 'cash-in' ? 'bg-green-500' : 'bg-red-500'}`}
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Təsdiqlə'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Close drawer */}
                {view === 'close' && (
                  <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-sm font-bold text-zinc-500">Kassa Bağlanması</p>
                    <div className={`p-3 rounded-xl ${lightMode ? 'bg-white border border-zinc-200' : 'bg-white/5 border border-white/10'}`}>
                      <p className="text-[10px] font-bold text-[var(--theme-text-muted)]">Gözlənilən balans</p>
                      <p className="text-lg font-black tabular-nums">{currentBalance.toFixed(2)}₼</p>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder="Əslində olan (₼)"
                      className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                    />
                    {cashAmount && Number(cashAmount) !== currentBalance && (
                      <div className={`p-3 rounded-xl ${Number(cashAmount) > currentBalance ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        <p className={`text-xs font-bold ${Number(cashAmount) > currentBalance ? 'text-green-500' : 'text-red-500'}`}>
                          Fərq: {Number(cashAmount) > currentBalance ? '+' : ''}{(Number(cashAmount) - currentBalance).toFixed(2)}₼
                        </p>
                      </div>
                    )}
                    <input
                      value={cashDesc}
                      onChange={e => setCashDesc(e.target.value)}
                      placeholder="Qeyd (ixtiyari)"
                      className={`w-full rounded-xl px-4 py-3 text-sm outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>
                        Geri
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Smenanı bağlamaq istədiyinizdən əminsiniz?')) {
                            handleCloseDrawer();
                          }
                        }}
                        disabled={submitting}
                        className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black disabled:opacity-50"
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Smenanı Bitir'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Movement log */}
                {movements.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-2">Hərəkətlər</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {[...movements].reverse().map(m => {
                        const cfg = typeLabels[m.type] || typeLabels.cash_in;
                        const Icon = cfg.icon;
                        return (
                          <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                            <Icon size={14} className={cfg.color} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">{cfg.label}{m.description ? ` — ${m.description}` : ''}</p>
                              <p className="text-[10px] text-[var(--theme-text-muted)]">{formatTime(m.created_at)}</p>
                            </div>
                            <span className={`text-xs font-black tabular-nums ${
                              m.type === 'cash_out' ? 'text-red-500' : 'text-green-500'
                            }`}>
                              {m.type === 'cash_out' ? '-' : '+'}{m.amount.toFixed(2)}₼
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
