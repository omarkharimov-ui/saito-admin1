'use client';

/**
 * BDS — Bar Display (2026-09-24, owner clarification).
 *
 * BDS = BAR display system: the same station-board machinery as KDS
 * (KDSView), restricted to the bar station family (stations.station_type
 * = 'bar'). Coffee / shakes / drinks tickets land here via the product →
 * station routing (products.station_id → order_items.station_id trigger).
 *
 * The Delivery / Takeaway operations board that previously lived at this
 * route (2026-09-23) moved to /admin/delivery — the route the delivery
 * Phase 2 plan always specified.
 */

import { KDSView } from '@/app/admin/pos/components/KDSView';
import { VirtualKeyboardProvider } from '@/app/admin/pos/components/VirtualKeyboard';
import { useRouter } from 'next/navigation';
import { useDeviceHeartbeat } from '@/lib/device-heartbeat';

export default function BDSPage() {
  const router = useRouter();
  useDeviceHeartbeat('BDS', 'bds');
  // 12u: same as the KDS page — KDSView's 86 flow (PinGuard keypad) needs
  // the virtual keyboard context.
  return (
    <div className="h-full w-full p-6">
      <VirtualKeyboardProvider>
        <KDSView stationType="bar" onBack={() => router.push('/admin')} />
      </VirtualKeyboardProvider>
    </div>
  );
}
