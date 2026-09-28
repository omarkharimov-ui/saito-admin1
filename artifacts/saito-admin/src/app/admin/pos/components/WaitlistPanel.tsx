'use client';

// 2026-09-25 (owner: "waitlist duzelt", Q4 decision — sadə UI versiya):
// Dine-in "Növbə" panel. Existing API (finally works — waitlist table was
// missing): POST /api/waitlist (add), PATCH (status), DELETE, POST
// /api/waitlist/seat {waitlist_id, table_number} → table occupied + ORDER
// auto-opened (walk-in parity: guest name/phone → orders.customer_*) +
// waitlist 'seated'. SMS notify = future (Bildirişlər phase).
// Queue position = index in waiting list ordered by created_at.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Phone, Hourglass, Armchair, UserX, Trash2, Check, AlertTriangle } from '@/components/ui/saito-icons';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import { useTheme } from '@/lib/theme/ThemeContext';

export type WaitlistEntry = {
  id: string;
  name: string;
  phone: string | null;
  guests: number;
  status: string;
  created_at: string;
};

// Toolbar badge — lightweight 20s poll of the waiting count.
export function useWaitlistCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = async () => {
      try {
        const res = await apiFetch('/api/waitlist');
        if (!res.ok || !active) return;
        const rows = await res.json();
        setCount(Array.isArray(rows) ? rows.filter((r: any) => r.status === 'waiting').length : 0);
      } catch { /* silent */ }
    };
    load();
    const iv = setInterval(load, 20_000);
    return () => { active = false; clearInterval(iv); };
  }, [enabled]);
  return count;
}

const SPRING = { type: 'spring' as const, stiffness: 500, damping: 26 };

function queueMinutes(iso: string, now: number): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

