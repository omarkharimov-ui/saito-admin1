# O — ORDERS — 🔒 FROZEN (2026-09-11)

> **O = FROZEN.** All gates G1–G7 contract-compliant, 0 Critical, 0 High.
> This is the dependency-impact closure of the frozen A / E / S / F changes on Orders.
> Every claim below is backed by a live-DB (`jbxmlnsicbfkbsatnoej`) / source / harness probe.
> **A / E / S / F remain 🔒 untouched** (G6 = NO-OP: F was not re-opened).

## Gate results (all PASS)

| Gate | Contract | Status | Evidence |
|---|---|---|---|
| **G1** | Live transition path → `transition_order_atomic` (token identity, `current_staff_id()` only); old `transition_order_status` dropped after caller sweep + unreachable proof | ✅ | `transition_order_status` overloads = **0** (R1); `useOrderStateMachine` → route → atomic; spoofed `p_performed_by`/`p_employee_name` → **400** (I1/I2); identity from session (P7) |
| **G2** | REVOKE `authenticated` EXECUTE on all order-mutation RPCs; server = service_role only; raw PostgREST RPC bypass impossible | ✅ | 57 fns revoked (mig 027) + 3 new fns (mig 030); **any order-mutation fn still anon-executable = 0** (final DB probe); live staff-credential 42501 (17/17) |
| **G3** | QR order creation fixed in O — server-trusted location/org, intended access (public customer + rate limit, NOT staff-perm-gated) | ✅ | QR insert passes `trg_order_table_location` (was 100% dead); location/org from table row; `order_type` forced `qr_order`; `/api/orders/qr` public; live proof QR1 |
| **G4** | All create/append scoped to session active_location; `table_number` resolves within active location only; client can't redirect | ✅ | `orders/route.ts` + `walkin_atomic` + takeaway/delivery (D-5) all server-scoped; cross-loc create = **400** (X1); dup table-number 0 cross-loc (X2/P3); live P1–P6 |
| **G5** | Cancel → permissioned atomic RPC (`orders.cancel`) + row lock; raw service-role cancel PATCH removed; TOCTOU closed | ✅ | raw cancel PATCH removed (R7, source); waiter route cancel = **403** (C0); admin = success (C1); create-rollback compensating cancel token-first |
| **G6** | F stays FROZEN — O does NOT add a `table_floors` state-machine trigger / change F contract | ✅ NO-OP | No table state-machine trigger added; O writers protected by existing F-04 guards only |
| **G7** | `/orders` + `/kitchen/orders` GET → active-location scope + read permission; no cross-location leakage | ✅ | `orders.view` / `kitchen.view` enforced; `resolveReadLocationScope` (active → single-loc-with-data → fail-closed); leakage proof: LOC_A read = **0 LOC_B rows** (G1r/G2r) |

## Freeze criteria (user-mandated) — ALL MET

- **0 Critical / 0 High** — O-01..O-08 all resolved (see audit doc §FINDINGS).
- **G1–G7 all contract-compliant** — table above.
- **`transition_order_status` = 0** (DB overloads) — R1 ✅
- **dead create RPCs = 0** (`create_or_append_order`, `create_order_with_items`) — R2 ✅
- **old raw mutation routes = 0** — no browser-direct staff-token mutation path; server = service_role only.
- **raw service-role cancel PATCH = 0** — action=delete → atomic; create-rollback → atomic token-first (R7 + source) ✅
- **client-spoof `performed_by` = 0 reachable** — rejected 400 (I1/I2); delivery route token-first ✅
- **unauthorised mutation RPC = 0** — anon-executable order-mutation fns = 0 (final DB probe) ✅
- **old caller-identity path = 0** — token-only identity (`current_staff_id()`) ✅
- **raw-RPC bypass = 0** — G2 ✅
- **cross-location mutation/read leakage = 0** — X1/X2/P8 + G1r/G2r ✅
- **cancel/pay race safe** — CC1 (exactly 1 winner, final ∈ {cancelled,paid}), CC2 (no phantom cash on lost pay) ✅
- **create concurrency safe + pointer verified** — CA1 (no 500, final active=1, pointer set), CA2 (no cross-loc), CA3 (append stable); pointer independently live-verified ✅
- **QR live DB proof** — QR1 ✅
- **G7 read isolation proof** — G1r/G2r (0 LOC_B rows) + G3r (401 no-session) ✅
- **A = 39/39** — `.a-regression.cjs` ✅ (A08 transient = my orphaned probe fixture, cleaned)
- **E/S = 54/54** — `.es-gate.cjs` ✅
- **O full suite** — `.o-gate.cjs` **38/38 PASS** ✅
- **final source + DB re-audit** — reachability sweep + frozen-DB probes (above) ✅
- **tree clean** — `git status` = 0 dirty (after committing evidence + migrations) ✅
- **migrations/evidence persisted** — migs 027–031 in `supabase/migrations/`; `.o-gate.cjs` committed; this doc committed ✅

