# K — KITCHEN/KDS FOUNDATION + CURRENT-STATE AUDIT (2026-09-11)

> **K-0 audit-only. NO code/DB change.** Frozen workflow:
> `K-0 foundation audit → K-1 business gate → K-2 hardening → K-3 live concurrency → K-4 full regression → K-FREEZE`.
> Every claim = real DB (`jbxmlnsicbfkbsatnoej`) + repo source. "UI works" is NOT used as PASS —
> every finding is proven at DB/RPC level with anon / waiter / kitchen / manager / cross-location credentials.
> **A / E / S / F / O remain 🔒 untouched** (G6/F/O frozen contracts not re-opened).
> `idx_orders_active_table` global-unique residual stays a documented F-boundary (not revisited).

---

## ARCHITECTURE — what exists (current)

### Data model
| Object | Kind | Live | Role |
|---|---|---|---|
| **`order_items.kitchen_status`** | column | 701 items | THE item state (SSOT) |
| **`kds_tickets`** | **VIEW** (definer) | 368 rows | read-model joining `order_items`+`orders`+`table_floors`+`stations`; **no location/org filter** |
| `kitchen_tickets` | table | 24 | per-order ticket (`location_id`,`organization_id`); RLS loc-scoped (3 policies) |
| `kitchen_schedule` | table | 0 | scheduled kitchen; RLS ON (1 policy) |
| `stations` | table | 5 | `station_type` (kitchen/bar/expo/sushi…), `location_id`,`organization_id`; RLS loc-scoped |

### Item state machine — real, data-driven, trigger-validity-enforced
- `state_transitions` `entity='item'`: **102 active rules**, each carries `requires_permission`
  (`kitchen.manage`, `order.void`, `pos.void`, `orders.edit`) + `requires_manager_override` (true for
  comped/wasted/ready-cancel/served-cancel/etc.).
- **`trg_item_state_machine_guard`** (BEFORE UPDATE on `order_items.kitchen_status`) →
  `validate_transition('item', old, new)`. Enforces **VALIDITY only** — it does **NOT** read/enforce
  `requires_permission` (no `authorize()`/`has_permission`/`current_staff_id` in it).
  → Same structural gap class as pre-F-01 table: **permission is only enforced in the function layer,
  not the trigger.** See K-02.

### The two RPC families (evidence)
| Family | Representative | set_session_staff | authorize(perm+loc) | location check | FOR UPDATE | outbox | idempotent | anon EXECUTE |
|---|---|---|---|---|---|---|---|---|
| **GOLDEN (token-first)** | `item_kitchen_step(p_token,…)` | ✅ | ✅ (default `kitchen.manage`) | ✅ (`v_order.location_id`) | ✅ (order→item) | ✅ `order_item` | ✅ (already-at-target no-op) | **N** |
| **UNGUARDED (legacy)** | `mark_item_ready_atomic`, `void/comp/waste_order_item_atomic`, `mark_order_ready/completed`, `prepare_order_items`, `cancel_order_items`, `update_order_item_status`, `accept/cancel/recall/reopen_kitchen_ticket_atomic`, `send_to_kitchen_atomic`, `route_kitchen_order`, `assign_order_staff`, `record_item_waste`, `return_to_stock`, `toggle_item_hold` | ❌ | ❌ | ❌ (most) | ✅ (most) | ❌ (most) | ❌ (most) | **N** (service-role only) |

`item_kitchen_step` is the correct implementation (token→identity→order-lock→item-lock→idempotent→
canonical-step→registry→`authorize(perm, order.location)`→audit→outbox). **It has 0 callers (dead).**
The live KDS server routes call the **unguarded** family.

---

## FINDINGS (evidence-backed)

### 🔴 K-01 — `order_items` anon read (and RLS-granted write) leak — mis-scoped RLS policy
**Evidence:**
- `order_items` policy **`service_role_full_order_items`** = `polroles={0}` (i.e. **PUBLIC / all roles**)
  + `USING (true)` + `WITH CHECK (true)` + `cmd=*`. RLS policies OR, so this single policy overrides the
  four correctly-scoped ones (`*_loc` = `authenticated` + org/loc EXISTS; `*_service_full` = `service_role`).
