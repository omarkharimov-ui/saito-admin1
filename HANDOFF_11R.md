# HANDOFF — Round 11r: CASH GATE (Variant A) — EMERGENCY HANDOFF (2026-10-01 ~08:40 UTC)

Owner: kassa açılmadan **NAĞD** ödəniş alınmasın (Variant A — sərt nəzarət). Kart/QR/transfer heç vaxt blok olmasın. Sifariş qəbulu (order create) heç vaxt blok olmasın. One-tap "Kassanı aç" + kassa açılanda auto-retry.

## STATUS: CODE COMPLETE, 1 E2E SCENARIO LEFT

**Commit/push:** this handoff + all 11r code committed + pushed to main WITH this file. tsc clean (source; `src/__tests__` jest-ti errors = pre-existing, unrelated). Production build PASS.

## DONE + VERIFIED

### Server gate (SSOT) — `artifacts/saito-admin/src/app/api/orders/pay/route.ts`
- `hasCashPortion` = full cash OR split cash portion OR per-item cash allocations. If true and NO open drawer session for the operator's location → **403 `CASH_DRAWER_REQUIRED`** (fail-closed).
- Drawer lookup is now **location-scoped** (was org-wide before) AND **actually fixed** — see LATENT BUG #1 below.
- VERIFIED via curl: drawer closed + cash → 403 CASH_DRAWER_REQUIRED; drawer open + cash → paid + `cash_drawer_log` row "Nağd ödəniş +41.00" bound to the session (session binding was previously ALWAYS null — latent bug).

### Client — `artifacts/saito-admin/src/app/admin/pos/page.tsx`
- `shiftMissing` (60s poll, 11q) → pre-check: cash attempt with no drawer → gate modal INSTANTLY (no round trip). Server remains SSOT.
- 403 `CASH_DRAWER_REQUIRED` handling in all 4 POST sites: runPaymentFlow (specific-order branch + dine-in loop) + handleSplitConfirm (per-item + ratio branches).
- Gate modal `cashGateModal` (z-130): "KASSA AÇIQ DEYIL" + one-tap **Kassanı aç** + "Başqa ödəniş üsulu".
- `cashGate` state holds the pending retry closure; `handleDrawerOpened` (from CashDrawerPanel) fires retry when drawer opens; cleanup `useEffect(if (!paymentView) setCashGate(null))`.
- **`skipPrecheck` param** on runPaymentFlow + handleSplitConfirm — ALL auto-retry closures pass `true` (see LATENT BUG #2).
- 11q banner copy updated: "NAĞD ödəniş qəbul edilə bilməz (kart/QR açıqdır). Sifariş qəbulu davam edir."

### CashDrawerPanel — `artifacts/saito-admin/src/app/admin/pos/components/CashDrawerPanel.tsx`
- New prop `onDrawerOpened?: () => void` — fired in `tryOpenDrawer` on success (covers BOTH direct-open and clock-in→auto-retry paths).

### Browser E2E verified (attempts 1–5):
- Amber banner ✓ · card payment NOT gated (drawer closed, table 472 ₼35 paid) ✓ · gate modal ✓ · one-tap open + VARDIYA dialog clock-in ✓ · drawer opens ✓ · banner clears ✓ · **auto-retry fires and reaches the dine-in pay branch** (toast "Aktiv sifariş tapılmadı" = retry executed; attempt 5's table had a STALE floor total with no real DB order — bad test data, NOT a code bug) ✓
- Console: 0 errors in all attempts.

## THE 3 BUGS FOUND & FIXED DURING E2E (all documented in code comments)
1. **LATENT (pre-11r): drawer session binding NEVER worked** — pay route did `const { data: openSession } = await fetch(...)` = destructuring `data` from a PostgREST row `{id}` → always undefined → `p_cash_drawer_session_id` always null. 11r gate exposed it; fixed (await full array, take `rows[0]`, no destructuring).
2. **Stale-closure dead loop (round 2→3):** retry closure ran the old `runPaymentFlow` where `shiftMissing=true` still → pre-check re-fired → gate modal re-opened forever, no POST. Fixed with `skipPrecheck` (server stays SSOT).
3. **Cleanup anchored to wrong state (round 1→2):** `if (!actionSheetOpen) setCashGate(null)` wiped the retry because the PAYMENT VIEW renders with action sheet CLOSED. Re-anchored to `paymentView` (declared line ~229 — effect MUST stay below it; TDZ).

## REMAINING (for next agent) — exactly this:
### 1. Final E2E full loop (1 scenario, ~10 min)
READY-MADE test data: **ORD-2947, table 471, dine_in, confirmed, kitchen pending, ₼10.00, UNPAID** (left by the interrupted attempt 6). Drawer is CLOSED.
- Flow: POS dine-in → table **471** ⋯ → HESABI BAĞLA → NAĞD → Verilən pul **10** → ÖDƏNIŞI TAMAMLA → gate modal → **Kassanı aç** → Kassa panel → KASSA AÇ (balance empty; if VARDIYA dialog → clock-in button) → **panel auto-closes + receipt ₼10 + banner gone** → kassa panel: "Nağd ödəniş +10.00" row.
- Auth token: `368d466a2061f6cbda1809d246ba67f1` (valid until ~11:32 UTC). If expired: mint via SQL (sessions table, user c814879d-5378-4791-8c5f-8ee5aee51994, copy role/active_location_id/organization_id from newest session of that user, expires_at now()+3h) → cookie `saito_token=...`.
- Browser sub-agent notes: screenshots persist only inside workspace → capture then `curl` the CDN URL into `artifacts/saito-admin/e2e-shots/r11r-v6-*.png`; network sampling in reports misses fast calls — trust console toasts + DB state as evidence.

### 2. Journal + memory (5 min)
- `MASTER_FEATURE_MAP.md` §10: add "### Jurnal sətiri — 2026-10-01 (ROUND 11r: ...)" ABOVE the 11n entry (format = look at the 11q/11p entries).
- `POS_COMPETITIVE_COMPARISON.md` §0 table: add a row (format = 11q row).
- MEMORY.md project state: 11p → 11r (repo path `/Users/mr.apple/saito-admin1`, app `artifacts/saito-admin`).

### 3. Test-data cleanup (optional, 2 min)
- ORD-2947 paid by the final E2E (fine to leave) or cancel it.
- Table 14 shows STALE ₼45 ÖDƏNILMƏYİB with NO active DB order (floor aggregate drift — pre-existing, not 11r). Tables 401/502/901 similar stale state. If owner asks: recompute aggregates via `sync_table_order_aggregates` trigger or reset the floor rows.
- Drawer sessions: 1 old `paused` row exists (harmless).

## ENV / STATE
- Dev server: `next dev -p 3000` (PID from lsof), hot-reloads; do NOT restart mid-test.
- DB: Supabase project `jbxmlnsicbfkbsatnoej`, psql `/opt/homebrew/opt/libpq/bin/psql`, pooler DSN is in MEMORY.md / this file's earlier rounds. `.env.local` in app dir = correct project (a stale `.env`-family file with project `kyohjeffglkyiiogtrmb` exists — Next reads `.env.local`, do not "fix" the env).
- Round 11q (previous) is committed: dynamic ETA (`estimate_delivery_eta` RPC), zone data fix, kassa banner, ₼ format.
