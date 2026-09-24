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
import { useRouter } from 'next/navigation';

export default function BDSPage() {
  const router = useRouter();
  return (
    <div className="h-full w-full p-6">
      <KDSView stationType="bar" onBack={() => router.push('/admin')} />
    </div>
  );
}
