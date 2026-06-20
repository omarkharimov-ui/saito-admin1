'use client';

const PHRASES = ['SİSTEM OYANIR', 'MƏLUMATLAR YÜKLƏNİR', 'HAZIR OLUR'];

export default function AdminLoadingScreen() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-8 px-6">
      <p className="text-[10px] font-black tracking-[0.55em] uppercase text-gold/30">SAITO ADMIN</p>
      <div
        className="w-14 h-14 rounded-full border-2 border-gold/15 border-t-gold/80 animate-spin-calm"
        aria-hidden
      />
      <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-gold/50 text-center">
        {PHRASES[0]}
      </p>
    </div>
  );
}
