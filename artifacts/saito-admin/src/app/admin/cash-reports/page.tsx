'use client';

/**
 * /admin/cash-reports — 2026-09-23 (owner, Toast/Square benchmark pass).
 *
 * Before this page, kassa data had NO management view:
 *   - Toast "Drawer History"  → drawer table below (opened/closed/by/balances/diff/locked)
 *   - Toast "Cash Activity"   → movement feed with order refs + staff
 *   - Toast "No-Sale audit"   → exception list (every no-sale has a reason)
 *   - Toast "Close Out Day"   → manager checklist (open checks, open/paused
 *                               drawers, deposits) + the close-day action
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Clock, Lock, Unlock, Hourglass, ArrowDownCircle, ArrowUpCircle,
  DollarSign, CreditCard, FileText, Landmark, Banknote, CheckCircle2,
  AlertTriangle, XCircle, Loader2, RefreshCw,
} from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';

interface Sess {
  id: string; status: string; opened_at: string; closed_at: string | null;
  opening_balance: number; expected_balance: number | null; closing_balance: number | null;
  difference: number | null; locked?: boolean;
  opened_by?: { name?: string } | string | null;
  closed_by?: { name?: string } | string | null;
  approval_note?: string | null;
}
interface Mov {
  id: string; type: string; amount: number; description: string | null;
  created_at: string; order_ref: string | null; created_by_name: string | null;
  session_label: string | null;
}
interface Deposit {
  id: string; expected_amount: number; actual_amount: number; difference: number;
  note: string | null; created_at: string;
}

const name = (x: { name?: string } | string | null | undefined): string => {
  if (!x) return '—';
  return typeof x === 'string' ? x : (x.name || '—');
};

export default function CashReportsPage() {
  const { lightMode } = useTheme();
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [movements, setMovements] = useState<Mov[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [openChecks, setOpenChecks] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [closingDay, setClosingDay] = useState(false);

  const load = useCallback(async () => {
    try {
      const [drawerRes, ordersRes] = await Promise.all([
        apiFetch('/api/cash-drawer?all=1'),
        apiFetch('/api/orders'),
      ]);
      if (drawerRes.ok) {
        const d = await drawerRes.json();
        setSessions(d.sessions || []);
        setMovements(d.movements || []);
        setDeposits(d.deposits || []);
      }
      if (ordersRes.ok) {
        // /api/orders returns {orders: [...]}, not a bare array.
        const d: any = await ordersRes.json();
        const rows: any[] = Array.isArray(d) ? d : (d.orders || []);
        const OPEN = new Set(['new', 'confirmed', 'in_kitchen', 'served', 'bill_requested', 'payment_pending']);
        setOpenChecks(rows.filter((o: any) => OPEN.has(o.status)).length);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCloseDay = async () => {
    if (!window.confirm('Günə son qoyulsun? (Close of Day — Z-report sabitlənir)')) return;
    setClosingDay(true);
    try {
      const res = await apiFetch('/api/finance/close-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Close Out Day — Kassa report səhifəsindən' }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) toast.success('Gün bağlandı (Close of Day)');
      else toast.error(d.error || 'Xəta');
    } catch (e: any) { toast.error(e.message || 'Xəta'); }
    setClosingDay(false);
    load();
  };

  const fmt = (iso: string | null) => iso ? `${new Date(iso).toLocaleDateString('az', { day: '2-digit', month: '2-digit' })} ${new Date(iso).toLocaleTimeString('az', { hour: '2-digit', minute: '2-digit' })}` : '—';
  const money = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}₼`);

  const card = `rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/[0.03] border-white/[0.08]'}`;
  const th = `px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-white/40'}`;
  const td = `px-3 py-2.5 text-xs font-bold tabular-nums`;

  const typeCfg: Record<string, { label: string; icon: any; color: string; sign: 1 | -1 | 0 }> = {
    open: { label: 'Açılış', icon: Unlock, color: 'text-green-500', sign: 1 },
    close: { label: 'Bağlanma', icon: Lock, color: 'text-zinc-500', sign: 0 },
    cash_in: { label: 'Daxilolma', icon: ArrowDownCircle, color: 'text-green-500', sign: 1 },
    cash_out: { label: 'Xərc', icon: ArrowUpCircle, color: 'text-red-500', sign: -1 },
    payment: { label: 'Nağd ödəniş', icon: DollarSign, color: 'text-emerald-500', sign: 1 },
    card_payment: { label: 'Kart ödənişi', icon: CreditCard, color: 'text-blue-500', sign: 0 },
    refund: { label: 'Geri qaytarma', icon: ArrowUpCircle, color: 'text-amber-500', sign: -1 },
    void: { label: 'Ləğv', icon: XCircle, color: 'text-red-400', sign: -1 },
    reopen: { label: 'Yenidən açılış', icon: Unlock, color: 'text-amber-500', sign: 1 },
    no_sale: { label: 'No Sale', icon: FileText, color: 'text-amber-500', sign: 0 },
    cash_drop: { label: 'Cash Drop', icon: Landmark, color: 'text-sky-500', sign: -1 },
    deposit: { label: 'Depozit', icon: Banknote, color: 'text-green-500', sign: 0 },
  };

  const openSessions = sessions.filter(s => s.status === 'open');
  const pausedSessions = sessions.filter(s => s.status === 'paused');
  const noSales = movements.filter(m => m.type === 'no_sale');
  const blockers = openSessions.length + pausedSessions.length + (openChecks || 0);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet size={20} className={lightMode ? 'text-zinc-500' : 'text-white/50'} />
          <h1 className="text-lg font-black tracking-tight">Kassa Reportları</h1>
        </div>
        <button onClick={load} className={`p-2 rounded-xl border ${lightMode ? 'border-zinc-200 hover:bg-zinc-50' : 'border-white/10 hover:bg-white/5'}`}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Close Out Day — manager checklist (Toast "Close Out Day" screen) */}
      <div className={`${card} p-5`}>
        <h2 className="text-sm font-black mb-3 flex items-center gap-2">
          <CheckCircle2 size={15} className={blockers === 0 ? 'text-emerald-500' : 'text-amber-500'} />
          Günə son qoy — checklist
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className={`p-3 rounded-xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">Açıq kassa sessiyası</p>
            <p className={`text-xl font-black tabular-nums ${openSessions.length ? 'text-amber-500' : 'text-emerald-500'}`}>{openSessions.length}</p>
            <p className="text-[11px] text-[var(--theme-text-muted)]">{pausedSessions.length} gözləyən sayım</p>
          </div>
          <div className={`p-3 rounded-xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">Açıq sifarişlər</p>
            <p className={`text-xl font-black tabular-nums ${openChecks ? 'text-amber-500' : 'text-emerald-500'}`}>{openChecks ?? '—'}</p>
            <p className="text-[11px] text-[var(--theme-text-muted)]">hələ ödənməyib</p>
          </div>
          <div className={`p-3 rounded-xl border ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/[0.08]'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-text-muted)]">Depozitlər (60 gün)</p>
            <p className="text-xl font-black tabular-nums text-emerald-500">{money(deposits.reduce((s, d) => s + Number(d.actual_amount), 0))}</p>
            <p className="text-[11px] text-[var(--theme-text-muted)]">{deposits.length} depozit</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          <p className={`text-[11px] font-bold flex items-center gap-1.5 ${blockers === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
            {blockers === 0
              ? <><CheckCircle2 size={13} /> Bütün yoxlamalar keçdi — gün bağlana bilər</>
              : <><AlertTriangle size={13} /> {blockers} blocker var — əvvəl kassa/sifarişləri bağla</>}
          </p>
          <button
            onClick={handleCloseDay}
            disabled={closingDay}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-400 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {closingDay ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Günə son qoy
          </button>
        </div>
      </div>

      {/* Drawer History (Toast "Drawer History" report) */}
      <div className={`${card} overflow-hidden`}>
        <h2 className="text-sm font-black p-4 pb-2">Kassa tarixçəsi (drawer history — 60 gün)</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-t ${lightMode ? 'border-zinc-100' : 'border-white/[0.06]'}`}>
                <th className={th}>Açılıb</th><th className={th}>Bağlanıb</th><th className={th}>Status</th>
                <th className={th}>Kassir</th><th className={th}>Açılış</th><th className={th}>Gözlənilən</th>
                <th className={th}>Faktiki</th><th className={th}>Fərq</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} className={`border-t ${lightMode ? 'border-zinc-100' : 'border-white/[0.06]'}`}>
                  <td className={td}>{fmt(s.opened_at)}</td>
                  <td className={td}>{fmt(s.closed_at)}</td>
                  <td className={`px-3 py-2.5`}>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      s.status === 'open' ? 'bg-green-500/10 text-green-500'
                        : s.status === 'paused' ? 'bg-amber-500/10 text-amber-500'
                          : 'bg-zinc-500/10 text-zinc-400'
                    }`}>
                      {s.status === 'open' ? <Unlock size={10} /> : s.status === 'paused' ? <Hourglass size={10} /> : <Lock size={10} />}
                      {s.status === 'open' ? 'Açıq' : s.status === 'paused' ? 'Gözləyir' : 'Bağlı'}
                      {s.locked ? ' 🔒' : ''}
                    </span>
                  </td>
                  <td className={td}>{name(s.opened_by)}</td>
                  <td className={td}>{money(s.opening_balance)}</td>
                  <td className={td}>{money(s.expected_balance)}</td>
                  <td className={td}>{money(s.closing_balance)}</td>
                  <td className={`px-3 py-2.5 text-xs font-black tabular-nums ${s.difference == null ? '' : s.difference > 0 ? 'text-green-500' : s.difference < 0 ? 'text-red-500' : 'text-[var(--theme-text-muted)]'}`}>
                    {s.difference == null ? '—' : `${s.difference > 0 ? '+' : ''}${s.difference.toFixed(2)}₼`}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-xs opacity-40">Sessiya yoxdur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash Activity (Toast "Cash Activity" audit) */}
      <div className={`${card} overflow-hidden`}>
        <h2 className="text-sm font-black p-4 pb-2">Nağd aktivliyi (son 300 hərəkət)</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className={`border-t ${lightMode ? 'border-zinc-100' : 'border-white/[0.06]'}`}>
                <th className={th}>Vaxt</th><th className={th}>Drawer</th><th className={th}>Əməliyyat</th>
                <th className={th}>Sifariş</th><th className={th}>Staff</th><th className={`${th} text-right`}>Məbləğ</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => {
                const cfg = typeCfg[m.type] || typeCfg.cash_in;
                const Icon = cfg.icon;
                return (
                  <tr key={m.id} className={`border-t ${lightMode ? 'border-zinc-100' : 'border-white/[0.06]'}`}>
                    <td className={`${td} whitespace-nowrap`}>{fmt(m.created_at)}</td>
                    <td className={`${td} opacity-60`}>{m.session_label || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                        <Icon size={12} className={cfg.color} />
                        {cfg.label}
                        {m.description ? <span className={`opacity-50 max-w-[180px] truncate inline-block align-bottom`}>{m.description}</span> : null}
                      </span>
                    </td>
                    <td className={`${td} opacity-60`}>{m.order_ref || '—'}</td>
                    <td className={`${td} opacity-60`}>{m.created_by_name || '—'}</td>
                    <td className={`px-3 py-2.5 text-right text-xs font-black tabular-nums ${cfg.sign === 1 ? 'text-green-500' : cfg.sign === -1 ? 'text-red-500' : 'text-[var(--theme-text-muted)]'}`}>
                      {cfg.sign === 0 && m.type !== 'close' ? '—' : `${cfg.sign === -1 ? '-' : cfg.sign === 1 ? '+' : ''}${m.amount.toFixed(2)}₼`}
                    </td>
                  </tr>
                );
              })}
              {movements.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-xs opacity-40">Hərəkət yoxdur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* No-Sale exceptions */}
      <div className={`${card} overflow-hidden`}>
        <h2 className="text-sm font-black p-4 pb-2 flex items-center gap-2">
          <FileText size={14} className="text-amber-500" /> No Sale istisnaları
        </h2>
        {noSales.length === 0 ? (
          <p className="px-4 pb-5 text-xs opacity-40">No Sale qeydi yoxdur</p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {noSales.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <Clock size={12} className="text-[var(--theme-text-muted)]" />
                <span className="text-xs font-bold tabular-nums w-24">{fmt(m.created_at)}</span>
                <span className="text-xs font-bold flex-1 truncate">{m.description}</span>
                <span className="text-[11px] text-[var(--theme-text-muted)]">{m.created_by_name || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
