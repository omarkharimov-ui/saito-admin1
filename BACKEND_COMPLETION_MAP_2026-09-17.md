# SAITO BACKEND COMPLETION MAP — post-P-8 audit (2026-09-17, READ-ONLY)

> Status: `P-1 → P-8 = FROZEN 🔒 | P-9 = WAIT ⛔`. This document changes nothing; it is the
> pre-P-9 decision surface. Evidence basis (all read-only, 2026-09-17 22:00–22:30 Baku):
> - API surface: **180 route files** under `artifacts/saito-admin/src/app/api/` (line counts per domain below)
> - DB: **122 public tables** (row counts sampled from `pg_class.reltuples`)
> - RLS: 15 tables with RLS OFF (list in §4)
> - Docs: `MASTER_FEATURE_MAP.md` (2026-09-11 A→Z), `BACKEND_ROADMAP.md` (pre-P-1), HANDOVER §5/§6,
>   P-1..P-8 freeze blocks + gate reports (all GREEN, `.p8-audit/reflow/summary*.txt`)
> - No `TODO/FIXME/stub` markers exist in any route file (grep-verified)

---

## 1. FROZEN CORE — gated, regression-protected, DO NOT TOUCH

| Contract | Gate (final reflow) | Covers |
|---|---|---|
| A — auth/staff/RBAC/lockout | 39/39 | PIN login, sessions, rate-limit, overrides, self-approve guard |
| E/S — staff economy | 54/54 | staff writes, cash-rpc drift |
| F — finance | 35/35 | close-day, Z-report, finance reports |
| O — order state machine + tables | 38/38 | DRAFT→CLOSED, merge/unmerge/transfer/split V2 |
| K — KDS L3/L4 | 8/8 + 16/16 | kitchen tickets, item lifecycle |
| P-1 — permission inventory | 29/29 | role/permission matrix |
| P-2 — state contract | 13/13 | state guards, RLS baseline (known holes → §4) |
| P-3 — amount/ledger immutability | 25/25 | order_payments immutability, GUC reopen |
| P-4 — idempotency | 19/19 | P-4 pattern (drawer idempotency now follows it) |
| P-5 — atomic payment chain | 10/10 | triggers, total SSOT, VAT |
| P-6 — refund/void/reopen | 15/15 | double-stock guard, loyalty reverse |
| P-7 — writer-surface concurrency | 16/16 | A-class writers, outbox, deadlock |
| P-8 — cash drawer + timeclock | 2P+6EC, 0 risk | ledger SSOT, close v2, clock, breaks, auto-clockout |

These 13 gates run in the full reflow of **every** future phase. Nothing in §2–§5 below may
touch their tables/functions without a new freeze cycle.

## 2. LIVE & COMPLETE (functional, ungated — mature code, no known contract freeze)

Domain line counts (route files) show depth, not just presence:

| Domain | Routes / lines | Evidence of real use | Notes |
|---|---|---|---|
| Orders (non-frozen actions: hold, waste, discount, guest-count, reprint, track, history…) | 31 / 3,461 | orders=729, order_items=701, order_events=18, operation_logs=1,757 | Frozen core = state/merge/payments; the long tail is live |
| Inventory / stock / purchasing | stock 16/1,172 + inventory 9/801 + procurement 4/540 + suppliers 4/439 + invoices 5/678 | inventory_logs=718, ingredients=34, purchase_orders live | **No concurrency gate yet** — the next natural gate target |
| Reservations | 15 / 1,724 | reservations=86, reservation_tables=9, preorder items=9 | Atomic engine (reserve/checkin/no-show) mature; reminder push missing (§3) |
| Menu engine | products/combos/categories/recipes 8/878 | products=14, recipes=60, product_variants=9 | Costing/margin/waste/versions + AI suggest + cookbook parse |
| People ops | staff 27/1,632 + payroll 2/193 + tips 4/171 + schedule 3/150 + overtime + breaks 2/75 + time-clock 5/217 | shifts=114, schedule=50, staff_metrics=56, shift_reviews=16 | Payroll export, tip pool/shortfall cron, SPLH, break adherence |
| Kitchen ops (non-KDS) | kitchen 9/596 + kitchen_schedule cron | kitchen_schedule=3 | Schedule cron + pre-fire |
| Campaigns / discounts | campaigns 2/336 + approvals 1/275 | campaigns=5, approval_requests=71 | Auto-apply engine + manager override (frozen A) |
| Delivery (own) | couriers 1/132 + rpc/transition_delivery_status + delivery_zones | delivery_zones live | Aggregators = Wave C |
| Multi-location foundation | locations 3 routes | **locations=4**, staff_locations=114 | Central menu/inventory/transfers missing (§3) |
| Notifications / WhatsApp | notifications + whatsapp 2/83 | notifications=271, outbox_events=5,775 | Outbox pump LIVE (2.1); SMS/email = Wave C |
| Sensei / AI | sensei 7/381 + ai/prep-estimate + vision + translate + invoice-ocr | ai_cache, popular_queries | Differentiator layer, complete for current scope |
| Analytics / reports | analytics 1/206 + dashboard 2/198 + reports + stats + kitchen/analytics + stock/trends+ai-insights | — | Retention/AOV/table-revenue blocks = UI depth (§3) |
| Ops admin | compliance 1/32 + discrepancies 1/413 + security/events + handover + messages 1/62 + onboarding 1/50 + documents 1/56 | discrepancy_alerts=21, security_events=743, staff_announcements | Loss prevention + risk scores live |

