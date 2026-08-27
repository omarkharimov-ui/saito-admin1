'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    const target = redirect && redirect.startsWith('/') ? redirect : '/staff/login';
    const destination = `/staff/login${target !== '/staff/login' ? `?returnTo=${encodeURIComponent(target)}` : ''}`;
    router.replace(destination);
  }, [router, redirect]);

  return null;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