## Reachability = 0 (final source + DB sweep)

| Path | Result |
|---|---|
| `transition_order_status` (old, unguarded) | **0** overloads in DB; 0 source rpc callers (route URL retained, now forwards to atomic) |
| `create_or_append_order` / `create_order_with_items` | **0** (dropped, 0 callers) |
| raw service-role cancel PATCH (user-facing) | **0** (action=delete → `transition_order_atomic`) |
| caller-supplied `performed_by`/`employee_name` | **0 reachable** (route rejects 400) |
| direct PostgREST RPC on order-mutation fns (anon/staff credential) | **0** (EXECUTE revoked from anon + authenticated; service_role only) |

## Known residual / deferred architectural boundary (NOT an O-introduced bug)

> **`idx_orders_active_table`** = `UNIQUE (table_number) WHERE status not in (paid/cancelled/closed) AND not split AND merged_into IS NULL` — **global, not location-scoped**.
> It imposes a **cross-location DB constraint**: two locations cannot simultaneously hold an active order on the same table number. This is a **latent multi-location limitation, not introduced by O, and remains outside the frozen F contract** (G6 = F stays frozen; O does not recreate/alter the index). In the current single-location deployment it is unobservable; it becomes relevant only when a second location is actively transacting on a colliding table number.
>
> Related (same class, F-boundary): the F-05 number-based triggers (`trg_order_table_location`, `trg_orders_sync_table_floors`) key on `table_number` alone and are ambiguous for duplicate numbers across locations. Both are deferred to a future multi-location F revision, documented here so the O freeze is not hiding them.

## Transferred to K (per user scope decision, 2026-09-11)

> **Transferred to K:** browser-direct KDS/admin order-item mutations are blocked at DB ACL (`42501`) but require server API route adoption; no O freeze blocker if no O-core caller depends on them.
>
> Affected browser-direct RPCs (anon credential → already 42501 before O; functional no-op, **not a bypass**): `mark_order_ready`, `prepare_order_items`, `cancel_order_items`, add/qty and other item/KDS mutation RPCs (`kitchen/page.tsx`, `OrderModal`, `useOrders`, `ManualOrderModal`). Their `authenticated` EXECUTE was revoked in G2 (hardening). **Until K adopts server API routes for these, their UI functions must NOT be represented as "working".**

## G6 — F boundary (documented, not re-opened)

`useTableStateMachine` / `transition_table_status` (auth-less table transition fn) is a **F-scope** dependency, **not fixed in O** per the frozen G6 decision. Recorded here as an O dependency/re-audit note only. O writers that set `table_floors.status` rely on the existing F-04 guards (`table_release_guard`, `table_archive_guard`), not a new table state-machine trigger.

## Commits (8.2 → 8.11)

- `27e06ab` 8.2 G2 — REVOKE authenticated EXECUTE on 57 order-mutation RPCs
- `9471d3e` 8.3 G1+G2 DB — atomic SUPERSET; token-first delivery/cancel_loss_table; drop old transition_order_status; ACL closure (migs 027–030)
- `dc95374` 8.4 G1 code — route→atomic (400 on spoof), delivery token-first, hook drops identity
- `b84db98` 8.5 G5+G1 code — cancel→atomic (403), delivery route token-first
- `42326f7` 8.6 G4 step1 — mig 031 walkin_atomic location-scoped, dead creates dropped
- `a26947d` 8.7 G4 step2 — orders/route.ts + walk-in location scope
- `85cb5e0` 8.8 G3 — QR server-trusted location + public customer path
- `d108c13` 8.9 G7 — read scope + resolveReadLocationScope
- `d032652` 8.10 — error→HTTP status mapping + `.o-gate.cjs` (38/38)
- `6d63f7f` 8.11 — create-rollback token-first + mig 030 file aligned to live DB

## Verification harness

`node .o-gate.cjs` — 38 checks, idempotent (start cleanup + fixtures 301–313, end cleanup, residue=0):
R (reachability=0) · P (permission+location+identity) · I (spoof reject) · C (route cancel) ·
CC (cancel-vs-pay / cancel-vs-transition races) · CA (create concurrency + pointer) · X (cross-location create) ·
G-read (isolation) · QR (live proof) · Z (residue=0, guard re-enabled).

**Final: O GATE 38/38 · A 39/39 · E/S 54/54 → O = 🔒 FROZEN.**
