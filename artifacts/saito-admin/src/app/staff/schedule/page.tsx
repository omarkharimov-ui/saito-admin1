'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays, ArrowLeftRight } from 'lucide-react';

interface Shift {
  schedule_id: string;
  date: string;
  planned_start: string;
  planned_end: string;
  notes: string | null;
}

interface SwapReq {
  id: string;
  requester_shift_id: string;
  target_staff_id: string | null;
  status: string;
}

const DAY_NAMES = ['B.e', 'Ç.a', 'Çər', 'C.a', 'Cüm', 'Şən', 'Baz'];

export default function StaffSchedule() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [swaps, setSwaps] = useState<SwapReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<string>('');

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/schedule?week_offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts || []);
        setSwaps(data.swap_requests || []);
        setWeekStart(data.week_start);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(weekOffset); }, [weekOffset, load]);

  const p = weekStart ? new Date(weekStart + 'T00:00:00') : new Date();
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(p);
    d.setDate(d.getDate() + i);
    return d;
  });

  const todayIso = new Date().toISOString().split('T')[0];
  const dayShifts = (iso: string) => shifts.filter((s) => s.date === iso);

  const swapStatusBadge = (s: SwapReq) => {
    if (!s.target_staff_id) return 'Dost yoxdur';
    return s.status === 'pending' ? 'Gözləyir' : s.status === 'accepted' ? 'Qəbul' : 'Rədd';
  };

  return (
    <div className="px-5 pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Növbə cədvəlim</h1>
          <p className="text-xs text-white/50 mt-0.5">Həftəlik planlı növbələr</p>
        </div>
      </div>

      {/* Week nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center active:scale-95"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-bold">
          {dates[0].toLocaleDateString('az-AZ', { day: 'numeric', month: 'short' })} – {dates[6].toLocaleDateString('az-AZ', { day: 'numeric', month: 'short' })}
        </span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center active:scale-95"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {dates.map((d) => {
            const iso = d.toISOString().split('T')[0];
            const isToday = iso === todayIso;
            const day = dayShifts(iso);
            return (
              <div
                key={iso}
                className={`rounded-2xl border p-4 ${isToday ? 'border-emerald-400/40 bg-emerald-400/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center ${isToday ? 'bg-emerald-500 text-neutral-950' : 'bg-white/[0.06]'}`}>
                    <span className="text-[9px] font-bold uppercase opacity-60">{DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]}</span>
                    <span className="text-base font-black leading-none">{d.getDate()}</span>
                  </div>
                  {isToday && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Bu gün</span>}
                </div>
                {day.length === 0 ? (
                  <p className="text-white/30 text-sm pl-0">İstirahət / növbə yoxdur</p>
                ) : (
                  day.map((s) => (
                    <div key={s.schedule_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={15} className="text-white/40" />
                        <span className="font-bold">{s.planned_start} – {s.planned_end}</span>
                      </div>
                      {s.notes && <span className="text-[10px] text-white/40">{s.notes}</span>}
                    </div>
                  ))
                )}
              </div>
            );
          })}

          {/* Swap requests */}
          {swaps.length > 0 && (
            <div className="mt-5">
              <h2 className="text-[11px] uppercase tracking-widest text-white/40 mb-3 flex items-center gap-1.5">
                <ArrowLeftRight size={13} /> Mübadilə sorğuları
              </h2>
              {swaps.map((s) => (
                <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between">
                  <span className="text-sm">{s.id.slice(0, 8)}</span>
                  <span className={`text-xs font-bold ${s.status === 'pending' ? 'text-amber-400' : s.status === 'accepted' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {swapStatusBadge(s)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
