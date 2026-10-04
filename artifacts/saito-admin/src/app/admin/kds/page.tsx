'use client';

import { KDSView } from '@/app/admin/pos/components/KDSView';
import { VirtualKeyboardProvider } from '@/app/admin/pos/components/VirtualKeyboard';
import { useRouter } from 'next/navigation';
import { useDeviceHeartbeat } from '@/lib/device-heartbeat';

export default function KDSPage() {
  const router = useRouter();
  useDeviceHeartbeat('KDS', 'kds');
  // 12u: KDSView's 86 flow mounts PinGuard, whose keypad needs the virtual
  // keyboard context (the POS page wraps its tree the same way).
  return (
    <div className="h-full w-full p-6">
      <VirtualKeyboardProvider>
        <KDSView onBack={() => router.push('/admin')} />
      </VirtualKeyboardProvider>
    </div>
  );
}
