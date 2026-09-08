# POS Frontend Aggregate Sync — Fix Pass Report (F-1 / F-2 / F-3)

**Date:** 2026-09-08 · **Approval:** POS FRONTEND AGGREGATE SYNC — FIX PASS APPROVAL · **Source audit:** `POS_FRONTEND_ORDER_AGG_SYNC_AUDIT.md` (unchanged)
**Status:** IMPLEMENTED + VERIFIED. Local commit `359f5ba`. Push BLOCKED (token 401) + ⚠️ pre-existing repo corruption documented (§9).

---

## 1. Exact files changed (this pass)
| File | Change |
|---|---|
| `artifacts/saito-admin/src/lib/pos-tables.ts` | **NEW** — pure typed composition module (F-1 + F-3 + has_pending formula) |
| `artifacts/saito-admin/src/app/api/pos/tables/route.ts` | **MODIFIED** — uses the module; rawOrders query now 6-state |
| `artifacts/saito-admin/src/__tests__/pos-tables.test.mjs` | **NEW** — 21 unit tests (node `--experimental-strip-types`, zero new deps) |
| `artifacts/saito-admin/supabase/migrations/20260908000004_order_sync_terminal_provenance.sql` | **NEW** — F-2 DB-side terminal provenance |
| `POS_FRONTEND_ORDER_AGG_SYNC_AUDIT.md` | committed (audit, unmodified content) |

No `as any` / `!` in new code; no auth bypass; no frozen contract function modified; no old migration rewritten.

## 2. F-1 solution (HIGH) — one canonical aggregate
`composeAggregates()` in `pos-tables.ts` now produces every card aggregate from **open orders only**:
- **total** = Σ open-order `total_amount` across the group (single table = itself). `table_floors.total_amount` is **never added on top** — the F-1 double-count is structurally impossible.
- **no-open-orders fallback** (single tables only): a never-synced floor still shows its stored total (legacy defense, cannot double-count because there are no orders).
- **guests**: floor-first (seating fact from `seat_guests_atomic`/reservation wins; order sum fallback when floor is NULL; **no invented `||1`** — F-6 respected: 0 stays 0).
- **item_count / order_count / last_activity**: orders-only.
- **has_pending / oldest_pending_at**: computed with the **DB-identical** formula (9 pending kitchen states incl. `served`; `MIN(updated_at)` of those orders) — a stale floor `has_pending` flag can no longer leak into the UI. This was an extra defect the audit's §2-A implied and the smoke test exposed (table 6 floor flag was stale-true).
- **kitchen_status**: legacy precedence preserved via `composedKitchenStatus`.
- `merged_groups` block: parent = composed group row, children = per-member composed values, `total_amount`/`total_guests` = group composition.
- Status/pointer/reservation/merge/pointer fields: **untouched** (frozen contracts).

