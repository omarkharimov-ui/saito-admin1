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
    // If no setup is needed, redirect to the default page.
    else {
      router.replace('/admin/orders');
    }
  }, [searchParams, router]);

  return null;
}
