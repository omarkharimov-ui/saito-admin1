# P-1 AUTHORIZATION CONTRACT — FREEZE (LIVE FUNCTION-LEVEL PROOF)

**Date:** 2026-09-12 · **Method:** `pg_get_functiondef()` via `supabase db query --linked` against the LIVE DB (`jbxmlnsicbfkbsatnoej`), + live `pg_policy`/`pg_proc`/`pg_class` reads. **Evidence-only — nothing modified.**
**Question settled:** does the runtime permission gate enforce LOCATION scope? → **NO.** This converts the last open P-1 technical unknown into a **latent security finding** (not "one clean contract"), per the ratified decision rule.

---

## 1. THE RUNTIME GATE — `has_permission()` (all 3 overloads, live bodies)

| oid | signature | body (abridged, faithful) | location/scope logic? |
|---|---|---|---|
| **31080** | `has_permission(p_staff_id uuid, p_permission text) → boolean` | `EXISTS(staff s JOIN roles r JOIN role_permissions rp WHERE s.id=p_staff_id AND s.is_active AND s.role_id IS NOT NULL AND rp.permission_key=p_permission)` | **NONE** |
| 35984 | `has_permission(p_token text, p_permission text) → boolean` | `authorize(p_token, p_permission)->>'allowed'` | **only if `authorize` gets a location** (see §2) |
| 35813 | `has_permission(p_permission_key text) → boolean` (STABLE) | `EXISTS(staff st JOIN role_permissions rp WHERE st.id=current_staff_id() AND rp.permission_key=p_permission_key)` | **NONE** (GUC `app.current_staff_id`) |

**The app's `requirePermission()` calls overload 31080 with `p_staff_id = session.user_id` and `p_permission = <key>` at 13 call-sites.** It is a pure **role × is_active** check. The `permissions.scope` column (44/65 = LOCATION) is **never consulted**. GLOBAL / ORGANIZATION / SELF / LOCATION all collapse to the same EXISTS.

## 2. THE TOKEN-FIRST PATH — `authorize()` (the one place location IS enforced)

```sql
authorize(p_token text, p_permission text, p_location_id uuid DEFAULT NULL) → jsonb
  1. session valid (token, expires_at>now, status='ACTIVE')
  2. staff.status='ACTIVE'
  3. staff.organization_id == session.organization_id        (org match)
  4. IF p_location_id IS NOT NULL:                            (LOCATION — conditional!)
        staff_locations(staff_id, p_location_id, active=true)
        ELSE return {allowed:false, reason:'location_denied'}
  5. role_permissions(staff.role_id, p_permission)
  6. return {allowed:true, staff_id, role_id, organization_id, location_id}
```

Key facts:
- **`p_location_id` defaults to NULL → the location check is SKIPPED when the caller omits it.** Location is enforced **only when the token-RPC explicitly passes a location** (the F-02 KDS pattern: "p_token = session identity; the RPC enforces permission + location").
- **The payment path never calls `authorize()` at all.** `/api/orders/pay` → `has_permission()` (overload 31080) + `complete_payment_atomic_v2`. So the only function that *can* enforce location is **not on the payment path**.

## 3. THE PAYMENT WRITE — `complete_payment_atomic_v2` (live body, decisive)

- **No `p_location_id` parameter** (13 args: order_id, payments, method, cash/card/tip, discount, performed_by, terminal, drawer_session, cash_received, idempotency_key).
- **Owner = `postgres` (superuser), `SECURITY DEFINER`** → **bypasses RLS entirely** (superusers are exempt). So the `order_payments_insert_loc` RLS `WITH CHECK` (§4) **never evaluates** on this path.
- Writes against **whichever `p_order_id` is passed** — the route supplies the **client's** `order_id` with **no check that `orders.location_id` ∈ the session's/staff's locations**, and **no `resolveWriteLocationContext`** call (that helper is used by KDS/takeaway routes, *not* pay).
- What it DOES enforce (financial integrity — all correct): `validate_actor(p_performed_by)` = staff active; `FOR UPDATE` order lock; idempotency dedupe (D-6); refund ≤ net-paid; already-paid guard; overpay guard; `validate_payment_order_balance` trigger (2nd overpay layer); audit via `log_audit`.

**Actor is not forgeable:** the route sets `p_performed_by: auth.user?.id` (real session staff id from `validateAuth`), never a client value. So **RBAC + actor-identity are sound; the only unbound dimension is LOCATION.**

## 4. RLS LAYER (exists, but not on the write path)

Live `pg_policy` (role = `authenticated`; tables owned by `postgres`):

