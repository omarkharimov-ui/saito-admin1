'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 13f (owner: "inventory-a aid olan seyler eyni sehifede olsunlar"):
// consolidated into the Stok hub. Content: ./waste-standards-content.tsx.
export default function WasteStandardsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/stock?view=waste');
  }, [router]);
  return null;
}
