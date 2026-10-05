'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 13f (owner: "inventory-a aid olan seyler eyni sehifede olsunlar"):
// consolidated into the Stok hub. Content: ./counts-content.tsx.
export default function StockCountsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/stock?view=counts');
  }, [router]);
  return null;
}
