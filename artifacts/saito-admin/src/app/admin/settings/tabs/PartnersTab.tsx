'use client';

// 2026-09-25 (owner): Delivery Partners tab — READY state by design.
// Each partner (Bolt Food / Uber Eats / Glovo / Wolt) can be connected with
// one click; when connected, orders tagged with that partner show the
// partner logo + brand color + courier info across POS / KDS / BDS.
// "Test sifarişi" fires one realistic order so you can see the branding live.
import { useState, useEffect, useCallback } from 'react';
import { Bike, CheckCircle2, Loader2, Zap } from 'lucide-react';
import { toast } from '@/lib/toast';
import { apiFetch } from '@/lib/api-fetch';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { PARTNER_LIST, type PartnerMeta } from '@/app/admin/pos/lib/partners';

type PartnerState = { connected: boolean; connected_at: string | null };

export default function PartnersTab() {
  const { t } = useLanguage();
  const [states, setStates] = useState<Record<string, PartnerState>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/partners');
      if (res.ok) {
        const data = await res.json();
        setStates(data.partners || {});
      }
    } catch { /* offline — keep defaults */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (p: PartnerMeta) => {
    const next = !(states[p.id]?.connected);
    setBusy(p.id);
    try {
      const res = await apiFetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner: p.id, connected: next }),
      });
      if (res.ok) {
        setStates(s => ({ ...s, [p.id]: { connected: next, connected_at: next ? new Date().toISOString() : null } }));
        toast.success(next ? `${p.name} bağlandı` : `${p.name} açıldı`);
      } else {
        toast.error((await res.json()).error || 'Xəta');
      }
    } catch {
      toast.error('Ağ şəbəkəsi yoxdur');
    } finally { setBusy(null); }
  };

  const fireTest = async (p: PartnerMeta, mode: 'delivery' | 'takeaway') => {
    setBusy(`${p.id}:${mode}`);
    try {
      const res = await apiFetch('/api/partners/test-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner: p.id, mode }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${p.name} test sifarişi yaradıldı: ${data.order_number} — POS/KDS-də görünür`);
      } else {
        toast.error(data.error || 'Test sifarişi alınmadı');
      }
    } catch {
      toast.error('Ağ şəbəkəsi yoxdur');
    } finally { setBusy(null); }
  };

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/40" /></div>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-start gap-3">
        <Bike size={16} className="text-emerald-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-white/50 leading-relaxed">
          {t('partners_hint') || 'Qoşulmuş partnerdən gələn sifarişlər POS çatdırılma/apa kartlarında, KDS və Bar Display ticket-larında partner logosu + brend rəngi + kurye məlumatı ilə görünür. Aşağıdakı "BAĞLA" ilə 1 kliklə qoşulur; "test sifarişi" ilə dərhal nəticəni görürsən.'}
        </p>
      </div>

      {PARTNER_LIST.map(p => {
        const st = states[p.id] || { connected: false, connected_at: null };
        const isBusy = busy === p.id;
        return (
          <div key={p.id} className="relative rounded-2xl border overflow-hidden"
            style={{ borderColor: st.connected ? p.accent + '66' : 'rgba(255,255,255,0.08)', backgroundColor: st.connected ? p.accent + '0d' : 'rgba(255,255,255,0.02)' }}>
            <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: p.accent, opacity: st.connected ? 1 : 0.35 }} />
            <div className="flex items-center gap-4 p-4 pl-5">
              {/* Logo chip */}
              <span className="flex items-center justify-center rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: p.chipBg, padding: '6px 10px' }}>
                <img src={p.logo} alt={p.name} style={{ height: 22, width: 'auto', maxWidth: 90 }} draggable={false} />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-white">{p.name}</span>
                  {st.connected ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: p.accent + '22', color: p.accent === '#fdc500' ? '#b8860b' : p.accent }}>
                      <CheckCircle2 size={9} /> Bağlanıb
                    </span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/40">Hazır</span>
                  )}
                </div>
                <p className="text-[11px] text-white/40 mt-0.5 truncate">{p.blurb}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => fireTest(p, 'takeaway')}
                  disabled={!st.connected || busy !== null}
                  className="h-8 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-white/10 text-white/60 hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Takeaway test sifarişi"
                >
                  {busy === `${p.id}:takeaway` ? <Loader2 size={11} className="animate-spin" /> : 'Takeaway test'}
                </button>
                <button
                  onClick={() => fireTest(p, 'delivery')}
                  disabled={!st.connected || busy !== null}
                  className="h-8 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-white/10 text-white/60 hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Delivery test sifarişi (kurye ilə)"
                >
                  {busy === `${p.id}:delivery` ? <Loader2 size={11} className="animate-spin" /> : 'Delivery test'}
                </button>
                {/* 1-click connect toggle */}
                <button
                  onClick={() => toggle(p)}
                  disabled={isBusy}
                  className="relative h-8 w-14 rounded-full transition-colors"
                  style={{ backgroundColor: st.connected ? p.accent : 'rgba(255,255,255,0.12)' }}
                  title={st.connected ? 'Aç' : 'Bağla (1 klik)'}
                >
                  <span
                    className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all flex items-center justify-center"
                    style={{ left: st.connected ? 30 : 4 }}
                  >
                    {isBusy ? <Loader2 size={12} className="animate-spin text-zinc-500" /> : st.connected ? <Zap size={12} style={{ color: p.accent }} /> : null}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
