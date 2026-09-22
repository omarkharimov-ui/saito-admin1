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

  // Final / fulfillment-complete states first.
  // 'served' = handed over (takeaway) — fulfillment done (2026-09-22).
  if (st === 'completed' || st === 'closed' || st === 'served') return 'closed';
  if (st === 'cancelled' || st === 'voided') return 'cancelled';
  if (st === 'refunded' || st === 'partially_refunded') return 'closed';

  const isPaid = isOrderPaid(order);

  // Kitchen rollup (order-level) — the REAL automatic signal, driven by the
  // KDS "mark ready" action (mark_item_ready_atomic updates order_items +
  // rolls up to orders.kitchen_status). Values: pending | preparing |
  // partially_ready | ready | completed.
  // NOTE: the earlier version read `items_sent_to_kitchen`, a column that does
  // NOT exist — so kitchenDone was always false and the status was stuck.
  const k = order?.kitchen_status;
  // For takeaway/delivery, kitchen 'ready' OR 'completed' both mean the food is
  // done and waiting for HANDOVER (not "order finished"). The fulfillment-final
  // state is `served` (orders.status), handled above.
  if (k === 'ready' || k === 'completed') return 'ready';

  // Delivery machine (delivery only): confirmed→preparing→ready→picked_up→
  // in_transit→delivered. Read via the transition_delivery_status RPC.
  const d = order?.delivery_status;
  if (d === 'delivered') return 'closed';
  if (d === 'in_transit' || d === 'picked_up') return 'ready';
  if (d === 'ready') return 'ready';
  if (d === 'preparing') return 'kitchen';

  // In the kitchen / being prepared (incl. partially ready).
  if (k === 'preparing' || k === 'partially_ready' || st === 'preparing') return 'kitchen';

  // Paid but not ready yet — staff should know money is in.
  if (isPaid) return 'paid';

  // Confirmed, waiting for the kitchen.
  if (st === 'confirmed' || k === 'pending') return 'confirmed';

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