export default function WaitlistPanel({ open, onClose, emptyTables, onSeated }: {
  open: boolean;
  onClose: () => void;
  emptyTables: { table_number: number; seats?: number | null }[];
  onSeated: () => void;
}) {
  const { lightMode } = useTheme();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(2);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/waitlist');
      if (res.ok) {
        const rows = await res.json();
        const waiting = (Array.isArray(rows) ? rows : [])
          .filter((r: any) => r.status === 'waiting')
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setEntries(waiting as WaitlistEntry[]);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    load();
    const iv = setInterval(load, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    const f = setTimeout(() => nameRef.current?.focus(), 150);
    return () => { clearInterval(iv); clearInterval(tick); clearTimeout(f); };
  }, [open, load]);

  const addEntry = async () => {
    const n = name.trim();
    if (!n) { toast.error('Ad lazımdır'); return; }
    setBusyId('__add__');
    try {
      const res = await apiFetch('/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({ name: n, phone: phone.trim() || null, guests }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Əlavə oluna bilmədi');
       toast.success(`${n} növbəyə əlavə olundu`);
       setName(''); setPhone(''); setGuests(2);
       load();
       // 2026-09-26 (Task 55, owner: "daxil etdim amma avtomatik bağlanmırdı"):
       // successful save → panel auto-closes (count chip in the NÖVBƏ header
       // shows the queue). VKB releases with the panel unmount (blur).
       onClose();
    } catch (e: any) {
      toast.error(e.message || 'Növbəyə əlavə oluna bilmədi');
    } finally { setBusyId(null); }
  };

  const setStatus = async (entry: WaitlistEntry, status: string, label: string) => {
    setBusyId(entry.id);
    // 2026-09-27 (iOS-27-trash doctrine): OPTIMISTIC removal — the row starts
    // its graceful exit the instant of the tap; the server round-trip only
    // reconciles afterwards. If the PATCH fails, load() re-adds the row.
    const leavesQueue = ['no_show', 'seated', 'cancelled', 'left'].includes(status);
    if (leavesQueue) setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      const res = await apiFetch('/api/waitlist', {
        method: 'PATCH',
        body: JSON.stringify({ id: entry.id, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || label);
      }
      load();
    } catch (e: any) {
      toast.error(e.message || label);
      load();
    } finally { setBusyId(null); }
  };

  const removeEntry = async (entry: WaitlistEntry) => {
    setBusyId(entry.id);
    // 2026-09-27 (iOS-27-trash doctrine): OPTIMISTIC removal — the row fades
    // away the instant of the tap (E2E probe showed the exit waited ~1.5s for
    // the DELETE round-trip; that is NOT the trash feel). load() reconciles;
    // on failure the row simply returns.
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      const res = await apiFetch(`/api/waitlist?id=${entry.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Silinmədi');
      }
      load();
    } catch (e: any) {
      toast.error(e.message || 'Silinmədi');
      load();
    } finally { setBusyId(null); }
  };

  const seatEntry = async (entry: WaitlistEntry, tableNumber: number) => {
    setBusyId(entry.id);
    setSeatingId(null);
    // 2026-09-27 (iOS-27-trash doctrine): optimistic — the guest leaves the
    // queue the moment the table is picked; load() reconciles afterwards.
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      const res = await apiFetch('/api/waitlist/seat', {
        method: 'POST',
        body: JSON.stringify({ waitlist_id: entry.id, table_number: tableNumber }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Oturdulmadı');
      toast.success(`${entry.name} → Masa ${tableNumber} · order açıldı`);
      setSeatingId(null);
      load();
      onSeated();
    } catch (e: any) {
      toast.error(e.message || 'Oturdulmadı');
    } finally { setBusyId(null); }
  };

  const muted = lightMode ? 'text-zinc-500' : 'text-white/45';
  const field = lightMode
    ? 'bg-zinc-100 border-zinc-200 text-zinc-800 placeholder:text-zinc-400'
    : 'bg-white/[0.06] border-white/10 text-white placeholder:text-white/25';

  // 2026-09-27 (iOS-27-trash doctrine): the panel is a KEYED motion child
  // inside a persistent AnimatePresence — closing it fades the veil + sinks
  // the card gracefully instead of unmounting in one frame (the old
  // `if (!open) return null` killed the exit).
  return (
    <AnimatePresence>
      {open && (
      <motion.div
        key="waitlist-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60"
        style={{ paddingBottom: 'var(--vk-height, 0px)' }}
        onClick={onClose}
      >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.97, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
        transition={SPRING}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[520px] max-h-[86vh] rounded-3xl border flex flex-col overflow-hidden ${
          lightMode ? 'bg-white border-zinc-200 shadow-2xl' : 'bg-zinc-950 border-white/10 shadow-2xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${lightMode ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/15 text-indigo-400'}`}>
            <Hourglass size={17} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-black tracking-tight">Növbə (Waitlist)</div>
            <div className={`text-[11px] font-semibold ${muted}`}>{entries.length} qonaq gözləyir</div>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-lg flex items-center justify-center ${lightMode ? 'text-zinc-400 hover:bg-zinc-100' : 'text-white/40 hover:bg-white/10'}`}>
            <X size={16} />
          </button>
        </div>

        {/* Add form */}
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex gap-2">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEntry(); }}
              placeholder="Ad (lazım)"
              className={`flex-1 h-10 px-3.5 rounded-xl border text-sm font-semibold outline-none ${field}`}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telefon (opsional)"
              className={`w-[150px] h-10 px-3.5 rounded-xl border text-sm font-semibold outline-none tabular-nums ${field}`}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className={`flex items-center gap-1 px-2 h-9 rounded-xl border ${field}`}>
              <Users size={13} className={muted} />
              <button onClick={() => setGuests((g) => Math.max(1, g - 1))} className="w-6 h-6 flex items-center justify-center text-base font-black">−</button>
              <span className="w-6 text-center text-sm font-black tabular-nums">{guests}</span>
              <button onClick={() => setGuests((g) => Math.min(99, g + 1))} className="w-6 h-6 flex items-center justify-center text-base font-black">+</button>
            </div>
            <button
              onClick={addEntry}
              disabled={busyId === '__add__' || !name.trim()}
              className="flex-1 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
            >
              <Check size={14} strokeWidth={3} />
              Növbəyə əlavə et
            </button>
          </div>
        </div>

        {/* 2026-09-25 (owner): "yalnız boş masa" izahı — waitlist məhz dolan
            masalar içindir: qonaq növbədə QALIR, masa boşalanda oturur. */}
        {emptyTables.length === 0 && (
          <div className={`mx-5 mt-3 rounded-xl border px-3 py-2.5 flex items-center gap-2 ${lightMode ? 'border-zinc-300 bg-zinc-900/5' : 'border-amber-500/25 bg-amber-500/10'}`}>
            <AlertTriangle size={13} className={`shrink-0 ${lightMode ? 'text-zinc-900' : 'text-amber-400'}`} />
            <span className={`text-[11px] font-semibold ${lightMode ? 'text-zinc-900' : 'text-amber-300/90'}`}>
              Hazırda boş masa yoxdur — qonaqlar növbədə qalır, masa boşalanda bu paneli xəbər verəcək və "Oturdul" aktiv olacaq.
            </span>
          </div>
        )}

        {/* Queue — 2026-09-27 (owner, iOS-27-trash doctrine): AnimatePresence
            stays mounted ACROSS the list↔empty flip. Previously the empty
            state was the 2nd branch of a ternary, so removing the LAST entry
            unmounted AnimatePresence before the row's exit could play (instant
            vanish). Now the last row fades away gracefully while "Növbə boştur"
            fades in over it — the empty state is absolute so it never pushes
            the exiting row. */}
        <div className="relative flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[180px]">
          {loading ? (
            <div className={`h-full flex items-center justify-center text-xs font-semibold ${muted}`}>Yüklənir…</div>
          ) : (
            <AnimatePresence>
              {entries.length === 0 && (
                <motion.div
                  key="__queue-empty__"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.45, 0, 0.55, 1] } }}
                  transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${muted}`}
                >
                  <Hourglass size={26} />
                  <span className="text-xs font-bold">Növbə boştur</span>
                </motion.div>
              )}
              {entries.map((e, idx) => {
                const mins = queueMinutes(e.created_at, now);
                return (
                  <motion.div
                    key={e.id}
                    layout
                     initial={{ opacity: 0, y: 12 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.32, ease: [0.45, 0, 0.55, 1] } }}
                     transition={SPRING}
                     className={`rounded-2xl border p-3 flex items-center gap-3 ${lightMode ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.03] border-white/10'}`}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black tabular-nums shrink-0 ${lightMode ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/15 text-indigo-400'}`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-black truncate">{e.name}</span>
                        <span className={`flex items-center gap-1 text-[11px] font-bold tabular-nums shrink-0 ${muted}`}>
                          <Users size={11} /> {e.guests}
                        </span>
                      </div>
                      <div className={`flex items-center gap-3 mt-0.5 text-[11px] font-semibold tabular-nums ${muted}`}>
                        <span className="flex items-center gap-1"><Hourglass size={10} /> {mins < 1 ? '<1 dəq' : `${mins} dəq`}</span>
                        {e.phone && <span className="flex items-center gap-1"><Phone size={10} /> {e.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSeatingId(e.id)}
                        disabled={busyId === e.id || emptyTables.length === 0}
                        title={emptyTables.length === 0 ? 'Boş masa yoxdur' : 'Masaya oturdul'}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-35 text-white text-[11px] font-black uppercase tracking-wide transition-colors"
                      >
                        <Armchair size={13} />
                        Oturdul
                      </button>
                      <button
                        onClick={() => setStatus(e, 'no_show', 'No-show qeydə alınmadı')}
                        disabled={busyId === e.id}
                        title="No-show"
                        className={`w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-35 ${lightMode ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'}`}
                      >
                        <UserX size={14} />
                      </button>
                      <button
                        onClick={() => removeEntry(e)}
                        disabled={busyId === e.id}
                        title="Növbədən çıxar"
                        className={`w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-35 ${lightMode ? 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200' : 'bg-white/5 text-white/40 hover:bg-rose-500/15 hover:text-rose-400'}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Table picker for seating */}
        <AnimatePresence>
          {seatingId && (
            <div className="absolute inset-0 z-10 bg-black/70 flex items-center justify-center p-6" onClick={() => setSeatingId(null)}>
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SPRING}
                onClick={(e) => e.stopPropagation()}
                className={`w-full max-w-[400px] rounded-2xl border p-5 ${lightMode ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'}`}
              >
                <div className="text-xs font-black uppercase tracking-widest mb-3">Hansı masa? (yalnız boş masalar)</div>
                {emptyTables.length === 0 ? (
                  <div className={`text-xs font-semibold py-4 text-center ${muted}`}>Hazırda boş masa yoxdur</div>
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {emptyTables.map((t) => (
                      <button
                        key={t.table_number}
                        disabled={busyId === seatingId}
                        onClick={() => seatEntry(entries.find((e) => e.id === seatingId)!, t.table_number)}
                        className={`h-11 rounded-xl border text-sm font-black tabular-nums transition-colors disabled:opacity-50 ${
                          lightMode ? 'border-zinc-200 bg-zinc-50 hover:border-emerald-400 hover:bg-emerald-50'
                                    : 'border-white/10 bg-white/[0.04] hover:border-emerald-500/60 hover:bg-emerald-500/10'
                        }`}
                      >
                        {t.table_number}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
