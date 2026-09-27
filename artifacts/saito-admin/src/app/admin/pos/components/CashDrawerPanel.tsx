'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, Unlock, Clock, DollarSign, X, Loader2, User, FileText, CreditCard, Banknote, Landmark, Hourglass } from '@/components/ui/saito-icons';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { appleBackdrop, fastExit, centerModal } from '@/lib/modal-transitions';
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
  /** 2026-09-23 (owner, Toast benchmark): manager-locked drawer. */
  locked?: boolean;
  /** Log-walked expected balance (the row's expected_balance is NULL while open/paused). */
  paused_expected?: number | null;
}

interface CashDrawerMovement {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  /** AUDIT 2026-09-23: enriched server-side — which order this row belongs to. */
  order_ref?: string | null;
  created_by_name?: string | null;
}

interface CashDrawerPanelProps {
  open: boolean;
  onClose: () => void;
  /** 2026-09-24 (owner "error ekranlarımız yoxdurmu"): the custom
      OPEN_SHIFT_REQUIRED dialog needs a real clock-in action. The POS
      removed the permanent clock button (09-21 owner request) — so the
      button lives on-demand inside that dialog. Returns success. */
  onClockIn?: () => Promise<boolean>;
}

export function CashDrawerPanel({ open, onClose, onClockIn }: CashDrawerPanelProps) {
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
  const [view, setView] = useState<'main' | 'cash-in' | 'cash-out' | 'close' | 'no-sale' | 'cash-drop' | 'deposit' | 'lock' | 'adjust' | 'z'>('main');
  const [managerPin, setManagerPin] = useState('');
  const [managerError, setManagerError] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  // 2026-09-24 (owner): custom error screen for OPEN_SHIFT_REQUIRED + one-click clock-in.
  const [shiftRequired, setShiftRequired] = useState(false);
  const [clockingIn, setClockingIn] = useState(false);
  // 2026-09-23 (owner, Toast benchmark): paused drawer ("sayımı sonra")
  const [pausedSession, setPausedSession] = useState<CashDrawerSession | null>(null);
  const [closingTarget, setClosingTarget] = useState<string | null>(null); // null = active session
  // Bill-by-bill counting (Toast "Count bills" + Quick Cash)
  const [showBillCount, setShowBillCount] = useState(false);
  const [billCounts, setBillCounts] = useState<Record<string, string>>({});
  // No Sale / Cash Drop / Deposit / Lock
  const [noSaleReason, setNoSaleReason] = useState('');
  const [depositExpected, setDepositExpected] = useState('');
  const [depositActual, setDepositActual] = useState('');
  // 2026-09-24 (owner, Toast "Adjust Closing Entries"): correct a CLOSED
  // session's counted amount (manager, PIN, logged as adjust_close).
  const [adjustTarget, setAdjustTarget] = useState<CashDrawerSession | null>(null);
  // 2026-09-24 (owner, Toast "print Z at any time"): read-only daily Z.
  const [zData, setZData] = useState<any>(null);
  const [zLoading, setZLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/cash-drawer');
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        setMovements(data.movements || []);
        setTodaySessions(data.todaySessions || []);
        setPausedSession(data.pausedSession || null);
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
    // P-8 (D-4/Q2): canonical walk — cash_out/refund/void subtract positive
    // amounts; reopen rows carry SIGNED negative amounts, so subtracting them
    // restores the previous close amount back into the drawer balance.
    // 2026-09-23 (E2E catch): cash_drop (→ House/safe) also leaves the drawer.
    if (m.type === 'cash_out' || m.type === 'refund' || m.type === 'void' || m.type === 'reopen' || m.type === 'cash_drop') return sum - m.amount;
    return sum;
  }, 0);

  const cashInTotal = movements.filter(m => m.type === 'cash_in').reduce((s, m) => s + m.amount, 0);
  const cashOutTotal = movements.filter(m => m.type === 'cash_out' || m.type === 'cash_drop').reduce((s, m) => s + m.amount, 0);
  const paymentTotal = movements.filter(m => m.type === 'payment').reduce((s, m) => s + m.amount, 0);
  const cardPaymentTotal = movements.filter(m => m.type === 'card_payment').reduce((s, m) => s + m.amount, 0);

  // 2026-09-24 (owner: "bizde error ekranlarımız yoxdurmu"): raw DB codes are
  // never user-facing. OPEN_SHIFT_REQUIRED opens a custom error dialog
  // (explanation + one-click clock-in); other codes get friendly toasts.
  const tryOpenDrawer = async (amount: number): Promise<boolean> => {
    const res = await apiFetch('/api/cash-drawer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open', amount }),
    });
    if (res.ok) {
      toast.success(t('cash_drawer_open'));
      setOpeningBalance('');
      await fetchData();
      return true;
    }
    const err = await res.json().catch(() => ({} as any));
    if (err.error === 'OPEN_SHIFT_REQUIRED') { setShiftRequired(true); return false; }
    if (err.error === 'No active location in session') { toast.error(t('no_active_location')); return false; }
    toast.error(err.error || t('error'));
    return false;
  };

  const handleOpenDrawer = async () => {
    setSubmitting(true);
    try { await tryOpenDrawer(Number(openingBalance) || 0); }
    catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  // One-click clock-in from the error dialog, then auto-retry the drawer open
  // the operator already confirmed (their intent was "open the drawer").
  const handleClockInNow = async () => {
    if (!onClockIn) return;
    setClockingIn(true);
    try {
      const ok = await onClockIn();
      if (!ok) { toast.error(t('error')); return; }
      setShiftRequired(false);
      toast.success(t('shift_opened'));
      await tryOpenDrawer(Number(openingBalance) || 0);
    } finally { setClockingIn(false); }
  };

  const handleCashMove = async (type: 'cash_in' | 'cash_out') => {
    if (!session || !cashAmount) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type, session_id: session.id, amount: Number(cashAmount), description: cashDesc || null, idempotency_key: crypto.randomUUID() }),
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

  // 2026-09-23 (owner, Toast benchmark): bill-by-bill counting.
  const DENOMS = [50, 20, 10, 5, 2, 1, 0.5, 0.1];
  const billSum = DENOMS.reduce((sum, d) => sum + d * (Math.max(0, Math.floor(Number(billCounts[String(d)]) || 0))), 0);

  const handleCloseDrawer = async (managerPin?: string) => {
    const target = closingTarget ? pausedSession : session;
    if (!target) return;
    const isPausedTarget = !!closingTarget;
    // Bill-count validation (client-side mirror of the server check)
    if (showBillCount && billSum > 0 && Math.abs(billSum - (Number(cashAmount) || 0)) > 0.01) {
      toast.error(`Sayım cəmi (${billSum.toFixed(2)}₼) təsdiqlənən məbləğlə (${(Number(cashAmount) || 0).toFixed(2)}₼) üst-üstə düşmür`);
      return;
    }
    setSubmitting(true);
    setManagerError('');
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 'close' → frozen RPC path (active session); 'finalize' → manual
          // path for paused drawers (Toast "count this drawer later").
          action: isPausedTarget ? 'finalize' : 'close',
          session_id: target.id,
          amount: Number(cashAmount) || 0,
          description: cashDesc || null,
          // P-8 (D-5): server verifies the manager PIN (verifyPin + cash.close.approve
          // + same-org in DB). body.manager_id is no longer accepted.
          manager_pin: managerPin || null,
          idempotency_key: crypto.randomUUID(),
          denominations: showBillCount ? DENOMS.map(d => ({ denomination: d, count: Math.floor(Number(billCounts[String(d)]) || 0) })).filter(r => r.count > 0) : [],
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.requires_approval) {
          toast.success(`${t('cash_drawer_closed')} (${t('manager_approved')})`);
        } else if (data.difference !== 0) {
          toast.error(`${t('difference_short')}: ${data.difference > 0 ? '+' : ''}${Number(data.difference).toFixed(2)}₼`);
        } else {
          toast.success(t('cash_drawer_closed'));
        }
        setCashAmount('');
        setCashDesc('');
        setManagerPin('');
        setNeedsApproval(false);
        setView('main');
        await fetchData();
      } else if (data.requires_approval) {
        // Manager approval needed — show PIN input (DB is authoritative; render
        // the PIN field even if client-side variance reads 0)
        setNeedsApproval(true);
        setManagerError(data.error || t('manager_approval_required'));
      } else {
        toast.error(data.error || t('error'));
      }
    } catch (e: any) { toast.error(e.message); }
    setSubmitting(false);
  };

  const handleManagerVerifyAndClose = async () => {
    if (!managerPin || managerPin.length < 4) {
      setManagerError(t('pin_required'));
      return;
    }
    setManagerError('');
    // P-8 (D-5): no client-side verify-pin preflight — the API route and the
    // DB verify the PIN authoritatively (invalid PIN → 401 'Invalid manager PIN').
    await handleCloseDrawer(managerPin);
  };

  // ── 2026-09-23 (owner, Toast benchmark) ────────────────────────────────
  const postAction = async (body: Record<string, unknown>, okMsg: string) => {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, idempotency_key: crypto.randomUUID() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(okMsg);
        setView('main');
        setCashAmount(''); setCashDesc(''); setManagerPin(''); setManagerError('');
        await fetchData();
        return true;
      }
      toast.error(data.error === 'NO_SALE_REASON_REQUIRED' ? 'No Sale üçün səbəb məcburidir' : (data.error || t('error')));
      return false;
    } catch (e: any) { toast.error(e.message); return false; }
    finally { setSubmitting(false); }
  };

  const handlePause = () => postAction({ action: 'pause', session_id: session?.id }, 'Sayım gözləyəndə qoyuldu — yeni kassa aça bilərsən');

  const openFinalize = (s: CashDrawerSession) => {
    setClosingTarget(s.id);
    setCashAmount(String(Number(s.paused_expected ?? s.expected_balance) || 0));
    setCashDesc(''); setManagerPin(''); setManagerError(''); setNeedsApproval(false);
    setBillCounts({}); setShowBillCount(false);
    setView('close');
  };

  const handleNoSale = () => {
    if (!noSaleReason.trim()) { toast.error('No Sale üçün səbəb məcburidir'); return; }
    postAction({ action: 'no_sale', amount: 0, description: noSaleReason.trim() }, 'No Sale qeydə alındı').then(ok => { if (ok) setNoSaleReason(''); });
  };

  const handleCashDrop = () => {
    if (!(Number(cashAmount) > 0)) { toast.error('Məbləğ daxil et'); return; }
    postAction({ action: 'cash_drop', amount: Number(cashAmount), description: cashDesc || null }, 'Cash Drop qeydə alındı');
  };

  const handleLockToggle = () => {
    if (!managerPin || managerPin.length < 4) { setManagerError(t('pin_required')); return; }
    postAction(
      { action: session?.locked ? 'unlock' : 'lock', manager_pin: managerPin },
      session?.locked ? 'Kassa açıldı' : 'Kassa qıfılalandı',
    ).then(ok => { if (ok) { setManagerPin(''); setManagerError(''); } });
  };

  const openDeposit = () => {
    // Expected = last CLOSED session's closing balance (prefill)
    const lastClosed = (todaySessions || []).find(sx => sx.status === 'closed' && sx.closing_balance != null);
    setDepositExpected(lastClosed ? String(lastClosed.closing_balance || 0) : '');
    setDepositActual(''); setManagerPin(''); setManagerError('');
    setView('deposit');
  };

  const handleDeposit = () => {
    if (!managerPin || managerPin.length < 4) { setManagerError(t('pin_required')); return; }
    postAction(
      { action: 'deposit', expected_amount: Number(depositExpected) || 0, amount: Number(depositActual) || 0, description: cashDesc || null, manager_pin: managerPin },
      'Depozit qeydə alındı',
    ).then(ok => { if (ok) { setDepositExpected(''); setDepositActual(''); setManagerPin(''); } });
  };

  const openAdjust = (s: CashDrawerSession) => {
    setAdjustTarget(s);
    setCashAmount(String(Number(s.closing_balance) || 0));
    setCashDesc(''); setManagerPin(''); setManagerError('');
    setView('adjust');
  };

  const handleAdjust = () => {
    if (!adjustTarget) return;
    if (!managerPin || managerPin.length < 4) { setManagerError(t('pin_required')); return; }
    const was = Number(adjustTarget.closing_balance) || 0;
    const now = Number(cashAmount) || 0;
    if (!window.confirm(`Sayım dəyəri ${was.toFixed(2)}₼ → ${now.toFixed(2)}₼ düzəldilsin? (manager təsdiqi ilə)`)) return;
    postAction(
      { action: 'adjust_close', session_id: adjustTarget.id, amount: now, description: cashDesc || null, manager_pin: managerPin },
      'Sayım düzəldildi',
    ).then(ok => { if (ok) { setAdjustTarget(null); setManagerPin(''); setCashAmount(''); } });
  };

  const openZ = async () => {
    setView('z');
    setZLoading(true);
    setZData(null);
    try {
      // 2026-09-24 (E2E catch): the browser client has no Supabase JWT (custom
      // PIN session → anon role), so the RPC must run server-side (service role).
       const res = await apiFetch(`/api/reports/z?date=${new Date().toISOString().split('T')[0]}`);
      if (!res.ok) {
        // 2026-09-26 (Task 51 freeze audit): raw `Z report: <error>` toast →
        // friendly i18n message (raw codes must never be user-facing).
        toast.error(t('z_report_error' as any) || 'Z hesabatı əldə edilə bilmədi');
        return;
      }
      setZData(await res.json());
    } catch { toast.error(t('z_report_error' as any) || 'Z hesabatı əldə edilə bilmədi'); }
    finally { setZLoading(false); }
  };

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

  // Close view expected balance: active session = live walk; paused target =
  // the API-attached log walk (the row's expected_balance is NULL while open).
  const closeExpected = closingTarget
    ? (Number(pausedSession?.paused_expected ?? pausedSession?.expected_balance) || 0)
    : currentBalance;

  const typeLabels: Record<string, { labelKey: string; icon: typeof Wallet; color: string }> = {
    open: { labelKey: 'cash_drawer_open', icon: Unlock, color: 'text-green-500' },
    close: { labelKey: 'cash_drawer_closed', icon: Lock, color: 'text-zinc-500' },
    cash_in: { labelKey: 'cash_in', icon: ArrowDownCircle, color: 'text-green-500' },
    cash_out: { labelKey: 'expense', icon: ArrowUpCircle, color: 'text-red-500' },
    payment: { labelKey: 'cash_payment', icon: DollarSign, color: 'text-emerald-500' },
    card_payment: { labelKey: 'card_payment', icon: CreditCard, color: 'text-blue-500' },
    // P-8: ledger types written by P-6 refund/void and the reopen reversal row
    refund: { labelKey: 'cash_refund', icon: ArrowUpCircle, color: 'text-amber-500' },
    void: { labelKey: 'cash_void', icon: ArrowUpCircle, color: 'text-zinc-500' },
    reopen: { labelKey: 'cash_reopen', icon: Unlock, color: 'text-amber-500' },
    // 2026-09-23 (owner, Toast benchmark)
    no_sale: { labelKey: 'no_sale', icon: FileText, color: 'text-amber-500' },
    cash_drop: { labelKey: 'cash_drop', icon: Landmark, color: 'text-sky-500' },
    deposit: { labelKey: 'deposit', icon: Banknote, color: 'text-green-500' },
    adjust_close: { labelKey: 'adjust_close', icon: FileText, color: 'text-violet-500' },
  };

  return (
    <>
    <AnimatePresence>
      {/* 2026-09-27 (owner: "kassa popup yenidən yaz — centered modal"):
          bottom sheet → centered dialog. The VKB pad-bottom keeps the modal
          centered in the visible area above an open keyboard. */}
      {/* 2026-09-27 (iOS-27-trash doctrine): the WHOLE layer is a keyed motion
          child inside AnimatePresence (was a plain div — the early
          `return null` unmounted the panel in one frame, no exit could play).
          Closing now fades the veil + settles the card over 300ms. */}
      {open && (
      <motion.div
        key="kassa-root"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
        className="fixed inset-0 z-[130] flex items-center justify-center pointer-events-none p-4"
        style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : undefined }}
      >
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastExit}
          className="fixed inset-0 z-0 pointer-events-auto bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          {...centerModal}
          className={`relative z-10 pointer-events-auto w-full max-w-lg rounded-[32px] shadow-overlay border ${
            lightMode ? 'bg-white/95 border-zinc-200' : 'bg-zinc-900/95 border-white/10'
          } overflow-hidden max-h-[85vh] flex flex-col`}
        >
          {/* Header — 2026-09-27 premium pass (owner: same doctrine as TARİXÇƏ):
              icon chip + title + live status subtitle, circular ghost close. */}
          <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b ${lightMode ? 'border-zinc-100' : 'border-white/10'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center ${lightMode ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-500/15 text-emerald-400'}`}>
                <Wallet size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black tracking-tight leading-tight">Kassa</h2>
                <p className={`text-[11px] font-bold truncate ${lightMode ? 'text-zinc-400' : 'text-white/35'}`}>
                  {session
                    ? `${session.locked ? 'Qıfıllandırılıb' : (t('open') || 'Açıq')} · ${session.staff_name || session.opened_by?.name || 'Kassir'}`
                    : (t('closed') || 'Bağlı')
                  }
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-95 ${lightMode ? 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'}`}
              title={t('close')}
            >
              <X size={16} />
            </button>
          </div>

          {/* `relative` anchors the popLayout'd (absolutely positioned) exiting
              view during the in-dialog view swap, so the crossfade overlaps
              instead of pushing the movement log down. */}
          <div className="relative flex-1 overflow-y-auto px-6 pb-6 space-y-4">
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
                {/* 2026-09-24 (owner, Toast "print Z at any time"): the daily Z
                    is available even before the drawer is opened. */}
                <button
                  onClick={openZ}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs font-black uppercase tracking-widest active:scale-[0.98] transition-all"
                >
                  <FileText size={14} /> Z-Report
                </button>
              </div>
            ) : (
              /* Active session */
              <div className="space-y-4">
                {/* 2026-09-23 (owner, Toast benchmark): drawer lock */}
                {session.locked && view === 'main' && (
                  <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/10 border-amber-500/30'}`}>
                    <p className="flex items-center gap-2 text-xs font-black text-amber-500">
                      <Lock size={13} /> Kassa qıfıllandırılıb — manager PIN ilə açılır
                    </p>
                  </div>
                )}
                {/* 2026-09-23 (owner, Toast "count this drawer later"): paused drawer
                    waiting for its final count while the new drawer is active. */}
                {pausedSession && view === 'main' && (
                  <div className={`p-4 rounded-2xl border ${lightMode ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/25'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-black text-blue-500">
                          <Hourglass size={13} /> Gözləyən sayım — {pausedSession.opened_by?.name || 'Kassir'}
                        </p>
                        <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">
                          Gözlənilən: <span className="font-black tabular-nums">{(Number(pausedSession.paused_expected ?? pausedSession.expected_balance) || 0).toFixed(2)}₼</span>
                        </p>
                      </div>
                      <button
                        onClick={() => openFinalize(pausedSession!)}
                        className="flex-shrink-0 px-4 py-2 rounded-xl bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest active:scale-[0.97] transition-all"
                      >
                        Say
                      </button>
                    </div>
                  </div>
                )}
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
                   <div className="grid grid-cols-3 gap-3">
                     <div className={`p-2 rounded-xl ${lightMode ? 'bg-white border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                       <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('shift_started')}</p>
                       <p className="text-xs font-black tabular-nums">{formatTime(session.opened_at)}</p>
                     </div>
                     <div className={`p-2 rounded-xl ${lightMode ? 'bg-white border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                       <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('duration')}</p>
                       <p className="text-xs font-black tabular-nums">{shiftDuration}</p>
                     </div>
                     {/* AUDIT 2026-09-23: opening balance was only visible in the
                         today-sessions list, not on the active session card. */}
                     <div className={`p-2 rounded-xl ${lightMode ? 'bg-white border border-zinc-100' : 'bg-white/5 border border-white/5'}`}>
                       <p className="text-xs font-black uppercase tracking-widest text-[var(--theme-text-muted)]">{t('opening')}</p>
                       <p className="text-xs font-black tabular-nums">{(session.opening_balance || 0).toFixed(2)}₼</p>
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

                   {/* 2026-09-27 premium pass: the view region (main actions ↔
                       cash-in/out ↔ no-sale ↔ drop ↔ deposit ↔ lock ↔ close)
                       swaps as a STATE TRANSITION — 220ms fade + 8px drift.
                       2026-09-27 BUG A FIX (owner: "kassa view swap-da 215ms boş
                       ekran + snap olur"):
                         (1) the card's own `backdrop-blur-xl` was the root cause
                             — a backdrop-filter on an ancestor freezes a far
                             child's opacity animation in Chrome (transform/y
                             keeps running, opacity is only applied on the final
                             frame). Card blur removed (the veil already blurs
                             the page) and the surface made more opaque
                             (/90 → /95) so legibility is unchanged.
                         (2) `mode="wait"` made the two views SEQUENTIAL (exit
                             then enter) → a dip-to-empty gap at the crossover.
                             `popLayout` pops the exiting view out of the layout
                             flow so the incoming one owns the space immediately
                             and both fade at once — a true crossfade, no gap,
                             no reflow (same pattern as lib/motion/Morph.tsx). */}
                   <AnimatePresence mode="popLayout" initial={false}>
                   <motion.div
                     key={`kassa-view-${view}`}
                     initial={{ opacity: 0, y: 8 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -8 }}
                     transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                     className="w-full space-y-4"
                   >
                  {/* Actions — 2026-09-27 (E2E: bottom row clipped): primary 3 +
                      secondary 5 so the main view fits the dialog. */}
                  {view === 'main' && (
                    <div className="grid grid-cols-3 gap-2.5">
                     <button
                       onClick={() => { setView('cash-in'); setCashAmount(''); setCashDesc(''); }}
                       className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-green-50 border-green-200 text-green-600' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}
                     >
                       <ArrowDownCircle size={20} strokeWidth={2.5} />
                       <span className="text-xs font-black uppercase tracking-widest">Daxilolma</span>
                     </button>
                     <button
                       onClick={() => { setView('cash-out'); setCashAmount(''); setCashDesc(''); }}
                       className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                     >
                       <ArrowUpCircle size={20} strokeWidth={2.5} />
                       <span className="text-xs font-black uppercase tracking-widest">{t('expense')}</span>
                     </button>
                      <button
                        onClick={() => { setClosingTarget(null); setView('close'); setCashAmount(String(currentBalance.toFixed(2))); setCashDesc(''); setBillCounts({}); setShowBillCount(false); }}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/10 text-zinc-300'}`}
                      >
                        <Lock size={20} strokeWidth={2.5} />
                        <span className="text-xs font-black uppercase tracking-widest">{t('end_shift')}</span>
                      </button>
                    </div>
                  )}

                  {/* 2026-09-23 (owner, Toast benchmark): secondary drawer actions
                      (2026-09-24: + Z-report — Toast "print Z at any time") */}
                  {view === 'main' && (
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        onClick={() => { setView('no-sale'); setNoSaleReason(''); }}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}
                      >
                        <FileText size={15} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">No Sale</span>
                      </button>
                      <button
                        onClick={() => { setView('cash-drop'); setCashAmount(''); setCashDesc(''); }}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-sky-500/10 border-sky-500/20 text-sky-400'}`}
                      >
                        <Landmark size={15} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Drop</span>
                      </button>
                      <button
                        onClick={openDeposit}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-green-50 border-green-200 text-green-600' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}
                      >
                        <Banknote size={15} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Depozit</span>
                      </button>
                      <button
                        onClick={() => { setView('lock'); setManagerPin(''); setManagerError(''); }}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-zinc-100 border-zinc-200 text-zinc-600' : 'bg-white/5 border-white/10 text-zinc-300'}`}
                      >
                        {session.locked ? <Unlock size={15} strokeWidth={2.5} /> : <Lock size={15} strokeWidth={2.5} />}
                        <span className="text-[9px] font-black uppercase tracking-widest">{session.locked ? 'Aç' : 'Qıfıl'}</span>
                      </button>
                      <button
                        onClick={openZ}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all active:scale-95 ${lightMode ? 'bg-violet-50 border-violet-200 text-violet-600' : 'bg-violet-500/10 border-violet-500/20 text-violet-300'}`}
                      >
                        <FileText size={15} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Z</span>
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

                 {/* 2026-09-23 (owner, Toast benchmark): No Sale — mandatory reason,
                     logged to the drawer ledger + exception reports. */}
                 {view === 'no-sale' && (
                   <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                     <p className="text-sm font-bold text-amber-500">No Sale</p>
                     <p className="text-xs text-[var(--theme-text-muted)]">Səbəb məcburidir — istisna reportlarına düşür.</p>
                     <input
                       value={noSaleReason}
                       onChange={e => setNoSaleReason(e.target.value)}
                       placeholder="Səbəb: xəta, label çapı, düymə... (məcburi)"
                       className={`w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                     />
                     <div className="flex gap-2">
                       <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>{t('back')}</button>
                       <button onClick={handleNoSale} disabled={submitting || !noSaleReason.trim()} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-amber-500 text-white disabled:opacity-50">
                         {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('confirm')}
                       </button>
                     </div>
                   </div>
                 )}

                 {/* 2026-09-23 (owner, Toast benchmark): Cash Drop → House/safe */}
                 {view === 'cash-drop' && (
                   <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                     <p className="text-sm font-bold text-sky-500">Cash Drop → House</p>
                     <input
                       type="number" step="0.01" value={cashAmount}
                       onChange={e => setCashAmount(e.target.value)}
                       placeholder={t('amount')}
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                     />
                     <input
                       value={cashDesc} onChange={e => setCashDesc(e.target.value)}
                       placeholder="Açıqlama (ixtiyari)"
                       className={`w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                     />
                     <div className="flex gap-2">
                       <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>{t('back')}</button>
                       <button onClick={handleCashDrop} disabled={submitting || !(Number(cashAmount) > 0)} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-sky-500 text-white disabled:opacity-50">
                         {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('confirm')}
                       </button>
                     </div>
                   </div>
                 )}

                 {/* 2026-09-23 (owner, Toast benchmark): deposit with expected vs
                     actual (overage/shortage stored in the deposits table). */}
                 {view === 'deposit' && (
                   <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                     <p className="text-sm font-bold text-green-500">Depozit (banka)</p>
                     <input
                       type="number" step="0.01" value={depositExpected}
                       onChange={e => setDepositExpected(e.target.value)}
                       placeholder="Gözlənilən məbləğ (₼)"
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                     />
                     <input
                       type="number" step="0.01" value={depositActual}
                       onChange={e => setDepositActual(e.target.value)}
                       placeholder="Faktiki depozit (₼)"
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                     />
                     {depositExpected && depositActual && (
                       <p className={`text-xs font-black tabular-nums ${Number(depositActual) < Number(depositExpected) ? 'text-red-500' : 'text-green-500'}`}>
                         Fərq: {(Number(depositActual) - Number(depositExpected)).toFixed(2)}₼
                       </p>
                     )}
                     <input
                       type="password" inputMode="numeric" maxLength={6} value={managerPin}
                       onChange={e => { setManagerPin(e.target.value); setManagerError(''); }}
                       placeholder="Manager PIN"
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-amber-50 border-amber-200 text-black focus:border-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-white focus:border-emerald-400/50'}`}
                     />
                     {managerError && <p className="text-xs text-red-500 font-bold">{managerError}</p>}
                     <div className="flex gap-2">
                       <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>{t('back')}</button>
                       <button onClick={handleDeposit} disabled={submitting} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-green-500 text-white disabled:opacity-50">
                         {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('confirm')}
                       </button>
                     </div>
                   </div>
                 )}

                 {/* 2026-09-23 (owner, Toast benchmark): drawer lock (manager PIN) */}
                 {view === 'lock' && (
                   <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                     <p className="text-sm font-bold">{session.locked ? 'Kassanı aç' : 'Kassanı qıfıla'}</p>
                     <input
                       type="password" inputMode="numeric" maxLength={6} value={managerPin}
                       onChange={e => { setManagerPin(e.target.value); setManagerError(''); }}
                       placeholder="Manager PIN"
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-amber-50 border-amber-200 text-black focus:border-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-white focus:border-emerald-400/50'}`}
                     />
                     {managerError && <p className="text-xs text-red-500 font-bold">{managerError}</p>}
                     <div className="flex gap-2">
                       <button onClick={() => setView('main')} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>{t('back')}</button>
                       <button onClick={handleLockToggle} disabled={submitting} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black disabled:opacity-50">
                         {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : <>{session.locked ? <Unlock size={14} className="inline mr-1" /> : <Lock size={14} className="inline mr-1" />}{session.locked ? 'Aç' : 'Qıfıla'}</>}
                       </button>
                     </div>
                   </div>
                 )}

                  {/* Close drawer */}
                 {view === 'close' && (
                   <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                     <p className="text-sm font-bold text-zinc-500">
                       {closingTarget ? 'Gözləyən sayımın təsdiqi' : t('cash_drawer_closing')}
                     </p>
                     <div className={`p-3 rounded-xl ${lightMode ? 'bg-white border border-zinc-200' : 'bg-white/5 border border-white/10'}`}>
                       <p className="text-xs font-bold text-[var(--theme-text-muted)]">{t('expected_balance')}</p>
                       <p className="text-lg font-black tabular-nums">{closeExpected.toFixed(2)}₼</p>
                     </div>
                    <input
                      type="number"
                      step="0.01"
                      value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder={t('actual_balance')}
                       className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />
                     {cashAmount && Math.abs(Number(cashAmount) - closeExpected) > 0.005 && (
                       <div className={`p-3 rounded-xl ${Number(cashAmount) > closeExpected ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                         <p className={`text-xs font-bold ${Number(cashAmount) > closeExpected ? 'text-green-500' : 'text-red-500'}`}>
                           {t('difference')}: {Number(cashAmount) > closeExpected ? '+' : ''}{(Number(cashAmount) - closeExpected).toFixed(2)}₼
                         </p>
                       </div>
                     )}
                     {/* 2026-09-23 (owner, Toast "Count bills" + Quick Cash):
                         bill-by-bill counting; the sum must match the counted
                         amount (server validates too). */}
                     <button
                       onClick={() => setShowBillCount(v => !v)}
                       className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                         showBillCount
                           ? (lightMode ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-indigo-500/10 border-indigo-400/30 text-indigo-300')
                           : (lightMode ? 'bg-white border-zinc-200 text-zinc-500' : 'bg-white/5 border-white/10 text-white/50')
                       }`}
                     >
                       <span>Bill sayımı (denominasiya)</span>
                       <span>{showBillCount ? (billSum > 0 ? `Cəm: ${billSum.toFixed(2)}₼` : 'Açıq') : 'Bağlı'}</span>
                     </button>
                     {showBillCount && (
                       <div className={`p-3 rounded-xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                         <div className="grid grid-cols-4 gap-2">
                           {DENOMS.map(d => (
                             <div key={d} className="space-y-1">
                               <p className="text-center text-[10px] font-black text-[var(--theme-text-muted)] tabular-nums">{d}₼</p>
                               <input
                                 type="number" min="0"
                                 value={billCounts[String(d)] || ''}
                                 onChange={e => setBillCounts(prev => ({ ...prev, [String(d)]: e.target.value }))}
                                 placeholder="0"
                                 className={`w-full rounded-lg px-1 py-1.5 text-xs font-bold text-center outline-none border tabular-nums ${lightMode ? 'bg-zinc-50 border-zinc-200 focus:border-indigo-400' : 'bg-white/5 border-white/10 focus:border-indigo-400/50'}`}
                               />
                             </div>
                           ))}
                         </div>
                         <div className="flex items-center justify-between mt-2">
                           <button
                             onClick={() => setCashAmount(billSum > 0 ? String(billSum.toFixed(2)) : '')}
                             disabled={billSum === 0}
                             className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40 active:scale-[0.97] transition-all"
                           >
                             Quick Cash = {billSum.toFixed(2)}₼
                           </button>
                           {billSum > 0 && cashAmount && Math.abs(billSum - Number(cashAmount)) > 0.01 && (
                             <span className="text-[10px] font-bold text-red-500">Cəm təsdiqlənən məbləğdən fərqlənir!</span>
                           )}
                         </div>
                       </div>
                     )}
                     <input
                       value={cashDesc}
                       onChange={e => setCashDesc(e.target.value)}
                       placeholder="Qeyd (ixtiyari)"
                       className={`w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-zinc-400' : 'bg-white/5 border-white/10 text-white focus:border-zinc-400/50'}`}
                    />

                    {/* Manager approval PIN — shown when variance != 0 or DB demanded approval */}
                    {(cashAmount && Math.abs(Number(cashAmount) - closeExpected) > 0.005) || needsApproval ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-amber-500">{t('manager_approval_required')}</p>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={6}
                          value={managerPin}
                          onChange={e => { setManagerPin(e.target.value); setManagerError(''); }}
                          placeholder={t('manager_pin')}
                          className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-amber-50 border-amber-200 text-black focus:border-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-white focus:border-emerald-400/50'}`}
                        />
                        {managerError && <p className="text-xs text-red-500 font-bold">{managerError}</p>}
                      </div>
                    ) : null}

                    <div className="flex gap-2">
                      <button onClick={() => { setView('main'); setClosingTarget(null); setManagerPin(''); setManagerError(''); setNeedsApproval(false); }} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-700' : 'bg-white/10 text-zinc-300'}`}>
                        {t('back')}
                      </button>
                      {/* 2026-09-23 (owner, Toast "Count this drawer later"): pause
                          the count — a new drawer can be opened meanwhile. */}
                      {!closingTarget && (
                        <button
                          onClick={handlePause}
                          disabled={submitting}
                          className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border ${lightMode ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-blue-500/10 border-blue-400/30 text-blue-300'} disabled:opacity-50`}
                        >
                          Sonra say
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const hasVariance = cashAmount && Math.abs(Number(cashAmount) - closeExpected) > 0.005;
                          if (hasVariance || needsApproval) {
                            handleManagerVerifyAndClose();
                          } else if (window.confirm(t('confirm_end_shift'))) {
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

                  </motion.div>
                  </AnimatePresence>

                  {/* Movement log */}
                  {movements.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-2">{t('transactions')}</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {[...movements].reverse().map(m => {
                        const cfg = typeLabels[m.type] || typeLabels.cash_in;
                        const Icon = cfg.icon;
                        const isDebit = m.type === 'cash_out' || m.type === 'refund' || m.type === 'void';
                        const shownAmount = m.type === 'reopen' ? Math.abs(m.amount) : m.amount;
                        return (
                          <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                            <Icon size={14} className={cfg.color} />
                             <div className="flex-1 min-w-0">
                               <p className="text-xs font-bold truncate">
                                 {t(cfg.labelKey as any)}
                                 {m.order_ref ? <span className="text-[var(--theme-text-secondary)]"> · {m.order_ref}</span> : ''}
                                 {m.description ? ` — ${m.description}` : ''}
                               </p>
                               <p className="text-xs text-[var(--theme-text-muted)]">
                                 {formatTime(m.created_at)}
                                 {m.created_by_name ? ` · ${m.created_by_name}` : ''}
                               </p>
                             </div>
                            <span className={`text-xs font-black tabular-nums ${
                              isDebit ? 'text-red-500' : 'text-green-500'
                            }`}>
                              {isDebit ? '-' : '+'}{shownAmount.toFixed(2)}₼
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

              {/* 2026-09-24 (E2E catch): Z + adjust views live at CONTAINER level
                  — they must render even when NO drawer is open (Toast: Z report
                  is available any time; adjust targets a CLOSED session, by
                  definition there is no open one). */}
              {view === 'z' && (
                <div className={`p-5 rounded-2xl border space-y-3 z-report-print ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <style>{`@media print { body * { visibility: hidden !important; } .z-report-print, .z-report-print * { visibility: visible !important; } .z-report-print { position: absolute !important; inset: 0 !important; width: 100% !important; } }`}</style>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-violet-500">Z-Report — {new Date().toLocaleDateString('az')}</p>
                    <div className="flex gap-2">
                      <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest active:scale-[0.97]">Çap et</button>
                      <button onClick={() => setView('main')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-600' : 'bg-white/10 text-zinc-300'}`}>{t('back')}</button>
                    </div>
                  </div>
                  {zLoading ? (
                    <div className="flex items-center justify-center py-10"><div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" /></div>
                  ) : !zData ? (
                    <p className="text-xs opacity-40 py-6 text-center">Z report əldə edilə bilmədi</p>
                  ) : (
                    <div className="space-y-3 text-[12px]">
                      <div className={`p-3 rounded-xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1.5">Satış</p>
                        <div className="flex justify-between"><span>Ümumi gəlir</span><b className="tabular-nums">{(zData.sales?.total_revenue ?? 0).toFixed(2)}₼</b></div>
                        <div className="flex justify-between"><span>Sifarişlər</span><b className="tabular-nums">{zData.sales?.total_orders ?? 0}</b></div>
                        <div className="flex justify-between"><span>Məhsul satışı</span><b className="tabular-nums">{zData.sales?.items_sold ?? 0}</b></div>
                      </div>
                      <div className={`p-3 rounded-xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1.5">Ödənişlər</p>
                        <div className="flex justify-between"><span>Nağd</span><b className="tabular-nums">{(zData.payments?.cash_total ?? 0).toFixed(2)}₼</b></div>
                        <div className="flex justify-between"><span>Kart</span><b className="tabular-nums">{(zData.payments?.card_total ?? 0).toFixed(2)}₼</b></div>
                        <div className="flex justify-between"><span>Xüsusiləndirmələr</span><b className="tabular-nums text-amber-500">−{(zData.payments?.discounts_total ?? 0).toFixed(2)}₼</b></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`p-3 rounded-xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1.5">Ləğvlər</p>
                          <div className="flex justify-between"><span>Sayı</span><b className="tabular-nums">{zData.voids?.count ?? 0}</b></div>
                          <div className="flex justify-between"><span>Məbləğ</span><b className="tabular-nums text-red-400">{(zData.voids?.amount ?? 0).toFixed(2)}₼</b></div>
                        </div>
                        <div className={`p-3 rounded-xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1.5">Kassa</p>
                          <div className="flex justify-between"><span>Açılış</span><b className="tabular-nums">{(zData.cash_drawer?.starting_cash ?? 0).toFixed(2)}₼</b></div>
                          <div className="flex justify-between"><span>Gözlənilən</span><b className="tabular-nums">{(zData.cash_drawer?.expected_cash ?? 0).toFixed(2)}₼</b></div>
                        </div>
                      </div>
                      <div className={`p-3 rounded-xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1.5">Fəx</p>
                        <div className="flex justify-between"><span>Xalis</span><b className={`tabular-nums ${(zData.profit?.net ?? 0) >= 0 ? 'text-green-500' : 'text-red-400'}`}>{(zData.profit?.net ?? 0).toFixed(2)}₼</b></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2026-09-24 (owner, Toast "Adjust Closing Entries"): correct
                  a closed session's counted amount (manager PIN + log row). */}
              {view === 'adjust' && adjustTarget && (
                <div className={`p-5 rounded-2xl border space-y-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/5 border-white/10'}`}>
                  <p className="text-sm font-bold text-violet-500">Sayımın düzəldilməsi (closed drawer)</p>
                  <div className={`p-3 rounded-xl ${lightMode ? 'bg-white border border-zinc-200' : 'bg-white/5 border border-white/10'}`}>
                    <div className="flex justify-between text-xs"><span className="opacity-50">Gözlənilən</span><b className="tabular-nums">{(Number(adjustTarget.expected_balance) || 0).toFixed(2)}₼</b></div>
                    <div className="flex justify-between text-xs mt-1"><span className="opacity-50">Hazırkı fərq</span><b className={`tabular-nums ${Number(adjustTarget.difference || 0) < 0 ? 'text-red-500' : 'text-green-500'}`}>{(Number(adjustTarget.difference) || 0).toFixed(2)}₼</b></div>
                  </div>
                  <input
                    type="number" step="0.01" value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    placeholder="Yeni təsdiqlənən məbləğ"
                    className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-violet-400' : 'bg-white/5 border-white/10 text-white focus:border-violet-400/50'}`}
                  />
                  <input
                    value={cashDesc} onChange={e => setCashDesc(e.target.value)}
                    placeholder="Səbəb (məcburi deyil, log-a düşür)"
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none border transition-all ${lightMode ? 'bg-white border-black/10 text-black focus:border-violet-400' : 'bg-white/5 border-white/10 text-white focus:border-violet-400/50'}`}
                  />
                  <input
                    type="password" inputMode="numeric" maxLength={6} value={managerPin}
                    onChange={e => { setManagerPin(e.target.value); setManagerError(''); }}
                    placeholder="Manager PIN"
                    className={`w-full rounded-xl px-4 py-3 text-sm font-bold outline-none border transition-all ${lightMode ? 'bg-amber-50 border-amber-200 text-black focus:border-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-white focus:border-emerald-400/50'}`}
                  />
                  {managerError && <p className="text-xs text-red-500 font-bold">{managerError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setView('main'); setAdjustTarget(null); }} className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest ${lightMode ? 'bg-zinc-200 text-zinc-600' : 'bg-white/10 text-zinc-300'}`}>{t('back')}</button>
                    <button onClick={handleAdjust} disabled={submitting} className="flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-violet-500 text-white disabled:opacity-50">
                      {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Düzəlt'}
                    </button>
                  </div>
                </div>
              )}

              {todaySessions.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-text-muted)] mb-2">{t('shift_entry')}</p>
                 <div className="space-y-1.5">
                    {todaySessions.map(s => {
                      const isOpen = s.status === 'open';
                      const isPaused = s.status === 'paused';
                      const staffName = s.opened_by?.name || s.staff_name || 'Kassir';
                      return (
                        <div key={s.id} className={`p-3 rounded-xl ${lightMode ? 'bg-zinc-50' : 'bg-white/5'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isOpen ? <Unlock size={14} className="text-green-500" /> : isPaused ? <Hourglass size={14} className="text-amber-500" /> : <Lock size={14} className="text-zinc-500" />}
                              <span className="text-xs font-bold">{formatTime(s.opened_at)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-black uppercase tracking-widest ${isOpen ? 'text-green-500' : isPaused ? 'text-amber-500' : 'text-zinc-500'}`}>
                                {isOpen ? t('open') : isPaused ? 'Gözləyir' : t('closed')}
                              </span>
                              {/* 2026-09-23 (owner, Toast): finalize the paused count */}
                              {isPaused && (
                                <button
                                  onClick={() => openFinalize(s)}
                                  className="px-3 py-1 rounded-lg bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest active:scale-[0.97] transition-all"
                                >
                                  Say
                                </button>
                              )}
                              {/* 2026-09-24 (owner, Toast "Adjust Closing Entries"):
                                  correct a closed session's counted amount */}
                              {!isOpen && !isPaused && s.closing_balance != null && (
                                <button
                                  onClick={() => openAdjust(s)}
                                  className="px-3 py-1 rounded-lg bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest active:scale-[0.97] transition-all"
                                >
                                  Düzəlt
                                </button>
                              )}
                            </div>
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
        </motion.div>
      )}
      </AnimatePresence>
     {/* 2026-09-24 (owner "bizde error ekranlarımız yoxdurmu"): custom error
         screen for OPEN_SHIFT_REQUIRED. The POS has NO permanent clock
         button (removed 2026-09-21 by owner request) — so the clock-in
         action lives on-demand here: explain → one click → auto-retry. */}
     <AnimatePresence>
       {shiftRequired && (
         <motion.div
           key="shift-required"
           initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fastExit}
           className="fixed inset-0 z-[140] flex items-center justify-center p-4"
           style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : undefined }}
         >
           <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!clockingIn) setShiftRequired(false); }} />
           <motion.div
             initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8, opacity: 0 }}
             transition={appleBackdrop}
             className={`relative w-full max-w-sm rounded-3xl border p-6 text-center shadow-2xl ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
           >
             <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${lightMode ? 'bg-amber-50' : 'bg-amber-500/10'}`}>
               <Clock size={26} className="text-amber-500" />
             </div>
             <h3 className="text-base font-black uppercase tracking-tight mb-2">{t('shift_required_title')}</h3>
             <p className={`text-xs leading-relaxed mb-5 ${lightMode ? 'text-zinc-500' : 'text-white/55'}`}>{t('open_shift_required')}</p>
             <div className="flex gap-3">
               <button onClick={() => setShiftRequired(false)} disabled={clockingIn}
                 className={`flex-1 py-3 rounded-2xl text-xs font-black uppercase tracking-wider border ${lightMode ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-50' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
                 {t('close')}
               </button>
               <button onClick={handleClockInNow} disabled={clockingIn || !onClockIn}
                 className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-500/20">
                 {clockingIn ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('clock_in_now')}
               </button>
             </div>
           </motion.div>
         </motion.div>
       )}
     </AnimatePresence>
    </>
   );
 }
