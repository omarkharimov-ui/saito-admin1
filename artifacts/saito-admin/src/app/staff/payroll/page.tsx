'use client';

import { useState, useEffect, useCallback } from 'react';
import { Wallet, Clock, TrendingUp, ChevronRight, Receipt, Download } from '@/components/ui/saito-icons';
import { useStaffApp } from '../hooks/useStaffApp';

interface PayrollData {
  period_start: string;
  period_end: string;
  hours_worked: number;
  clocked_minutes: number;
  shifts_count: number;
  tips_total: number;
  tips: any[];
  shifts: any[];
}

function fmtManat(v: number) {
  return v.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₼';
}

export default function StaffPayroll() {
  const { profile } = useStaffApp();
  const [periodKey, setPeriodKey] = useState('this_week');
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [csvLoading, setCsvLoading] = useState(false);

  // Resolve the current period dates (shared by the loader and the CSV export).
  const currentPeriod = () => {
    const today = new Date();
    const start = new Date();
    if (periodKey === 'this_week') {
      start.setDate(start.getDate() - start.getDay() + 1);
    } else if (periodKey === 'this_month') {
      start.setDate(1);
    } else if (periodKey === 'last_month') {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
    }
    // Local-calendar dates (toISOString() shifts the day in UTC+4 timezones).
    const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: dstr(start), end: dstr(today) };
  };

  const downloadCsv = async () => {
    if (!profile?.id) return;
    setCsvLoading(true);
    try {
      const { start, end } = currentPeriod();
      const res = await fetch(`/api/payroll/export?format=csv&period_start=${start}&period_end=${end}&staff_id=${profile.id}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${start}_${end}_men.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvLoading(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
    const params = new URLSearchParams();
    const { start, end } = currentPeriod();
    params.set('period_start', start);
    params.set('period_end', end);
      const res = await fetch(`/api/staff/payroll?${params.toString()}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [periodKey]);

  useEffect(() => { load(); }, [load]);

  const hourly = profile?.hourly_rate || 0;
  const hours = data?.hours_worked || 0;
  const gross = hours * hourly;
  const overtime = Math.max(0, hours - 8) * (profile?.overtime_rate || 0) * 0.5; // simplistic OT bonus
  const tips = data?.tips_total || 0;
  const total = gross + overtime + tips;

  const periods = [
    { id: 'this_week', name: 'Bu həftə' },
    { id: 'this_month', name: 'Bu ay' },
    { id: 'last_month', name: 'Keçən ay' },
  ];

  return (
    <div className="px-5 pt-8">
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-black tracking-tight">Maaş & Ucma</h1>
        <button
          onClick={downloadCsv}
          disabled={csvLoading || !profile?.id}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/[0.09] hover:text-white transition-colors active:scale-95 disabled:opacity-40"
          title="Bu dövrün rəsmi maaş hesabatını CSV kimi yüklə"
        >
          <Download size={13} />
          {csvLoading ? 'Yüklənir...' : 'CSV'}
        </button>
      </div>
      <p className="text-xs text-white/50 mb-5">Qazandığınız məbləğ və ucma ödənişləri</p>

      {/* Period selector */}
      <div className="flex gap-1.5 mb-5">
        {periods.map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriodKey(p.id)}
            className={`flex-1 h-10 rounded-xl text-xs font-bold transition-colors ${
              periodKey === p.id ? 'bg-emerald-500 text-neutral-950' : 'bg-white/[0.06] text-white/60'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* Total card */}
          <div className="rounded-3xl p-6 mb-5 border border-white/10 bg-gradient-to-b from-emerald-500/15 to-transparent">
            <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Ümumi qazanc</p>
            <p className="text-4xl font-black tabular-nums">{fmtManat(total)}</p>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/50">
              <TrendingUp size={13} /> {data?.period_start} – {data?.period_end}
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-2 mb-5">
            {[
              { label: 'Əsas maaş', value: gross, sub: `${hours.toFixed(2)}h × ${hourly.toFixed(2)}₼/saat` },
              { label: 'Əlavə iş', value: overtime, sub: 'Overtime bonus' },
              { label: 'Ucma ödənişləri', value: tips, sub: `${data?.tips.length || 0} ödəniş` },
            ].map((row) => (
              <div key={row.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{row.label}</p>
                  <p className="text-[11px] text-white/40">{row.sub}</p>
                </div>
                <p className="font-black text-lg">{fmtManat(row.value)}</p>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
              <Clock size={16} className="mx-auto mb-1 text-white/40" />
              <p className="text-lg font-black">{hours.toFixed(1)}h</p>
              <p className="text-[10px] text-white/40 uppercase">Saat</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
              <Receipt size={16} className="mx-auto mb-1 text-white/40" />
              <p className="text-lg font-black">{data?.shifts_count ?? 0}</p>
              <p className="text-[10px] text-white/40 uppercase">Növbə</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4 text-center">
              <Wallet size={16} className="mx-auto mb-1 text-white/40" />
              <p className="text-lg font-black">{Math.round(data?.clocked_minutes || 0)}m</p>
              <p className="text-[10px] text-white/40 uppercase">Qeydli dəq</p>
            </div>
          </div>

          {/* Tip history */}
          {data && data.tips.length > 0 && (
            <>
              <h2 className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Ucma tarixçəsi</h2>
              <div className="space-y-2">
                {data.tips.map((tip: any, i: number) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold">{tip.tip_pools?.pool_date || ''}</p>
                      <p className="text-[11px] text-white/40">{tip.tip_pools?.status || '—'}</p>
                    </div>
                    <p className="font-black text-emerald-400">{fmtManat(Number(tip.amount) || 0)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