- Live proof (`SET ROLE anon`): **`SELECT count(*) FROM order_items` = 701** (all rows, no location/org
  restriction). `orders` table by comparison = **0** for anon (its policies are role-scoped correctly).
- Live proof (PostgREST anon key): `GET /rest/v1/order_items?select=…` returns real rows
  (`product_name`, `unit_price`, `total_price`, `special_notes`, `modifiers`, `order_id`).
- Table ACL: `order_items` `anon` SELECT=**true**, INSERT/UPDATE=**false** (so anon is read-only at the
  ACL layer, but the `WITH CHECK true` policy would grant write if the ACL were ever opened).
**Impact:** any unauthenticated browser can enumerate **all orders' items, prices, special notes,
modifiers, order IDs** across all locations (PII-adjacent + commercial). Cross-location read leakage.
**Affected contract:** O (order_items integrity/RLS), F (multi-location isolation). **This is a frozen
contract (O/F) issue surfaced by the K audit** — per the K rule it is recorded as a dependency-boundary
finding, NOT fixed in K; needs a user gate (O or F re-open, or a scoped fix that does not change
frozen behavior).
**Reproduction:** `curl $SUPABASE/rest/v1/order_items?limit=1` with only the anon apikey → 200 + rows.

### 🔴 K-02 — `kds_tickets` view is anon-readable and cross-location (no location/org filter)
**Evidence:**
- `kds_tickets` is a **definer VIEW** (`security_invoker=false` / no reloption), joining
  `order_items⋈orders⋈table_floors⋈stations` with a `WHERE` that filters finalized status but **no
  `location_id`/`organization_id` predicate** (`has_location_filter=false`, `has_org_filter=false`).
- Live proof: anon `SET ROLE` reads **368 rows**; PostgREST anon `GET /rest/v1/kds_tickets` returns real
  ticket rows (`order_number`, `table_number`, `product_name`, prices, `item_status`, station).
- No DB function/trigger/view WRITES `kds_tickets` (0 callers; it is a pure read-model). It is not
  referenced anywhere in `src` either → **the live KDS UI does not use it**; it is a stale read surface.
**Impact:** unauthenticated cross-location read of the KDS ticket feed (table numbers, item status,
stations, prices). Redundant with K-01 (both expose order_items) but an independent anon-readable
object with no location scoping.
**Affected contract:** O/F (isolation). Same frozen-boundary disposition as K-01.
**Reproduction:** `curl $SUPABASE/rest/v1/kds_tickets?limit=1` with anon apikey → 200 + rows.

### 🔴 K-03 — `create_delivery_order` is anon-executable with NO authz / NO location validation (raw-RPC order-creation bypass)
**Evidence:**
- `create_delivery_order`: `set_session_staff=false`, `authorize=false`, `has_location_access=false`,
  **`anon EXECUTE=true`** (G2 only revoked `authenticated`, left the PUBLIC/anon default).
- It requires `p_location_id`/`p_organization_id` **from the caller** and **INSERTs into `orders`** with
  them (no session, no location-access check, no permission).
- Live proof (anon PostgREST, bogus location, no residue): returns
  **`23503` `orders_location_id_fkey`** — i.e. it **reached the INSERT** (not 42501). With a **real**
  location/org id, an anonymous client can **create a delivery order in the DB**.
- `create_takeaway_order` is the same shape but its first helper `generate_takeaway_order_number` has
  no anon EXECUTE → anon is currently blocked at 42501 (latent; the takeaway number-gen is the only thing
  stopping it). `calculate_order_total_v3` is also anon-executable (read-only, lower impact).
**Impact:** **unauthenticated order creation** (delivery) with attacker-chosen location/customer/phone/
items + `performed_by`. Bypasses the O-frozen "order creation is server-trusted + location-scoped"
contract (O-04/G4) because it is a direct PostgREST RPC, not the scoped route.
**Affected contract:** **O (G4/G3 order-creation location + identity) — a frozen contract re-exploitable
via a K/adjacent RPC.** Recorded as dependency-boundary; needs a user gate.
**Reproduction:** `POST /rest/v1/rpc/create_delivery_order` with anon key + valid location/org → order created.

