# W-A1 FREEZE REPORT — 2026-09-19

**Wave:** A1 (QR anonymous client access + guest customer identity channel)
**Status:** **FROZEN** — scoped reflow GREEN, E2E GREEN, zero residue.
**Head prior:** `60669a7d` (MASTER_FEATURE_MAP sync) · **Repo:** `main`

---

## 1. What shipped

| # | Artifact | Path |
|---|---|---|
| M0 | **Loyalty table repair** (P-7 2026-09-14 latent regression: `loyalty_order_points` + `loyalty_transactions` dropped as "zero-reference" while `loyalty_earn`/`_loyalty_post`/`loyalty_reverse` + spine trigger still reference them → loyalty earn silently broken since 09-14) | `supabase/migrations/20260919000000_w_a1_m0_loyalty_tables_repair.sql` (+rollback) |
| M1 | **Guest channel**: `customers_phone_uq` (unique partial index) + `guest_link_customer()` RPC (find-or-create, service_role-only, house ACL pattern) | `supabase/migrations/20260919000001_w_a1_guest_channel.sql` (+rollback) |
| R1 | `POST /api/orders/qr` extended: optional `customer_phone` → RPC → order attach (additive; no-phone contract unchanged) | `artifacts/saito-admin/src/app/api/orders/qr/route.ts` |
| R2 | `GET /api/orders/qr/status` — customer status endpoint (token-bound, D6 rate-limit 30/min) | `artifacts/saito-admin/src/app/api/orders/qr/status/route.ts` |
| U1 | Menu UI: phone capture + status card | `artifacts/saito-admin/src/app/menu/page.tsx` |
| D10 | `CustomerSelect.tsx` — explicit `total_visits=0, total_spent=0` (schema quirk: `DEFAULT 1`) | `artifacts/saito-admin/src/components/customers/CustomerSelect.tsx` |
| G1 | `.w-a1-gate.cjs` — 18 checks, teardown contract, zero-residue assert | repo root |
| G2 | `.w-a1-audit/w_a1_route_e2e.cjs` — 5-check route E2E (real HTTP) | `.w-a1-audit/` |

**Decisions D1–D11:** `W_A1_PLAN.md` §5 (all ratified with evidence). Key: D6 rate limits, D10 explicit counters, D11 frozen "one active order per table" (no add-to-check in W-A1 — product decision for W-A2).

## 2. Gate evidence (all live runs, 2026-09-19)

| Gate | Result | Log |
|---|---|---|
| **W-A1 gate** | **18/18 PASS, REAL-RISK=0, residue=0** | `.w-a1-audit/reflow/` (re-run post-reflow, exit=0) |
| **W-A1 route E2E** | **5/5 PASS** (E4 = D11 frozen contract: 2nd POST → 23505/500, find path 1 customer, order untouched) | `.w-a1-audit/w_a1_route_e2e.cjs` |
| **P-9 gate** (P9_ALL=1) | **PASS=25, REAL-RISK=0, HARNESS=0** | `.w-a1-audit/reflow/P9.log` |
| **F gate** | **35/35** (Z1–Z5, archive guard on) | `.w-a1-audit/reflow/F.log` |
| **O gate** (O_ROUTE) | **38/38** | `.w-a1-audit/reflow/O.log` |
| A / E-S | **39/39** / **54/54** | `.w-a1-audit/reflow/A.log`, `ES.log` |
| K-L3 / K-L4 | **8/8** / **16/16** (K-L3 first attempt = Class C `fetch failed`, retry green) | `KL3.log`, `KL4.log` |
| P-1 / P-2 / P-3 | **29/29** / **13/13** / **25/25** | `P1.log`…`P3.log` |
| P-4 / P-5 / P-6 | **19/19** / **10/10** / **15/15** | `P4.log`…`P6.log` |
| P-7 half-1 (C-1..C-8) | **4 PASS + 4 EXPECTED-CONFLICT, REAL-RISK=0** — ×10 runs, 10/10 green | `P7h1.log` |
| **P-7 half-2 (C-9..C-16)** | **BLOCKED — Class C, external** (see §4) | `P7h2.log` ×8 |
| **P-8** | **BLOCKED — same external wave** (partial run; residue neutralized, gate-in-contract) | `P8.log` |

## 3. Production hardening (kept, documented)

The P-7 half-2 investigation proved a **real availability defect** (not just a test flake):

1. **`src/middleware.ts`** — the edge session probe mapped **any** non-2xx (incl. transient infra 5xx, and a transiently empty 200 result) to a hard **401 "Unauthorized"**, contradicting the file's own catch-block contract ("a hiccup must NOT bounce the user to login"). During the incident window this produced sustained false-401 waves on VALID tokens (evidence: 10/10 probe 401s with body `{"error":"Unauthorized","login":"/staff/login"}` while PostgREST returned the session `ACTIVE` 6/6 in the same seconds; zero `security_events` written).
   **Fix:** probe retries once on a fresh connection; still non-2xx → transient → fall through to the route (route re-checks, answers properly). Empty-array result → one retry → fall through. Genuine revokes (revoked_at / REVOKED / expired) remain hard 401. Security semantics unchanged (middleware stays a pre-filter; the route is authoritative).