| table | rls_enabled | insert/select policy |
|---|---|---|
| `order_payments` | true | `order_payments_insert_loc` / `_select_loc` = `is_superadmin() OR EXISTS(orders o: o.id=op.order_id AND has_org_access(o.organization_id) AND has_location_access(o.location_id))` |
| `orders` | true | `orders_insert_loc` / `_select_loc` / `_update_loc` (same pattern) + `orders_service_full` (service) |
| `cash_drawer_sessions` | true | `cash_drawer_select_loc` = `is_superadmin() OR (has_org_access AND has_location_access)` |
| `payments` | true | `payments_insert/select/update_auth` (same pattern) |
| `payment_idempotency_keys` | **false** | — (no RLS; relies on caller) |

Scope helpers (live bodies) — **all read session GUCs the app never sets**:
- `has_location_access(loc)` = `is_superadmin() OR loc = ANY(current_staff_locations())`
- `current_staff_locations()` = `staff_locations WHERE staff_id = current_staff_id()`
- `current_staff_id()` = `current_setting('app.current_staff_id')`
- `is_superadmin()` = `current_user_role() IN ('superadmin','owner')` = `current_setting('app.current_role')`
- `has_org_access(org)` = `is_superadmin() OR org = current_org_id()` = `current_setting('app.current_org_id')`

The app sets **none** of `app.current_staff_id` / `app.current_role` / `app.current_org_id` (grep: zero `SET`/header). It calls everything through a **service_role** client → RPCs run as `postgres` (superuser) → **RLS bypassed**; direct `authenticated` RLS would be moot anyway without the GUCs.

**Net:** the location RLS is real but **inert on the actual write path** (superuser RPC + unset GUCs). It would only bite a direct `authenticated` client write with the GUCs set — which the app never does.

## 5. LIVE GROUNDING (is it exploitable *today*?)

- `orders`: **707 rows, ALL `location_id = Main Location (f1f830b3…)`, 0 in any other location.**
- `organizations`: **1** (Saito Default). `sessions`: 319 rows, **1 distinct org**, **1 distinct active_location_id**.
- `staff_locations`: **7 active rows / 7 staff**.
- → **Single-org, single-location deployment.** There is **no second location with data to cross into.**

**Therefore the location-scope gap is LATENT (not currently exploitable), exactly matching the handover's F-03 single-location framing — but it is a genuine deviation from the ratified D-5 contract on the financial write path.**

## 6. VERDICT (answers the ratified decision rule)

> "if `has_permission()` enforces location scope → write one contract; if not → it's already a P-1 security fix."

**It does not.** → **P1-F12 (NEW, security-class): the payment write path enforces NO location scope.** 
- RBAC (who may pay) ✅ enforced (role×active, real session actor).
- CSRF ✅, rate-limit ✅, idempotency ✅, overpay/already-paid/refund-cap ✅, actor-active ✅.
- **Location scope ❌ NOT enforced** (gate has none; write is superuser RPC bypassing the location RLS; scope GUCs unset). Latent **only** because prod is single-location.
- Blast radius if a 2nd location with data appears: a `cashier`/`manager` at location A could supply a location-B `order_id` and record payment against location B's order (and its table→dirty side-effect) with no location check anywhere. **Financial cross-location authorization gap.**

**This must be resolved (fix OR ratified-defer) in the P migration batch — it cannot be silently "frozen as fine."**

## 7. FROZEN P-1 AUTHORIZATION CONTRACT (what is actually true, to be re-verified by a P probe)

**ENFORCED (do not regress):**
1. **Identity:** session valid (token, expiry, `status=ACTIVE`, not revoked) via `validateAuth`; actor = real `session.user_id`.
2. **RBAC:** `has_permission(staff_id, perm)` = role×`is_active`; 65-key catalog; gate on `payments.create` (pay), `payments.refund` (refund), `staff.manage` (approvals).
3. **CSRF:** double-submit (`x-csrf-token` == `saito_csrf` cookie) on pay/refund/void.
4. **Rate-limit:** `paymentRateLimit` on pay.
5. **Idempotency:** `payment_idempotency_keys` D-6 dedupe (same key → prior result, no double-charge).
6. **Amount integrity:** overpay guard + `validate_payment_order_balance` trigger; already-paid guard; refund ≤ net-paid.
7. **Actor-active:** `validate_actor` (staff `is_active`).

