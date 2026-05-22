'use client';

import { usePathname } from 'next/navigation';

/** Səhifə dəyişəndə mobil üçün yüngül “yuxarı qalxma” keçidi. */
export default function MobilePageContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="mobile-page-enter mobile-premium-root min-h-0">
      {children}
    </div>
  );
}
