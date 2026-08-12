'use client';

import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

function Bone({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-black/[0.06] dark:bg-white/[0.06] ${className}`} />
  );
}

export function FloorSkeleton() {
  const { lightMode } = useTheme();
  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-end gap-3 mb-6">
        <Bone className="w-28 h-10 rounded-full" />
        <Bone className="w-20 h-10 rounded-full" />
        <Bone className="w-24 h-10 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className={`rounded-4xl p-5 border ${lightMode ? 'bg-white border-zinc-100' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <div className="flex items-center justify-between mb-4">
              <Bone className="w-8 h-8 rounded-full" />
              <Bone className="w-12 h-5 rounded-full" />
            </div>
            <Bone className="w-16 h-5 mb-2" />
            <Bone className="w-10 h-3" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 mt-6">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-[var(--theme-accent)]"
              animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <span className="text-xs font-bold text-[var(--theme-text-muted)] ml-2">Yüklənir...</span>
      </div>
    </div>
  );
}

export function ProductGridSkeleton() {
  const { lightMode } = useTheme();
  return (
    <div className="flex flex-col h-full">
      <Bone className="w-full h-14 rounded-3xl mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bone key={i} className="w-20 h-8 rounded-full" />
        ))}
      </div>
      <div className="flex-1 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`flex flex-col rounded-4xl p-4 ${lightMode ? 'bg-[#f4f4f7]' : 'bg-white/[0.08]'}`}>
              <Bone className="aspect-square w-full rounded-3xl mb-4" />
              <Bone className="w-3/4 h-4 mb-2" />
              <Bone className="w-1/2 h-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CartSkeleton() {
  const { lightMode } = useTheme();
  return (
    <div className="flex flex-col h-full">
      <Bone className="w-20 h-5 mb-6" />
      <div className="flex-1 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl ${lightMode ? 'bg-zinc-50' : 'bg-white/[0.03]'}`}>
            <Bone className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <Bone className="w-24 h-3 mb-2" />
              <Bone className="w-16 h-3" />
            </div>
            <Bone className="w-10 h-6 rounded-full" />
          </div>
        ))}
      </div>
      <div className="pt-4 mt-4 space-y-3">
        <Bone className="w-full h-14 rounded-2xl" />
        <Bone className="w-full h-14 rounded-2xl" />
      </div>
    </div>
  );
}

export function DeliveryOrdersSkeleton() {
  const { lightMode } = useTheme();
  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <Bone className="w-32 h-8" />
        <Bone className="w-28 h-12 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`rounded-4xl p-5 h-[180px] border ${lightMode ? 'bg-white border-zinc-100' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <div className="flex items-center justify-between mb-3">
              <Bone className="w-10 h-10 rounded-full" />
              <Bone className="w-16 h-5 rounded-full" />
            </div>
            <Bone className="w-20 h-4 mb-2" />
            <Bone className="w-24 h-3 mb-3" />
            <Bone className="w-full h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TakeawayOrdersSkeleton() {
  const { lightMode } = useTheme();
  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <Bone className="w-32 h-8" />
        <Bone className="w-28 h-12 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`rounded-4xl p-5 h-[180px] border ${lightMode ? 'bg-white border-zinc-100' : 'bg-white/[0.03] border-white/[0.06]'}`}>
            <div className="flex items-center justify-between mb-3">
              <Bone className="w-10 h-10 rounded-full" />
              <Bone className="w-16 h-5 rounded-full" />
            </div>
            <Bone className="w-20 h-4 mb-2" />
            <Bone className="w-24 h-3 mb-3" />
            <Bone className="w-full h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
