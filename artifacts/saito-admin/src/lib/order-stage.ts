/**
 * Automatic order-stage derivation (2026-09-22).
 *
 * Previously the takeaway/delivery list + action sheet showed the raw
 * `orders.status` string, which (a) is rarely updated in the lifecycle and
 * (b) was fed into a broken `||` chain that ALWAYS rendered "TƏSDİQLƏNDİ".
 *
 * This derives a single canonical STAGE from the data we already have, so the
 * status is AUTOMATIC (like dine-in) instead of a manually-set field:
 *   payment state (is_fully_paid / paid_amount / total_amount)
 *   kitchen state (items_sent_to_kitchen vs item_count)
 *   order.status (final states + ready)
 *
 * The full Bar Display System (station routing, per-dish readiness) builds on
 * top of this — see the session handoff notes.
 */
export type OrderStage =
  | 'new'        // created, not yet confirmed
  | 'confirmed'  // confirmed, waiting to go to kitchen
  | 'kitchen'    // in the kitchen / being prepared
  | 'ready'      // prepared — ready for handover / delivery
  | 'paid'       // fully paid (progress may continue)
  | 'closed'     // completed / closed / refunded (final, not cancelled)
  | 'cancelled'; // cancelled / voided

export function deriveOrderStage(order: any): OrderStage {
  const st = order?.status;

  // Final states first.
  if (st === 'completed' || st === 'closed') return 'closed';
  if (st === 'cancelled' || st === 'voided') return 'cancelled';
  if (st === 'refunded' || st === 'partially_refunded') return 'closed';

  const total = Number(order?.total_amount ?? 0);
  const paidAmt = Number(order?.paid_amount ?? 0);
  const isPaid =
    !!order?.is_fully_paid || st === 'paid' || (total > 0 && paidAmt >= total);

  const sent = Number(order?.items_sent_to_kitchen ?? 0);
  const count = Number(order?.item_count ?? 0);
  const kitchenDone = count > 0 && sent >= count;

  // Ready for handover: explicitly ready, or the whole ticket is prepared.
  if (st === 'ready' || kitchenDone) return 'ready';
  // Paid but still in preparation.
  if (isPaid) return 'paid';
  // In the kitchen / being prepared.
  if (st === 'preparing' || st === 'in_kitchen' || sent > 0) return 'kitchen';
  // Confirmed, waiting for the kitchen.
  if (st === 'confirmed') return 'confirmed';
  // Brand new / pending confirmation.
  return 'new';
}

/** True when the order is fully settled (any of the paid signals). */
export function isOrderPaid(order: any): boolean {
  const st = order?.status;
  const total = Number(order?.total_amount ?? 0);
  const paidAmt = Number(order?.paid_amount ?? 0);
  return !!order?.is_fully_paid || st === 'paid' || (total > 0 && paidAmt >= total);
}
