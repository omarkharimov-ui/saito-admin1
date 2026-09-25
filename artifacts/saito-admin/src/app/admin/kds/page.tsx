'use client';

import { KDSView } from '@/app/admin/pos/components/KDSView';
import { useRouter } from 'next/navigation';
import { useDeviceHeartbeat } from '@/lib/device-heartbeat';

export default function KDSPage() {
  const router = useRouter();
  useDeviceHeartbeat('KDS', 'kds');
  return (
    <div className="h-full w-full p-6">
      <KDSView onBack={() => router.push('/admin')} />
    </div>
  );
}
