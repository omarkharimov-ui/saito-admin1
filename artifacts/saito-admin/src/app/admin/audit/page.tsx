'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 13f (owner: "inventory-a aid olan seyler eyni sehifede olsunlar"):
// consolidated into the Stok hub. Content: ./audit-content.tsx.
export default function AuditRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/stock?view=audit');
  }, [router]);
  return null;
}
