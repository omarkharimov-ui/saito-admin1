'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftRight, X, Users } from 'lucide-react';
import { useStaffApp } from '../hooks/useStaffApp';

interface MySwap {
  id: string;
  status: string;
  message: string | null;
  requester_schedule: { schedule_date: string; planned_start: string; planned_end: string } | null;
}

interface Coworker {
  id: string;
  full_name: string;
  role_name?: string;
  schedule?: { schedule_id: string; schedule_date: string; planned_start: string; planned_end: string } | null;
}

export default function StaffSwap() {
  const { profile } = useStaffApp();
  const [myRequests, setMyRequests] = useState<MySwap[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [myShifts, setMyShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { shift_id: string; date: string; start: string; end: string }>(null);
  const [selectedCoworker, setSelectedCoworker] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [swapRes, schedRes, staffRes] = await Promise.all([
        fetch('/api/staff/swap'),
        fetch('/api/staff/schedule?week_offset=0'),
        fetch('/api/staff/directory'),
      ]);
      if (swapRes.ok) {
        const s = await swapRes.json();
        setMyRequests(s.my_requests || []);
      }
      if (schedRes.ok) {
        const s = await schedRes.json();
        setMyShifts(s.shifts || []);
      }
      if (staffRes.ok) {
        const s = await staffRes.json();
        setCoworkers((s.staff || []).filter((c: any) => c.id !== profile?.id));
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!modal || !selectedCoworker) return;
    setBusy(true); setErr(null); setOk(null);
    try {
      const res = await fetch('/api/staff/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_shift_id: modal.shift_id,
          target_staff_id: selectedCoworker,
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setErr(data?.error || 'Sorğu göndərilmədi');
      } else {
        setOk('Növbə mübadiləsi sorğusu göndərildi');
        setModal(null); setMessage(''); setSelectedCoworker('');
        load();
      }
    } catch (e: any) {
      setErr(e.message || 'Xəta');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (s: string) =>
    s === 'pending' ? 'Gözləyir' : s === 'accepted' ? 'Qəbul olundu' : s === 'rejected' ? 'Rədd edildi' : 'Ləğv edildi';

  return (
    <div className="px-5 pt-8">
      <h1 className="text-2xl font-black tracking-tight mb-1">Növbə mübadiləsi</h1>
      <p className="text-xs text-white/50 mb-5">Növbənizi həmkarınızla dəyişdirin</p>

      {ok && <div className="mb-3 px-4 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">{ok}</div>}
      {err && <div className="mb-3 px-4 py-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-semibold">{err}</div>}

      {/* My upcoming shifts to swap */}
      <h2 className="text-[11px] uppercase tracking-widest text-white/40 mb-3 flex items-center gap-1.5">
        <ArrowLeftRight size={13} /> Növbələrim
      </h2>
      {loading ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" /></div>
      ) : (
        <div className="space-y-2 mb-6">
          {myShifts.length === 0 && <p className="text-white/30 text-sm">Bu həftə növbə yoxdur</p>}
          {myShifts.map((s) => (
            <div key={s.schedule_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{s.date}</p>
                <p className="text-[11px] text-white/40">{s.planned_start} – {s.planned_end}</p>
              </div>
              <button
                onClick={() => setModal({ shift_id: s.schedule_id, date: s.date, start: s.planned_start, end: s.planned_end })}
                className="px-3 py-2 rounded-xl bg-emerald-500 text-neutral-950 text-xs font-black"
              >
                Dəyiş
              </button>
            </div>
          ))}
        </div>
      )}

      {/* My pending requests */}
      {myRequests.length > 0 && (
        <>
          <h2 className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Sorğularım</h2>
          <div className="space-y-2 mb-6">
            {myRequests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">
                    {r.requester_schedule?.schedule_date || ''} {r.requester_schedule?.planned_start}–{r.requester_schedule?.planned_end}
                  </p>
                  {r.message && <p className="text-[11px] text-white/40">{r.message}</p>}
                </div>
                <span className={`text-xs font-bold ${r.status === 'pending' ? 'text-amber-400' : r.status === 'accepted' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 p-6 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold flex items-center gap-2"><Users size={18} /> Mübadilə</h3>
                <button onClick={() => setModal(null)}><X size={20} className="text-white/50" /></button>
              </div>
              <p className="text-sm text-white/60 mb-4">
                <b>{modal.date}</b> • {modal.start} – {modal.end}
              </p>
              <p className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Həmkar seçin</p>
              <div className="space-y-2 mb-4">
                {coworkers.length === 0 && <p className="text-white/30 text-sm">Həmkarlar tapılmadı</p>}
                {coworkers.map((c) => (
                  <button key={c.id} onClick={() => setSelectedCoworker(c.id)}
                    className={`w-full rounded-2xl border p-3 text-left flex items-center justify-between ${
                      selectedCoworker === c.id ? 'border-emerald-400 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'
                    }`}>
                    <div>
                      <p className="font-bold text-sm">{c.full_name}</p>
                      <p className="text-[11px] text-white/40">{c.role_name || ''}</p>
                    </div>
                    {selectedCoworker === c.id && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Mesaj (istəyə bağlı)"
                className="w-full h-20 rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-sm mb-4"
              />
              <button onClick={submit} disabled={busy || !selectedCoworker}
                className="w-full h-12 rounded-2xl bg-emerald-500 text-neutral-950 font-black disabled:opacity-30">
                {busy ? 'Göndərilir...' : 'Sorğu Göndər'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
