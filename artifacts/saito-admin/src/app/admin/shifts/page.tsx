'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import { useTheme } from '@/lib/theme/ThemeContext';
import { useFirstLoad } from '@/hooks/useFirstLoad';

interface Shift {
  id: string;
  report_date: string;
  staff_id: string;
  opened_at: string;
  closed_at?: string;
  expected_cash: number;
  actual_cash?: number;
  difference?: number;
  notes?: string;
}

export default function ShiftsPage() {
  const { lightMode } = useTheme();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const isFirstLoad = useFirstLoad(600, loading);
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [actualCash, setActualCash] = useState('');

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shifts');
      const data = await res.json();
      setShifts(Array.isArray(data) ? data : []);
    } catch {
      setShifts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShifts(); }, []);

  const handleOpenShift = async () => {
    setOpening(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: 'current-user', expected_cash: 0 }),
      });
      if (res.ok) {
        toast.success('Smena açıldı');
        fetchShifts();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Smena açıla bilmədi');
      }
    } catch {
      toast.error('Xəta');
    } finally {
      setOpening(false);
    }
  };

  const handleCloseShift = async (shiftId: string) => {
    if (!actualCash) {
      toast.error('Nağd məbləği daxil edin');
      return;
    }
    setClosingId(shiftId);
    try {
      const res = await fetch('/api/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: shiftId,
          closed_at: new Date().toISOString(),
          actual_cash: Number(actualCash),
        }),
      });
      if (res.ok) {
        toast.success('Smena bağlandı');
        setActualCash('');
        fetchShifts();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Smena bağlana bilmədi');
      }
    } catch {
      toast.error('Xəta');
    } finally {
      setClosingId(null);
    }
  };

  const activeShift = shifts.find(s => !s.closed_at);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black tracking-tighter">Smenalar</h1>
        {!activeShift && (
          <button
            onClick={handleOpenShift}
            disabled={opening}
            className="px-6 py-3 rounded-2xl bg-emerald-500 text-white text-sm font-black hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {opening ? 'Açılır...' : 'Yeni Smena'}
          </button>
        )}
      </div>

      {activeShift && (
        <div className={`p-6 rounded-2xl border mb-8 ${lightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-black uppercase tracking-widest text-emerald-500">Aktiv Smena</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-[var(--theme-text-secondary)] mb-1">Açılış vaxtı</p>
              <p className="text-sm font-bold">{new Date(activeShift.opened_at).toLocaleString('az-AZ')}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--theme-text-secondary)] mb-1">Gözlənilən nağd</p>
              <p className="text-sm font-bold">₼{activeShift.expected_cash.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              type="number"
              step="0.01"
              value={actualCash}
              onChange={e => setActualCash(e.target.value)}
              placeholder="Həqiqi nağd"
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold outline-none border ${lightMode ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'}`}
            />
            <button
              onClick={() => handleCloseShift(activeShift.id)}
              disabled={closingId === activeShift.id}
              className="px-6 py-3 rounded-xl bg-rose-500 text-white text-sm font-black hover:bg-rose-600 transition-all disabled:opacity-50"
            >
              {closingId === activeShift.id ? 'Bağlanır...' : 'Smenanı Bağla'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {shifts.length === 0 ? (
          <div className="text-center py-12 text-[var(--theme-text-secondary)]">Smena yoxdur</div>
        ) : (
          shifts.map(shift => (
            <div key={shift.id} className={`p-4 rounded-2xl border ${lightMode ? 'bg-white border-zinc-200' : 'bg-white/5 border-white/10'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{shift.report_date}</p>
                  <p className="text-xs text-[var(--theme-text-secondary)]">
                    {new Date(shift.opened_at).toLocaleString('az-AZ')} — {shift.closed_at ? new Date(shift.closed_at).toLocaleString('az-AZ') : 'Aktiv'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">₼{shift.expected_cash.toFixed(2)}</p>
                  {shift.difference !== undefined && (
                    <p className={`text-xs font-bold ${shift.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {shift.difference >= 0 ? '+' : ''}{shift.difference.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
