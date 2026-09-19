# W-A3 PLAN — CUSTOMER TIMELINE (Wave A #2)

**Wave:** A2 → A3 (user-ratified execution order 2026-09-19: add-to-check →
customer timeline → gift card UI → checklists → device registry).
**Split:** backend/logic = autonomous (freeze-and-audit as always); **timeline
UI = HARD STOP** (user decides placement/look — he is away; UI not started).

## 1. INSPECT evidence (live, 2026-09-19, read-only)

- `customers` = 7 rows, columns: `id, name, phone, total_visits, total_spent,
  last_order_at, created_at`. **No birthday/email/notes columns.**
- **`total_visits` / `total_spent` / `last_order_at` are DEAD denormalized
  columns:** no trigger writes them (pg_trigger on `customers` = none); the
  only referencing function is `guest_link_customer` (inserts 0/0/NULL).
  `orders WHERE customer_id IS NOT NULL` = 5 rows — the real source of truth.
- Routes: only `/api/customers` (GET list + POST find-or-create by phone,
  `requireAuth` — **no `customers.view` permission exists** in the P-1 registry).
- UI: `admin/pos/components/ActionSheet.tsx` — customer search + select +
  loyalty balance (`/api/orders/loyalty?customer_id=`). **No order/visit
  history shown anywhere** (MFM "timeline bloku zəif" = it does not exist).
- `authenticated` SELECT on customers/orders/order_items = true (house RLS
  model; all staff-facing routes use the service_role client anyway).
- 3 of 7 customers have zero orders.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| T1 | New read-only route `GET /api/customers/[id]/timeline?limit=50` (max 100). Auth = `requireAuth` (identical house pattern to `/api/customers`; adding a `customers.view` permission = separate ratified P-1-registry decision → FOLLOW-UP). | Rule 3: no new permission surface without ratification; parity with the existing list route. |
| T2 | **All stats computed live from `orders`** (single source of truth): `visit_count` (non-cancelled/non-voided orders), `total_spent` (Σ total_amount of those), `avg_order`, `first_visit`, `last_visit`, `items_ordered`. The dead `customers.total_visits/total_spent/last_order_at` are NOT maintained and NOT exposed (two conflicting SoTs). | Rule 1/9: live DB evidence (no writers exist). Maintaining them would require a new trigger on the FROZEN orders surface — rejected. |
| T3 | `orders[]` = newest-first, ≤ limit: `{id, table_number, order_type, status, total_amount, paid_amount, created_at, items:[{name, qty, unit_price}], payments:[{method, amount, status}]}` (payments = captured non-refund rows; refunded rows included with `is_refund` flag for corrections visibility). | Covers "order/visit history" (MFM §6 🟡) without any write path. |
| T4 | `favorites` = top 10 products by Σ quantity across the customer's non-cancelled orders (order_items join). | MFM §6 "favorite items 🟡". |
| T5 | Loyalty NOT in the timeline payload — the UI already calls the frozen `/api/orders/loyalty?customer_id=`. | Minimal surface; no duplication. |
| T6 | Unknown customer id → 404 `Customer not found` (no existence leak beyond what the list route already exposes to staff). | House error-map pattern (W-A2). |
| T7 | Security chain (Rule 10): UI (staff session) → route (`requireAuth`) → service_role client → server-side fixed SELECTs (no client-composed SQL) → read-only (no writes, no mutations) → nothing to audit (reads; consistent with the list route). | — |
| T8 | Gate `.w-a3-gate.cjs` (route-level E2E, real HTTP): fixture = temp customer (direct insert, name `W3_CUST` + phone `11188889101`) + 3 orders (paid w/ 2 items, open w/ 1 item, cancelled w/ 1 item) → asserts: stats exclude the cancelled order; totals exact; favorites ranked; orders[] newest-first with items+payments embedded; 404 unknown id; limit clamped to 100; **zero residue** teardown (trusted flag; F-contract staff-neutralize not needed — no staff created). | Same discipline as W-A2. |
| T9 | Narrowed reflow: **W-A1 only** (customer-channel surface). Justification: W-A3 is additive read-only — no route, migration, RPC, trigger, or table changed. (Full chain re-verified at W-A2 freeze: O 38/38, F 35/35, W-A1 18/18.) | Rule 6/11: no surface touched → no re-run debt. |
| T10 | **UI = HARD STOP.** Placement options for the user: (a) ActionSheet customer tab extension, (b) dedicated `/admin/customers` page, (c) drawer from the POS table view. Backend payload serves any of them. | Permanent rule. |

## 3. Scope (autonomous part)

1. `src/app/api/customers/[id]/timeline/route.ts` (new, read-only).
2. `.w-a3-gate.cjs` (fixture build → asserts → teardown, zero residue).
3. W-A3 freeze section (report appended to `W_A2_FREEZE_REPORT` style:
   `W_A3_FREEZE_REPORT_2026-09-19.md`) + HANDOVER + MFM + diary + scoped
   commit + push.
4. **STOP** for UI (T10).

## 4. OUT OF SCOPE (FOLLOW-UP / DEFERRED)

- `customers.view` permission in the P-1 registry (needs ratified migration + role seeding).
- Dead-column cleanup (`total_visits/total_spent/last_order_at` drop or backfill) = P-9 hygiene class.
- birthday/email/notes profile fields = product decision (MFM §6 lists them ✅ but the table lacks them — MFM row corrected at freeze).
- Marketing segmentation/consent (Wave C).
