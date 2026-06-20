'use client';

import React from 'react';

export default function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse px-4 md:px-0 pt-2">
      {/* Yoji AI Card Skeleton */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-white/[0.05] shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-3 bg-white/[0.06] rounded w-24" />
          <div className="h-4 bg-white/[0.08] rounded w-full max-w-xs" />
          <div className="h-4 bg-white/[0.05] rounded w-2/3 max-w-xs" />
        </div>
        <div className="h-10 w-28 bg-white/[0.06] rounded-xl shrink-0" />
      </div>

      {/* Product cards skeleton — matches mobile card layout */}
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-1 py-2 border-b border-white/[0.04]">
            <div className="w-[68px] h-[68px] rounded-2xl bg-white/[0.05] shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="h-4 bg-white/[0.07] rounded-lg w-3/4" />
              <div className="h-3 bg-white/[0.04] rounded-lg w-1/2" />
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-white/[0.04] rounded-lg" />
                <div className="h-5 w-12 bg-white/[0.04] rounded-lg" />
              </div>
            </div>
            <div className="space-y-1.5 shrink-0">
              <div className="h-5 w-14 bg-white/[0.06] rounded-lg" />
              <div className="h-7 w-14 bg-white/[0.04] rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
