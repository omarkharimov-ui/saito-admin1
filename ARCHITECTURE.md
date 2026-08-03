# Architecture — Saito Admin 1

## Core Principle: Single Source of Truth (SSOT)

Every piece of business data has exactly one authoritative source.

### Rules

1. **One authoritative table per entity**
   - Orders: `orders`
   - Payments: `order_payments`
   - Inventory: `inventory_transactions`
   - Reservation tables: `reservation_tables`
   - Reservation preorder items: `reservation_preorder_items`
   - Kitchen status: `orders.kitchen_status` + `order_items.kitchen_status`
   - Operation history: `operation_logs`

2. **No denormalized copies**
   - `orders.items` JSON column is deprecated. Do not read from or write to it.
   - `table_floors` snapshot columns (`total_amount`, `guest_count`) are convenience views. Do not treat them as authoritative.

3. **Frontend never coordinates multi-table updates**
   - All multi-table business operations must be performed via Atomic RPCs.
   - Frontend calls a single RPC endpoint per business action.

4. **All business logic lives in the database**
   - Atomic RPCs (`SECURITY DEFINER`) are the only entry points for state-changing operations.
   - Frontend/Next.js API routes are thin wrappers that call RPCs.
   - Never duplicate business logic in TypeScript.

---

## Database Architecture

### Tables

| Table | Purpose | SSOT? |
|-------|---------|-------|
| `orders` | Active/completed orders | Yes |
| `order_items` | Order line items | Yes |
| `order_payments` | Split/partial/refund payments | Yes |
| `inventory_transactions` | Stock movements | Yes |
| `reservations` | Reservation records | Yes |
| `reservation_tables` | Reservation-to-table assignments | Yes |
| `reservation_preorder_items` | Pre-ordered items for reservations | Yes |
| `table_floors` | Floor plan + table state snapshot | Partial (state only) |
| `operation_logs` | Audit trail | Yes |
| `kitchen_schedule` | Scheduled reservation kitchen jobs | Yes |

### State Machines

#### Order Status

```
new → in_progress → paid → completed
              ↘ cancelled
              ↘ (reopen) → new
```

#### Kitchen Status

```
reserved → pending → accepted → preparing → ready → served
                          ↘ cancelled
```

#### Reservation Status

```
pending → confirmed → seated → completed
                   ↘ cancelled
                   ↘ no_show
```

#### Table Status

```
empty ↔ reserved ↔ occupied
```

---

## Atomic RPC Contract

Every RPC:

1. Locks all affected rows with `FOR UPDATE`
2. Validates preconditions
3. Performs all writes in a single transaction
4. Writes an `operation_logs` entry
5. Returns a JSONB result

### Conventions

```sql
CREATE OR REPLACE FUNCTION public.operation_name_atomic(
  p_<param> <TYPE> DEFAULT <value>,
  p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- variables
BEGIN
  -- 1. Lock
  -- 2. Validate
  -- 3. Mutate
  -- 4. Log
  RETURN jsonb_build_object('success', true, ...);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

---

## Realtime Architecture

### Channels

| Channel | Purpose |
|---------|---------|
| `table_floors` | POS ↔ POS table state sync |
| `orders` | Order state broadcast |
| `order_items` | Kitchen item status sync |
| `reservations` | Reservation changes |

### Sync Strategy

1. **Optimistic local updates** via IndexedDB (`OfflineStore`)
2. **Background sync** via outbox pattern
3. **CRDT merge** (LWW-Element-Set) for conflict resolution
4. **Server is authoritative** — client merges are temporary until server confirms

### Important

- Realtime channels must be created fresh per mount (no static names under React Strict Mode)
- All state mutations must go through RPCs, never direct table writes from frontend
- After any RPC success, frontend must refetch affected data from server

---

## Inventory Rules

1. Every `order_item` that consumes stock must have exactly one corresponding `inventory_transactions` row with `transaction_type = 'deduction'`
2. Reopening an order creates a reversal (`transaction_type = 'reversal'`)
3. `order_item_id` in `inventory_transactions` is UNIQUE — prevents double deduction
4. Combo recipes expand into ingredient deductions at payment time (inside `complete_payment_atomic`)

---

## Payment Rules

1. All payments for an order are recorded in `order_payments`
2. `complete_payment_atomic` is the only entry point for finalizing payment
3. Partial payments: `is_partial = true`, order status stays `in_progress`
4. Refunds: `is_refund = true`, linked via `reference_order_id`
5. Reopening clears all `order_payments` and creates inventory reversals

---

## Reservation Rules

1. `reservation_preorder_items` is the SSOT for pre-order data
2. `reservation_tables` links reservations to tables (many-to-many capable)
3. When guest arrives: `guest-arrived` RPC converts reservation → order
4. Scheduled kitchen preorder uses `kitchen_schedule` table
5. Cancellation cascades: clear preorder items, free table, log operation

---

## Frontend Constraints

- Next.js App Router API routes (`/app/api/.../route.ts`) are **proxies only**
- They validate auth, then call Supabase RPCs
- They must NOT contain business logic
- They must NOT perform multi-step mutations

---

## Security

- All RPCs use `SECURITY DEFINER`
- RLS policies: `service_role` gets full access, `anon` gets read-only where needed
- Frontend never uses `service_role` key directly — only through API routes
- `requireAuth()` middleware protects all API routes
