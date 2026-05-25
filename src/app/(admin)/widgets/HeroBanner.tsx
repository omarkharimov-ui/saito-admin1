'use client';

export default function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-xl sm:rounded-2xl lg:rounded-3xl bg-[#0a0a0a] p-4 sm:p-6 lg:p-8">
      <div className="relative z-10 p-4 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-gold/60">
              Dashboard
            </span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-white">
              Xoş gəlmisiniz, Admin
            </h1>
            <p className="text-white/40 text-sm mt-1">
              Restaurant running smoothly
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6">
          <div className="relative mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-white/40">
                Today's Revenue
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded-full">
                +12%
              </span>
            </div>
            
            <div className="flex items-end justify-between">
              <h2 className="font-serif font-bold text-white leading-none tracking-tight relative z-10">
                <span className="text-5xl md:text-6xl">
                  ₼ 1,234.56
                </span>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-3">
            <div className="p-4">
              <span className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/30 block mb-2 leading-relaxed">
                Today's Orders
              </span>
              <div className="flex items-end gap-2">
                <span className="font-serif font-bold text-2xl md:text-3xl text-white leading-none">
                  42
                </span>
                <span className="text-[10px] font-medium text-emerald-400/70 mb-1">
                  ↑
                </span>
              </div>
            </div>
            
            <div className="p-4">
              <span className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/30 block mb-2 leading-relaxed">
                Active Tables
              </span>
              <div className="flex items-end gap-2">
                <span className="font-serif font-bold text-2xl md:text-3xl text-white leading-none">
                  8
                </span>
                <span className="text-[10px] font-medium text-emerald-400/70 mb-1">
                  ↑
                </span>
              </div>
            </div>
            
            <div className="p-4">
              <span className="text-[9px] uppercase tracking-[0.3em] font-medium text-white/30 block mb-2 leading-relaxed">
                Today's Favorite
              </span>
              <span className="font-serif font-bold text-lg md:text-xl text-white truncate block leading-tight">
                Sushi Roll
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