### 🔴 K-04 — Live KDS server routes call UNGUARDED item RPCs with **no permission, no location, caller-supplied identity**
**Evidence (routes → RPC, client = service role so it bypasses the RPC ACL):**
- `/api/kitchen/cancel` → `cancel_ticket_atomic(p_performed_by: auth.user.id, …)`
- `/api/kitchen/recall` → `recall_ticket_atomic(p_performed_by: auth.user.id, …)`
- `/api/kitchen/void-comp-waste` → `void/comp/waste_order_item_atomic(p_performed_by: auth.user.id, …)` (server-side identity, but still no perm/location)
- `/api/orders/mark-ready` → `mark_item_ready_atomic` (service-role client)
- **All route-level auth is `requireAuth` only** (any active staff) + `requireActiveShift` (void-comp-waste).
  **None** enforce `kitchen.manage` / `order.void` / `pos.void`, and **none** pass a location.
- The target fns have **no internal `set_session_staff`/`authorize`/`has_location_access`** (verified:
  `mark_item_ready_atomic` authz=FALSE, location=FALSE; `void_order_item_atomic` authz=FALSE, location=FALSE).
- `performed_by` on cancel/recall is **server-derived** (`auth.user.id`) → identity NOT spoofable at the
  route layer (good), but there is **no permission/location gate at all** (bad).
**Impact:** **any** active staff (waiter `kitchen.view` only; host; etc.) can, via these routes, drive
**any** order's items to ready/void/comp/waste/cancel/recall in **any** location — no `kitchen.manage`,
no `order.void`, no location check. This is the KDS analog of frozen O-01 (permission column not wired to
the live path). The correct `item_kitchen_step` (perm+location+token) is dead.
**Affected contract:** **O (item state + permission)** — the item machine's `requires_permission` is
never enforced on the live path. **K-01..K-04 are the security core of the K module.**
**Reproduction (DB level):** a waiter-session token is not even needed — the routes use service role;
a waiter (kitchen.view only) hitting `/api/kitchen/void-comp-waste` can void any item (no permission check).

### 🟠 K-05 — KDS item mutations are **not idempotent / not concurrency-safe** on the live (unguarded) path
**Evidence:** the live fns (`mark_item_ready_atomic`, `void/comp/waste_order_item_atomic`,
`update_order_item_status`, `cancel_order_items`) have **no idempotent re-entry** and **no
order→item lock ordering** documented (unlike `item_kitchen_step` which locks order then item and
returns `idempotent:true` on re-hit). `cancel_order_items`/`comp/waste/void`/`update_order_item_status`
have **no finalized-order (`paid/cancelled/closed`) guard** (verified `blocks_finalized=false`), so
item state can be mutated on an order that is already paid/cancelled (only `mark_item_ready_atomic` and
`mark_order_ready` check status).
**Impact:** duplicate bump / duplicate event (ready+cancel, prepare+cancel, recall+ready races), and
post-payment item void/comp/waste without going through the O-frozen refund/void-override workflow.
**Affected contract:** O (order/item invariants, `idx`/money integrity). Concurrency battery = K-3.
**Reproduction (K-3):** two concurrent `void_order_item_atomic` on the same item; or void on a `paid` order.

### 🟠 K-06 — `get_kitchen_queue` (station routing) has **no location/org scope** (dead but exposed)
**Evidence:** `get_kitchen_queue(p_station)` selects `order_items⋈orders WHERE status NOT IN(paid/closed/cancelled)
AND kitchen_status NOT IN(completed/cancelled/served) [AND station]` — **no `location_id`/`organization_id`**
predicate. `anon EXECUTE=false`, `authenticated EXECUTE=true`, **0 src/DB callers (dead)**.
**Impact:** if wired, it would leak every location's live KDS queue to any staff (cross-location). Dead now,
so latent — but it is a ready-made cross-location leak and is `authenticated`-executable.
**Affected contract:** K (station routing) + F (isolation).
**STATUS: 🔒 FIXED (G5, migration `20260911000038`)** — scoped + REVOKE authenticated/anon + service_role-only.
Proof: see "HARDENING — G-GATES" § G5.