## 3. PARTIAL — engine exists, depth/UI/decision missing

| Area | What exists | What's missing | Blocked by |
|---|---|---|---|
| **Gift cards** | engine + `/api/gift-cards` (+redeem, 84 lines) + `gift_card_*` tables | UI, reporting, **0 cards issued**, RLS OFF on `gift_cards` | **Q3 decision** (build/cut) |
| **Loyalty** | earn/redeem/reverse engine + trigger + settings | tiers/VIP/birthday rules (empty), customer UI, **0 accounts**, RLS OFF on `loyalty_product_rules` | **Q2 decision** |
| **Waitlist** | 2 routes/190 lines (add + seat) | SMS, estimated-wait queue UI | **Q4 decision** |
| **CRM depth** | customers 1/111 + addresses + allergies + `correct-name` | timeline UI, segmentation UI, tab/house account (no `tab` column) | Wave A #4, C-modul |
| **Table ops depth** | tables 3/219 + floor data (56 tables, 2 floors) | table analytics block, floor editor depth | Wave A (UI) |
| **Devices / printing** | `print_jobs` + `/api/settings/printer` | device registry, health, print routing, drawer-kick driver | Wave A #8 |
| **Offline sync** | `/api/sync` (50 lines — thin) + `sync_operations` table (empty) | real offline-first POS | **Q8 decision** |
| **Multi-location depth** | orgs + 4 locations + per-location perms/switch | price-override UI, central menu/inventory, transfers, consolidated reports UI | Wave C |
| **Guest channels** | QR menu (staff-auth only), public reservations | **anon QR order/pay**, kiosk, online ordering UI | Wave A #2 / Wave B |
| **Upsell** | `get_best_cart_campaign` + Sensei | POS/QR "recommend" UI block | Wave B #3 |
| **Inventory depth** | full purchase/invoice/waste chain | batch/expiry columns, auto-PO generation, combo recipe expansion at payment | Wave B #5 / old roadmap Phase 4 |
| **Reservations depth** | full atomic engine | confirmation/reminder push, Google/3rd-party | Wave C |

## 4. NOT STARTED — decision-gated (Wave C class)

- **Q7 — terminal provider** (the critical gate): offline payment, pay-at-table, signature,
  chargeback, pre-auth, bar tab hardware — all wait on it.
- Marketing stack (SMS/email/push provider + consent) — only WhatsApp live today.
- Delivery aggregators (Uber/DoorDash).
- Outbound API + webhooks + API keys (developer surface).
- Accounting push (1C/Qiwi journal entries, VAT export UI — engine data exists).
- Kiosk. Monitoring / backup-DR / forensics UI.
- Daily operating checklists + maintenance tasks (onboarding engine exists as pattern).

## 5. SCHEMA DEBT — the actual P-9 surface (normalization target)

Read-only inventory of what P-9 would normalize (no implementation):

1. **`settings` decomposition** — single-row `settings` table (1 row) + `app_settings`
   (RLS OFF) + `public/settings` + `settings/*` routes + `public/vat-config`: config sprawl.
