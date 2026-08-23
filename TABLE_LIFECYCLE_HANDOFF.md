# AGENT HANDOFF — TABLE LIFECYCLE AUDIT

You are continuing the `saito-admin1` POS audit. All previous commits are pushed. Dev server runs at `http://localhost:3000`. Auth is bypassed for local dev.

## CRITICAL BLOCKER

The `transition_order_status` RPC currently maps `orders.status` directly to `table_floors.status`. This may break the canonical table lifecycle. You must audit and fix this before proceeding to Takeaway.

## TABLE LIFECYCLE AUDIT

1. Query `public.state_transitions WHERE entity = 'table'` and document the canonical table lifecycle.
2. Test the full dine-in lifecycle end-to-end and verify `table_floors.status` at each step:
   - `NEW → CONFIRMED → IN_KITCHEN → READY → SERVED → BILL_REQUESTED → PAID → CLOSED`
3. Fix the mapping if needed:
   - Remove direct `orders.status → table_floors.status` mapping from `transition_order_status` if incorrect
   - Create separate `transition_table_status` RPC if needed
   - Ensure `mark_order_ready` and `prepare_order_items` update table state correctly
4. Verify payment/close behavior: does `paid` mean `cleaning` or `occupied`? Does `closed` mean `empty`?
5. Test invalid transitions are rejected by DB.
6. Test concurrent transitions are safe (no duplicate audit logs).

## AFTER TABLE AUDIT

- Complete full dine-in lifecycle verification (realtime, keyboard UX, print isolation).
- Then proceed to Takeaway flow.

## DO NOT

- Do NOT redesign architecture.
- Do NOT add frontend direct mutations.
- Do NOT modify Delivery unless required and backward-compatible.