### 🟡 K-07 — `order.void` permission is declared in the item machine but **held by NO role**
**Evidence:** item rules use `requires_permission='order.void'` for cancelled/voided edges; the permissions
table has the `order.void` row, but the role matrix shows **no role** maps to `order.void`
(kitchen/superadmin have `kitchen.manage`; admin/cashier/manager/owner/superadmin have `pos.void`; no `order.void`).
**Impact:** in the **golden** `item_kitchen_step` path, the voided/cancelled item edges (`order.void`) would
be **denied for everyone** (no one holds the perm) → the canonical path can't void an item as-is, while the
**unguarded** live path can void with no permission at all. The permission model is inconsistent between the
dead golden path and the live unguarded path.
**Affected contract:** O (permission registry) + K. Needs a decision: which role should hold `order.void`
(kitchen? manager+?) and does the live path even need it.

### 🟡 K-08 — KDS realtime relies on table-level `postgres_changes` (orders / order_items), not a scoped KDS event
**Evidence:** `app/kitchen/page.tsx:803` subscribes `postgres_changes { table:'orders' }` and
`:923` `{ table:'order_items' }` via `lib/realtime` (anon-key client, no location filter in the subscription).
There is an outbox `aggregate_type='kds_ticket'` (98 rows) + `emit_kds_ticket_event` (0 callers, dead) — the
intended KDS event spine exists but is **unused**; realtime is raw table CDC.
**Impact:** (a) realtime payload is filtered client-side only → cross-location KDS push possible (the
authenticated RLS on `order_items` is defeated by K-01's `polroles={0}` policy at the REST layer; realtime
uses its own replication policy — needs confirmation); (b) event loss is safe only because DB is SSOT (true),
but duplicate event handling is not defined. **SSOT is the DB** (good) — the risk is **push scope**, not state.
 **Affected contract:** K (realtime) + F (isolation).
 **STATUS: 🔒 FIXED (G6, migrations `20260911000039`+`20260911000040`)** — the `kds_ticket`
 outbox spine is now the canonical **location/station-scoped, dup-safe, resync-able**
 KDS event; the KDS poll is the security boundary; raw CDC demoted to a non-security wake.
 Proof: see "HARDENING — G-GATES" § G6.

### 🟢 K-09 — Positive (verified solid, keep)
- **Item state VALIDITY** is trigger-enforced for all callers (`trg_item_state_machine_guard` →
  `validate_transition('item',…)`) — invalid edges (e.g. `pending→ready`) are blocked at DB for every path.
- **`item_kitchen_step`** is a correct golden implementation (token→perm→location→lock→idempotent→outbox) —
  the fix target for K-04 already exists; it just has no callers.
- **kitchen_tickets / kitchen_schedule / stations RLS** are correctly location/org scoped for
  `authenticated` (EXISTS on parent order / `has_location_access`) + `service_full` for service_role.
- **kitchen_tickets_insert_loc WITH CHECK** is location/org-scoped (an authenticated caller can only insert a
  ticket for an order it can access).
- **O-frozen order transition** (`transition_order_atomic`) already sets `kitchen_status` (in_kitchen→preparing,
  ready, served→completed, cancelled→cancelled) — O→KDS sync for **order-level** status is handled by O (frozen).