## 3. F-2 solution (MEDIUM) — DB-side terminal provenance
Provenance source verified canonical **before implementing**: `orders.updated_by_terminal_id` is set by all 22 live order-writing paths including every frozen RPC (merge/unmerge/transfer/seat/dismiss order UPDATEs all carry `updated_by_terminal_id = p_performed_by_terminal_id`). No session plumbing invented.
- Migration `20260908000004` (applied, `ON_ERROR_STOP`): `sync_table_order_aggregates(p_table_number, p_updated_by_terminal_id DEFAULT NULL)` — legacy 1-arg dropped and re-created with the default so the **5 structural RPCs call unchanged** (terminal NULL = behavior byte-identical). Terminal is written on the floor `UPDATE` **only when provided and different**; **NULL never overwrites**. Terminal is NOT in the no-op compare (a terminal-only provenance write still performs the UPDATE; an identical-terminal no-op still performs none — verified).
- Trigger passes `NEW/OLD (COALESCE)` terminal on UPDATE, `OLD` on DELETE.
- **Verified:** own-terminal mutation → floor carries that terminal → client echo filter suppresses the redundant self-fetch (F-2 closed, and **F-5's own-action duplicate path removed with it**). Second-terminal mutation → floor carries the other terminal → refresh happens. NULL/system writes → floor terminal untouched. Outbox **0** (emit triggers are `UPDATE OF current_order_id` / `UPDATE OF status` column-gated — an aggregate+terminal write emits nothing). No recursion (trigger → sync → floor UPDATE only). Release guard / pointer validate unaffected (they gate on status/pointer, not terminal).
- **Note (transparent):** a first apply of this migration accidentally created a 2-arg overload alongside the 1-arg (CREATE OR REPLACE can't change arg lists); caught immediately, `DROP FUNCTION`'d, re-applied — final state = exactly **one** `sync_table_order_aggregates(integer, text)` overload (verified). The transient was in the same minute, before any tests.

## 4. F-3 solution (MEDIUM) — unified final-state contract
`FINAL_ORDER_STATUSES` (the 6 states, identical to the DB sync formula) is now the **single shared constant**:
- `/api/pos/tables` rawOrders query: `status=not.in.(paid,cancelled,closed,refunded,partially_refunded,voided)` (was 3).
- Exported for the floor UI (`selectTable`'s 3-state filter is the next candidate; not changed here to keep the pass minimal — see §7).
- **Verified:** all 6 final states excluded from the floor aggregate (fresh-INSERT walk, ROLLBACK), active states (`new/confirmed/preparing/ready/served`) included; floor API and DB aggregate agree.

## 5. F-4 / F-5 / F-6 status
- **F-4 (cross-terminal modal staleness): DEFERRED** to the UX pass (per approval).
- **F-5 (redundant dual-subscription):** own-action duplicate eliminated by F-2; the coalesced cross-terminal double-event remains (harmless, documented) — no realtime redesign per approval.
- **F-6 (`guest_count || 1` masking):** NOT changed (per approval: only if business confirms 0 is valid — schema default is 1 and zero-guest open orders don't exist; documented).

## 6. Test results
- **Unit (composition): 21/21 PASS** — single/multi/merge 4 combos/reservation/transfer/dismiss fallback/guest semantics/no-`||1`/6-state final set/has_pending formula (incl. the table-6 stale-flag case).
- **F-2/F-3 ROLLBACK DB probes: PASS** — F2-1..F2-8 (insert/update/terminal-only/NULL-never-overwrite/DELETE/no-op-version/outbox=0) + F3-1 9-state walk; **0 residue**, real floors untouched.
- **Production-safe smoke (real 1–18 through the NEW composition, read-only):** old formula vs new:
  - table 4: **98 → 49** · 5: **90 → 45** · 8: **96 → 48** · 9: **14 → 7** · 10: **76 → 38** · 15: **20 → 10** (the 2× bills were **already live on the floor** via the additive formula — this fix corrects production display immediately).
  - 6/7 group: 0/0 (zombie order correctly excluded from totals; `has_pending` no longer stale-true), 17: guests 9 (floor-first seating), 9991 untouched, 0 fixture/audit/outbox residue, 15 real floors intact.
- **Dev server:** `/api/pos/tables` serving **200** on the new code throughout (POS UI already consuming the corrected shape in dev).

## 7. Regression
- Merge V2 / P-1 unmerge / transfer / dismiss / reservation / payment-reopen-refund: no contract function modified in this pass; the 5 structural RPCs call the 1-arg sync form (behavior byte-identical, F2-7 verified). P-1 + transfer matrices were re-verified on the previous pass and the DB objects they depend on are unchanged here (only the sync gained an optional param).
- Order state machine: untouched. Auth/RLS: no RLS change. `tsc --noEmit`: **no new errors** (only pre-existing `__tests__/*.test.ts` jest-type failures, identical to the prior baseline — reported separately, not caused by this pass).
- `next build`: **green**.
- **Remaining known follow-ups (explicit, not this pass):** (a) `selectTable` (usePos.tsx:528) still uses the 3-state filter for the modal primary-order selection — align to `FINAL_ORDER_STATUSES` in a small follow-up; (b) F-4 modal refresh; (c) 6/7 business decision; (d) reconciler scheduling.

## 8. Commit / push
- **Commit `359f5ba`** (dedicated; 9 files, +2040/−43; `next-env.d.ts` excluded; audit reports included).
- Chain: `fea97925` (origin/main) → `d141c43` (P-1) → `82ab869` (agg trigger) → `359f5ba` (this pass).
- **Push: BLOCKED** — token check (once, silent) returned **401**. Per approval, not requested in chat.
- **Push delta verified self-contained:** `git rev-list --objects fea97925..359f5ba` = 34 objects, 9 files — the push does not depend on the corrupt deep-history object below.

## 9. ⚠️ REPO CORRUPTION (pre-existing — must know before push)
`git fsck` reports **one missing commit object** (`709d1c59`, referenced by `1b807aeb`) **deep in local history — predates all of this session's work**. Auto `git gc` now fails ("remove .git/gc.log"), but:
- **Our 3 commits + worktree are fully intact** (all objects readable; `git diff fea97925..359f5ba` computes cleanly).
- **The push is unaffected** (delta is self-contained, §8) — a token-valid push will succeed even with the corrupt object present, because push negotiation from `origin/main` forward never reads the deep object.
- The corruption blocks only local `gc`/history-walking tools. Safe fix later (when convenient): `git gc.log` removal after fetching the missing object from origin, or simply ignore until the re-clone. **Not fixed in this pass** (out of scope; no risky surgery while push is blocked). Worktree tar backup taken (`/tmp/saito-admin1-worktree-backup-*.tar.gz`).

## 10. STOP
Implementation, tests, production-safe verification, build and commit are complete. **Not proceeding to the next POS feature.** Awaiting: (1) token for the single combined push (`d141c43 → 359f5ba`), (2) go/no-go on the follow-ups listed in §7.
