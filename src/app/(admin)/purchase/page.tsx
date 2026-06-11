'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function PurchasePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/stock');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080808]">
      <div className="flex flex-col items-center gap-3 text-white/30">
        <Loader2 size={24} className="animate-spin" />
        <p className="text-sm">Tədarük səhifəsi Stok səhifəsinə köçürüldü...</p>
      </div>
    </div>
  );
}