2. **Legacy models / dead tables** (0 or quarantine rows): `cash_drawer_logs` (6 legacy rows,
   superseded by `cash_drawer_log` in P-8), `cash_registers` (0), `clock_events` (0),
   `reservation_tables_quarantine_2026_09`, `reservations_archive`, `daily_reports`,
   `order_counters`, `popular_queries`, `waiter_assignments`, `dining_groups`,
   `price_overrides` (unused), `staff_documents`, `campaign_usage` (0).
3. **Duplicate columns** — `table_floors` snapshot columns (`total_amount`, `guest_count`,
   `reservation_*` — old roadmap "Post-Backend #2"), `orders.items` legacy column (roadmap #1),
   double audit tables (`audit_log` 48 rows trigger-based vs `audit_logs` 351 vs
   `audit_logs_canonical` 786 — canonical is SSOT since P-1).
4. **RLS holes (15 tables RLS OFF)**: `app_settings`, `delivery_zones`, `expenses`,
   `gift_cards`, `kitchen_analytics`, `loyalty_product_rules`, `order_counters`,
   `payment_attempts`, `payment_idempotency_keys`, `payment_methods`,
   `payroll_webhook_configs`, `reservation_preorder_items` (**3 policies exist but RLS OFF —
   policies inactive!**), `staff_metrics` (+ `migrations`, quarantine table = housekeeping).
   Known pattern from P-2: several are effectively `{public}`-ALL via anon access.
   Carried from P-8: `overtime_records`, `schedule`, `shift_breaks`, `shift_swap_requests`.
5. **Staff bloat** — `staff`=1,108 rows vs 114 in `staff_locations`; heavy inactive/legacy
   population (login_preflight candidate pool grows with it — see P-8 A-gate incident).
6. **Data residual** — 12,900.00₼ misattributed fixture amount (session 4d5aa595, P-8 carry).
7. **Harness debt (not DB)** — A-gate cleanup deactivates only 3 of N `A_RT_*` ids.
8. **Frozen-map staleness (doc-only)** — `MASTER_FEATURE_MAP.md` §20 still lists
   `/api/cash/reconciliation` (retired in P-8 Q5/Q6); cash drawer row should point to
   `/api/cash-drawer` + `cash_drawer_log`.

## 6. PHASING RECOMMENDATION — when does P-9 go?

The dependency question the user asked: *"P-9-də eyni schema-nı iki dəfə dağıtıb-yığmayaq."*

**Finding: no pending functional work requires schema surgery on the FROZEN core.** All §3/§4
gaps are one of: (a) a **provider/decision** (Q2/Q3/Q4/Q7/Q8/Q10), (b) **UI/workflow depth** on
existing tables, or (c) **new tables** (device registry, checklists, batch/expiry, customer tab,
kiosk). None of them edit frozen contracts.

The one ordering hazard: **(c) new tables built AFTER P-9** would be normalized a second time
(P-9 normalizes the 122-table surface; new tables arrive un-normalized, and the RLS/decomposition
patterns must be re-applied). Therefore:

```
OPTION 1 (recommended) — decisions first, then features, then P-9:
  1. GO/decision on Q2 (loyalty tiers), Q3 (gift cards), Q4 (waitlist SMS)
     → these three decide which §3 areas get tables/columns.
  2. Small functional phase(s) for the chosen Wave A items
     (new tables: device registry / checklists / loyalty-tier rules / gift-card UI data /
      customer tab — each with its own audit + gate + freeze, P-pattern).
  3. THEN P-9 normalization — surface = 122 tables + the NEW tables from step 2,
     single decomposition pass, single RLS pass.
  4. Wave B (guest channels: anon QR, kiosk, online ordering) and Wave C (Q7 terminal,
     marketing, aggregators, accounting, outbound API) as later phases.

OPTION 2 — P-9 now, with explicit exclusion list:
  Start P-9 immediately if schema debt is the priority; exclude from its scope:
  loyalty_* , gift_card_*, waitlist (Q2/Q3/Q4 undecided), customer tab field (C-modul),
  and any Wave A new-table candidates — they get their own normalization when built.
  Cost: two normalization passes over those areas; RLS holes in those areas stay open
  until their feature phase.

Either way, P-9 scope is already knowable today (§5.1–5.7) and would follow the ratified
sequence: READ-ONLY AUDIT (this doc = seed) → full inventory → invariant/ratification matrix →
decision matrix → GO → implementation → gate → full frozen reflow → FREEZE.
```

**No surprise changes. No auto-start. Nothing in this document modifies live state.**