**NOT ENFORCED (open items → migration batch):**
- **A. LOCATION scope on the payment write path (P1-F12, security-class, latent).**
- **B. Broken/dead permission RPC zoo** (P1-F5/F7): `has_permission_v2`/`get_effective_permissions_v2`/`check_permission` → `42703 ep.code`; `get_effective_permissions` 200-but-wrong (NULL codes); all 0 consumers. **`has_permission` = declared SSOT.**
- **C. Owner role catalog gap** (P1-F10): owner lacks `payments.*`/`cash.*`/approve — **0 owner staff → latent**; seed as hardening.
- **D. Override layer dead** (P1-F1/F2/F9): `staff_permission_overrides` & `location_permission_overrides` = 0 rows, no expiry/scope columns, `has_permission` ignores them, writer route has a broken DELETE filter (`role_id` not a column).
- **E. Authz bypass routes** (P1-F11, security-class): `/api/orders/void` + legacy `/api/orders/complete-payment` + `/api/order-payments` = `requireAuth()`-only (no `payments.*`/`pos.void` gate).

## 8. RATIFIED MIGRATION BATCH (single clean pass, after this freeze)

Per your ratification table + the new P1-F12:

| # | Action | Type |
|---|---|---|
| M1 | **Declare `has_permission(p_staff_id,p_permission)` the permission SSOT** (document; no code change) | contract |
| M2 | **Close P1-F12 location scope on the payment path** — add a location guard so a payment can only bind to an order whose location the actor/session is scoped to (either: (a) `requirePermission`→token `authorize()` with location, or (b) a `p_location_id`/location-assertion in `complete_payment_atomic_v2` + route resolves `orders.location_id` from the session via `resolveWriteLocationContext`). **DECISION NEEDED (see §9).** | **security fix** |
| M3 | **Retire dead/broken RPCs:** `has_permission_v2`, `get_effective_permissions`, `get_effective_permissions_v2`, `check_permission` (0 consumers). Keep `get_staff_permissions` (admin-detail raw catalog, 1 consumer). | cleanup |
| M4 | **Gate the bypass routes:** `/api/orders/void` → RBAC (`pos.void`/`void.approve` already has approver-override inside); legacy `/api/orders/complete-payment` + `/api/order-payments` → `payments.create` **or retire if UI-unreachable** (UI caller sweep pending). | security fix |
| M5 | **Owner role seed:** add owner `role_permissions` (payments.create/refund/void + cash.* + refund.approve/void.approve) as latent hardening. | hardening |
| M6 | **Overrides:** retire `staff_permission_overrides` + `location_permission_overrides` tables + `/api/permissions/overrides` route (dead, unscopeable, unused, broken writer). **DECISION NEEDED (§9 — you leaned retire).** | cleanup |
| M7 | P-1 close-out probe suite (`P_%`, zero-residue) asserting the frozen contract §7, re-run A/E/S/F/O/K gates. | verification |

**Out of scope (deferred, per your instruction):** 20/25 paid-without-record reconciliation → P-5/P-9; 16 stuck `pending` + 4 open `cash_drawer_sessions` → P-8/P-11; legacy `payments`/`cash_drawer_log` table disposition → P-9.

## 9. TWO DECISIONS NEEDED FROM YOU (block M2/M6)

1. **M2 — Location scope:** fix now in the batch (recommended — it's the financial write path and D-5 is ratified) vs ratify-defer as a documented single-location residual (F-03 style). If fix: preferred mechanism — **(a)** switch the pay route to token-`authorize()` with resolved location, or **(b)** keep `has_permission` + add a location assertion inside `complete_payment_atomic_v2` (route passes session-derived location, RPC checks `orders.location_id` ∈ actor's `staff_locations`). I recommend **(b)**: minimal blast radius, keeps the gate shape, and matches "DB enforces" ground rule.
2. **M6 — Overrides:** confirm **retire** (your lean) vs wire-in (would need `is_allowed` deny-wins + expiry/scope columns + `has_permission` change). 

## 10. EVIDENCE REPRODUCERS

- `supabase db query --linked --project-ref jbxmlnsicbfkbsatnoej "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('has_permission','authorize','complete_payment_atomic_v2','validate_actor','has_location_access','has_org_access','is_superadmin','current_staff_id','current_org_id') ..."`
- `SELECT ... FROM pg_policy pol JOIN pg_class c ... WHERE c.relname IN ('order_payments','orders','payments','cash_drawer_sessions')`
- `SELECT o.location_id, count(*) FROM orders GROUP BY 1` → 707 × Main Location
- App: `artifacts/saito-admin/src/lib/api-auth.ts` (`requirePermission`→`has_permission`), `app/api/orders/pay/route.ts` (service_role client + client order_id + `p_performed_by: auth.user?.id`), `lib/location-context.ts` (`resolveWriteLocationContext`, used by KDS/takeaway, **not** pay).
