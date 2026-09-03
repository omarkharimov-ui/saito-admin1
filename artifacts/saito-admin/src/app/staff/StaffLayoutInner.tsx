'use client';

import { useEffect } from 'react';
import { StaffBottomNav } from './components/StaffBottomNav';

export default function StaffLayoutInner({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.style.setProperty('--app-brightness', '1');
  }, []);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white font-sans">
      <div className="mx-auto max-w-md min-h-[100dvh] relative">
        <main className="pb-24">
          {children}
        </main>
        <StaffBottomNav />
      </div>
    </div>
  );
}
