'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Layer-based mobile page content renderer */
export default function MobilePageContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Prevent double mounting by ensuring component is ready
    const timer = setTimeout(() => setIsReady(true), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!isReady) {
    return (
      <div className="mobile-page-loading min-h-0 opacity-0">
        {children}
      </div>
    );
  }

  return (
    <div className="mobile-layered-content">
      {/* Background Layer */}
      <div className="mobile-page-background fixed inset-0 bg-background opacity-0 pointer-events-none" />
      
      {/* Main Content Layer */}
      <div className="mobile-page-main relative z-10 min-h-0">
        <div className="mobile-premium-root min-h-0">
          {children}
        </div>
      </div>
      
      {/* Overlay Layer for interactions */}
      <div className="mobile-page-overlay fixed inset-0 pointer-events-none z-30" />
    </div>
  );
}