'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Clock, Users, ChefHat, Bell, ShoppingBag, X, CookingPot, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { toast } from '@/lib/toast';

interface ScheduleSuggestion {
  id: string;
  name: string;
  guests: number;
  date: string;
  time: string;
  table_number: number | null;
  pre_order_items: any[];
  pre_order_total: number | null;
  type: 'today' | 'tomorrow';
  suggestion: {
    prepare_at: string;
    ready_by: string;
    minutes_before: number;
    item_count: number;
  };
}

export function KitchenAIScheduler({ lightMode }: { lightMode?: boolean }) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = useState<ScheduleSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reservations/kitchen-schedule');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        if (data.ai_error) setAiEnabled(false);
      } else {
        setAiEnabled(false);
      }
    } catch (e) {
      setAiEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
    const interval = setInterval(fetchSchedule, 60_000);
    return () => clearInterval(interval);
  }, [fetchSchedule]);

  // ── AVTOMATIK TETIKLEYICI: prepare_at vaxti catanda mətbəxə bildiriş göndər ──
  useEffect(() => {
    if (suggestions.length === 0) return;

    const checkAndAutoTrigger = () => {
      const now = new Date();
      const nowHHMM = now.toTimeString().slice(0, 5); // "HH:MM"

      suggestions.forEach(suggestion => {
        // Yalniz bugunun sifarisleri ucun avtomatik tetikle
        if (suggestion.type !== 'today') return;
        // Artiq gonderilib mi yoxla
        const alreadySentKey = `kitchen_auto_sent_${suggestion.id}`;
        if (sessionStorage.getItem(alreadySentKey)) return;

        const prepareAt = suggestion.suggestion.prepare_at; // "HH:MM"
        if (nowHHMM >= prepareAt) {
          // Vaxti catdi - avtomatik hazirlamaga basla
          sessionStorage.setItem(alreadySentKey, '1');
          handleStartPreparing(suggestion);
          // Mətbəxe xüsusi bildiriş göndər
          toast.custom((_t: any) => (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              style={{
                background: 'linear-gradient(135deg,#0a1f0a,#051005)',
                border: '1px solid rgba(34,197,94,0.4)',
                borderRadius: 18, padding: '14px 18px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                minWidth: 260, pointerEvents: 'auto'
              }}
              className="flex items-center gap-3"
            >
              <CookingPot size={20} className="text-green-400 flex-shrink-0" />
              <div>
                <p className="font-black text-sm text-green-300">AI: Hazırlamağa başlayın!</p>
                <p className="text-xs text-white/50">
                  {suggestion.name} — Masa {suggestion.table_number ?? '?'} — Saat {suggestion.time}
                </p>
              </div>
            </motion.div>
          ), { duration: 10000 });

          // Ses bildirisi
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            [440, 550, 660].forEach((freq, i) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4);
              osc.start(ctx.currentTime + i * 0.15);
              osc.stop(ctx.currentTime + i * 0.15 + 0.4);
            });
          } catch {}
        }
      });
    };

    // Hər 30 saniyəde bir yoxla
    checkAndAutoTrigger();
    const autoTimer = setInterval(checkAndAutoTrigger, 30_000);
    return () => clearInterval(autoTimer);
   
  }, [suggestions]);

  const handleStartPreparing = async (suggestion: ScheduleSuggestion) => {
    setSending(suggestion.id);
    try {
      const res = await fetch('/api/reservations/kitchen-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: suggestion.id,
          action: 'start_preparing',
          table_number: suggestion.table_number,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.custom((_t: any) => (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100 }}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 18, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', minWidth: 240, pointerEvents: 'auto' }}
          className="flex items-center gap-3"
        >
          <ChefHat size={18} className="text-white flex-shrink-0" />
          <div>
            <p className="font-bold text-sm text-white">Hazırlamağa başla!</p>
            <p className="text-xs text-white/50">{data.message}</p>
          </div>
        </motion.div>
      ), { duration: 5000 });

      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {}

      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    } catch (e: any) {
      toast.error(e.message || 'Xəta baş verdi');
    } finally {
      setSending(null);
    }
  };

  if (suggestions.length === 0 && !loading && aiEnabled) return null;

  const todaySuggestions = suggestions.filter(s => s.type === 'today');
  const tomorrowSuggestions = suggestions.filter(s => s.type === 'tomorrow');

  return (
    <div className="relative">
      {!aiEnabled ? (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-white/[0.06] border border-white/[0.1] text-white/50">
          <Sparkles size={16} className="text-white/40" />
          <span>Mətbəx AI — Hazırlıq Planı</span>
        </div>
      ) : (
        <>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all bg-white/[0.06] border border-white/[0.1] text-white hover:bg-white/[0.1]"
      >
        <Sparkles size={16} className="text-white/60" />
        <span>Mətbəx AI — Hazırlıq Planı</span>
        {suggestions.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-white/10 text-white/70">
            {suggestions.length}
          </span>
        )}
        <ChevronRight size={14} className={`ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl border bg-[#151515] border-white/[0.1] shadow-2xl overflow-hidden"
          >
            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
                {todaySuggestions.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-white/40 px-2 mb-2">Bugün</p>
                    {todaySuggestions.map(s => renderSuggestionCard(s))}
                  </div>
                )}

                {tomorrowSuggestions.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-white/30 px-2 mb-2">Sabah</p>
                    {tomorrowSuggestions.map(s => renderSuggestionCard(s))}
                  </div>
                )}

                {suggestions.length === 0 && (
                  <div className="p-6 text-center text-white/20 text-sm">
                    <ChefHat size={32} className="mx-auto mb-2 opacity-30" />
                    Sabah üçün rezerv yoxdur
                  </div>
                )}
               </div>
           </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );

  function renderSuggestionCard(s: ScheduleSuggestion) {
    const isToday = s.type === 'today';
    return (
      <div
        key={s.id}
        className={`rounded-xl border p-4 transition-all ${
          isToday ? 'bg-white/[0.04] border-white/[0.1]' : 'bg-white/[0.03] border-white/[0.08]'
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-sm">{s.name}</span>
              {s.table_number && (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${lightMode ? 'bg-gray-100 border-gray-300 text-gray-600' : 'bg-white/[0.06] border-white/[0.1] text-white/60'}`}>
                  Masa {s.table_number}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="flex items-center gap-1"><Clock size={10} />{s.time}</span>
              <span className="flex items-center gap-1"><Users size={10} />{s.guests} nəfər</span>
              <span className="flex items-center gap-1"><ShoppingBag size={10} />{s.pre_order_total?.toFixed(2)} ₼</span>
            </div>
          </div>
          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
            isToday ? 'bg-white/10 text-white/70 border border-white/20' : 'bg-white/5 text-white/30 border border-white/10'
          }`}>
            {isToday ? 'Bugün' : 'Sabah'}
          </span>
        </div>

        <div className={`flex items-center gap-2 p-2.5 rounded-lg mb-3 ${lightMode ? 'bg-gray-50 border border-gray-200' : 'bg-white/[0.04] border border-white/[0.08]'}`}>
          <Sparkles size={12} className={lightMode ? 'text-gray-500' : 'text-white/50'} />
          <div className={`text-xs ${lightMode ? 'text-gray-600' : 'text-white/60'}`}>
            <span className="font-semibold">Təklif: </span>
            {s.suggestion.minutes_before} dəqiqə əvvəl başla
            <span className="text-white/40 mx-1">·</span>
            <span>Hazırlanma vaxtı <strong className={lightMode ? 'text-gray-800' : 'text-white/80'}>{s.suggestion.prepare_at}</strong></span>
          </div>
        </div>

        {s.pre_order_items && s.pre_order_items.length > 0 && (
          <div className="space-y-1 mb-3">
            {s.pre_order_items.slice(0, 4).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs text-white/50">
                <span>×{item.quantity} {item.product_name}</span>
                <span>{(item.unit_price * item.quantity).toFixed(2)} ₼</span>
              </div>
            ))}
            {s.pre_order_items.length > 4 && (
              <p className="text-[10px] text-white/25">+{s.pre_order_items.length - 4} daha</p>
            )}
          </div>
        )}

        {isToday && (
          <button
            onClick={() => handleStartPreparing(s)}
            disabled={sending === s.id}
            className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.97] bg-white text-black disabled:opacity-50 hover:bg-gray-200"
          >
            {sending === s.id ? (
              <span className="animate-pulse">Göndərilir...</span>
            ) : (
              <>
                <CookingPot size={14} />
                Hazırlamağa başla!
              </>
            )}
          </button>
        )}
        {!isToday && (
          <p className="text-[10px] text-center text-white/20">
            Planlaşdırıldı: {s.suggestion.prepare_at}
          </p>
        )}
      </div>
    );
  }
}
