'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, LogIn, LogOut, Coffee, Timer, MapPin, Wifi,
  ChevronRight, X, ArrowLeft, ShieldCheck, Download, Smartphone,
} from 'lucide-react';
import { useStaffApp } from './hooks/useStaffApp';
import { useGeoVerification, type GeoConfig } from './hooks/useGeoVerification';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  platforms: string[];
};

function fmtElapsed(fromIso: string | null): string {
  if (!fromIso) return '0m';
  const diff = Math.max(0, Date.now() - new Date(fromIso).getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '--:--';
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
}

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  is_sticky: boolean;
  created_at: string;
}

export default function StaffHome() {
  const { profile, loading, refresh } = useStaffApp();
  const router = useRouter();
  const [now, setNow] = useState(new Date());
  const [pin, setPin] = useState('');
  const [action, setAction] = useState<'clock_in' | 'clock_out' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const geo = useGeoVerification(profile?.geo_config as GeoConfig | null);

  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissInstall, setDismissInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) setInstalled(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const showInstallBannerFinal = !installed && !dismissInstall;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <div className="p-6 text-center text-white/50">Profil yüklənə bilmədi</div>;
  }

  const cs = profile.clock_status;
  const life = profile.lifecycle;
  const isClockedIn = cs?.is_clocked_in ?? false;
  const onBreak = cs?.on_break ?? false;

  const liveSince = onBreak ? (cs?.break_started_at ?? null) : (life?.shift_opened_at ?? null);

  const doClock = async (a: 'clock_in' | 'clock_out') => {
    setErr(null);
    setSuccess(null);
    if (a === 'clock_in') {
      const v = await geo.verify();
      if (!v.verified) {
        setErr('Restoran Wi-Fi-sına və ya əraziyə bağlı deyilsiniz. Yaxınlaşın və yenidən cəhd edin.');
        return;
      }
    }
    setAction(a);
  };

  const submitPin = async () => {
    if (!action || pin.length !== 4) return;
    setBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pin }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setErr(data?.error || 'Əməliyyat uğursuz oldu');
        setPin('');
      } else {
        setSuccess(action === 'clock_in' ? 'İşə giriş qeyd olundu' : 'İşdən çıxış qeyd olundu');
        setPin('');
        setAction(null);
        await refresh();
      }
    } catch (e: any) {
      setErr(e.message || 'Xəta baş verdi');
    } finally {
      setBusy(false);
    }
  };

  const toggleBreak = async () => {
    setErr(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch('/api/staff/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: onBreak ? 'break_end' : 'break_start' }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setErr(data?.error || 'Fasilə əməliyyatı uğursuz oldu');
      } else {
        setSuccess(onBreak ? 'Fasilə bitdi' : 'Fasilə başladı');
      }
      await refresh();
    } catch (e: any) {
      setErr(e.message || 'Xəta');
    } finally {
      setBusy(false);
    }
  };

  // --- Lifecycle Phase label ---
  const phase = life?.phase || (isClockedIn ? (onBreak ? 'on_break' : 'on_shift') : 'scheduled');

  const phaseLabel: Record<string, string> = {
    schedscheduled: 'Növbə planlaşdırılıb',
    scheduled: 'Növbə planlaşdırılıb',
    on_shift: 'İşdədir',
    on_break: 'Fasilədə',
    completed: 'Növbə bitib',
    unclosed: 'Növbə bağlanmayıb',
    no_schedule: 'Cədvəl yoxdur',
  };

  const phaseColor =
    phase === 'on_break' ? 'text-amber-400' :
    phase === 'unclosed' ? 'text-rose-400' :
    phase === 'on_shift' ? 'text-emerald-400' :
    'text-white/60';

  const todaySched = life?.has_schedule
    ? { start: life.scheduled_start, end: life.scheduled_end, late: life.is_late, lateMins: life.late_minutes }
    : null;

  return (
    <div className="px-5 pt-8 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/40">Saito Staff</p>
          <h1 className="text-2xl font-black tracking-tight">
            {profile.name.split(' ')[0]}
          </h1>
          <p className="text-xs text-white/50 mt-0.5">
            {profile.role_name || profile.role}
            {' • '}
            {now.toLocaleDateString('az-AZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <span className={`px-3 py-1.5 rounded-2xl text-[11px] font-bold uppercase tracking-wider ${phaseColor} bg-white/5 border border-white/10`}>
          {phaseLabel[phase] || phase}
        </span>
      </div>

      {/* PWA install banner */}
      <AnimatePresence>
        {showInstallBannerFinal && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-gold/15 text-gold shrink-0">
                <Smartphone size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">App-ı ev ekranına əlavə et</p>
                {installEvt ? (
                  <button
                    onClick={async () => {
                      await installEvt.prompt();
                      const choice = await installEvt.userChoice;
                      if (choice.outcome === 'accepted') setInstalled(true);
                      setInstallEvt(null);
                      setDismissInstall(true);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-gold"
                  >
                    <Download size={13} /> İndi quraşdır
                  </button>
                ) : (
                  <p className="mt-1 text-[11px] leading-snug text-white/50">
                    Sürətli giriş üçün brauzer menyusundan <span className="font-bold text-white/80">Paylaş</span> →
                    <span className="font-bold text-white/80"> Ev ekranına əlavə et</span> seçin.
                  </p>
                )}
              </div>
              <button onClick={() => setDismissInstall(true)} className="text-white/40 p-1 shrink-0">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {success && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-3 px-4 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold">
          {success}
        </motion.div>
      )}
      {err && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-3 px-4 py-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm font-semibold">
          {err}
        </motion.div>
      )}

      {/* Live shift card */}
      <motion.div layout className="rounded-3xl p-6 mb-5 border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02]">
        {/* Live timer */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Canlı iş vaxtı</p>
            <div className={`font-mono text-4xl font-black tabular-nums ${onBreak ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isClockedIn || onBreak ? fmtElapsed(liveSince) : '--:--'}
            </div>
          </div>
          {(isClockedIn || onBreak) && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 bg-emerald-400" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2">
          {!isClockedIn && !onBreak ? (
            <button
              onClick={() => doClock('clock_in')}
              disabled={busy}
              className="col-span-3 h-14 rounded-2xl bg-emerald-500 text-neutral-950 font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              <LogIn size={20} /> İŞƏ GİRİŞ
            </button>
          ) : (
            <>
              <button
                onClick={toggleBreak}
                disabled={busy}
                className={`h-14 rounded-2xl font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-40 ${
                  onBreak ? 'bg-white/10 text-amber-300 border border-amber-400/40' : 'bg-white/10 text-white'
                }`}
              >
                <Coffee size={20} /> {onBreak ? 'Fasilə son' : 'Fasilə'}
              </button>
              <button
                onClick={() => doClock('clock_out')}
                disabled={busy}
                className="col-span-2 h-14 rounded-2xl bg-rose-500 text-white font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                <LogOut size={20} /> İŞDƏN ÇIXIŞ
              </button>
            </>
          )}
        </div>

        {/* Geo status */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5 text-[11px] text-white/50">
          <span className="flex items-center gap-1">
            <Wifi size={13} className={geo.wifiVerified ? 'text-emerald-400' : 'text-white/30'} />
            Wi-Fi {geo.wifiVerified ? 'Bağlı' : 'Yoxlanılır'}
          </span>
          <span className="flex items-center gap-1">
            <MapPin size={13} className={geo.geoVerified ? 'text-emerald-400' : 'text-white/30'} />
            Geofence
          </span>
          {profile.geo_config && profile.geo_config.ssids?.length === 0 && (
            <span className="text-white/30 ml-auto">Konfiqurasiya yoxdur</span>
          )}
        </div>
      </motion.div>

      {/* Today's schedule card */}
      <div className="rounded-3xl p-5 mb-5 border border-white/10 bg-white/[0.03]">
        <button className="w-full flex items-center justify-between" onClick={() => router.push('/staff/schedule')}>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Bugünkü növbə</p>
            {todaySched ? (
              <div className="text-lg font-bold">
                {todaySched.start} – {todaySched.end}
                {todaySched.late && (
                  <span className="ml-2 text-xs font-bold text-amber-400">⚠️ Gecikib ({todaySched.lateMins}m)</span>
                )}
              </div>
            ) : (
              <p className="text-white/50">Bu gün üçün növbə yoxdur</p>
            )}
          </div>
          <ChevronRight size={18} className="text-white/30" />
        </button>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/40">Bu gün</p>
            <p className="text-lg font-black">{cs?.today_hours ?? 0}h</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/40">Bu həftə</p>
            <p className="text-lg font-black">{cs?.weekly_hours ?? 0}h</p>
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div className="mb-5">
        <h2 className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Elanlar</h2>
        {announcements.length === 0 ? (
          <p className="text-white/30 text-sm">Hal-hazırda elan yoxdur</p>
        ) : (
          <div className="space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-bold">{a.title}</p>
                {a.body && <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">{a.body}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PIN modal */}
      <AnimatePresence>
        {action && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">
                  {action === 'clock_in' ? 'İşə giriş' : 'İşdən çıxış'} — PIN daxil edin
                </h3>
                <button onClick={() => { setAction(null); setPin(''); }} className="text-white/50 p-1">
                  <X size={20} />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 mb-5 h-4">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-3 w-3 rounded-full transition-all ${pin.length > i ? 'bg-emerald-400 w-6' : 'bg-white/20'}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','', '0', '⌫'].map((d, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (d === '') return;
                      if (d === '⌫') setPin((p) => p.slice(0, -1));
                      else if (pin.length < 4) {
                        const next = pin + d;
                        setPin(next);
                        if (next.length === 4) setTimeout(() => submitPin(), 80);
                      }
                    }}
                    disabled={busy}
                    className="h-14 rounded-2xl bg-white/[0.06] text-xl font-black hover:bg-white/[0.12] active:scale-95 disabled:opacity-30 transition-all"
                  >
                    {d}
                  </button>
                ))}
              </div>
              {err && <p className="text-rose-400 text-xs font-semibold mt-3 text-center">{err}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
