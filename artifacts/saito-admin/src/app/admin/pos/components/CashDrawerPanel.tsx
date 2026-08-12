'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Clock, DollarSign, X, Loader2, User, FileText, CreditCard } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleBackdrop, slideUp, fastExit } from '@/lib/modal-transitions';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

interface CashDrawerSession {
  id: string;
  staff_id?: string;
  staff_name?: string;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  difference: number | null;
  opened_at: string;
  closed_at?: string;
  status: string;
  notes?: string;
  card_total?: number;
  opened_by?: { name?: string };
  closed_by?: { name?: string };
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
  const keyboardHeight = useKeyboardHeight();
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
  const cardPaymentTotal = movements.filter(m => m.type === 'card_payment').reduce((s, m) => s + m.amount, 0);

  const handleOpenDrawer = async () => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', amount: Number(openingBalance) || 0 }),
      });
      if (res.ok) {
        toast.success(t('cash_drawer_open'));
        setOpeningBalance('');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || t('error'));
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
        toast.success(type === 'cash_in' ? t('cash_in_recorded') : t('expense_recorded'));
        setCashAmount('');
        setCashDesc('');
        setView('main');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || t('error'));
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
          toast.error(`${t('difference_short')}: ${data.difference > 0 ? '+' : ''}${data.difference.toFixed(2)}₼`);
        } else {
          toast.success(t('cash_drawer_closed'));
        }
        setCashAmount('');
        setCashDesc('');
        setView('main');
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || t('error'));
      }
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  if (!open) return null;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatDuration = (start: string, end?: string | null) => {
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diff = Math.max(0, Math.floor((e - s) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}s ${m}dq`;
  };

  const shiftDuration = session?.opened_at ? formatDuration(session.opened_at, session.closed_at) : '0s 0dq';

  const typeLabels: Record<string, { labelKey: string; icon: typeof Wallet; color: string }> = {
    open: { labelKey: 'cash_drawer_open', icon: Unlock, color: 'text-green-500' },
    close: { labelKey: 'cash_drawer_closed', icon: Lock, color: 'text-zinc-500' },
    cash_in: { labelKey: 'cash_in', icon: ArrowDownCircle, color: 'text-green-500' },
    cash_out: { labelKey: 'expense', icon: ArrowUpCircle, color: 'text-red-500' },
    payment: { labelKey: 'cash_payment', icon: DollarSign, color: 'text-emerald-500' },
    card_payment: { labelKey: 'card_payment', icon: CreditCard, color: 'text-blue-500' },
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[130] flex items-end justify-center pointer-events-none" style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : undefined }}>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastExit}
          className="fixed inset-0 z-0 pointer-events-auto bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          {...slideUp}
          className={`relative z-10 pointer-events-auto w-full max-w-md rounded-t-6xl shadow-overlay border ${
            lightMode ? 'bg-white/85 border-zinc-200' : 'bg-zinc-900/85 border-white/10'
          } overflow-hidden max-h-[85vh] flex flex-col backdrop-blur-2xl`}
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
                    {t('cash_drawer_opening')}
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign size={16} className="text-[var(--theme-text-muted)]" />
                    <input
                      type="number"
                      step="0.01"
                      value={openingBalance}
                      onChange={e => setOpeningBalance(e.target.value)}
                      placeholder={t('opening_balance')}
                       className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />
                  </div>
                  <button
                    onClick={handleOpenDrawer}
                    disabled={submitting}
                    className="w-full py-3 rounded-2xl bg-green-500 text-white text-sm font-black uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('open_cash')}
                  </button>
                </div>
              </div>
            ) : (
              /* Active session */
              <div className="space-y-4">
                {/* Shift info card */}
                <div className={`p-5 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                     <div className="flex items-center justify-between mb-3">
                       <div className="flex items-center gap-2">
                        <User size={14} className="text-[var(--theme-text-muted)]" />
                        <p className="text-xs font-bold text-[var(--theme-text)]">{session?.staff_name || 'Kassir'}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-bold text-green-500">
                        <Unlock size={10} /> {t('open')}
                      </span>
                    </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-2 rounded-xl ${lightMode ? 'bg-white border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                      <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('shift_started')}</p>
                      <p className="text-xs font-black tabular-nums">{formatTime(session.opened_at)}</p>
                    </div>
                    <div className={`p-2 rounded-xl ${lightMode ? 'bg-white border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                      <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('duration')}</p>
                      <p className="text-xs font-black tabular-nums">{shiftDuration}</p>
                    </div>
                  </div>
                </div>

                {/* Balance card */}
                <div className={`p-5 rounded-2xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)]">Cari Balans</p>
                    <span className="flex items-center gap-1 text-xs font-bold text-green-500">
                      <Unlock size={10} /> {t('open')}
                    </span>
                  </div>
                  <p className="text-[32px] font-black tracking-tighter tabular-nums">
                    {currentBalance.toFixed(2)} <span className="text-lg text-[var(--theme-text-muted)]">₼</span>
                  </p>
                   <div className="grid grid-cols-3 gap-3 mt-3">
                     <div className={`p-2 rounded-xl ${lightMode ? 'bg-green-50 border border-green-200' : 'bg-green-500/10 border border-green-500/20'}`}>
                       <p className="text-xs font-black uppercase tracking-widest text-green-600">{t('cash')}</p>
                       <p className="text-xs font-black tabular-nums text-green-600">{(paymentTotal + cashInTotal).toFixed(2)}₼</p>
                     </div>
                     <div className={`p-2 rounded-xl ${lightMode ? 'bg-blue-50 border border-blue-200' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                       <p className="text-xs font-black uppercase tracking-widest text-blue-600">Kart</p>
                       <p className="text-xs font-black tabular-nums text-blue-600">{(session?.card_total || cardPaymentTotal).toFixed(2)}₼</p>
                     </div>
                     <div className={`p-2 rounded-xl ${lightMode ? 'bg-red-50 border border-red-200' : 'bg-red-500/10 border border-red-500/20'}`}>
                       <p className="text-xs font-black uppercase tracking-widest text-red-600">{t('expense')}</p>
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
                       <span className="text-xs font-black uppercase tracking-widest">Daxilolma</span>
                     </button>
                     <button
                       onClick={() => { setView('cash-out'); setCashAmount(''); setCashDesc(''); }}
                       className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                     >
                       <ArrowUpCircle size={20} strokeWidth={2.5} />
                       <span className="text-xs font-black uppercase tracking-widest">{t('expense')}</span>
                     </button>
                     <button
                       onClick={() => { setView('close'); setCashAmount(String(currentBalance.toFixed(2))); setCashDesc(''); }}
                       className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/10 text-zinc-300'}`}
                     >
                       <Lock size={20} strokeWidth={2.5} />
                       <span className="text-xs font-black uppercase tracking-widest">{t('end_shift')}</span>
                     </button>
                   </div>
                 )}

                 {/* Cash-in / Cash-out form */}
                {(view === 'cash-in' || view === 'cash-out') && (
                  <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                    <p className={`text-sm font-bold ${view === 'cash-in' ? 'text-green-500' : 'text-red-500'}`}>
                      {view === 'cash-in' ? t('cash_in') : t('expense')}
                    </p>
                    <input
                      type="number"
                      step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder={t('amount')}
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                     />
                      <input
                        value={cashDesc}
                        onChange={e => setCashDesc(e.target.value)}
                        placeholder={t('description_optional') || 'Açıqlama (ixtiyari)'}
                        className={`w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                      />
                    <div className="flex gap-2">
                      <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>
                        {t('back')}
                      </button>
                      <button
                        onClick={() => handleCashMove(view as 'cash_in' | 'cash_out')}
                        disabled={submitting || !cashAmount}
                        className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white disabled:opacity-50 ${view === 'cash-in' ? 'bg-green-500' : 'bg-red-500'}`}
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('confirm')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Close drawer */}
                {view === 'close' && (
                  <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-sm font-bold text-zinc-500">{t('cash_drawer_closing')}</p>
                    <div className={`p-3 rounded-xl ${lightMode ? 'bg-white border border-zinc-200' : 'bg-white/5 border border-white/10'}`}>
                      <p className="text-xs font-bold text-[var(--theme-text-muted)]">{t('expected_balance')}</p>
                      <p className="text-lg font-black tabular-nums">{currentBalance.toFixed(2)}₼</p>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder={t('actual_balance')}
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />
                    {cashAmount && Number(cashAmount) !== currentBalance && (
                      <div className={`p-3 rounded-xl ${Number(cashAmount) > currentBalance ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        <p className={`text-xs font-bold ${Number(cashAmount) > currentBalance ? 'text-green-500' : 'text-red-500'}`}>
                          t('difference') {Number(cashAmount) > currentBalance ? '+' : ''}{(Number(cashAmount) - currentBalance).toFixed(2)}₼
                        </p>
                      </div>
                    )}
                    <input
                      value={cashDesc}
                      onChange={e => setCashDesc(e.target.value)}
                      placeholder="Qeyd (ixtiyari)"
                       className={`w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>
                        {t('back')}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(t('confirm_end_shift'))) {
                            handleCloseDrawer();
                          }
                        }}
                        disabled={submitting}
                        className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black disabled:opacity-50"
                      >
                        {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('end_shift')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Movement log */}
                {movements.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-2">{t('transactions')}</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {[...movements].reverse().map(m => {
                        const cfg = typeLabels[m.type] || typeLabels.cash_in;
                        const Icon = cfg.icon;
                        return (
                          <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                            <Icon size={14} className={cfg.color} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">{t(cfg.labelKey as any)}{m.description ? ` — ${m.description}` : ''}</p>
                              <p className="text-xs text-[var(--theme-text-muted)]">{formatTime(m.created_at)}</p>
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

             {todaySessions.length > 0 && (
               <div>
                 <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-2">{t('shift_entry')}</p>
                 <div className="space-y-1.5">
                   {todaySessions.map(s => {
                     const isOpen = s.status === 'open';
                     const staffName = s.opened_by?.name || s.staff_name || 'Kassir';
                     return (
                       <div key={s.id} className={`p-3 rounded-xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                             {isOpen ? <Unlock size={14} className="text-green-500" /> : <Lock size={14} className="text-zinc-500" />}
                             <span className="text-xs font-bold">{formatTime(s.opened_at)}</span>
                           </div>
                           <span className={`text-xs font-black uppercase tracking-widest ${isOpen ? 'text-green-500' : 'text-zinc-500'}`}>
                             {isOpen ? t('open') : t('closed')}
                           </span>
                         </div>
                         <p className="text-xs text-[var(--theme-text-muted)] mt-1">{staffName}</p>
                         <div className="grid grid-cols-3 gap-2 mt-2">
                           <div>
                             <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('opening')}</p>
                             <p className="text-xs font-black tabular-nums">{(s.opening_balance || 0).toFixed(2)}₼</p>
                           </div>
                           <div>
                             <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">Kart</p>
                             <p className="text-xs font-black tabular-nums text-blue-600">{(s.card_total || 0).toFixed(2)}₼</p>
                           </div>
                           <div>
                             <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('difference')}</p>
                             <p className={`text-xs font-black tabular-nums ${
                               s.difference == null ? 'text-[var(--theme-text-muted)]' : s.difference > 0 ? 'text-green-500' : s.difference < 0 ? 'text-red-500' : 'text-[var(--theme-text-muted)]'
                             }`}>
                               {s.difference == null ? '—' : `${s.difference > 0 ? '+' : ''}${s.difference.toFixed(2)}₼`}
                             </p>
                           </div>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
