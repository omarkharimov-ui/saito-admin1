'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Only redirect to settings if needsSetup is explicitly passed
    if (searchParams.get('needsSetup') === 'true') {
      router.replace('/admin/settings?section=users&setup=true');
    }
    else {
      router.replace('/admin/pos');
    }
  }, [searchParams, router]);

  return null;
}
