'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Users, Check, Clock, Link2, MoreVertical } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { MergedGroup } from '../types/shared';

interface MergedGroupCardProps {
  group: MergedGroup;
  onTap: () => void;
  onAction: () => void;
}

export function MergedGroupCard({ group, onTap, onAction }: MergedGroupCardProps) {
  const { lightMode } = useTheme();
  const [delaySec, setDelaySec] = useState(0);

  const lastActivity = group.parent.last_activity_at || group.children[0]?.last_activity_at;

  useEffect(() => {
    if (!lastActivity) {
      setDelaySec(0);
      return;
    }

    const startTime = new Date(lastActivity).getTime();
    
    const update = () => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      setDelaySec(diff > 0 ? diff : 0);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [lastActivity]);

  const formatDelay = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onClick={onTap}
      className={`relative h-[260px] rounded-[32px] p-6 text-left transition-all duration-300 overflow-hidden border-2 cursor-pointer
        ${lightMode ? 'bg-white border-indigo-300 shadow-md hover:shadow-lg' : 'bg-zinc-900 border-indigo-500/40 shadow-md hover:shadow-indigo-500/10'}`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1.5 ${lightMode ? 'bg-indigo-400' : 'bg-indigo-500'}`} />

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          <span className={`text-4xl font-black tracking-tighter ${lightMode ? 'text-indigo-700' : 'text-indigo-300'}`}>
            Masa {group.parent.table_number}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${lightMode ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
            +{group.children.length}
          </span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onAction(); }} className={`p-2 rounded-full transition-colors ${lightMode ? 'hover:bg-zinc-100' : 'hover:bg-white/10'}`}>
          <MoreVertical size={20} className="opacity-30 hover:opacity-60" />
        </button>
      </div>

      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <Users size={14} className={lightMode ? 'text-zinc-400' : 'text-zinc-500'} />
          <span className={`text-xs font-bold ${lightMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{group.total_guests} nəf.</span>
        </div>
        <span className={`text-xl font-black tabular-nums ${lightMode ? 'text-emerald-600' : 'text-emerald-400'}`}>
          ₼{group.total_amount.toFixed(2)}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${lightMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          <Link2 size={10} />
          Birləşmiş Masalar
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border
            ${lightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
            <Check size={9} strokeWidth={3} />
            Masa {group.parent.table_number}
            <span className="opacity-50 text-[8px] font-black ml-0.5">(əsas)</span>
          </div>
          {group.children.slice(0, 6).map(child => (
            <div key={child.table_number} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold
              ${lightMode ? 'bg-zinc-50 text-zinc-600 border border-zinc-200' : 'bg-white/5 text-zinc-400 border border-white/10'}`}>
              Masa {child.table_number}
            </div>
          ))}
          {group.children.length > 6 && (
            <div className={`text-[9px] font-bold opacity-40 px-1 py-1`}>+{group.children.length - 6}</div>
          )}
        </div>
      </div>

      <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between">
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest
          ${lightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-500' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${lightMode ? 'bg-indigo-400' : 'bg-indigo-500'}`} />
          Qrup
        </div>
        {delaySec > 0 && (
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-black tabular-nums
            ${lightMode ? 'bg-zinc-50 border-zinc-200 text-zinc-400' : 'bg-white/5 border-white/5 text-white/40'}`}>
            <Clock size={10} strokeWidth={3} />
            {formatDelay(delaySec)}
          </div>
        )}
      </div>
    </div>
  );
}
