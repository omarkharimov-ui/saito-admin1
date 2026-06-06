'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useTheme } from '@/lib/theme/ThemeContext';

export function ClockButton() {
  const { t } = useLanguage();
  const { lightMode } = useTheme();
  const [clockedIn, setClockedIn] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const { data: staff } = await supabase.from('staff').select('id').limit(1);
      if (!staff || staff.length === 0) return;
      const { data } = await supabase
        .from('clock_events')
        .select('id')
        .eq('staff_id', staff[0].id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setClockedIn(true);
        setEventId(data[0].id);
      } else {
        setClockedIn(false);
        setEventId(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  const handleToggle = async () => {
    setActing(true);
    try {
      const { data: staff } = await supabase.from('staff').select('id').limit(1);
      if (!staff || staff.length === 0) return;
      if (clockedIn && eventId) {
        await supabase.from('clock_events').update({ clock_out: new Date().toISOString() }).eq('id', eventId);
        setClockedIn(false);
        setEventId(null);
      } else {
        const { data } = await supabase.from('clock_events').insert({
          staff_id: staff[0].id,
          clock_in: new Date().toISOString(),
        }).select().single();
        if (data) {
          setClockedIn(true);
          setEventId(data.id);
        }
      }
    } finally {
      setActing(false);
    }
  };

  return (
    <button onClick={handleToggle} disabled={loading || acting}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold tracking-wider transition-all ${clockedIn ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-white/[0.04] text-white/40 border-white/[0.07] hover:text-white/70 hover:border-white/20'} disabled:opacity-40`}>
      {acting ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
      {clockedIn ? t('clocked_in') : t('clock_in')}
    </button>
  );
}