- **Browser-direct KDS mutations are NOT a bypass**: the kitchen page's `supabase.rpc(mark_order_ready /
  prepare_order_items / cancel_order_items / update_order_item_status / mark_order_completed / assign_order_staff
  / mark_item_ready_atomic)` all use the **anon-key** client with **no Supabase Auth session** → live probe
  **6/6 = 42501**. They are **broken no-ops** (functional gap, transferred to K from O), not a security hole.
   The working KDS path is the **server routes** (K-04).
   **STATUS (G7): browser-direct KDS mutations are now WIRED to the guarded server
   route** `/api/kitchen/action` (`requireKdsAction('kitchen.manage')` → service-role
   RPC → stock-safe order-level fns). Raw browser → KDS Supabase RPC = **0** (all
   call sites in `kitchen/page.tsx` + `admin/orders/hooks/useOrders.ts` rewired).
   Proof: see "HARDENING — G-GATES" § G7.

---

## REACHABILITY / caller map (source + DB)

| RPC | src caller | DB caller | live path | anon exec | authed exec |
|---|---|---|---|---|---|
| `item_kitchen_step` (golden) | **none** | none | DEAD | N | N |
| `mark_item_ready_atomic` | `/api/orders/mark-ready` | none | LIVE (service role) | N | **Y** |
| `update_order_item_status` | `kitchen/page.tsx` (browser→anon 42501, dead) | none | browser only (broken) | N | N |
| `void/comp/waste_order_item_atomic` | `/api/kitchen/void-comp-waste` | none | LIVE (service role) | N | **Y** |
| `accept/cancel/recall/reopen_kitchen_ticket_atomic` | cancel→`/api/kitchen/cancel`, recall→`/api/kitchen/recall` (accept/reopen: none) | none | LIVE cancel/recall (service role) | N | **Y** |
| `send_to_kitchen_atomic`, `route_kitchen_order`, `prepare_order_items`, `mark_order_ready/completed/all_served` | browser (anon 42501) / none | none | browser-only (broken) or dead | N | N |
| `get_kitchen_queue`, `get_kitchen_stats`, `emit_kds_ticket_event` | none | none | DEAD | N (queue/stats revoked G5), N (emit) | N (queue/stats revoked G5), N (emit) |
| `record_item_waste`, `return_to_stock`, `toggle_item_hold`, `sync_order_kitchen_status` | `/api/orders/waste`, `return-to-stock`, `item-hold` | (sync=trigger) | LIVE (service role) | N | **Y** |
| `create_delivery_order` | `/api/rpc/create_delivery_order` (server, D-5 scoped) | none | **ALSO anon-executable direct (K-03)** | **Y** | Y |

**Browser KDS mutations = anon = 42501 (not bypass).** **Server KDS routes = service-role = live but unguarded (K-04).** **Direct PostgREST order-creation RPC = anon-reachable (K-03).**

---

## BUSINESS CONTRACT GATE (decisions needed — do NOT invent)

**G1 (K-01/K-02) — anon read-leak of `order_items` + `kds_tickets`.** A mis-scoped RLS policy
(`service_role_full_order_items`, `polroles={0}`/PUBLIC, USING/WITH CHECK true) on a **frozen** table (O) +
a definer read-view with no location filter. This is **outside the K module boundary** (O/F data/RLS).
  - **(a)** fix the policy scope (re-point `service_role_full_order_items` to `service_role` / remove the
    PUBLIC row; add location/org to the `kds_tickets` view or drop it) as an **O/F data-integrity repair**
    (does NOT change frozen *behavior*, only closes the anon exposure), OR
  - **(b)** treat as a formal O/F re-open.
  → Recommend (a) as a scoped security repair; needs your sign-off on which contract it counts under.

**G2 (K-03) — `create_delivery_order` anon-executable, no authz/location.** Close the anon + authenticated
EXECUTE (server route uses service role — unaffected), and make the fn token-first + location-validated
(mirror O `create_takeaway/delivery` D-5). Is `create_delivery_order` an **O** (order-creation) or **K**
(kitchen) fix? It creates an *order* → argue **O scope**. → Confirm scope + fix approach.

**G3 (K-04/K-07) — Live KDS item mutations: adopt the golden `item_kitchen_step` as the single path.**
  - Point `/api/kitchen/cancel`, `/api/kitchen/recall`, `/api/kitchen/void-comp-waste`, `/api/orders/mark-ready`,
    `/api/orders/waste`, `/api/orders/item-hold`, `/api/orders/return-to-stock` at **`item_kitchen_step`
    (token + `authorize(perm, order.location)` + FOR UPDATE + outbox + idempotent)** instead of the unguarded fns;
    drop/deprecate the unguarded item fns after caller sweep.
  - Decide the **permission model**: which permission for each KDS action and who holds it. Currently
    `order.void` is held by **no role** (K-07). Proposed mapping to confirm:
    ready/prepare/recall = `kitchen.manage` (kitchen+superadmin); void/comp/waste = `order.void` **or**
    `pos.void` (need to pick ONE and grant to the intended roles); cancel-ticket = `kitchen.manage`.
  - Manager-override (already in the item registry for comped/wasted/ready-cancel/served-cancel) — confirm
    the approver permission key.
  → Confirm (a) adopt `item_kitchen_step` + (b) the exact role↔permission grants for void/comp/waste.

**G4 (K-05) — idempotency + finalized-order guard.** Adopt the golden path's **idempotent re-entry** and
**order→item lock ordering** (K-3 battery: ready+cancel, prepare+cancel, recall+ready, 2×void, void-on-paid).
Block item void/comp/waste on `paid/cancelled/closed` orders → route to O-frozen refund/void-override. → Confirm.

**G5 (K-06) — `get_kitchen_queue` location scope.** Either (a) add `location_id`/`organization_id` scoping to
the queue/stats fns + revoke `authenticated` (make service-role/token-first), or (b) leave dead but **REVOKE
`authenticated`** so it can't become a cross-location leak. → Confirm (a or b).

**G6 (K-08) — KDS realtime scope.** Scope the realtime push to the operator's location (or switch to the
unused `kds_ticket` outbox spine). Confirm whether to use table CDC (client-scoped) vs the outbox event. → Confirm.

**G7 (K-09/transfer) — Browser-direct KDS mutations.** These are anon→42501 **broken no-ops** (transferred from
O). Decision: (a) K wires them to server routes (part of G3), or (b) leave broken until K-3. Until then they are
**NOT** "working". → Confirm.

**Fix order (once gated):** G1 (RLS anon-close, smallest blast radius) → G2 (create_delivery anon-close + token-first)
→ G3 (routes → `item_kitchen_step` + permission grants) → G4 (idempotency/finalized guard) → G5 (queue scope)
→ G6 (realtime scope) → G7 (browser wiring).

**G5 decision (confirmed): (a)** add `location_id`/`organization_id` scope + REVOKE `authenticated` (service-role/token-first). Old unscoped overloads dropped. → **DONE (migration `20260911000038`)**.

---

## HARDENING — G-GATES (live proof)

### G5 — `get_kitchen_queue` + `get_kitchen_stats` location/org scope + service-role-only (FIXED)
**Contract:** K (station routing) + F (isolation). Migration `20260911000038_k5_kitchen_queue_location_scope.sql`.
**Approach:** re-create both fns with `p_location_id uuid` + `p_organization_id uuid` params and filter
`o.location_id = p_location_id AND o.organization_id = p_organization_id`; `DROP FUNCTION` the old unscoped
overloads; `REVOKE EXECUTE FROM PUBLIC/authenticated/anon`; `GRANT EXECUTE TO service_role`. Kept
`SECURITY DEFINER` + `SET search_path=public`.

**Proof (fresh psql processes — no pooler `SET ROLE` leak; live PostgREST for anon/svc, DB ACL for authed):**
| # | Check | Expected | Result | PASS |
|---|---|---|---|---|
| G5-1 | anon → `get_kitchen_queue` (live PostgREST) | 42501 | HTTP 401 `code=42501` "permission denied for function get_kitchen_queue" | ✅ |
| G5-2 | anon → `get_kitchen_stats` (live PostgREST) | 42501 | HTTP 401 `code=42501` "permission denied for function get_kitchen_stats" | ✅ |
| G5-3 | authenticated ACL (`has_function_privilege`) | false \| false | `false \| false` | ✅ |
| G5-4 | service_role ACL | true \| true | `true \| true` | ✅ |
| G5-5 | service_role → `get_kitchen_queue(@LOCA)` | scoped rows | HTTP 200, 10 rows / 7 distinct orders (all LOCA) | ✅ |
| G5-6 | service_role → `get_kitchen_queue(@LOC_B)` cross-loc | 0 rows | `rows=0` | ✅ |
| G5-7 | service_role → `get_kitchen_stats(@LOC_B)` cross-loc | empty | `rows=0` | ✅ |
| G5-8 | old unscoped overload present | 0 \| 0 | `0 \| 0` (only 1 overload each remain) | ✅ |
| G5-9 | SECDEF + `search_path=public` intact | 2 | `2` | ✅ |
| G5-10 | migration fail-safe (unscoped gone + svc-only) | no exception | applied clean, no raise | ✅ |

**Caller sweep (DB → source → route → hook → cron):**
- DB: other fn bodies referencing = `0 | 0`; views = `0`; `pg_cron.job` = `0`.
- Source (`.ts/.tsx/.sql/.js/.cjs`, excl. `.next`/`node_modules`): **0** callers (only the migration itself).
- → **drop-candidate** retained (read-model likely re-used); a future kitchen-queue route MUST call the scoped
  variant via service role with a server-resolved location (never client-supplied).

**G5 = 🔒 CLOSED.** A/E/S/F/O untouched. No other change in G5.

### G6 — KDS realtime via `kds_ticket` outbox spine: location/station-scoped, dup-safe, resync-able (FIXED)
**Contract:** K (realtime) + F (isolation). Migrations `20260911000039` (scoped event payload) +
`20260911000040` (`kds_ticket_poll` RPC); route `/api/kitchen/realtime`; `kitchen/page.tsx` outbox poll.
**Model:** DB = SSOT; delivery = mutation → `kds_ticket` outbox → **server-side location/station-scoped**
event → KDS client; on events/gap/reconnect the client does a **full DB resync** (`/api/kitchen/orders`).
Client-side filtering is NOT the security boundary.

**Before (evidence):** `trg_kds_ticket_emit` (AFTER INSERT OR UPDATE OF kitchen_status ON order_items)
already populated the `kds_ticket` outbox (130 rows) but the payload carried **no**
`location_id`/`organization_id`/`station` (130/130 = NULL). KDS wake = raw `postgres_changes`
(orders/order_items) table CDC. `outbox_events` in no publication; `outbox_dispatch` NOOP for kds.
Post-G1 the raw CDC push is RLS-scoped for authenticated (`has_location_access`, no anon policy) —
**not** a cross-location leak; G6 establishes the canonical scoped EVENT + scoped delivery endpoint.

**Fix:**
1. `emit_kds_ticket_event` payload += `location_id, organization_id, station, table_number,
   order_source, order_status` (one join to orders). Partial index `idx_outbox_kds_ticket_cursor`.
2. `kds_ticket_poll(uuid,uuid,text,timestamptz,uuid,integer)` — SECURITY DEFINER, **service_role-only**
   (this PostgREST build can't filter jsonb keys over REST → PGRST108). Server-side
   `payload->>'location_id' = p_location_id` scope; composite `(created_at,id)` strictly-after cursor;
   first load returns ONE DB-anchored row (`resync_required=true`, `anchor=now()`); gap
   (`since < oldest available`) → `resync_required=true`.
3. Route `/api/kitchen/realtime`: `requirePermission('kitchen.view')` + `resolveReadLocationScope`
   (server-trusted active location/org) → RPC.
4. `kitchen/page.tsx`: outbox poll (1.5s) = PRIMARY location-scoped spine + security boundary;
   raw `postgres_changes` kept only as secondary, RLS-scoped, **non-security** wake for order toasts.

**Proof (fresh processes, zero-residue):**
| # | Check | Result | PASS |
|---|---|---|---|
| G6-1..6 | event payload carries location_id/station/org; trigger attached | ✓ | ✅ |
| G6-4/5/7/8 | LOC_A event has location_id+station, NO LOC_B bleed | ✓ | ✅ |
| G6-9 | UPDATE kitchen_status re-emits (previous_status=pending) | ✓ | ✅ |
| G6D-1 | unauthenticated `/api/kitchen/realtime` | 401 | ✅ |
| G6D-2..5 | authed first load: 200 + resync_required + DB anchor + location_id=LOCA | ✓ | ✅ |
| G6D-7 | LOCA item change → event DELIVERED to LOCA operator | ✓ | ✅ |
| G6D-8 | LOCB item change → event NOT delivered to LOCA operator | ✓ | ✅ |
| G6D-9 | every delivered event location_id == LOCA | ✓ | ✅ |
| — | residue (event + delivery probes) | 0 | ✅ |

**Event-contract probe: 11/11. Delivery-isolation probe: 10/10.** tsc: 0 errors in G6 files.
Caller sweep: `kds_ticket_poll` → route only; `/api/kitchen/realtime` → KDS client only; DB other-fn = 0.

**G6 = 🔒 CLOSED.** A/E/S/F/O untouched.

### G7 — browser KDS mutations → guarded server route (transport-only; business behavior preserved) (FIXED)
**Contract:** K. Route `/api/kitchen/action`; `kitchen/page.tsx` + `admin/orders/hooks/useOrders.ts`
rewired; migration `20260911000041` (K-boundary `log_audit` arity fix).
**Model (confirmed):** ONLY the transport layer changes:
`kitchen/page.tsx → POST /api/kitchen/action → requireKdsAction('kitchen.manage') →
session identity + location + permission → service-role RPC → existing stock-safe
order-level mutation`. Raw browser → KDS Supabase RPC = **0**. Business behavior
preserved: `mark_order_ready` **still consumes stock**; prepare/ready/complete/assign/undo
all go through the route.

**Before (evidence):** kitchen page + admin orders hook called `supabase.rpc`
(`prepare_order_items`/`mark_order_ready`/`mark_order_completed`/`assign_order_staff`/
`update_order_item_status`) with the **anon-key** client → **42501** (G3 revoked anon+authed
EXECUTE) → broken no-ops. The order-level fns are the only ones with the correct stock
consumption (`consume_stock_for_item` inside `mark_order_ready`), so they were kept (NOT
re-routed to the item-level `item_kitchen_step`, which does not consume stock and rejects
`pending→preparing`).

**Latent K bug found + fixed (migration 041):** `assign_order_staff` + `mark_order_completed`
called `log_audit(...)` with the **old 13-arg** form, but `log_audit` is 9-param
(`action, entity_type, entity_id, actor_id, actor_name, old, new, metadata, ip`) → Postgres
resolves the overload by arg count → **42883 "log_audit(13 args) does not exist"**. Masked
before because the anon browser path 42501'd before executing the body; G7 wiring exposed it.
Only these **2 K-boundary** fns had the 13-arg form (staff/table `log_audit` callers already
use 9-arg — S/F untouched). Re-created with the correct call; business UPDATEs/RETURN unchanged.

**Proof (real sessions, zero-residue, build green):**
| # | Check | Result | PASS |
|---|---|---|---|
| G7-1 | waiter (no kitchen.manage) complete | 403 | ✅ |
| G7-2 | manager (no kitchen.manage) prepare | 403 | ✅ |
| G7-3 | kitchen prepare | 200 + item=preparing | ✅ |
| G7-4 | kitchen ready | 200 + item=ready | ✅ |
| G7-5 | **mark_order_ready consumed stock** (inventory_log + exact −2 delta) | ✓ | ✅ |
| G7-6 | cross-location (kit@LOC_B → LOCA order) | 403 | ✅ |
| G7-7 | **spoofed identity ignored** (assigned_to = session staff, not client-sent) | ✓ | ✅ |
| G7-8 | raw browser anon `supabase.rpc(mark_order_ready)` | **42501** | ✅ |
| G7-9 | kitchen complete | 200 + item=completed + `audit_logs_canonical(order_completed)` | ✅ |
| G7-10 | no order/payment/table regression (not forced to paid, table not cleared) | ✓ | ✅ |
| G7-11 | cleanup | 0 residue | ✅ |

**G7 = 12/12.** Build: `next build` exit 0 (270/270 static + `/api/kitchen/action`,
`/api/kitchen/realtime` compiled). tsc: 0 errors in G7 files. Raw browser → KDS RPC = **0**
(only the service-role `/api/orders/mark-ready` server route remains, which is correct).
A/E/S/F/O untouched. Next: K-3 concurrency battery.

---
*K-0 audit: no code/DB changed during K-0. A/E/S/F/O remain 🔒 FROZEN. `idx_orders_active_table` residual stays an F-boundary note.*
