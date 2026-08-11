'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  useEffect(() => {
    const target = '/staff/login' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : '');
    router.replace(target);
  }, [router, redirect]);

  return null;
}
