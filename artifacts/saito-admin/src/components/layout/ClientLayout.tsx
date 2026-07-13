'use client';

import { usePathname } from 'next/navigation';
import OrderTracker from '@/components/ui/OrderTracker';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = pathname === '/about' || pathname === '/reservation';

  return (
    <>
      {children}
      {isPublicPage && (
        <>
          <OrderTracker />
        </>
      )}
    </>
  );
}
