'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('needsSetup') === 'true') {
      router.replace('/admin/settings?section=users&setup=true');
    }
    // If no setup is needed, redirect to the POS page (Dashboard).
    else {
      router.replace('/admin/pos');
    }
  }, [searchParams, router]);

  return null;
}
