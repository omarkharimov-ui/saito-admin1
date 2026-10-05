'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 13f (owner: "inventory-a aid olan seyler sidebarda ayri tab olmasinda,
// eyni sehifede olsunlar"): this route is now an internal view of the Stok
// hub (/admin/stock). Bookmarks & old deep links keep working — they land
// on the matching hub view. Content lives in ./purchase-orders-content.tsx
// (imported by the hub).
export default function PurchaseOrdersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/stock?view=po');
  }, [router]);
  return null;
}
