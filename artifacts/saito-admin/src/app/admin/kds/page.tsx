'use client';

import { KDSView } from '@/app/admin/pos/components/KDSView';
import { useRouter } from 'next/navigation';

export default function KDSPage() {
  const router = useRouter();
  return (
    <div className="h-full w-full p-6">
      <KDSView onBack={() => router.push('/admin')} />
    </div>
  );
}