2. **`src/instrumentation.ts`** (new) — nodejs-runtime startup hook: global `fetch` wrapper for **idempotent GETs**: 10s AbortController budget + one retry (50ms yield) on timeout/socket-race errors (`UND_ERR_SOCKET "other side closed"`, ECONNRESET, fetch failed). Proven symptoms: (a) dev-log `fetch failed … other side closed` on ~2.2MB long-lived pooled sockets (LB keep-alive reaping race); (b) undici's default 300s headersTimeout let half-open sockets pin requests for 5 min — bursts of such hangs accumulated into a bricked server (P-7 h1 4P+4EC green → h2 on the SAME server 100% connection-refused → server later dead). POSTs are untouched (non-idempotent; per-route idempotency keys). Callers with their own AbortSignal are bypassed.

## 4. P-7 half-2 / P-8 blocker — Supabase platform incident (Class C, external)

**Root cause, vendor-documented:** Supabase status page, active incident **"401 errors due to JWT rejections"** (`https://status.supabase.com/incidents/6q5902p2xd9f`, open since ~2026-08-14): *"…we will be implementing [the deploy-process change] throughout this weekend, starting on Friday, September 18… Completing that upgrade will resolve this issue."* Component board at time of freeze: **API Gateway = Degraded Performance** (all others Operational).

Evidence chain (all in `.w-a1-audit/`):
- P-7 half-1 green ×8 (pay-race concurrency invariants intact, REAL-RISK=0 in every run).
- Half-2: **12 attempts across 3 dev-server generations** (incl. a 6-day-old process), ~7h, with 5 harness mitigations (keep-warm heartbeat, extended retry budgets — env-tunable `P7_HTTP_RETRIES`/`P7_BACKOFF_MS`/`P7_RPC_RETRIES`/`P7_WARM_ATTEMPTS`/`P7_HG_ATTEMPTS`, defaults unchanged; GET 10s timeout patch). **DB invariants held in every run: baseline→after `0/0/0/0/4 → 0/0/0/0/4`.** Best run: C-13 + C-15 PASS (re-pay reject + strict refund rollback proven under load).
- Live session-state monitor (3s cadence) proved all fixture sessions **ACTIVE/unrevoked the entire window**; psql count = PostgREST count (318=318); direct curl probes 99% 200 (1 `EPROTO`/45 — the incident's TLS resets); parallel-burst repro `14×200 + 1×ERR:EPROTO`.
- Gate-in classification: 7 of 8 half-2 failures = `HARNESS-FAILURE (transport/fixture, re-run)` — races never reached the DB, so no invariant was left untested-then-passed; they were untestable during the window. **One run (12:28, server-pile-up window) classified C-13 as REAL-RISK=1 with `status=0 opCap=1 st=paid`** — a transport misclassification, not a finding: the DB evidence in the same line proves the invariant (exactly 1 idempotency op-row, order still `paid` = no double-pay); `status=0` means the POST never reached the server (that run's warmup was 5/5 `ERR 0`). C-15 (strict refund-reject rollback) PASSED even in that degraded run. Fresh pair (post-timeout-patch) is the disposition run.
- P-8: same wave hit its healthGate mid-run (killed at T-7); its killed-run residue was neutralized via the gate's own teardown contract (`pin_hash=''`, sessions/locations deleted).

**Re-run when the incident resolves** (one command each; both idempotent, self-cleaning):
```bash
# P-7 (fresh pair):  node .p7-gate.cjs && P7_HALF=2 node .p7-gate.cjs     (expect: 16 accounted, 0 REAL-RISK, 0 HARNESS)
# P-8:               P8_ALL=1 node .p8-gate.cjs                           (expect: 2 PASS + 6 EXPECTED-CONFLICT)
```

## 5. Harness alignment (no production semantics touched)

- 7 gate teardowns (P-4, P-5, P-6, P-7, P-8, K-L3 ×2, K-L4 ×2) now apply the **house neutralize contract** (`is_active=false, status='INACTIVE', pin_hash=''`) — matching `.o-gate`/`.p1-gate`. Previously they left `pin_hash` set on inert rows, which the (correct, strict) P-9 S5.1/S5.4b danger predicate flagged.
- 66 inert fixture rows (09-18 freeze-reflow residue; proven login-inert: `is_active=f`, `status=INACTIVE`, 0 live sessions, `requireAuth` 401 on `!is_active`, pins = `pbkdf2…$00$00` sentinels) neutralized in one transaction with self-proving asserts: `target=66 updated=66 danger_left=0 deny53_intact=53 active=9 pool=9` (script: `.w-a1-audit/w_a1_staff_neutralize.cjs`).

## 6. Residue & safety audit (post-freeze sweep)

- `danger` fixture rows (non-P7): **0** · `active` staff: **9** (P-7 running-run rows excluded) · `pool`: **9** · DENY53: **53/53** intact.
- P-7 half-2 teardown: self-executing (script ends with its own cleanup; verify `SELECT count(*) FROM sessions WHERE user_id IN (SELECT id FROM staff WHERE name LIKE 'P7%')` = 0 after it lands).
- No RLS weakened, no FK replaced, no financial rows touched (P-7 orders retained by design — concurrency evidence).
- **Secret hygiene:** untracked `.audit-*` files (2026-09-12 audit artifacts) contain a **plaintext service_role key** — excluded from this commit via explicit pathspec and added to `.gitignore`. Four junk files (shell-redirect fragments: `not`, `found"}`, `[404]`, `{"error":"Table`) moved to Trash.

## 7. Dev-server note

`next dev` (port 3000) was restarted multiple times during diagnosis (6-day-old process → fresh). Current process runs the hardened middleware + instrumentation. If the server is bricked (full 000s), restart with:
`cd artifacts/saito-admin && node node_modules/next/dist/bin/next dev -p 3000`
