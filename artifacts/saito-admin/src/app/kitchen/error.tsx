'use client';

import { useEffect } from 'react';

export default function KitchenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[kitchen]', error); }, [error]);
  return (
    <div className="h-full w-full flex items-center justify-center bg-black">
      <div className="max-w-sm text-center space-y-4 p-6">
        <p className="text-4xl"> </p>
        <p className="text-lg font-bold text-white/80">Panel xətası</p>
        <p className="text-sm text-white/40">{error.message || 'Gözlənilməz xəta baş verdi'}</p>
        <button onClick={reset}
          className="px-6 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white/70 font-semibold text-sm hover:bg-white/15 transition-all">
          Yenidən cəhd et
        </button>
      </div>
    </div>
  );
}
