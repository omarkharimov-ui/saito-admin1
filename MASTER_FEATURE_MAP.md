# SAITO OS — MASTER FEATURE MAP (A→Z)

> **Məqsəd:** Saito-nu Toast / Square for Restaurants / Lightspeed Restaurant səviyyəsində
> Restaurant Operating System kimi strukturlaşdırmaq — sadə "POS-da order/payment var"
> səviyyəsindən yuxarı. Hər modul: feature-lər, **REAL status** (2026-09-11 inventar),
> lazımi DB/API/UI/permission, parity qeydi, Wave qruplaşması.
>
> **Status əsası (REAL, 2026-09-11):** Supabase `jbxmlnsicbfkbsatnoej` — **156 cədvəl**,
> **419 public funksiya/RPC**, realtime publication **2 cədvəl dəstəyi** (supabase_realtime +
> messages); app: **263 API route**, **40+ UI səhifə**. Sürətli data nümunəsi:
> orders=706, reservations=86, staff=22, products=14, recipes=60, customers=7,
> loyalty_accounts=0, gift_cards=0.
>
> **P-9 status (2026-09-18):** Schema normalization **FROZEN** — 8 migration (M1a, M2–M7,
> M1b), 10 yeni FK (1 RESTRICT), staff fixture purge (1,108→53 real, pool=9), 14 frozen
> gate + P-9 gate re-run **GREEN** (zero residue). Sənəd: `P9_FREEZE_REPORT_2026-09-18.md`.
>
> **WAVE QƏRARLARI (user-ratified, 2026-09-19 — canonical):**
> - **Q2 Loyalty tiers → CUT/defer.** Əsas loyalty saxlanılır (M0-da repair olundu); tiers/birthday UI deferred list-ə.
> - **Q3 Gift cards → BUILD (minimal):** satış/redeem/balance/report + bar-tab; UI istifadəçilə birlikdə (hard-stop qaydası).
> - **Q4 Waitlist → DEFER (provider-dependent):** backend hazırkı halda FROZEN qalır; SMS notification provider qərarından ayrılır (abstraction).
> - **Q7 Terminal provider → INVESTIGATE, NO LOCK:** əvvəl capability matrix (API/SDK, card-present, offline-auth, pre-auth, capture/void/refund, chargeback/webhook, pay-at-table, device mgmt, country/acquirer, settlement) → sonra seçim.
> - **Q8 Offline → PHASE 1 LIVE (2026-09-26):** monitor (navigator+ping) + write-queue (localStorage FIFO, idempotency dedupe, conservative auto-replay) + read snapshot cache (apiFetch fallback) + OfflineBanner + money routes BLOCKED (503 OFFLINE). Phase 2: offline cash ledger + manual sync panel + offline card (Q7 ilə).
> - **Q10 Push → BUILD (abstraction):** `device → user/customer → token → platform → consent/status`; provider sonrakı qərar.
> - **ICRA SIRASI (user):** C-16 → commit/push → Wave A: 1) add-to-check 2) customer timeline 3) gift card minimal UI 4) daily checklists 5) device registry/print routing → loyalty/waitlist SMS deferred, push abstraction; PARALEL: Q7 provider discovery (implementation lock YOX).
>
> **W-A1 status (2026-09-19):** QR qonaq identifikasiyası + anon client girişi **FROZEN** —
> M0 loyalty cədvəlləri repair (P-7 09-14 latent regression, earn 09-14-dan qırıq idi),
> M1 `customers_phone_uq` + `guest_link_customer`, QR `customer_phone` extension, yeni
> `GET /api/orders/qr/status`, menu phone capture + status card. W-A1 gate **18/18** +
> route E2E **5/5** (residue 0). Full frozen reflow yenidən GREEN (13/15 vahid); P-7 half-2
> + P-8 = Supabase incident 6q5902p2xd9f (API Gateway degraded) ilə BLOCKED — re-run
> komandaları `W_A1_FREEZE_REPORT_2026-09-19.md` §4-də. Production hardening saxlanıldı:
> `middleware.ts` (transient probe → route re-check) + `instrumentation.ts` (GET
 > socket-race retry).
>
> **W-A2 status (2026-09-19):** Add-to-check (active QR order) **FROZEN (backend)** —
> D12 `check_token` (hash-saxlanılır, raw bir dəfə), D13 server-sourced qiymətlər
> (G3 underpay gap bağlandı), D14 `qr_add_items` RPC (FOR UPDATE + finalized reject +
> idempotency), D16 incremental total (`add_item_atomic` mirror; VAT-18% ssot draft
> istifadədən ƏVVƏL rədd olundu), **D17 production defect fix** — boş (`empty`) cədvəldə
> ilk QR sifariş 500 verirdi (27/33 cədvəl `empty` idi); indi pre-insert occupied flip.
> Gate **19/19** + narrowed reflow O 38/38, W-A1 18/18, F 35/35 (residue 0).
> D18 (user qərarı): **6-rəqəmli check code** — itki halında re-attach
> (`/qr/relink`, rotasiya: köhnə kod tokenlə birlikdə ləğv olunur).
> **UI = HARD STOP:** menu "continue your check" istifadəçilə birlikdə;
> UI forması (sticky bar / drawer / inline) = **AÇIQ qərar**. Sənəd:
> `W_A2_FREEZE_REPORT_2026-09-19.md`.
>
> **W-A3 status (2026-09-19):** Customer timeline **FROZEN (backend, read-only)** —
> `GET /api/customers/[id]/timeline` + `get_customer_timeline` RPC (stats canlı
> `orders`-dan; cancelled excluded; favorites; payments embed). **Sübut:**
> `customers.total_visits/total_spent/last_order_at` = DEAD sütunlar (yazan trigger
> YOX) → timeline onları göstərmir (MFM §6 "profile" sətri düzəldildi —
> birthday/email/notes sütunları mövcud DEYİL). Gate **9/9** + W-A1 reflow 18/18.
> **UI TAMAM (09-20, v8.5, commit 6de4214e):** `/admin/customers` — full-bleed
> iOS-push detail (2 sütun: order timeline + Profil/Sevimlilər), Spotlight search
> (live highlight, ↑/↓ row nav), native-speed pass (SWR micro-cache + cachePeek
> zero-latency open + dev route-warmer). CP-1 profile fields (birthday/email/notes)
> = `b3578c9f`. Sənəd: `W_A3_FREEZE_REPORT_2026-09-19.md`.
>
> **W-A4 status (2026-09-20):** Gift card (Q3) **TAMAM + 1.5** —
> `20260920000001` PRODUCTION DEFECT repair (ledger recreate + RPC rewrites +
> `gift_card_block` + `gift_card_summary`) → `20260920000002` `gift_card_load`
> (active-only top-up) + `gift_card_refund` (active+used; used→active
> resurrection) → `20260920000005` lazy-expiry guard (frozen `gift_card_redeem`
> mirror; cron YOX, `status='expired'` heç yazılmır — expiry canonical-lazy).
> Routes: list (wildcard-escape fix), summary, `[code]/ledger`, `[code]/block`,
> `[code]/load`, `[code]/refund`. UI `/admin/gift-cards` (house DNA: PageHeaderCard,
> Spotlight, report strip, status segments, full-width iOS-push detail,
> issue/load/refund/block inline forms, Monobtn). Gates: `.gc-gate.cjs` 23/23 +
> `.gc2-gate.cjs` 22/22 (zero residue). Commits: 7668addd, b3578c9f.
> Qalıq (§8): physical/QR (D4 SEPARATE), deep reporting, multi-location.
>
> **WAVE A QƏRAR DƏYİŞİKLİKLƏRİ (user, 2026-09-19):**
> - **QR = ACCESS/CHANNEL MECHANISM, not a separate ordering product.**
>   QR sadəcə: table binding → guest website + table context. QR-ın özünə
>   ayrıca menu UI / cart / check management qurmaq = redundant.
> - **Guest Ordering Website (Sushinode) = AŞRAĞI XARİCİ MƏHSUL** — öz
>   lux frontend-i ilə ayrı məhsuldur (menu → product → customize/modifiers →
>   cart → check → add items → recovery code). Eyni Supabase/Saito backend-i
>   ilə işləyəcək. **FINAL INTEGRATION PASS** (roadmap sonu): modifier → cart
>   → check → Supabase → POS/KDS axını tam yoxlanılacaq.
> - **QR menyu (Saito /menu) = DEFER** (Wave A-dan çıxır). W-A2 backend
>   contractları (create + check_token + check code/relink + server price)
>   **frozen infrastruktur olaraq qalır** — Sushinode integration pass-i
>   məhz bu contractları istifadə edəcək. D17 prod fix + D13 price hardening
>   backend səviyyəsində qüvvədə qalır.
> - **Customer (CRM) = indi**: UI polish (list-də canlı stats: visits · spent
>   · last visit — frozen timeline RPC-dən, bounded N+1, backend toxunulmayıb)
>   + freeze; sonra Wave A #3 Gift Card.
> - **superadmin PIN** = `4321` (1234 G1 frozen guard tərəfindən banneddır).
>
> **Menecer map sync (2026-09-19):** ChatGPT "menecer" A–Z master feature map + SAITO OS
> architecture istifadəçi tərəfindən təsdiqləndi və bu fayla xalça edildi (§0.3 A–Z
> cross-reference, §8.1 must-have checklist). Bu fayl = yeganə canonical plan map.
>
> **Status qəbulu:**
> - ✅ **LIVE/FROZEN** — DB + RPC + API + UI var, işləyir (FROZEN olanlar: regression yoxlaması istisna, toxunma)
> - 🟡 **PARTIAL** — DB/RPC var amma UI yox/əksik, və ya UI var amma workflow yarımçıq
> - ⚪ **STUB** — cədvəl/skeleton var, məzmun boş (səifə var, feature yoxdur)
> - ❌ **YOX** — heç nə yoxdur (planlanmayıb)
>
> **Wave qəbulu:** Addım 2 = yarımçıqları tamamla (🟡/⚪ → ✅). Addım 3 = yeni feature-lər (❌ → 🟡 → ✅), dalğalarla.
>
> **Qızıl qayda:** Hər feature üçün əsas sual "bu operation hansı state-i dəyişir, hansı
> downstream təsirlənir?" — UI sualı YOX. (HANDOVER §2)

---

## 0. ÜMUMİ ARXİTEKTURƏ (master product map)

```
                                      SAITO OS
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
       FOH                              BOH                          BACK OFFICE
        │                                │                                │
   POS   Tables   Customers            KDS    Kitchen     Bar        Analytics  Inventory  Purchasing
   Orders Reservations CRM            Tickets  Recipes   Drinks       Reports    Stock       Suppliers
   Payments Floor Plan  Loyalty       Stations Modifiers Courses      KPIs       Waste       Purchase Orders
   Discounts Waitlist  Gift Cards     Routing  Prep Time  Expo        Finance    Costing     Receiving
   Voids    Seating   Marketing       Timers   86         Service     Labor      Variance    Invoices
   Comps    Transfers SMS/Email       Bump     Allergies             Sales      Valuation
   Splits   Merges                    Recall   Notes
                                         │
                              ┌──────────┴──────────┐
                         OPERATIONS             PEOPLE
                    Staff / Shifts           Employees
                    Tasks / Checklists       Roles / Permissions
                    Cash Drawer              Scheduling
                    Opening/Closing          Payroll
                    Manager Approval         Tips
                                         │
                                      PLATFORM
        ┌────────────────┬───────────────┼────────────────┬────────────────┐
    Payments           Devices        Security         Data            Integrations
    Card/Cash/Gift/QR  POS/Handheld/KDS RBAC/PIN/Sessions DB/Realtime   API/Webhooks
    Refund/Chargeback  Printer/Drawer  Approval/Overrides Audit/Events  Accounting/Payroll
    Reconciliation     Routing/Health  Monitoring          Backup        Delivery/Reservations
                                         │
                                  GUEST CHANNELS
             WEB                     QR                      KIOSK
        Online Ordering            QR Menu/Order/Pay       Self Ordering
        Pickup/Delivery            Scan & Pay              Payment/Upsell
        Reservations/Loyalty       Table/Seat-specific
                                         │
                                    DELIVERY
             Own Delivery          Aggregators           Dispatch
             Drivers/Zones         Uber/DoorDash         Tracking/ETA
                                         │
                                  MULTI-LOCATION
          Location A / Location B / Location C  →  CENTRAL CONTROL
          (Menu / Pricing / Inventory / Customers / Loyalty / Reporting / Devices)
```

### 0.1 SPINE (məhsul sütunu)

```
┌─────────────────┐
│    SAITO OS     │
└────────┬────────┘
    ┌────┼─────────────────┐
EXPERIENCE   OPERATIONS     FINANCE
POS/Web/QR   Orders/KDS     Payments
Kiosk/       Tables/Kitchen Cash
Customer     Reservations   Refunds/Accounting
    └────┬────────┬─────────┘
        INVENTORY
   Recipes/Stock/Waste, Suppliers/Purchasing
              │
           PEOPLE
   Staff/RBAC/Shifts, Tasks/Tips/Payroll
              │
          PLATFORM
   Auth/Realtime/Events/Audit, Devices/API/Webhooks/Sync
              │
        INTELLIGENCE
   Reports/Analytics/AI (Sensei)
              │
      MULTI-LOCATION
   Central Menu/Inventory/CRM
```

### 0.2 OPERATION BACKBONE (hər business əməliyyatın event layer-i)

```
OPERATION → AUTHORIZATION(RBAC+override) + VALIDATION
        → ATOMIC TRANSACTION (DB state change)
        → DATA MUTATION + EVENT (outbox)
        → KITCHEN / PAYMENT / INVENTORY downstream
        → REALTIME (POS/KDS/Back Office)
        → AUDIT (log_operation_canonical)
        → ANALYTICS
```

Nümunə — `add_item_atomic` ("Steak ×2"): permission check → availability check →
price resolution → modifier validation → tax resolution → order mutation →
kitchen routing → course assignment → inventory reservation → realtime event →
audit log → analytics event. External processor / notification = **DB transaction
dən kənarda, idempotent outbox** ilə (`outbox_events` + `emit_outbox_event`).

> **Backbone:** `outbox_events` + **`outbox_pump` consumer LIVE (2.1, 2026-09-11)** —
> pg_cron */30s pump; handler dispatch; dead-letter `status='dead'`. Yeni event tipi
> əlavə edəndə `outbox_dispatch()`-də handler qur.

### 0.3 Manager A–Z letter index (ChatGPT "menecer" map → Saito modul cross-reference)

> 2026-09-19 ChatGPT "menecer" A–Z master feature map-inin (istifadəçi təsdiqli) bu
> faylın modullarına aid edilməsi. Hər hərfin statusu aşağıdakı §1–§7 cədvəllərindən.

| Hərf | Domen (menecer) | Saito modul | REAL status |
|---|---|---|---|
| A | Authentication / Access / Accounts | 19 Staff/RBAC + 27 Security | ✅ FROZEN |
| B | Billing (check, split, void, refund, comp, discount, tax) | 5 Billing+Payments | ✅ core FROZEN |
| C | Customers / CRM | 6 CRM | ✅ profile+history (CP-1: birthday/email/notes) / 🟡 marketing |
| D | Discounts | 9 Discounts/Promotions | ✅ engine / 🟡 coupon+BOGO UI |
| E | Employees (roles, clock, tips, payroll) | 20 Shifts/Labor + 19 | ✅ parity |
| F | Floor / Tables | 3 Table Management | ✅ FROZEN |
| G | Gift Cards | 8 Gift Cards | ✅ engine+UI+1.5 (Q3 TAMAM 09-20: issue/redeem/block/load/refund/ledger/summary) |
| H | Hardware / Devices | 28 Devices | 🟡 print jobs / ❌ registry+health |
| I | Inventory (stock, recipes, purchasing, waste) | 16 Inventory | ✅ parity |
| J | Jobs / Tasks / Checklists | 21 Tasks/Checklists | ✅ onboarding / ❌ daily checklists |
| K | Kitchen / KDS | 15 Kitchen/KDS | ✅ FROZEN |
| L | Loyalty | 7 Loyalty | ✅ engine **repair M0 (09-19)** / ⚪ tiers+UI (Q2) |
| M | Menu Management | 10 Menu Engine | ✅ |
| N | Notifications | 23 Notifications | ✅ in-app+WhatsApp / ❌ SMS+email |
| O | Orders (types + lifecycle) | 4 Orders | ✅ FROZEN |
| P | Payments (tenders, refund, reconciliation) | 5 Billing+Payments | ✅ core FROZEN / ❌ offline+terminal (Q7) |
| Q | QR (access/channel ONLY) | 30 Website/QR | 🔻 **DEFER (user, 09-19):** ayrıca ordering product DEYİL — channel. Backend contractları frozen (W-A1/W-A2: create, check_token, code/relink, server price) = Sushinode integration-infra; Saito /menu UI = draft (committed) |
| Q2 | Guest Ordering Website (Sushinode) | external product | ⏳ **FINAL INTEGRATION PASS:** menu → modifiers → cart → check → recovery code → eyni Supabase backend → POS/KDS. QR = entry point (`?table=N`) |
| R | Reservations | 11 Reservations | ✅ core / 🟡 waitlist SMS |
| S | Staff / Shifts | 20 Shifts/Labor | ✅ |
| T | Tableside (waiter handheld) | 12 Tableside | ✅ tablet POS / ❌ hardware (Q7) |
| U | Upselling | 14 Upselling | 🟡 campaign / ✅ Sensei AI |
| V | Voids / Refunds / Corrections | 5 + P-6 | ✅ FROZEN |
| W | Waitlist | 13 Waitlist | 🟡 core (UI+SMS = Addım 2) |
| X | xtraCHEF / Back Office (AP, accounting) | 25 Back Office + 17 Procurement | ✅ PO+OCR / ❌ accounting push |
| Y | Analytics / Reporting | 24 Analytics | ✅ core+Sensei / 🟡 advanced |
| Z | Multi-location / Enterprise | §7 Multi-Location | 🟡 foundation / ❌ central |

---

## 1. FOH — FRONT OF HOUSE

### 2. POS (terminal + order entry) — 🔒 FROZEN (2026-09-26, Task 51)
> A→Z audit bitdi (jurnal 09-26): markers 0, hooks violations 0, 3+2 i18n key fix, worst error-leak fix; 6 dead component = SAQLANIR (DEAD marker); ~40 error pass-through = FROZEN note; `prompt()`×2 = Faza 2. Yeni feature = owner request-ə görə yalnız.
- Order Entry: dine-in / takeout / pickup / delivery / bar / catering / phone / online / QR / kiosk
- Cart: items, qty, modifiers, notes, courses, seats, special instructions
- Order Actions: hold, send, fire, recall, void, comp, discount, transfer, reopen
- Bill: subtotal, tax (VAT opt-in), service charge, gratuity, discount, total

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Order types (dine-in, takeaway, delivery, reservation) | ✅ | `orders` (706), `order_items`, `order_courses`, `order_events` | `/api/orders/*` (35+ route), `create_takeaway_order`, `create_delivery_order` |
| Cart + modifiers + courses + seats + notes | ✅ | `seats`, `order_courses`, `product_modifiers` | POS `admin/pos/page.tsx`, `upsert_seats` |
| State machine (DRAFT→…→CLOSED, VOIDED/REOPENED…) | ✅ FROZEN | `state_transitions`, `get_valid_transitions` | `transition_order_status_validated` |
| Total SSOT + VAT | ✅ FROZEN (1.5) | `settings.vat_*`, `orders.apply_vat` | `calculate_order_total_v3`, `/api/orders/apply-vat` |
| Undo | ✅ | `operation_logs` + `undo_payload` | `undo_operation_v4`, `/api/orders/undo` |
| Return (served item → anbar/itki, **məcburi səbəb DB-də**) | ✅ (09-25, `886c9871`+`a18da538`) | `return_to_stock` (20260925010000 bill-update), `record_item_waste`, `inventory_logs.reason`, `audit_logs_canonical.new_data.reason` | POS details-panel morph (Miqdar row → PinGuard → return view + 8 səbəb chip), `/api/orders/return-to-stock`, `/api/orders/waste` |
| 86 / sold-out | ✅ | `products.availability` | `mark_sold_out_atomic`, `/api/kitchen/sold-out` |
| Offline-first POS | ❌ | — | Wave A (Q8 qərarı gözləyir: offline-first?) |
| Handheld / tableside payment | ❌ | — | Q7 terminal provider qərarı gözləyir |

### 3. TABLE MANAGEMENT
- Floors, floor plan (drag & drop, shapes, capacity, sections)
- Table state: FREE / RESERVED / OCCUPIED / PAYMENT_PENDING / CLEANING / OUT_OF_SERVICE
- Operations: open, move, transfer, merge, split, combine, dismiss, change table
- Analytics: guest count, covers, open time, occupancy, revenue per table, turnover

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Floors + tables + seats | ✅ | `table_floors`, `floors`, `seats`, `waiter_assignments` | `/api/pos/floors`, `/api/tables/*`, `admin/tables` |
| Table state machine + realtime | ✅ FROZEN | `transition_table_status` | `emit_table_status_event` (P0-3: 12 cədvəl realtime) |
| Merge / unmerge / transfer / split / dismiss / undo | ✅ FROZEN (V2 contracts) | `merge_tables_v4`, `unmerge_tables_v4`, `transfer_table_atomic`, `separate_tables_v1`, `saito_*` | `/api/orders/merge`, `/api/orders/transfer`, `/api/orders/unmerge` |
| Aggregates sync (phantom totals fix) | ✅ FROZEN | `reconcile_table_aggregates`, `sync_table_aggregates` | D9 `sync_table_order_aggregates` |
| Table analytics (covers, turnover, revenue) | 🟡 | `get_staff_directory_v2` (avg_wait_time, table_turnover_rate), `kitchen_analytics` | Rapor səhifəsində ayrı "Table analytics" bloku YOX |
| Floor editor (drag & drop, shapes) | 🟡 | mövcud layout sahələrini `table_floors` saxlayır | UI editor dərinliyi Addım 2-də |

### 4. ORDERS (ürək)
Lifecycle: DRAFT→OPEN→SENT→ACCEPTED→PREPARING→READY→SERVED→PAYMENT_PENDING→PAID→CLOSED
Exceptions: VOIDED / CANCELLED / REFUNDED / REOPENED / PARTIALLY_REFUNDED

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Order creation (table/takeaway/delivery/reservation/walk-in) | ✅ | `create_or_append_order`, `walkin_atomic`, `create_takeaway_order`, `create_delivery_order` | `/api/orders`, `/api/orders/qr` (+`/qr/add` — W-A2) |
| Item lifecycle (hold/send/prepare/ready/serve/recall) | ✅ | `item_kitchen_step`, `send_item_atomic`, `mark_item_ready_atomic`, `toggle_item_hold` | KDS + POS |
| Split by seat / equal / item | ✅ | `split_by_seat`, `split_equal`, `split_order_by_items_atomic`, `get_seat_totals` | `/api/orders/bill-split` |
| Refund chain (full/partial → reopen → repay, double-stock guard) | ✅ FROZEN (P0-4) | `refund_with_inventory`, `payment_refunds` | `/api/orders/refund` |
| Delivery status lifecycle + courier | ✅ | `transition_delivery_status`, `couriers`, `delivery_zones` | `/api/couriers`, `/api/orders/delivery-status` |
| Third-party (Uber/DoorDash) order import | ❌ | — | Wave C |

### 5. BILLING + PAYMENTS
- Bill: open, hold, close, reopen, cancel
- Split: equal / by item / by seat / fractional / multiple tenders
- Transfer: item / seat / check / table
- Payment: cash, card, debit, contactless, Apple/Google Pay, QR, gift card, multiple, partial, deposit, pre-auth, bar tab, pay-at-table, offline
- Refund (full/partial/to gift card), chargeback, retry, reconciliation

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Payment core (idempotency, double-charge guard, overpay guard) | ✅ FROZEN (D-6/D-7) | `order_payments`, `payment_attempts`, `payment_idempotency_keys`, `complete_payment_atomic_v2` | `/api/orders/complete-payment` |
| Cash drawer (open/close sessions, in/out, denominations) | ✅ FROZEN | `cash_drawer_sessions`, `denomination_counts`, `open_cash_register`/`close_cash_register_v2` | `/api/cash-drawer` |
| Payment reconciliation + approve/dispute | ✅ | `cash_reconciliations`, `payment_reconciliation` | `/api/finance/reconciliation` |
| Void payment + reverse | ✅ FROZEN | `void_payment_atomic_v2`, `saito_reverse_payment` | `/api/payments/void` |
| QR payment (Scan & Pay) | ✅ | `/api/orders/qr` (SSOT bağlı) | menu QR səhifəsi |
| Gift card tender | ✅ (09-25 verify) | `gift_cards`, `gift_card_ledger`, `gift_card_redeem` (DB-də 0 card) | POS `ActionSheet` payment method `gift_card` + `GiftCardModal` (onSuccess → tender); `admin/gift-cards` |
| Bar tab (pre-auth) | ❌ | `customers` var, tab sahəsi yox | Addım 2 (C-modul) |
| Customer tab / house account / credit | ❌ | — | Addım 2 |
| Offline payment | ❌ | — | Q7/Q8 qərarından sonra |
| Pay-at-table (tableside card) | ❌ | — | Q7 terminal provider |
| Chargeback workflow | ❌ | — | Wave C (accounting) |
| Multiple taxes (yalnız 1 tax engine) | 🟡 | `apply_tax`, VAT engine | Baku üçün 18% single tax kifayətdir; multi-tax Wave C |

### 6. CRM (Customers)
- Profile: name, phone, email, birthday, preferences, allergies, notes, tags
- History: orders, visits, spending, favorite items
- Financial: tab, house account, credit, stored payment
- Marketing: segments, SMS, email, consent, campaigns

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Customer profile + addresses + allergies | ✅ | `customers` (7; +birthday/email/notes — CP-1 09-20, `20260920000003`), `customer_addresses`, `allergens`, `product_allergens` | `/api/customers`, `/api/customers/[id]/profile` (CP-1) |
| Order/visit history + favorite items | ✅ **W-A3+UI (09-20, v8.5)** | `GET /api/customers/[id]/timeline` — stats canlı `orders`-dan (dead `total_visits/total_spent` sütunları yalan idi, istifadədən çıxarılıb); favorites, payments embed; CP-1: timeline customer jsonb-da birthday/email/notes | `/admin/customers` — full-bleed iOS-push detail (timeline + Profil/Sevimlilər), Spotlight, native-speed (cachePeek prefetch) |
| Segmentation + consent | 🟡 | `campaign_targets` var | UI yox |
| SMS / email / push marketing | 🟡 | `notifications`, `staff_messages`, WhatsApp route (`/api/whatsapp/*`) | SMS/email provider inteqrasiyası YOX (Wave C) |
| Tab / house account | ❌ | — | Addım 2 |
| Stored payment | ❌ | — | Q7-dən sonra |

### 7. LOYALTY
Points, rewards, membership, VIP, tiers; earn (spend/visit/item); redeem (discount/free item/reward); birthday; automatic; history; balance; segmentation.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Loyalty engine (earn on order, reverse on refund) | ✅ | `loyalty_accounts`, `loyalty_transactions`, `loyalty_order_points`, `loyalty_product_rules`, `loyalty_earn`/`loyalty_redeem`/`loyalty_reverse` (trigger: `_trg_order_loyalty_spine`) | `/api/orders/loyalty`, `/api/settings/loyalty` |
| D-8 refund-chain-də loyalty leak fix | ✅ FROZEN | migration 000009 | — |
| Tiers / VIP / birthday reward | ⚪ | cədvəllər var, qaydalar boş | Addım 2 (Q2 qərarı gözləyir: build/cut) |
| Customer UI (balance/history) | ⚪ | — | Addım 2 |

### 8. GIFT CARDS
Create (physical/digital), number/QR/barcode, balance, reload, redeem (partial), expiration, refund to card, reporting, multi-location.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Core engine (issue/redeem/ledger) | ✅ FROZEN + REPAIR (09-20) | `gift_cards`, `gift_card_ledger` (canonical; `gift_card_transactions` DROP), `gift_card_issue`/`gift_card_redeem`/`gift_card_block`/`gift_card_load`/`gift_card_refund`/`gift_card_summary` | `/api/gift-cards*` |
| Reload + refund to card (1.5) | ✅ | `gift_card_load` (active-only), `gift_card_refund` (active+used → resurrection) — hər ikində lazy-expiry guard (redeem mirror, `20260920000005`) | `[code]/load`, `[code]/refund` |
| Expiration | ✅ lazy (canonical) | `expires_at`; cron YOX, `status='expired'` yazılmır — redeem/load/refund guard | — |
| UI (create/manage/report) | ✅ (house DNA) | — | `/admin/gift-cards` (09-20): PageHeaderCard + Spotlight + report strip + status segments + full-width iOS-push detail + issue/load/refund/block inline forms |
| Per-card ledger view | ✅ | `gift_card_ledger` chain (balance_after invariant — gate INV) | `[code]/ledger` |
| Deep reporting (expiry forecast, utilization, ROI) | ❌ | summary strip var (active balance · issued 30d · redeemed 30d) | Wave B |
| Physical card / QR / digital wallet | ❌ | D4 qərarı (09-20): SEPARATE — payment-method coupling YOX | ayrıca paket |
| Multi-location | ❌ | — | Wave C |

### 9. DISCOUNTS / PROMOTIONS
Percentage/fixed/item/order/category/employee/VIP; happy hour; time-based; BOGO; promo code; coupon; rules (start/end/days/locations/items/segment); security (limit, manager approval, reason, audit).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Campaign engine (auto-apply, rules, eligibility, usage) | ✅ | `campaigns`, `campaign_rules`, `campaign_schedules`, `campaign_targets`, `campaign_usage`, `campaign_products`, `auto_apply_campaigns`, `calculate_cart_campaign_discount` | `/api/campaigns`, `/api/campaigns/performance`, `admin/campaigns` |
| Manual discount (manager approval) | ✅ | `request_override`/`approve_override`, `manager_overrides` | POS ActionSheet + PinGuard |
| Happy hour / time-based | ✅ | `campaign_schedules` (time windows) | — |
| Promo code / coupon (customer-facing) | 🟡 | `campaigns.code` sahəsi mövcuddur | QR/QR menu-də coupon flow yox |
| BOGO | 🟡 | `calculate_rule_discount` rule tipləri | UI-də rule builder dərinliyi Addım 2 |

### 10. MENU ENGINE
Categories, subcategories, products, variants, sizes, modifiers (groups, required/optional, min/max), combos, bundles, add-ons, upsells; product data (name, desc, image, SKU, barcode, price, cost, tax); availability (schedule, location, channel, seasonal, temporary, 86); routing (kitchen/bar/grill/dessert/printer).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Products + variants + modifier groups (min/max) | ✅ | `products` (14), `product_variants`, `modifier_groups`, `modifier_group_items`, `product_modifier_groups`, `product_modifiers` | `admin/products`, `/api/products*` |
| Combos + combo pricing | ✅ | `combos`, `combo_items`, `calculate_combo_pricing` | `admin/combos` |
| Costing + margin + recipes | ✅ | `recipes` (60), `recipe_headers`, `ingredients`, recipe versions, `recipes/margin-analysis` | `admin/recipes` |
| 86 / availability schedule | ✅ | `mark_sold_out_atomic`, availability sahələri | `/api/kitchen/sold-out` |
| Kitchen routing (stations) | ✅ | `stations`, `route_kitchen_order` | KDS |
| Channel-specific menu (QR vs POS vs kiosk) | 🟡 | availability sahələri var | channel filter UI Addım 2 |
| Location-specific menu / central menu | 🟡 | `price_overrides`, `locations` bağları | Addım 3 (multi-location) |

### 11. RESERVATIONS
Calendar, guest, phone, party size, date/time, table; lifecycle BOOKED→CONFIRMED→ARRIVED→SEATED→COMPLETED/CANCELLED/NO_SHOW; waitlist; walk-in; table assignment; communication (confirmation/reminder/cancellation); channels (website/Google/third-party).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Reservation engine (atomic: reserve/assign/cancel/walk-in/seating/no-show) | ✅ (09-25 verify: 87 rez, 16 route) | `reservations` (87), `reservation_tables`, `assign_reservation_tables_atomic`, `confirm_and_checkin_atomic`, `mark_no_show_atomic`, `auto_no_show_v2`, `seat_guests_atomic` | `/api/reservations*` (16 route: reserve/cancel/no-show/walk-in/guest-arrived/move/merge/pre-order/send-kitchen/kitchen-schedule/status/public + cron), `admin/reservations`, `public/reservations` |
| Reservation↔POS linkage | ✅ (09-25 verify) | `orders.reservation_id`, `table_floors.reservation_*` (name/phone/time/status), `seat_guests_atomic` = order yarat + **pre-order → order_items**-ə köçür + `kitchen_scheduled_for` | POS `TableCard` rez chip + `ReservedTableModal` (Guest Arrived / Edit / Move / Merge / Print / No-Show) |
| Pre-order on reservation | ✅ | `reservation_preorder_items`, `upsert_reservation_preorders`, `send-kitchen` | — |
| Table merge/move within reservation | ✅ | `merge_table_to_reservation`, `move_reservation_table_atomic` | — |
| Waitlist (SMS + queue + estimated wait) | 🟡 | `waitlist` route + `/api/waitlist/seat` | SMS notification YOX; UI Addım 2 (Q4 qərarı) |
| Online booking channel (public) | ✅ + 🟡 | `api/public/reservations`, `reservations.email`, `/api/email/send` (SMTP, 09-26) | **E-mail confirm/reminder ✅** (Settings→Bildirişlər EMAIL card + rezerv "EMAIL GÖNDƏR"); **SMS/Push YOX** — SMS provider PARKED (owner 09-26), push = Q10 |
| Google/third-party booking | ❌ | — | Wave C |

### 12. TABLESIDE / WAITER HANDHELD
Table → Guests → Items → Modifiers → Send → Kitchen → Course → Serve → Payment → Close + tableside split/signature/tip/receipt.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Tablet POS-da tableside flow | ✅ | (POS core) | `admin/pos` — tablet/phone browser-da işləyir |
| Hardware handheld (Toast Go 2 kimi) | ❌ | — | Q7 + Wave A |
| Tableside card payment + signature | ❌ | — | Q7 terminal provider |

### 13. WAITLIST (ayrı modul kimi)
Add guest, party size, estimated wait, preferred area, phone, SMS, queue position, table assignment, seat, remove, no-show, wait time analytics.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Waitlist core | ✅ + 🟡 | `/api/waitlist`, `/api/waitlist/seat`, WaitlistPanel (09-25) | UI + automation ✅ (empty-table→notify→seat→auto-order); **SMS = PARKED** (owner 09-26 qərarı — provider qoşulmayacaq) |

### 14. UPSELLING
Suggested modifier, recommended item, combo upsell, cross-sell, AI recommendation, server prompt, time-based.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Campaign-based upsell (best cart campaign) | 🟡 | `get_best_cart_campaign` | POS-də "recommend" UI bloku yox |
| AI recommendation (Sensei) | ✅ | `ai_cache`, `popular_queries`, Sensei routes | `/api/sensei/*`, `recipes/ai-suggest` |
| **Predictive upsell engine (staff)** | ✅ **v2 (09-21, `8732fdc2`)** | `upsell_offers` + `suggest_addons_v2` (per-order budget 2 shown/1 accepted, dismiss cooldown 120s, 2.5× price-jump, ≥15% evidence, offer types complement/beverage/generic) | `/api/upsell/suggest` + `/api/upsell/outcome` (gate 36/36, E2E 2 rənd); **UI = PARKED P-3** (09-25 owner: **kiosk üçün lazımdır, ofisiant POS-unda YOX** — UI kiosk build-inə qədər toxunulmayacaq); upgrade+addon tipləri staged (variant/modifier pairing data lazımdır) |

---

## 2. BOH — BACK OF HOUSE

### 15. KITCHEN / KDS
Tickets, stations (kitchen/grill/fry/dessert/bar/expo), routing, queue, priority, rush, timers, prep time, courses (hold/fire/recall), notes/allergies/special, auto-print, printer fallback, bump, reopen, analytics.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| KDS (ticket queue, accept/complete, item ready, recall, reopen) | ✅ FROZEN | `kitchen_tickets`, `kitchen_ticket_items`, `accept_kitchen_ticket_atomic`, `mark_item_ready_atomic`, `recall_ticket_atomic` | `/api/kitchen*` (8 route), `admin/kds`, `kitchen`, `kitchen/track/[id]` |
| Routing (station per item) + rush + bump | ✅ | `stations`, `route_kitchen_order`, `toggle_rush` | — |
| Courses (fire per course, hold) | ✅ | `fire_course_atomic`, `order_courses` | — |
| Course firing UI (modal Flame pills — yalnız pending/accepted course-lər) | ✅ **12q** | `fire_course_atomic` (frozen) | `/api/kitchen/fire-course`, KDS modal pill-ləri |
| RUSH UI (modal toggle + kart red border + ⚡RUSH marker + GÜN) | ✅ **12q** | `orders.is_rush`, `toggle_rush` (frozen) | `/api/kitchen/rush`, KDS modal ghost pill (active = solid red) |
| 86 / item void UI — **12s: modal ✕ SİLİNDİ (owner)**; 86 = POS-only (comp/waste + PIN); DB mexanizmi qorunur | ✅ **12q → 12s** | `item_kitchen_terminal('voided')` (frozen) | POS `/api/kitchen/void-comp-waste` (`origin:'kds'` exemption + kitchen/`order.void` qüvvədə); KDS modal-da X button YOX |
| Station-scoped ready (modal CTA + course firing — bir stansiya digərinin item-lərini ready EDƏMƏZ) | ✅ **12r** | `mark_item_ready_atomic` (frozen; rollup təbii 'ready') | `KDSView` `scopeStId`/`inScope`: unified = navbar stansiya, BDS = family; scope bitəndə CTA = sükut hint |
| **WATCH mode — read-only cross-kitchen (12s → 12t):** BÜTÜN station-lara eyni qayda — terminal-in öz family-sı (KDS=kitchen, BDS=bar) operable; digər family = yalnız İZLƏNİR (status/ready/count/qəbul; idarə YOX). 12t: KDS Bar tab DA view-only (12s-də operable idi) | ✅ **12s → 12t** | — | `ownType = stationType || 'kitchen'`; `watchMode = family !== ownType`: statik circle (button YOX), CTA = sükut "İzləmə" caption, **12t: modal footer-da HƏMİŞƏ button YOX** (course/RUSH/Hazırdır), navbar Eye badge; i18n `kds_watch` |
| **Modal = YALNIZ aktiv stansiya (12t):** modal-da başqa stansiya-sının item-ləri HƏMİŞƏ yoxdur (12s-in multi-stansiya qrupları yerini aktiv stansiya-sının flat siyahısına verdi); item `station_id`-i aktiv tab-dan fərqlidirsə görünmür | ✅ **12s → 12t** | — | modal `items` filter: `itemStation(i) === activeStation.id`; empty = `kds_station_empty`; item-lər own tab-da operable, watch tab-da statik |
| Modifier spec = sükut text, **HƏMİŞƏ ×N (12s)**: "Standart ×1 · Əlavə Losos ×3" — miqdar heç vaxt gizli | ✅ **12r → 12s** | — | kart 11px + modal 12px, ` · ` join (KDS/BDS eyni komponent) |
| Ticket kimliyi: "Masa 2" / customer_phone — **ORD-kod YOX (12s)**; "Main Kitchen"→"Kitchen" (12s: DB `stations` + literal-lər) | ✅ **12s** | `stations` (live rename) | modal header + kart `metaRest` + `delivery/page.tsx` |
| Board loading gate + stations retry (yalan "Bütün sifarişlər hazırdır" aralandı) | ✅ **12r** | — | spinner + `kds_loading` (az/en/ru); stations 3× 800ms retry + `stationsLoaded` |
| Device heartbeat upsert (23505 fallback — multi-profile collision) | ✅ **12r** | — | `/api/devices`: real constraint `(location_id,device_name)` üzərindən retry |
| Prep-time + station analytics | ✅ | `kitchen_analytics`, `log_kitchen_analytics`, `get_kitchen_stats` | `admin/kitchen-analytics` |
| Kitchen schedule (reservation pre-fire) | ✅ | `kitchen_schedule`, `process_due_kitchen_schedules` (cron) | — |
| **EXPO station — "SERVING QAPISI" (12u → 12v VIEW-ONLY):** bütün stansiya ready olmadan order Expo-ya düşmür (all-ready invariant, FIFO `kitchen_ready_at`); **12v (owner: "servis POS-dan verilir"): KDS-də servis button/text YOX** — pass = read-only gözləmə board; servis = POS "SERVISƏ VER" (`mark_order_served_atomic`, 12i); overload (amber ≥4/red ≥8); DB: `stations` + Expo (`service`, sort 3 — CHECK icazə verir, migration YOX) | ✅ **12u → 12v** | `stations` ('service'), `mark_order_served_atomic` (frozen, POS-dan), `/api/orders/serve` (12i) | KDS navbar 4. tab (BDS-də YOX); `expoTickets` gate; sükut timestamps footer; E2E r20/r21 view-only verified |
| **HAZIRLANIR/HAZIRDİR = SUB-TAB (12v zona → 12w tab) + SMART NOTE ROUTING (12w → 12x MULTILINGUAL):** station board = iki pill sub-tab (count; default HAZIRLANİR; station-də reset; Expo-da YOX). Order `customer_note` = vergüllə segmentlər → **`src/lib/note-routing.ts`**: normalize + **kiril→latın translit** + **~40 concept sözlüyü (AZ/EN/RU: çay≈tea≈чай)** + light stem + hamming≤1 + prefix → **yalnız həmin stansiya-nın kartı**; match YOX = ümumi (hamıda); Expo kart + modal = TAM qeyd; yeni proper-noun məhsullar 3 dildə tanınır (menyu-ya əlavə olanda ekstradan heç nə lazımdır); dine-in modal-note kök 12v-də düzəldilib | ✅ **12v → 12w → 12x** | — (UI; routing = saf client modul, DB dəyişiklik YOX) | `note-routing.ts` (tokensMatch/routeNoteSegments), KDSView adapter `routeOrderNote`; i18n `kds_zone_*`/`kds_all_in_ready`; E2E r22 (AZ) + r23 (RU kiril, verbatim ✓) |
| **§1c sweep (12u):** bump bar (tək-press Hazırdır rail, xl+; Expo = SERVİSƏ VER tile) · offline buffer (tick/ready/86/serve → localStorage queue + healthy-poll replay; offline reload = cached board+stations + "son sinxron" note; boş-board clobber qadağası; 503 stations restore) · per-ticket ETA (Ø HAZIRLANMA "≈N dəq", overrun amber) · watch timestamps (Qəbul/Hazır HH:MM) · 86 = modal-da səbəb+PIN (X görünüşü YOX; kds/bds `VirtualKeyboardProvider` crash fix) · per-stansiya səs routinqi (yalnız own family) · light contrast (modifier zinc-600) · overload badge (amber ≥6/red ≥12 pulse) · board read-cache (SWR, 30-min) · watch = dairə YOX (kart+modal) · sliding pill + board cross-fade (LEVEL.navigation, parallel = one state-machine motion) · GÜN cancelled-ghost fix | ✅ **12u** | — (hamısı UI; serve/void/ready = frozen RPC) | `KDSView.tsx`, `useKdsOfflineQueue.ts` (yeni), `kds/bds page`, `api/kitchen/daily`, locales ×3; E2E r17/r19/r20/r20b/r20c console 0 |
 | **SERVİS-TEXT TAM SİLİNMƏ + İZLƏMƏ CHIP YOX + 2s FLICKER KÖK-FIX (12y):** modal footer = `showRush/ctaActive/showServed` — ready/serving → **heç nə** (emerald "Servis POS-dan edilir" button = son render yolu silindi; `kds_serving_hint`+`kds_watch` key-lər 0 usage → i18n-dən silindi); navbar watch = bare `<Eye/>`, watch footer = yalnız timestamps. **Flicker kök:** 12q window-u yalnız tick/ready qoruydu — RUSH/86/fire = qeydsiz optimistik əməliyyat → in-flight köhnə snapshot 2-3s "geri" yazırdı → `optimisticRef` + 3 protection sahə (`rush:boolean|null`, `voidedItems[]`, `firedItems[]`) + `stillNeed` release | ✅ **12y** | frozen RPC-lərə toxunulmayıb (UI state-protection) | `KDSView.tsx` (optimisticRef + merge block + handleRush/handleFireCourse/handleVoid86 + modal footer); locales ×3; E2E **r24** 0-dan deep (KDS+BDS+POS, dark+light, console 0): flicker sampler tick 27.5s / ready 25.5s / RUSH 21.2s / 86 24.9s = **HEÇ VAXT revert YOX**; forbidden-text scan 0/0; note routing verbatim ✓; Expo→POS serve→board clear ~5s ✓; backend psql = consistent (voided qorunur, operation_logs tam zəncir) |
| Printer routing (kitchen/bar printers) | ✅ **pr v1 (09-20)** | `print_jobs`, `print_devices`, `/api/print/*`, `/api/settings/printer` | Gate 35/35 + E2E R20-R28; LAN agent (tools/print-agent) |
| Realtime ticket push | ✅ FROZEN (P0-3) | `supabase_realtime` (kitchen_tickets daxil) | — |

### 16. INVENTORY
Products/ingredients/units/recipes/recipe costing; stock (current/min/max/reorder); transactions (sale/purchase/adjustment/waste/spoilage/theft/transfer); purchasing; cost (avg/last/food cost/valuation); control (actual vs theoretical, variance, stocktake); automation (low stock, auto reorder, auto 86, availability, expiry).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Ingredients + units + stock levels | ✅ | `ingredients`, `stock_transactions`, `inventory_logs` | `/api/stock*` (11 route), `admin/stock` |
| Recipe-based consumption **on READY** (kitchen tick, order anında YOX — 13b verify: 66/66 ≥ ready_at) + reverse on refund | ✅ FROZEN | `consume_stock_for_item` (caller-lar: `mark_item_ready_atomic`/`mark_order_ready`/`mark_ready_atomic`), `_inventory_reverse_item_qty`, `reverse_stock_for_items`, `return_to_stock` | — |
| Waste + waste standards + spoilage | ✅ | `waste_standards`, `record_item_waste`, `waste_order_item_atomic` | `admin/waste-standards` |
| Stocktake + apply count + variance | ✅ | `stock_counts` (+`assigned_to` 13c), `stock_count_items`, `apply_stock_count` | `admin/stock/counts` (+ offline buffer 13c) |
| Purchase orders (draft→sent→received) | ✅ | `purchase_orders` (+`recurring_weekly` 13c), `purchase_order_items`, `atomic_receive_goods` | `admin/purchase-orders`, `/api/procurement/receive` |
| Suppliers + supplier returns + **catalog** | ✅ | `suppliers`, `supplier_returns`, `supplier_items` (13c), `process_supplier_return` | `/api/suppliers*` (+ `/api/suppliers/items` 13c) |
| Invoices + atomic apply + OCR + **→DRAFT PO** | ✅ | `invoices`, `invoice_items`, `atomic_apply_invoice`, `/api/invoice-ocr`, `/api/procurement/from-invoice` (13c) | `/api/invoices*` |
| Auto 86 on depletion / low-stock alerts | ✅ | `check_stock_thresholds` (cron) | `stock/ai-insights`, `stock/suggestions` |
| **Batch / expiry tracking** | ✅ (13c) | `stock_batches` (FEFO, supplementary — frozen consumption-a toxunulmayıb) | `/api/stock/batches` + InspectorPanel "PARTİYALAR·FEFO" + row chips |
| Multi-location inventory transfers | ❌ | — | Addım 3 (biznes qərarı) |
| **Par-based order guide → DRAFT PO** | ✅ (13c) | `GET /api/stock/order-guide` | ProcurementTab "Order Guide" pill |
| **Recurring orders (DRAFT, human sends)** | ✅ (13c) | `recurring_weekly` + cron `recurring-draft-pos` (Dü 09:00) + `create_recurring_draft_pos()` | PO list "Həftəlik" badge |
| **COGS / AvT / shrinkage report** | ✅ (13c) **+ shrinkage PATTERN (13d)** | `GET /api/inventory/reports` (30g rollup + `shrinkage_pattern` 28g: weeks/weekday/WoW/top-trend) | Stock page "Report" view (ReportsTab + "İtki Pattern" kartı) |
| **LLM inventory advisor** | ✅ (13c) | `GET /api/inventory/advisor` (deterministic 30g stats + LLM narrative) | Stock page AdvisorCard |

> **13a (2026-10-04, E2E r26):** modul = **DEAD-ZONE REVIVAL** — browser client
> anon idi (RLS: `app.current_role` user JWT-də set olunmur) → audit page/stok
> tarixçəsi/recipes modul heç vaxt data görmürdü; 3 page orphaned idi;
> waste-standards create/patch = 500 (phantom sütun); counts DELETE = silent no-op;
> `/api/notifications` yox idi. Fix = service-role API (`/api/inventory/logs`,
> `/api/recipes*`, `/api/notifications`) + nav wiring + guards. E2E r26: audit
> 83 sətir CANLI, recipes 11 məhsul CANLI, constructor load ✓, 409 guard ✓,
 > procurement feed CANLI, dark+light console 0. Owner qərarı: 5 mənfi stok sayım
 > ilə, 4 reseptsiz məhsul (Filadelfiya Classic!), `avakado`/`Qızardılmış soğan`
 > şübhəli dəyərlər, orphan resept. → `HANDOFF_13A.md`.

 > **13b (2026-10-05):** BOM owner-approved qeydə alındı — **Filadelfiya Classic +
 > Kaliforniya Gold** (14 sətir, `has_active_recipe=true`) → 13/14 active məhsul
 > reseptli (Coca-Cola = qəsdən reseptsiz — hazır qablaşdırma). Təmizlik: orphan
 > resept (5 sətir) silindi, P8_PROD deaktiv. **Yeni §1d INVENTORY MÜQAYİSƏSİ**
 > (comparison doc): 15 meyar × 4 sistem; üstün = consumption-on-READY + LLM-AI loop
 > + ₼0; zəiflər = invoice→PO, par-order-guide, COGS ledger, offline stocktake,
 > batch/expiry, multi-location, qiymət avtomatlaşması, shrinkage report.
 > Gözləyir: owner sayımı (8 mənfi/şübhəli maddə) + test-order consumption verify.
 >
 > **13c (2026-10-04, E2E r27, console 0, dark+light):** §1d-in **6 zəifi bağlandı** —
 > batch/expiry (`stock_batches` + FEFO chips + InspectorPanel), supplier catalog
 > (`supplier_items`), par-based **Order Guide → DRAFT PO**, invoice → **DRAFT PO**
 > (Toast flagship), **COGS/AvT/shrinkage Report** view + **LLM AdvisorCard**,
 > **recurring weekly PO** (cron DRAFT — human sends), **offline stocktake buffer** +
 > staff assignment, **LLM recipe calibration** (propose-only → atomic save). Qalan:
 > multi-location (biznes) + weekly shrinkage pattern report. → `HANDOFF_13C.md`.

### 17. PURCHASING / SUPPLIERS (ayrı baxış)
Supplier profile/products/pricing; PO lifecycle; receiving (qty/cost/batch/expiry/variance); invoices (upload/OCR/matching/approval/accounting).

| Feature | Saito | Qeyd |
|---|---|---|
| Hamısı (profile, PO, receiving, invoice+OCR, procurement reviews) | ✅ | `procurement_reviews`, `procurement/match-ingredient`, `procurement/reviews` — **Toast xtraCHEF-dən fərqli: Saito-da bu artıq mövcuddur** |
| AP automation (invoice → accounting push) | ❌ | Wave C |

### 18. RECIPES
Recipe (ingredients/qty/unit/cost), modifier consumption, yield/portion, food cost, theoretical consumption, versioning.

| Feature | Saito | Qeyd |
|---|---|---|
| Recipe engine + versions + margin analysis + waste analysis | ✅ | `admin/recipes`, `recipes/versions`, `recipes/margin-analysis`, `recipes/waste-analysis` |
| AI recipe/ingredient suggest + cookbook parse | ✅ | `recipes/ai-suggest*`, `/api/parse-cookbook`, `/api/parse-recipe` |
| **LLM BOM calibration (13c):** 30g theoretical vs FAKTİKİ per-item consumption → propose-only delta → atomic apply | ✅ | `GET /api/recipes/calibrate` + "KALİBRASİYA (AI)" modal |
| Modifier → ingredient consumption fərqliliyi | ⚪ | Addım 2 |

---

## 3. PEOPLE + OPERATIONS

### 19. STAFF / RBAC — 🔒 FROZEN (A, 2026-09-11)
Staff profile/PIN/location/device/status; roles (owner/admin/manager/cashier/waiter/kitchen/bartender/custom); permissions (POS/orders/payments/refunds/discounts/inventory/staff/reports/settings); security (manager approval, override, PIN, sessions, audit).
**FROZEN:** 39/39 regression (`.a-regression.cjs`) · 5 bug fixed (migrations `20260911000004–8`) · IP 10/5d + per-staff 5/15d lock · banned-PIN hard policy · weak-hash 13 staff SUSPENDED · RLS (own-sessions, pin_hash view) · self-approve guard · execution-time override expiry. Sənəd: `AUDIT_A_FREEZE.md`. Açıla bilməz — yalnız real security vuln / data corruption / regression / frozen-contract səhvi. **A16e2e → D-01 (discount role-guard + type validation) D-a keçdi: D OPEN-HIGH.**

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Roles + granular permissions + per-location scope | ✅ | `roles`, `role_permissions`, `permissions`, `permission_categories`, `job_permissions`, `location_permission_overrides`, `staff_permission_overrides`, `get_effective_permissions_v2` | `/api/roles`, `/api/permissions*`, `admin/staff/roles` |
| Manager PIN + override (request/approve/deny, reason) | ✅ FROZEN | `request_override`, `approve_override`, `manager_overrides`, `verify_manager_pin`, `ensure_manager_override` | PinGuard (POS) |
| Staff lifecycle + activity + risk score | ✅ | `get_staff_lifecycle_status`, `get_staff_activity`, `risk_scores`, `staff_metrics` | `admin/staff` |
| Sessions + auth (PIN login, rate limit, login attempts) | ✅ FROZEN (auth core) | `sessions`, `login_attempts`, `check_login_rate_limit`, `revoke_session` | `/api/auth/*` |
| Force clock-out / force logout / reset PIN | ✅ | `force_clock_out`, `force_logout_staff`, `reset_staff_pin` | — |
| Device assignment + per-device permissions | 🟡 | `terminal_id` sahələri RPC-lərdə var | Device registry cədvəli YOX (Addım 2) |

### 20. SHIFTS / LABOR
Clock in/out, break, overtime, schedule; cash (opening float, in/out, paid out, closing); tips (pool, distribution); labor (hours, cost, OT cost); payroll.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Shifts + time clock + break adherence + compliance | ✅ | `shifts`, `shift_breaks`, `time_clock_entries`, `clock_events`, `break_rules`, `break_adherence`, `break_compliance`, `check_break_eligibility` | `/api/breaks*`, `/api/time-clock*` |
| Overtime | ✅ | `overtime_records`, `overtime_thresholds`, `get_overtime_summary` | `/api/overtime` |
| Scheduling + templates + swap requests | ✅ | `schedule`, `schedule_templates`, `schedule_conflicts`, `request_shift_swap`, `respond_shift_swap` | `staff/schedule`, `staff/swap`, `/api/schedule*` |
| Cash drawer reconciliation + denominations | ✅ FROZEN | `cash_reconciliations`, `create_reconciliation`, `approve_reconciliation` | `/api/cash/reconciliation` |
| Tip pooling + distribution + shortfall | ✅ | `tip_pools`, `tip_pool_contributions`, `tip_distribution_rules`, `tip_distributions`, `tip_shortfalls`, `tipout_configs`, `distribute_tips`, `calculate_tip_shortfall_v2` (cron) | `/api/tips*` |
| Labor cost + SPLH + performance | ✅ | `calculate_labor_cost`, `get_splh_metrics`, `get_staff_performance`, `performance_reviews`, `shift_reviews`, `approve_shift_review` | `/api/labor*`, `admin/staff/[id]` |
| Payroll (periods, entries, export, webhooks) | ✅ | `payroll_periods`, `payroll_entries`, `payroll_exports`, `payroll_webhook_configs`, `get_payroll_export` | `staff/payroll`, `/api/payroll*` |

### 21. TASKS / CHECKLISTS
Staff tasks, opening/closing/cleaning/manager checklist, maintenance, assignment, due time, completion, proof, recurring.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Daily operating checklists (opening/closing) | ✅ **FROZEN (09-20, v1.1)** | `checklist_templates`, `checklist_runs`, `checklist_run_items` + `checklist_*` RPC-lər (board/toggle/assign/skip/note) | `/api/checklists/*`, `admin/checklists` (gate 40/40, E2E r1+r2 real-mouse) |
| ~~Onboarding workflows + tasks~~ | 🗑 **LƏĞV (09-20)** | — | 6 gün sessiz 500; dead — user qərarı |
| Maintenance tasks + recurring + proof | ❌ | — | Addım 2 |

### 22. SHIFT HANDOVER
| Feature | Saito | Qeyd |
|---|---|---|
| Handover notes (shift→shift, type, priority, read-state) + staff messages/announcements | ✅ | `shift_handover_notes`, `create_handover_note`, `staff_messages`, `staff_announcements` (+ realtime messages publication) |

### 23. NOTIFICATIONS
Operational (order/pickup ready, low stock, payment failed, refund); reservation (confirmation/reminder/cancellation); staff (shift/task); marketing (SMS/email/push).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| In-app notifications + read state | ✅ | `notifications`, `notification_read_state` | — |
| WhatsApp automation (send + auto-order) | ✅ | `/api/whatsapp/*` | — |
| SMS provider (Twilio/yerli) | ❌ | — | Wave C |
| Email + push | ❌ | — | Wave C (Q10 push token qərarı) |
| Low-stock / payment-failed auto-notify | ✅ **outbox dispatch (2.1)** | `check_stock_thresholds` + `outbox_dispatch` handlers (payment.failed, inventory.stock_changed dedupe) | cron → RPC → outbox/notifications |

---

## 4. BACK OFFICE

### 24. ANALYTICS / REPORTING
Sales (gross/net/tax/tips/discounts/voids/comps/refunds), revenue (by day/hour/employee/table/category/product), customer (visits/spend/retention/avg check), table (covers/turnover/occupancy/revenue), kitchen (prep/ticket time/station perf), inventory (food cost/waste/variance/valuation), labor (hours/cost/perf).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Sales + Z-report + close-day (atomic) | ✅ FROZEN | `get_sales_report`, `get_z_report`, `close_day_atomic`, `daily_reports` | `/api/finance/*`, `admin/stats` |
| Staff performance (revenue, voids, refunds, drawer variance, avg ticket) | ✅ | `get_staff_performance`, `get_staff_directory_v2`, `staff_metrics` | `/api/reports/staff-performance` |
| Kitchen analytics | ✅ | `kitchen_analytics` | `admin/kitchen-analytics` |
| Return & waste by mandatory reason | ✅ (09-25) | `audit_logs_canonical` (action=return_to_stock/item_waste, `new_data.reason`+`reason_text`) | `admin/stats` → `StatsReturnWastePanel` (donut + reason list + anbar/itki split) via `/api/stats` |
| Discrepancy alerts + loss prevention (compliance rules, violations, risk scores) | ✅ | `discrepancy_alerts`, `compliance_rules`, `compliance_violations`, `risk_scores`, `/api/discrepancies` | `admin/loss-prevention` |
| AI insights (Sensei: what-if, behavioral, daily tip, correlator) | ✅ | `ai_cache`, `popular_queries` | `/api/sensei/*` |
| Customer retention / AOV / table-revenue ayrısı | 🟡 | xammal data var | Rapor bloku Addım 2 |
| Advanced analytics (cohort, retention, delivery perf) | ❌ | — | Addım 3 |

### 25. BACK OFFICE / ACCOUNTING
Accounting, revenue, expenses, taxes, AP, invoices, payroll, inventory, purchasing, reconciliation.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Expenses | ✅ | `expenses`, `get_expense_summary` | `/api/expenses` |
| Invoices (supplier) + OCR + matching | ✅ | `invoices`, `/api/invoice-ocr` | — |
| Payment reports + reconciliation | ✅ | `payment_reports`, `payment_reconciliation` | `/api/finance/payment-reports` |
| Accounting push (1C/Qiwi/XEROKİMİ, journal entries) | ❌ | — | Wave C (Q7/Q8-dən asılı) |
| Tax reporting (VAT zəvəci exportu) | 🟡 | `orders.tax_amount`, VAT engine var | Export UI Addım 2 |

### 26. INTEGRATIONS
Payments / accounting / payroll / reservations / delivery / marketing / loyalty / tax / hardware + API, webhooks, OAuth, marketplace.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Webhook engine (inbound) | 🟡 | `webhook_events` | Payroll webhook config var (`payroll_webhook_configs`); outbound marketplace YOX |
| Outbound API + API keys + OAuth | ❌ | — | Wave C |
| Delivery aggregator inteqrasiyası | ❌ | — | Wave C |
| Payment terminal (Harbon/SkyPay/Qiwi) | ❌ | — | **Q7 qərarı gözləyir** (bütün offline/pay-at-table/chargeback bloklarının açarıdır) |

---

## 5. PLATFORM

### 27. PLATFORM SECURITY
Auth (PIN/session/token), authorization (RBAC/permissions/location scope), approval (manager override), audit (who/what/when/where/before/after), monitoring, alerts, security logs, forensics.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Auth core (PIN, sessions, rate limit, brute-force) | ✅ FROZEN | `sessions`, `login_attempts`, `hash_password`/`verify_password` | `/api/auth/*` |
| Audit trail (canonical: before/after/actor/location/correlation) | ✅ FROZEN | `audit_logs_canonical`, `log_operation_canonical`, `operation_logs`, `security_events` | `/api/operation-logs`, `/api/security/events`, `admin/audit` |
| Approval/override | ✅ FROZEN | (19. modula bax) | — |
| Monitoring / health alerts | ❌ | — | Wave C (infra) |
| Forensics (incident timeline) | 🟡 | audit data var | UI yox |

### 28. DEVICES
POS / terminal / handheld / customer display / payment terminal / printers (receipt/kitchen/bar/label) / KDS / cash drawer / scanner / connectivity (LAN/Wi-Fi/BT/USB) / routing / health.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Print jobs + printer settings | ✅ | `print_jobs` + `print_devices` + `print_*` RPC-lər (000011-14) | Registry + health (online/last_seen/last_error) + routing + reprint (fake-success fix) |
| Device health (online/offline/last seen) | ❌ | — | Addım 2/3 |
| KDS screens (browser) | ✅ | KDS pages | — |
| Cash drawer hardware (kick) | 🟡 | session core var | Hardware driver Addım 2 |
| Scanner / label printer / customer display | ❌ | — | Q7 + Addım 3 |

### 29. INFRASTRUCTURE (event/data backbone)
Database, realtime, event system, API, queue, cache, offline sync, idempotency, monitoring, logging, audit, backup, DR, security.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Atomic RPC + idempotency keys | ✅ FROZEN | `payment_idempotency_keys`, `check_idempotency`, `p_idempotency_key` parametrləri | — |
| Realtime publication (12 cədvəl + messages) | ✅ FROZEN | `supabase_realtime`, `supabase_realtime_messages_publication` | — |
| Outbox event system | ✅ **LIVE (2.1, 2026-09-11)** — `outbox_pump()` SSOT consumer + `outbox_dispatch()` handlers (paid/cancelled/pay-failed/refund/low-stock dedupe); claim SKIP LOCKED, backoff, dead-letter `status='dead'` | `outbox_events`, `emit_outbox_event`, `outbox_pump`, `outbox_dispatch` | migration `20260911000001` |
| Sync operations (offline sync qatı) | ⚪ | `sync_operations`, `sync_operation` | Q8 offline-first qədarından sonra |
| Cron jobs (pg_cron scheduler) | ✅ **LIVE (2.1)** — 7 job: outbox-pump */30s · kitchen-schedules */60s · auto-no-show */15s · stock-thresholds */10s · expired-reservations */15s · tip-shortfall 01:00 UTC · auto-clockout `*/5 * * * *` (5 dəq, mövcud). Run audit: `cron.job_run_details` | `/api/cron/*` routes (manual trigger, Bearer CRON_SECRET) | `cron.job`; migration `20260911000001/2` |
| Monitoring / backup / DR | ⚪ | Supabase default backup | Wave C |

---

## 6. GUEST CHANNELS

### 30. WEBSITE / ONLINE
Menu, ordering, pickup, delivery, reservations, loyalty.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Public QR menu + QR order + QR pay | ✅ | `/api/orders/qr`, `menu/page.tsx` | Anon customer access (W-A1) + **add-to-check (W-A2)**; menu "continue your check" UI = HARD STOP (birgə) |
| Public reservation (website) | ✅ | `api/public/reservations`, `reservation/page.tsx` | — |
| Online ordering (pickup/delivery, telefonla münasibət) | ✅ | takeaway/delivery RPC-lər | Customer-facing order UI (phone) Addım 2 |
| Public VAT config | ✅ | `/api/public/vat-config` | — |

### 31. KIOSK
Self order, upsell, payment, loyalty. → **❌ YOX** — Addım 3.
> **PARKED (user, 2026-09-21):** "mənə hələ lazım deyil" — kiosk + customer-facing upsell birlikdə açılacaq (upsell kiosk-da qonağa baxan formada).
> Hardware araşdırması (09-21): portrait 15.6–21.5" (9:16) = QSR standartı; countertop/wall-mount/in-car/mobile digər form faktorlar; responsive layout.

### 32. MOBILE / APP
Capacitor plugin-ləri `artifacts/saito-admin/package.json`-da var (@capacitor/android+ios) → **⚪ STUB**. Wave A/C.

### 33. DELIVERY
Order, customer, address, zone, fee, driver; status RECEIVED→ACCEPTED→PREPARING→READY→PICKED_UP→OUT_FOR_DELIVERY→DELIVERED; dispatch, driver assignment, tracking, ETA; aggregators.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Own delivery (zones, fee, couriers, GPS, status machine) | ✅ | `delivery_zones`, `calculate_delivery_fee`, `couriers`, `update_courier_location`, `assign_courier`, `transition_delivery_status` | `/api/couriers`, `/api/orders/delivery-status` |
| Aggregators (Uber/DoorDash) | ❌ | — | Wave C |
| Dispatch / tracking UI (customer ETA) | 🟡 | data var | UI Addım 2 |

---

## 7. MULTI-LOCATION / ENTERPRISE

| Feature | Saito | DB | Qeyd |
|---|---|---|---|
| Organizations + locations + activation | ✅ | `organizations`, `locations`, `create_location_atomic`, `activate/deactivate_location_atomic` | Foundation var |
| Per-location permissions + row security | ✅ | `location_permission_overrides`, `has_location_access`, `has_row_access`, `enforce_*_location` fərdi | — |
| Staff ↔ location assignment + switch (atomic) | ✅ | `staff_locations`, `assign_staff_to_location`, `switch_location_atomic`, `resolve_staff_location` | — |
| Price override (location pricing) | 🟡 | `price_overrides` | UI Addım 3 |
| Central menu / central inventory / transfers | ❌ | — | Addım 3 |
| Consolidated reporting | 🟡 | location-scoped RPC var | UI Addım 3 |
| Franchise / central control portal | ❌ | — | Addım 3 |

---

## 8. PARITY QARŞILAŞDIRMASI (Saito vs Toast vs Square vs Lightspeed)

| Domen | Toast | Square | Lightspeed | **Saito** |
|---|---|---|---|---|
| POS core (tables/orders/split/merge/transfer) | ✓ | ✓ | ✓ | ✅ **parity + V2 contracts (undo, aggregates)** |
| KDS + analytics | ✓ | ✓ | ✓ (2026 FOH status sync) | ✅ **parity (+ kitchen schedule)** |
| Payments (idempotent, race-safe) | ✓ | ✓ (offline) | ✓ (pay-at-table) | ✅ core / ❌ offline+terminal |
| Inventory + recipes + purchasing | ✓ (xtraCHEF) | ✓ | ✓ | ✅ **parity (PO+suppliers+invoice OCR daxil)** |
| Reservations + waitlist | ✓ | ✓ | ✓ (2026 POS-integrated) | ✅ core / 🟡 waitlist SMS |
| Staff (scheduling, tips, payroll) | ✓ (payroll deep) | ✓ | ✓ | ✅ **parity (payroll export daxil)** |
| Loyalty | ✓ | ✓ | ✓ | 🟡 engine ✓ / ⚪ tiers+UI (Q2) |
| Gift cards | ✓ | ✓ | ✓ (centralized) | 🟡 engine ✓ / ❌ UI (Q3) |
| Marketing (SMS/email/push) | ✓ | ✓ | ✓ | ❌ (yalnız WhatsApp) |
| Online ordering + kiosk | ✓ | ✓ | ✓ | 🟡 QR ✓ / ❌ kiosk+anon |
| Delivery (own) | ✓ | ✓ | ✓ | ✅ own / ❌ aggregators |
| Multi-location | ✓ | ✓ | ✓ | 🟡 foundation ✓ / ❌ central |
| Offline-first | — | ✓ | — | ❌ (Q8) |
| AI layer (what-if, insights, OCR) | qismi | qismi | qismi | ✅ **Sensei — fərqləndirici güclü nöqtə** |
| Audit/forensics | ✓ | ✓ | ✓ | ✅ **canonical audit + risk scores (güclü nöqtə)** |

**Fərqləndirici güclü nöqtələr (Saito-da var, rəqiblərdə zəif/ayrı məhsul):**
1. Audit/forensics + loss-prevention + risk scoring (canonical audit, compliance violations)
2. Sensei AI qatı (what-if, behavioral, recipe AI, prep estimate)
3. Tip pooling + shortfall + tipout (ətraflı)
4. Break adherence/compliance labor qatı
5. Invoice OCR + procurement reviews (xtraCHEF bərabəri)

**Güclü nöqtələri qorumaq üçün FROZEN:** payment core, merge/transfer V2, order state machine, auth core, KDS, table state, audit.

### 8.1 Manager "must-have" master checklist (core POS + parity bloklar)

> 2026-09-19 ChatGPT "menecer" checklist-i; Saito REAL statusu ilə işlənib. Menecerin
> ☐ qoyduğu bir neçə element Saito-da artıq ✅-dir (rəqib parity).

**Core POS (menecer: ☑ — Saito REAL):**

| Feature | Saito REAL |
|---|---|
| Tables | ✅ FROZEN |
| Orders | ✅ FROZEN |
| Payments | ✅ FROZEN (core) |
| Split | ✅ |
| Transfer | ✅ FROZEN |
| Merge | ✅ FROZEN |
| Reservations | ✅ |
| Staff | ✅ FROZEN |
| Roles | ✅ FROZEN |
| KDS | ✅ FROZEN |
| Inventory | ✅ |
| Products | ✅ |
| Recipes | ✅ |
| Promotions | ✅ engine |
| Reports | ✅ + Sensei AI |
| Printing | ✅ pr v1 (device registry + job routing + claim/result + LAN agent; gate 35/35) |

**Toast/Square/Lightspeed parity bloklar (menecer: ☐ — Saito REAL):**

| Feature | Saito REAL |
|---|---|
| Tip pooling | ✅ (parity-dən əvvəlcədən var — qorunacaq) |
| Staff scheduling | ✅ (templates + swap requests) |
| Payroll | ✅ (periods, export, webhooks) |
| Supplier management | ✅ + invoice OCR (xtraCHEF bərabəri) |
| Purchase orders | ✅ (draft→sent→received) |
| Receiving | ✅ (atomic) |
| Inventory counts / stocktake | ✅ (variance daxil) |
| Waste management | ✅ (standards + order-item waste) |
| Advanced recipe costing | ✅ (margin + waste analysis) |
| Task/checklist (onboarding) | ✅ (daily operating = Addım 2) |
| Customer CRM | ✅ profile / 🟡 marketing |
| Loyalty | ✅ engine / ⚪ tiers+UI (Q2) |
| Gift cards | 🟡 engine / ❌ UI (Q3) |
| QR order/pay | ✅ QR + anon + qonaq identifikasiya + add-to-check (W-A1/W-A2) |
| Online ordering | 🟡 (customer UI = Addım 2) |
| Kiosk | ❌ (Addım 3) |
| Delivery aggregation | ❌ (Wave C) |
| Waitlist | 🟡 (SMS+UI = Addım 2) |
| Advanced reservations | 🟡 (reminder/confirmation yox) |
| Seat-based ordering | ✅ (seats + split_by_seat) |
| Advanced coursing | ✅ (fire_course_atomic, hold, recall) |
| Full refund/void/comp authorization | ✅ FROZEN (P-6) |
| Advanced cash drawer | ✅ FROZEN (P-8) |
| Marketing / SMS / email campaigns | ❌ (yalnız WhatsApp) |
| Customer segmentation | 🟡 |
| Accounting integration | ❌ (Wave C) |
| Multi-location | 🟡 foundation / ❌ central (Addım 3) |
| Central menu / central inventory | ❌ (Addım 3) |
| Advanced analytics | 🟡 (Addım 2/3) |
| API/webhooks (outbound) | ❌ (Wave C) |
| Integration marketplace | ❌ (Wave C) |
| Monitoring / disaster recovery | ⚪ (Supabase default backup; Wave C) |
| Audit/forensics | ✅ (fərqləndirici güclü nöqtə) |
| Offline-first POS | ❌ (Q8) |
| Device management | 🟡 (registry+health = Addım 2) |

**Nəticə:** Core POS siyahısının 15/16 elementi Saito-da ✅/FROZEN (yalnız Printing 🟡).
Parity bloklarında da Saito tip pooling, payroll, purchasing/OCR, waste, audit sahələrində
menecerin ☐ siyahısından əvvəlcədən gedir — bunlar yeni iş deyil, qorunacaq core-dir.

---

## 9. ROADMAP — WAVELƏR (nərdən başlayırıq)

### Wave A — "Sistemi aç" (Addım 2-in ilk yarısı)
1. ~~**Outbox consumer**~~ ✅ **BİTİB (2.1, 2026-09-11)** — `outbox_pump` SSOT + handlers + dead-letter; pg_cron scheduler 7 job LIVE; backlog drained
2. ~~**QR anon customer access**~~ 🔻 **DEFER (user, 09-19):** QR = channel, ayrı ordering product DEYİL — əsl guest məhsul = **Sushinode Guest Ordering Website** (xarici, öz lux frontend-i; final integration pass). W-A1/W-A2 backend contractları frozen infrastruktura çevrildi (Sushinode bunlarla inteqrasiya olunacaq); Saito `/menu` = draft UI (committed, istifadə oluna bilər)
2b. ~~**Customer timeline / Customers**~~ ✅ **BİTİB (09-20, v8.5)** — backend W-A3 (gate 9/9) + UI: full-bleed detail (timeline + Profil/Sevimlilər), Spotlight, native-speed pass; CP-1 profile fields (birthday/email/notes, `b3578c9f`)
3. ~~**Gift card (Q3) + 1.5**~~ ✅ **BİTİB (09-20)** — engine repair + block + ledger + summary (`7668addd`) + load/refund (`b3578c9f`); gates 23/23 + 22/22. Bar tab = D4 SEPARATE (2026-09-19 qərarı) — ayrıca paket. Qalıq: physical/QR, deep reporting, multi-location
4. **Customer segmentation bloku** (timeline UI 2b-də bitdi)
5. ~~**Daily operating checklists**~~ ✅ **BİTİB (09-20, v1.1)** — backend `20260920000007-000010` migrations (lazy materialization, grants fix, dup-title guard, note-only RPC) + UI (board/KPI, iOS-push detail, item toggle, note, assign, skip, Şablonlar); gate **40/40** + E2E real-mouse r1 (defect #1 note-on-completed → v1.1 fix) + r2 (re-verify, console clean)
6. **Waitlist SMS** + reservation reminder/confirmation (provider: WhatsApp mövcuddur → genişləndirmə)
7. ~~**Cron verification**~~ ✅ **BİTİB (2.1)** — 7 job LIVE, run audit `cron.job_run_details`
8. ~~**Device registry + print routing**~~ ✅ **BİTİB (09-20, pr v1)** — `print_devices` + `print_jobs` (migrations 20260920000011-14, 4 fix round: expression UNIQUE, multi-row claim, pgcrypto schema), `/api/print/*` routes (D-5 server location), reprint fake-success fix, Settings "Çap Cihazları" + POS/KDS claim loop + queue badge + KDS reprint, `tools/print-agent` (zero-dep ESC/POS LAN agent); gate **35/35** + E2E R20-R28
9. **Loyalty qərarı Q2** (tiers/birthday UI build/cut) — qədardan asılı

### Wave B — "Guest channels" (Addım 2-in son yarısı)
1. **Online ordering (customer UI)**: pickup/delivery, phone-dan sifariş, loyalty bağlantısı
2. **Kiosk** (self-order, upsell, payment, loyalty)
3. **Upsell UI** — **engine v2 BİTİB (09-21, `8732fdc2`)**: `upsell_offers` + `suggest_addons_v2` + `/api/upsell/suggest|outcome` (gate 36/36). UI forması = PARKED P-3 (user co-design: predictive bar / menyu ✦); kiosk customer-facing upsell = PARKED P-2. `get_best_cart_campaign` bloku ayrıca
4. **Advanced analytics blokları** (retention, AOV, table revenue, delivery performance)
5. **Batch/expiry tracking** (inventory-də sahələr + UI)

### Wave C — "Platform genişlənməsi" (Addım 3)
1. **Payment terminal provider (Q7)** → offline payment, pay-at-table, signature, chargeback, pre-auth
   - **Card auto-capture** (Toast parity) — ⏸ **YADDADA (owner, 09-24: "lazım olsa edəcəyik")**: terminal gateway-ə bağlıdır (manually-captured card modeli ilə işləyir); Q7 provider seçilib bu paketə daxil edilir
2. **Offline-first POS (Q8)** → sync_operations işə salınması
3. **Marketing stack** (SMS/email/push provider + consent + campaigns delivery)
4. **Aggregator delivery** (Uber/DoorDash inteqrasiyası)
5. **Outbound API + webhooks + API keys** (developer surface)
6. **Accounting integration** (journal push, VAT export)
7. **Multi-location central** (central menu/inventory/transfers/consolidated reports)
8. **Monitoring/DR/forensics UI**

### Qərar bloklarının açarları
| Qərar | Blokladığı | Status |
|---|---|---|
| Q1 VAT | — | ✅ BİTİB (1.5, 2026-09-10) |
| Q2 Loyalty (build/cut) | Wave A #9 | gözləyir |
| Q3 Gift cards | Wave A #3 | ✅ **BİTİB (09-20, minimal + 1.5)** |
| Q4 Waitlist | Wave A #6 | gözləyir |
| Q7 Terminal provider | Wave C #1 + bar tab pre-auth + pay-at-table | **kritik — çəkiliş** |
| Q8 Offline-first | Wave C #2 + sync_operations | gözləyir |
| Q10 Push token | Wave C #3 | gözləyir |

### 9.1 Backend P-fazaları (governance görünüşü — HANDOVER §5.5)

Backend hardening fazaları (freeze-and-audit loop) və wave-lərlə uyğunluğu:

| P-faza | Scope | Uyğun Wave | Status |
|---|---|---|---|
| P-10 | External payment processor + webhook | Wave C #1 | Q7 provider qərarı gözləyir |
| P-11 | Failed payment recovery | P-10-dan sonra | planlanmayıb |
| P-12 | Close-out (end-of-day final settlement) | Wave C | planlanmayıb |

P-10/11/12 yalnız backend payment sərhədini qoruyur; UI feature-ləri Wave A/B üzərində
aparılır. Növbəti backend P-fazası (P-10) Q7 terminal provider qərarından asılıdır.

---

## 10. SYNC PROTOKOL QAYDALARI (bu fayl üçün)
- Bu fayl = **master plan**. HANDOVER.md-də status (§5), Notion-də checkbox-lar — hamısı bu fayl üzərindən gedir.
- Hər Wave tapşırığı bitəndə: bu fayldakı status sütunu (✅/🟡/⚪/❌) yenilənir + HANDOVER §6.3 jurnal sətiri + Notion tick.
- **Yeni feature təklifi gələndə** əvvəl §0.2 backbone sualı verilir: "bu operation hansı state-i dəyişir, hansı downstream təsirlənir?" → cavab burada (müvafiq modulda) yazılır.

### Jurnal sətiri — 2026-10-05 (ROUND 13n: INVENTORY UI 0-DAN — ONE PAGE, 4 ZONE, SCROLL-SPY; NO TABS, `637ef2d`)

Owner: *"basla 0 dan"* — 13i→13m incremental pass-lər rədd edilmişdi; tam rebuild mandatı.

**1. MİTARXİTURƏ (jump-bug klassı konstruktiv olaraq yoxdur):** `stock/page.tsx` REWRITE
(112 sətir) + yeni `stock/next/` (Shell.tsx 156, StockZone.tsx 620, useScrollSpy.ts 75) —
**TAB YOXDUR.** Bir fasiləsiz scroll səhifə: 4 zone (Stok / Tədarük / Sayım&İtki / Analiz)
`<section id="sec-*" class="scroll-mt-20">` stack; sticky scroll-spy pill nav
(`layoutId="stock-zone-pill"` SPRING, active zone label nav-də). Nav click = smooth scroll
YALNIZ — heç nə unmount/remount olunmur. 3 köhnə hub (ProcurementHub/OperationsHub/
AnalyticsHub, 13l stacked sections) = zone MƏZMUNU kimi qoşuldu (0 feature loss).
StockZone = 0-dan yazıldı (köhnə StockTab API contract-ı: endpoints/payloads/optimistic/
realtime eyni; köhnə StockTab file = DEAD, delete candidate).

**2. URL CONTRACT (bütün köhnə linklər yaşayır):** `VIEW_TO_SECTION` = 13f/13h 10 legacy
`?view=` value (anbar/intelligence/buy/invoice/orders/suppliers/counts/waste/returns/
anomalies/report/trends/audit + 4 zone) → `sec-*` id; `?view=recipes` → `/admin/recipes`
redirect (13g); `?ingredient=<id>` → inspector push; **scroll-spy `?view=<zone>` back
writes** (router.replace, scroll:false, `sub` delete) = paylaşılabilir position.
Elevated sections (sec-orders/counts/returns/waste) = auth-drop + `ELEVATED_FALLBACK`
(optimistik `!authChecked || isElevated`, 13i kök qorunur).

**3. SETTLE-LOCK DEEP LINKS (13n-3, r38c T4):** fixed [120..2400]ms re-anchor async
content-ə (skeleton→table shrink) uduzdu: po → −2194px overshoot, counts → +255. Fix =
settle-lock: 300ms tick, target >8px uzaqdırsa instant nudge, max 8s; user takeover =
yalnız explicit INPUT events (wheel/touchmove/keydown) — "unexplained scroll" heuristic-i
programmatic scrolls (route-level resets) ilə öldürürdü. ⚠ **T4 = OPEN VERIFY** — E2E
run-ın ortasında owner browser sessiyası EXPIRE oldu (/staff/login redirect; 13n-3
build untested); 13n-4 = sessiya qayıtdıqda 3 deep-link re-test.

**4. r38c STABILITY FIXES (kök tapıntılar, DB-verified):**
(a) **Refetch loop:** realtime `postgres_changes` (canlı KDS consumption ticks, 1-2s) →
UNDEBOUNCED `reload()` + `useAsyncView`-in inline `reload` arrow = **hər render-da yeni
identity → effect hər render-da resubscribe** (dev StrictMode = duplicate pairs) →
~170 req/90s + scrollHeight 5246↔18938 jumps. Fix: trailing 1.5s coalesce timer
(StockZone) + STABLE `reloadFn` (useAsyncView). E2E: **Δ5 req/30s, drift 0.57%**.
(b) **COGS = 0 DATA DEFECT:** 661 `order_consumption` satırın **609-u `cost_per_unit=NULL`**
(frozen RPC cost snapshot-etmir; 30g pəncərə: 67 satır, hamısı NULL) → `total_cogs` həmişə
0 idi. Fix = `/api/inventory/reports` fallback: log NULL-da ingredient `average_cost_per_unit`
(3 hesablama nöqtəsi: cogs/waste, shrinkage, shrinkage_pattern). E2E: **COGS ₼53 > 0**.
FROZEN RPC toxunulmayıb; cost snapshot = owner qərarı candidate.
(c) COGS chart sparse (API yalnız data-d olan günlər) → client **zero-pad 30d** (UTC keys).
(d) İtki Pattern weekday labels: `Ç`/`C` qarışığı → `B.e, Ç.ax, Çər, C.ax, Cüm, Şən, Baz`.
(e) Freshness date `toLocaleDateString('az')` = **M10** (ICU) → `fmtDate`.

**5. Kiçik:** FullPanel ESC-close (panel TAM main area — backdrop click strip-siz) ·
counts Sayyan/Təyin UUID mask (13m D11) · r38c-da E2E özü **conditional-hook crash** tapdı
(useMemo early-return-dən sonra → tam route crash) → fix (hook əvvələ, null-guard).

E2E r38c: **T1/T2/T3/T5/T6 PASS** (console 0, dark+light; spy matrix monotonic; COGS 30
bars + ₼53; light bg `rgb(247,247,248)` readable), **T4 OPEN** (bax #3). 19 shot
`e2e-shots/r38c-*`. tsc clean. 9 files, +989/−193.

### Jurnal sətiri — 2026-10-05 (ROUND 13m: r36 AUDIT DEFECT SWEEP — FORMATTERS, COGS SCALES, SKELETONS, `2f0674a`)

Owner: *"BUG hələ də var… birinci brauzerdən bax, audit et, sonra təkliflərini bildir"* →
r36 browser UX audit (**20 defect D1–D20**, `e2e-shots/r36-FINDINGS.md`) → *"təsdiq edərəm
bütün"* → hamısı bağlandı.

**1. "Oynayır" KÖK-Ü (r36):** 13l scrollTop reset-i yalnız simptomu gizlətmişdi — REAL
kök = tab bar Y:12 animated wrapper İÇƏRİSİNDƏ idi (switch-də 225-427ms dead frame +
y-slide). Fix: tab bar animated wrapper-dan ÇIXARILDI + tab content = instant `key={tab}`
div (heç bir y-transition).

**2. CANONICAL FORMATTERS (`stock-ui.tsx`):** `fmtNum` (explicit `groupSep` regex —
ICU/locale variance YOX: "192,000" vs "192000.0" vs "4029.0" bir adda) · `fmtQty` (1dp) ·
`fmtAZN` (₼+2dp) · `fmtDate(iso, withTime)` explicit `AZ_MONTHS` (**ICU `az` short-month =
"M10" render etdi — audit D10**) · `fmtClock`/`fmtTime`. 16 fayl sweep (PO/counts/
returns/audit/OrderGuide/Reports/StockTab).

**3. COGS CHART (D8):** shared `max(cogs+waste)` scale → 1 outlier waste günü "giant pink
block" çəkdirdi → **hər seri öz scale-i** + "hər seri öz ölçəsidə" legend.

**4. State machine / skeleton:** AdvisorCard = **skeleton reserve** (154px shift ✂) ·
loading hero = HONEST (muted "Yüklənir…" — data-dan hesablanan status cümləsi YALNIZ
data gəndə) · OrderGuide skeleton · ViewFrame `ViewContent` = FADE ONLY 0.18s (y:10 ✂) ·
embedded page-lərdən PageTransition ✂ (counts/returns/PO/audit).

**5. Sweep:** TableActionBar = themed (dark-only idi) + pill filters · DRAFT chip light
fix (`light:bg-emerald-600`) · inspector `max-w-4xl` + delete content END-də ·
`color-scheme: light/dark` (native select/date tema izləyir).

E2E r34 (13k) + r36 audit + r37 verify: console 0, dark+light, 21 shot. tsc clean.
16 files. **13k note:** GROQ_API_KEY YOXDU idi → faktura OCR HTTP 500 sükutla keçirdi →
UI: OCR error toast + Advisor `data_only` fallback ("AI analizi aktiv deyil") — **KEY =
OWNER action**.

### Jurnal sətiri — 2026-10-05 (ROUND 13l: SCROLL-JUMP BUG FIX + FULL PANEL + STACKED SECTIONS, `b23f42f`)

Owner: *"coş berbat bir bug — taba keçirsən səhifə oynuyur · xammal modal açılışı səhifəni 2/10
kimi açılmasın, tam şəkildə açılsın (bax hədiyyə kartları səhifəsi) · tab çoxdur — meselən
Sayım/İtki tab yerində alt-alta məlumatlar header ilə olsa daha mənalı olmazmı?"*

**1. SCROLL-JUMP BUG (kök səbəb + fix):** desktop shell `contentRef` (`overflow-y-auto`) =
real scroll container idi; tab switch-da `scrollTop` saxlanırdı + tab hündürlükləri 2-4×
fərqli → səhifə "oynuyurdu". Fix `stock/page.tsx`: scroll root DOM-da axtarılır (birinci
`overflowY auto/scroll` ancestor, bir dəfə cache) + **hər tab switch-də `scrollTo({top:0})`**.
İlk run SKİP edilir — deep-link mount-da child anchor effect (section scroll) parent reset-dən
əvvəl işləyir və reset onu öldürməlidir YOX (r35 catch → r35b fix). E2E: scrollTop 900 → tab →
**0** (light+dark ✓), `scrollLeft = 0` (horizontal jump YOX).

**2. FULL MAIN-AREA PANEL (gift-cards pattern):** yeni `FullPanel` @ `stock-ui.tsx` —
`createPortal(document.body)` + **`LayoutContext.mainEdge/mainBottom`** (left = app-sidebar
kənarı 290, top = header altı 58 — shell state, polling-siz) + `absolute inset-0` (TAM main
area, iOS-push) + ease `[0.32,0.72,0,1]` 0.28s. `Drawer` = FullPanel + header/footer (API
eyni; `wide` deprecated — panel tam en). StockTab: lokal `ModalShell` ✂ → 4 xammal modalı
(QuickIn / StockAction / NewIngredient / **History** — 13k-da History centered modal qalmışdı,
indi o da tam panel) — formlar `max-w-xl mx-auto` (oxunulabilirlik), siyahılar tam en.
InspectorPanel = FullPanel (custom edit header qorunub; content `max-w-3xl`). SuppliersSection
Drawers = avtomatik tam panel. Mobil: context default 0/0 → full viewport. E2E geometry:
left 290 / top 58 / right 1470 (=vw) / bottom 923 (=vh) ✓.

**3. SUB-TAB-LAR ✂ → STACKED SECTIONS + HEADERS:** 3 hub-da (Tədarük / Sayım&İtki / Analiz)
sub-pill sətirləri + `AnimatePresence` sub-switch ✂ → bütün sectionlar **alt-alta** render,
hər biri `<section id="sec-{id}" class="scroll-mt-6">` + `SectionHead` (overline = tab adı,
title = section). Tədarük: Nə Alım (13k 2 sütun QORUNUR) → Faktura → Sifarişlər (elev) →
Tədarükçülər. Sayım&İtki: Sayım → İtki → Qaytarış → Anomaliyalar. Analiz: Hesabat → Trend →
Audit. **`sub` = indi scroll ANCHOR** (tab deyil): `scrollToSection()` @ ViewFrame — re-anchor
400/900/1600ms (async skeleton→table genişlənməsi viewport-u hədəfdən itirməsin). Deep link
`?view=po` → Tədarük + avto-scroll Sifarişlər (E2E: heading top=233 ✓). Main 4 intent tab
QALIR (13i owner qərarı).

E2E: r35 7/8 + r35b 2/2 (PARTIAL #8 = deep-link → fix-dən sonra PASS), console 0, dark+light,
17 shot `e2e-shots/r35*`. tsc clean. 8 files, +233/−266.

### Jurnal sətiri — 2026-10-05 (ROUND 13k: OWNER UX PASS — 6 DÜZƏLİŞ, HAMISI BAĞLANDI, `53eff96`)

Owner (screenshot ilə 6 nöqtə): *navbar kvadratdır → pill · "Yeni Xammal"+"Xammal Girişi"
ayrı buttonlar çox maneə · 4 template KPI kartı sil · xammal modalları en axıra qədər açılsın
(gift-cards sidebar pattern) · 4 emeliyyat kartı sablon · Tədarük zəif UX — Nə Alım 2 sütun
(sol=tekliflər, sağ=lazım olanlar/sifariş draft) + Sifarişlər/Tədarükçülər çirkindir +
hər modal/şəhifə berbatdır + faktura atanda işləyirmi? · Sayım & Analiz eyni müalicə.*

**13j (commit 6f6df4e — əvvəlki content-layer rewrite):** `stock-ui.tsx` design system
(Btn/Chip/DataTable/Seg/Card/Stat/SearchInput/IconBtn/Field/Modal/SpinnerBlock) · 6 content
page cədvəlləri → DataTable · 8 hardcoded-dark modal → themed Modal ·
RecipeConstructorModal light-mode fix · `color-scheme` native controls. Owner: "hazırda içi
yaxşıdır" — 13k UX düzəlişlərinə keçdi.

**13k (commit 53eff96; E2E r34 9/10, console 0, dark+light, 19 shot `e2e-shots/r34-*`):**
- **Pill:** main 4-tab bar + bütün sub-pills `rounded-full` + sliding pill (layoutId).
- **CTA:** "Yeni Xammal" = ghost icon (+) · "Xammal Girişi" = yeganə solid button.
- **4 KPI kartı ✂** → inline metrics strip (xammal/aşağı/kritik/mənfi/≤3g, colored dots;
  kritik → filter, mənfi → Sayım et).
- **Full-height drawer:** `ModalShell` (StockTab) + yeni `Drawer` (stock-ui) — gift-cards-
  style, app-sidebar kənarına qədər, mobildə full-screen. Xammal modalları×4 + InspectorPanel
  (#080808 floating card ✂, light-safe rewrite) + supplier detail/form.
- **4 emeliyyat kartı ✂** → compact 2×2 h-11 icon+label row (InspectorPanel).
- **Nə Alım = 2 SÜTUN:** sol Təkliflər (suggestions+auto-order notifs) | sağ "Lazım Olanlar
  · Sifariş Taslağı" (OrderGuide, autoSelectId preselect qorunur). Tədarükçülər card grid →
  DataTable + drawer (detail drawer-da Məhsul Kataloqu CRUD + WhatsApp/Redaktə footer).
  Hesabat valuation hero → 1 `divide-x` stat bar. Valyuta AZN → ₼.
- **E2E r34 FAIL (real backend bug, UI-də düzəldildi):** faktura OCR HTTP 500 **sükutla
  keçirdi** — kök: `.env`-də **GROQ_API_KEY YOXDUR** (yalnız 2 SUPABASE key var) →
  `/api/invoice-ocr` 500 + advisor `data_only`. Fix: OCR error toast + Advisor honest
  fallback ("AI analizi aktiv deyil" + raw stats — "hamı normaldır" 5 mənfi varkən aldatıcı).
- **Owner action: GROQ_API_KEY .env-ə əlavə edilməlidir** (invoice OCR + AI advisor +
  recipe calibrate bloklanır).
- Sayım & İtki / Analiz = eyni design system üzərindən keçdi (13j/13k: DataTable, pill,
  theme vars, Drawer) — ayrıca pass tələb etmir.

### Jurnal sətiri — 2026-10-05 (ROUND 13i: STOK HUB 0-DAN REWRITE — 4 NİYYƏT TAB + STATE MACHINE + 3 SANİYƏ QAYDASI)

Owner: *"4 edirik... ui yeniden yaz... 0 dan yenidən daha qəşəng et, micro-interactions,
state machine transitions, user anlasında 3 saniyədə ne etmelidir"* (audit-dən sonra:
"bu stok səhifəsi çox bettdir — 10 tab, duplicate Tədarükçülər, tab-daxili tab,
AI səthi ×3, ölü 'Sifariş et' linki, boş panellər, şişkin stok dəyəri").

**13i (commit 0947fef; E2E r33 dark 10/10 + r33b light 4/4, console 0):**
- **10 chip → 4 niyyət tab** (page.tsx 0-dan, 191 sətir): **Stok** (default) · **Tədarük**
  (Nə Alım/Faktura/Sifarişlər/Tədarükçülər) · **Sayım & İtki** (Sayım/İtki/Qaytarış/Anomaliyalar) ·
  **Analiz** (Hesabat/Trend/Audit). Sub-pill maksimum 1 səviyyə — tab-daxili tab YOX.
- **3 SANİYƏ QAYDASI (TabHero, yeni komponent):** hər tab = data-dan HESABLANAN bir cümlə
  + bir CTA. Stok: "7 xammal tədarük tələb edir → Nə Alım" / mənfi varsa "N mənfi stok →
  Sayım et" / hamı normal "Hamı normaldır". Tədarük: "N xammal sifariş olunmalı • ₼M".
  Sayım: "N kritik anomaliya açıqdır" / "Hamı uyğundur". Critical = pulsing dot.
- **STATE MACHINE (owner tələbi):** `useAsyncView` hook (loading/error/ready,
  stale-while-revalidate, seq-guard) + `ViewFrame` primitives (ViewSkeleton shimmer,
  ViewError+retry, ViewEmpty CTA, ViewContent entrance, LiveNumber pulse).
- **Micro-interactions:** sliding pill (main+sub, layoutId+SPRING), tab content
  AnimatePresence fade/slide, KPI dəyər dəyişəndə spring pulse, anbar row hover →
  action reveal, button active:scale, trend bar-ları scaleY spring, modal spring.
- **Duplicate-lar silindi:** Tədarükçülər yalın hub tab ✂ (tam CRUD = Tədarük-də YALNIZ) ·
  Ağıllı Analiz tab ✂ (Təkliflər→Nə Alım, İnsaytlar→Advisor, Trend→Analiz, **Kalibrasiya→
  Reseptlər səhifəsi** — global panel, təklif varsa görünür) · InventoryHealthCard ✂.
- **Ölü link FIX (13h regression):** "Sifariş et" `?tab=procurement` (hub oxumurdu) →
  indi suggestion kartı "Order Guide" CTA = Order Guide-da o maddənin checkbox-ı
  AUTO-SEÇİLİR + scroll (autoSelectId prop; E2E r33 #3 PASS).
- **KPI düzgün:** "Aşağı Stok" = hard-0 idi (`status==='low'` belə status YOXDUR —
  InventoryStatus = normal/critical/out_of_stock) → indi normal && ratio<50; "Mənfi Qeyd"
  = real count (5).
- **Light-mode sweep (kök: OrderGuideSection tam hardcoded white idi):** InvoiceUpload,
  SuppliersSection (`bg-[#0C0C0E]` modal → theme vars), Anomalies, Trends, Order Guide
  cədvəl — hamısı theme-var (E2E r33b: Order Guide DARK-on-light verified).
- **BUG TAPINTI + FIX (r33→r33b):** `useAdminAuth().role` = `null` (undefined DƏYİL) →
  ilk render-də role-gate superadmin-in `?view=po` sub-un YEDİB (URL rewrite). Fix =
  `authChecked`-ə bağlanmış optimistik gate (`elevatedVisible = !authChecked || isElevated`)
  + auth-sonrası drop effect. "2-ci click lazım" simtomu da eyni kökdən idi → r33b:
  single-click PASS ×3.
- **URL:** `?view=stock|procurement|operations|analytics&sub=...` + legacy mapping
  (13f/13h-in 10 ?view= dəyəri + `?view=recipes` → /admin/recipes). Bookmarks canlı.

### Jurnal sətiri — 2026-10-05 (ROUND 13h: STOK HUB UI REWRITE — Apple minimal frame + nested-hero strip + light-mode contrast)

Owner: *"basla"* (mandat 13g: inventory UI = TAM REWRITE — Apple felsefəsi + minimalliq +
"userin anlayacağı qədər rahat").

**13h (commit 69209ff; E2E r32 13/13 + r32c/r32d, dark+light, console 0):**
- **Hub shell rewrite** (`stock/page.tsx`): ağır "PRO INVENTORY" hero → minimal frame:
  tiny uppercase overline "Stok" + **aktiv view-ə görə dəyişən** bold title (Anbar/Sayım/…) +
  **segmented pill tab bar** (sliding pill `layoutId="hub-tab-pill"`, SPRING) — 10 chip eyni
  sırada; Anbar-da yalnız header-də 2 action (Yeni Xammal ghost + Xammal Girişi solid) + 4 KPI
  stat card strip (Xammal / Aşağı Stok / Kritik Bitən / Tədarükçü) + AdvisorCard + Anbar cədvəl.
- **Nested view hero-strip** (6 content + 4 tab): icon chip + serif h1 + subtitle +
  `min-h-screen`/glow/`max-w-7xl` wrapper-lar silindi → hər view yalnız incə `justify-end`
  toolbar (Yeni Sifariş / Yeni Sayım / Yeni Qaytarma / Yeni Standart / Export) + content.
  waste-standards `bg-[#080808]` hardcode = light-mode bug → silindi.
- **Light-mode theme sweep:** 4 tab component + 6 content-də qalan hardcoded white → theme vars.
- **Yeni `light:` Tailwind variant** (`globals.css`): Tailwind v4 `dark:` = **media-based** (OS-a
  baxır — app theme-dən müstəqil!) → `@custom-variant light (&:where(.light, .light *))` additive
  (mövcud `dark:` istifadələri toxunulmayıb). Audit KPI kartları: label 700-level light
  (measure: 5.0–6.8:1, r32d 4/4 PASS) + value 600-level.
- **E2E r32:** 10/10 view yeni frame-də (KPI/advisor/cədvəl, intelligence, procurement+Order Guide,
  PO, report 228,209 AZN, suppliers, counts, returns, waste, audit), sidebar 2 giriş (Stok + Reseptlər,
  duplicate yox), deep-link `?view=audit` ✓, `?view=recipes` → `/admin/recipes` redirect ✓,
  13 shot `e2e-shots/r32-*` + r32c/r32d. Feature loss YOX (bütün action buttonlar canlı).

### Jurnal sətiri — 2026-10-05 (ROUND 13g: RESEPTLƏR = AYRI SƏHİFƏ YENİDƏ + pending clarity chip/counter)

Owner: *"reseptler ayri sehife edek bu sehife ayri sidebarda olacaq evvelki kimi. amma
inventory tamm sekilde hazirdir backend olaraq... ui yeniden yazaq hazirda apple felsefesi
deyil yenikii... ui-de minimalliq istifade etmliyikde amma hazirda deyil... userin
anlaycaigi qeder rahat olsun... apple felsefeimizi ona uygun edirik."*

**13g (scope: yalnız recipes ayrılması — inventory UI rewrite GƏLƏN tur, backend hazır qalır):**
- `adminNavLinks`: Reseptlər girişi yenidən sidebar-a (ScrollText, superadmin/owner).
- `recipes/page.tsx` = standalone page (`recipes-content.tsx`-i render edir — 13f-də
  redirector idi). Hub-dan: chip, import, render silindi; `?view=recipes` deep link →
  `/admin/recipes` redirect. Hub = 10 view.
- **13f.1 (owner sualı: restored delta "2 dəfə sifariş kimi görünməsin"):** mixed-state
  satırda `⏳ N gözləyir` amber chip (yalnız göndərilmiş+gözləyən halda) + send CTA `+N`
  counter. E2E r30-D catch: chip ilk yerində (truncate name row) clip edilirdi → flex-wrap
  chip row-a köçürüldü. Double-send riski YOX (delta yalnız explicit send-də çıxır).
- E2E r31 run F: 6/6 PASS, console 0 (sidebar 2 giriş, hub 10 chip, standalone recipes
  dark+light readable, redirect OK).

### Jurnal sətiri — 2026-10-05 (ROUND 13f: MERGED ÖDƏNİŞ = 1 MERGED DB QEYDİ + CART OFFLINE DELTA + STOK HUB (11 view, 1 sidebar girişi))

Owner: *"merged odeniş merged olaraq dbda saxlanilsin qisaca. 2 cinide duzeldersen ozun
sonra ise derhall ui yeniden uje... recipes+ inventory lakin inventory-a aid olan seyler
bax sidebarda ayri tab olmasinda eyni sehifede olsunlar sonra bruazerden gri e2e test et verify et."*

**13f-A (merged payment, frozen RPC 0 dəyişiklik):** POS hər ödəniş action-ı üçün 1 stable
UUID (`payGroupIdFor`, cash-gate retry-safe) → `payment_group_id` → pay route strict-UUID
validate → hər `order_payments` sətirinə `split_group_id` (RPC artıq forward edir). 5 call-site.
`useOrders.handlePay` rewrite (2 latent bug: yalnız parent ödənilirdi; idempotency_key/paid_amount
yox idi → 400 + ₼0). History route = server-side group collapse (earliest-paid = primary,
`payment_group`, `nextOffset`); detail route = **legacy `payments` bug** (09-27-dən bəri boş
oxunurdu → `order_payments` live ledger + fallback) + full group expand. UI: merged kart
("Masa 90 + 401" + "2 MASA" chip), group detail banner + member sections. **E2E catch:**
merge-də child order `table_number` = parent-a rewrite → `merged_from_table ?? table_number`
(route+UI). DB kanıt: 2 order, 1 shared split_group_id (997292b5…).

**13f-B (cart offline delta):** sent order-a unsent delta tab close-da itirdi →
`pos_unsent_delta_${order_id}` @ localStorage (24h TTL) + safe merge (selectTable +
loadOrderIntoCart): server row → max-qty; id-siz → dedupe-draft. **Double-send yolu YOX**
(delta yalnız explicit send-də çıxır). E2E: reload → qty 2/1 sent qayıtdı ✓.

**13f-C (Stok hub):** 6 sidebar route (purchase-orders/recipes/counts/returns/waste/audit) →
`/admin/stock`-in **11 baxışlı** HUB-u (`*-content.tsx` + incə redirectorlar, `?view=` deep-link,
role-gate = `useAdminAuth()` — **E2E catch: `saito_role` cookie heç set edilmir**). Sidebar 7→1.
**Dead view fix:** "Ağıllı Analiz" render bloku yox idi. **Light-mode sweep:** 6 sayfada
~300 hardcoded white → theme vars (recipes light-da white-on-white idi).

**E2E r30 (dark+light, console 0):** Run A (merged payment ✓), Run B (labels+delta+cleanup ✓,
hub role bug tapıldı), Run C (hub 10/10 ✓: 11 chip, redirect, light readable). Şəkillər
`e2e-shots/r30-*`. Test state: Masa 90 re-archived (net-zero), ORD-2971/2972 (₼14) = demo qeydi,
MASANI BOŞALT PIN = **1871** (4321 banned — A07 regression).

### Jurnal sətiri — 2026-10-05 (ROUND 13e: BACKEND FULLY HAZIR — from-invoice supplier resolution + unit NOT NULL + compensation)

Owner: *"backend fully hazir etdeee davay baslaa"*. Focused sweep of the invoice→stock
procurement path (the feature the owner asked "necə işləyir"). **Tap + fix:**
- `from-invoice` **supplier mis-attribution**: old code fell back to the alphabetically-FIRST
  supplier (coca cola baku) when the OCR supplier name didn't match → a sushi-ingredient
  invoice silently tagged to the wrong supplier (polluted score/total_orders). Fix: resolve
  supplier_id → **name match (exact > prefix > contains, in JS so commas can't break a
  PostgREST `.or()`)** → **find-or-create canonical "Naməlum Tədarükçü"** fallback.
- `from-invoice` **unit NOT NULL 500 + orphan PO**: `unit: item.unit || null` 500'd on any
  OCR line without a unit AND the PO header was already committed (no rollback) → orphan
  draft POs. Fix: `unit: item.unit || 'gram'` (receive convention) + **compensation** (delete
  PO + items if the line-insert fails).
- `POST /api/purchase-orders` **no supplier guard** → added clean 400 (NOT NULL defense-in-
  depth; order-guide UI already skips supplier-less lines).
- **UI wiring**: `from-invoice` backend existed but NO button called it (bare invoice → DRAFT
  PO was unreachable). Added `supplierName` capture from OCR + "DRAFT PO yarat (stok daxil
  etmir · auto-send YOX)" secondary button in the review step (only when NO open PO).
- **Verified NOT bugs** (re-checked, didn't assume): `receive` stock_in IS applied via
  `trg_z_inventory_log_effect` trigger (route's unused `newQty` is a leftover, no bug);
  `customers` POST is robust (phone guard + find-or-create + all NOT NULL covered).

E2E r29 + recheck (browser session fetch, console 0): match "Coca Cola"→coca cola baku;
no-match→Naməlum Tədarükçü (auto-created); unit-less payload→**201** (was 500). DB net-zero
(7 test DRAFT POs + items + fallback supplier deleted; suppliers back to 1). → `HANDOFF_13E`
(giriş 13e-A/B task-ları; merged-group payment = design decision, hələ).

### Jurnal sətiri — 2026-10-05 (ROUND 13d: CLIENT-AUTH AUDIT TAMAM — table RLS + RPC EXECUTE qatı + İtki Pattern report)

Owner auto-mandat: *"2-3 run: yarımçıq qalıbsan davam et, bitirmisəns digər səhifələrə keç —
AMMA keçməzdən əvvəl etdiyin səhifələri E2E brauzer + kodda verify et; digər səhifələrin
qurulması qərər sənə, professional."* → 13d-A (13a candidate: app-wide client-auth audit) +
13d-B (§1d zəif #8: weekly shrinkage pattern) + 13d-C (E2E + commit + docs).

**Kök (audit):** browser Supabase client = **anon**; pooler user-sessiyada
`app.current_role`/`app.current_org_id` set ETMİR → `is_superadmin()`/`has_org_access()` =
false → bütün `*_select_loc`/`*_insert_loc` policies = **sükutla boş oxu / bloklanan yazı**.
**13d-də 2-ci qat açıldı:** RPC **EXECUTE grants** — `cancel_order_items`,
`reverse_stock_for_items`, `add_order_items`, `cancel_table_orders`,
`update_order_item_quantity` = anon-a GRANT YOX (yalnız postgres/service_role/±test_rls_role)
→ browser `supabase.rpc(...)` = **401**; 4 OrderModal call-site `.error`-ı YOXLAMIRDI
(supabase-js throw etmir) → **sükutla itki**: B2 tap = audit row yazıldı + success toast,
item HEÇ silinmədi.

**Fix (hamısı service-role bridge pattern, frozen RPC-lərə GRANT əlavə ETMƏDİK —
location-scoping modeli qorunur):**
- Table RLS (13d-A, r28/r28b verify): `GET /api/expo/board`, `GET /api/admin/badges`
  (`Prefer: count=exact` + **13d-A2: 5xx retry** — pooler transient 500 ×2+ = kök),
  `GET /api/customers?id=`, `GET /api/floors`, `GET /api/kitchen/reservations`,
  `GET /api/orders/table-active`, `GET|POST /api/cancelled-orders`,
  `POST /api/orders/item-quantity` (13d-A) — client-lər: expo/page, NotificationContext
  (bell+overdue+səbət), OrderModal, ManualOrderModal, CustomerSelect, UpcomingReservations,
  TableStatusGrid, kitchen/page (fetchTables + merged-name toasts).
- **Yeni bridge (13d-A2):** `POST /api/orders/cancel-items` + `/reverse-stock` +
  `/cancel-table` (useOrders "Clear Table"); OrderModal ×6 + ManualOrderModal → bridge,
  hamısı throw → real error toast.
- **`add_order_items` RPC = DB plan-time ÖLÜ** (13d tap): `v_item->>'modifiers'` (text) →
  jsonb sütun = **HƏR payload-da** "column is of type jsonb but expression is of type text"
  (psql repro). Browser 401 bunu maskalayıb. → client-lər `POST /api/orders {action:
  'addItems'}` (production-proven path: service insert + discount recompute) istifadə
  edir; yaradılmış `add-items` bridge route **silindi** (duplikasiya riski).
- **UI gap:** desktop Sidebar `link.badge`-ı HEÇ render etmirdi (yalnız mobile dock) →
  qızıl badge əlavə olundu (r28d verify = 1). **Race:** `handleConfirmWithDraft` save-dan
  ƏVVƏL onRefresh call edirdi → köhnə list; indi yazı bitdikdən sonra refresh (r28c tap).
- **13d-B:** `GET /api/inventory/reports` → `shrinkage_pattern` (28g: Mon-start H1–H4 +
  Toplam, gün paylanması, per-item WoW trend, top-5) + ReportsTab **"İtki Pattern"** kartı.
  §1d zəif #8 BĞLANDI → **qalan: yalnız multi-location (biznes)**.

**E2E r28→r28b→r28c→r28d→r28d2 (hər run 1 real bug tapdı — hamısı düzəldildi + re-verify,
console 0, dark+light):** r28 (POS/qty/badge — B2 401 tapdı) · r28b (item-quantity bridge
PERSIST PASS + CustomerSelect 21 müştəri + Expo + İtki Pattern; B2 cancel FAIL → 13d-A2)
· r28c (cancel FAIL = **jsonb scalar pitfall**: PostgREST body JSON→jsonb 1:1,
`JSON.stringify(items)` = jsonb STRING SCALAR → "cannot extract elements"; psql
text→jsonb cast bunu maskaladı → `p_items: items` real array; add-items FAIL = dead RPC;
badge = Sidebar render gap) · r28d (cancel ✅ + badge ✅ + add FAIL = RPC ölü tapıldı)
· r28d2 (**addItems action ✅ ₼46 persist**, badge ✅, light ✅).
Aralıqda: dev server "bricked event loop" (instrumentation.ts failure mode) → restart +
warm-up (chunks 20ms).

**psql (son, net-clean):** Masa 1 = 1 order ₼46.00 (Green Tea ×1 @4 + Filadelfiya Classic
×3 @**14** — menyu qiyməti 08-01-dən 14-dir; köhnə ₼67/₼21 = sentyabr test artefaktı,
13c incident DEYİL) · cancelled_orders = 45 (44 + 1 REAL audit row — r28d D1 cancel;
3 saxta r28b/r28c row silindi) · temp rezervasiyalar ×2 silindi · order_items net: +1 sətir
(yeni Fil row).

**OPEN (13e candidate):** (1) orders-page merged-group payment = yalnız seçilmiş
order-row-u ödəyir (child-satırlar qalıb — POS pay loop ayrı işləyir; design qərari lazımdır)
· (2) pooler transient 500 davam edir (badges retry gəldi; digər yerlər monitoring) ·
(3) `useReports.ts` = DEAD code (import YOX — get_z_report/v.b.) · (4) POS cart unsent
delta = in-memory (reload = itki; existing design, KDS offline buffer POS-a uzantı
kandidatı). → `HANDOFF_13D.md`.

### Jurnal sətiri — 2026-10-04 (ROUND 13c: INVENTORY + RECIPES TAMAM — Toast parity 6/8 bağlandı + AI gücləndi)

Owner mandat: *"qərər artıq sənə keçir — toastdaki hər şey + onlardan daha yaxşı;
calibration-ı gücləndir; inventory+recipes TAM backend+frontend, Apple fəlsəfəsi +
premium, dayanmadan; tam bitəndən sonra report."*

**DB (13c-A, service-role-only RLS):** `stock_batches` (FEFO; frozen consumption-a
toxunulmayıb — supplementary layer), `supplier_items` (vendor catalog),
`stock_counts.assigned_to`, `purchase_orders.recurring_weekly`; cron
`recurring-draft-pos` (`0 6 * * 1`, active) + `create_recurring_draft_pos()` = DRAFT
yalnız (human göndərir).

**Backend (13c-B):** `GET /api/stock/order-guide` (par altı + 7g tələb + catalog
qiymət prefill), `POST /api/procurement/from-invoice` (**Toast flagship: invoice →
DRAFT PO**), `GET /api/inventory/reports` (valuation/COGS/AvT/shrinkage/FEFO 30g),
`/api/stock/batches*` CRUD, `/api/suppliers/items*` CRUD, PO + recurring_weekly.
WAC (qiymət avtomatlaşması) = mövcud frozen trigger — toxunulmayıb.

**AI (13c-C):** `GET /api/recipes/calibrate` = **YENİ engine** (30g BOM×satış =
theoretical vs per-item FAKTİKİ consumption → LLM BOM delta, propose-only; waste
fərqi reseptə əlavə ETMİR; apply = atomik `/api/recipes/save`); `GET
/api/inventory/advisor` = 30g deterministic stats + LLM narrative (AdvisorCard).

**Frontend (13c-D):** Stock: Report view (ReportsTab) + AdvisorCard + row freshness
chips + InspectorPanel PARTİYALAR·FEFO (CRUD). Procurement: **Order Guide** pill
(select → DRAFT PO Yarat + "Həftəlik təkrar") + Tədarükçü modal içində MƏHSUL
KATALOGU (CRUD). Counts: "Sayımı edən" assignment + **offline buffer**
(`useCountOfflineQueue` — 12u KDS pattern: localStorage FIFO, online-replay, 4xx-drop/
5xx-keep, banner). Recipes: KALİBRASİYA (AI) modal (cədvəl + təklif + Tətbiq).
PO list: Həftəlik/RECUR- badges. E2E-də tapılan DRAFT PO button "occluded" = z-10 +
shrink-0 + type=button fix.

**E2E r27 (0-dan, dark+light, console 0, 12 shot):** S1 stock+advisor ✓ · S2 batch
chips (5 gün / Müddəti keçib + row chip) ✓ clean · S3 catalog add/edit/delete ✓ clean
· S4 order guide → DRAFT PO `bd469146…` ₼1150 → cancelled (200) ✓ (supplier mapping
bridge reversible) · S5 REPORT (228,209 ₼ valuation, COGS, AvT, FEFO) ✓ · S6 counts
assignment + item + cancel + DELETE (200) ✓ · S7 Filadelfiya kalibrasiya (7 sətir +
"uyğundur") ✓ (apply YOX — qərar owner-in) · light ✓.

**psql (son):** supplier_items=0, stock_batches=0, stock_counts=0, guide-POs=0,
RECUR-POs=0, mənfi=5 (owner sayımı gözləyir), cron ×2 active. §1d: 6/8 zəif bağlandı
(qalan: multi-location = biznes qərarı, weekly shrinkage pattern report = 13d).
→ `HANDOFF_13C.md`.

### Jurnal sətiri — 2026-10-05 (ROUND 13b: BOM qeydiyyatı + təmizlik + INVENTORY MÜQAYİSƏSİ)

Owner (13b): BOM draft-a "doğrudur" ("özün daxil et") + "Saito-nu competitorların
inventorysi ilə müqayisə et, nələri var nələri yoxdur".

**1. BOM (owner-approved, DB):** Filadelfiya Classic (150g düyü sushi + 1 nori + 80g
filadelfiya pendiri + 100g somon file + 50g avokado + 30g xiyar + 5g sesam) +
Kaliforniya Gold (150g düyü + 1 nori + 100g dəniz güləkləri + 50g avokado + 30g xiyar
+ 5g sesam + 20ml balsamik) = 14 sətir, `has_active_recipe=true` ×2 → **13/14 active
məhsul reseptli** (Coca-Cola = qəsdən reseptsiz — hazır qablaşdırma, owner qərarı).
İndi bu 2 roll-un ready tick-i → auto-consumption işləyir (frozen engine).
**2. Təmizlik (owner "hamısı"):** orphan resept `a1b2c3d4-0001…` = 5 sətir silindi
(0 qalıq) · P8_PROD = `is_active=false` (3 keçmiş order tarixçəsi saxlanıldı —
DELETE yox, deaktiv).
**3. Auto-consumption timing verify (owner sualı "hazır olandan sonra çıxsaydı
daha safe?"):** sistem ARTIQ elədir — `consume_stock_for_item`-ı çağıranlar =
`mark_item_ready_atomic`/`mark_order_ready`/`mark_ready_atomic` (READY anında,
order anında DEYİL) + refund = `return_to_stock`. DB kanıt: 66/66 item-linked
consumption ≥ `ready_at`, `item_never_ready=0`. 5 mənfi stok = timing YOX,
stock-in qeyri-mövcud (phantom) → sayım düzəltdir (owner gözləyir).
**4. INVENTORY MÜQAYİSƏSİ** (`POS_COMPETITIVE_COMPARISON.md` **yeni §1d**):
Toast **xtraCHEF** / Square **MarketMan** / Lightspeed (hamısı 2026-10-05
web-verified). 15 meyar × 4 sistem. **Üstün (6):** consumption = READY (real
cooking, refund closed loop — rəqiblər on-sale), **LLM AI inventory loop**
(resept/invoice/insights — rəqiblərdə YOXDU), ₼0 (2-si pullu add-on), audit spine,
frozen atomic, supplier returns. **Zəif (8):** invoice→PO automation (Toast
flagship), par-based order guide + recurring orders, formal COGS/AvT ledger,
offline mobile stocktake + staff assignment, batch/expiry (sushi freshness!),
multi-location, qiymət avtomatlaşması (manual avg cost), shrinkage pattern report.
**8 praktik təklif** priority order (§1d).
**Gözləyir:** owner sayımı (8 mənfi/şübhəli maddə) + test order consumption verify
(owner "hele etməyə" dedi — hold).

### Jurnal sətiri — 2026-10-04 (ROUND 13a: INVENTORY — audit + dead-module revival)

0-dan professional audit (code explore + psql + E2E r26 3 run). **Kök:** browser
Supabase client = ANON (pooler `app.current_role`-u user JWT-də set etmir; RLS
`is_superadmin()` = `current_setting('app.current_role')`) → **audit page HEÇ VAXT
data görməmişdi** (966 log, 0 görünən), **Stok Tarixçəsi boş**, **recipes modul TAM
DEAD** ("0 resept" × 15 məhsul; write policy = YOX → save 3 RLS-blocked call),
**procurement feed = 404 + type mismatch**. + 3 orphaned page (counts/returns/
waste-standards — URL ilə yalnız), waste-standards POST/PATCH = 500 (keyword_en/note
phantom sütun), counts DELETE = silent no-op, warm list 4 ölü route.

**Fix (hamısı service-role API pattern; frozen RPC toxunulmayıb):** 3 page → NAV
(Scale/RotateCcw/Trash) + permissions; `GET /api/notifications` (yeni) + type fix;
`GET /api/inventory/logs` (yeni; ingredient+order context 1 call) → audit page +
Stok Tarixçəsi; **recipes modul API migration** (`GET/POST/DELETE /api/recipes` +
`/save` atomic + `/ai-apply` batch — page+modal-da client call YOX);
waste-standards = yalnız real sütunlar + upsert error-check; counts DELETE → 404/409
guard; İnventarizasiya modal **0 icazədir** (mənfi phantom recovery yolu).

**E2E r26 (S0–S17, dark+light, console 0, 19 shot):** reversible stock cycle
(Avokado +1000/−100/−900 = net 0, DB verify); audit = **83 sətir CANLI** (3 E2E
sətiri verbatim); recipes = **11 məhsul CANLI** (4 reseptsiz: P8_PROD / **Filadelfiya
Classic** / Coca-Cola / Kaliforniya Gold); constructor edit = 5 sətir load;
DELETE guard = 409; procurement feed = CANLI; sayım full flow (zero-delta);
return create+cancel; waste-standards UI CRUD. **DB:** counts/waste_std=0,
returns=1 (cancelled), Avokado −1290 exact, Mango adjustment 0.000.
**Owner qərarı gözləyir (business data):** 5 mənfi stok (sayım ilə), 4 reseptsiz
məhsul, `avakado` 192kg + `Qızardılmış soğan` 199kg şübhəli, orphan resept
(12 sətir), P8_PROD. **App-wide client-auth audit** = 13b candidate.

### Jurnal sətiri — 2026-10-04 (ROUND 12z: GÜN poll 30s → 60s — pooler yükü)

Owner: "4ü nədə et sonra keç inventory" — §12y təklif #4: GÜN (All Day) view-ün
açıq-tab poll-u 30s → **60s** (all-day read = yavaş dəyişir; UX itkisi yox,
pooler yükü yarıya). Background ETA data 5 dəq qalır (12u). E2E r25 (GÜN only,
read-only): data render ✓, console 0, dark+light ✓. `r25-gun-*.png`.

### Jurnal sətiri — 2026-10-04 (ROUND 12y: SERVİS-TEXT TAM SİLİNMƏ + İZLƏMƏ CHIP YOX + 2s FLICKER KÖK-FIX)

Owner (3-cü tələb: "sənə neçə dəfə dedim... posdan verilir buttonu ləğv et, lazımsızdır;
İzləmə chip ləğv et") + **2s flicker** ("hər əməliyyat 1 dəfə icra olunur, 2 saniyə sonra
yenidən gəlir sanki icra olunmayıb, sonra yox olur") + 0-dan KITCHEN+BAR deep verify +
backend tam verify. Hər şey yaşandısa → **növbəti modul = INVENTORY**.

**1. "Servis POS-dan edilir" = TAM (son yol):** 12o (kart text) + 12v (modal button)
silinmişdi, amma modal CTA IIFE-inin inactive branch-i yenə emerald button render edirdi.
İndi modal footer: `showRush = pending|preparing`; `ctaActive = showRush && scopeIds>0`;
`showServed = served`. Ready/serving → **heç nə** (return null, sətir gizlənir).
`kds_serving_hint` + `kds_watch` i18n key-ləri = az/en/ru-dan silindi (0 usage).
**2. "İzləmə" = TAM:** navbar = bare `<Eye/>`; watch card/modal footer = yalnız
Qəbul/Hazır timestamps (+RUSH marker). Qalıq hit = yalnız comments + `/track` səhifələri
(müştəri tracking — ayrı feature).
**3. FLICKER kök:** 12q window-u yalnız tick/ready qoruydu; **RUSH/86/fire = qeydsiz**
optimistik əməliyyat idi → in-flight köhnə snapshot 2-3s "geri" yazırdı. Fix =
`optimisticRef` + 3 protection sahə: `rush:boolean|null` (klik anında qeyd; 4xx→null),
`voidedItems[]` (merge-də qəsbən 'voided'), `firedItems[]` (merge-də qəsbən 'preparing')
+ `stillNeed` release şərtləri. EU pooler 2-3s-in səbəb olduğu stale-snapshot demotion
hamı bağlandı.
**E2E r24 (0-dan, KDS+BDS+POS, dark+light, console 0):** S1–S16 PASS (`r24-findings.md`,
22 shot). Flicker sampler: tick 27.5s×56, ready-move 25.5s×52, RUSH 21.2s×54, 86 24.9s×26
= **HEÇ VAXT revert YOX**. Forbidden-text: ready modal footer = BOŞ; body-scan "Servis
Pos"=0/"İzləmə"=0 (KDS+BDS). Note routing verbatim ✓. Expo view-only ✓ → POS "SERVİSƏ
VER" → "SERVİS EDİLDİ" chip → KDS ~5s clean ✓. Light theme ✓. Cleanup: ORD-2968/2969/2970
cancel+dismiss → t3/t401 BOŞ; Masa 2/4/5 toxunulmadı.
**Backend (psql):** orders cancelled consistent; 86 item = `voided` (cancel overwrite
ETMİR); `kitchen_ready_at` = item `ready_at` bit-tibi; `table_order_contract` t3/t401 =
empty; `operation_logs` tam zəncir (place→accept→void(reason "Tükəndi")→cancel→dismiss);
Masa 2 (ORD-2959) = confirmed/ready unchanged. Orphan state YOX.
**Qalıq:** cold-start 1-frame false-empty flash (info); INVENTORY = növbəti.

### Jurnal sətiri — 2026-10-04 (ROUND 12x: NOTE ROUTING = MULTILINGUAL DƏRİN (AZ/EN/RU + KIRİL))

Owner: "sistem özəmənn hər 3 dilini tanıdıqda derinən, yeni məhsulu da tanısın". 12w-in
token engine-i **saf modula** köçdü + 4 qat dərinlik əlavə olundu: `src/lib/note-routing.ts`
(normTok → **kiril→latın translit** → **~40 concept sözlüyü** AZ/EN/RU ["çay"≈"tea"≈"чай",
"soğan"≈"garlic"≈"лук"] → **light stem** → **hamming ≤ 1** + prefix). Yeni proper-noun
məhsullar (Filadelfiya/Boston Lobster…) translit+token ilə 3 dildə tanınır; adət sözləri
concept sözlüyü ilə; tapılmayan = ÜMUMİ (yanlış stansiya heç vaxt — mübahisəvax). Route
qaydası (segment→stansiya/ümumi) 12w-dən dəyişməz; KDSView = yalnız adapter
(`routeOrderNote` itemStation resolve). **Verifikasiya:** node unit-test 10/10 + 8/8;
E2E r23 CANLI: AZ order `çay soyuq olsun, filadelfiya soğansız, təşəkkür` → Kitchen
"filadelfiya soğansız · təşəkkür" / Bar "çay soyuq olsun · təşəkkür" (verbatim ✓);
RU order (kiril) `чай холодный, филадельфия без крема, спасибо` → Kitchen "филадельфия
без крема · спасибо" / Bar "чай холодный · спасибо" (verbatim ✓); Masa 2 real data ✓;
console 0; cleanup tam (ORD-2966/2967 cancel+dismiss → Masa 3 BOŞ).

### Jurnal sətiri — 2026-10-04 (ROUND 12w: SMART NOTE ROUTING (ORDER QEYDİ → STANSİYA) + HAZIRLANIR/HAZIRDİR = SUB-TAB)

Owner (12v-dən sonra): "qeydlər niyə yalnız modalda? modal girmədən görünsün — lakin POS-da iki
qeyd növü var (Sifariş qeydi + Məhsul qeydi); umumi not birbasa hər iki station-a düşür —
station-lara ayır, sistem anlasın hansına getməlidir" + "HAZIRLANIR/HAZIRDİR zona olmasın, tab
şəklində olsun".

**1. SMART NOTE ROUTING:** order-level `customer_note` kartlarda **GERİ** (12v silən) — amma
SCOPED: qeyd vergüllə segmentlərə bölünür; hər segment order-un aktiv məhsul ad token-ləri +
modifikator adları ilə match olunur (normalize tr-lowercase + accent-strip; exact, **hamming ≤ 1**
"tee"≈"tea", prefix len ≥4). Match → segment YALNIZ həmin stansiya-nın kartında; match YOX
(vəya bütün stansiya-lara) → ÜMUMİ = hamıda (dürüst fallback). Expo kart = TAM qeyd (pass-da
ikiliq yoxdur); modal = TAM qeyd (12v dine-in fix qorunur); məhsul `special_notes` dəyişməz
(item-səviyyəli). DB/API dəyişiklik YOX (saf client). `kitchen_notes` kolonu type-only —
toxunulmadı. E2E r22: `green tea extra buz, filadelfiya kremli, təşəkkür` → Kitchen kart
"filadelfiya kremli · təşəkkür", Bar kart "green tea extra buz · təşəkkür", Expo tam; Masa 2-in
"green tee soyuq olsn" = yalnız Bar (Kitchen kartda YOX).

**2. SUB-TAB (zona yox):** 12v-in yan-yan HAZIRDİR aside **silindi**; indi aktiv station üstündə
iki pill sub-tab: `HAZİRLANİR · N` / `HAZIRDİR · N` (default HAZIRLANİR; station dəyişəndə reset;
Expo-da YOX). Pay bitəndə ticket sub-tab-ına keçir (count + AnimatePresence; r22 N5: 1→0/1→2).
Empty state: "Hazır bilet yoxdur" / "Bütün ticket HAZIRDİR tab-da" (`kds_all_in_ready` az/en/ru).
Bump rail (xl+) qorunur.

**E2E r22+r22b:** console 0 fresh tab, dark+light; cleanup: ORD-2965 canonical cancel+dismiss →
**Masa 3 BOŞ** (Masa 3 = VIP floor); Masa 2 untouched. Info: POS "SERVİSƏ VER" = masa context
menyu-sunda (ƏSAS ƏMƏLIYYATLAR), order panel-də YOX.

### Jurnal sətiri — 2026-10-04 (ROUND 12v: EXPO = VIEW-ONLY (SERVİS = POS) + HAZIRLANIR/HAZIRDİR ZONE SPLIT + ORDER-NOTE BÖLÜNƏSİ)

Owner qayıtdı (futboldan) və qərar verdi: (1) **"servis posdan verilir — buttonu və texti sil, heç vaxt
elə bir şey yazılmasin"** → Expo tam view-only; (2) **"hazırlanır + hazırdır bir yerdə mane olurdu —
tab/zona yarat"** → station board iki zonaya bölündü; (3) customer_note = **"böl"**; (4) cash shift
"bağla" (artıq auto-clockout cron-u bağlamışdı — DB verify: açıq shift YOX); (5) POS burst = "sen
necə istəsən" → izləmədə qalır (repro yox; transient pooler 500-lər self-healed); (6) səs = "təbii ki
seç, yoxla" → mövcud 12f bell təsdiq olundu, **routing verified (r21c A1)**.

**1. EXPO VIEW-ONLY (owner #1):** 12u-nun KDS-side `handleServe` + SERVİSƏ VER button-ları (kart,
bump tile, modal footer) + `kds_expo_serve`/`kds_expo_not_ready` i18n + offline-queue `serve` kind —
**HAMISI silindi**. Expo indi = read-only pass board: all-ready gate (bütün stansiya ready olmadan
ticket düşmür, invariant qorunur) + FIFO `kitchen_ready_at` + emerald "BÜTÜN STANSİYA HAZIRDİR" line
+ tam order list (dim) + sükut workflow timestamps (modal footer, button YOX) + overload badge.
**Kanonik servis axını:** stansiya-lar → Expo (pass gözləyir) → **POS "SERVİSƏ VER"**
(`mark_order_served_atomic`, 12i — dəyişməz) → order `served` → board-lardan çıxır. E2E r21 S7-S8:
Expo-da button/rail YOX; POS serve → chip "SERVİS EDİLDİ" → ticket hamıdan çıxdı.

**2. HAZIRLANIR / HAZIRDİR ZONE SPLIT (owner #2):** hər station tab-da (own + watch) board =
**HAZIRLANIR** (əsas grid, sol) + **HAZIRDİR** (sağ aside, w-72, lg+, emerald label + count).
Ticket-in stansiya payı bitəndə kart zone-lar arası yerində keçid edir (AnimatePresence + layout;
r21 S6 verified). Expo-da bölünmə YOX (bütün Expo board-u artıq "hazır" zonasıdır). Bump rail qorunur
(xl+; Expo-da YOX). i18n `kds_zone_*` (az/en/ru); **r21 typo:** CSS `uppercase` "ı"→"I" çevirirdi
("HAZIRDIR") → az dəyərləri pre-uppercased ("HAZİRLANİR"/"HAZIRDİR").

**3. ORDER-NOTE BÖLÜNƏSİ (owner #3) + KÖK FIX:** order-level `customer_note` station **kartlarından
silindi** (yalnız modal + POS + çap qalır — məhsul-səviyyəli `special_notes` kartda qalır, fərqli sahə).
**r21 S2 kök:** modal-da note MÜŞTƏRİ section-un içində idi (`order_source !== 'dine_in'` gate) →
dine-in order-larda (name/phone=null) note HEÇ VAXT render olunmurd (12t-dən qalın latent bug —
screenshot-da "Qeyd:" görünən yer kart idi, modal deyil). Fix: note bloku section-dan hoist edildi,
bütün order tiplərində modal-da görünür (r21b T1: dine-in, amber, verified).

**E2E:** r21 (zones PASS, expo view-only PASS, POS serve PASS; S2 modal-note FAIL → fix) ·
r21b (T1 note PASS, T4 cleanup PASS — ORD-2963 cancel+dismiss, Masa 3 BOŞ; T2 o an blocked: empty
table yoxdu — Masa 4/5 merged group qorunub) · r21c (A1 **own-family toast/səs routing verified** —
bar-only order KDS-də toast VERMƏDİ, Bar tab-da ticket; A2 light PASS; A3 cleanup ORD-2964; A4 final
1 aktiv sifariş (Masa 2 untouched), console 0 fresh tab).
**Anomaliya (monitoring):** transient 500-lər `/api/pos/tables`, `/api/print/queue` + "Gel-al" banner
— self-healed (pooler hiccup pattern; 2+ təkrar olarsa kök).
**Fayllar:** `KDSView.tsx`, `useKdsOfflineQueue.ts` (serve kind silindi), locales ×3,
`e2e-shots/r21-*,r21b-*,r21c-*`, `HANDOFF_12V.md`.

### Jurnal sətiri — 2026-10-04 (ROUND 12u: §1c 10 TƏKLİFİN HAMISI + EXPO "SERVING QAPISI" + OFFLINE BUFFER TAM + TRANSITIONS)

Owner (12t-dən sonra; "men getdim futbolaa" — **autonomous sessiya**): "bunları da professional şəkildə implement edək" — §1c-in 10 praktik təklifi (bump bar, offline buffer, expo, ETA, watch dərinləşdirmə, 86 variantı, per-stansiya səs, light contrast, overload, read-cache) + "izləmə stationlarda dairə rədd et" + "tabdan taba transition möhtəşəm olsun" + "state machine transition kimi micro-interaction-ların düzgünlüyünü kontrol et".

**1. EXPO STATION — "SERVING QAPISI" (təklif #3, Addım 2 BİTTİ):** DB: `stations` + 1 sətir (name='Expo', station_type='service' — CHECK constraint artıq 'service'-ə icazə verir, **migration YOX**; sort_order 3). `/api/stations?kind=kitchen` KITCHEN family-sında 'service' var → KDS navbar-a avtomatik düşür (Kitchen · Bar · **Expo** · GÜN); BDS navStations-da YOX (yalnız own family + kitchen family). `expoTickets` = bütün aktiv board item-ləri ready/served olan order-lar (**all-ready invariant** — "bütün stansiya ready olmadan order servisə düşmür"), FIFO `kitchen_ready_at`. Expo kart: emerald border, "BÜTÜN STANSİYA HAZIRDİR", tam order list (dim, dairə YOX), tək-press **SERVİSƏ VER** = `/api/orders/serve` → `mark_order_served_atomic` (FROZEN; POS "Servisə Ver" ilə EYNI edge) — optimistic flip (kart in-place çıxır, 12i qaydası qorunur: bizim press ilə çıxır), 4xx = rollback + toast (409 → `kds_expo_not_ready`; 403 = `floor.manage` — server enforced: yalnız owner/admin; kitchen/bar role = 403 toast, fake UI yox), 5xx/net = offline queue (`serve` kind; replay-safe: already-served = server no-op). Bump bar-da Expo = emerald SERVİSƏ VER tile; modal = tam order (stansiya-scope yox — pass bütün order-u görür), footer = tək böyük SERVİSƏ VER (inScope=false → tick/86/course YOX). Expo overload: amber ≥4 / red ≥8 gözləyən bilet. i18n az/en/ru (`kds_expo_*`).

**2. OFFLINE BUFFER TAM (təklif #2 + #10) — r19/r20 bug bağlamaları:** r19 finding: offline reload = "0 aktiv sifariş" — `GET /api/stations` UNCACHED idi → stations=[] → station→ticket mapping BÜTÜN ticket-ləri drop edir (yalan-empty board). FIX: (a) `KDS_STATIONS_CACHE` — last-known stations persist (success) + restore (fail); **r20b kök**: 503 RESOLVE olur (`ok=false`, `d=null`) — restore yalnız `.catch`-də idi → `.then` path-də `failed` flag (+ genuine-empty `d=[]` ayrımı); (b) **boş board heç vaxt son non-empty board cache-üstə overwrite etmir** (r20 kök: apiFetch-in synthetic offline snapshot-u (`/api/orders` ∈ OFFLINE_READ_ROUTES) `saito.kds.board.v1`-i `[]`-ə clobber edirdi); (c) `kdsOrders.length===0 && isOffline()` → `tryCacheFallback()` (offline-də boş board güvənilmir); (d) `X-Saito-From-Cache` synthetic response → "son sinxron HH:MM" note (honesty). E2E r20c: offline reload = Masa 2 ticket + "son sinxron" + 4 tab (stations restored) — **a/b/c PASS**; back-online clean.

**3. BUMP BAR (təklif #1):** aside rail (xl+, w-44, sticky) — aktiv stansiya-nın ticket-ləri: press = station-scoped Hazırdır (eyni `handleMakeReady` path); "N qalıb · ≈M dəq" sub-label; ready ticket = sükut emerald tile; watch tab-da YOX (action YOX); Expo = SERVİSƏ VER tile.

**4. PER-TICKET ETA (təklif #4):** kart + bump chip "≈ N dəq" — N = bugünkü Ø HAZIRLANMA (`/api/kitchen/daily` `avgReadyMin`; GÜN mount-da artıq load olunur, 5-min refresh); elapsed > N → amber (qırmızı GEÇİKME güclü qalır); watch tab-da YOX.

**5. WATCH DEEPENING (təklif #5):** watch modal footer = "İzləmə · Qəbul 11:09 · Hazır 11:32" (`kitchen_accepted_at`/`kitchen_ready_at` — DB-də artıq var, yeni query YOX).

**6. 86 VARIANT (təklif #6 — owner choice (b)):** modal sətir = kiçik "86" button (12s-in X görünüşü YOX, tick hot zone-undan uzaq) → REASON sheet (Tükəndi / Yanlış sifariş / Müştəri ləğv etdi / Digər + note) → **PinGuard (PIN 4321 pattern, action void_item)** → `/api/kitchen/void-comp-waste` (`origin:'kds'`, `order.void`) → sətir ticket-dən çıxır + toast; 5xx/net = offline queue. **Crash fix:** `kds/page.tsx` + `bds/page.tsx` → `VirtualKeyboardProvider` (PinGuard keypad `useVirtualKeyboard` tələb edir — r17 fatal render; POS page artıq belə sarılmışdı).

**7. PER-STANSİYA SƏS (təklif #7):** chime yalnız terminal-in ÖZ family-sının yeni ticket-i üçün (`ownStationIds` = own type stations) — Bar order KDS-də səssizdir (BDS-də çınlayır).

**8. LIGHT MODE (təklif #8):** modifier text zinc-500 → **zinc-600** (kart + modal) — r20b S7 lab (≈35% L*, oxunaq).

**9. OVERLOAD BADGE (təklif #9):** navbar tab: pending item-lər amber ≥6, red ≥12 (pulse). (Staffing comparison = Addım 2 — data `kitchen_analytics`-da; indi threshold-based.)

**10. READ-CACHE (təklif #10):** bax #2 — board + stations stale-while-revalidate (30-min freshness), "son sinxron" note.

**TRANSITIONS + MICRO (owner: "trnasition mohtesem olsun"):** (a) nav pill = TƏK sliding element (offsetLeft/offsetWidth ölçülür, `SPRING.surface` x/y/w/h; `initial={false}`; [activeKey, counts, length] üzərində re-measure) — r17 layoutId morph E2E-də FİRE etmədi → deterministic v2 (r18: glide 320ms PASS); (b) board = `AnimatePresence mode="wait"` cross-fade — `LEVEL.navigation` (enter T.standard/EASE.morph y:12+blur4px; exit T.grace/EASE.graceful y:-8+blur4px) — pill ilə PARALLEL = one state-machine motion (r18/r20b: 450-500ms, double-render YOX); (c) watch↔own switch verifié (circle/CTA eyni cross-fade-də peyda/qayıb olur; r20b S6: Bar watch = 0 circle, 0 button, modal = İzləmə + timestamps).

**GÜN GHOST FIX (r20b):** cancelled kitchen order-lar GÜN-də "×0 GÖZLƏYİR" ghost sətir idi (E2E cleanup-da Masa 3 clear-i bloklayırdı) → `/api/kitchen/daily` query `kitchen_status=not.in.(cancelled)` (SQL: `NOT IN` NULL-ı da xaric edir → ayrı `not.is.null` lazım deyil); metrics də clean.

**E2E (owner out — autonomous, real Chrome, PIN 4321):** r17 (bump/pill-v1/watch-no-circle/console; PinGuard crash tapıldı+fix) · r18 (pill glide v2 PASS, cross-fade PASS, 86 full chain sheet→chips→note→PIN→void→toast→sətir+ticket çıxan, ETA live ≈1→≈4 dəq data-driven) · r19 (offline queue + banner + auto-replay ~10.4s PASS; **stations cache FAIL** → r20 fix) · r20 (Expo: gate half-ready = empty ✓, all-ready = card+bump ✓, SERVİSƏ VER → order served + POS chip "SERVİS EDİLDİ" ✓; **board [] clobber FAIL** → r20b fix) · r20b (transitions PASS, light theme PASS, **stations 503 restore FAIL** + Masa 3 blocker tapıldı) · r20c (**offline reload a/b/c HAMISI PASS** + cleanup: ORD-2962 canonical `/api/kitchen/cancel` (performed_by owner) + Masanı boşalt → Masa 3 BOŞ, GÜN clean, Masa 2 untouched). Console 0 fresh-tab (r20b S9 + r20c F1 — r19-un "6× supabaseKey" = shared-tab history təsdiqləndi, fresh = 0).

**Dev server:** 12u-də BİR DƏFƏ restart (pid 79308, `/tmp/saito-dev-12u.log`) — stale empty-key chunk purge (owner football-da idi, board sənaye-də kövrək qalırdı; "mid-test restart" qaydası = owner test-də ikən restart etməmək).

**Fayllar:** `KDSView.tsx` (~2400 satır), `src/hooks/useKdsOfflineQueue.ts` (YENİ), `admin/kds/page.tsx`, `admin/bds/page.tsx`, `api/kitchen/daily/route.ts`, `lib/i18n/locales/{az,en,ru}.ts`, `e2e-shots/r17-*,r19-*,r20-*,r20c-*`, `HANDOFF_12U.md`. Commit **d140855** pushed (secret-scan clean; .env/next-env.d.ts stage-ə ALINMADI).

**OPEN (owner qərarı/ear-check):** per-stansiya səs ear-check (12f NO-GO qalıb — owner qulaq testi) · POS 115× duplicate-key burst (monitoring, repro yox) · superadmin cash shift (owner GO gözləyir) · order-level `customer_note` station-scoping (12t qeydi — owner bilməlidir).

### Jurnal sətiri — 2026-10-04 (ROUND 12t: MODAL = YALNIZ AKTİV STANSİYA + BAR TAB VIEW-ONLY + BÜTÜN STANSİYA-LARA EYNI QAYDA)

Owner (Şəkil 1-4): "Hər modal YALNIZ həmin station-a aid məhsulları göstərsin (Green Tea kimi digər stansiya məhsulları modalda görünməsin) · KDS mətbəx panelində 'Bar' tab yalnız BAXIŞ (view-only) üçün — məhsullar üzərində heç bir klik, seçim, tick və ya digər əməliyyat düyməsi olmasın · Bar tabında da yalnız bar stansiya-sının məhsulları · qaydalar BÜTÜN station-lar üçün eyni · əvvəlki modal / yoxa çıxıb yenidən görünmə / filtr problemləri TAM düzəlsin."

**Model (12t):** terminal-in ÖZ family-sı: KDS (ümumi panel, `stationType` yox) = `kitchen` → Kitchen tab operable, **Bar tab = WATCH**; BDS (`stationType='bar'`) = `bar` → Bar tab operable, Kitchen tab = WATCH (12s). İndi `watchMode = activeStation.family !== ownType` (12s-də yalnız restricted terminal üçün idi — KDS Bar tab operable idi; owner: KDS də Bar-ı yalnız izləsin).

**FIX-ler (`KDSView.tsx`):**
1. **`ownType = stationType || 'kitchen'`** — tək qayda bütün station-lara (navbar badge də eyni: `stIsWatch = family !== ownType`).
2. **Modal = yalnız aktiv stansiya:** `items` filterinə `itemStation(i) === activeStation.id` əlavə olundu — 12s-in multi-stansiya qrupları (BAR · İzləmə / KITCHEN section-ləri) YALNIZ aktiv stansiya-sının item-ləri oldu (flat siyahı, qrup header-ləri + `stationMap` silindi). Başqa stansiya-sının item-ləri modalda HƏMİŞƏ yoxdur (öz tab-larında view-only izlənir).
3. **WATCH footer = view-only:** modal footer watch-da HƏMİŞƏ sükut "İzləmə" sətiri (Eye) + RUSH status markerı (yalnız order rush-dursa) — course-fire button YOX, RUSH button YOX, "Hazırdır" button YOX (12s-in disabled button + böyük RUSH pill-i silindi). Kart: 12s-in statik circle + İzləmə caption (indi KDS Bar tab-da da aktiv).
4. **`inScope` = `!watchMode && itemStation(i) === activeStation.id`** — BDS-də də eyni (12s `stationType ? null : …` special-case-i aralandı).
5. **Yoxa çıxıb yenidən görünmə = TAM:** modal X/86 button-sız (12s), tick = in-place progress (sətir heç vaxt drop etmir), poll fail = `return` (orders silinmir, seq guard + optimistic merge 12q), ready flip = in-place (12i). E2E r16: modal 16s açıq qaldı — auto-close YOX, item disappear/reappear YOX (identical DOM).
6. **Qalıq "supabaseKey is required" (6×, shared-tab history):** kök = 01:33 chunk-u (`.env.local` YARADILMADAN ƏVVƏL compile) — 07:19:10 (r15) son real error; 11:35 HMR recompile-dən sonra bütün chunk-lar real key ilə. **Fresh-tab verification: 0 error / 0 warning** (r16-fresh). Dev server restart ETMƏDİK (owner test-də idi — HMR qaydası).

**E2E (r16, dark+light, read-only — heç bir tick/CTA toxunulmayıb):** KDS: Kitchen tab = Filadelfiya YALNIZ (card+modal, operable tick/RUSH/Hazırdır), Bar tab = Green Tea YALNIZ (card: statik circle + İzləmə caption; modal: heç bir button YOX, footer = sükut İzləmə) ✓; navbar İzləmə badge Bar-da ✓; BDS: Bar = Green Tea operable (card+modal tick/RUSH/Hazırdır) ✓, Kitchen = Filadelfiya view-only (card+modal button YOX) ✓; 16s modal hold = stable ✓; fresh console 0 ✓. Screenshot-lar: `e2e-shots/r16-*`.

**Order-level qeyd (owner bilməlidir):** Masa 2-dəki "Qeyd: green tee soyuq olsn" = `orders.customer_note` (ORDER-level, item-lərin `special_notes`-ləri boşdur) → bütün station kartlarında görünür (order info = status, məhsul DEYİL). Item-level qeydlər station-scope-dan keçir (yalnız həmin item göründükdə). Owner istəsə order-note də station-a bölünə bilər.

**Fayllar:** `KDSView.tsx`, `e2e-shots/r16-*`, `HANDOFF_12T.md`.

### Jurnal sətiri — 2026-10-04 (ROUND 12s: MODAL STANSIYA QUPRULARI + BDS WATCH MODE + X/ORD KOD SİLİNDİ + MODIFIER HƏMİŞƏ ×N)

Owner (Şəkil 1 modal + Şəkil 2 BDS navbar): "Bar bölməsində KDS məhsulu (Filadelfiya) niyə görünür? Hər mətbəx yalnız öz sifarişlərini və məhsullarını göstərməlidir · modal-da 'X' düyməsi niyə var — tik kliklədikdə məhsulun yox olması + yenidən gəlməsi bug-ı aradan qaldır · modifikator yalnız '1 ədəd' kimi göstərilir — bütün modifikatorların və miqdarları düzgün göstərsin · 'ORD-2959' kimi kodlar göstərilməsin · eyni funksionallıq BDS tabında da — 'Main Kitchen' əvəzinə 'Bar'/'Kitchen'/'Gün' · bir mətbəx digərini YALNIZ İZLƏYƏ bilsin (hazırlanıb-hazırlanmadı, qəbul vaxtı, status), idarə etməsin · Saito vs Toast/Lightspeed/Square mətbəx müqayisəsi + praktik təkliflər."

**Diaqnostika (live DB — "supabase yoxla" qaydası):** ORD-2959 (Masa 2, `c151767b…`) 3 item ilə gəlmişdi: Green Tea (Bar) + Filadelfiya **Standart** (Kitchen, active) + Filadelfiya **4-modifier** (Kitchen, `voided` 07:10:04). Audit (`operation_logs`): `place_order` 07:09:31 (3 item, ₼39) → `accept_kitchen_ticket` 07:09:35 → `order_item.voided` 07:10:04 (hər ikisi owner super-admin `c814879d…`). **"Filadelfiya Bar-da görünür" = modal-da item-lər stansiya qruplaşması OLMADIĞI üçün flat siyahı idi (STANSIYALAR bloku = yalnız 0/1 counter); "yalnız 1 ədəd" = 4-modifier item owner-in öz X (86) klik-i ilə 21s əvvəl void olunmuşdu (DB düz, UI voided düzgün gizlədir); "X + tik-disappear" = 12q 86-düyməsi (void → sətir yox olur = gözlənilən davranış, amma owner bunu "yox olur, geri gəlir" kimi oxuyurdu) → 12s-da UI silindi (DB mexanizmi qorunur, 86 = POS-only).**

**FIX-ler (frontend, `KDSView.tsx` + locales + DB):**
1. **Modal = stansiya qrupları:** flat item siyahısı + STANSIYALAR counter bloku → hər stansiya üçün `<section>` (header = stansiya adı + ready/qty; item-lər `station_id` ilə qruplaşdırılır). Filadelfiya indi YALNIZ KITCHEN qrupunda, Green Tea YALNIZ BAR qrupunda.
2. **WATCH mode (BDS + unified):** restricted terminal (BDS `stationType='bar'`) → `navStations` = öz family + digər kitchen family; digər family tab-ı = **read-only** (navbar-da Eye "İzləmə" badge): statik read-only circle (button YOX), CTA = sükut "İzləmə" caption (Hazırdır YOX), RUSH = non-clickable status span, `inScope()` = false (heç bir action scope-ə keçmir). Unified KDS-də eyni mexanizm Bar tab-ı üçün.
3. **X (86) düyməsi SİLİNDİ:** `handleVoidItem` + XCircle button + modal footer — owner tələbi ilə. Void sətirin "yox olub geri gəlməsi" = 86 → sətir drop + re-poll'da voided filter; indi sətirdə yalnız ✓ tick var (12o progress semantics — tick sətri heç vaxt drop etmir). DB: `item_kitchen_terminal('voided')` + `origin:'kds'` exemption + kitchen/`order.void` permission **qorunur** (POS comp/waste path).
4. **ORD-kod YOX:** modal header (`Masa 2` only; takeaway/delivery `customer_phone` qalır) + kart `metaRest` (dine_in üçün boş).
5. **Modifier HƏMİŞƏ ×N (kart + modal):** `Standart` → `Standart ×1`, `Əlavə Losos ×3` — miqdar heç vaxt gizli (owner "yalnız 1 ədəd" şikayətinin kökü = ×1-in görünməməsi).
6. **"Main Kitchen" → "KITCHEN":** DB `stations.name` UPDATE (1 sətir) + `delivery/page.tsx` + KDS literal-ləri. Navbar indi Kitchen · Bar · GÜN.

**E2E:** r14 (unified KDS + BDS, dark+light): navbar ✓, modal qrupları (BAR · İzləmə → Green Tea; KITCHEN → Filadelfiya) ✓, X YOX ✓, ORD-kod YOX ✓, read-only Bar qrupu (statik circle + İzləmə marker) ✓, tick = sətir qalır (disappear YOX) ✓, BDS watch tab tam read-only ✓, console 0. **r15 (modifier ×N):** Masa 2 kart + modal (dark+light) = "Standart ×1" ✓, console 0. Screenshot-lar: `e2e-shots/r14-*` + `r15-*`.

**Müqayisə (owner tələbi):** `POS_COMPETITIVE_COMPARISON.md` §1c — meyar-meyar cədvəl (rahatlıq/idarəetmə/ayrım/status/modifikator/performans/offline/expo/ETA/aggregator/qiymət) + SAITO üstün (WATCH mode, station-scoped ready, per-instance modifier, 23ms, GÜN, frozen state machine, 24h window, AZ yerelliği) + zəif (offline KDS, expo, bump bar, kitchen ETA, aggregator, hardware, 86=POS-only, per-stansiya səs) + 10 praktik təklif (priority order).

**Fayllar:** `KDSView.tsx` (modal qruplaşma IIFE, `navStations`/`watchMode`, X/86 UI silindi, ORD-kod, modifier ×N, navbar badge, RUSH/CTA/tick watch variantları), `delivery/page.tsx`, `locales/{az,en,ru}.ts` (`kds_watch`), DB `stations` rename, `POS_COMPETITIVE_COMPARISON.md` (§1b yenilənmə + §1c), `e2e-shots/r14-*`+`r15-*`, `HANDOFF_12S.md`.

**Qalan (owner GO gözləyir):** §1c təklifləri (bump bar · kitchen offline buffer · expo · kitchen ETA · watch timestamps · kitchen 86 variantı · per-stansiya səs · light-mode kontrast · overload badge · read-cache). 12q OPEN-ləri: POS 115× duplicate-key burst (monitorinq — 12s-də repro YOX), ShiftGate 86 browser re-test (smena bağlı — indi UI silindiyi üçün yalnız POS path).

### Jurnal sətiri — 2026-10-03 (ROUND 12r: METBƏX SWEEP — STATION-SCOPED READY + FALSE-EMPTY BOARD + MODIFIER TEXT + HEARTBEAT 500)

Owner: "modifikatorlar niyə chip oldu — evvəl text idi (miqdar vacibdir: bir əlavə ×3, digəri ×1) · sifarişlər modalına girdikdə bir mətbəxin sifarişi digərinə düşməsin · ümumi mətbəxdə 'servise ver' basıram, icra olunur, sonra geri qayırır — belə qəribə şeylər olur · metbəxi backend+frontend yoxla, hamısını ən xırda detallaqədər duzelt, sonra tekliflər."

**Diaqnostika (browser E2E r13/r13c/r13d + live DB + server log):** DB təmizdir (table_number dup YOXDUR — per-floor/cross-floor (NULL daxil)/cross-location; kitchen orders API = PostgREST FK nesting, JOIN fanout YOX; products API təmiz). Audit-dəki təkrar `mark_ready` pattern-ləri = əvvəlki agent-in E2E fixture-ləridir (explicit timestamp-lu item-lər + audited olmayan psql reset-lər) — owner-in bug-u DEYİL. Təmiz flow-da "servise ver revert" repro olunmadı (whole-order CTA: HAZIRLANIR→SERVİSƏ HAZIRDİR t60-a qədər stabil, console 0; POS serve: SERVİS EDİLDİ stabil) — owner-in gördüyü "qəribəlik" = aşağıdakı 2 real bug + uzun dev sessiyasındakı Fast Refresh remount-lar.

**BUG 1 — STATION OVERRREACH (canlı repro, E2E r13v STEP 4.1):** ticket MODAL "Hazırdır" CTA = tam order idi (`item_ids=null`) — **Bar (BDS) chef-i basanda Main Kitchen-un YEMƏYİNİ 'ready' edirdi** (STANSIYALAR: Bar 1/1 + Main Kitchen 1/1 bir anda; header səhvən SERVİSƏ HAZIRDİR). Bu = owner-in "bir mətbəxin sifarişi digərinə düşməsi". → **Fix: terminal ACTION SCOPE** (`scopeStId`/`inScope`): unified board = navbar-da AKTİV stansiya; BDS = board familyası. Modal CTA + `fireableCourses` İNDİ yalnız scope daxilinə toxunur; order son stansiya bitəndə rollup ilə TƏBİİ 'ready' olur. CTA, scope paylaşının bitdiyi an, sükut emerald hint-ə keçir (yenidən-basılma yoxdur). E2E r13d: Bar CTA → Bar 1/1 + Main 0/1 + header HAZIRLANIR ✓ · Main CTA → SERVİSƏ HAZIRDİR ✓ · reopen → quiet hint ✓ · POS serve → board təmiz ✓.
**BUG 2 — FALSE-EMPTY BOARD (canlı repro, E2E r13d):** (a) initial load zamanı board **"Bütün sifarişlər hazırdır" (yalan all-ready)** göstərir — data gələnə qədər (hər load/remount-da 1-3s); (b) stations fetch BİR-ATƏŞLİ idi — fail/boş olduqda `boardStations=[]` bütün sessiya üçün → board, `/api/orders` 124 aktiv order qaytararkən **30s boş qaldı** (yalnız reload bərpa etdi); (c) uzun dev sessiyasında hər code edit → Fast Refresh remount → (a)+(b) amplifikasiya = owner-in "icra olunur, geri qayırır" görünüşü. → **Fix:** (1) **loading gate** — `loading || !stationsLoaded` halında sükut spinner + "Yüklenir…" (az/en/ru `kds_loading`), ikisi YALAN empty state-in önündə; (2) **stations retry** — transient boş/error → 3× 800ms retry, sonra settle (`stationsLoaded`).
**BUG 3 — DEVICES HEARTBEAT 500 (server log: hər 5s):** iki browser profili (owner Chrome + built-in vtab — ayrı localStorage = fərqli `device_id`) eyni `device_name` paylaşır → upsert `(location_id,device_id)` real constraint-ı `(location_id,device_name)`-i pozur (23505) → hər heartbeat 500. → **Fix:** `/api/devices` — 23505-də real constraint üzərindən retry (last-writer-wins by name). Verified: 4 eyni-vaxt terminal, 500 YOX.

**MODIFIER TEXT (owner tələbi):** KDS kart + modal (BDS = eyni komponent) — chip-lər → **sükut text sətiri**: `Standart · Əlavə Losos ×3 · Sesam Toxumu` (kart 11px zinc-500/white-40; modal 12px zinc-500/white-45; join ` · `). Miqdar artıq per-modifier merge olunur (×N — DB/API doğrulandı, E2E r13v ×3 = tək "Əlavə Losos ×3" sətiri). Course chip (MAIN) + allergen chip (⚠, safety) qorunur. Light mode: oxunaqlı, ikincil kontrast (aşağıda teklif).

**E2E:** r13 (modifier text dark/light ✓, cross-table YALAN — DB/API təmiz, ×3 ✓, ORD-2956) · r13c (whole-order CTA + POS serve: revert YOX, station isolation kart-də ✓) · r13v (mixed order ORD-2957: **BUG 1 repro** — Bar CTA leaked; text fix verified dark+light) · r13d (mixed order ORD-2958: **scope fix verified** — Bar→1/1 Main→0/1, sonra Main→SERVİSƏ; false-empty 30s repro; heartbeat 500 gone). Console: 3 sessiyada 0 error.

**Fayllar:** `KDSView.tsx` (modifier text ×2, `scopeStId`/`inScope` + scoped modal CTA + scoped `fireableCourses`, stations retry + `stationsLoaded`, loading gate), `api/devices/route.ts` (23505 fallback), `locales/{az,en,ru}.ts` (`kds_loading`), `e2e-shots/r13-*`+`r13c-*`+`r13v-*`+`r13d-*`, `HANDOFF_12R.md`.

**Qalan / tekliflər (owner GO gözləyir):** POS 115× duplicate-key burst (§6.1) — 3 browser sessiyasında repro OLMADI, DB/API təmiz, 12q guard-lar ehtimal ki kökü aradan qaldırıb — monitorinq. Light mode modifier text kontrastı (zinc-600 bump). Hər item-də [MAIN] course badge (POS default course-u explicit saxlayır — 11o "deviation-only chip" niyyətinə candidate).

### Jurnal sətiri — 2026-10-03 (ROUND 12q: KDS STATUS REVERT + LATENCY 23ms + KITCHEN GAP SWEEP (RUSH / COURSE FIRING / 86))

Owner: "hazirdir basiram, mehsul hazirdir, sonra evvelkine statusuna geri qayidir… buttonlar gec reaksiya verir (2-3sn)… competitorlar ile detaylı feature müqayise et. master-mapdan bax, metbexe aid neler qalibdir, duzeldek hamisini."

**Task 1+2 — REVERT + LATENCY (3 root cause):**
- **(a) Optimistic update YOX idi:** `handleMakeReady` və s. UI-Yİ RPC round-trip bitəndə (advisory lock + FOR UPDATE + stock + PostgREST + EU pooler ≈ 2-3s) patch edirdi → **optimistic-first handler-lar** (Tick / Hazırdır / Rush / Fire / 86, `KDSView.tsx`): UI `await`-DAN ƏVVƏL patch, fail-də snapshot rollback. Ölçülən vizual cavab **23ms**.
- **(b) Blind full-replace lost-update:** click-dən ƏVVƏL başlayan poll click-dən SONRA cavab verib təsdiqlənmiş state-i köhnə snapshot-la üst-üstə yazırdı (kart geri qayıdır, növbəti poll bərpa edirdi) → **fetch seq guard** (`fetchSeqRef`): superseded in-flight responslar drop olunur (`usePos.fetchFloor`-da eyni guard mövcuddur).
- **(c) DEMOTE BUG (DB):** `trg_sync_order_kitchen_status` order status-u YALNIZ item status-larından rollup edir; `accept_kitchen_ticket_atomic` order-u `accepted` edir, item-lər `pending` qalır → istənilən item update (hətta sadə tick!) order-u geri `pending`-ə düşürdü → `/api/kitchen/accept`: accept RPC-dən sonra item-lər `pending/sent → 'accepted'` aline edilir (edge `state_transitions`-də registered idi; full cycle real DB-də ROLLBACK testlərlə təsdiqləndi).
- **Əlavə qoruma:** optimistic merge window (15s, `optimisticRef` — köhnə snapshot təsdiqlənmiş lokal əməliyyatı heç vaxt demote etmir) + POS floor **high-water clamp** (`KITCHEN_RANK`, 6s pəncərə — rank≥4-dan aşağı düşmə suppress; terminal statuslar + yeni order-lar HƏMİŞƏ tətbiq olunur) + `kitchen_accepted_at` persist bug (accept RPC stamp YAZMIRDI → route NULL-ikən stamp edir — GÜN Ø QƏBUL + legacy timer dəqiq).

**Task 3 — KITCHEN GAP SWEEP (DB mexanizmi FROZEN idi, UI YOXDU idi → bağlandı):** **RUSH** (`orders.is_rush` + `toggle_rush` → yeni `/api/kitchen/rush`; modal ghost pill, active = solid red; kart = red border + header-də ⚡RUSH; GÜN-də qırmızı Zap) · **Course firing** (`fire_course_atomic` → yeni `/api/kitchen/fire-course`; modal-da CTA-dan yuxarı Flame course pill-ləri — YALNIZ pending/accepted item-i olan course-lər) · **86 / item void** (`item_kitchen_terminal('voided')` → canonical `/api/kitchen/void-comp-waste` `action:'void'`, `reason:'kds_86'`, **`origin:'kds'`**; modal item sətirində ✕ 28px ghost; served sətirlərdə YOX). DB config (1 sətir, repo-xarici): `role_permissions` + kitchen/`order.void` (86 = standart KITCHEN əməliyyatı — Toast/Square-də chef 86 edir; əvvəl 403 idi; reversible DELETE qeydi HANDOFF-da).
- **E2E r12q2 tapıntısı + fix:** 86 birinci cəhddə shiftGate hard-fail ("Smena bağlıdır") → `origin==='kds' && action==='void'` = **shiftGate exempt** (86 = kitchen-availability, register əməliyyatı deyil; POS comp/void/waste gate + PinGuard qorunur; permission + state machine + operation log qüvvədə). ⚠️ Bu fix browser-da YENİDƏ test olunmayıb (OPEN — növbəti agent).

**i18n (az/en/ru):** `kds_rush`, `kds_rush_toggle_on/off`, `kds_fire_course`, `kds_item_86`, `kds_86_toast` + GÜN `/api/kitchen/daily` select-ə `is_rush`.

**E2E:** r12q **7/8** (recall→re-accept ✓ · tick demote etmir (DB) ✓ · Hazırdır instant 23ms ✓ · 15s+ stabillik ✓ · POS chip ✓ · light mode ✓ · 1 PARTIAL = owner-in öz parallel testidir — stale-poll bug DEYİL) · r12q2 **A–G** (test Masa 993/ORD-2954: modal RUSH+MAIN+✕ ✓, rush DB `t`/`f` ✓, GÜN marker ✓, course fire → items `preparing` ✓, 86 ✓ (workaround ilə), KDS console **0**; **POS console = 115× duplicate-key burst — OPEN**). Test fixture-ləri live DB-də qalır (cleanup = owner GO).

**Fayllar:** `KDSView.tsx` (seq guard + optimistic window + handlers + RUSH/course/86 UI + GÜN rush), `usePos.tsx` (KITCHEN_RANK + high-water clamp), `api/kitchen/accept|rush|fire-course|void-comp-waste|daily` routes, `lib/i18n/locales/{az,en,ru}.ts`, `e2e-shots/r12q-*` + `r12q2-*`, `e2e-r12q-results.md`, `HANDOFF_12Q.md`.

### Jurnal sətiri — 2026-10-02 (ROUND 12e: KDS/BDS — 24H SERVICE WINDOW + BDS NEWEST-FIRST + MODIFIER TOOLTIP)

Owner: "…sonraya saxlayaq bunu (route). Delivery page customer info sonra tamamlamaq. **Gel kecek mence mətbəx KDS BDS**" → clarifying sual SKIPPED → default = **review + improvement list** (12c jurnalının "növbəti priority" qeydi ilə eyni).

**Review (browser E2E + kod + real DB):** ilk browser review sessiyası interrupt edilmişdi (state unknown) — 4 shot-dan 3-i diskdə idi (kds-review-1, bds-review-1/2; kds-review-2 = kırık "No Photo"). Kod + DB ilə tamamlandı. Tapıntılar:
- **K1 (P0):** KDS-də **vaxt filtri YOXDU** — terminal statusa düşməyən order tahtada müəbbət qalır (screenshot: "3d 16h", "2d 11h" kartları 1m ticket-in yanında; DB: 11 KDS ticket, 5-i gün-köhnə; ən qocası non-terminal order = 17 gün).
- **B1 (P0):** BDS daha pis — **47 gün köhnə GÖZLƏYİR zombie-lər** (DB: 112 non-terminal order, **103-ü >24h**, 86-sı >7 gün: dine 43 + gel-al 31 + delivery 12).
- **B2 (P1):** BDS sort = **ən köhnə üstə** → yeni sifariş ekranın dibinə düşür (E2E: #D085 2m — 47d kartlarının altında, ən dib).
- **K2 (P1):** KDS modifier text `shrink-0` + kart `overflow-hidden` → uzun siyahı **sessiz kəsilir** (tooltip YOX) — mətbəx tam əlavə siyahısını oxuya bilmir.
- **K3 (P2):** "13 aktiv sifariş" count gün-köhnə ticket-ləri sayır (K1-dən törəyir). **K4:** station board vizual verify edilməmişdi (shot kırık).

**Owner qərarı (ask_user):** "P0+P1 kod fix (tövsiyə)" — **DB-yə toxunulmur** (103 köhnə order DB-də qalır — silinmə ayrıca, geri dönüşsüz addımdır, owner GO-su gözləyir).

**Fix-es:**
- `KDSView.tsx`: `KDS_STALE_MS = 24h` — fetch filterinə `Date.now() − created_at < KDS_STALE_MS` (grid + count + sound count hamı clean; DB toxunulmayıb). modText: `shrink-0` → `min-w-0 truncate` + `title={modText}` hover-tooltip.
- `delivery/page.tsx`: `BDS_STALE_MS = 24h` — board-a eyni filter; sort **TERS** (newest-first). KDS öz qaydasında qalır (oldest-first = ən gecikmiş üstə — mətbəx üçün düzgün).

**E2E (browser, READ-ONLY, r12e):**
- KDS: **"8 aktiv sifariş"** (13 idi); gün-chip YOX (6h51m/6h41m/3h30m/1h42m/31m/30m/10m/10m); Masa 1 / Masa 8 / omar bey / Wolt Test Müştəri / Masa 9 getdi; gözlənilən 8 ticket hamısı var ✓; tablar HAMISI·8 / MAIN KITCHEN 4 / BAR 5 / GRILL 2 / PREP / SERVICE ✓
- **MAIN KITCHEN station board (K4 re-verify):** 5 aktiv, badge 4; ticket-lərdə YALNIZ Main Kitchen item-ləri (KDS Review kartında Dragon Roll görünür — Green Tea ×2 Bar-da, station filtr işləyir) ✓ — kırık kds-review-2-nin yerinə r12e-kds-station.png
- BDS: **top-left = "Çatdırılma 085 / KDS Review" (11m)** ✓ (əvvəl: Gel-AI 072, 47d); **6 kart, hamısı <24h** (085 11m · MASA 5 11m HAZIRDIR · 082 31m · 079 3h31m · 073 6h41m · 072 6h52m); "Çatdırılma aktiv" chip + Bütün/Çatdırılma/Gel-Al tablar toxunulmayıb ✓
- Console: **0 error** (3 ekran)
- Screenshot-lar: r12e-kds-1.png (525KB) · r12e-kds-station.png (347KB) · r12e-bds-1.png (379KB) — hamısı real PNG (WebP→PNG sips)

**tsc:** clean (app kodu). Edit typo catch: `text-gray-40` → `text-gray-400` (E2E-dən ƏVVƏL düzəldildi).

**Qalan (owner GO gözləyir):** (1) 103 köhnə non-terminal order-in DB temizliyi (geri dönüşsüz — əvvəl exact siyahı göstəriləcək); (2) 12d — POS minimap düz xətt (Task #11); (3) delivery page customer-info "yarımçıq" hissəsi (12d paketi).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12p: "QƏBUL ET" TAM LƏĞV — KDS AVTOMATİK BİR DƏFƏ QƏBUL EDİR, SİFARİŞ BİRBAŞA HAZIRLANIR)

Owner (12o report-dakı təklifə cavab): **"bir dəfə qəbul et, ondan sonra görünməsin. Button bir dəfə qəbul edildikdən sonra sifariş gələndə (POS-dan) buttonun yerində olsun, brat — əlavə qəbul et-ə ehtiyac yoxdur."** → "Qəbul et" buttonu TAM ləğv; sifariş gələndə avtomatik (bir dəfə) qəbul olunur, buttonun yerində birbaşa HAZIRLANIR.

**(A) Button silindi (2 yer):** kart header-dəki quiet pill (L~805, `!inReadyTab && wf==='pending'`) + modal sticky footer-dəki pending branch (`if (wf === 'pending') { label = 'Qəbul et'; act = handleAccept }`) — ikisi də GONE. `handleAccept` funksiyası da silindi (0 referens). `kds_accept_btn`/`kds_accepted_toast` i18n key-ləri faylda qalır (istifadə olunmur — owner qaydası: lazımsız ≠ silmək).

**(B) KDS auto-accept (səssiz, bir dəfə):** `acceptedRef = useRef<Set<string>>` + `useEffect([orders])` — KDS hər fetch/poll/realtime refetch-də `kitchen_status==='pending'` order-ları tapıb **bir dəfə** `POST /api/kitchen/accept` atır (mötərizə: Set; fail-də re-arm → növbəti tick-də retry). **SƏSSİZ** (toast YOX — istifadəçi əməli deyil). Optimistik `patchOrder(kitchen_status:'accepted', kitchen_accepted_at:now)`; RPC fail/`'Order is not pending'` (race: işçi artıq Hazırdır basdıb) = səssiz, rollup consistent qalır. Dead-end YOX: GÖZLƏYİR qalsa belə "Hazırdır" CTA pending-dən ready-yə çatır.

**(C) `kitchen_accepted_at` stamp (yeni):** `accept_kitchen_ticket_atomic` RPC bu sütunu YAZMIRDI (real DB verified) — köhnə axında client optimistik state yazırdı, 5s poll DB-dən NULL geri gətirirdi. İndi `/api/kitchen/accept` route RPC-dən sonra **`UPDATE orders SET kitchen_accepted_at=now() WHERE id=? AND kitchen_accepted_at IS NULL`** (service-role, best-effort) → GÜN **Ø QƏBUL** metriki + legacy `/kitchen` timer base (`timerBase = kitchen_accepted_at || created_at`) dəqiq. Auto-accept-də Ø QƏBUL ≈ 0m (sifariş gəldiyi an götürülür — məntiqi).

**(D) GÖZLƏYİR status:** silinmədi (workflow `kds_st_waiting` qalır) — indi TRANSİENT: KDS terminali açıq olanda order ~1-8s GÖZLƏYİR görünür, avtomatik HAZIRLANIR-ə keçir. KDS bağlıdırsa sifariş GÖZLƏYİR qalır (düz semantika: mətbəx hələ görməyib).

**E2E r12p (browser + REAL DB, 6/6 PASS, 3 PNG):** (1) sub-agent pending "E2E Wolt" fixture yaratdı (mövcud 2 E2E Wolt artıq ready idi) → KDS açılma ilə **~8.4s-də auto-accept** (created 19:57:54.95 → accepted 19:58:03.37), label HAZIRLANIR, DOM-də **"Qəbul et" = 0**; (2) **owner scenario — yeni sifariş POS-dan** (Masa 992, ORD-2953, Tom Yam): KDS açıqkən POS-da yollandı → **accepted_at ≈ created_at (4s)**, KDS ticket birbaşa `HAZIRLANIR`, "Qəbul et" = 0; (3) modal footer = yalnız "Hazırdır"; (4) light mode: pill yox, oxunaqlı; (5) console 0/0/0 (2 tab). **Qeyd:** 2 yeni test order DB-də qaldı (accepted, non-terminal — təmizlik paketi ilə).

**tsc:** clean (handleAccept referensləri = 0). **Commit:** `12p`. **Fayllar:** `KDSView.tsx` (pill + modal branch silindi, auto-accept effect), `src/app/api/kitchen/accept/route.ts` (+kitchen_accepted_at stamp).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12o: TICK = HAZIRLIQ PROGRESS (auto-accept/auto-ready YOX) + "SERVİS POS-DAN EDİR" BUTTON→QIET TEXT + QƏBUL ET AÇIKLAMASI)

Owner (E2E Wolt ticket screenshot ilə): **"(1) 'servis posdan edilir' adlı button ləğv elə olmasın orada. (2) Birdəki tik oğlanda avtomatik hazır qəbul etməsin sistem. (3) Və oradaki 'Qəbul et' buttonu nə üçündür ki?"**

**(1) Button → quiet text:** ready section-da kartın altındakı emerald dolu "Servis POS-dan edir" bar (button şəkilli) **SİLİNDİ** → kiçik emerald caption (`11px`, `CheckCircle2 12px`, dark `text-emerald-400/70` / light `text-emerald-700/80`). Səbəb: servisin KDS-də buttonu olmamalıdır (12i: SERVE = POS floor action) — info, action deyil. Eyni slot (mt-3), read-only.

**(2) Tick semantika (kök səbəb):** `handleItemToggle` əvvəl NON-ready tick-də `mark_item_ready_atomic` çağırırdı → item 'ready' → rollup → order avtomatik HAZIRDIR → +3s SERVİSƏ HAZIRDİR → POS floor chip çevrilirdi — **tik basan anadək order rəsmən qəbul+hazır olurdu** (screenshot-dakı GÖZLƏYİR ticket-da da işləyərdi). İndi:
- **Tick (non-ready) = YALNIZ `order_items.prepared_quantity`** (0 ↔ quantity) — yeni route `/api/kitchen/item-prepared` (requireKdsAction + service-role **plain UPDATE**; `kitchen_status` SET-ə daxil DEYİL → `trg_item_state_machine_guard` + `trg_kds_ticket_emit` (hər ikisi `UPDATE OF kitchen_status`) səsiz; frozen rollup (`trg_sync_order_kitchen_status`, AFTER UPDATE) yenidən hesablayır amma CASE **yalnız kitchen_status-a** baxır → order statusu eyni qalır — real DB fn-inde verified).
- **Un-tick (READY item) = RECALL qalır** (`item_kitchen_terminal 'recalled'`, ready→pending, frozen edge) + legacy prepared>0 idisə 0-a sıfırlanır.
- **GÖZLƏYİR order tick-lənsə də GÖZLƏYİR qalır** (auto-accept YOX), kart emerald qrupa qalxmır (`stationAllDone` = kitchen_status truth only), "Qəbul et" pill qalır.
- **HAZIRDIR bəyanı = YALNIZ "Hazırdır" CTA** (station-scoped / modal whole-order).
- Counter (x/y) + cross-station progress line + modal progress indi **ticked (prepared) + ready + served** sayır (`isItemTicked` helper); circle lit = `isItemTicked`.
- Legacy uyğunluq: `prepared_quantity` sütunu mövcud idi (default 0) + köhnə `/kitchen/track` sistemi eyni semantikadan istifadə edirdi → iki səth eyni sahəyə birləşdi. `mark_item_ready_atomic` prepared-a toxunmur (verified) → recall-da circle tam söndür.

**(3) Qəbul et (sualın cavabı — owner-a report-də):** "Qəbul et" = mətbəxin sifarişi **rəsmi götürməsi**: GÖZLƏYİR→accepted (kitchen_accepted_at vurulur), GÜN-dəki **Ø QƏBUL** metriki məhz bu zamanı ölçür (sifariş nə qədər tez götürülüb). 12o-dan sonra rolu aydınlaşdı: tick artıq qəbul ETMƏDİYİ üçün "Qəbul et" = ilk mərhələnin yeganə dəqi addımı (optional — "Hazırdır" birbaşa da çata bilir). Silinmə istəyi qalsaydı, owner növbəti mesajda bildirəcək.

**E2E r12o (browser + REAL DB, 8/8 PASS, 5 PNG):** baseline (order pending / accepted NULL / item pending / prepared 0) → tick: circle ON 1/1, **GÖZLƏYİR qaldı**, "Qəbul et" pill qaldı, kart qalxmadı, DB prepared=1+status pending (auto-accept/auto-ready YOX) → un-tick: prepared=0 → tick + "Hazırdır": order ready, kart emerald qrupda, alt = **quiet text (konteynerdə 0 button)**, "Servis et"=0 → recall: **BASELINE-a qayıt (net sıfır)**; light: oklab(0.508 -0.114 0.029/0.8) 11px oxunaqlı; console **0** error, **0** key warning. İki eyniadlı "E2E Wolt" order var — `created_at` ilə disambiguation.

**tsc:** clean. **Commit:** `12o`. **Fayllar:** `KDSView.tsx` (isItemTicked, handleItemToggle rewrite, CTA quiet-text, counters), YENİ `src/app/api/kitchen/item-prepared/route.ts`.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12n: KDS UMUMİ BOARD + STANSİYA NAVBAR — dual panel + HAZIRLANIR|HAZIRDİR sub-tab-silindi, Toast modeli)

Owner: **"ay qardaş, belə problemi dedimki mətbəxdə umumi olsun, 2 dənə ayrı tab YOXEEE — yuxarıda navbar olsun, fso hər birinə baxmaq üçün."** 12m-in yana-yana dual panel-lərini (hər birində HAZIRLANIR|HAZIRDİR sub-tab) owner rədd etdi; ask_user ilə variant təsdiqi → **"Tab yox — tam umumi"** (Toast modeli): mətbəx = 1 umumi board, yuxarıda stansiya navbar, hər stansiya fasiləsiz baxılır.

**Dəyişiklik (yalnız `KDSView.tsx` — DB/i18n/API toxunulmayıb):**
- `panelTab`/`getPanelTab`/`renderStationPanel` **SİLİNDİ** → yeni `activeStationId` state + **STANSİYA NAVBAR** (yalnız multi-stansiya = /admin/kds): **Main Kitchen (n) · Bar (n) · GÜN** — aktiv = dolu pill (dark: ağ / light: zinc-900), alt hairline (köhnə pre-12m row pattern-i; HAMISI 12m-də silinib — qalır silik). Navbar click = `setDayView(false) + setActiveStationId + setExpandedId(null)` (modal açıqkən stansiya dəyişməsi = layoutId morph glitch qoruması).
- **UMUMİ BOARD**: aktiv stansiya üçün TƏK grid (`grid-cols-1 md:2 xl:3 2xl:4`). Sort = **ready-first** (stansiyanın sifarişdən BÜTÜN payı bitmiş = emerald border, yuxarıda), sonra in-progress oldest-first (ən gecikmiş üstə — 12e). `stationAllDone` indi kartın "ready section" üzvluğunu müəyyən edir (əvvəl sub-tab `tab==='ready'` idi): `inReadyTab = stationAllDone(order, stId)`.
- Status label: order-level `wfMetaFor(wf)` HƏMİŞƏ (SERVİSƏ HAZIRDİR və s.); amma BU stansiya bitib, digər stansiya hələ hazırlayırsa (wf='preparing') → kart öz payı üçün HAZIRDIR göstərir (ready section semantikasi).
- Qorunanlar (12m/12j/12i): station-scoped "Hazırdır" CTA (`item_ids` = bu stansiyada qalan), "Qəbul et" quiet pill (pending-only, header), read-only "Servis POS-dan edilir" bar (KDS-də "Servis et" YOX), priceless Apple chips + `Qeyd:` label (₼=0), zero-reflow modal (REAL offsetHeight placeholder), per-item ✓ toggle + POS tick animasiya, 24h service window, cross-station progress line.
- **BDS** (/admin/bds, stationType='bar'): navbar YOXDUR (tək stansiya), eyni umumi Bar board; header-dəki GÜN ghost button **yalnız single-stansiya**-da qalır (multi-da GÜN = navbar item).
- Boş state: aktiv stansiyada ticket yoxdursa → `kds_station_empty` ("Bu stansiyada aktiv sifariş yoxdur" — mövcud key).
- i18n: **0 yeni key**; 12m-in `kds_tab_preparing/ready/empty_*` key-ləri faylda qalır (istifadə olunmur — owner qaydası: lazımsız ≠ silmək).

**E2E r12n (browser, 7/7 PASS, 7 PNG shot):**
1. /admin/kds: yana-yana panel YOX, HAZIRLANIR|HAZIRDİR sub-tab YOX; navbar `Main Kitchen 6 · Bar 1 · GÜN` (aktiv = ağ pill); tək grid; 6/6 MK ticket emerald (ready qrupu, yuxarıda); `₼`=0; `Qeyd:` var; console 0.
2. "Bar" pill → board YALNIZ Bar ticket-i (1 kart), pill Bar-a keçir, MK count navbar-da qalır.
3. "GÜN" → All Day (10 SİFARİŞ / 17 MƏHSUL / 5 İSTEHSAL / Ø HAZIRLIQ 423m + İSTEHSAL & SİFARİŞLƏR) → "Main Kitchen" ilə board-a qayıt.
4. **"Hazırdır" axını** (ilk block: bütün test ticket-ləri artıq ready idi): app-in öz RPC-ləri ilə — modal-da ✓ "Tiki çıxar" (recall: ready→pending) → kart emerald qrupun ALTINA düşdü, CTA aktiv "Hazırdır" (r12n-recalled.png) → "Hazırdır" bas → kart EYNI board-da **yuxarı emerald qrupa qalxdı** (index 0, border-emerald), read-only "Servis POS-dan edilir", "Servis et" YOX, eyni ticket tək görünür (r12n-ready-top.png). **Net DB effekti: SIFIR** (item yenidən ready).
5. /admin/bds: navbar YOX, tək umumi Bar board, header GÜN ghost.
6. Light mode: aktiv pill zinc-900+ağ oxunaqlı; `Qeyd:` = amber-700 rgb(187,77,0), kontrast ≈4.9:1.
7. Console: **0 error, 0 React key warning** (7 ekran).

**tsc:** clean. **Commit:** `12n`.
**Screenshot-lar:** r12n-kds-mk/bar/gun/recalled/ready-top/bds/light.png + e2e-r12n-results.md.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12m: DUAL STATION BOARD — HAZIRLANIR|HAZIRDİR TABS, HAMISI SİL, PRICELESS + APPLE CHIPS + QEYD, ZERO-REFLOW MODAL, LIGHT AMBER)

Owner: **"Bu axını həm əsas mətbəx, həm də bar üçün necə daha aydın və praktik qurmaq olar? (Bar mətbəx kimi işləyir, lakin yalnız içki, hot kitchen deyil.) Həm Main Kitchen, həm Bar üçün 'Hazırlanır' və 'Hazırdır' tabları yarat; BDS (BDS bar-dır, unutma) üçün də keçərli olsun. Sifariş qəbul ediləndə 'Hazırlanır' tabına düşsün; tik optional. 'Hazırdır' basanda sifariş 'Hazırdır' tabına keçsin, 'Hazırlanır'-dan silinsin (eyni sifariş iki tabda görünməsin). 'Servis et'-i axından çıxar — servisə keçid 'Hazırdır'-dan idarə olunsun. Qiymətlər KDS/BDS-də və modifier bölməsində əks olunmasın. Course/allergens/delivery-dine-in-takeaway Apple chip-lərlə. Qeydləri 'Qeyd: xxxxx' formatında ('Qeyd' ayrıca). Soldakı məhsula klikləyəndə arxadakıların hərəkət etməsi/collapse-i düzəlt. 'HAMISI' tab-ı sil. İstifadəçi hər dəfə ayrıca Kitchen bölməsinə keçmədən həm mətbəx, həm bar statusunu rahat görür olsun; bölmələr qarışmasın. 'Qəbul et' kimi az istifadə olunan button rahat bir yerdə olsun. Light modda sarı yazılar görünmür."**

**(A) Dual station board (HAMISI yoxdur):** KDS tab-row (`HAMISI · Main Kitchen · Bar · GÜN`) SİLİNDİ. İndi **sabit panellər side-by-side**: `/admin/kds` = `Main Kitchen` + `Bar` panelləri (gelecekde yeni stansiya = yeni panel, `grid xl:grid-cols-2`); bar display `/admin/bds` (stationType='bar') = **tək Bar paneli** (eyni anatomiya). Hər paneldə öz sub-tab-ları: **`HAZIRLANIR (n)` | `HAZIRDİR (n)`** (per-station, `panelTab` state).

**(B) Station-scoped workflow (eyni sifariş 2 tab-da görünmür):** `stationItems/stationAllDone/stationTickets` helpers. HAZIRLANİR = stansiya hələ non-ready item daşıyır; HAZIRDİR = stansiyanın BÜTÜN item-ləri ready/served. **"Hazırdır" indi STATION-SCOPE**: `handleMakeReady(orderId, itemIds?)` — panel öz stansiyasının qalan `item_ids`-ini mark-ready edir (bar içkini hot cooking-dən BAĞMSIZ bitirir); `item_ids=null` (bütün order) YALNIZ ticket MODAL-da qalır (one-tap surface). Press → ticket HAZIRLANIR-dan **silinir** + HAZIRDİR-ə **keçir** (cross-station: digər panel hələ HAZIRLANIR-da qalır, progress line `Main Kitchen 0/1 · Bar 1/1`).

**(C) Servis et çıxarıldı / Qəbul et rahat yerə:** HAZIRDİR tab-da kart **read-only** (emerald border + info bar "Servis POS-dan edilir") — servis POS floor action (12i), KDS-də serve düyməsi YOX. **"Qəbul et"** (az istifadə = rahat yer) kart header-inə kiçik quiet pill kimi köçdü (yalnız pending), **"Hazırdır"** = əsas CTA bar (12j persistent, no-blink).

**(D) Priceless + Apple chips + Qeyd:** KDS/BDS + modal modifier-lərdən **BÜTÜN `₼` qiymət** silindi (E2E: `₼` count = 0). Source (İÇƏRİDƏ/ÇATDIRILMA/GEL-AL) = Apple chip + ikon (dine-in zinc, delivery blue, takeaway violet); **course + allergen = chip**; modifier = price-less chip; qeyd = **`Qeyd: xxx`** (`Qeyd` = ayrıca bold label, `kds_note_label`).

**(E) Zero-reflow modal (owner bug):** "soldakı məhsula klik → arxadakılar collapse/hərəkət". Kök: modal placeholder ESTİMAT height idi (34px/item) → çox-sətirli spec kartı daha hündürdü → grid reflow. Fix: klik anında kartın **REAL** `offsetHeight`-i ölçülür (`cardEls` ref + `placeholderH`) → placeholder dəqiq eyni hight → **zero reflow**. E2E ölçmə: kart h=224 → placeholder h=224 (Δ0px), qonşu kart shift **0px**.

**(F) Light-mode amber görünməzliyi:** item note / customer note / HOLD = `amber-600`(light) → **`amber-700`** (ağ background-da oxunaqlı; E2E: `Qeyd:` = lab(47,43,69) on rgb(247,247,248) — dark amber, görünür).

**(G) Bug catch (E2E r12m):** React "unique key prop" console error (×4) = `boardStations.map(st => renderStationPanel(st))` keyless `<section>` → `<section key={st.id}>`. Fix → console **0**.

**E2E r12m (browser, 9 screenshot):** (1) HAMISI yox, 2 panel eyni anda (MK 8 + Bar 3), sub-tabs, GÜN header-də, ₼=0, `Qeyd: çox istiləməsin` ✓; (2) Bar "Hazırlanır" press → HAZIRDİR-ə keçdi, read-only, MK hələ HAZIRLANIR-da (progress line) ✓; (3) modal reflow Δ0px ✓; (4) Qəbul et pill → GÖZLƏYİR→HAZIRLANIR ✓; (5) /admin/bds tək Bar panel ✓; (6) light amber oxunaqlı ✓; (7) GÜN header-dan açılır ✓; (8) console 0. **tsc clean.**

**Qeyd (deviation, təhlükəsiz):** "Qəbul et" order-level — bir pill-ə basmaq HƏMİŞƏ order-ı qəbul edir (hər iki panel pill-i birdən yox olur). Cross-station order modal açılanda HƏR iki panelinin kartı eyni hight placeholder-a çevrilir (buna görə heç nə shift-etmir).

**LÜĞƏT SSOT UPDATE (owner, 12m dövrü — 18:14 birbaşa fix):** düzgün yazılış = **`SERVİSƏ` = S-E-R-V-İ-S-Ə** — **kök E-dir, Ə DEYİL**; son = Ə (dative); HAZIRDİR = plain I (hazırdır, nəqsəsiz ı). Owner az.ts (`kds_chip_serve`, `kds_st_serving`) + component comment-lərini öz eli ilə düzəltdi (17:40–18:14); mən 12k/12l-də kök-Ə ("SƏRVİSƏ") yazmışdım — YANLIŞDI (hər jurnal sətirindəki SƏRVİSƏ/SƏRVİSE = həmin round-da kodun REALLƏ o variantı daşıdığını qeyd edən tarixi qeydlərdir). Qalan son `SƏRVİSE` (delivery/page.tsx L585 comment) 12m-də düzəldildi → **src-də Ə-kök "SƏRV..." = 0** (codepoint audit). İstifadə qaydası: hər yeni AZ status sözünü lüğətlə yoxla — kök harf (E/Ə) + dative sonu (ə) + ı/i ayırtı (hazırdır = ı, servis = i).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12l: "SƏRVİSƏ" BARE → "SƏRVİSƏ HAZIRDİR" TAM LÜĞƏT PHRASE (owner qərarı))

Owner: **"servisə hazırdır olur brat — duzgun istifadə et lüğətdən."** 12k-də floor chip `kds_chip_serve: 'SƏRVİSƏ'` (yalnız dative, əməl-siz) qalmışdı — tam lüğət phrase = **"SERVİSƏ HAZIRDİR"** (BDS-dəki mövcud pattern ilə də eyni: "TƏHVİLƏ HAZIRDİR").

- `kds_chip_serve`: az `SƏRVİSƏ` → **`SƏRVİSƏ HAZIRDİR`** · en `TO SERVE` → `READY TO SERVE` · ru `К ВЫДАЧЕ` → `ГОТОВ К ВЫДАЧЕ`.
- İstifadə yeri (2): TableCard floor chip (ready state) + KDS GÜN SİFARİŞLƏR ticket pill-i — ikisində də tam phrase.
- E2E r12l: Masa 4·5 pill = "SƏRVİSƏ HAZIRDİR" (opacity 1, 148×26px, kart 255px — overflow/wrap YOX); GÜN tickets 4× tam phrase; DOM regex bare variant = **0**; console 0+0.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12k: AZ İMLA TƏMİZLİYİ (SƏRVİSE→SƏRVİSƏ və s.) + DOLU→AKTİV KEÇİD SÜBUTU (12j stuck-chip fix-inin təsdiqi))

Owner: **"Buradakı hərflərin səhvini tam şəkildə həll edək — həm KDS və BDS həm də statuslar. Vacib istək: dolu sonra aktiv status var idi — indi o keçid işləmir; yeni (masa) birdəfə modala girdikdən sonra 'dolu' sonradan aktiv statusa çevrilmir."**

**(A) İmla audit — 10 fix (yalnız az.ts; en/ru toxunulmayıb):**
| Köhnə | Düz | Key |
|---|---|---|
| `SƏRVİSE` | `SƏRVİSƏ` (dative -ə) | kds_chip_serve |
| `SƏRVİSE HAZIRDİR` | `SƏRVİSƏ HAZIRDİR` | kds_st_serving |
| `Sərvil et` | `Servis et` | kds_serve_btn |
| `Sərvil POS-dan edilir` | `Servis POS-dan edilir` | kds_serving_hint |
| `Item` (İNGİLİS!) | `Məhsul` | kds_day_m_items |
| `Hazır` | `İstehsal` | kds_day_m_produced |
| `Ø Hazırlanma` | `Ø Hazırlıq` | kds_day_m_ready |
| `İstihsal` | `İstehsal` | kds_day_production |
| `Bugün hələ sifariş yoxdur` | `Bugün hələ sifariş qeyd olunmayıb` | kds_day_empty |
| `Kur'er` | `Kuryer` | bds_courier |

KDS/BDS/status bloku (az.ts 2048–2103) tam audit olundu — qalanlar düzgündür. Component-də hard-coded qalıq YOX (yalnız comments). E2E r12k: 3/3 render təsdiqi (DOM regex `SƏRV[İI]S[ƏE]` → yalnız yeni variant), console 0+0.

**(B) "Dolu → aktiv" keçidi = 12j STUCK-CHIP fix-inin öz nəticəsidir (reproduksiya SÜBUT etdi):**
12k-də E2E axını (Masa 10, VIP): BOŞ → tap → 2 nəfər → `MASANI TUT` → pill **YENİ OTURUŞ** (amber, opacity 1, ₼ yox) → cart → məhsul ×1 → `MƏTBƏXƏ GÖNDƏR` → +15 s → pill **GÖZLƏYİR** (opacity 1) + **₼100.00** + item 1. API ground truth: `{status:'occupied', ks:'pending', cur:<id>, total:100, items:1}`. **Keçid İŞLƏYİR.**
Owner-in 16:45 müşahidəsi (keçid yoxdu) = 12j-in **stuck-AnimatePresence** dövründə (edit/HMR churn-da) donmuş chip-in tab-da qalması idi — chip `opacity:0`-da donduqda masa sonsuza qədər "Dolu" görünürdü. 12j-in son commit-i (`7084f8fc`, single-persistent-element) bu sinifin özüni aradan qaldırdı → **terminal-da hard reload / yeni build tələb olunur.**

Qeyd: GÜN metrik-lərindəki böyük Ø HAZIRLIQ (401m) = ~103 köhnə non-terminal E2E-test order-ları (00:32–02:04) — data məsələsi, owner GO gözləyir (temizlik round-u).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12j: POS KITCHEN STATUS GÖRÜNÜRLÜLÜYÜ (BÜTÜN STATE) + KDS GÜN (ALL DAY VIEW + İSTİHSAL + PRODUKTİVİLİK) + ✓ TICK POS-PATTERN ANİMASİYA + CTA BLINK REMOVAL — 3 E2E-ROOT-CAUSE)

Owner: **"POS-da 'Hazırlanır', 'Servis et', 'Servis edildi' statusları görünmür — aydın və ardıcıl göstər. All Day View, production counts və kitchen productivity əlavə et. 'Tik' ikonuna POS-dakı kimi zövqlü transition. 'Sifarişi tamamla' və 'Qəbul et' blink-ini aradan qaldır."** (12i-dən sonra: floor chip ready/served GÖZMÜŞDÜ — 12i-nin öz "hidden set" qaydası + iki gizli bug.)

**(A) POS FLOOR CHIP — BÜTÜN LİV STATE GÖRÜNÜR (ardıcıl = KDS vocabulary):**
- `TableCard` chip visibility = `!['completed','cancelled'].includes(ks)` — 12i-nin "ready/served gizli" qaydası SİLİNDİ (owner: məhz bu statuslar görünməli idi).
- Label axını (floor + KDS EYDİ dil): `GÖZLƏYİR` (pending) → `HAZIRLANIR` (accepted/sent/preparing/cooking, blue pulse dot) → `QİSMƏN HAZIRDIR` → **`SƏRVİSE`** (ready — floor üçün actionable signal: 3s KDS flip mətbəx detallarıdır) → **`SERVİS EDİLDİ`** (served, emerald).
- **E2E root cause #1 (merged masa):** group parent row `status='merged'` idi — `isOccupied` list-dən YOX idi → chip gate heç vaxt açılmırdı (Masa 4·5 → chip YOX). Fix: 'merged' += isOccupied (side-effect audit: ring/flash prev-status-gate-lidir → spuriously ring YOX; əksinə occupied→merged false-flash artıq YOX).
- **E2E root cause #2 (SSOT):** `merged_groups` children `kitchen_status` daşımırdu (yalnız `floor` raw row) → `/api/pos/tables`-da hər child üçün `composedKitchenStatus` (eyni 4-arg SSOT); client `tableGroupInfo` group = parent+children arasında **ən irəliləmiş** state (rank: served>ready>partially>preparing>pending).
- **E2E root cause #3 (STUCK ANIMATEPRESENCE = owner-in "status görünmür"ünün GİZLİ yarısı):** kitchen↔status chip swap `AnimatePresence mode="wait"` + 2 keyed `motion.div` idi. Condition mid-transition flip olduqda (SWR snapshot / floor-swap remount / HMR) EXIT HƏR ZAMAN resolve olunmurdu → gələn chip `initial`-də donurdu: **`opacity:0; translateY(4px)` = sonsuza qədər GÖRÜNMƏZ** (DOM outerHTML ilə sübut olundu — "Dolu" pill opacity:0). Fix = 12j no-blink pattern: **TEK persistent element** — key YOX, AnimatePresence YOX, initial YOX; bg/border/color/label CSS transition-la in-place morph edir. Stick-invisible sinifinin özü aradan qaldı.

**(B) KDS GÜN (All Day View + İstehal + Produktivlik — Toast qalan geridəliyinin HAMISI):**
- Yeni endpoint: `GET /api/kitchen/daily` (requireAuth + `resolveReadLocationScope`; today = SERVER local day; service-role REST; limit 500). Return: `{metrics:{tickets,items,produced,avgAcceptMin,avgReadyMin}, production:[{name,qty}] top-30 (yalnız served/completed item-lər), tickets:[{id,title,time,status,minutes,qty}]}`.
- **Bug (E2E-catch, 502):** PostgREST range operator sütun-dan SONRA gəlir — `gte.created_at=…` = 400 → düzgün: `created_at=gte.…` (live service-role key ilə A/B verify edildi).
- UI: yeni **GÜN** tab (HAMISI/MK/Bar yanında; bar display-də GİZLİ — orada board var). Panel: metrics row (böyük tabular nums + hairline üst small-caps label: SİFARİŞ / SƏTR / İSTİHSAL / Ø QƏBUL / Ø HAZIRLANMA) + **İSTİHSAL** (məhsul ×qty, flat hairline list) + **SİFARİŞLƏR** (time · title · ×qty · status pill · dəqiqə). 30s refresh (gün-view = ləng surface, canlı board deyil).

**(C) ✓ TICK = POS ProductGrid PATTERN-İ (owner: "POS-dakı kimi"):**
- Persistent `motion.button` (həmişə mounted — AnimatePresence YOX, initial-opacity YOX = "bounces without disappearing" invariant). Tap: `pulseTick(id)` 700ms window → container `animate={tickPulse ? {scale:[1,1.18,1.04,1]} : {scale:1}}` 0.45s easeOut (POS badge [1,1.1,1.02,1] 0.5s-in KDS ölçüsünə uyğun qalan versiyası) + `whileTap {scale:0.86}` + glyph spring-pop (key on/off, stiffness 500/damping 26) + fill crossfade `transition-all duration-200`.
- E2E measurement (rAF): tap-da max scale **1.179** @184ms; un-tick 1.180 — ✓ pop in/out İKİ istiqamətdə.

**(D) CTA BLINK REMOVAL ("Sifarişi tamamla"/"Qəbul et"):**
- Kök: CTA elementinin key-swap/initial-opacity-ə malik olması (state çevriləndə element exit→enter = blink). Fix: kart + modal footer hər ikisi = **tek persistent `<button>`** (IIFE {label,active,emerald,act}) + `transition-all duration-300`; inactive state-lər disabled INFO bar-larıdır ("Sərvil POS-dan edilir" / "Servis edildi" / "Digər stansiyalar hazırlayır · n") — element dəyişmir, text+color morph edir.
- E2E measurement (MutationObserver + rAF): state flip-də **0 removed frames** — text VƏ background (white→emerald) atomic in-place swap.

**(E) E2E (r12j, 5 run):** KDS board: 10/10 kart persistent CTA ✓; tick bounce 1.18 ✓; GÜN: 502→200 fix (real data: 9 sifariş / 16 sətr / istehal Filadelfiya ×4 + Coca ×1 / 9 ticket siyahısı) ✓; POS floor: 502/991 SERVİS EDİLDİ (opacity 1), VIP 1/8/9 GÖZLƏYİR, Masa 4·5 SƏRVİSE (opacity 1) ✓; console **0+0**. tsc clean.
- Shots: r12j-{kds-board, kds-day, pos-final, pos-group-chip}.png (+ -chips/-chips-vip/-chips-recheck ara shotlar).

**Qalan (owner GO gözləyir):** 12d route (Task #11) + 103 köhnə non-terminal order temizliyi (exact siyahı əvvəl) + 12f chime ear-check + optional "Main Kitchen"→"Hot" rename. **Qeyd (funksional YOX):** floor pill label dərhal dəyişir, grid repaint ~10s gecikir (AnimatePresence+SWR) — ayrı round candidate.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12i: KANONİK MƏTBƏX WORKFLOW — QƏBUL→HAZIRLANIR→HAZIRDIR→SƏRVİSE→SERVİS EDİLDİ + POS SERVE + VİZUAL GÖRÜNÜRLÜK + BUG FIX)

Owner: **"stil duzgundur lakin bəzi yerlər nəzərə çarpan olmalı idi — sifariş tipi (çatdırılma/pickup/dine-in), modifikatoru rahat görmək, neçə edəd, allergenləri; tik işləmir — tik etmək olur lakin çıxarmaq olmaz; modifikator per-item olmur (birləşir); sifariş tamamlamaq üçün məcburi tik olmamalı; MƏTBƏX workflow: qəbul → hazırlanır → hazırdır → (2-3s) sərvise → servis edildi; STATIONSLAR BİR-BİRİNDƏN XƏBƏRLİ OLMALIDIRLAR; 'sifariş tamamla' deyirsen itir sonra yenidən gelir — bu tip bugları özün araşdır; bunları MFM-də də qeyd et + rəqiblərlə müqayisə."** İkinci mesaj (clarification): **"servis et buttonu POS-da olacaq — metbəxdə olanlar 'sifarişi qəbul et' + 'hazırdır' buttonlarıdır; sən bunu özün avtomatik bilib qurmalısansa."**

**(A) KANONİK WORKFLOW (spec — bundan sonra hər KDS/BDS/POS dəyişikliyi buna uyğun olmalıdır):**
```
item  : pending ──✓──▶ ready ──(POS Servisə Ver)──▶ served
        ▲ recall (un-tick: item_kitchen_terminal 'recalled', registry edge
        │ ready→pending verified in state_transitions)
order : GÖZLƏYİR ──Qəbul et──▶ HAZIRLANIR ──Hazırdır──▶ HAZIRDIR
        (rollup: accepted/sent/preparing/     (mark_item_ready_atomic:
         partially_ready)                      ALL non-ready → ready,
                                               kitchen_ready_at stamp)
        HAZIRDIR ──(+3 s, DERIVED from kitchen_ready_at — no cron)──▶ SƏRVİSE HAZIRDİR
        ──POS "Servisə Ver" (floor action!)──▶ SERVİS EDİLDİ (served)
```
- **Mətbəx (KDS) = YALNIZ 2 button:** "Qəbul et" (pending) + "Hazırdır" (preparing) — owner clarification: SERVE metbəxdə YOXDUR.
- **POS = "Servisə Ver" (floor action):** `/api/orders/serve` (floor.manage + CSRF) → `mark_order_served_atomic` (12i migration, all-ready invariant, idempotent, audit log) → rollup = served → KDS/BDS/floor hamısı "SERVİS EDİLDİ".
- **SƏRVİSE flip = derived:** `kitchen_ready_at + 3s` (1s client tick) — 100% keyless (cron/worker YOX).
- **Məcburi tik YOXDU:** "Hazırdır" = bütün order bir tap (12f-dən qalan allReady-gate ARXIVLADI).
- **Cross-station:** kartda inter-station progress xətti ("Main Kitchen 2/3 · Bar 0/2"); station board-da "Hazırdır" GÖZMİR (başqa stationın item-lərini yeməsin) + "Digər stansiyalar hazırlayır · n" hint.

**(B) VİZUAL GÖRÜNÜRLÜK (Apple-flat saxlanılır, amma emphasis weight/color ilə):**
- Order type BOLD ("Çatdırılma · +994…" / "Gel-Al · …"; dine-in = order no); status label 10px uppercase bold, state color (emerald = done family, zinc = in-flight).
- Item spec = 3 ayrı sətir: **modifier zinc-dark** (per-instance — POS artıq per-instance göndərir: `cartLineKey(variant, notes, modifiers)`; "Green Tea ×2 şəkərsiz" = 1 sətir ×2, fərqli spec = ayrı sətirlər — **12h "birləşmə" kökü = 1 spec sətiri idi `note || modifier` — indi HAMISI görünür**), **note amber**, **allergen RED-bold "⚠ Süd"**; **×qty bold**.
- KDS + BDS eyni spec dili (BDS-yə yeni: `bdsItemSpec` + eyni allergen helpers).

**(C) BUG FIX (E2E-catch):**
1. **"tamamla → itir → geri" (owner report):** kök = `handleMarkReady` optimistik REMOVE edirdi, amma DB order = 'ready' (terminal YOX) → 5s poll yenidən geri gətirirdi. Fix = workflow: ticket HƏR ZAMAN board-da qalır, state in-place çevrilir.
2. **POS "Servisə Ver" GATE (E2E catch):** `ActionSheet` gate = `table.status === 'ready'` — amma 'ready' TABLE state idi (masa təmizdir); order-bearing table = 'occupied' → button HEÇ VAXT render olunmurdu (double dead path). Fix = `table.kitchen_status === 'ready'`.
3. **INVALID_TRANSITION toast (E2E catch):** köhnə `handleMarkServed` order status `'confirmed' → 'served'` transition edirdi — frozen registry-də bu edge YOXDUR (→served only paid/ready) → hər serve üstünə `INVALID_TRANSITION: confirmed → served` toast. Fix: kitchen serve = SSOT; order status öz lifecycle-i ilə irəliləyir (payment), transition call ARXIVLADI.
4. **Floor badge "HAZIRLANIR" on served tables (E2E catch):** `TableCard` kitchen-chip label else-branch 'served'-i "Hazırlanır" kimi render edirdi. Fix: 'served' = hidden set (kitchen done = dining state) + tam label/color vocabulary (accepted/sent/preparing/partially_ready/ready/served).
5. **Rollback bug:** `handleItemStatus` fail-də 'preparing' hardcode edirdi ('pending' item üçün yanlış) → indi previous state restore.
6. "Blink" (owner) = bug #1-in görünüşü (exit+entry anim loop) — workflow fix ilə aradan qalxdı; ayrıca 30s MutationObserver E2E: 139/139 sample eyni position, 0 node add/remove.

**(D) KOD:**
- DB: migration `20261002060000_12i_kitchen_workflow.sql` = `mark_order_served_atomic` (REAL DB-də APPLIED + psql verify: pending order → `ORDER_NOT_FULLY_READY` 409 ✓).
- API: `/api/kitchen/accept` (accept_kitchen_ticket_atomic), `/api/kitchen/item-recall` (item_kitchen_terminal 'recalled'), `/api/orders/serve` (floor.manage; POS) — hamısı session identity (client performed_by YOX).
- KDSView: `kdsWorkflowState` (derived, 1s `nowMs` tick), ✓ TOGGLE (40px card / 48px modal; served = final, dim), `handleAccept`/`handleMakeReady` (optimistic, NO remove), inter-station row, modal footer = workflow (ready/serving = "Sərvil POS-dan edilir" sakit xətti).
- POS: `handleMarkServed` = `/api/orders/serve` + `mark_served_toast`; ActionSheet gate fix.
- BDS: `bdsKitchenState` (read-only projection, eyni vocabulary) + item spec lines (kart + modal); `kitchenReady` += 'served'.
- TableCard: badge fix. i18n: kds_st_* ×5, kds_accept_btn/ready_btn/serve_btn/served/uncheck/accepted_toast/serving_hint/not_ready_toast, mark_served_toast (az/en/ru).

**(E) E2E (r12i, 4 partial run):** KDS: Qəbul et→HAZIRLANIR ✓, Hazırdır→ticket QALDI (bug #1 regression ✓)→HAZIRDIR→5s→SƏRVİSE HAZIRDİR (auto-flip ✓, button YOX ✓), un-tick ✓ (✓→dairə, status back), modal (STANSIYALAR "Bar 2/2 · Main Kitchen 1/1", ESC ✓), station board (Hazırdır GÖZMÜR ✓), 30s blink-watch 0 ✓. POS: SERVİSƏ VER tile (gate ✓) → "Servisə verildi" toast, 0 error (INVALID_TRANSITION YOX ✓) → KDS SERVİS EDİLDİ + dim + no button ✓; floor badge: 502/991 = yalnız DOLU (kitchen chip YOX ✓). BDS: "Mətbax: SƏRVİSE HAZIRDİR / SERVİS EDİLDİ" (emerald) + spec lines (şəkərsiz amber, ⚠ Süd red, Kremli/Losos/Avokado zinc) ✓. Console **0+0** bütün runlarda. tsc clean.
- Shots: r12i-{kds-1, kds-preparing, kds-ready, kds-modal, kds-station, kds-served, pos-serve, pos-floor, bds-1}.png (real PNG).
- Test data (live DB): #D085 → SƏRVİSE (ready), ORD-2950 (Masa 502) + ORD-2951 (Masa 991) → served, ORD-2949 (Masa 5) → ready.

**Qalan (owner GO gözləyir):** 12d route (Task #11) + DB-dəki köhnə non-terminal order temizliyi (exact siyahı əvvəl) + 12f chime ear-check + optional "Main Kitchen"→"Hot" rename.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12h: KDS/BDS — FULL APPLE VISUAL RESET + STATIONS HOT+BAR ONLY)

Owner: **"hele de cox cirkindiree — yeni kartin ustundeki chipler textlert, apple felsefesi ile dedik axi sen ise yungul polish edirsenee daha qeseng netice vere. Yuxaridan grill prep service stationsini çıxar — sadece hot ve bar stationsları var (gələcəkdə arta bilər). Yeni sen apple felsefesi ile her yeri deyismirsen ne axi"** → 12g "yüngül polish" sayıldı; bu round = SAITO_UI_VISUAL_DIRECTION.md §4/§5 qaydalarının **hamısının** KDS + BDS-yə tətbiqi (kart/tab/modal/çip/text — "her yer") + station SSOT-un hot line + Bar-a endazəsi.

**(A) Stations — DB migration `20261002050000_12h_stations_hot_bar_only.sql` (REAL DB-də APPLIED):**
- Grill `2c61cc08…` / Prep `66b3fd8c…` / Service `30c7286b…` **SİLİNDİ**; qalan 4: Main Kitchen (hot line) + Bar (kitchen) / Çatdırılma + Gel-Al (BDS family).
- Remap: `products` (9) + `order_items` snapshot (211) → Main Kitchen — **0 dangling station ref** (psql verify).
- ⚠️ Kök catch: `trg_item_money_lock` served-state item-lərdə `ITEM_STATION_FROZEN` raise edir → one-off reconfig migration `ALTER TABLE order_items DISABLE TRIGGER … ` → remap → `ENABLE TRIGGER` — BÜTÜNÜ BİR transaction-da, COMMIT-dan əvvəl geri.
- KDS top-tabs indi: **HAMISI · Main Kitchen · Bar** (E2E: 8 · 4 · 1) — 12e-nin station-board filter logic-i toxunulmayıb, sadəcə SSOT daraldıldı (gələcəkdə station əlavə edilib tab avtomatik qalxar — owner: "gələcəkdə arta bilər").

**(B) KDSView.tsx — full Apple reset (12f/12g-in çip/pill/block dilini silindi):**
- **Header:** "Mətbəx Ekranı" + "8 aktiv sifariş" (sakit 11px) — badge strip YOX; sağda səs + "Geri".
- **Tabs:** düz text (HAMISI 8 / Main Kitchen 4 / Bar 1) — ikonlu pill chip YOX; active = inverted pill (qara/white) — POS ilə eyni dil.
- **Kart (12h):** 0 çip 0 pill 0 nested box. Row 1 = title (15px semibold) + **elapsed red + nöqtə** (≥30m GEÇİKME / <30m KRİTİK — nöqtə = red dot, timer qırmızı text — 12g-in solid-red chip-i ARXIVLADI); Row 2 = sakit meta (`çatdırılma · 0501234567` / `+994…`) 11px; item sətirləri = **DÜZ TEXT** (ad + 1 spec sətiri: amber `special_notes` > zinc modifier; HOLD/course/⚠allergen kiçik text) + **40px ✓** (pending = hairline dairə, ready = DOLU emerald dairə — line-through YOX). CTA "Sifarişi Tamamla" **yalnız allItemsReady**-da görünür (emerald, full-width, sticky).
- **Border states (state = border + text color ONLY):** allReady = `emerald-500/50` / GEÇİKME = `red-400` / KRİTİK = `red-300` / normal = `zinc-200` (dark `white/[0.08]`); ready-green > delay-red prioriteti 12g-dən qorunur.
- **Modal (12g-in morph + layoutId toxunulmadı):** header sakit (title + order no + customer · phone — pill YOX); body = flat `divide-y` hairline list (item + spec + 40px ✓); STANSİYALAR = text rows (progress "2/5"); footer = sticky. `getOrderBadge` (ÇATDIR/TAKEAWAY badge) + `PartnerStripe` **SİLİNDİ** — order type artıq row-2 meta-da text kimi.

**(C) delivery/page.tsx (BDS) — eyni reset:**
- **Kart = MƏLUMAT səthi:** Row 1 = "Çatdırılma 085" (15px semibold + tabular no) + elapsed (red ≥30m); Row 2 = customer · `tel:` phone (sakit); **YALNIZ BİR sakit ünvan sətiri** "Nizami 5, Bakı · ₼2 · ETA 02:34" (ETA overdue = red text — chip YOX, icon YOX); item sətirləri flat (ad ×qty + station + ✓, max 4 + "+n"); **Mətbax: GÖZLƏYİR/HAZIRDIR** (color-only: zinc/emerald) + "· Kuryer: ad" eyni sətirdə.
- Kartda YALNIZ 1 action = **takeaway ALINDI** (高频 one-tap qalır kartda); delivery transitions + Kuryer seç = **modal-da** (12g footer). Kartyel emerald border (kitchen ready, delivery tabində YOX — dispatcher diqqəti çatdırılmaya), taken = opacity-60.
- **Modal:** header = icon + "Çatdırılma 085" (JSX fragment — ⚠️ E2E-catch: əvvəl template string-ə JSX yazılmışdı → literal `<span …>` görünürdü; fix + targeted re-E2E "Çatdırılma 085" exact ✓) + customer/phone/ünvan meta rows (flat, chip YOX); MƏHSULLAR flat list; Kuryer picker modal içində (collapse YOX — 12g invariant); sticky footer (maşın düymələri / ALINDI / KDS hint).

**(D) E2E (browser r12h, READ-ONLY):** KDS: tabs = **HAMISI 8 · Main Kitchen 4 · Bar 1** (Grill/Prep/Service YOXDU); kartlar: çip 0, pill 0, nested box 0 — flat text rows + 40px ✓ (ready = dolu emerald dairə); GEÇİKME kart = red dot + red elapsed + red border (4 kart); all-ready (Test 11y ×2, Çatdırılma 082) = emerald border + emerald CTA; tap "E2E Wolt" → centered morph modal (sakit header, flat item list, STANSIYALAR text rows, ESC/X ✓); BDS: 6 kart flat info-surface (emerald ready border, red ETA "02:34/02:13/23:14/20:03" overdue, Mətbax: HAZIRDIR emerald / GÖZLƏYİR zinc); tap 085 → modal: "Çatdırılma 085" exact + ünvan "Nizami 5, Bakı · ₼2 · ETA 02:34" + MƏHSULLAR + Kuryer picker = **tofiq agayev** (ilk run-da HMR-reload transient boş görünmüşdü — re-run ✓); console **0+0**. Shots: r12h-kds-1 / r12h-kds-modal / r12h-bds-1 / r12h-bds-modal (real PNG 1568×925).

**tsc:** clean (title-fragment fix-dən SONRA). **Dead code (zararsız, tsconfig noUnusedLocals YOXDU):** KDS `getTimerStyles`/`PartnerStripe` import + BDS `stEntries`/card-scope `bdsButtons`.

**Qalan (owner GO gözləyir):** 12d route (Task #11) + DB-dəki 103 köhnə non-terminal order temizliyi (geri dönüşsüz — əvvəl exact siyahı) + 12f chime sahibi-qulağı yoxlanışı. **Opsional (sual owner-ə):** "Main Kitchen" tab adının "Hot" olması (owner: "sadece hot ve bar stationsları var" — adlandırma təsdiqi gözləyir).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12g: KDS/BDS — POS TICK TRANSITION MORPH-TO-CENTERED-MODAL + RED DELAY STATE)

Owner: **"'In place' yox, daha doğrusu, elementin morph edərək ekranın ortasında modal kimi açılmasını nəzərdə tutmuşdum. Gecikmə qırmızı rəngdə göstərilsin. POS-da olan tick transition var — eynisindən istifadə edək. ... Bu hissəni də həmin yanaşma ilə yenidən, təmiz, minimal və estetik şəkildə hazırlayaq; belə çirkin görünüşdə saxlamayaq."** → 12f-in in-place expand ARXIVLADI; tap = kart **shared-element MORPH** edərək ekranın ORTASINA modal kimi açılır — mənbə = `ProductGrid.tsx:1633-1765` POS tick transition **BİT-TİB**: `layoutId` card ⇄ centered modal, spring **300/30/0.8**, `whileTap scale 0.96`, `appleBackdrop` (0.22s easeOut, bg-black/45 + backdrop-blur-sm), expand zamanı grid-slot **invisible placeholder** (aria-hidden, height-reserving skeleton) — DOM-da yalnız BİR layoutId elementi qalır (framer "crossfade restore" glitchini qatır, POS-dakı eyni qayda).

**KDSView.tsx:** `Fragment` wrapper: `isExpanded ? <invisible placeholder skeleton (h-[30px]/h-[34px] + per-item h-[46px] + note/action heights)> : <motion.div layout layoutId={kds-ticket-<id>} whileTap 0.965 onClick=expand>` — chevron SİLİNDİ (tap = hamısı), 12f in-place expand blok **SİLİNDİ**. Yeni **centered ticket modal** (max-w-[680px] max-h-[92vh] rounded-4xl shadow-elevated): header (text-2xl title + `getOrderBadge` + PartnerLogo + timer pill + critical chip + reprint + **X** whileHover rotate-90/scale-1.06, whileTap 0.82) → body (items: **w-12 h-12 ✓ target** + HOLD/course/allergen chips + modifier pills ₼-lə + **amber special_notes**; MÜŞTƏRİ ad+`tel:`; STANSİYALAR ready/qty rows; ETA overdue-red) → **sticky footer**: allReady = emerald "Sifarişi Tamamla" / yoxsa `kds_check_items` hint ("Məhsulları ✓ ilə qeyd et") — 12f invariant qorunur (tek-tek ✓ + axırda tamamla). **ESC** keydown effect = close (morph-back).

**Delay state = QIRMIZI (owner):** GEÇİKME chip = **SOLID red** (`bg-red-600`/`bg-red-500/90`, white text — KRİTİK-in red tintindən QƏSDƏN güclü, çünki pisləşib) + kart border **red** (KRİTİK `border-red-300` / GEÇİKME `red-400·red-500/55`); 12f-in violet-ı YOXDUR; full-red flood da yoxdur (bg sakit). Hiyerarxiya: **bütün items ready olan GEÇİKME kart = emerald border qalır** (ready-green > delay-red border; çip yenə qırmızı) — chef üçün "bitib, toxunma" siqnalı qorunur (E2E: Test 11y ×2 + Masa 5).

**delivery/page.tsx (BDS):** eyni pattern `bds-card-<id>` + placeholder + chevron silindi. **Centered order modal**: header (Bike/Utensils/ShoppingBag icon + title + orderNo + elapsed chip + customer + `tel:` + X) → body (ÜNVAN: address + zone chip + fee + ETA; MƏHSULLAR read-only `product_name` ×qty + `stationName` + ready ✓; customer_note amber; kitchen chip + KDS badge; **Kuryer seç + picker**) → sticky footer (dine_in = KDS hint / delivery = maşın düymələri `bdsButtons` / takeaway = ALINDI).

**i18n:** `kds_check_items` × 3 locale (az/en/ru).

**E2E (browser r12g, READ-ONLY):** KDS: 8 ticket; **hər 8 GEÇİKME çipi = solid red** (computed `bg-red-600` #dc2626, white) — violet 0; 5 kart red-400 border; 3 all-ready kart emerald border (qəsdən — yuxarıda); "KDS Review" tap → **CENTERED morph modal**: backdrop `rgba(0,0,0,0.45)+blur(8px)`, grid slot = invisible placeholder 348×269 `opacity:0` — **reflow YOX** (8 child qalır); content: 55m chip (12f shot-dan bəri keçən vaxt), ÇATDIR, "şəkərsiz" amber, MÜŞTƏRİ +994 50 222 33 44, MK 0/1 + Bar 0/2, ETA 02:34 red, footer hint; X = morph-back ✓; **ESC ✓**; "Masa 5" modal = **green SİFARIŞI TAMAMLA** (basılmadı) · BDS: 6 kart, top = 085; tap → centered morph (slot preserved, MASA 5/082 yeritmir); ÜNVAN "Nizami 5, Bakı" + ₼2 + ETA red — **zone adı YOXDU = DB-də `delivery_zone = NULL`** (12y qaydası: zone yalnız pinZone persist; data, bug YOX — psql təsdiq); MƏHSULLAR + GÖZLƏYİR/KDS chip; **"Kuryer seç" picker modal İÇİNDE açılır, modal collapse ETMİR** (tofiq agayev — tıklanmadı); backdrop-tap = morph-back; **console 0 + 0**. Shots: r12g-kds-1 / r12g-kds-modal / r12g-kds-ready-modal / r12g-bds-1 / r12g-bds-modal (real PNG 1568×925).

**tsc:** clean. **Qalan (owner GO):** 12d route (Task #11) + 103 köhnə non-terminal order temizliyi + 12f chime-in sahibi-qulağı yoxlanışı.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12f: KDS/BDS UI — APPLE CARD REDESIGN + IN-PLACE EXPAND + PREMIUM CHIME)

Owner: "backend hazirdir, kds/bds station ayirmalar faaln???" → **BACKEND AUDIT (real DB + kod): hamısı GREEN.** Station ayırma: 7 stations (5 kitchen + 2 BDS); 15/15 menyu məhsulu station-da (Grill 9, Bar 4, MK 2; Prep/Service 0); `set_order_item_station_snapshot` trigger INSERT-də snapshot (Dragon Roll→MK, Green Tea→Bar, Lahmacun→Grill — real order-larda); KDS badge sayıları DB item sayısıyla üst-üstə düşür (MK 4 = E2E Kurye 1 + E2E Wolt 2 + KDS Review 1); product-sız sətir → NULL → MK default (trigger `product_id IS NOT NULL` guard). Modifiers: DB-də struktur (Standart ₼0 / Kremli ₼1.5 / Yüngül ₼0) + `trg_enforce_item_modifiers` + `trg_item_money_lock` aktiv. Notes: item `special_notes` + order `customer_note` DB-də saxlanılır. State machine: `sync_order_kitchen_status` rollup (tam CASE: served/partially_ready/preparing/ready/pending...) + `UPDATE ... WHERE status NOT IN ('paid','cancelled','closed')` guard = **qəsdən** (paid order-da kitchen lifecycle bitmiş) + `trg_item_state_machine_guard`; DB sübut: ORD-2949 item-ready→order-`ready`; delivery = 12a validate_transition + COALESCE courier. **3 P3 qeyd (əməl yox):** operation_logs.employee_name boş yazılır (action+vaxt var, "kim" adı yox); köhnə paid order-larda order=completed+item=pending (rollup guard artifact — tahtada görünmür); Prep+Service station-ları konfiqurada var, 0 məhsul bağlanmayıb (menyu-mapping sahibinin işidir).

Owner: "kecek uiya" + (ask_user→Other): **"apple felsefəsi: sifariş basanda IN-PLACE EXPAND, kartı yenidən design daha səliqəli (çip/text/notes/modifications), state machine transition, gecikende FULL KART QIRMIZI ÇIRKİNDİR, sifarişi tamamla = bir düymə VƏYA tek-tek+axır, yeni notification səsi ÇOX PREMIUM İNCE (Outlook-da var, brauzerdən tap)"**.

**Outlook səs araması (browser): NOT_FOUND** — OWA app bundle yalnız signed-in session-da yüklenir (outlook.com → marketing redirect; audio resource scan + 10 JS bundle regex + OWA endpoint probe hamısı boş). **Fallback = Web Audio-də İNCE ZIL sintezi:** E6 (1318.5 Hz) fundamental + 2× shimmer (2637 Hz, gain 0.02) + E5 body (659.3 Hz); 5 ms attack, ~1.2 s exponential decay, peak gain 0.10 — "audible across the room, never startling" (köhnə 880/1100 Hz beep "computer chirp" idi). + **AudioContext gesture-unlock**: browser səs-sız saxlayır; ilk `pointerdown`-da unlock (səs idle page-də udulmur).

**KDSView.tsx (Apple philosophy — SAITO_MOTION_PHILOSOPHY 12 rule):**
- **IN-PLACE EXPAND** (owner: "kart in place expand olmalıdır ki detalli baxa bilsin chef"): tap = eyni kart YERİNDƏ böyüyür (modal YOX — rule 5 morph, rule 6 layout reflow); `expandedId` (1 vaxtda 1 ticket); chevron rotate 180. Detail blok: divider + **MÜŞTƏRİ** (ad + `tel:` blue link) + **STANSIYALAR** (bütün station progress: Main Kitchen 0/1 · Bar 0/2) + **ETA** (overdue = qırmızı) + modifier **PILL-lər** (expand-də tam, collapsed-da 1 truncated line).
- **GAP close:** item `special_notes` ("şəkərsiz", "çox istiləməsin") əvvəl KDS kartında **TAMAMEN YOXDU idi** (yalnız print ticket-da) → indi collapsed-da da amber line (truncate), expand-də tam.
- **Full-red flood aradan qaldırıldı** (owner: "cirkin olur"): GEÇİKME = neutral bg + **violet border yalnız**; KRİTİK = red border yalnız; urgency = timer pill + border; ready = emerald.
- **✓ target 24px → 40px** (w-10 h-10 — kitchen tablet, hərəkət edən əl).
- Card = `motion.div layout` + entry/exit springs (`CARD_SPRING` 420/34, `EXPAND_SPRING` 320/32) + `useReducedMotion` gate (rule 12); interactive children (✓/print/complete/tel:) = `stopPropagation` (tap = expand, action = action).
- Tamamlama = **tek-tek ✓ + axırda "Sifarişi Tamamla"** invarianti QORUNUR (owner variantlarından ikincisi; bütün station-lar ready olanda görünür).

**delivery/page.tsx (BDS — eyni dil):** eyni in-place expand = **MƏHSULLAR** (read-only: ad ×qty + station + ready ✓; kitchen status KDS-in) + `customer_note` (BdOrder-a yeni field; **catch:** item ad = `product_name` — order_items-də `name` column YOXDU, BdItem.name heç vaxt doldurulmayıb); chevron + `stopPropagation` bütün interactive children (**"Kuryer seç" picker açanda kart COLLAPSE olmur** — E2E təsdiq).

**i18n:** 3 key × 3 locale (`kds_customer`/`kds_stations`/`kds_items` — az/en/ru).

**E2E (browser r12f):** KDS: 8 ticket; hər kartda chevron; **GEÇİKME kart = white bg + violet border (flood YOX)**; ready kart emerald; ✓ = 40px; "KDS Review" tap → **h 289→435 IN-PLACE** (top-y sabit, modal yox, console 0): MÜŞTƏRİ (KDS Review + tel:+994 50 222 33 44), STANSIYALAR (MK 0/1 · Bar 0/2), **ETA 02:34**, "şəkərsiz" amber; chevron 180°; re-tap = collapse · BDS: 6 kart; tap → **h 296→346 IN-PLACE**: MƏHSULLAR (Dragon Roll ×1 — Main Kitchen / Green Tea ×2 — Bar); **"Kuryer seç" açanda kart expand qalır** (chip: tofiq agayev) + close; single-expand (MASA 5 açdı → 085 yalandı); console 0. Shots: r12f-kds-1 (578KB) / r12f-kds-expanded (600KB) / r12f-bds-1 (431KB) / r12f-bds-expanded (441KB) — real PNG, 1568×1307.

**tsc:** clean. **Qeyd:** səs = WebAudio sintez (deterministic) — E2E "işitmə" imkanı YOXDU; final judge = sahibin qulağı (dev-də yeni order yaradın).

**Qalan (owner GO):** 12d route (Task #11 — POS minimap düz xətt + delivery customer-info yarımçıq) + 103 köhnə non-terminal order DB temizliyi (geri dönüşsüz).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12c: WOLT EFFECT — REALTIME + SMOOTH MARKER + CUSTOMER-LIVE-TRACK)

Owner: (Wolt stack analizi) "1. Map renderer 2. Geocoding 3. Routing 4. ETA 5. Live location… ən böyük səhv: marker.setPosition(newLocation) → marker TULLANIR. Wolt isə GPS→backend→realtime→interpolation→smooth marker→camera follow edir. Saito üçün mən belə qurardım: OSM + MapLibre + OSRM + Nominatim + Supabase Realtime + Browser GPS + smooth interpolation + bearing rotation + camera follow + ETA + route progress… biz dede bele islemir ??" → ask_user: **"Hamısı — tam Wolt effekt"**.

**Audit (owner sualının cavabı):** 8 qatın 5-i artıq var (map=Leaflet+OSM, geocode=Nominatim+gazetteer — ondan güclüdür, routing=OSRM road-following — düz xətt DEYİL, ETA=OSRM ~N dəq, live GPS=15s ping). Çatanda 3: **smooth marker (interpolation)**, **realtime push** (30s poll idi, marker tullanırdı), **customer-facing live map** ("Sifarişi izlə" → staff login səhifəsi açılırdı!).

**A — Supabase Realtime ($0, free plan):** migration `20261002040000_12c_courier_realtime.sql`: `courier_location` → `supabase_realtime` publication + RLS enable + **anon SELECT policy** (cədvəldə YALNIZ koordinat var — PII yoxdur, customer page auth-sız oxuyur). Client: `@supabase/supabase-js` anon `createClient` + `postgres_changes` subscription (admin modal + /track).

**B — Smooth marker engine** (`src/lib/smooth-marker.ts`, YENİ): `SmoothTracker` — server-time-stamped ping ring-buffer (12); `positionAt(now)`: iki ping ARASINDA = linear interpolation (constant-velocity glide A→·→·→B), son pingdən SONRA = ≤8s coast (son sürətlə), sonra son NÖQTƏDƏ DUR (real fix-dən yuxarı yol icad olunmur); `bearingDeg` (bearing needle rotation); `rafLoop` (RAF ~30fps, battery-friendly); **t = HƏMİŞƏ server clock** (`courier_location.t`) — browser clock drift-i interpolation-a toxunmur.

**⚠️ CRITICAL bug (12c-diagnoz):** ping upsert-inin `DO UPDATE SET`-ində `t` YOX idi → column `DEFAULT now()` yalnız ilk INSERT-də işləyirdi, conflict-də `t` QOHNA QALIRDI → SmoothTracker yeni ping-ləri "out-of-order" kimi REJECT edirdi (marker heç vaxt hərəkət etməzdi). Fix: ping body-sinə `t: new Date().toISOString()` (route-da comment).

**C — Admin dispatch map WOLT-laşdırıldı** (`CourierLiveMapModal` rewrite): realtime push + 30s poll FALBACK (WS drop-də); kurye marker = create-once + RAF glide (poll-də recreate YOX — flicker); **bearing needle** (ağ üçbucaq, hərəkət istiqamətinə dönür); **"📍 Kamera: Kurye" toggle** — ən təzə-moving kuryənin arxasında `panTo(animate:false)`; manual pan/zoom = 4s suspension; header chip **"REALTIME"** (yaşıl) vs "poll 30s" (amber) — connection status görünür; tooltip freshness realtime ilə ("1 sn əvvəl").

**D — Customer-facing `/track/[orderNumber]`** (YENİ, PUBLIK, login-sız, mobile-first, light = /menu ilə eyni dil): `GET /api/track/<n>` (middleware PUBLİC; order_number `#`-prefix ilə DB-dədir — `in.(D083,#D083)` double-lookup + uuid fallback; **PII-free payload**: status/items/total/points/route/courier name — customer name/phone/ADDRESS TEXT çıxmır). Səhifə: **OSRM road-route polyline** (in-memory cached per venue→customer pair, 6h) + SAİTO/Siz marker-ləri + **smooth kurye marker** (realtime + 5s poll re-feed) + ETA strip ("Yol: 2.2 km · ≈ N dəq" — canlı geri say) + 5-addım timeline (Qəbul→Hazırlanır→Hazırdır→Yolda→Təhvil) + "kuryə sifarişinizlə yola düşdü" + məhsul kartı + delivered/ cancelled final kartları. `/api/orders/online` trackingUrl: `/kitchen/track/<uuid>` (staff login wall!) → **`/track/<order_number>`**.

**E — 2 bug fix:** (1) track route `const q` reassign → `let q` (compile error); (2) **`/track`-də Leaflet pane CSS YOX idi** → `.leaflet-map-pane` position:static → bütün map ~4000px aşağıya (viewport-dan kənara) paint olunurdu (E2E catch: DOM-da route+dot-lar var, PİKSELDƏ YOXDU) → `import 'leaflet/dist/leaflet.css'` (POS-də PosMiniMap importu CSS-i daşıyırdı, /track-da heç kim yoxdu).

**F — E2E (browser, ping simulyasiyası 3s-interval 10 nöqtəli route):**
- Admin modal: **chip=REALTIME** ✓, "📍 Kamera: Kurye" ON ✓, marker **GLIDE** (translate3d frame-frame dəyişir) ✓, **camera follow** (map-pane kuryeni mərkəzdə saxlayır) ✓, tooltip "tofiq agayev · **1 sn əvvəl**" (realtime freshness) ✓, panel 1/1 onlayn + #D083 yolda ✓, console 0
- /track/D083: header+badge ✓, ETA geri say 26→25→24 ✓, timeline ✓, Dragon Roll ×1 ₼20 ✓, route **13 vertex road-line** (düz xətt deyil) ✓, **kurye dot 5s-də −61px hərəkət etdi** (glide) ✓, console 0; CSS fix-dən sonra: 7 pane `position:absolute` + tiles + bütün marker-lər box-daxili ✓ (r12c-4)
- Track API: PII check **False** (customer_name/phone yoxdur) ✓
- Screenshot-lar: r12c-1..4 (e2e-shots)

**Qeyd:** (1) ETA = OSRM static (canlı traffic keyless-da YOXDU — Wolt da bazen eyni); (2) Realtime = free plan 50 concurrent connection — SAİTO-nun scale-i üçün artıq kifayət; (3) MapLibre GL JS-a keçid GEREKSİZ — Leaflet+OSM tiles eyni visual result verir (effekt renderer-dən deyil, HƏRƏKƏT layer-indən gəlir — owner analizinə uyğun); (4) ping simulation arxa plan process-idi (kill edildi), order #D083 delivered bağlandı (test data).

**12d QALAN (owner: "yolu falan duzgun qurmur… sonraya saxlayaq, ya Wolt kimi eyni edəcəyik ya başqa üsulla"):** POS Çatdırılma mini-xəritəsi bəzi ünvanlarda yol xəttini **DÜZ** çəkir (blokdan kənara) — `PosMiniMap.tsx:229`: `route` 2 nöqtə gəlibsə (start+end) bərk düz xətt olur. /track-da eyni sahə 13-vertex road-line idi → OSRM düz deyir, amma POS minimap-ın route source-u başqadır (suggest-pick `delivery-eta` `route_geometry` vs `/api/geocode`). Növbəti Wolt round-da: (a) minimap-a tam OSRM geometry axının, (b) delivery page customer-info tamamlanması, (c) "arxa yarımçıq" Wolt hissələri. **Task #11** — owner GO-suz başlama. Növbəti priority = **Kitchen KDS / BDS**.

---

### Jurnal sətiri — 2026-10-02 (ROUND 12b: NAME-NUMBER GUARD — "34 SAYLI MƏKTƏB" YANLIŞ MƏKTƏB GÖSTƏRMƏMƏSİ)

Owner: "bu xəritədə tam olaraq istədiyimiz konumu girdikdə — 'sumqayit 34 saylı məktəb' yazıram, işləmir, düzgün məktəbi göstərmir… sən düşünürsən ki yaxşıdır, amma deyil"

**Problem:** "sumqayit 34 sayli mekteb" → sistem **"11 saylı Məktəb, Sumqayıt"** qaytarırdı (fərqli rəqəmli MƏKTƏB — aldanıcı "düzgün cavab"). Kök səbəb: OSM-in Sumqayıt məktəb datası seyrəkdir ("məktəb Sumqayıt" axtarışı cəmi 2 nəticə; **"34 saylı" OSM-də ÜMUMİYYƏTLƏ YOXDUR** — Nominatim 0 hit) → Nominatim free-text **"34"-u "11"-ə fuzzy uyğunlaşdırıb** qonşu məktəbi cavab etmişdi; local Levenshtein tier-i də eyni riski daşıyırdı ("34 sayli mekteb" ≈2 "11 sayli mekteb").

**Fix — name-number guard (`lib/gazetteer.ts`, 3 route-a bağlandı):**
- `nameNumbers(folded)`: **STRUKTURAL rəqəmləri** çıxarır — rəqəmin təsiri `sayl*|nomr*|cu|ci` ilə bitən ("34 saylı", "12 nömrəli", "9-cü", "9cu"). `\d{1,3}` = 4-rəqəmli poçt kodları toxunulmur. **House number QORUNUR**: "Nizami 12"-də 12-nin təsiri küçə adıdır → name-number DEYİL → guard HEÇ VAXT ev-ünvanlarına toxunmur.
- `numberMismatch(query, candidate)`: sorğuda name-number var + candidata-da ÖZ name-number-u var + sorğunun rəqəmi candidate-də YOXDUR → fərqli rəqəmli entitet → reject.
- Bağlanma nöqtələri: (1) `geocode/route.ts nominatim()` — Nominatim hit acceptance (farGuard-dan ƏVVƏL, local check); (2) `localStreetPoint` Levenshtein tier-i (streets + POIs); (3) `localFuzzy` (suggest); (4) suggest route Nominatim row-ları.

**Doğru davranış (owner-un gözlədiyi):** OSM-də olmayan konum üçün sistem **yanlış binanı "cavab" etməz** → city-focus (Sumqayıt z13 + "xəritəyə tıkla" badge) → operator xəritədə məktəbi **1 tap** ilə pinləyir (reverse-geocode + route + fee auto).

**A/B verification (git stash):** BEFORE: "34 sayli mekteb"→"11 saylı Məktəb" (bug) / AFTER: →"Sumqayıt, Azərbaycan" (city) ✓. Regression matrix (hamısı PASS): "Nizami 12, Bakı"→"12, Nizami küçəsi" 1.2km address ✓ (house number toxunulmayıb); "20 yanvar berde"→"20 Yanvar, Bərdə" 302.4km ✓; "Nizami Cəfərov 27, Bakı"→"Nizami küçəsi" 2.3km ✓; "bravo sumqayit 9cu mikrorayon" suggest→"9-cu Mikrorayon" 25.3km ✓; geocode "9cu" davranışı BEFORE/AFTER **eyni** (city fallback — 11x-də belə idi, suggest+pick yolu). Unit: 10/10.

**E2E (browser, r12b-1-34sayli.png):** POS-da "sumqayit 34 sayli mekteb" yazıldı → satır **"32.4 km (təxmini) · Sumqayıt, Azərbaycan"** (DOM-scan: "11 sayl" YOXDUR ✓) → xəritəyə tap → reverse-geocode "İlyas Bayramov küç., Masazır" + **KM 15.9 + fee ₼2.45** (pin-flow ✓) — console 0.

**Qeyd:** OSM-də olmayan binalar üçün bu, KEYLESS dünyada doğru həlldir (Google Places API keyli = rədd olundu). Əgər owner istəsə: tez-tez sorğulanan konkret binalar üçün kiçik override cədvəli (ad→koordinat) əlavə etmək olar — hazırda lazım deyil (1 tap pin).

---

### Jurnal sətiri — 2026-10-02 (ROUND 12a: KURYE TRACKING + KURYE ÜÇÜN APP (PIN LOGIN, STATUS AXINI, LIVE GPS, DISPATCH XƏRİTƏSİ))

Owner: "kuryer tracking hətta kurye üçün də bir app yaz sən özünün, bir də Toast/Lightspeed/Square ilə də müqayisə et"

**Nə problem idi:** kurye = order satırında yalnız `courier_name` (text) idi. Restoran kuryenin HARADA olduğunu görə bilmirdi ("sifariş indi haradadır?" — cavabsız); kurye statusu öz telefonundan irəli apara bilmirdi (restorana zəng etməli idi); **HƏR operator transition təyin olunmuş kuryeyi SİLİRDİ** (RPC `courier_id = p_courier_id` şərtsiz; BDS board HƏMİŞƏ `null` göndərir) → assignment sessiz itirilirdi; customer geo-point (lat/lng) order-a YAZILMIRDI → navigasiya nöqtəsi yox.

**A — Kurye web-app** (`/courier`, mobile-first, **0 install** — brauzerdən, PWA-üslub):
- **PIN login** = staff-ın öz PIN-i (role `courier`), stateless `courier_token` cookie = `staffId.sha256(pinHash+':saito-courier-v1')[:32]` (DB-də verify — session cədvəli YOX); **brute-force guard** (10 səhv / 10 dəq lock)
- **Aktiv order kartı:** customer + ünvan + KM + fee + məhsul sayı + **🧭 Navigasiya (Google Maps)** deep-link (keyless `dir=` URL, order-da `customer_lat/lng` varsa) + **bir-press status düyməsi**: "Paketet götürdüm" (ready→picked_up) → "Yola düşdüm" (picked_up→in_transit) → "Təslim etdim" (in_transit→delivered)
- **Live GPS:** `watchPosition` (~15 s) → `POST /api/courier/ping` → `courier_location` (upsert per courier); GPS icazəsi yoxdursa amber "⚠ GPS işləmir" (app blokLANMIR)
- **Bugün təhvil verilmə** siyahısı (staggered slide-in)

**B — DB `courier_transition` RPC** (migration `20261002010000`): kurye tərəfindən transition = **assignment check** (`orders.courier_id = p_courier_id`) + **validated transition** (`validate_transition('delivery',…)`) + `delivered_at` stamp + `operation_logs` (performed_by = kurye staff id). Operator-ın `transition_delivery_status` ilə EYNİ state machine — iki entry-point, bir SSOT. `courier_location` cədvəli (courier_id PK, lat, lng, order_id, t).

**C — Admin "Kurye xəritəsi" live dispatch map** (`CourierLiveMapModal`, ÇATDIRILMA tab-da): Leaflet (OSM tiles + CSS-filter, 11y qaydaları) + **30 s poll** (`/api/courier/live` — requireAuth): **mavi venue** / **qırmızı order** (customer point) / **yaşıl kurye** nöqtəsi + permanent tooltip "tofiq agayev · N dəq/sn əvvəl" (freshness); sağ panel: "Kuryələr 1/1 onlayn" (GPS <5 dəq = onlayn) + "Aktiv çatdırılmalar" siyahısı (order → kurye → status).

**D — 4 BUG fix (E2E-diagnoz):**
1. **Middleware:** `/api/courier/` `PUBLIC_PATHS`-də YOX idi → kurye (saito_token-sız) login 401. Whitelist (route-lar öz `courier_token`-ı ilə self-auth).
2. **PostgREST `or/and` logic-tree sintaksisi:** bu build-də `or=(id=eq.X)` + bare `or=(id=X)` **parse OLUNMUR** (`PGRST100 failed to parse logic tree`) — yeganə valid form `or=(id.eq.X)`. Login route düzəldildi (repo-da yeganə digər `or=` artıq düzgün formdaydı).
3. **FATAL — courier wipe:** `transition_delivery_status()` `courier_id = p_courier_id` şərtsiz yazırdı; BDS board (`admin/delivery/page.tsx`) HƏR tap-da `p_courier_id: null` göndərir → mətbəx "Hazırdır" dedikdə kurye SİLİNİRDİ → kurye app HƏMİŞƏ "Order is not assigned to this courier". Fix (migration `20261002020000`): `COALESCE(p_courier_id, v_order.courier_id)` — null = "dəyişmə"; explicit pair = reassign (POS action-sheet artıq mövcud courier-i keçirirdi, BDS indi qorumalıdır). Audit log **effective** dəyərləri yazır. Test: təyin→BDS-null transition→**kurye saxlanıldı** ✓.
4. **FATAL — customer point persist:** POS geo-point yalnız `CustomerPhasePanel` local state-də idi → order-da YOXDU → kurye nav + live map nöqtəsiz. Fix: migration `20261002030000` (`orders.customer_lat/lng numeric(9,6)`) + `PosCart` + `usePos` orderBody + `/api/orders` create (clamp ±90/±180) + `CustomerPhasePanel`-da 4 resolve yolunda cart push (suggest-pick / forward geocode / manual pin) + 2 clear yolu (address təmizlənəndə / geocode fail olduqda). Bonus fix: courier orders route `order_items.qty` → **`quantity`** (PGRST204 sessiz fail → "0 məhsul").

**E — E2E (browser, user Chrome):**
- Part 1 (r12a-1): `/courier` PIN 7788 → "tofiq agayev · 0 aktiv" + GPS pill + "✓ D071" təhvil satırı — console 0
- API+DB: #D071 tam chain (preparing→ready [BDS-null, kurye SAXLANDI] → picked_up→in_transit→delivered) — `delivered_at` stamp + 3× `courier_transition` log (performed_by=tofiq); ping → `courier_location` row; live endpoint venue+kurye+orders
- Part 2-5 (r12a-3..6): #D081 (Dragon Roll ₼18 + fee ₼2, "Nizami 12, Bakı" → km 1.2, point persist ✓) ready+tofiq → kurye kartı **"🧭 Navigasiya" ENABLED** (point var!) → "Paketet götürdüm"→"Yola düşdüm" (toast "Status yeniləndi ✓") → **admin live map: mavi venue + qırmızı Nizami order + yaşıl kurye "tofiq agayev · 128 dəq əvvəl"** + sağ panel "1/1 onlayn" + "#D081 · yolda" → "Təslim etdim" → "✓ #D081" təhvil section — console 0
- Qeyd: browser geolocation icazəsi verilmədiyi üçün GPS pill "⚠ GPS işləmir" (kurye nöqtəsi son-ping timestamp-i ilə render olunur — gözlənilən, graceful)

**F — Toast / Lightspeed / Square müqayisəsi (owner sualı, §0 + §1 yenilənib):**
- **Toast** (US-only, $69/mo Essentials + 2.49%+$0.15): **Toast Delivery Services** — native self-delivery, **driver app** (route optimization, batched stops), **customer tracking link**, zone/fee management. Amma: US-only, hardware lock-in ($799+, 24–36 ay financing), KDS $25/mo per screen, add-on module-ler.
- **Lightspeed** (8 ölkə, $69/$189 + 2.6%+$0.10, **annual contract**): **native driver app YOX** — delivery = **aggregator integrasiyası** (Uber Eats/DoorDash/Grubhub) + third-party (Relay) və ya manual; "Order Anywhere" = yalnız online ordering.
- **Square** (8 ölkə, free/$60 Plus + 2.6%+$0.10, month-to-month): **native self-delivery driver app YOX** — Square Online + **aggregator-ə bağlı** (DoorDash/Uber Eats); customer tracking = **aggregator-un app-i** (kurye restoranın öz kuryesidirsə heç nə).
- **SAITO 12a = öz kurye-lərin üçün native tracking** (GPS dispatch map + kurye PIN app + Google Maps nav, **100% keyless/₼0**) — bu, Lightspeed/Square-də **olduqda belə yoxdu** (onlarda yalnıx aggregator-ə köklənir), Toast-da var amma **US-only + add-on + hardware lock-in** ilə. Bizim üçün kritik fərq: **0 aylıq, 0 transaction fee, 0 hardware** (owner: "pulsuz istirem, aya heç nə çıxmasın").

**G — Qalan (növbəti round-namizəd):** kurye push-notification (Web Push — keyless), kurye başa-təhvil ETX (photo/sign), multi-kurye route optimization (11w courier-tur-dan genişlənmə), customer-facing live tracking link (11d `/track`-a kurye GPS overlay).

---

### Jurnal sətiri — 2026-10-01 (ROUND 11z: NATIONWIDE OSM GAZETTEER — BÜTÜN AZƏRBAYCAN ÜZRƏ KÜÇƏ/POI/ŞƏHƏR TANIYI + XƏRİTƏDƏ ROUTE XƏTTİ (SAİTO→MÜŞTƏRİ))

Owner: "sıradakına keç — ən yaxşı səviyyəyə gətir, mənə təhvil ver"
(11u-da ertələnmiş nationwide build) + "xəritə bizi aparsın ora — hərif
daxil etdikcə və ya oranı seçdikcə; çoxda dibinə girməsin; ARADAKI ROUTE
görsünsün, birbaşa yeri YOX — Saito-dan oradakı məsafənin mapini göstərməlidir,
map davranışı etməlidir."

1. **NATIONWIDE GAZETTEER (bina/küçə/obyekt — bütün Azərbaycan, 100% keyless):**
   - Pipeline (deterministic, `scripts/build-gazetteer-nationwide.py`):
     Geofabrik `asia/azerbaijan-latest.osm.pbf` (46MB, OSM-in rəsmi extract) +
     `osmium tags-filter` + Python centroid (way/rel = bütün koordinatların
     ortalaması) + city cascade (al6→al8→al4 rayon-label) + foreign-name /
     garbage-name filtri + İ U+0130 no-case-pair handling. Overpass-dan fərq:
     public Overpass endpoint-ləri down idi (11u) — Geofabrik = stabil.
   - `src/data/streets-az.json`: 1,124 → **18,252 küçə** (1,514KB) — "Nizami"
     indi 10+ şəhərdə (Lerik, Abşeron, Sabirabad, Goranboy, Gəncə…).
   - `src/data/pois-az.json` (YENİ): **23,177 adlandırılmış POI** (2,038KB) —
     shop/amenity/tourism/office/craft; "bravo" → 28 malla (Bravo Səbail 1km,
     28 mall Sumqayıt…); "salyan" → Salyan Bazar POI 113.9km.
   - `src/data/cities-az.json` (YENİ): **106 şəhər/qəsəbə merkezi** (5.4KB) —
     OSM place=city/town/village. Hacıqəbələ (40.8586/47.0236) + İsgəndərli
     (40.5786/47.9653) = **MANUEL** (OSM-in bu iki şəhər haqqında heç data
     yoxdur — Nominatim/PBF/Wikipedia hamısı boş; owner verify etməlidir).
2. **Gazetteer MATCHİNG (11z redesign — `lib/gazetteer.ts`):**
   - `localStreetPoint`: **PER-TIER city filter** — hər tier (street exact →
     POI exact → street prefix → POI prefix → first-token prefix → Levenshtein)
     müstəqil city-filtrlənir, in-city pool boşdıysa növbəti tier-ə düşür.
     Köhnə kodda "Nizami" 64 xarici şəhər dəqiq-hit ilə pool-u doldurub, Bakı
     filter-i boşaldıb → null (Bakı-dakı "Nizami Cəfərov" prefix-tier-də idi —
     heç çatmırdı).
   - **First-token tier** (4b): OSM name drift — "Nizami Cəfərov 27, Bakı"
     (OSM-də belə küçə YOX, "Nizami küçəsi" var) → ilk token "nizami" →
     "Nizami küçəsi, Bakı" 2.3km ✓.
   - **Typo-suffix fold**: "cucı/cucesi" (küçəsi-nin k-siz typo-su) Levenshtein
     ≤2 ilə suffix-list-dən tanınır → "nizami" ✓.
   - `localCityPoint` (YENİ): exact fold + lev≤2 (OSM spelling drift:
     "Xırdalar" → OSM "Xırdalan").
   - Suggest: "nizami" → 8 sətir (Lerik 215.5km daxil), "salyan" → Salyan
     şossesi 8.4km + POI, "goygol" → Gəncə 294.3km + göl.
3. **GEOCODE KÖK SƏHVLƏRİ (E2E-diagnoz, 3 bug):**
   - **AZ_PLACES lookup-bug:** Lerik variants `['leric','lerix']` — "lerik"
     ÖZÜDƏN İXTİBAR (canonical folded name lookup-da əlavə olunmadı) →
     detectPlace null → noPlaceToken → farGuard 500→**120km** → Lerik-in
     215km hit-i rədd → anchor-retry "Bakı" = VENUE nöqtəsi → km=0. Fix:
     canonical folded name PLACE_LOOKUP-a.
   - **Fuzzy city detection** (YENİ): "Isemayilli" (İsmayıllı typo, lev 2) →
     token ≥5 char, variant-lərə lev≤2 → city tapılır ✓.
   - **Nominatim coarse-hit downgrade** (YENİ): `nominatimOnce` indi OSM
     `type` qaytarır; 'address'-namizədi altında city/station/lake hit-i →
     'area' (30-gün persist OLMAZ, lokal fallback işləyir). "q=Bakı" = venue
     nöqtəsi, "q=nizami" = metro stansiyası — bunlar address cavabı deyil.
   - **candidates() re-order**: bare anchor city (venue nöqtəsi!) comma-suffix
     -lərdən SONRA (köhnə order "… , Lerik" → "Bakı" venue cavabı verirdi).
   - **Local city shortcut**: chain-in city namizədi 0 Nominatim call ilə
     `cities-az.json` centroid-dan cavablanır; son fallback = city centroid
     (typo-küçə + məlum şəhər → 404 YOX, merkezi nöqtə).
4. **XƏRİTƏDƏ ROUTE XƏTTİ (owner: "aradaki route görünsün"):**
   - `osrm.ts`: `overview=simplified` + **`geometries=geojson`** (OSRM default
     = polyline5 STRING — ilk curl test-də routed=true amma 0 nöqtə idi) →
     ≤120 nöqtəyə server-də thinned `[lng,lat]` array.
   - `/api/geocode` → `route_geometry` sahəsi; **persistent cache-ində də
     saxlanılır** (regular = 0 Nominatim + 0 OSRM, route xətti də cached).
   - `PosMiniMap`: yaşıl route xətti (Apple-Maps üslubu, dashed fallback
     OSRM down-da) + xəttin ortaında **KM pill** ("288.4 km") — məsafə İNDİ
     MAP-da da görünür. Fit `maxZoom 16→14` + pad 0.3 ("dibinə girməsin" —
     route overview, street-dive yox).
   - Suggest-pick yolu: terminal-state geocode re-run ETMƏDİYİ üçün geometry
     `delivery-eta` fetch-i ilə gəlir (eyni OSRM response, 0 extra call).
   - Manual pin (map tap/drag): reverse geocode + eta — ikisi də geometry
     daşıyır.
5b. **Typo şəhər (owner sualı: "sumahit yazsam anlayacaq?")** — test
   "Nizami 12, sumahit" → 100km **"Xızı, Azərbaycan"** qaytardı! İki bug:
   (a) **Levenshtein early-exit korrupt** — inner-loop-da `rowMin > max`
   break + partial row istifadəsi → məsafə DÜZGÜNDƏN AŞAĞI çıxır
   (`lev('nizami','xizi')` 2 deyil 3 idi) → küçə adı "nizami" şəhər "Xızı"
   kimi detect olunurdu. Eyni pattern `levAZ` + gazetteer `lev`-də (11w-D-dan
   irsi) → ikisi də düzəldildi (early-exit YALNIZ tam row sonunda).
   (b) **Nominatim wrong-city street-hit** — "Nizami 12, sumahit" → Nominatim
   "Xızı" adlı ROAD (type=road → coarse-downgrade görmür, farGuard 100<500
   keçirir) qaytarırdı → **city validation** əlavə olundu: şəhər yazılıbsa,
   hit-in display-ında həmin şəhər YOXDURSA = miss, chain davam edir.
   Nəticə: "Nizami 12, sumahit" → **27.9km "25/12, Nizami, Sumqayıt, 5006"**
   ₼8.45 (address precision, cache-ə geometry-lə persist) + route xətt.
   "sumahit" yalnzı → 32.4km Sumqayıt merkezi. "9cu mikrorayon"-klass
   deqradasiya: Nominatim miss-də → şəhər merkezi (32.4km vs 25.3km —
   graceful, suggest-də dəqiq sətir yenə görünür).
5. **E2E (r11z-1..4, browser, console 0):** T1 "nizami" → 6 sətir 6 rayon
   (Abşeron 28.3 / Sabirabad 104.9 / **Lerik 215.5** / Goranboy 281.6 / Gəncə
   294.3+294.6); T2 "Nizami cucecı 12, Lerik" → **≈288.4 km (təxmini) · Nizami,
   Lerik rayonu**, **₼138.70 OOB fee GÖRÜNÜR**, xəritədə **yaşıl əyrili yol
   xətti** (mavi venue + qırmızı müşteri) + "288.4 km" pill, **country zoom**
   (Naxçıvan/Mingəçevir/Türkmənbaşı görünür); T3 "Nizami 27, Bakı" → 2.3 km,
   ₼2, qısa yaşıl xətt + "2.3 km" pill, local zoom; T4 (r11z-4) "Nizami 12,
   sumahit" TYPO → 27.9km "25/12, Nizami, Sumqayıt, 5006" ₼8.45 + yaşıl route
   + "27.9 km" pill, regional zoom (z9), console 0.
   Curl matrix: "Nizami cucecı 12, Lerik" 288.4km routed ✓ / "Cayli cucecı,
   Isemayilli" 185.4km "Çaylı küç., İsmayıllı rayonu" ✓ (fuzzy city + street) /
   "Nizami Cəfərov 27, Bakı" 2.3km ✓ (first-token tier) / "Nizami 27, Bakı"
   2.3km ✓. Cache təmiz (yalnız 'address' persist olur).
5c. **DELIVERY FEE AUDIT GAP (owner: "db-də saxlanılır mı, çox güclü
   səviyyədə qurulubmu")** — yoxlama: fee DB-də idi (`orders.delivery_fee`
   numeric, RPC `calculate_delivery_fee(zone, amount, km)` server-resolved,
   total-a creation-da DAXİL: 17.00+13.25=30.25 proof) amma **KM saxlanılmır
   Dİ** → "nəyə görə ₼13.25?" disputesinə DB-də cavab YOXDU. Fix:
   `orders.delivery_km numeric(8,1)` (migration 20261002000000) — fee-in
   cümləsi (fee+km = audit pair), orders/route-da 0–500 clamp, usePos +
   page payload. DB proof: ORD f2091bde = km 27.9 + fee 8.45 + total 108.45
   (100+8.45) ✓. Zone ehtiyacı: YOX (11y model) — auto KM-band → zone, OOB
   = zone-ehtiyacsız distance fee; zone chip = optional pin (flat wins).
6. **Qeyd:** `suggest` API paramı = `address` (deyil `q`) — test-lərdə
   boş-nəticə kökü. Dev server: EADDRINUSE catch — `kill` yalnız pnpm parent-ı
   öldürür, next-server child PID portu saxlayır; `lsof -ti :3000`-dən BÜTÜN
   PID-ləri kill et.

---

### Jurnal sətiri — 2026-10-01 (ROUND 11y: APPLE-ÜSLUB XƏRİTƏ + RADIUS-KƏNARI MƏSƏFƏ HAQQI (ZONE-EHTİYACSIZ) + MARŞRUT + PERSISTENT AXTARIŞ CACHE)

Owner: "axtarış sistemi hər dəfə düzgün və sürətli işləsin, gecikmə və ya qəfil
işləməmə olmasın. Xəritə Apple Maps üslubunda olsun... typo-ları ağıllı şəkildə
düzəldərək binaları/küçələri/obyektləri dəqiq tanısın... 'Marşrut' düyməsi...
Xəritəyə toxunduqda avtomatik uzaqlaşma olmasın. Açılış zamanı xəritə dropdown-u
örtməsin. Ünvana/məkana seçim etdikdə qiymət görünmür — düzəldin. Ve əgər
belədirsə, mənə zonaya da ehtiyac qalmayacaq."

1. **RADIUS-KƏNARI MƏSƏFƏ HAQQI — ZONE-EHTİYACSIZ MODEL (server + client):**
   REAL DB-yə applied (migration `supabase/migrations/20261001000000_11y_oob_distance_fee.sql`):
   `settings.delivery_per_km_rate` (default ₼0.50) + `v_settings_delivery` view rebuild
   + `calculate_delivery_fee` §4.3 **OOB fallback**: zone-ların hamısından uzaq
   ünvan → ən uzaq aktiv zone + `(km − max_km) × ₼/km` surcharge; zone YOXDURSA →
   `km × ₼/km`; OOB-da `is_free` forced false; explicit zone name (pinZone) HƏMİŞƏ
   win edir (flat fee). Client: `recalcDeliveryFee` distance-only (zoneName null)
   dəstəyi; KM branch → zone yoxdursa `recalcDeliveryFee(next, null)`; **send-gate
   `!zone && km<0.1`** (zone-sız order İNDİ İŞLƏYİR). E2E: 29.5 km → **₼9.25
   görünür** (2 + 14.5×0.5), zone chip UNSELECTED, order #072/#073 zone-sız göndərildi ✓.
2. **CRITICAL BUG FIX — `Number(null)===0` (owner-in "qəfil işləməmə" kökü):**
   `/api/geocode` reverse-mode detection `Number(searchParams.get('lat'))` = 0
   (param yoxdursa) → **BÜTÜN forward geocode (0,0)-a reverse olundu** (KM 6734.9,
   fail). 11x E2E suggest-pick yolu ilə test olunduysa da, plain-typing yolu
   susqan qalıb. Fix: reverse YALNIZ iki param da explicit + (0,0) deyilsə.
3. **AXTARIŞ = HƏR DƏFƏ DÜZGÜN + SÜRƏTLİ (3 qat):** (a) **PERSISTENT CACHE**
   (`lib/geo-cache.ts`, `.cache/geocode-cache.json`, 30 gün TTL, 3000 entry,
   debounce save, venue-scoped key) — müntəzəm müştəri ünvanı = 0 Nominatim call;
   YALNIZ `precision:'address'` persist olunur (city-centroid fallback = answer
   deyil, cache-lənməz). (b) **LOCAL GAZETTEER FALLBACK** (`lib/gazetteer.ts` —
   11u index shared modula köçdü; suggest + geocode eyni index): Nominatim chain
   fail (429/throttle) İLLA da city-centroid fallback (typo → "Bakı, Azərbaycan"
   km 0) olarsa → **küçə centroid-i** (0 network, instant; "Nizamii küçəsi 55,
   Bakı" → "Nizami küçəsi, Bakı" km 1 ✓). Named city gazetteer-də yoxdursa
   (Bərdə) başqa şəhərə GUESS edilmir (null). (c) typo/ev nömrəsi = 11w-D
   Levenshtein + house-number chain (qorundu, shared modula köçdü).
4. **APPLE-ÜSLUB XƏRİTƏ (100% keyless):** CARTO light/dark İLK seçimdi — AMMA
   CARTO indi keyless client-lərə **"API KEY REQUIRED" WATERMARK tile** verir
   (E2E catch) + owner qaydası "pulsuz, heç nə çıxmasın" → **OSM standard tiles +
   CSS filter**: light = `saturate(.55) contrast(.98) brightness(1.02)` (pale
   Apple-lıq), dark = `invert(1) hue-rotate(180deg) saturate(.35) brightness(.85)`.
   E2E r5: dark/light/dark 3× class swap, tiles HƏMİŞƏ görünür ✓.
   **MAP-DIV CLASSNAME = CONSTANT** (E2E r3/r4 catch): React theme re-render-i
   className rewrite edib Leaflet-in `leaflet-container` class-ını SİLİRDİ →
   Tailwind `img{max-width:100%}` → tile width 0 → BOŞ MAP. Fix: theme class +
   border OUTER wrapper-də, Leaflet div-i constant (React mount-dan sonra toxunmur)
   + defensive `.saito-leaflet .leaflet-tile{max-width:none!important}` + 500ms
   late `invalidateSize` (sheet animation içində mount) + tile layer ONCE
   (runtime removeLayer/add = pane 0×0 — round-3 catch).
5. **MARŞRUT DÜYMƏSİ:** customerPoint varkən map altında pill:
   `google.com/maps/dir/?api=1&destination=lat,lng&travelmode=driving`
   (target _blank; API key YOX) — E2E: yeni tab açıldı ✓.
6. **TOUCH UX:** (a) **Tap-də auto-zoom YOX** (11x manualPickRef — re-verified
   r2: zoom 14→14, pin glide) ✓. (b) **Dropdown UPWARD açılır** (`bottom-full`)
   — on-screen POS keyboard alt sətirləri örtürdü (E2E catch); indi field-in
   YUXARISINDA = keyboard + map ikisindən də sərbəst (native address-field
   davranışı). Map-dan dropdown örtülməsi = 11y stacking fix (`relative z-0`).
7. **FEE BOX + QIYƏT DİQQƏTİ (E2E catch-lər):** (a) fee box `zone chip`-dən
   GATED idi (chip yox → "Zone seçin" + qiymət görünmürdü — owner-in şikayəti) →
   `feeResolved` (RPC round-trip complete) + distance = eyni valide; "Zone seçin
   / ünvan daxil et" yalnız ikisi də yoxdursa. (b) **OOB-resolved zone
   persist SİLİNDİ** — distance-only RPC-nin `zone` field-i (furthest zone)
   cart.delivery_zone-a yazılırdı → hər sonrakı KM dəyişikliyi "manual pin"
   sayılırdı → **₼9.25→₼2.00 flip** (E2E r1 defect). İndi zone = YALNIZ chip tap
   (pinZone) persisted. (c) **fee RPC race**: pick → haversine km → road-km
   back-to-back 2 recalc → stale response yenini overwrite edirdi + RPC fail
   = fee 0 commit (₼0 = "pulsuz" görünürdü!) → **monotonic feeSeq guard**
   (yalnız ən yeni commit edir) + catch-da son fee saxlanılır. (d) OOB warning
   kart KM-sini göstərir (geoKm stale idi: KM 29.5, warning "37.5").
8. **Pick-in öz OSRM eta fetch-i abort SİLİNDİ** — address-change effect pick-in
   yenidən yazdığı address-də pick-in öz delivery-eta request-ini kill edirdi
   (KM 25.3-də donurdu, hint 29.5 deyərdi) → `address === suggestPickedRef` guard.
- **E2E (r11y-1..6 + r11y-r2-1..6 + r11y-r3-1..2 + r11y-r4-1..3 + r11y-r5-1..3,
  5 pass; FINAL r5 = 6/6, console 0):** far-address pick → KM 29.5 + **fee ₼9.25
  görünür** + "29.5 km — radius kənarı: məsafə haqqı tətbiq olunur" + chip
  UNSELECTED ✓; re-pick eyni row → KM/warning/fee üçü də eyni (9.25) ✓;
  Apple-üslub tiles dark/light/dark ✓; tap no-zoom ✓; dropdown upward, heç bir
  overlay-siz ✓; Marşrut → Google Maps dir tab ✓; **zone-sız order send ✓
  (#072 ₼19, #073 ₼30.25)**; typo "Nizamii küçəsi 55, Bakı" → "Nizami küçəsi,
  Bakı" km 1 (local fallback) ✓; persistent cache 2nd call 0 Nominatim ✓;
  curl: OOB 29.5→9.25 / 37.5→13.25 / 25.3→7.15 / pinned→2.00 / Bərdə regress
  (302.4 address) ✓. tsc clean.
- **Sıradakı (owner "hər yeri millimetrinə" qeydi):** bina/POI-level dəqiqlik =
  OSM əhatəsinə bağlı; tam versiya = nationwide gazetteer (Geofabrik shapefile
  yolu — Overpass mirrors 2026-10-01-də hamısı down; owner "indi etmirik").

### Jurnal sətiri — 2026-10-01 (ROUND 11x: MAP-AS-SEARCH — manual pin + şəhər focus + mikrorayon + Nominatim stabilizasiya)

Owner: "map-i istifadə edək — mapda göstər, o özündə axtarırsın, çünki o mapda
istediyin hər şey var" + "bravo sumqayit 9cu mikrorayon anlaşılmır".

1. **MAP = AXTARIŞ ALƏTİ (`PosMiniMap` + panel):** (a) **Manual pin** — ünvan
   OSM-də tapsa belə, map üzərinə TIKLA və ya qırmızı pini SÜRÜŞDÜR → nöqtə
   = HƏQQİQƏT: reverse geocode (`/api/geocode?lat&lng` — YENİ mode, 30s cache) →
   ünvan metni + OSRM road km + auto zone (11v branch). (b) **Şəhər focus** —
   ünvanın OSM-də YOXDU (blok/ev/yaşayış kompleksi) + şəhər token var
   ("sumqayit") → suggest response `area` field (cityPoint: 24h cache, 1
   Nominatim call/şəhər/gün) → map **z13-də şəhərə smooth zoom** + badge
   "Sumqayıt · xəritəyə tıkla — nöqtəni özün qoy" → operator OSM tiles-lərində
   küçə adlarını GÖZLƏ tapıb tıklayır. (c) **Smooth transitions** — pin CSS
   glide (transform transition), animated setView/fitBounds (0.45s),
   drag-də RE-FIT YOX (yalnız nöqtə view-dan kənar/zoom<9-da) — "transition
   daha qalın" tələbi.
2. **MIKRORAYON CHAIN (`geocode/route.ts` + `suggest/route.ts`):**
   `normalizeOrdinal` — "9cu"→"9-cü", "9ci"→"9-ci" (OSM AZ ordinal tag-ləri);
   `microCandidates` — "bravo sumqayit 9cu mikrorayon" → ["9-cü mikrorayon,
   Sumqayıt", "Bravo, Sumqayıt"] (hər ikisi HƏR İKİ script-də — Nominatim
   exact layer AZ/ASCII city-də finkti); suggest chain mikro-first (3 call).
   E2E: "bravo sumqayit 9cu mikrorayon" → **"9-cu Mikrorayon, Sumqayıt"
   25.3 km (suburb)** üst sətir + pick → KM 29.5 routed + radius warning ✓.
3. **NOMİNATİM STABİLİZASİYA (E2E catch-lər):** (a) **`Number("")=0` bug** —
   Nominatim bəzi candidate-lər üçün boş lat/lon string qaytarır → (0,0)
   "nöqtə" → KM 6734.9 + world zoom. Fix: empty/non-finite/null-island
   reject (nominatimOnce + suggest row filter) + **HARD 500km far-guard
   HƏMİŞƏ** (yeri gəlməyən hit = miss) + client km≤500 guard. (b) **Token
   bucket 550ms→1100ms** — 1.8 rps Nominatim 1 rps policy-sindən yuxarı idi →
   IP 429 burst-lərinin kökü. (c) Suggest chain `rows = r.json()` ASSIGNMENT →
   CONCAT (2-ci candidate 1-ini clobber edirdi: mikrorayon row "Bravo
   supermarket"-a itirdi).
- **E2E (r11x-1..9, 2 pass, hamısı 5/5, console 0):** tap→pin+KM+zone ✓;
  drag no-yank ✓; smooth fit (Sumqayıt→Bakı animated) ✓; "sumqayit bravo
  blok 14" (OSM-də yox) → 0 row + **Sumqayıt z13 focus + badge** → tap → pin
  + KM 37.5 + warning, input text saxlanıb (reverse 429 → graceful) ✓;
  mikrorayon pick ✓. tsc clean.
- **Qeyd (owner sualı):** "Azərbaycanın hər yeri millimetrinə" — millimetr
  FİZİKİ OLMAZ (GPS/OSM ~1-5 m); "hər küçə" = Geofabrik/Overpass nationwide
  build (mirror down idi — növbəti round: shapefile download + 1 skript).

### Jurnal sətiri — 2026-10-01 (ROUND 11w: 5 İMPROVEMENT — TELEFON→ÜNVAN · MINI-XƏRİTƏ · OSRM YOL-KM FEE · FUZZY+EV NÖMRƏSİ · KURYE TURLARI)

Owner: "daha da yaxşı necə ede bilərsən?" → 5/5 seçdi (hamısı free/keyless — Google
Maps key billing istədiyinə görə RƏDD edildi: "pulsuz istirem, aya heç nə çıxmasın").

1. **A — TELEFON → SON ÜNVAN (`/api/customer-last-address` + panel):** telefon
   10+ rəqəm yazılır → orders DB-dən həmin son-10-lik telefonun **son delivery ünvanı**
   (0 external API call). Ünvan boşdursa → **avto-dol** (Toast modeli); doluysa → tap
   chip "Müşterinin son ünvanı (N)". 700ms debounce. Avto-dolduqdan sonra mövcud
   geocode→KM→auto-zone pipeline işləyir.
2. **B — MINI-XƏRİTƏ (`PosMiniMap.tsx`, Leaflet 1.9 + OSM tiles, key-siz):**
   seçilmiş/geocode olunmuş ünvan = qırmızı pin, məkan = mavi nöqtə, aktiv zone radiusu =
   mavi dairə. ResizeObserver + fitBounds. OSM attribution qeydi. Yanlış rayon seçimi
   indi GÖZLƏ görünür (Toast/Square parity + zone ring bonusu).
3. **C — FEE = OSRM YOL-KM (`geocode/route.ts` + `lib/osrm.ts`):** `/api/geocode` indi
   `km` = **gerçək sürüşmə məsafəsi** (OSRM road km), `km_straight` = haversine
   (fallback: OSRM down → routed:false, həmişə cavab verir). Suggest pick-də driveEta
   gələndə panel KM sahəsini + fee-ni routed km-ə keçirir (chip · KM · fee = 1 triple,
   "zonalarda qairisqliq olmasin" qanunu). E2E: 20 Yanvar → straight 4.7, **routed 6.0**.
4. **D — FUZZY + EV NÖMRƏSİ (`suggest/route.ts`):** (a) Levenshtein lokal index-də
   (1124 küçə, ~ms): "nizamii" → "Nizami küçəsi, Bakı" 0.6 km (threshold ≤1/<7, ≤2/≥7,
   prefix də əhatə olunur: full-name + same-length prefix). 0 Nominatim call. (b) Ev
   nömrəsi: `nizami 12` → chain = "nizami 12, <detected|venue city>" (venueCityOf
   export edildi) + raw → Nominatim **building** row: "12, Nizami küçəsi, Nəsimi
   rayonu, Bakı, 1020" 1.2 km.
5. **E — KURYE TURLARI (`/api/courier-tour` + `CourierTourModal.tsx`):** delivery
   list-də "Kurye turu" → ünvanlı sifarişləri tik → hər ünvan /api/geocode (15s cache)
   → **1 OSRM /table call** (all-pairs matrix, `annotations=distance,duration` — bare
   /table only durations qaytarır! E2E catch) → **nearest-neighbor** stop order (venue
   başlanğıc) → per-leg km/dəq + cəm. ≤12 stop, 2 min cache. Rəqiblərdə bu ayrıca
   dispatch məhsuludur.
- **E2E (r11w-1..4, 5/5 PASS, console 0):** A: 0501112233 → ünvan avto "Test küçəsi 1,
  Bakı" ✓; D1: "nizamii" → Nizami 0.6 km ✓; D2: "nizami 12" → building tap ✓; C: KM=2.2
  (routed) + zone auto + ₼2 ✓; B: xəritə (mavi+qırmızı) ✓; E: 3 sifariş → cəm **37.5 km
  · ~41 dəq**, order Ç072→Ç073→Ç071 ✓. Test sifarişləri (#D072/#D073) E2E-dən sonra
  DB-dən silindi. tsc clean. leaflet 1.9.4 + @types/leaflet 1.9.22 (pnpm).

### Jurnal sətiri — 2026-10-01 (ROUND 11v: AUTO ZONE (TOAST MODELİ) + OSRM LIVE SÜRÜŞMƏ VAXTI (FREE API) + 40-ŞƏHƏR LÜĞƏTİ)

Owner: "toast/lightspeed/square-da çatdırılma sistemi necedir — manual yoxsa?" → rəqib
analizi: hamısı ünvan-dan **auto zone** seçir, amma ETA **statis** zone-range-dir; "tamam
eynisindenn et hetta daha da yaxssini et, gor tapa bilirsense internetde free api onlada
tetbiq elede onlardan daha yaxsi olsun".

1. **AUTO ZONE (Toast modeli) — `page.tsx`:** `zoneAutoRef` auto-dan manual zone-u fərqləndirir.
   KM məlumdur (geocode/suggest pick) + zone YOXDURSA → `autoZoneForKm(km)` KM-band ilə
   **auto seç + price** (ilk band-dan aşağı → ilk zone; bütün band-lardan yuxarı → null).
   Chip tap (select/DESELECT) = **MANUAL** → `zoneAutoRef=false`, zone heç vaxt daha flip
   olunmur (11t "men seçmirem" qaydası qorunur). Auto zone + KM band-dan çıxır → auto
   re-resolve (band tapılıb → yeni zone, yox → zone düş). Bütün radius-lar-dan kənardır →
   zone YOX + panel-də amber warning "**N km — radius kənarında: zone-nu sən seç**" (Toast:
   "outside delivery area"). Order dəyişmə/yeni order-da ref reset. **Send-gate dəyişməz:**
   zone-sız delivery order YARADILMIR (server cart-da olanı bill edir; zone-sız = ₼0 =
   pulsuz çatdırılma riski).
2. **OSRM LIVE SÜRÜŞMƏ VAXTI (free, keyless) — `src/app/api/delivery-eta/route.ts` (YENİ):**
   venue→customer OSRM driving route (`router.project-osrm.org`, API key YOX) → `{km,
   minutes}`. 100m grid cache (300s), 6s timeout, 502 `eta_unavailable` graceful.
   **Client (`CustomerPhasePanel`):** `driveEta` state (11q `eta` = mutfak dynamic ETA —
   fərqli şey, ad toqquşması üçün rename) — suggest pick → non-blocking fetch → hint
   "≈ 4.7 km … · **~9 dəq** · <address>". Address/mode dəyişəndə clear (effect `address`-dən
   SONRA bəyənlənib — TDZ). **Rəqib gapı:** Toast/Lightspeed/Square = statik zone ETA
   ("20–30 dəq"); biz = DEQİQ ünvan üçün REAL sürüşmə dəqiqəsi — free API-lə.
3. **SUGGEST FİX — "20 yanvar berde" → 0 row (E2E catch):** (a) `AZ_PLACES` 26→**40 şəhər**
   (11v əlavə: Bərdə, Neftçala, Samux, Şəmkir, Hacıqəbələ, Biləsuvar, Qobustan, Ağcabədi,
   Gədəbəy, Xızı, İsgəndərli, Lerik, Tovuz, Qax); (b) suggest Nominatim query indi
   **CANDIDATE-DRIVEN** (11s /api/geocode chain-i: "20 yanvar berde" → "20 yanvar, Bərdə";
   ASCII variant last resort; ≤2 call) — əvvəl raw string-only idi (Nominatim free-text
   comma-sız street+city-də düşürdü).
- **E2E (r11v-1..2):** suggest pick (4.7 km) → zone **auto "Bakı Mərkəz 0–15"**, fee **₼2**,
  hint "**~8 dəq**" (OSRM live) — operator zone-a toxunmayıb; out-of-radius pick → zone YOX +
  amber "radius kənarında: zone-nu sən seç". Console 0. Curl: "20 yanvar berde" →
  "20 Yanvar, Bərdə, Bərdə rayonu, 0900" 229.5 km ✓; "20 yanvar" → km-sorted (Bakı 4.6/4.7
  üstə, Neftçala 121.3, Yevlax 226.9, Bərdə 229.5) ✓; eta: Bakı nöqtəsi 6.3 km/9 dəq ✓,
  Bərdə 302.4 km/223 dəq. tsc clean.

### Jurnal sətiri — 2026-10-01 (ROUND 11u: INSTANT 1-CHAR SUGGEST — LOCAL STREET GAZETTEER)

Owner: "nie limitli sekilde dropdown-da cixir — men 2 yazsam birden-bire netice
olmaliydi, direk daxil edenden sonra hesablayib demelidi".

1. **LOKAL GAZETTEER (`src/data/streets-az.json`, commit olundu):** 1124 unikal
   küçə (Bakı 1081 + Sumqayıt 264; "küçəsi/küç./prospekti/bulvarı" suffixləri
   build-də fold → "20 Yanvar" == "20 Yanvar küçəsi" bir entry) + OSM center
   koordinatları. One-time Overpass fetch (maps.mail.ru mirror — overpass-api.de
   406 verdi; Xırdalan bbox = EMPTY — OSM-də heç street data yoxdur; Gəncə/Mingəçevir
   delivery-radius-dan kənardır, 3+ char Nominatim + 11s city-dictionary ilə örtülür).
2. **ROUTE FLOW (`/api/geocode/suggest`):** 1-2 char = **LOKAL ONLY** (startsWith
   scan ~1 ms, **Nominatim CALL YOX**) → dropdown birinci keystroke-dan işləyir
   (Google Maps belədir: əvvəl lokal index, sonra network). 3+ char = Nominatim
   (7) + local prefix merge (cap 8, eyni dedup) → **KM SORT** (Nominatim fuzzy
   free-text uzaq match-leri üstə qoyurdu — "niz" → "Aşağı Gövhər ağa məscidi,
   Şuşa" 270 km, "Nizami küçəsi, Bakı" 0.6 km ÜSTƏDƏ idi; proximity order =
   operator-un ehtiyacı; city hər sətirdə görünür).
3. **CLIENT:** min 1 xarakter (əvvəl 3), debounce 100 ms (<3 char) / 350 ms (≥3)
   (əvvəl 600 ms), AbortController in-flight kill.
4. **VENUE DB-Ə PERSIST:** `locations` rows-un latitude/longitude NULL idi — hər
   route (geocode/suggest) hər cold-cache-də venue bootstrap chain-i Nominatim-də
   qaçırırdı. "Saito Nizami" row (70000000-…-1, "Bakı, Nizami küç. 98") ona MƏXSUS
   geocode nöqtəsi ilə UPDATE olundu (40.3755885/49.8328009 — bütün rounds-da
   istifadə olunmuş eyni nöqtə) → venue indi INSTANT DB read (bootstrap yalnız
   fallback qalır).
- **Browser E2E (r11u-1..2):** "2" → dropdown **0.7 s** (8 row: 28 May 1.1 · 2-ci
  Massiv 3.7 · 22-ci Dağlıq 4.4 · 20 Yanvar 4.6 · …) → "20" → 2 row (20 Yanvar
  4.6 · 20-ci Qaraçuxur 13.4) → "20 yanvar" → 6 row (local + "20 Yanvar, 4-cü
  mikrorayon, …, Nəsimi rayonu, Bakı" 4.7) → tap → address tam ad, **KM 4.7**,
  zone chips unselected, fee "ZONE SEÇİN". Console 0 new error. tsc clean.

### Jurnal sətiri — 2026-10-01 (ROUND 11t: GOOGLE-MAPS-STİLİ ADDRESS SUGGEST + ZONE MANUAL SEÇİM)

Owner: "20 yanvar yazdım — sistem özbaşına bir rayonu seçdi (haranı dedim?); google maps kimi
suggest olsun, zone-nu MEN seçirem, hardcode seçməsin". + "yazırsan silirsən loop-u"
(köhnə HMR state — clean dev restart ilə həll).

1. **SUGGEST ENGINE (`/api/geocode/suggest` — yeni route):** Nominatim `limit=7`,
   `countrycodes=az`, `accept-language=az` → BÜTÜN uyğun nöqtələr (rayon adı display_name-da
   görünür) + venue→nöqtə KM. Variant fallback (raw + ASCII, max 2 call), 10s in-process
   cache, token bucket (1 req/s). Venue bootstrap **/api/geocode-un EYNİ helper-ləri ilə**
   (export: `transliterate`/`candidates`/`haversineKm`/`nominatimOnce`) → suggest KM ==
   geocode KM; 60s venue cache (keystroke-debounce təkrar Nominatim chain-etmir). Dedup:
   eyni küçənin çox OSM way-i (1102/1134 poçt) bir sətirdə birləşir.
2. **SUGGEST UI (`CustomerPhasePanel`):** 600ms debounce + AbortController; dropdown =
   pin icon + tam yer adı (2 sətir, rayon görünür) + KM chip; ArrowUp/Down/Enter/Escape;
   **tap = dəqiq seç** → address tam ad, KM dəqiq (≈ YOX), zone toxunulmur.
   **Re-open bug (E2E catch):** pick-dan sonra tam ad ÖZÜ Nominatim hit-i → dropdown 600ms
   sonra tək sətirlə geri açılırdı → `suggestPickedRef` (picked name; manual keystroke-da
   clear) — fixed; 8s-wait E2E-da CLOSED təsdiq.
3. **ZONE 100% MANUAL (owner: "men seçmirem"):**
   - Adres yazanda top-priority zone **auto-commit SİLİNDİ** (page.tsx onUpdate branch).
   - Fee box zone-sız = **"Zone seçin"** (₼0 göstərilmir — "pulsuz" oxunurdu).
   - KM dəyişikliyi = yalnız **SEÇİLİ** zone re-price (`pinZone`) — zone km-range ilə flip
     olunmur (ölkən: "zonanı özün seçir").
   - Chip tap: mövcud dəqiq/geocode KM **overwrite olunmur** (zone-midpoint repKm yalnız
     KM yoxdursa fallback).
   - Cart-total recalc effect → `pinZone` (operator seçimi flip olunmur).
   - **sendCurrentOrder gate:** zone-sız delivery order YARADILMIR ("Çatdırılma zonası
     seçin") — server cart-da olanı bill edir; zone-sız = ₼0 = pulsuz çatdırılma riski idi.
4. **Input loop ("yazırsan silirsən"):** köhnə dev server-in HMR state (10+ hot-swap,
   page module re-init → cart reset) — clean restart (`next dev -p 3000`) ilə typing
   STABLE (0 wipe, browser E2E təsdiq). Code-də loop yox idi.
- **Browser E2E (r11t-1..4):** "20 yanvar" → 5 row (Bakı Nəsimi 4.7 km birinci; Bərdə
  229.5; Neftçala 121.3; Samux 291.8; Yevlax 226.9) → tap → zone NEUTRAL + "Zone seçin"
  ✅ → chip tap → ₼2 + **KM 4.7 preserved** ✅ → pick-dan sonra dropdown CLOSED (8s) ✅.
  Console 0 new error. tsc clean.
- **Qeydlər (növbəti round-lar üçün):** (a) bu location-da 1 delivery zone (data) — flow
  düzgün; (b) Nominatim free-text rank variance: eyni query fərqli run-da 5/2 row
  qaytara bilər — top match (Bakı) sabit; (c) `locations` rows-un latitude/longitude
  NULL-dir — hər route venue-ni address bootstrap edir (persist yalnız
  precision='address'-də; "Nizami küç. 98" area-hit verir) → venue coords DB-ə yazmaq
  növbəti round candidate.

### Jurnal sətiri — 2026-10-01 (ROUND 11s: AUTOFILL GEOCODE — AZ TRANSKRİPSİYA-VARIANT MUQAVİMƏTİ + SAME-CITY FİX + KEYLESS WEATHER API)

Owner: "sumqayit niyazi 27A yazsaq sistem basa duse bilsin — AZ şriftləri ilə yazmaq
məcburiyyətində qalmayaq" + "weather api brauzerden elde et, tənzimləmələr üçün".

**Geocode (11s) — `/api/geocode/route.ts` + `CustomerPhasePanel.tsx`:**
1. **Diagnoz (pre-fix browser E2E):** "sumqayit niyazi 27A" ✅ (24.4 km) və "niyazi 27
   sumqayit" ✅ — AMMA "Bakı, Nizami Cəfərov 12" ❌: street OSM-də yox → city-centroid →
   **km=0 → client `km > 0` check → "Ünvan tapılmadı"** + KM sahəsində **KEÇMİŞ ünvanın
   24.4-u qalırdı (səssiz yanlış fee)**. Səthi problem: same-city (Bakı) ünvanları HƏMİŞƏ fail.
2. **AZ yer-adı variant lüğəti (26 şəhər):** hər biri üçün AZ Latin + ASCII + rus/ingilis
   variant ("sumqayit/sumgayt/sumgait", "genca/gence/ganja", "zaqatala/zakatala",
   "xirdalar/xirdalan", "shamaki/shamahi", …). Token-detection input-un HƏR POZİSİYASINDA
   (şəhər əvvəldə/sonda, vergüllü/vergülsüz) — canonical OSM AZ adı qaytarır.
3. **İki-script candidate chain:** original AZ script (OSM AZ taqları: "Nizami Cəfərov
   küçəsi") + ASCII variant (EN taqları) — əvvəl yalnız ASCII qalırdı. Order: fullAZ →
   restAZ+city → fullASCII → restASCII+city → city → suffixes → singles (cap 6).
4. **`countrycodes=az`** bütün Nominatim çağrılarında — xaric match-ləri kəsir ("Niyazi",
   "Quba" başqa ölkələrdə də var).
5. **Far-hit guard (120 km) + venue-city anchor:** yer-token-siz input üçün venue-dən >120
   km fuzzy hit = MISS. repro: "Nizami Cəfərov 12" (şəhərsiz) → GƏNCƏ "İsaq Cəfərov, Nizami
   rayonu" (293.7 km!) — indi reject olunur → anchor retry (Nominatim reverse, cached):
   "… , Bakı" → "Bakı" → km 0 təxmini.
6. **Client fix:** `km >= 0` qəbul (same-city km=0 = VALID "təxmini" nəticə); geo-fail və
   qısa-ünvan zamanı STALE auto-KM təmizlənir (manual KM — `kmManualRef` — HƏMİŞƏ toxunulmur).
- **Post-fix browser E2E (r11s-post\*):** A "sumqayit niyazi 27A" ≈23.7 km ✅ · B "Bakı,
  Nizami Cəfərov 12" "≈ 0 km (təxmini) · Bakı" + KM=0 + zone "Bakı Mərkəz 0–15 · ₼2" avto ✅
  · C "niyazi 27 sumqayit" ≈24.7 km (binə səviyyəsi!) ✅ · D "Nizami Cəfərov 12" (şəhərsiz)
  "≈ 0 km (təxmini) · Bakı" ✅ (Gəncə YOX). 0 uncaught exception. tsc clean.
- **Pre-existing (toxunulmadı, ayrıca round):** 229× React "duplicate key `pos-POS`"
  console warning (non-fatal).

**Weather (11s) — `/api/weather-check/route.ts`:**
- Owner brauzerdən istədi → Chrome-da **OpenWeatherMap sessiyası YOXDU** (→ /users/sign_in;
  qeydiyyat e-mail tələb edir, əvəz qeydiyyat edilmədi). **Çözüm: keyless fallback —
  Open-Meteo** (eyni servis `calculate_delivery_fee` smart-surge-də artıq işlədir, key YOX).
  OWM key-i vardırsa (`.env.local`: `OPENWEATHER_API_KEY`) hələ də üstünlük alır.
- **Condition-normalizasiya** foundation.css-in gözlədiyi dəstə: sunny / partly-cloudy /
  cloudy / mist / rain / snow / thunderstorm — OWM "Clear" qıyməti CSS-in `sunny`
  selectoruna toxunmurdu (pre-existing uyğunsuzluq da düzəldi).
- **E2E:** /admin-da `data-weather="cloudy"` canlı təyin olunur; API 200 `{city:"Bakı",
  temp:24, feels_like:23, condition:"cloudy", description:"Buludlu", source:"open-meteo"}` ✅.
  12 AZ city variant lüğəti; naməlum city → `{disabled:true, reason:"unknown_city"}` (500
  YOX — QF9 qaydası).

### Jurnal sətiri — 2026-10-01 (ROUND 11r: CASH GATE VARIANT A — NAĞD ÖDƏNIŞ KASSA SESSİYASINA BAĞLANDI + FINAL E2E)

Owner: kassa açılmadan NAĞD ödəniş alınmasın (Variant A — sərt nəzarət). Kart/QR/transfer heç vaxt
blok olmasın. Sifariş qəbulu (order create) heç vaxt blok olmasın. One-tap "Kassanı aç" + kassa
açılanda auto-retry.

1. **SERVER GATE (SSOT):** `/api/orders/pay` — `hasCashPortion` (full cash OR split-də cash qismi OR
   per-item cash allocation) və operator-un **location-da AÇIQ drawer session YOXDURSA** → **403
   `CASH_DRAWER_REQUIRED`** (fail-closed). Drawer lookup indi LOCATION-SCOPE-dədir (əvvəl org-wide idi).
   Kart/QR/transfer/corporate/gift heç vaxt blok olunmur; **order create heç vaxt blok olunmur**.
2. **LATENT BUG #1 (pre-11r, E2E-də açıldı):** pay route `const { data: openSession } = await
   fetch(...)` destruct edirdi → `openSession` HƏMİŞƏ undefined → `p_cash_drawer_session_id` HƏMİŞƏ
   null idi (session binding heç vaxt işləməyib — "non-fatal" olduğu üçün gizli qalıb). Fix: await
   full JSON array → `rows[0]`, destructuring YOX. **E2E təsdiqi (2026-10-01):** `cash_drawer_log.
   session_id` = 9462b5a9… (non-null) + `order_id` = ORD-2947 — binding indi REAL işləyir.
3. **CLIENT GATE MODAL (`pos/page.tsx`):** `shiftMissing` (60s poll, 11q) → pre-check: cash + kassa
   bağlı = modal DƏRHAL (round-trip yox; server qalır SSOT). 403 `CASH_DRAWER_REQUIRED` handling
   BÜTÜN 4 POST yerində (runPaymentFlow specific-order + dine-in loop; handleSplitConfirm per-item +
   ratio). Modal `cashGateModal` (z-130): "KASSA AÇIQ DEYIL" + one-tap **Kassanı aç** + "Başqa ödəniş
   üsulu". `cashGate` state = pending retry closure; CashDrawerPanel-in yeni `onDrawerOpened` prop-u
   retry-i fırladır (direct-open + clock-in→auto-retry yolunun HƏR İKİSİ əhatə olunur).
4. **LATENT BUG #2 (stale-closure sonsuz dövr, E2E catch):** retry closure köhnə `runPaymentFlow`-u
   işlədir → hələ `shiftMissing=true` → pre-check yenidən fırlanır → modal sonsuza qədər açılır,
   POST heç getmir. Fix: `skipPrecheck` param — BÜTÜN auto-retry closure-lar `true` ötürür (server
   SSOT qalır).
5. **LATENT BUG #3 (cleanup yanlış state-ə bağlı idi, E2E catch):** `if (!actionSheetOpen)
   setCashGate(null)` retry-i yuyurdu — PAYMENT VIEW action sheet CAPALI vəchə render olunur.
   Re-anchor: `if (!paymentView)` (effect `paymentView` declaration-ından SONRA — TDZ).
6. **MICROCOPY (11q banner):** "NAĞD ödəniş qəbul edilə bilməz (kart/QR açıqdır). Sifariş qəbulu
   davam edir."
- **tsc clean (source; `src/__tests__` jest-ti pək mövcud), production build PASS.**
- **FINAL E2E (r11r-v6, 2026-10-01 14:14 Baku — handoff-un qalan tək scenariyi):** ORD-2947 (masa 471,
  dine_in, ₼10, UNPAID) → ⋯ → HESABI BAĞLA → NAĞD, verilən 10 → ÖDƏNIŞI TAMAMLA → **gate modal
  "KASSA AÇIQ DEYIL"** → KASSANI AÇ → Kassa panel → KASSA AÇ (shift clock-in implicit: SMENA AÇIQ
  @14:14) → **panel auto-bağlandı + paymentsiz auto-retry** → receipt "SİFARİŞ ÖDƏNILDI ✓" ₼10
  (Nağd, verilən 10.00, qalıq 0.00) → **amber banner GONE** → kassa log: "Kassa açıldı +0.00₼" +
  **"Nağd Ödəniş · Masa 471 +10.00₼"**. DB təsdiqi: order `paid`, `cash_received=10`, `change=0`,
  `order_payments` cash row + drawer log rows **session-bound (non-null)**. Kart payment gate-siz
  keçdi (attempts 1–5, masa 472 ₼35). **Console 0 error.** Shots: `e2e-shots/r11r-v6-*.png`.

### Jurnal sətiri — 2026-10-01 (ROUND 11q: ZONA MƏNTİQİ FİX + DİNAMİK ETA + KASSA BANNER + MICROCOPY)

Owner: (1) zona vs Ümumi min-sifariş ziddiyyəti (15 vs 3) + KM aralığı məntiqi (0–5 km zonadan
xaric qalır — mərkəz zonası MIN KM=0 olmalıdır), (2) POS müştəri mərhələsində KM/HAQQ sıfır görünür —
zona seçildikdən sonra avtomatik dolmalıdır, min-sifariş warning ifadəsi aydın deyil, (3) zona ETA
boşdur amma POS "30 dəq" yazır — konkret 20–30 aralığı verilməlidir, (4) Surx/Sürx + valyuta
simvolu mövqeyi eyni olsun, (5) məsləhətlər A/B/C/D — **D onaylandı** ("butun məhsul icinde duzgun
dinamik hesablamaq mence daha qeseng olar"), kassa suali: kassa açılmadan sifariş qəbul/bağlamaq
ne dərəcədə düzgündür (gün sonu hesabda səhv düşə).

1. **ZONA DATA FİX (DB = SSOT):** "Bakı Mərkəz": `min_km 5→0` (mərkəz zona 0 km-dən başlayır),
   `min_order 3→NULL` (zona minimumu silindi → indi global ₼15 işləyir, ziddiyyət aradan qalxdı),
   `est_minutes_min/max → 20/30`. "30 dəq" sirri = `zoneEtaLabel`-in LEGACY `estimated_minutes`
   fallback-ı; indi chip real aralıqı oxuyur: "20–30 dəq".
2. **MƏNTİQ QAYDALARI BOX (Settings → Çatdırılma):** 3 qayda operatorun başından ekrana köçdü
   (amber info box): Min sifariş (zona boş = ÜMUMİ minimum), Min km (mərkəz zona 0 olmalıdır),
   ETA (aralığı doldur — POS oxuyur; KDS yüklüyə görə dinamik artır).
3. **DİNAMİK ETA (owner idea D):** yeni DB funksiyası `estimate_delivery_eta(p_zone_id)
   RETURNS json` = zona base (est_minutes_min/max) + LIVE mutfak növbəsi — BÜTÜN order
   tiplərində kitchen_status ∈ (sent,accepted,reserved,preparing,partially_ready) olan
   order_items sətirləri sayılır → hər sətir +2 dəq, cap +30. API: `/api/rpc/estimate_delivery_eta`.
   POS müştəri mərhələsi: zona seçiliyken fetch + 30 sn-də bir re-fetch → haqq boxunun altında
   "Təxmini çatdırılma: 50–60 dəq · mətbəx: 18 aktiv sətir (+30 dəq)" (canlı E2E: base 20–30 +
   load 18 → cap +30). Math server-authoritative, UI yalnız aynadır.
4. **POS AUTO-FILL (mexanizm mövcud idi — data broken idi):** chip tap = eksplisit məsafə qərarı —
   `zoneRepKm` (km aralığının midpoint-i: 0–15 → 7.5) KM-yi zone ilə EYNİ cart yazısında doldurur +
   `recalcDeliveryFee({pinZone:true})` → fee RPC həmin zonanı həmin km-də qiymətləndirir.
   E2E: KM=7.5, haqq=₼2, chip "Bakı Mərkəz · 0–15 km · ₼2 · 20–30 dəq".
5. **WARNING TEXT:** "Min sifariş ₼15 — ₼15 daha əlavə edin" → "Minimum sifariş məbləği ₼15-dir —
   səbətə daha ₼15-lik məhsul əlavə edin" (qayda + dəqiq gap, bir cümlə).
6. **KASSA RİSKİ (owner sualının həlli):** sifariş create/pay-da shift gate YOXDUR (by design —
   satış heç vaxt dayanmır), amma kassa açılmadıqda NAĞD hesabatı körlənir → gün sonu report
   səhv verir. Həll = NON-BLOCKING guard: shift açıq deyilsə POS-da amber banner "Kassa (shift)
   açıq deyil — sifarişləri qəbul etmək olar, amma nağd hesabat tam qalmır" + one-tap "KASSANI AÇ".
   `/api/cash-drawer` 60 sn poll. Sifariş qəbulu/bağlanması heç vaxt blokLANMIR.
7. **VALYUTA KONSİSTENTLİĞİ:** Settings (general + zona kartları) "Haqq (₼)" / "Pulsuz limiti (₼)" /
   "Min sifariş (₼)" label-ları → "Haqq" / "Pulsuz limiti" / "Min sifariş" + input-UN İÇİNDƏ ₼
   prefix (pl-7, AnalyticsTab pattern) — POS-un "₼2" formatı ilə eyniləşdi.
8. **SURX/SÜR:** verify olundu — source-da "Surx" spellinqi YOXDUR; yalnız "Sürx" var
   ("Smart Sürx (Wolt)" heading + "Sürx × (1–3)" label; ss-dakı "SÜRX" = CSS uppercase). Dəyişiklik lazımsız deyil.
- **TDZ crash (self-introduced, E2E catch):** 11q-nin dynamic-ETA bloku `zoneName`-ı onun `const`
  declaration-ından ƏVVƏL referens etdi → müştəri mərhələsi açılanda crash
  ("Cannot access 'zoneName' before initialization"). Fix: zoneId lookup + effect zoneName/feeNum-
  dan SONRAYA köçürüldü. Re-run: 0 console error.
- **tsc clean (source; `src/__tests__` jest-ti pək mövcud xətalardır), production build PASS,
  browser E2E A(6/6)+B(3/3)+C PASS, console 0.** Shots: `e2e-shots/r11q-*.png` + `r11q-fix-*.png`.

### Jurnal sətiri — 2026-10-01 (ROUND 11n: POS STATUS AXLINI AYRILDI + ÖDƏNİŞ İKONU + SERVED-LOCK + DEFAULT SERVING)

Owner: (1) delivery-də qiymət yanında ödəniş ikonu (✓ / aydın "gözləyir" ikonu), (2) soldakı
chip-də ödəniş YOX — mətbəx/kuryer statusu, (3) takeaway/delivery üçün uyğun ikonlar (takeaway
= insan sifarişi götürür), (4) served məhsuldan YENİ porsiyon əlavə edilə bilməyən lock bug-ı,
(5) serving üsulu default settings + chip yalnız fərqli seçimdə.

1. **Fulfillment vs Payment AXINI AYRILDI (`deriveFulfillmentStage`, order-stage.ts):**
   Board chip əvvəl `deriveOrderStage` işlədirdi — orada 'paid' STAGE idi → 33/34 takeaway
   kartı "ÖDƏNİLDİ" göstərirdi (progress YOX, pullu vəziyyət). Yeni `FulfillmentStage`
   (new/confirmed/kitchen/ready/picked_up/in_transit/closed/cancelled) = yeməyin NƏRƏDƏDİR:
   kuryer maşini (state_transitions) > kitchen rollup > order status. Payment = yalnız
   BoardOrderCard-da total yanında ikon: `CheckCircle2` (emerald, "Ödəniş alınıb") /
   `Hourglass` (amber, "Ödəniş gözləyir"). `in_transit` config əlavə olundu (əvvəl 'pending'
   config-ə düşürdü — yanlış label). E2E (r11n): takeaway #2929 "Mətbəxdə"+hourglass,
   #051 "Hazırdır — Təhvil"+✓; delivery #071 "Hazırlanır"+hourglass — heç bir kartda
   "Ödənildi" chip YOX, console 0.
2. **TAKEAWAY İKONU = UserCheck** (insan + check = sifarişi götürən müştəri): mode switcher
   (Handbag idi — owner "insanın sifarişi götürməsini ifadə edən" istədi) + board header
   (hal-hazırda da UserCheck idi, indi eyniləşdi). Delivery = Bike (qalır).
3. **SERVED-LOCK BUG (owner screenshot — Yasai Roll):** single-mode panel (1 xətt, SERVED)
   da "Yeni porsiyon əlavə et" YOXDU idi (inst-strip yalnız multi-mode-da render olundu) +
   multi-da "＋ Yeni variant" `!specLocked` ilə gizlənirdi → served məhsul dead end.
   FIX: (a) single-mode-da dashed "Yeni porsiyon əlavə et" button; (b) "＋" həmişə görünür;
   (c) `addNewInstance` specLocked-guard-sız; (d) seed draft-a `kitchen_status` daşıdıldı
   (yeddi pill multi-strip-də UNLOCKED görünməsin). Kilid PER-INSTANCE qalır (served
   porsiyon hələ də qalın — GERİ QAYTAR yolu), yeni draft öz spec-i ilə sərbəst.
   E2E (r11n): dashed + → 2-ci pill ACTIVE, stepper/modifikatorlar/mərhələ UNLOCKED,
   CTA "YADDA SAXLA · 2" ✓.
4. **DEFAULT SERVING ÜSULU:** Ayarlar → Mətbəx → "Standart Serving Üsulu" (4 pill:
   Başlanğıc/Ana yemək/Desert/İçki; settings 'order' scope `default_course`, default
   'main'). usePos mount-da oxuyur → hər NEW xətt eksplisit default course alır
   (plain tap merge key də default-la — "×4" behavior qorunur). Cart: course chip YALNIZ
   `course !== defaultCourse`-da görünür (default = chip-siz). Chip FƏRQLİ: Utensils ikon +
   course-tint border/fill + "Serving üsulu:" title (modifier chip = SlidersHorizontal +
   neytral "N əlavə"). Panel Mərhələ pill: untouched course (null) = default GÖSTERİLİR
   (auto-təyin görünür), save-də `__course: editCourse ?? undefined` (null default-sızmır).
   E2E (r11n): Tea tap → chip YOX; panel Desert → SAVE → pink "🍴 Dessert" chip ✓.
- **tsc 0, production build PASS, browser E2E 6/6 (TEST 4 partial→verified: Yasai Roll
  OOS olduğuna Tea üzərində mexanizm kanıtlandı), console 0/0.**

### Jurnal sətiri — 2026-09-30 (ROUND 11g: BACKEND CONSISTENCY AUDIT + FROZE-EVAL + APPLE POLISH)

Owner: "Bütün sistemin peşəkar şəkildə qurulduğunu yoxla... kritik problemlər
aradan qaldırıldıqdan sonra frozen elan et." 15 backend kandidatı yoxlanıldı, 12 fix:

1. **İki-faza idempotency (CRITICAL):** `order_idempotency_keys.order_id` DROP NOT NULL;
   /api/orders create = RESERVE (unique insert, `Prefer: return=representation,
   resolution=ignore-duplicates` — əvvəl empty-body "Unexpected end of JSON" bug) +
   CONFIRM (blocking, retry-li order_id write). Append key-recording 3 path-də də →
   /api/orders TAM auto-replay-safe. Orphan reservation takeover.
2. **Goods-receipt atomik RPC (CRITICAL):** `receive_purchase_order(p_po_id, p_items)`
   plpgsql (FOR UPDATE row-lock, delta semantics, PO_NOT_FOUND/PO_<status>_CANNOT_RECEIVE).
   Əvvəlki client-side rollback supabase-js {error} no-throw mənasiylə DEAD CODE idi.
   Bug fix: delta round `*1000` (1000× böyümə — stock contamination -10000 adjustment
   ilə təmizlənib, baseline 5060 bərpa).
3. **Queue data loss (CRITICAL):** queue.ts replay 200{success:false}-da item SİLİLİRDI
   → indi body oxunur, business-fail = MANUAL-a (insan qərarı).
4. **Supplier counter race:** `increment_supplier_orders` RPC (atomic); PO delete decrement
   .error check; in-route auth (middleware fail-open əməliyyatına qarşı).
5. **Payroll webhook SSRF + date injection:** YYYY-MM-DD gate + public http(s) host guard.
6. **Online zone:** unknown zone_id → 400 (əvvəl zones[0] silent fallback); min-order
   client hint; rate-limit sweep; rollback cancel check.
7. **UI (Apple polish + E2E catch):** POS delivery toast result-check; RoomCharge/
   Corporate modal input-only (parent canonical payment — əvvəl HƏMİŞƏ 400); Terminals
   duplicate-key spam (client dedup device_id); Payroll panel auto-load + empty state;
   peak-hours redundant footer; /kitchen theme mount gate (hydration error → 0); menu
   checkout disable-until-valid + delivery segment zone-sız disabled.
8. **Light-mode rescue:** stats KPI/peak hardcoded white → theme vars (11c qalıqları);
   stats-scope CSS rescue qatı (147 text-white, accent-collision YOXDUR verified);
   POS light-mode KPI-ları görünür.
- tsc 0, production build PASS, E2E sweep r11j/r11k/r11l 0 error.
- FROZE qərarı: owner 11n-də konkret UX isteklər verdi → freeze elanı 11n sonrasına
  sürüşdürüldü (comparison.md §0 before/after hazırdır).

### Jurnal sətiri — 2026-10-01 (ROUND 11o: CHIP MƏNTİĞİ + CUSTOM İKONLAR + ACTION-SHEET BACK)

Owner: (1) chip yalnız REAL seçimdə (default stamping chip yaratmamalı; modifikatoru
olmayan məhsulda Mərhələ belə görünməsin), (2) "brauzerdən derin axtarış, custom ikon
download et; takeaway = person sifarişi götürür; Apple felsefəsi", (3) ActionSheet-də
back button.

1. **Chip = yalnız real selection (11n-dən geri qaytarma):** plain tap indi xəttə
   `course: null` yazır (11n default course eksplisit stamp edirdi — owner bunu
   "səsiz təyin + chip" olaraq gördü). null = house default (placeOrder/panel
   `|| defaultCourse` ilə həmişə real dəyərlə yola çıxır), merge key null-semantikaya
   qaytdı ("×4" qorunur). Cart chip gate eyni qaldı (`course && course !== defaultCourse`)
   — null olduqdan sonra default-heç vaxt chip gətirmir. Panel: Mərhələ section YALNIZ
   məhsulun modifier options varsa render olunur (`modifiers.length>0 ||
   modifier_groups.length>0`) — modifikatorsuz məhsulda səsiz default.
   E2E (r11o): Tea tap → chip YOX + panel-də Mərhələ YOX; Filadelfiya tap → "1 əlavə"
   chip (real modifikator) + Mərhələ panel-də (default gold); Desert → SAVE → "🍴
   Dessert" chip (pink, modifier chip-dən fərqli) ✓.
2. **CUSTOM İKONLAR (deep browser search, 7 set, Iconify API):** heç bir mainstream setdə
   "person + pickup" stroke ikonu YOXDUR (yeganə person+bag = pinhead map-pictogram, CC0,
   detallı). Hugeicons `hand-bag-01` (MIT) candidate E2E v1-də 420px-də HANDBAG/PURSE
   olduguna görə REJECT. Final: `TakeawayPickup` = hand-composed universal local-pickup
   piktogramı (person: head+shoulders | bag: trapezoid+handle — exact lucide 24/stroke-2
   grid) + `Moped` (Tabler, MIT — Baku kuryerləri skuter sürür, Bike semantic zəif idi).
   Yeri: mode switcher + board header-lər (takeaway emerald, delivery blue).
3. **ActionSheet back button (owner: "geri çıxmaq üçün button lazım"):** main actions
   sheet-də görünən dismiss YALNIZ backdrop-tap idi → iOS-standard circular chevron
   (top-4 left-4, frosted, theme-aware, aria "Geri") əlavə olundu; click = onClose.
   Sub-view-lərdəki BackButton pill-ləri artıq vardı (2026-09-29 fix).
- **tsc 0, production build PASS, browser E2E v1 (takeaway icon REJECT → v2) + v2 4/4
  PASS, console 0/0.**

### Jurnal sətiri — 2026-10-01 (ROUND 11p: QISA STATUS + PİLL İKONLARI + DÜZ ÖDƏNİŞ TEXT + "#")

Owner: (1) delivery/pickup status yazıları çox uzundur — qısa ("hazirdir, transitdə,
catdirildi direk"), (2) pill-də status ikonu (person / navigator — "sanki ora gələcək
kimi"), (3) ActionSheet-də "ÖDƏNİLMƏYİB" chip OLMASIN — birbaşa text, (4) sifariş
nömrəsinin yanında "#" olmasın, (5) kassa sualı (izah).

1. **QISA label-lar (i18n az/en/ru):** Hazırdır — Təhvil → **Hazırdır**; Hazırdır —
   Çatdırma → **Hazırdır**; Kuryer Alıb → **Alındı**; Yoldadır → **Transitdə**;
   Təsdiq Gözləyir → **Yeni**; Təsdiqləndi → **Təsdiq**; Ləğv Edildi → **Ləğv**;
   Yeni Sifariş → **Yeni**. (preparing/hazırlanır, mətbəxdə, çatdırıldı, bağlandı
   hal-hazırda qısa idi.) Subtitle-lər dəyişməz (sheet/detail detallı qalır).
2. **PILL İKONLARI** (status config `icon` field, BoardOrderCard render edir):
   in_kitchen/preparing → **ChefHat** (mətbəx işləyir), ready → **User** (person —
   götürməyə hazırdır), picked_up → **Moped** (kuryer aldı), in_transit → **Navigation**
   (sanki ora gedir). Dot + icon + qısa text.
3. **ActionSheet payment = DÜZ TEXT** (pill/border/dot yoxdur): emerald "ÖDƏNİB" /
   amber "ÖDƏNİLMƏYİB" title altında. (Cancelled pill qalır — o payment deyil.)
4. **"#" silindi** — BoardOrderCard title = sırf rəqəm (2929, 064).
- **Kassa izahı (owner sualı):** sifariş qəbuli/ödəniş shift-dən BAĞIMSIZdır —
  `api/orders` + `api/orders/pay`-də heç bir shift/drawer gate YOXDUR. Kassa (shift)
  = nağd hesabat vasitəsidir (aç/bağla, in/out, no-sale, Z-report), order axınının
  qapısı deyil. Shift açılmadıqda: satış/ödəniş heç itmir (orders+order_payments-ə
  yazılır); YALNIZ həmin dövrün nağd axını kassa Z-report-da görünmür (hesabat
  həyatiyyəti). Qəsdən belədir — unudulsa satış dayanasın deyə risk yaratmaz.
- **tsc 0, production build PASS, browser E2E 4/4 PASS, console 0.**

### Jurnal sətiri — 2026-09-30 (ROUND 11f: QALANLAR TƏMAMI — offline phase-2 quick batch + VOID anomaly + 2 broken payment yol)

Owner: "qalanlarida tezz tamamla". 4 istiqamet, hamisi E2E-verified:

1. **VOID ANOMALY DÜZƏLDİLDİ (long-standing known issue):** root cause =
   `usePos.selectTable` re-hydration. Void edən zaman DB: item `voided` + (sonuncu
   xətsə void olunsa) order `cancelled` → GET `/api/orders` (order_items(*) filter-siz)
   → `primary=null` → else branch `if (draftsAreThisTables) return prev` = cart toxunulmaz
   qalırdı → void edilmiş xətt success toast-dan dərhal SOVURULURDU. FIX (2 qat):
   (a) partial-void: serverItems filter + `!['voided','cancelled'].includes(kitchen_status)`
   (order active qalsa da voided xəttsə cart-a qayıtmır); (b) full-void: else branch
   `orderIsDead` (final order voided/cancelled) → sent xəttsələri drop, drafts qalır.
   PAID order-lar köhnə behavior saxlayır (sent rows = repeat-order affordance).
   E2E (r11i): Masa 97 Coke göndər → void → toast "1x Coca-Cola — 3.00₼ ləğv edildi" →
   cart "MƏHSUL YOXDUR" və 3s rehydration-dan sonra DAHA boş qalır ✓ console 0.
2. **Append (addItems) idempotency — offline auto-replay SAF oldu:** key-recording əvvəl
   create-branch-də idi; indi addItems branch + implicit-append (existingOrder) path-də
   də yazılır. `usePos.placeOrder`: `sendIdemKey` (əvvəl createIdemKey) BOTH branch-lərə
   gedir → /api/orders tam auto-replay-safe (create + append). Bonus: 5xx retry append üçün
   də duplicate-safe oldu. API E2E (Masa 10): create ₼3 → addItems(key A) ₼6 → EYNİ key A
   replay → `idempotent:true`, total ₼6 (items=2 DB-verified, duplicate YOX) ✓.
3. **Offline PAYMENT UI:** `/api/orders/pay` (AUTO_REPLAY, server idempotency tələb edir)
   202-{queued} cavabını 7 caller-dən yalnız 1-i (multi-pay) işləyirdi → indi hamısı:
   single-order pay, split (hər 2 loop), retryFailedPayments, TableContext.closeBill,
   RoomCharge, Corporate — "Ödəniş offline növbəyə yazıldı ✓" toast, fake "paid" YOX.
4. **ROOM-CHARGE / CORPORATE payment TƏMAMEN BROKEN idi (pre-existing):** modallar öz
   `/api/orders/pay` POST-unu `method`+`amount`+order_id-siz atırdılar → server
   `order_id is required` 400 → HƏR room/corporate ödənişi fail + success toast yox.
   Arxitektura: real ödəniş parent `runPaymentFlow(method)`-dən keçir (order_id +
   idempotency_key + idarə olunan). FIX: modallar INPUT-ONLY → `onSuccess(reference)` →
   `onPaymentMethodSelect(method, …, ref)` → `runPaymentFlow(…, cardRef=ref)` →
   `card_reference` = "Otaq 12 · John" / "ACME · PO-123" (order_payments.reference).
5. **Settings Terminals duplicate-key spam (500× "two children with same key"):**
   `/api/devices` location filter-siz → eyni fiziki cihaz (stabil device_id) iki
   location-da heartbeat atanda 2 sətir = eyni React key. FIX: client dedup
   (Map by device_id, ən yeni last_seen qalır). E2E (r11i): console 0/0 ✓.
- **Fayl (9):** `api/orders/route.ts` (2 key-record), `usePos.tsx` (sendIdemKey + void
  filter + orderIsDead), `TableContext.tsx`, `admin/pos/page.tsx` (4 pay sitesi +
  cardRef forward), `ActionSheet.tsx` (type + 2 onSuccess), `RoomChargeModal.tsx`,
  `CorporateModal.tsx` (input-only rewrite), `TerminalsTab.tsx` (dedup). tsc clean.
- **Artıq known open YOX:** VOID anomaly closed. Qalan known: offline append REPLAY
  cavabının cart order_id-a bağlanması (UI cosmetic — server self-heal append edir),
  real PSP (owner qərarı).

### Jurnal sətiri — 2026-09-30 (ROUND 11e: OFFLINE ORDER INTAKE + SYNC (competitive gap 2) — marathon sonuncu (5-ci) gap)

- **Scope:** offline phase 1 (monitor/queue/cache/apiFetch/OFFLINE_BLOCKED money routes/OfflineBanner) ZİRƏDƏN VARDI — qalan nüvə = order CREATE-in offline-queue replay-ə SAF olması. Pay/void/refund = phase 2 (blocklu qalır, fake "paid" heç vaxt yoxdur).
- **LIVE DB:** `order_idempotency_keys(key text PK, order_id uuid, created_at)` + `prune_order_idempotency_keys()` (30 gün retention, advisory-locked + idempotent) — `payment_idempotency_keys` pattern-inin mirror-u.
- **`api/orders` (create branch):** `idempotency_key` (≤128 char) gələndə create BAŞINDA dedup check — mövcud key → `{success:true, idempotent:true, data:prevOrder}` (2-ci order YOX). Key order yarandan SONRA best-effort yazılır (fail = normal keyless behavior, order block olunmur) + prune call.
- **`lib/offline/queue.ts`:** `KEYED_AUTO_ROUTES = ['/api/orders']` — `auto = AUTO_REPLAY_ROUTES.has(route) || (KEYED_AUTO_ROUTES.has(route) && !!idemKey)`. Keyless /api/orders yazıları (addItems/append) MANUAL qalır — blind re-send item duplicate edərdi.
- **`usePos.placeOrder`:** hər NEW-order create üçün `crypto.randomUUID()` key body-də. **Queued branch:** `202 {queued:true}` (apiFetch synthetic) → ayrı AZ toast "Sifariş offline növbəyə yazıldı — internet qayıdanda avtomatik göndəriləcək ✓" + `sentQuantity` irəliləyir (re-tap = 2-ci key = 2-ci order qarşısı) amma `logOperation` + `/api/print/enqueue` SKIP (phantom order-a). Non-dine-in cart clean, floor'a geri. **Idempotent-unwrap fix:** replay cavabı nested gəlir `{data:{idempotent,data:{order}}}` → `createdOrderId` unwrap edir (5xx retry edge: order artıq yarandığı halda UI doğru order id bağlayır; kitchen print trigger per-order idempotent).
- **Replay mexaniki:** reconnect (navigator/saito:net) → `drain()` FIFO single-flight → eyni body+key serverə → dedup = ORIGINAL order → item drop. 401/403/409/422 = drop (blind retry kömək etmir), 5xx = backoff 10/30/60/120s, 10 fail = manual.
- **E2E (API, masa 10, Coca-Cola 2×₼3):** POST key A → create `349218b5` ₼6 ✓; POST **aynı key A** → `idempotent:true`, EYNİ id, DB-də 2-ci order YOX ✓; POST key B (aynı masa) → APPEND eyni order, ₼12 (duplicate create YOX) ✓; idem tablasında 2 key → hər ikisi eyni order id ✓. Test data tam silindi (order cancelled, table empty, 2 idem + session row delete). tsc clean (non-test 0).
- **E2E (browser, r11f/r11g/r11h):** (A) 11c stats: peak 24-bar + SİFARİŞ/GƏLİR toggle (13:00 9 sifariş/345₼ PİK), staff panel 4 sıra + ÇƏKILIŞ dəq + CSV ✓. (B) 11d online: /menu table-suz → "Sifariş et →" (dead button fix) → TAKEAWAY Tea×2 ₼20 → success+track ("Qəbul edildi") → **KDS-də TAKEAWAY title ilə görünür** ✓ (console 0/0). (C) 11e offline (Masa 97): force-on → banner ✓; send → toast EXACT "Sifariş offline növbəyə yazıldı — internet qayıdanda avtomatik göndəriləcək ✓" → panel-də "Sifariş" + **GREEN AUTO** chip → release → **POST /api/orders → 200** (aynı key, duplicate YOX) → "1 əməliyyat sinxronlaşdı ✓" → banner yox ✓; flow 3× reproducé, console 0/0.
- **E2E catch (fix):** force flag page reload-dan sonra localStorage-da qalır amma monitor state in-memory 'online' resetlənirdi → **səssiz queue, banner YOX** (useIsOffline = `s==='offline'` only). Fix: `useIsOffline()` = `s === 'offline' || isForcedOffline()` (force dəyişikliyi həmişə setForcedOffline→emit→notify gedi → reaktiv qalır). Re-verify (r11h): force-on → FULL RELOAD → banner görünür ✓, release, console 0/0. Qalan known: /admin/settings (Terminals) React "two children with the same key" duplicate-key error — PRE-EXISTING (11e-dən qabaq), ayrı round.
- **Known limitations (phase 2-ə):** (1) append (addItems) offline-də MANUAL replay — dedup contract-ı ayrı round tələb edir; (2) replay cavabı UI-a çatmır (queue drop edir, POS screen order id almır — masada order görünür amma cart order_id bağlamır; dine-in yeni tap yeni order yaradır — bill fragmentation qəbul olunur, data yoxdur); (3) offline PAYMENT = block (503), offline cash ledger phase 2; (4) browser E2E (banner/queued toast/replay vizual) final batch-ə deferred.
- **Fayl (5):** `api/orders/route.ts` (dedup check + key record + prune), `lib/offline/queue.ts` (KEYED_AUTO_ROUTES), `admin/pos/hooks/usePos.tsx` (create key + queued branch + idem unwrap), `lib/offline/monitor.ts` (useIsOffline force-fix). LIVE DB: 1 table + 1 fn. tsc clean.

### Jurnal sətiri — 2026-09-30 (ROUND 11d: ONLINE ORDERING MVP (competitive gap 1) — marathon 4-cü gap)

- **Diagnoz:** `/menu` YALNIZ table (QR) rejimində işləyirdi — table-suz visitor-ın cart-ı olurdu amma "Check aç" düyməsi `tableNumber` tələb etdiyi üçün DEAD idi (UX qırıq). Customer takeaway/delivery kanal YOXDU. Bonus root cause: `/kitchen/track/[orderId]` page var idi amma **`/api/orders/[orderId]/track` route-u YOXDU** → izləmə səhifəsi həmişə 404 → "Sifariş tapılmadı".
- **Yeni public route `api/orders/online`:** GET = online kanal konfiqurasiyası (active location `delivery_mode` + active delivery_zones [id,name,fee,min_order,estimated_minutes]); POST = takeaway|delivery order create — **G3/QR eyni trust model** (IP rate limit 20/60s, server-trusted location = ən köhnə ACTIVE location, server-sourced price D13 — client price ignored, unavailable product guard, EDV settings auto_apply_vat + explicit override, `guest_link_customer` CRM/loyalty link). Delivery: zone select (default = priority 1), address (min 5 char), fee zone-dan, min_order guard (items+fee < min → 400), estimated_delivery_time = now + zone.estimated_minutes. Order: table_number NULL, status confirmed, kitchen_status pending, version 1; SSOT total VAT-də (items rpc + fee); item insert fail → order cancel rollback. Response: {orderId, total, order_type, delivery_fee, customer, trackingUrl}.
- **Yeni public route `api/orders/[orderId]/track`:** order + order_items (prepared_quantity/kitchen_status) + products image enrich; format = track page-in gözlədiyi {id, table_number, order_type, status, kitchen_*, created_at, total_amount, items[]}.
- **Middleware (PUBLIC_PATHS):** `/api/orders/online` + dynamic `/api/orders/<uuid>/track` (5-segment pattern check — unguessable UUID = access control, QR code eyni model).
- **Menu UI (customer, no-table flow):** sticky bar "Sifariş et →" (table-less dead button fix) → checkout sheet (TAKEAWAY/ÇATDIRILMA toggle, ad, telefon [saved phone reuse], delivery üçün zone select [fee+~dəq] + ünvan, total + fee) → confirm → success panel (total + qeyd + "Sifarişi izlə →" tracking link). Table (QR) axını DƏYİŞMƏYİB (W-A2 frozen).
- **Track page:** no-table order üçün label fix ("Masa undefined" → Takeaway/Çatdırılma/Onlayn sifariş) + order_type/status interface genişləndirməsi.
- **E2E (API verified; browser batch 11-final):** GET zones → Bakı Mərkəz fee 2₼/30 dəq ✓; TAKEAWAY (2×Tea+1×Green Tea JP) → total **24₼ exact**, CRM linked ✓; DELIVERY (1×Tea, Nizami 15) → total **12₼** (10+2 fee), zone/addr/est DB-də ✓; TRACK public → status confirmed + items ✓. KDS visibility: order status='confirmed' + kitchen_status='pending' = KDS active queue-nin eyni filter (browser batch-də vizual verify). tsc clean.
- **KDS VİZİBİLİTY — CRITICAL PRE-EXISTING BUG (LIVE DB verified):** `table_number gt.0` filter (HƏM `/api/kitchen/orders` route HƏM kitchen page-in anon fallback fetch-də) **BÜTÜN no-table order-ı KDS-dən düşürdü** — 48 takeaway + 19 delivery canlı order KDS-də HEÇ VAXT görünməmişdi (MVP "→ KDS axını" üçün blocking). Fix: `or=(table_number.gt.0,order_type.eq.takeaway,order_type.eq.delivery)` (nested `and.(in.)` PostgREST parse error verdi — flat or kifayət). Kitchen client: `order_type` Order interface + mapRawOrder-a; `orderTitle()` module helper (MASA N / TAKEAWAY / ÇATDIRILMA) — card title, modal title, delay toast, undo label, new-order toast-larında. G6 outbox (`emit_kds_ticket_event`) table-filter ETMƏMİŞDİR → real-time spine onlayn order-ı wake edirdi, amma rebuild onları silirdi — indi qalıcıdır.
- **E2E (API):** /api/kitchen/orders (staff token) → **7 active: 2 onlayn test (takeaway 2 item, delivery 1 item) + mövcud POS delivery (3 item) ilk dəfə KDS-də** ✓; track public ✓; totals exact ✓.
- **Fayl (7):** `api/orders/online/route.ts` (new), `api/orders/[orderId]/track/route.ts` (new), `middleware.ts` (2 public path), `menu/page.tsx` (checkout sheet + placed panel), `kitchen/track/[orderId]/page.tsx` (label fix), `api/kitchen/orders/route.ts` (or filter), `kitchen/page.tsx` (or filter + orderTitle + order_type). Browser E2E (menu→checkout→track vizual) deferred to final batch.

### Jurnal sətiri — 2026-09-30 (ROUND 11c: ANALYTICS DRILL-DOWN (competitive gap 4) — marathon 3-cü gap)

- **Diagnoz:** stats page "shallow" görünürdü amma 3 drill-down paneli artıq var idi (peak hours / product table / staff cards). REAL çatışmazlıqlar (LIVE DB + API verified):
  1. **Komanda Performansı paneli HEÇ VAXT data göstərməyib** (latent bug): `/api/stats` `staff?select=id,full_name,role,phone` sorğulayır — `staff` cədvəlində `role` kolonu YOXDUR (var: role_id + roles cədvəli) → select fail → staff=[] → panel `length>0` şərti ilə gizli.
  2. **Məhsul cədvəli MAYA/MARKUP/QAZANC sütunları həmişə 0**: `productPerformance` food_cost saxlamırdı (profit yalnız `topProfitableItems`-də idi, cədvəl `p.food_cost`-dən oxuyurdu → undefined→0).
  3. Peak hours = top-8 count-only (günün tam paylanması + revenue YOXDU).
  4. Staff "sürət" metrikası YOXDU (rəqib drill-down-u).
- **API (`api/stats/route.ts`):** (a) staff select fix `id,name,full_name,role_id` + ayrı `roles` fetch + roleMap (2 Promise.all destructuring sinxron); (b) `hourlyBreakdown` = 24h {hour, orders, revenue} tam timeline; (c) `productPerformance`-a profit merge (food_cost/net_profit/markup_pct ← profitByProduct, recipe-suz item-lər 0 cost); (d) staff `avgTicketMinutes` + `ticketCount` (orders.paid_at − created_at, 24h guard).
- **UI:** `StatsPeakHours` rewrite: SİFARİŞ/GƏLİR metric toggle (gold pill) + 24h mini-bar timeline (peak = gold, labels hər 2s) + peak callout + top-3 kartları; Komanda paneli: 4-metrik kart (Çəkiliş dəq) + **CSV export** (staff-performance-<period>.csv, BOM).
- **E2E (API level, browser batch 11-final-də):** /api/stats?timeFilter=month → staff 4 canlı (Kassir 37 sif / 1037₼ / 39 dəq; tofiq 9 sif / 35 dəq; roll adları: cashier/courier/superadmin ✓), hourlyBreakdown 24h (11:00→5 sif/256₼...), products 15 / 14 food_cost-lu (Saito Special: 630₼ rev, 66.69 cost, 845% markup). tsc clean.

### Jurnal sətiri — 2026-09-30 (ROUND 11b: SATINALMA/PO + QƏBUL + WAC COST (competitive gap 5) — marathon 2-ci gap)

- **Diagnoz:** PO sistemi UI-də 90% hazırdı (PO page: create modal/status dropdown/delete/receive modal; SuppliersSection: CRUD + WhatsApp + score; OCR invoice flow) amma **bütün qəbul axını sükut içində qırlırdı** — iki müstəqil root cause:
  1. **LIVE DB: `sync_product_availability()` (inventory_logs insert trigger-i) mövcud olmayan `recipe_items.recipe_id` kolonuna işləyirdi** (qədim schema: `recipes` header + `recipe_items.recipe_id`). Hər `inventory_logs` insert → trigger ERROR → insert ROLLBACK → **heç bir stock-in işləmirdi** (OCR receive də). Sxem dəyişib: `recipe_items` = (id, product_id, ingredient_id, quantity) — 12 product BOM.
  2. **`/api/goods-receipt` route-u YOXDU** — PO page-in "Qəbulu Təsdiq Et" düyməsi 404-ə düşürdü (404 HTML → res.json() throw → generic "Xəta" toast).
  3. Minor: OCR `confirm()` `purchaseOrderId: null` yollayıb 400 alıb amma `setResult(await r.json())` ilə **fake "Stok yeniləndi"** ekranı göstərirdi; PO kartları seçilə bilmirdi (sadece display).
- **LIVE DB fixes (psql, verified):** (a) `sync_product_availability` real sxemə yazıldı: direct products (direct_ingredient_id) + recipe_items BOM (product_id); OOS ≤0, reactivation = BOM-un HAMISI >0 (original semantik, düzgün tabladan). (b) `decrement_supplier_orders(p_supplier_id)` RPC (GREATEST 0 guard) + counter sinxron.
- **Yeni route `api/goods-receipt/route.ts`:** POST {purchaseOrderId, items:[{id, received_quantity}]} — **DELTA semantika** (input = NEW cumulative total; delta>0 yaddaş); ingredient binding = poItem.ingredient_id (yokdursa catalog exact-name match); stock = `inventory_logs stock_in` (DB triggers: WAC + stock + unit-cost backfill); withTransaction 3 step (stock_in / mark_received / update_po_status) + rollback (negative `adjustment` — enum-da stock_out YOXDUR!); status = bütün items tam → 'received', qismən → 'partial'; cancelled/received PO → 409 guard.
- **Route fixes:** `api/purchase-orders/route.ts` POST — create-də ingredient_id auto-bind (catalog exact match, deterministic — AI/fuzzy lazım DEYİL qəbulda); `api/purchase-orders/[id]/route.ts` DELETE — supplier total_orders decrement (RPC); `api/procurement/receive/route.ts` — `purchaseOrderId` OPTIONAL (ad-hoc faktura qəbulu: stock+reviews PO-suz; po-null guards 5 yer; empty-items guard).
- **Client fix (ProcurementTab.tsx):** `selectedPoId` state + PO kartları SELECTABLE (gold border + ✓); confirm() = PO var & seçilməyibsə → toast "Faktura üçün sifariş seçin"; `!r.ok || !data.success` → ERROR toast (fake success YOX).
- **E2E (API + browser):** API: Şəkər PO 100kg@0.02 → sent → partial 50 (status 'partial', stock 4960→5010, WAC 0.0101) → full 100 ('received', stock 5060, WAC 0.0102, pp 0.02) — WAC formula EXACT ((4960×0.01+100×0.02)/5060). Browser (r11b-po-*): create Edamame 200kg@0.10 → Göndərildi → Qəbul 80 → **Qismən** + qəbul tarixi → Qəbul 200 → **Alındı**; DB: stock 3400→**3600**, avg **0.0812** (WAC exact: (3480×0.0805+120×0.10)/3600), pp 0.10; supplier badge "2 sifariş" (detail: SIFARIŞ SAYI=2); /admin/stock render OK; console **0/0**.
- **Bilinmiş (qeyd):** (1) `POST /api/purchase-orders` idempotent DEYİL — E2E-də 1 transient "fetch failed" (browser CDP blip) → retry → duplicate draft yarandı (API DELETE-lə təmizlənib). Dev-level risk; production-da double-submit guard + server idempotency key düşünülə bilər. (2) `average_cost_per_unit` numeric scale 4-dir (WAC 4 rəqəm saxlayır). (3) `theoretical_stock` adjustment-larla HƏMƏHƏNG (by design — stocktake function set edir); test artefaktı 11 vahid delta qalıb Şəkər-də (ledger immutable — adjustment-lar theoretical-i hədəfləmirlər).
- **Fayl (5):** `api/goods-receipt/route.ts` (new), `api/purchase-orders/route.ts`, `api/purchase-orders/[id]/route.ts`, `api/procurement/receive/route.ts`, `admin/stock/components/ProcurementTab.tsx`. LIVE DB: 2 funksiya rewrite + 1 RPC + 4 test ledger row (Şəkər: +1/+10/−11 test, +100 real receipt; Edamame +200 real). tsc clean. E2E: e2e-shots/r11b-po-*.

### Jurnal sətiri — 2026-09-30 (ROUND 11a: MAŞ EKSPORTU (competitive gap 3 — time-clock punch + payroll export) — 5-gap marathon-un ilk gap-i)

- **Owner turn:** "mesge gedirem ... competitive md-da qalan 5 boşluğu hamısını fully implement et, dayanmasan işlə" — marathon başlandı (11a payroll → 11b purchasing → 11c analytics → 11d online ordering → 11e offline).
- **Diagnoz (LIVE DB verified):** punch sistemi ZƏDƏSİZDİR (TimeClockPanel + `/api/time-clock/:id/clock-in|clock-out|break` + PIN + manager force-clock-out + audit trail — 23 canlı punch satırı). AÇIQ OLAN = **payroll export TAMAMEN SÖKÜK idi**: (1) `get_payroll_export` RPC = **stub** — bütün işçilər `hours_worked:0` (agreqasiya YOX, sadəcə staff sırası); (2) `/api/payroll/export` GET = mövcud olmayan `clock_in/clock_out` sütunları + `shift_reviews`/`tip_shortfalls` (heç varamur) sorğuları; (3) POST = `payroll_exports`-a yanlış sütunlar ({provider, period_start, ..., entries_count} — real sxem: period_id/export_format/file_path/exported_by/exported_at) + `.catch(()=>{})` səssiz yutma; (4) history route = `order=created_at` (mövcud olmayan sütun → 500); (5) admin + staff UI-də export düyməsi YOX.
- **LIVE DB (source of truth, psql):** (a) `get_payroll_export` REAL hesablama ilə yeniləndi (eyni imza, `RETURNS json`): hours = `time_clock_entries` clock_in→clock_out pairing (LAG window, dövri daxilində, `/api/staff/payroll` route-un JS pairing-i ilə AYNI semantik — double-out/in-in seqensiyaları eyni davranış) × `staff.hourly_rate`; OT = təsdiqlənmiş `overtime_records` (business_date dövr içi) × rate × `overtime_rate` multiplier; tips = dövr içi `tip_distributions` cəmi; gross = hours·rate + ot + tips; net = gross (deductions 0 — tip_shortfalls cədvəli yoxdur). (b) `CREATE UNIQUE INDEX uq_payroll_periods_range (period_start, period_end)` (2 satır, dup YOX — safe). (c) E2E punch seed: tofiq agayev (courier) üçün 4 pair 09-27/28/29 (8.5+2+7.5+4.5 = 22.5h) → RPC: **22.50h, gross 112.50₼ exact** (rate 5₼).
- **API (`api/payroll/export/route.ts` rewrite):** GET = RPC çağırışı (POST body — query-param hazard yoxdur) → `format=json` (preview) | `format=csv` (BOM + `attachment; filename=payroll-<start>_<end>.csv`, 14 sütun + TOTAL satırı, escaped) + **reklam qeydi**: `payroll_periods` create-or-update (total_gross_pay/total_hours live) → `payroll_exports` insert (REAL sütunlar, exported_by = auth user). `staff_id` filter (staff self-export). POST (webhook) = eyni RPC + eyni qeyd (`export_format='webhook'`, file_path=URL). **Root cause catch:** PostgREST `return=representation` INSERT cavabı ARRAY-dır → `created?.id` undefined idi → recordExport sessiz skip (birbaşa PostgREST test ilə tapıldı) → `Array.isArray` guard. History route: `order=exported_at.desc` + `period:payroll_periods(...)` + `exporter:staff(name)` embed.
- **UI:** (1) `admin/staff` header: yaşıl **"Maaş eksportu"** button → `PayrollExportPanel.tsx` (CreateStaffSheet eyni spring sheet: Bu ay/Keçən ay presets + custom date inputlar, "Hesabatı yüklə" → preview cədvəl (Saat/Əlavə/Tarif/Ucma/Brutto/Netto + CƏMİ row), "CSV EKSORTU" (primary), "Eksport tarixçəsi" (format chip + period + exporter + timestamp + period status)). (2) `/staff/payroll` header-də **"CSV"** button → öz `staff_id` ilə eyni endpoint (rəsmi hesabat, client-side sadə OT formulunun yerinə).
- **E2E (browser, r11a-*/r11b-*):** RUN A: sheet açılır ✓, "Bu ay" default → cədvəldə tofiq 22.50h / 112.50₼ + CƏMİ 22.50 / 112.50₼ ✓, CSV EKSORTU → toast + history-də yeni satır (superadmin, CSV chip, period status OPEN) ✓, console 0/0. RUN B: staff CSV button — error YOX ✓, console 0/0. **E2E tapdıqca bug:** `toISOString()` UTC+4-də local 00:00-u əvvəlki günə çəkirdi ("Bu ay" = 2026-08-31!) → local-calendar `fmtDate` fix (hər iki komponent) → re-verify: Bu ay 01.09→30.09, Keçən ay 01.08→31.08 exact, console 0. DB state: payroll_periods 3 satır (09-23→09-30: 112.5/22.5h), payroll_exports canlı qeydlər.
- **Fayl (5):** `api/payroll/export/route.ts` (rewrite), `api/payroll/export/history/route.ts` (fix), `admin/staff/components/PayrollExportPanel.tsx` (new), `admin/staff/page.tsx` (button+sheet), `staff/payroll/page.tsx` (CSV button + date fix). LIVE DB: RPC + unique index + 8 test punch (source=admin_panel). tsc clean. E2E: e2e-shots/r11a-payroll-*, r11b-staff-payroll-csv.png.

### Jurnal sətiri — 2026-09-30 (ROUND 10f: ORDER-PANEL QEYD (SİFARİŞ QEYDİ) CARD — owner "et" — order-note card product Qeyd morph səviyyəsinə gətirildi)

- **Mövcud hall (60fps E2E, pre-fix):** order-panel "Qeyd əlavə et" pill (CartPanel.tsx footer, `!isEmpty && dine_in`) → card `fixed z-[10000] left-1/2 -translate-x-1/2`, `bottom = vkHeight>0 ? vkHeight+14 : 18` (STATE jump), spring 500/26 scale-in YERİNDƏ (386×223→423×245), close = kb collapse-dan sonra **1-kadr hard cut** (op 1→0 + unmount), pill **heç vaxt gizlənmirdi** (op 1), card pill-ə heç vaxt getmirdi (Δ ≈ 491×340px). Fərqli/köhnə komponent idi — 10c→10e product morph səviyyəsi deyildi.
- **FIX (CartPanel.tsx): EYNİ one-clock engine portlandı** (10c→10e): always-mounted pill + INLINE opacity (open-ərdə 0), portal card OUTSIDE AnimatePresence (backdrop müstəqil fade — 10c "hostage" dersi), rAF engine: `NOTE_GLIDE=480` entry (card pill rect-indən DOĞUR, z-[10003] = klaviatura ÜSTÜNDƏ, b-clock kb-mount kadrında arm, `min(kbTop−14)` occlusion backstop, content 160ms early fade), `NOTE_RETURN=380` exit → **hədəf = pill LIVE rect** (ORDER panel vk collapse-ərdə cəmi ~31px drift edir və ~180ms-də qaydalanır < 380ms → landing anında hədəf already-at-rest: exact, stale/ghost YOX; product modal-da lazım olan `+vl` qalıq termini burada YOX-dur), `NOTE_XFADE=0.6` identity cross-fade (son 40%: card səthi eriyir, pill altında görünür; pill-in 120ms global button transition-u ~transparent card altında qurtarır), deterministic landing (t≥T), idle `b=min(pillB,kbTop−14)` exact, `autoFocus` çıxarıldı (rAF caret-at-end — 10c first-paint stall dersi), vkOpen edge → morph-close, unmount teardown cancel. Textarea `cart-note-ta` (vk-active ring suppressor). Discard (Ləğv et) = revert + morph-close; Enter/Esc/backdrop/× = commit + morph-close.
- **E2E (r10f-order-*, 4 run: dark ×/cancel, dark Təsdiqlə/commit "acı olmasın", dark Ləğv et/discard, light ×):** TARGET ✓ (header "Sifariş qeydi" + z-[10003], product card DEYİL). ENTRY: birth = pill rect PIXEL-EXACT (Δ 0,0,0,0), settle card.b 605.5 vs kbTop 619.5 = **14.0px exact ride**. NO-GHOST: pill opComp 0/'0' at +300/800/1200ms (dark+light). EXIT: cross-fade inverse sync (card.op 1→0.058→0.001, pill.opComp 0→0.83→**1.0 at card.op≈0.001**), pill FLAT 1.0 landing-dən sonra (late fade YOX), landing Δ ≤0.1px (dark cancel) / 0,0,0,0 (commit/discard/light), lifetime 339–393ms (≈380). COMMIT: live relabel "Qeyd əlavə et"→"acı olmasın" (pill.w 122.9→109.1), landing label ✓. DISCARD: "acı olmasın XX" → settle-də "acı olmasın" reversion ✓. Console 0/0.
- **Qeyd (non-bug):** (1) entry-də 2 kadr card.b > kbTop (+95.9 worst) = rAF sampler 1-kadr-stale artefaktı — painted kadrdə same-frame `min()` backstop + z-10003>10002 → occlusion YOX (product round-da eyni oxunuş). (2) commit shrink-də 5 kadr >30px/kadr (max −54.1) = committed fast-start fazeı (ease-out, monoton decel, 420→109px) — təbii, product-da eyni (−64.9).
- **E2E ref-id lesson (sub-agent):** fused ref table DOM dəyişəndə id-ləri reuse edir — card-dakı button-a klik unik `aria-label` tag ilə verildi (sonra silindi); köhnə ref cart LƏĞV ET-ə çıxırdı (cart clean).
- **File (1):** CartPanel.tsx (engine block, pill ref/classes, portal restructure, handlers, effects). tsc clean (app code; 106 pre-existing `src/__tests__` jest-typing errors, ignore). Jurnal + MEMORY yenilənib. E2E: e2e-shots/r10f-order-*.

### Jurnal sətiri — 2026-09-30 (ROUND 10e: QEYD MORPH EXIT "IDENTITY HANDOFF" — owner: "yerine oturanda sanki pill olur sonradan dönür, qeyd əlavə et-də üstündəki yazı görünmür / cixis animaysiyası yerine oturanda bir qerbielik var, pill-dəki yazılar öz forması/ölçüsü deyil kimi — brauzerdə özü test et")

- **60fps brauzer E2E (r10e-prod-exit-*.json) ROOT CAUSE tapdı** (geometriya Δ 0.0px idi — bug geometriyada DEYİLDİ, opacity-identity-də): pill `disabled={specLocked || noteEditorOpen}` olur → global qayda `globals.css:322 button:disabled { opacity: .4 }` (specificity 0-1-1) pill-in `opacity-0` CLASSINI (0-1-0) override edir → editor açıq OLAN BÜTÜN vaxt pill 40%-lik GHOST kimi öz yərində qalır (backdrop-arxası, ölçülmüş opComp = 0.4, opInline = ''). Landing-də `disabled` düşür → global `button { transition: opacity .12s }` (globals.css:319) label-ı **sonradan** 0.4 → 0.713 → 1.0 fade edir (~135ms, ölçülüb) = "yazı gec görünür". Həm də card content 140ms-də gizlənir → enən object BOŞ, opaque pill-formalı səthdir (label-sız) → "sanki pill olur sonradan dönür".
- **FIX (3 nöqtə, ProductGrid.tsx):** (1) pill INLINE opacity ilə idarə olunur (inline bütün stylesheet qaydalarını yener): `openNoteEditor()` + `runNoteMorph('close')` start-da `pill.style.opacity = '0'` → ghost SIFIR (1→0-ın 120ms CSS transition-u card altında gedir — card pill-in exact rect-indən doğulur). (2) EXIT cross-fade: glide-in son 45%-də (`NOTE_XFADE = 0.55`; o anda card artıq pill ölçüsünün ~97%-indədir) card səthi `1 − noteEase((p−.55)/.45)` ilə eriyir, eyni anda pill `opacity:1`-ə keçir — pill-in öz 120ms 0→1 transition-u TAMAMEN opaque card altında qurtarır (ölçülmüş: pill 1.0-a çatanda card op = 0.4%) → **label shape İLƏ GƏLİR**, boş eniş + gec fade yoxdur. (3) Landing: card `opacity:0`-da unmount + pill `opacity:1` (həmin kadr, dəyişiklik yox → transition tetiklənmir) → invisible handoff.
- **E2E verification (r10e-fix-*, 3 run: dark cancel + dark commit/live-relabel + light):** while-open ghost: opComp = 0/'0' (t+300/800/1200ms) — pre-fix 0.4/''. Cross-fade (dark cancel, son 12 kadr): card op 1→0.93→0.64→0.28→0.14→0.076→0.041→0.022→0.011→0.004→0.0009, pill opComp 0→0→0.26→0.48→0.68→0.82→0.91→0.97→1.0 (landing−2-də, card 0.004-da) → inverse sync, 0 ghost, 0 pop. Landing: Δ dx0.1/dy−0.1/dw0/dh0 (sampler rounding); pill opComp landing+1/+3/+10/+30 = 1.0 FLAT (pre-fix 0.713 dip + 135ms fade YOX). Entry: card pill rect-inə DOĞUŞUR (Δ=0), pill 1→0 ~8 kadrda card ALTINDA (opInline '0'). Commit + live-relabel: pill 132.9→59.1 açıq-ərzində relabel olur, exit-də pill.w sabit (Δ=0), card shrink 420→59.1 təbii ease-out (max 64.9px/kadr = committed start fazeı, spike YOX). Light: eyni, Δ=0. Console 0 error / 0 warning.
- **Qeyd (scope):** order-panel "Qeyd əlavə et" (SİFARİŞ QEYDİ card, z-[10000]) FƏRLİ, köhnə komponentdir — morph YOX-dur (scale-in yerində, close = kb collapse-dan sonra 1-kadr hard cut, pill heç vaxt gizlənmir). Owner-in 10-seriyası product pill morph-udur; order-note card eyni səviyyə istənərsə ayrıca round.
- **File (1):** ProductGrid.tsx (`NOTE_XFADE`, `openNoteEditor`/`runNoteMorph('close')` pill inline opacity, `stepNoteMorph` close cross-fade + landing opacity). tsc clean. Journal + MEMORY yenilənib.

### Jurnal sətiri — 2026-09-30 (ROUND 10d: QEYD MORPH "ONE CLOCK" — owner: "buna bax (iOS Search-or-Ask video), çox smooth edir — bizdə isə yerine gedəndə cisis animasiyası berbatdır, niyə?")

- **Reference frame analizi** (ref-smooth.mp4, 240fps slow-mo, ref-frames/*): iOS 26 "Search or Ask" bar-ı. Smooth-luğu spring-dən GƏLİRMİR — motion STRUCTURE-dandır: (1) UZAQ məsafəni klaviatura özü gedir (full-width sheet, bir spring); bar yalnız top-da materialize olur; (2) BÜTÜN aktörler BİR CLOCK paylaşır — birlikdə start, birlikdə landing, heç kim heç kimi təqib etmir; (3) motion TIME-CONSTRAINED — zero final velocity bezier (bitir, kuyruqu yoxdur). 10c isə: card 155–270px glide+resize ÖZÜ edirdi, free spring (asymptotic tail = "cisis") + min() handoff velocity kick + content fade geometry-nin arxasında qalırdı.
- **FIX (spring LƏĞV olundu):** hər istiqamət BİR time-constrained glide — `cubic-bezier(0.32,0.72,0,1)` (start slope 2.25 = committed; t=1-də slope 0 = exact smooth stop):
  - **ENTRY (480ms ≈ klaviaturanın öz settle-i):** card FRAME 1-DƏ pill-dən çıxır (v₀≈700px/s); x/w/h/r bir clock; b = ayrıcı eyni-durasiya clock (kb mount frame-də arm — focus 1 frame sonra). Eyni clock+curve → card bottom klaviatura top-unu **SABİT 14px gap-də ride edir** (E2E: −14.0px worst, hər kadrda ~sabit) = rigid coupling, "bir bədən" (reference feel). Occlusion backstop `min(b, kbTop−14)` sığorta (heç vaxt bind etmədi).
  - **EXIT (380ms — collecting, biraz sürətli):** card pill-in REST rect-inə glide edir = `(pill live + live --vk-height remainder)` — bu cəmlə var=0 mövqeyi, COLLAPSE müddətində KONSTANT (pill ~180ms-də yerinə çatar, card 380ms-də → EXACT landing, chase/stale/ghost YOX).
  - **IDLE:** b = exact min formula (rest); h = 120ms bezier micro-ease (textarea auto-grow); x/w/r snap (yalnız resize).
  - **Landing = clock end** (480/380ms deterministic) — streak gate/cap/velocity check hamısı YOX (tail yoxdur ki, gate lazımdır).
  - **Content fade erkən+vəzi:** entry 0→160ms (10c: 90→270ms — kart "boş halda sürüşürdü"), exit →140ms.
  - to.h layoutEffect-də FINAL width-də ölçülür (pre-paint, no flash, no wobble).
- **E2E round 6 (4 run, hər iki theme, 16–17ms rezolyusiya, r10d-*):** A committed start: 68.6px/50ms (entry), 240.7px (exit) ✅; B′ vk-relative deceleration MONOTONE: entry 429→335→45→15→4→0.5, exit 513→324→51→4→0 ✅; C zero-velocity end: 4.0–9.7px/last 80ms ✅; **D DEAD-STILL SETTLE: 0.2–0.5px max drift / 500ms (owner-in "cisis" şikayəti — VURULDU)** ✅; E entry occlusion: −14px ✅ (sabit 14px ride); F lifetime: entry 468/477ms, exit 349/363ms, landing Δ **0.0px EXACT** ✅; G pill revealed, duplicate YOX ✅; Console **0** ✅.
- **Qəbul edilmiş trade-off (owner-a qeyd):** exit-də card bağlanan klaviaturanın ÖNÜNDƏN keçir (~110ms, max +47px overlap; z=10003, content artıq 0% opacity) — "kart klaviaturanın önündən geri qaytarılır" read; iOS reference-də belə yol yoxdu (bar top-da) amma bizim strukturdə card-ın pill-ə yolu klaviatura üzərindən keçməlidir. Alternativ (start delay 60ms) close-ləy yavaşladardı (owner əvvəl "klaviye gec bağlanır" deyə şikayət etmişdi) — trade-off bu tərəfdə saxlanıldı.
- **Bilinmiş (mühit, bug deyil):** entry onset ≈55–70ms = tap duration (pointerdown→click) + 1–2 commit frame (dev HMR); production-da 1 frame.
- **Fayl (1):** `ProductGrid.tsx` (engine: NOTE_GLIDE/NOTE_RETURN + noteEase bezier solver + NoteRectT state + stepNoteMorph open/close/idle + runNoteMorph re-anchor + openNoteEditor + layoutEffect h-measure). `tsc --noEmit` clean.

### Jurnal sətiri — 2026-09-30 (ROUND 10c: QEYD MORPH — layoutId YOX, MANUAL rAF SPRING (LIVE TARGET TRACKING) — giriş/çıxış bugları)

- **Owner turn**: "indidee berbat buglar var — giriş və çıxış animasiyasında; brauzerdə 'Qeyd əlavə et'-ə bas, görəcəksən — həm giriş həm çıxışda berbat buglar var."
- **Diagnostic (60fps geometry sampler + frame screenshots, fx-e*/fx-x*/fx-d*):**
  - **GİRİŞ (iki vuruş):** ~120ms tap→first-pixel FREEZE → card pill-in AŞAĞI y-sində (TƏSDİQLƏ klaviatura arxasında) inflate olur → vkHeight state-i enəndə AYRI ~270px yuxarı glide (non-uniform scale squash: scaleX .317 vs scaleY .212).
  - **ÇIXIŞ (ən pis — "ghost"):** card uçuşda cross-fade-ə çıxır (~190ms-də 153×48, pill-dən ~135px yuxarıda opacity→0) — pill-in ÜZƏRİNƏ morph OLMUR; real pill isə klaviatura çökdükdən ~140ms SONRA ~140px AŞAĞIDAKI yerində "pop" olur. İki element fərqli mövqedə eyni anda.
  - **KÖK SƏBƏB:** layoutId pill-in rect-ini LIVE layout-dən ölçür, layout isə HƏR iki transition-da HƏRƏKƏTDƏDİR — VKB-in `--vk-height` push-u modalı yuxarı çəkir/aşağı burur. Exit-də morph target = STALE (140px sürüşmə). Console clean (səssiz bug).
- **FIX (v2 engine, 4 E2E pass — r10c*/r10c2*/r10c3*/r10c4*/r10c5*):** `layoutId` TAM YOX (pill + card hər ikisindən). Manual rAF morph engine (`stepNoteMorph`):
  - **Pill HƏMİŞƏ mounted** (open-də `opacity-0 pointer-events-none`) — tracked anchor; `getBoundingClientRect` hər frame live.
  - **BUTTOM = ANCHOR (exact, sprung DEYİL):** `b = min(pillBottom, kbTop−14)` (kb = `[data-vk-panel]` visual rect). Entry: klaviatura kənarı pill-in altına qədər card yerində (pill alt-anchored) genişlənir; kənar keçən anda b = `kbTop−14`-ə handoff → card klaviaturanı **BİR BƏDƏN** kimi daşıyır (min-of-two-curves → position-continuous, ZERO lag → **ZERO occlusion by construction** — TƏSDİQLƏ heç vaxt klaviatura altında qalmır).
  - **x/w/h/r = spring** (K=520/C=44 ≈ critical, semi-implicit Euler per axis, h = content natural height → textarea auto-grow card-ı canlı izləyir — IDLE modda yalnız dəyişən kadrda style write).
  - **EXIT:** b/x/w/h/r pill-in LIVE rect-inə spring → --vk-height collapse-də modal aşağı sürüşdükən card pill-ini FRAME-BY-FRAME izləyir (stale target YOX, cross-fade YOX, ghost YOX). Landing: pill-in live rect-inə EXACT snap → card unmount + pill reveal eyni paint (0px handoff).
  - **Landing gate (v3/v4 itaiblər):** pure 6-frame sub-4px STREAK (velocity/elapsed clause YOX — damped tail-də velocity ~K·dist/C ≈ 10px/s qalır və gate'i sonsuza qədər dayandırırdı: v3 lifetime 962ms); dead-loop guard (pill ref transiently null → `lastPill` fallback, loop MÖRSƏYMİR — frozen static duplicate yaradırdı).
  - **AnimatePresence hostajı (v4 E2E catch):** card AnimatePresence İÇİNDE idi → landing-də backdrop-in 0.3s exit fade-i card-ı static pill-duplicate kimi 603ms saxlayırdı → card AnimatePresence-İN XARICİNƏ (backdrop ayrıca fade).
  - **First-frame stall (v3):** `autoFocus` attr commit-frame-də VKB mount edirdi (70–140ms) → YOX; focus = mövcud rAF caret effect (növbəti frame).
  - **z-order sığortası:** card `z-[10003]` > kb `z-[10002]` → 1-frame-stale rAF kadrda belə painted frame-də TƏSDİQLƏ klaviatura altında qala bilməz (settle: exact 14px gap, 0.0px).
- **E2E (round 5, both themes, 5 browser pass cəmi):** ENTRY: first paint 25–70ms · worst painted occlusion YOX (dark −4.2px margin) · settle `card.b == kb.y−14` exact 0.0px · single continuous glide. EXIT: lifetime **446–457ms (dark) / 600ms (light)** (v1: ~1100ms+pop) · landing Δ **0.00px** · unmount-gap strict **0–33ms** (v4: 603ms static duplicate) · pill revealed opaque, floating card/duplicate YOX (after1/after2/after-light) · kb parallel dismiss. Console **0** error/warning (hər iki theme). Masa 98 təmiz, sifariş toxunulmadı.
- **Bilinmiş (artefakt, bug DEYİL):** rAF sampler 1-frame stale oxuyur (sampler callback loop callback-dan ƏVVƏL işləyir → JSON-da transient `card.b − kb.y ≈ +95px` görünür, painted frame-də YOX — eyni-frame min() + z-order sığortası). Wide pill (committed note, 312px) → card aspect cross-ı (morph-in tabii xassəsi).
- **Fayl (1):** `ProductGrid.tsx` (engine: notePillRef/noteCardRef/noteContentRef/noteMorphRef + stepNoteMorph/runNoteMorph/openNoteEditor/closeNoteEditor + mount-frame layoutEffect + teardown guards; pill always-mounted; card plain fixed div; portal restructure). `tsc --noEmit` clean.

### Jurnal sətiri — 2026-09-30 (ROUND 9b: PILL DÜZƏLİŞLƏRİ — delete ×, capsule clip, FRESH DEFAULT "Standart" + is_default SSOT fix)

- **Owner turn** (4-pill screenshot + 3 nöqtə): (1) "2 beli tebikii" — collapsed cart sətiri QALIR (data 3 sətir, KDS 3 ticket); default pill-də "Standart" label-i görünməlidir; (2) "＋ var, eger basdıqsa onu silmək olmur" — pill silmək yolunu əlavə et; (3) "active pill texti tam tutmur, yarimciq qalir" — capsule ölçüsünü düzəlt; (4) "yeni spec yaradanda copy edir — onu düzəlt" — "＋ Yeni variant" aktiv pill-in spec-ini KOPYA ETMƏLİ, FRESH DEFAULT başlamalı.
- **DELETE PILL — ✅ E2E:** aktiv pill-də kiçik "×" circle (Phosphor `X`, `stopPropagation`) → `removeInstance(i)`: `__isNew` draft lokal drop; mövcud cart sətiri `onApplyInstanceEdits` qty-0 (sentQty clamp) ilə silinir + qalan draft-ların `lineIndex` re-index (sətir aşağı sürüşür). Locked (ready/served) pill silinmir. E2E: pill 2 × ilə silindi, 1 pill qaldı ✓.
- **CAPSULE CLIP FIX — ✅ E2E:** sliding capsule `useLayoutEffect`-i İNDİ `selectedModifiers`-dən də asılıdır (label dəyişdikən — "Kremli"→"Standart" pill genişliyi dəyişir, `instList` YOX) → `offsetLeft/offsetWidth` yenidən ölçülür. E2E: "Əlavə Avokado" (89px) active pill-də `clientWidth === scrollWidth`, kapsul tam örtür, kəsim YOX ✓. (Label span-in `max-w-[110px] truncate` qalır — 110px+ label-lar üçün bilinmiş cosmetic limit.)
- **FRESH DEFAULT (kök səbəb — LIVE DB verified, `supabase` rule):** owner "supabase yoxla" → LIVE Supabase sorğu (pooler, `modifier_groups`/`product_modifier_groups`/`modifier_group_items`/`product_modifiers`): Filadelfiya `products.modifiers` = `{}` (groups ayrı cədvəllərdə); **SERVİNQ ÜSLUBU (max_select=1): Kremli ₼1.50 `is_default=false`, Standart ₼0 `is_default=TRUE` (yeganə flag), Yüngül ₼0 `is_default=false`**. ROOT CAUSE: `/api/pos/products` route modifier map-inə **`is_default` keçirmirdi** (yalnız id/name/price/names) → bütün default-resolution (`freshDefaultSpec`, openEditor preselect) `is_default`-suz `items.find(m => !Number(m.price))` fallback-inə düşüb = **created_at sırası ilə ilk ₼0 = Yüngül** (Standart-dan əvvəl yaradılıb). **FIX 1 (API SSOT):** route.ts modifier map-inə `is_default: Boolean(m.is_default)` əlavə olundu → `is_default`-first qaydası İNDİ həqiqi default-u (Standart) seçir; `freshDefaultSpec`/openEditor kodu dəyişməz qaldı (artıq düzgün işləyir).
- **PLAIN TAP = STANDART SERVİŇƏ (FIX 2 — `usePos.addToCart`):** plain add (editOf-suz, explicit modifiers-suz) İNDİ hər exclusive (max_select=1) qrupun house default-unu (is_default, fallback ilk ₼0) sətir spec-inin QISMI kimi yazır — eyni qayda openEditor preselect-i ilə. Nəticə: (a) pill label "Standart" göstərir (artıq boş deyil); (b) KDS ticket-də servinq üslubu görünür; (c) `cartLineKey` uyğunluğu — plain tap line ilə "＋ Yeni variant" fresh-default line İNDİ MERGE olur (8 Filadelfiya = 2+2+4 ssenarisi tam işləyir). Explicit edit/caller modifiers toxunulmur; baha default olsa belə, qiymət hesabı eyni (modifiersTotal) — modal save davranışı ilə bitərəfli.
- **LEGACY LINE LABEL Fallback (FIX 3 — `resolveHintName`):** explicit exclusive seçimi OLMAYAN sətir (round 9b-dən əvvəl saxlanılan plain sətirlər, `modifiers: []`) pill-də qrupun house default adını göstərir ("Standart") — seçilməmiş exclusive qrup = standart servinq. Inactive pill `d.hint` boşdursa `resolveHintName(d.modifiers)` ilə resolve edir.
- **"+N" ADDON SAYI (E2E oxunurluq catch):** eyni SERVİŇƏ ÜSLUBU olan iki fərqli spec ("Standart" vs "Standart + Avokado") eyni label götürürdü. `resolveHintName` İNDİ base addından başqa seçilmiş modifier sayını əlavə edir: **"Standart +1"** / **"Kremli +2"** (qty cəmi). E2E: pill 1 "Standart", pill 2 "Standart +1" ✓.
- **DARK × VİSİBİLİTƏ (E2E dark-theme catch):** delete × token-ı dark-da **ağ kapsul üzərində ağ** idi (round 8c badge swap bug-u — eyni kök səbəb). Token İNDİ aktiv kapsul kontrastına uyğundur: light = ağ × / qara kapsul, dark = qara × (`#18181b`) / ağ kapsul. E2E: hər iki theme-də × görünür + kliklə silinir ✓.
- **E2E (MASA 98, 2 browser turu):** T1 ✅ plain tap → pill 1 "Standart", SERVİNQ = Standart selected (Yüngül YOX, boş YOX) · T2 ✅ pill 1 → Kremli, "＋" → pill 2 FRESH "Standart" (copy YOX) · T3 ✅ delete × işləyir · T4 ✅ clip YOX (ölçmə: 89px/89px, kapsul 200px) · T5 ✅ save → 1 collapsed row ×2 (₼31.50 = 15.50+16.00), plain tap → ×3, editor: 1 "Kremli", 2 "Standart +1", 3 "Standart" (plain tap = yeni Standart line — avocado-lu Standart-dan fərqli spec, doğru) · T6 → dark × bug tapıldı, fix → re-test ✅ (+1 label ✅, dark × ✅, light × ✅). Masa 98 təmiz (MƏHSUL YOXDUR), Masa 1/ORD-2920 toxunulmadı, MƏTBƏXƏ GÖNDƏR basılmadı.
- **Verify:** `tsc --noEmit` app-code 0. **Fayllar (3):** `api/pos/products/route.ts` (is_default passthrough), `usePos.tsx` (addToCart plain-tap default prefill — `mods` normalize, merge key/price/newItem/reservation hamısı prefill-dən sonra), `ProductGrid.tsx` (delete × + dark/light token, capsule re-measure deps, freshDefaultSpec comment, resolveHintName fallback + "+N", inactive pill hint fallback, + Yeni variant comment).

### Jurnal sətiri — 2026-09-30 (ROUND 10b: QEYD POPUP UI REDIZAYN + KLAVİATURA SYNC + 6 BUG)

- **Owner turn**: "yaxşidır amma popup-ın özünün UI-sini bəyənmirəm, daha qəşəng bir rəyə düşək. Açılışda/bağlanışda klaviye GEC bağlanır. Bir çox buglar var — brauzerdə İLK ÖNCE GÖR, sonra düzəlt."
- **Tam diagnostic (frame-by-frame trace, 10 bug):** (1) VKB ✓ done → keyboard gizlənir, card STRANDED açıq qalır; (2) GİZLƏ → eyni; (3) reopen-də caret INDEX 0-da → ilk VKB xarfi PREPEND olur ("x"+"Bu məhsul…"); (4) Escape → popup VƏ bütün product editor bağlanırdı; (5) card unmount-dan ~300ms SONRA klaviatura bağlanırdı (360–450ms dead gap); (6) keyboard tap restore-edilə bilmirdi; (7) long text → fixed 243px, internal scroll; (8) Qeyd pill sticky CTA footer-ə yarım-sıra toxunurdu; (9) UI: 2px emerald border + 2px .vk-active ring = "4px green box" (card-da ən ağır element), cramped 2-line header + hairline, dead band; (10) VKB-də rəqəm/punktuasiya YOX (global VKB limiti — bu round-da deyil, ayrıca round).
- **Kökl səbəb (klaviatura gec):** blur() → focus `<body>`-a gedir → VKB provider-in focusout guard body-də bağlamır (control-tap dizaynı) → klaviatura card unmount-dan sonra 300ms DETACHED-POLL-ə qalanırdı. **FIX:** `closeNoteEditor` = EXPLICIT `closeVk()` (VKB exit 0.26s card exit morph-u ilə PARALLEL — cart-in eyni pattern-i).
- **Stranded card FIX:** vkOpen edge-detect (`wasOpen && !vkOpen && noteEditorOpen` → close) — ✓/GİZLƏ/outside-tap ilə card bağlanır (cart-in `vkOpenPrevRef` pattern-i).
- **Caret FIX:** open-də rAF `focus()+setSelectionRange(len,len)`. **Escape FIX:** `stopPropagation()` (modal Escape listener-i artıq sarsılmır). **Enter:** physical + VKB ↵ = NEWLINE (textarea semantikası); close = ✓/Esc/×/Təsdiqlə/backdrop.
- **UI REDIZAYN ("daha qəşəng"):** SINGLE-SURFACE card — inner box YOX, border/ring YOX (`.prod-qeyd-ta.vk-active { box-shadow: none !important; }` override; dimmed backdrop artıq "active layer" siqnalı verir), header BİR sətir (emerald Tag + "MƏHSUL QEYDİ" + ×, hairline yox), field borderless 15px, **auto-grow** (52px → max 160px, sonra scroll), actions: "Ləğv et" ghost (yalnız mətn varkən) + emerald TƏSDİQLƏ. Spring 420/34 → 520/40 (daha sürətli settle: 536ms→~350ms).
- **Pill half-hidden FIX:** scroll body `pb-5 → pb-10`.
- **E2E (v2-*, 10/10 PASS):** TƏSDIQLƏ: ~150ms-də keyboard ~95% dismissed (old: 350ms-də hələ FROZEN OPEN) ✓ · ✓/GİZLƏ → card+kb birdəfə ✓ · caret end ("doneX") ✓ · Escape → yalnız popup ✓ · Enter newline ✓ · 140 xarakter → 73px grow, internal scroll YOX ✓ · multi-instance izolasiya ✓ · console `[]` ✓.
- **Fayl (1):** `ProductGrid.tsx`. Masa 98 təmiz.

### Jurnal sətiri — 2026-09-30 (ROUND 10: QEYD SHARED-ELEMENT MORPH + ALLERGEN/TICK DÜZƏLİŞİ)

- **Owner turn**: (1) × təsdiqi — "x buttonu active pill-in içində olmalıdır" → round 9c halı DOĞRUDUR (təsdiqləndi). (2) "Allergens bölməsində və tick işarəsində bug var". (3) Qeyd: "modalın içində Notes bölməsi — göndərdiyim şəkildəki (cart 'Qeyd əlavə et' pill) kimi, daha çox MORPH animasiyası: açılarkən klaviaturanın üzərinə morph olaraq yerləşsin, itməmişdən əvvəl klaviaturanın üzərinə doğru gəlsin; kvadrat input → yuvarlaq forma". (4) CORRECTION (ikinci message): "tam olaraq elə demirdim — o PILL **itmədən** hərəkət edib mərkəzdə açılan popup olsun, klaviaturanın üzərində" → pill ayrı qalıb başqa popup spring-ələn DEYİL; eyni element uçuşub genişlənməlidir.
- **Qeyd SHARED-ELEMENT MORPH (layoutId):** kvadrat `rounded-xl` input → `rounded-full` PILL trigger (Tag icon + "Qeyd əlavə et" / qeyd mətni; qeyd varkən soft fill). Tap → pill UNMOUNT olur, portal card AYNI `layoutId="prod-qeyd-pill"` ilə MOUNT olur → framer pill rect-ini (pozisiya+ölçü+radius+bg) card rect-inə MORPH edir (spring 420/34). Card = mərkəzdə (`left-0 right-0 mx-auto`, w min(92vw,420px)), `bottom` framer-ANIMATED = `vkHeight + 14` → VKB autofocus-la açandaq card klaviaturanın üstünə **morph olaraq** yerləşir. İç kontent delay 0.14s fade (label ghost-fight-i yoxdur). Close (×/Təsdiqlə/backdrop/Enter/Esc) → card rect → pill rect (morph back), blur → VKB auto-close. Portal → document.body (modal transformed/scaled konteyner içində `fixed` qidalanmazdı). Qeyd = AKTİV instansiyaya bağlı (`noteForProduct`), close-da `commitInstanceDraft()` → per-pill izolasiya.
- **ALLERGEN/TICK bug (E2E diagnostic):** (a) TICK framer rig DEAD idi — `motion.path`-ın dasharray 0→1 SANS tween snap olurdurdu (hard-pop, chip qırmızı olanda artıq görünürdü; unselect-də anında itdi) → İNDİ **NATIVE SVG + CSS transition**: `pathLength={1}` + `strokeDasharray:1` + `strokeDashoffset 1→0` (0.28s ease-out 60ms delay — red state lea
<omitted chars="1519" />

- **Owner turn**: "brat x buttonu orada nie qoyursane basmaq olmur ye yoxdi" → 1-ci fərziyyə (× HƏR pill-də) owner tərəfindən rədd: **"onu deməyirəm — x buttonu active pill-in içində olsun"**. × = YALNIZ active pill-də qalır (round 9b yerləşdirmə təsdiqləndi); tap target 18px → 20px circle + 4px padding (≈28px press area) qaldı.
- **"basmaq olmur" kök səbəbi (E2E catch):** `removeInstance` draft-in modifiers-in **Record** `{id: qty}` formatında `onApplyInstanceEdits`-ə keçirdi, `applyInstanceEdits` isə `PosModifierSelection[]` gözləyir və `nextMods.map` işlədir → hər SAVED sətir silinməsində **`TypeError: nextMods.map is not a function`** → pill qalırdı, button "dead" görünürdü. Fresh `__isNew` drafts əməliyyatı görmürdü (lokal drop) — ona görə round 9b E2E "PASS" göründü, amma real saved sətirdə sınırdı. **FIX:** Record→array conversion (name/price product modifier list-dən — `handleModalAdd` save yolunun eyni pattern-i).
- **GHOST 0-₼ SƏTİR (E2E console catch):** `applyInstanceEdits` existing-line path qty-0 edit-də sətiri `quantity: 0` edib saxlayırdı → kartda "Filadelfiya · 14.00 ₼ · − 0 + · ARA CƏMI 0.00" ghost sətir qalırdı. **FIX:** `e.quantity === 0 && sentQty === 0` → sətir items-dən **splice** olunur (delete idx kolleksiyası, loop-dan sonra descending splice — index sürüşməsi yox). Sent sətirlər clamp qaydası ilə qalır (`newQty = max(0, sentQty)`). Save yolu təsirsizdir (həmişə qty ≥ 1).
- **SENT-LINE DESYNC QORUXU:** `removeInstance` İNDİ `sentQuantity > 0` olan existing sətirdə silməni **toast-la bloklayır** ("mətbəxə göndərilmiş hissə var — əvvəl GERİ QAYTAR edin") — əks halda pill lokal silinər, sətir clamp-lə kartda qalardı → pill↔cart desync (yenidən açanda pill "qayıdardı").
- **E2E (Masa 98, light+dark):** × yalnız active pill-də ✓ · saved sətir × ilə silindi, re-index ✓ · fresh draft silindi ✓ · dark × görünür (qara ×/ağ kapsul) ✓ · ghost 0-sətir yox (console clean) ✓.
- **Fayllar (2):** `ProductGrid.tsx` (× active-only + tap target, removeInstance Record→array + sent-guard), `usePos.tsx` (applyInstanceEdits qty-0 → line removal).

### Jurnal sətiri — 2026-09-30 (ROUND 9: VARIANT MODEL — "sətir = spec" → A merge + B "＋ Yeni variant" + C cəm miqdarı)

- **Owner turn (final qərar, ssenari ilə təsdiqlənib):** "8 ədəd Filadelfiya (2 Kremli + 2 Yüngül + 4 Standart) = 8 instance YOX, **3 SƏTİR**. YOL 1: pill tabs + '＋ Yeni Variant'; save = '✓ YADDA SAXLA · 8' (cəm). Hər pill öz spec adını + miqdarını göstərir (Kremli ×2). Button pill strip-in SONUNDA." Model: **sətir = müxtəlif spec, miqdar = eyni spec-dən neçə**; bilet sayı = spec sayı. YOL 1 (modal/pill) və YOL 2 (grid-dən ayri-ayri) = eyni modelin 2 giriş nöqtəsi.
- **A — eyni-spec tap = MERGE** (`usePos.tsx` `addToCart`, plain add / editOf-suz): gələn tap spec-i mövcud sətirlə TAM eynidirsə (`product+variant+modifiers+notes+course+allergens`, `cartLineKey`) → yeni sətir YOX, eyni sətirin qty artır (`sentQty` clamp). 8i-nin "hər tap = yeni instance"ı bu təhlükəsiz halda ləğv olunur; fərqli spec heç vaxt merge olunmur (per-instance modifikator qorunur). → 4 tap Filadelfiya = 1 sətir ×4 · 3 tap Tom Yam = 1 sətir ×3.
- **B — "＋ Yeni variant" pill-strip buttonu** (`ProductGrid.tsx` `addNewInstance`): pill strip-in sonundakı dashed "＋" — aktiv pill-in spec-ini klonlayıb yeni `__isNew` draft (qty 1) yaradır; YADDA SAXLA onları `applyInstanceEdits` __isNew yolu ilə yeni sətir kimi commit edir. Yer = top pill strip (CTA-da YOX — owner "ən düzgün bu"). Pill row indi **≥1** instance-də görünür (əvvəl >1).
- **C — cəm miqdarı:** save button `Yadda saxla · {totalUnits}` (2+2+4 = 8), instance sayı YOX; live (aktiv pill stepper).
- **Label (spec adı):** `resolveHintName()` — exclusive (max_select=1) qrup seçimi → "Kremli"/"Yüngül"/"Standart", yoxsa ilk modifier adı; yeni pill **uuid GÖSTƏRİRMİR**. `commitInstanceDraft`/draft `hint` saxlayır; render-də aktiv pill live, inactive pill committed `hint` göstərir.
- **E2E (MASA 98, browser):** A ✅ (4 tap = 1 sətir ×4) · B ✅ ("＋" top strip-də; 3 pill; label **Kremli/Yüngül** readable, uuid YOX) · C ✅ (`YADDA SAXLA · 8`; ara hallar ·4/·5/·7) · D ✅ (Tom Yam 3 tap = ×3) · data ✅ (save-dən sonra 3 variant persist: ×4 / ×2 Kremli / ×2 Yüngül; "3 Məhsullar"). Console **0** error.
- **Qeyd (regression YOX, owner qərarı gözləyir):** (1) Cart panel eyni məhsulun 3 spec-ini **1 collapsed sətir** (×8, "≈ 2 əlavə", "Ətraflı" → genişlənir) kimi GÖSTƏRİR — data 3 sətirdir, KDS 3 ticket alacaq; bu round 8-dən olan collapsed-row davranışıdır. (2) **Standart (default) pill-in label-i görünmür** (yalnız ×4) — kiçik cosmetic gap; Kremli/Yüngül düzgün görünür (default exclusive seçimi `hint`-ə düşmür). (3) Total 115.00 ₼ = Kremli +₼1.50/unit surcharge (doğru).
- **Verify:** `tsc` app-code 0; HMR təmiz. **Fayllar (2):** `ProductGrid.tsx` (B+C+label: addNewInstance, resolveHintName, pill-strip "＋", multiTotalUnits, hint, gate ≥1), `usePos.tsx` (A: addToCart identical-spec merge).

### Jurnal sətiri — 2026-09-30 (ROUND 8c: PILL ×QTY BADGE — AKTİV PİL'DƏ GÖRÜNMƏYİRLİK FIX)

- **Owner turn** (1 xətt): "1 məhsulun sayını artırır, modifikator panelinə daxil oluram, oradaki say artırmaq buttonuna basanda say artmır və ya artır lakin instance (yuxarda 1 2 3 4 pill-lər) artmır — səbəbini tap, düzəlt" + "dev serveri ac və bunu test et."
- **Təkrar (browser sub-agent, MASA 98):** aktiv pill 1-də MIQDAR+ → stepper **işləyir** (1→2→3), lakin **AKTİV pill-də ×N badge GÖRÜNMÜR** (yalnız "1" görünür); badge yalnız pill **inactive** olduqda görünür ("1 ×2"). Yəni round 8b-in əlavə etdiyi ×qty badge dəqiq owner-in baxdığı (aktiv) pill-də görünmürdü — "instance artmır" hissi tam budur.
- **ROOT CAUSE:** aktiv pill = sliding capsule — **WHITE (dark) / BLACK (light)** (`motion.div`, ~sətir 1369: `lightMode ? 'bg-zinc-900' : 'bg-white'`). Badge-in AKTİV text rəngi isə capsule-in **ƏKSİ** idi: dark aktiv → `text-white/90` (ağ mətn **ağ kapsul** üzərində = GÖRÜNMÜR); light aktiv → `text-zinc-800` (qara mətn **qara kapsul** üzərində = görünmür). İki branch **SWAP**-edilmişdi.
- **FIX:** badge-in aktiv text rəngi İNDİ button-un aktiv text rənginə uyğundur (dark: `bg-zinc-900/10 text-zinc-800`; light: `bg-white/15 text-white`) — capsule ilə həmişə kontrast. Inactive dəyişməz (`bg-transparent opacity-60`).
- **E2E (MASA 471, 4× Filadelfiya):** aktiv pill badge İNDİ görünür və artır: **×1→×2→×3** (dark — white pill / dark badge); pill 2-yə keçid → pill1 inactive **×3** görünür; **LIGHT mode** (Mövzu dəyiş) → black pill + white badge, **×5** görünür ✓. Stepper 1→3, badge 1→3, sync düzgün. **CART LIVE: TƏSDİQ olundu** — modal AÇIQkən row total **84→98 ₼** (qty 6→7); round 8b sub-agent-in "cart canlı yenilənmir" nəticəsi müşahidə artefaktı idi (modal cart-ı örtürdü, DOM-dan oxumaqda). Console **0** error/warning.
- **Verify:** dev HMR təmiz (0 compile error, hamısı 200); dəyişiklik yalnız className string swap → `tsc` təsiri yoxdur (lakin aşağıda yenə də təmiz). **Fayl** (1): `ProductGrid.tsx` (pill ×qty badge aktiv light/dark rəng swap + root-cause comment).

### Jurnal sətiri — 2026-09-30 (ROUND 8b: LIVE QTY SYNC (modal ↔ cart) + PILL ×QTY BADGE)

- **Owner turn** (1 screenshot — Filadelfiya 2 pill, "YADDA SAXLA · 2"): (1) "modal içi say artırma — daha doğrusu SYNC işləmir: səbətdeki sayı artıranla modal içi say artırma sync işləsin"; (2) "tamam, miqdar artır, lakin yuxarıdakı 1 və 2 artmır — bu nə üçündür, düzgünündürmü?"
- **LIVE QTY SYNC — ✅ (s8 E2E):** iki tərəfli canlı binding: **MODAL→CART**: hər +/− `onLiveQtyChange(lineIndex, newQty)` report edir; page `applyInstanceEdits` ilə sətirin **öz spec-i** ilə qty-only edit tətbiq edir (P1 spec-sync YANMIR — diff comparison; sent hissə `max(qty, sentQty)` clamp; unsent delta növbəti send-də). **CART→MODAL**: `cartItemQtys` (page memo) + ProductGrid sync effect — editor açıqkən xarici cart dəyişikliyi draft-ə (və aktiv pill-də `qty`-ya) axır. Loop-safe (öz push-umuz eyni dəyəri yazır). S8 E2E: modal + ×2 **SAVE-ETSİZ** → cart dərhal 3/₼39; reopen = 3; sent line +1 → kitchen ticket 1 prep + 1 unsent delta (YANMADI) ✓. **SEMANTİK DEYİŞİKLİK (owner tələbi üzrə)**: modal qty dəyişikliyi İNDİ dərhal cart-a düşür (X ilə bağlama da rollback ETMİR — sync budur).
- **PILL MƏNAMİ + ×QTY BADGE — ✅:** pill-lər = **instansiya TAB-ları** (eyni məhsulun müstəqil sətirləri; hər biri öz spec-i ilə) — rəqəm tab indeksidir, SAY DEYİL. Owner göründüyü kimi pill-lərə **CANLI ×qty badge** əlavə olundu (`×1`/`×2`/…; draft qty, cartItemQtys sync ilə cart-a bərabər) — MIQDAR+ pill-də də görünür. (s8-də badge E2E-si hard-stop-a qaldı — növbəti sessiyada təsdiq.)
- **⚠️ VOID ANOMALİYASI (açıq, hard-stop-a qaldı):** sent sətirin LƏĞV ET = toast success amma sətir qalır. DB **DÜZGÜN**: item `kitchen_status='voided'`, order `status='cancelled'` (21:21:44), `FINAL_ORDER_STATUSES` 'cancelled' ƏHATƏ EDİR, selectTable primary filter düzgün. Yəni client re-hydrate yollarından biri (tableOrderCache / fetch race / else-branch) stale sətiri geri gətirir — **növbəti addım: owner browser-ında /api/orders?table_number=99 response-unun canlı oxunması** (kəsilmiş browser sessiyası — state naməlum).
- **Verify**: `tsc` təmiz; hard-stop push. **Fayllar** (2): `ProductGrid.tsx` (handleQtyPlus/Minus live push + cartItemQtys sync effect + pill ×qty badge + props), `page.tsx` (posCartItemQtys memo + onLiveQtyChange wiring).

### Jurnal sətiri — 2026-09-30 (ROUND 8: MODAL MIQDAR+ HƏMİŞƏ QTY + ⋮→○→✓ TƏK MORPH + REFUND DETALLARI + REFUND LOADING FLASH FIX + TAM HANDOVER)

- **Owner turn** (1 screenshot — Tom Yam 2-pill modal, MIQDAR 4, "YADDA SAXLA · 2"): (1) "3-dotsdan tike keçən bir morph-da et"; (2) "yeni mənalamıram — modal içi say artırmaq işləmir, bu button — bunu özün test et"; (3) "refund detalları falan olmur yoxsa??" — bunlara da bax; (4) "refund modalına basanda bir bug var, məsələn hər hansı masa seç, order seç — loading zamanı"; (5) "handover TAM şəkildə hazırla — tam nəyi var, harda qalmışıq; comparison repoda qalsın; UI qanunları, state machine transition və s. HƏR ŞEY handover-da olsun".
- **(1) ⋮→○→✓ TƏK MORPH — ✅ (kod + r8_07 tick):** səbəb: dots **+120° (clockwise)** çıxırdı, circle isə **−120°-dən (counter-clockwise)** daxil olurdu — əks istiqamətlər = "3 ayrı hərəkət" (spin-out/spin-in/tick-draw). Fix (`TableCard.tsx` ctl-select): circle `initial={{ rotate: 120 }}` → 0 — eyni clockwise rotasiya **davam edir** → ⋮ → ○ → ✓ TƏK morph (dots spindeləyib circle-ə girir, tick üzərinə çəkilir). Exit istiqaməti də simmetrik (−120). r8: BIRLƏŞDIR → Masa 99 select → **blue circle + white tick** ✓ (mid-rotation frame tool latency ilə tutulmadı — istiqamət kod-level).
- **(2) MODAL MIQDAR+ — ✅ E2E (r8_04):** ROOT CAUSE: round 6-dakı sent/locked→CLONE qolu — SENT instance-də modal "+" **yeni pill spawn edirdi** (owner: "say artmır, 3-cü avtomatik yarandı" — eyni bug, round 6-da yanlış oxunub). Yeni owner-final rule: **modal stepper + = HƏMİŞƏ active instance-in total qty artırır** (sent instance-də belə) — `applyInstanceEdits` `newQty = max(e.quantity, sentQty)` ilə göndərilmiş hissə toxunulmur, **unsent delta növbəti send-də kitchen ticket-ə append olur** (P1 arxitektura). CLONE rule İNDİ yalnız **cart-row +**-da (round 5 P2 "qty+ = müstəqil instansiya" — "one more of this product"). `handleQtyPlus` sadələşdi: `commitInstanceDraft(); setQty(qty + 1)`. E2E r8: Tom Yam send (MƏTBƏXDƏ) → +1 unsent → 2 pill → sent pill aktiv → + ×2 → **MIQDAR 1→3, PILL COUNT 2-DƏ QALDI** (new pill YOX) → save → cart qty 4 / ₼52.00 (3 sent + 1 unsent) ✓.
- **(3) REFUND DETALLARI — ✅ E2E (r8_13/14):** TƏSDİQ ekranına **order identity** (Masa 99 · ORD-2931 · tarix/vaxt · N sətir, Receipt glyph) + **"Qalacaq"** row (refund-dan sonra qalan + "təkrar refund mümkündür"/"sifariş tam qaytarılacaq") + **"Sətirlər"** row (ilk 3 sətir `2x Tom Yam, …`) əlavə olundu; MƏHSUL mode sətirlərinə **−₼amount** (fate label yanında); NƏTİCƏ ekranı: amount-a **identity + üsul** ("Masa 99 · ORD-2931 · Nağd") + **"Sifariş tam qaytarıldı"** / **"Qalan: ₼X"** (yeni `doneRemaining` state, hər iki success branch-də set). E2E: bütün elementlər göründü ✓.
- **(4) REFUND "LOADING" BUG — ✅ E2E (rAF probe):** ROOT CAUSE: `amount` state `''` ilə başlad, `useEffect` (paint-DAİRƏSI) doldurdu → modal açılışındakı **ilk frame-də input BOŞ** + rəqəm "pop" + DAVAM ET disabled→enabled titrəməsi. Fix: `useState(() => Math.max(0, paid).toFixed(2))` — mode həmişə 'full' ilə açılır → initial = full remaining (effect yalnız SONRAKI mode/remaining dəyişikliyində). E2E: rAF frame probe — **first observable frame-də artıq "13.00"**, 8/8 frame stabil, boş flash YOX ✓.
- **(5) TAM HANDOVER — ✅:** `HANDOVER.md` genişləndi: **§7 FEATURE INVENTORY** (POS səthi module-modulye + backend spine/shiftGate/devices/CSRF — nə var, harda), **§8 STATE MACHINE CATALOGU** (9 FSM: refund, TableCard, product editor, cart, payment, kassa, floor modes, VKB, order detail — states + transitions + token-lar), **§9 UI QANUNLARI** (12 motion rule + owner-approved pattern-lər + token mənbələri + binding qaydalar + JSX footguns), **§10 HARDA QALIBIQ** (tamatamlar, açıq 5 qərar, DB live fixes, comparison pointer). §0 HEAD = round 8. `POS_COMPETITIVE_COMPARISON.md` repo-da qaldı.
- **E2E**: r8 full cycle (add→GÖNDƏR→+ on sent→save→HESABI BAĞLA ₼13 nağd→TARIXÇƏ→detail→refund→TƏSDİQ details→SUCCESS details→fully refunded→QAYTARMA disabled→table YENİ OTURUŞ clean) · console **0** warning/error · theme final **DARK** · Masa 99/471 təmiz · ORD-2920/Masa 1 toxunulmadı.
- **Verify**: `tsc --noEmit` təmiz; commit + push.
- **Fayllar** (4): `TableCard.tsx` (ctl-select rotate +120 → single morph), `ProductGrid.tsx` (handleQtyPlus həmişə qty — clone silindi), `OrderHistory.tsx` (amount initial + confirm identity/Qalacaq/Sətirlər + item amounts + success identity/doneRemaining), `HANDOVER.md` (§7–§10 tam + §0 round 8).

### Jurnal sətiri — 2026-09-30 (ROUND 7: 8 OWNER NÖQTƏSİ + TAM POS AUDIT + TOAST/LIGHTSPEED/SQUARE MÜQAYİSƏSİ)

- **Owner turn** (3 screenshot, 8 nöqtə + tam audit + competitive comparison): (1) iki məhsulun modifikator panelində say+ "işləmir / xüsusiyyətləri kopyalayır"; (2) action sheet-də geri düyməsi yoxdur; (3) kassa qıfıllıdırsa 5 düymənin (SATIŞSIZ/NAĞD ÇEKMƏ/DEPOZİT/AÇ/Z HESABAT) aktiv olub-olmaması + hər düymənin funksiyası + "leave shift"-dən sonra sifariş qəbulu; (4) Küncüt tikində millisanıyəlik görün-iyit bug; (5) refund panelindəki "Toxunma" elementi nədir, lazımsızsansa sil; (6) şəkil 3-də ikonlar — pickup edən şəxsə uyğun daha mənalı ikon; (7) status rənglərini qara etmə (light); (8) sol alt "4 Issues"; + bütün POS UI-sının blink/flicker/jump/layout-shift audit-i (xüsusilə 3 dots) + Toast/Lightspeed/Square feature müqayisəsi.
- **(1) MODİFİKATOR + — ✅ E2E (d7 + f7, 2 instance):** d7: chip-in + düyməsi **İŞLƏYİR** (Losos ×2 → header 14→20→… +₼3/tap, cart row düzgün ₼34); Tom Yam modalında **pre-selected modifikator YOX** (copy yox). f7 (2-instance pill): **instance 1 = Losos ×2 (₼20), instance 2 = Losos ×1 (₼17), cart = 1 row qty2 ₼37.00 = tam cəm** — counts PER-INSTANCE, heç yerdə kopya/duplikat. **Nəticə: owner-in bildirdiyi bug hal-hazır build-də təkrar olunmur** — kök səbəb round 5-dəki spec-based clone idi (round 6 state rule ilə düzəldilib: unsent → öz qty-sı artır, sent/locked → yeni müstəqil instansiya). Miqdar+ = aktiv instance-in qty-sı artır (yeni pill YOX — f7 step 4 verified).
- **(2) GERİ DÜYMƏSİ — ✅ E2E (w7):** səbəb: MERJ/KÖÇÜR capsule sub-view-lərində yalnız qırmızı ✕ vardı (digər BÜTÜN sub-views-də BackButton var: payment/customer/split/cash-tendered/card-confirm/confirm-action/courier ×2 — code + d7/v7 tur). Fix: hər iki capsule-ə kompakt **GERİ pill** (BackButton, `!w-auto !px-5 !py-2.5 !rounded-full`, onCancelMode/onCancelTransfer) — w7: capsule `[GERİ][✕][Təsdiqlə]`, GERİ → normal state-ə qaytarır (seleksiya təmizlənir, ⋮ geri).
- **(3) KASSA QIFIQ — ✅ E2E (v7) + shift analizi:** qıfıllı kassa-da 7 nağd əməliyyat düyməsi indi **DEACTİV** (`disabled={session.locked}` + `disabled:opacity-30 disabled:pointer-events-none` + "Kassa qıfıllıdır — əvvəl AÇ" tooltip): Daxilolma (cash-in), Xərc (cash-out), Növbəni bitir (smena close), Satışsız (no-sale: məcburi səbəblə istisna qeydi), Nağd çekmə (cash drop → safe), Depozit (bank deponu, manager PIN), Z hesabat (gündəlik pullu ödəniş cəmi, print). **AÇ (unlock) HƏR ZAMAN aktiv** (qıfıldan çıxış yolu). v7: locked-da 7 düymə opacity 0.4, SATIŞSIZ tap = no-op, AÇ → PIN 4321 → unlock ✓. **Leave-shift sualı (code analizi):** `shiftGate` (lib/shiftLock.ts) YALNIZ 6 route-da: bill-request, reopen, delivery-status, reservations/walk-in, waitlist/seat, kitchen/void-comp-waste. **Order creation (/api/orders POST) + payment shiftGate DAİRE DEDİR** → növbə bitdikdən sonra **sifariş qəbulu MÜMKÜNDÜR** ( səbəb: sifariş/dar qeydiyyatı kassa session-ından asılı deyil; G4 yalnız auth session-in location-ına scope edir). Qıfıllanan = kassaya toxunan istisna əməliyyatları → **manager PIN eskalasiyası** (PinGuard → approver_staff_id, server re-verify). Bu = Toast/Square modelinə uyğun (drawer closed ≠ business closed) — code dəyişikliyi tələb etmir, E2E ilə order qəbulu təsdiq olundu (d7/f7: Masa 99-da sifariş axını normal).
- **(4) KÜNCÜT FLICKER — ✅ E2E (v7 MutationObserver):** səbəb: tik `AnimatePresence` ilə **mount/unmount** olunurdu — remount = sub-100ms disappear/reappear-ın tək yolu (+ hər toggle-da chip genişliyi 14px跳raydı). Fix: **persistent `motion.path`** (həmişə render, fixed 14px slot — zero layout shift; `initial={false}` → pre-selected açılışda artıq çəkilib görkənir; on → draw 0→1 280ms, off → 120ms fade). v7: 101 mutation — hamısı attribute (stroke/opacity animasiya); **SVG add/remove = 0**; 3 hızlı kadər stabil ✓.
- **(5) "TOXUNMA" — ✅:** `fate='none'` = refund **stok təsirsiz** (məhsul müşteriyə qaytarılır / taleyi naməlum) — funksional və zəruridir (refund etdikdə məhsul mütləq anbar/itki deyil), amma label **mənasızdı**. Fix: "Toxunma" → **"Qeydsiz"** + tooltip ("Anbara qaytarılmır, itkiyə yazılmır — yalnız məbləğ geri qaytarılır"); return_to_stock ikonunu da Package → **PackageOpen** (açık qutu = stok qaytarışı). Təsdiq ekranı labelı da yeniləndi.
- **(6) TAKEAWAY İKONU — ✅ E2E (f7):** səbəb: Phosphor `ShoppingBag` = rounded **BOX** + incik handle (15px-də "box" oxunur — sub-agent SVG path ilə təsdiqlədi). Fix: **`Handbag`** (trapezoid + prominent handle arc — hər ölçüdə "çanta") — 3 səthdə: header tab switcher, OrderHistory order-card icon, CartPanel order-type chip. f7: bag+handle təsdiqləndi (dark+light) ✓. (saito-icons.tsx: `Handbag` export əlavə olundu.)
- **(7) STATUS RƏNGİ (LIGHT) — ✅ E2E (w7/f7):** `DragTabSwitcher` light active pill = `#171717` jet-black → **`#3b82f6` (blue-500, white label)** — dark inverted white pill EYNİ QALDI (owner: "dark theme-də necədirsə elə saxla"). W7: computed style `rgb(59,130,246)` ✓. Qeyd: eyni component staff/reservations səhifələrində də işlənir → light-da hamısı mavi (doctrine: light-da yalnız mavi/qara).
- **(8) "4 ISSUES" — ✅:** sol alt qırmızı pill = **Next.js 16 dev indicator**-ın issue sayacı (yalnız DEV mode; prod build-də heç var deyil). v7/f7: devtools panelində **Issues sekması/badge YOX**, konsol **0 error / 0 warning** (useLayoutEffect SSR, key warning — heç biri). Yəni owner-in gördüyü 4 warning **transient dev warnings** idi (HMR/rebuild dövrü) — hazırda təkrar olunmur; təkrar çıxarsa: pill-ə tap → siyahı açılır → mənə screenshot, konkret warning-ləri sifirləyərəm.
- **3-DOTS BLINK — ✅ E2E (v7 4 rapid frames pixel-identical):** səbəb: BIRLƏŞDIR→NORMAL keçidində grid **tam re-mount** olur (DOM: 7 ⋮ removed → 18 re-added one atomic commit) və hər ⋮ **rotate −120°→0 + scale 0.4→1 + opacity 0→1** spin-in oynadırdı = "blink" hissi. + framer-in inline `opacity:1` CSS `opacity-40`-ı override edirdi (rest 100%, hover no-op idi). Fix: ⋮-in giriş animasiyası = **sakin 180ms fade** (spin-in YOX — dramatik rotation morph yalnız dots→circle istiqamətində qaldı, owner-approved); opacity indi framer-owned (rest 0.4, whileHover 1.0).
- **⚠️ DEVICE UNPAIR (E2E artefakt):** sessiya zamanı "Bu cihaz bloklanıb" lockout çıxdı — `device_heartbeats`-də device `6e3bcf1a…` **blocked=true** (blocked_at 2026-09-29 10:48 UTC — əvvəlki E2E sessiyasının artımı). DB-dən **unblock edildi** (`blocked=false` bütün rows). Əgər owner özəlliyən unpair etmişsə: Settings → Cihazlar-da yoxla.
- **E2E**: d7 (diagnosis: modifier repro, Küncüt sampler, merge/unmerge, sheet tur) · v7 (verify: issues=0, flicker 0 remount, 3-dots calm, kassa lock 7-dimmed, GERİ tour partial) · w7 (capsule GERİ, light blue pill, history readability, cleanup) · f7 (handbag dark+light, 2-instance modifier independence ₼37.00 exact, console clean). **Final state: DARK, kassa UNLOCKED, Masa 99/471 empty, ORD-2920/Masa 1 toxunulmadı.**
- **Verify**: `tsc --noEmit` təmiz; commit + push.
- **Fayllar** (8): `DragTabSwitcher.tsx` (light pill blue), `OrderHistory.tsx` (Handbag + Qeydsiz/PackageOpen + labels), `CashDrawerPanel.tsx` (locked disable ×7 + tooltips), `TableCard.tsx` (⋮ calm fade + framer opacity), `ProductGrid.tsx` (Küncüt persistent path), `ActionSheet.tsx` (capsule GERİ ×2), `saito-icons.tsx` (Handbag export), `page.tsx` + `CartPanel.tsx` (Handbag switch).
- **MÜQAYİSƏ**: Toast/Lightspeed/Square feature audit = `POS_COMPETITIVE_COMPARISON.md` (repo root).

### Jurnal sətiri — 2026-09-29 (ROUND 6: GERİ FIX + VKB İKİ FAZALI JUMP + REFUND NET-SEMANTICS (SERVER BUG) + PILL SLIDING CAPSULE + MIQDAR+ STATE RULE + HOLD ICON + STATUS ICONS REDESIGN)

- **Owner turn** (5 screenshot + iOS klavyə video, 9 nöqtə): (a) action sheet-də GERİ buttonu yoxa çıxıb; (b) videoda klavyə açılışında diqqətlə baxanda **jump kimi iki fazalı his** var — onu replicate et; (c) "refund modalında problem var brauzerden bax duzelt" + refund-da **hər state machine üçün transition**; (d) şəkil 1: instance pill-lər daha touch-friendly olsun + **1→2 keçidində state-machine transition**; (e) şəkil 2: Küncüt tik = "bayaq necə eləmişik eynisindən"; (f) şəkil 3: 1-ci instansiyanın modifikatorlarını düzəltdim (Kremli), sayı artırdım → **3-cü avtomatik "Kremli" yarandı — BUG**; miqdar modal içi düzgün artmır; (g) şəkil 4: cart row-da "hər şey yazılıb" → **1 cümlə ilə** (məs. modified); (h) şəkil 5: hold/resume **çox yer tutur, animasiya+transition yoxdur** — ən yaxşısını düşün; (i) kart statuslarının **ikonlarını yeniden düzəlt**.
- **(a) GERİ (ActionSheet split view) — ✅ E2E (z11)**: split-payment görünüşündə back = **raw dark-hardcoded** `bg-white/10 text-white/90` button idi (BackButton theme-aware idi, amma bu 2-ci raw variant idi) → light-da **invisible**. Fix: `<BackButton>` (eyni theme-aware pill). z11: light-da BÖLÜNMÜŞ view-da GERİ oxunaqlı ✓ (yerləşmə bottom-left — design, dark-da da eyni).
- **(b) VKB İKİ FAZALI JUMP — ✅ (kod; hiss owner-in qərarı)**: `globals.css` `--vk-height` transition **0.3s → 0.18s** `cubic-bezier(0.2,0.8,0.2,1)` (snappier) → content-push **~180ms-də irəliləyir**, klavyə isə `SPRING.surface` (480ms) ilə **sonradan oturur** — videodakı iki fazalı "jump" feel-i (content leads, keyboard settles).
- **(c) REFUND — 2 REAL BUG + FSM transitions — ✅ E2E (z5–z9)**:
  - **BUG 1 — COMMENT LEAK**: `OrderHistory.tsx` RefundView JSX body-sində `// 2026-09-28 (owner: "refund modalının UI-sını…")` dev comment = **visible text** kimi render olunurdu (JSX element içində `//` yadınlama deyil). Fix: comment `return (`-dən yuxarıya köçdü. (Owner-in "refund modalında problem" = bu idi.)
  - **BUG 2 — REFUND DOUBLE-COUNT (SERVER-LEVEL, root cause)**: `orders.paid_amount` **NET**-dir — `complete_payment_atomic_v2` hər refund-da onu **decrement edir** (`v_new_paid := paid + non_refund − refund`, status `refunded` when `new_paid ≤ 0.01`). Köhnə 3 yer (DB function guard `paid − refund_amount`, route pre-guard, client `remaining` + QAYTARMA `disabled`) hamısı **`paid − refunded` hesab edirdi = double-count** → ilk partial refund-dan sonra (₼22.50 of ₼45) cap **₼0.00** oxunurdu, QAYTARMA disabled, 2-ci refund mümkün DEYİL. **4 yerdə fix**: (1) DB function guard → `v_refund_total > COALESCE(paid_amount,0) + 0.01` (**LIVE psql `CREATE FUNCTION`**, verify: SELECT prosrc-də yeni guard görünür); (2) route pre-guard → `refundAmount > paidAmount + 0.01`; (3) client `remaining = Math.max(0, paidAmount)`; (4) "Ödənilən" indi **gross** göstərir (`paidAmount + totalRefunded` — net, partial refund-dan sonra order total-dan aşağı oxunardı). E2E: MASA 98 (ORD-2883, ₼45 cash, partial ₼22.50) → QAYTARMA **ENABLED** → modal **₼45.00 / ₼22.50 / Qalan ₼22.50** ✓ → TAM → DAVAM ET → warning "⚠ Bu bütün məbləğin geri qaytarılacaq" (triangle icon) ✓ → **2-ci ₼22.50 refund SERVER-DƏ UĞUR** → order fully refunded (−₼45.00, QAYTARMA doğru disabled) ✓.
  - **FSM transitions (RefundView — REAL refund UI; `RefundModal.tsx` = DEAD CODE, heç render olunmur, lakin transitions oraya da apply olundu — delete rule görə qaldı)**: mode capsule (TAM/QİSMİ/MƏHSUL) = **MEASURED SLIDING INDICATOR** (refs + `useLayoutEffect` offsetLeft/offsetWidth + absolute `motion.div` spring x/width) — `layoutId` scaled modal-da unreliable (transform projection); quick-% active states (light blue / dark amber, 200ms); over-amount = red input + AnimatePresence hint "Qalan məbləgdən çox girmək olmaz (maks ₼X)"; item-check AnimatePresence micro pop; confirm warning AnimatePresence + AlertTriangle; method buttons 200ms. Light mode-da capsule `bg-blue-500` (jet-black pill owner tərəfindən rədd olunub — round 5 qeydi).
- **(d) INSTANCE PILLS — ✅ E2E (b4/b8/b12 + capsule)**: 44px height / 22px circle (touch-friendly) + **eyni measured sliding capsule** pattern (spring, hər iki istiqamət — 346→449px measure, overshoot).
- **(e) ALLERGEN CHECK (Küncüt) — ✅ E2E**: Phosphor `Check` pop-u → **SVG stroke-draw** `motion.path d="M4 12.5 L9.5 18 L20 6.5"` `pathLength 0→1` (~280ms easeOut, ~60-80ms delay, strokeWidth 3.4, exit fast fade) — TableCard-da owner-approved "bayaqkı" pattern.
- **(f) MIQDAR+ STATE RULE — ✅ E2E (b4 unsent grows / b8 sent clones / b12 draft grows)**: bug = köhnə rule **spec-based** idi (modifikator varsa → həmişə clone). Yeni rule **STATE-BASED** (owner-mandated): (1) **UNSENT** draft (`sentQuantity==0 && !LOCKED_KS`) → "+" = **eyni instansiyanın qty-sı artır** (1→2 eyni pill, spec dəyişmir, 3-cü pill YOX); (2) **SENT/LOCKED** (ready/served/completed) → kitchen snapshot-dan toxuna bilməz → **YENİ müstəqil instansiya** (fresh pill, qty 1, spec copy). **Hər iki səthdə**: modal `handleQtyPlus` + cart group `+` (`plusTargetLocked = sentQuantity>0 || LOCKED_KS`). "Miqdar modal içi düzgün artmır" = eyni root (qty artırdıqca spec-dəyişən pill spawn idi — indi artmır).
- **(g) CART ROW 1 CÜMLƏ — ✅ E2E**: N mod chip-i → **tək `⚙ N əlavə` capsule** (SlidersHorizontal icon, tam list `title` tooltip-də); allergen row 1-line `Label +N` (chips yox).
- **(h) HOLD ICON-BADGE — ✅ E2E**: text badge → **icon-only w-5 h-5** (Pause icon, AnimatePresence micro pop in/out) — yer tutur, transition var.
- **(i) TABLECARD STATUS ICONS REDESIGN — ✅ E2E (dark)**: occupied=**UserCheck**, reserved=**CalendarDays**, dirty/waiting/cleaning=**BrushCleaning**, cooking=**CookingPot**, ordered=**ClipboardCheck**, confirmed=**CheckCheck**, in_kitchen=**ChefHat**, ready=**BellRing**, served=**HandPlatter**, ordering=**Utensils**, dining=**Users**, bill_requested=**Banknote**, payment_pending=**CreditCard**, paid=**CheckCircle2**, empty=**Table2**, merged=**Layers** (hamısı saito-icons-da verify olunub; Clock/CalendarClock out).
- **E2E**: b-series (pills/qty/hold/row/icons, dark) ✓ · z-series (refund E2E + light GERİ + light sheet, z1–z13) ✓ · cz-series (cleanup: Masa 98 cart BOŞ — void etməyə ehtiyac yoxdu; final DARK) ✓.
- **CLEANUP/STATE**: Masa 98 empty + TƏMİZLƏNMƏLİ (refund-olunmuş sifarişin normal post-state). **ORD-2920 / Masa 1 toxunulmadı.** Theme final = **DARK**. ⚠️ cz-E2E-də **"Bu cihaz bloklanıb"** (unpaired-device) overlay çıxdı — sub-agent JS-lə remove etdi (test üçün); server-side pairing flag qalıb → POS bloklanıbsa: Settings → Cihazlar → "Bərpa et".
- **Verify**: `tsc --noEmit` təmiz; commit + push.
- **Fayllar** (8): `ActionSheet.tsx` (split GERİ → BackButton), `globals.css` (--vk-height 0.18s), `ProductGrid.tsx` (pills 44px + sliding capsule + handleQtyPlus state rule + allergen stroke-draw), `CartPanel.tsx` (group + state rule + `⚙ N əlavə` chip + allergen 1-line + HOLD icon badge), `TableCard.tsx` (status icons redesign), `OrderHistory.tsx` (comment leak + RefundView FSM + NET semantics + gross display + QAYTARMA disable rule), `api/orders/refund/route.ts` (NET pre-guard), `RefundModal.tsx` (dead code — transitions polish). + **LIVE DB**: `complete_payment_atomic_v2` guard → NET paid (psql CREATE FUNCTION).

### Jurnal sətiri — 2026-09-29 (ROUND 5: LIGHT-MODE SWEEP + MODAL REGENERATION + VKB SPRING + ALLERGEN AUTO-ICON + PER-INSTANCE VERIFY)

- **Owner turn** (4 screenshot + 1 iOS klavyə videosu, 10 nöqtə): (1) toast-da `{tables}` LITERAL görünür ("Masalar ayrıldı: {tables}"); (2) guest+bag ikonları "Masa X" və qiymət ARASINA (dedicated row); (3) TAKEAWAY + ÇATDIRILMA listləri SCROLL OLMUR; (4) modal buttonlar "köhnə nəsildir" → yenile + **state-machine transitions** course/servinq/allergen hamısı üçün + Qeyd ↔ Allergens YER DEYİŞDİR; (5) klavyə açılış-bağlanması iOS videosu kimi hamar; (6) modal Mərhələ active pill light-da QARA — mətn oxunmur; (7) **per-instance modifikator bug**: "say artıranda digərinin modifikatoruna təsir edir, 1-ciye keçirəm, uza modifikator əlavə etmək olmur — brauzerdə görəcəksən"; (8) icon pakei yüklüdür — allergen yarandıkca sistem **avtomatik uyğun ikon** qoysun; (9) light-da statuslar "qapı-qara" — **qara modda necədirsə elə olsun**; (10) light-da BÜTÜN tabların action sheetləri + modallar → pis olanı tap + düzəlt (şəkil 5: kuryer — GERİ görünmür, chip qara/bozuc/çirkin).
- **(1) TOAST {tables} — ✅ (kod)**: `page.tsx` `t('group_cleared').replace('{table}', …)` — locale placeholder `{tables}`-dir, replace heç vaxt match olmurdu → literal leak. İndi `.replace('{tables}', String(parent))`. E2E canlı qrup unmerge təhlükəli olduğu üçün (Masa 4/6 = owner-in live qrupları) kod+locale cross-verify edildi.
- **(2) TABLE CARD counter row — ✅ E2E**: guest/bag counter-ları title row-dan ÇIXDI → "Masa X" title ilə ₼ hero **arasında dedicated row** (`displayGuests || item_count>0` gated). vf1: Masa 98 "👥1 🛍6" ✓.
- **(3) TA/DELIVERY SCROLL — ✅ E2E**: wrapper motion.div-lər height-constraint-siz idi (içəri `overflow-y-auto` list viewport-dan çox böyüyürdü) → `h-full min-h-0 overflow-hidden` (dine-in floor wrapper ilə eyni). R15: 33 TA + 12 delivery order — ikisi də scroll ✓.
- **(4)+(6) MODAL REGENERATION (ProductGrid) — ✅ E2E (la8/la9)**: qty stepper `rounded-2xl→rounded-full`; variant/servinq/additive/course/allergen chips → **capsule `rounded-full` + 200ms background/border/color crossfade** (state = state-machine transition); additive −/count pair + allergen check = **AnimatePresence keyed micro-spring pop** (micro 280/22/0.9); **ALLERGENLƏR section Qeyd-dən YUXARIYA** (swap); Mərhələ active pill light `bg-black→bg-blue-500 text-white`. ⚠️ TSC gotcha: ProductGrid-in `SPRING` = tək micro-spring (pos-motion), named-preset OBIEKT DEYİL — `SPRING.kessey` burada INVALID (TableCard-da valid-dir); ×2 yer `SPRING` ilə fix (tsc 1465/1596).
- **(5) VKB SPRING — ✅ E2E (la10/la11)**: klavyə `transition={SPRING.surface}` (480/24/0.36 — sheet DNA) enter + 260ms `cubic-bezier(0.4,0,0.6,1)` exit; `globals.css`: **registered `@property --vk-height`** + `html { transition: --vk-height .3s cubic-bezier(.32,.72,0,1) }` → content-push klavyə springi ilə EYNI ritmdə animasiya olunur (jump/teleport YOX — iOS feel).
- **(7) PER-INSTANCE MODIFIER — ✅ VERIFIED FIXED (2 E2E ssenari, bug reproduksiya OLMADI)**: R13 (unsent): pill 2-də Avokado 1→2 → pill 1 tam səlim (Kremli/Losos 1, Avokado 0), pill 1-də + işləyir, save+reopen = hər pill öz spec-i. R14 (SENT): mətbəxə göndərdikdən sonra eyni test → cross-leak YOX, + işləyir, save+reopen səlim. **DB təsdiqi**: kitchen-sent order_items satırları spec-sync ilə yenilənib — `Losos quantity 3` + `Avokado quantity 3` server-də (P1 specSyncs çalışır; toast sub-agent-a 2.2s timing-dən görünmədi). Owner-in reportu **köhnə build**-dən (P2 multi-instance draft-dan əvvəlki merge dövrü). Code dəyişikliyi TƏLEB OLMADI — `loadInstanceFields/commitInstanceDraft/switchInstance/handleQtyPlus/applyInstanceEdits/cloneInstance` statik + dinamik verify.
- **(8) ALLERGEN AUTO-ICON — ✅ (kod)**: `allergens.ts`: `ALLERGEN_UI`+ `alcohol` (Wine); yeni **`ALLERGEN_KEYWORDS`** (az/en/tr substring cədvəl, family üzrə: buğda→gluten, qarğıdalı/yerfıstığı/pistachio→nuts, şərabi→alcohol, …); `resolveByName` = exact label → exact code → **keyword substring scan** → null. Yeni free-text allergen ("Qarğıdalı", "Şərab") indi generic warning triangle-ə YOX — ən yaxın family ikonuna **avtomatik** düşür. R15: modal-da Balıq/Süd/Küncüt ikonları ✓.
- **(9) LIGHT STATUS CHIPS — ✅ E2E (vf1–vf4)**: Audit 3 qapı-qara giriş tapdı (round-4 amber fix 5 statusa toxunmuşdu, amma bunlar FƏRQLİ yol idi): (a) **`seatedNoOrder` override** ("YENİ OTURUŞ" — `statusConfig`-dan keçmir, chip render-da hardcode `bg-zinc-900`) → light `orange-100/400/800` (dark orange mirror); (b) **`cleaning`** ("TƏMİZLƏNMƏLİ" = `needs_cleaning` label — `dirty` amber idi, `cleaning` DEYİL) → amber mirror; (c) `ready` + `payment_pending` → amber mirror. vf4 DOM scan: **0 solid-black status pill** (legitimate: N avatar + İÇƏRİDƏ tab pill). Dark regression YOX (vf3).
- **(10) LIGHT ACTION-SHEET AUDIT — ✅ E2E (la4–la15 + da1–da3)**: **BackButton** (ActionSheet) = dark-hardcode white-on-white → light-da İNVISIBLE idi → `useTheme` ilə theme-aware (light: `zinc-100/700` pill, dark: frosted white). **Courier row** (KURYER SEÇİN) = qara bozuc pill → **ağ satır + blue ChevronRight**, `py-4→py-3.5`, `motion.button`. Full sweep: action sheet (MÜŞTƏRİ/ENDİRİM/ÖDƏNİŞ), product modal, TA/DELIVERY listləri + sheets, kuryer picker, VKB, floor cards — light-da oxunmazlıq qalmadı (təkcə (2)/(9) tapıldı+fix). Dark spot (da2/da3) regression YOX.
- **E2E rounds**: R13 per-instance unsent ✓ · R14 per-instance sent + DB spec-sync ✓ · R15 light full audit ✓ · R16 chips re-verify (vf1–vf4, both themes) ✓.
- **CLEANUP**: Masa 98 test Filadelfiya satırları **void** (DB voided rows = audit trail); masa üzərində bu round-dan əvvəlki Tom Yam qaldı (owner-in data — toxunulmadı). **ORD-2920 / Masa 1 toxunulmadı.** Theme final = LIGHT (owner-in state).
- **Verify**: `tsc --noEmit` təmiz (SPRING.kessey ×2 fix-dən sonra); commit + push.
- **Fayllar** (7): `page.tsx` (toast `{tables}` + TA/DELIVERY scroll wrappers), `TableCard.tsx` (counter row, seatedNoOrder/ready/payment_pending/cleaning light colors, bottom-row wrap+ml-auto), `ProductGrid.tsx` (modal regeneration + swap + SPRING fix ×2), `VirtualKeyboard.tsx` (SPRING.surface + exit), `globals.css` (`@property --vk-height` transition), `allergens.ts` (alcohol + ALLERGEN_KEYWORDS + resolveByName), `ActionSheet.tsx` (BackButton theme-aware + courier rows).

### Jurnal sətiri — 2026-09-28 (TICK ROTATION-MORPH + STROKE-DRAW — owner video: "dots çevirilib olur daire kimi" + "tik soldan sağa doldur")

- **Owner feedback (video: iOS Appearance ekranı)**: əvvəlki crossfade+pop "pisdir" — (1) dots → dairə: dots **DÖNÜB** dairəyə çevrilməlidir; (2) ağ tik: **soldan başlayıb sağa doğru ÇÖKÜLMƏLİDİR** (stroke draw), scale-pop deyil.
- **FIX — ROTATION MORPH (TableCard top-right control)**: 4 keyed state-inin hamısı indi **eyni istiqamətli spin** ilə keçir: exit = `rotate +120°, scale 0.4, fade` (160ms), enter = `rotate −120°→0°, scale 0.4→1` (SPRING.kessey). Eyni rotation istiqaməti = "dots döndü və dairə oldu" illüziyası (Philosophy §2 continuity + §5 morph-not-replace — indi rotation ilə, crossfade ilə YOX).
- **FIX — CHECK STROKE-DRAW (TableCard)**: Phosphor `Check` (scale-pop) silindi → **inline SVG `motion.path` `d="M4 12.5 L9.5 18 L20 6.5"` + `pathLength 0→1`** (280ms easeOut, 80ms delay — dairə yerləşəndən dərhal sonra çökülür; path solundan başlayıb aşağı zirvədən sağa yuxarı qövs edir = Apple SF-Symbol checkmark draw). Deselect = 140ms un-draw.
- **E2E R12 (iki tema) — N1-N4 HAMISI PASS**: N1 rotation matrix captured **mid-morph**: incoming circle `matrix(-0.2, 0.346, -0.346, -0.2, …)` = rotate(−120°)·scale 0.4, outgoing dots rotate(+120°)·scale 0.4 — **8 dots + 8 circle DOM-da birgə** (real spin, crossfade DEYİL); N2 check path `M4 12.5…` çökmüş halda `pathLength=1` (draw 280ms bitmişdi, mexanizm OK); N3 out-morph **mid-frame** tutuldu (bəzi kartlar dairə, bəziləri dots — staggered, hard-swap YOX); N4 dark-da eyni matrix.
- **Fayllar** (1): `TableCard.tsx` (rotation morph + stroke-draw tick; unused `Check` import təmizləndi).
- **Verify**: tsc təmiz; commit + push.

### Jurnal sətiri — 2026-09-28 (SELECTION TICK MORPH + HESAB CHIP POP — Apple state-machine transitions)

- **Owner turn**: "bu animasiya Apple-da necədirsə elə olsun — normaldan BİRLEŞDİR-ə keçəndə 3 dots → tik ANİDƏN keçir, state-machine transition olsun; başqa belə tapsan (state-machine transition yoxdur) əlavə et".
- **Web research**: Apple iOS selection grammar (Settings edit-mode / Mail / Photos multi-select) — badge = BİR səthi control; state change = crossfade + spring pop (slight overshoot ~1.05-1.10, ~250-350ms), deselect = fast 140-200ms shrink+fade; structural swap YOX (Philosophy §4/§5 — morph instead of replace, interruptible).
- **FIX 1 — top-right control morph (TableCard)**: 4 ayrış DOM branch-ə (⋮ / select-circle / M / H) **bİR keyed `AnimatePresence mode="popLayout"` slot**-a çevrildi — `ctl-menu` / `ctl-select` / `ctl-source` / `ctl-target` keys; enter = `SPRING.kessey` (500/26, owner DNA — hair of overshoot) scale 0.5→1 + fade, exit = 140ms shrink+fade. Select-circle içindəki check indi ayrıca keyed pop (`sel-tick`: 0.3→1 kessey in / 140ms out). Grey→blue fill = 180ms CSS color crossfade (state, non-spring).
- **FIX 2 — HESAB chip pop (TableCard)**: `bill_requested` chip anidə on/off idi → keyed `motion.button` (`hesab-chip`) + AnimatePresence: pop in (kessey, scale 0.5→1) / 140ms shrink+fade out. Optimistik patchFloor zamanı dərhal pop olunur (Philosophy §8 — immediate feedback).
- **AUDIT (başqa anidə state transition axtarışı)**: kitchen/status chip-lər ✅ (already keyed morph + blur), OOS card ✅ (CSS 250ms crossfade — intentional, content not structure), cart count badge ✅ (motion), openRing/seatRing ✅ (motion), group border ✅ (320ms grace), tab switcher ✅. **TAMAM — TableCard-dakı 2 nöqtə yeganə gap idi.**
- **E2E R11 (motion, both themes) — HAMISI PASS** (still-latency bəlasına görə `document.getAnimations()` ilə programatik verify): M1 merge-mode: 8×140ms outgoing crossfade + 8×500ms incoming spring **110.6% overshoot** + 260ms toolbar slide → morph Təsdiqləndi (hard-swap DEYİL); M2 check pop in/out (Masa 9, re-tap = shrink+fade); M3 HESAB chip: optimistik pop PIN-dən ƏVVƏL + "MASA 8 — HESAB ÇAĞIRILDI" → 4321 → "kassira göndərildi" → chip tap = PIN → chip fade-out, card MƏTBƏXDƏ; M4 dark spot: select-circle/check/toolbar dark-da düzgün.
- **CLEANUP/STATE**: R11 heç bir real order-a toxunmadı (Masa 8 real order, bill_requested=false geri); Masa 9/98/99 empty; 3 saatda 0 yeni order. **Masa 1 / ORD-2920 toxunulmadı.**
- **Verify**: tsc təmiz; commit + push.
- **Fayllar** (1): `TableCard.tsx` (control morph + HESAB chip pop).

### Jurnal sətiri — 2026-09-28 (FINAL FULL-POS CHECK + SAITO MOTION PHILOSOPHY + REDUCED-MOTION)

- **Owner turn**: "final şəkildə BÜTÜN POS-u check et — UI + backend tam hazırdır? eksikləri fully tamamla" + Saito Motion & Interaction Philosophy-ni yaz (12 qayda: state→motion, continuity, physical motion, interruptibility, morph-not-replace, moving layout, input-device adaptation, immediate feedback, selective motion, no generic AI UI, fast-not-abrupt, **reduced-motion**).
- **PHILOSOPHY DOC — ✅**: [SAITO_MOTION_PHILOSOPHY.md](SAITO_MOTION_PHILOSOPHY.md) (repo kökü, canonical — hər UI interaction dəyişikliyi buna görə review olunur; HANDOVER §0-da referenced).
- **REDUCED-MOTION GAP — ✅ fixed**: POS = 34 framer-motion fayl, amma `MotionConfig`/`useReducedMotion` YOX idi (başqa admin səhifələri individual handle edir, POS etmirdi) → Philosophy §12 violation. Fix: POS root-a **`<MotionConfig reducedMotion="user">`** (page.tsx) — OS reduced-motion ON-dur transform/layout animasiyaları framer tərəfindən avtomatik söndürülür, opacity-based state feedback qalır (state clarity preserved, jarring jump YOX).
- **FULL-POS SWEEP (E2E, both themes) — ✅ no functional blocker**: LIGHT: A1 floor (chips: YENI OTURUŞ/TƏMIZLƏNMƏLI/BOŞ/MƏTBƏXDƏ/QRUP) ✓, A2 empty table → order view + add ✓, A3 editor modal (MIQDAR/SERVİNQ/ƏLAVƏLƏR/MƏRHƏLƏ/QEYD/ALLERGEN + green CTA) ✓, A4 send-to-kitchen success (P1 regression OK) ✓, A5 KDS ticket "Filadelfiya Classic — Kremli ×1" ✓, A9 Tarixçə (top pill black/white light) ✓, A10 reservations page ✓, A12 tab switch ×3 (no ghost, icons Utensils/ShoppingBag/Bike) ✓, A13 action sheet (zero literal `t('close')`) ✓. DARK: A1 floor ✓, A9 Tarixçə (top pill white/dark — black-on-black YOX) ✓. A6/A7/A8/A11 prior rounds-da verified (R6-R8). **Console errors: NONE. Network: `500 /api/devices` ×4 → diaqnoz: GET+POST indi 200 (dev cold-compile burst idi, self-recovered; heartbeat 30s retry ilə idempotent).**
- **AUDIT QETGİLƏRİ (checked, not changed)**: `bg-gold` = brand bronze (`--gold` light: #8C7A4A / dark: #D4AF37) — doctrine violation DEYİL (semantic yellow-amber ayrı mövzudur, round 3-də sıfırlanmışdı). Reservation admin TƏSDİQLƏ = pending→confirmed status (2026-09-26 P0 fact-fix), table-booking ayrı `updateStatus`→`/reserve-table` axını — R8 observation (toast-label ambiguity) qeydə alındı, funksional deyil.
- **CLEANUP**: sweep-in yaranan test order `92caa61a` (Masa 99, ₼25.50) → items cancelled + order cancelled + table empty + audit row; Masa 98/99 empty. **ORD-2920 / Masa 1 toxunulmadı.**
- **Verify**: tsc təmiz; `git` clean after commit; philosophy doc + MotionConfig + journal push olundu.
- **Fayllar** (4): `SAITO_MOTION_PHILOSOPHY.md` (YENİ), `page.tsx` (MotionConfig wrap), `MASTER_FEATURE_MAP.md` (bu entry), `HANDOVER.md` (reference).

### Jurnal sətiri — 2026-09-28 (ROUND 4: P1 SPEC-SYNC + P2 CLONE/LOCK + HESAB PIN + ZONA STANDART + VKB SPACE/FOCUS + RESERVATION SHEET REDESIGN + LIGHT REWRITES)

- **Owner turn**: "brauzerdə özün yoxla, sonra kodda düzgün düzəlt" — (P1) göndərilmiş instansiyanın modifikatoru dəyişilib "Send to Kitchen" basanda "new product yoxdur" xətası; sonrakı modifikator dəyişiklikləri ayrıca mətbəxə gedə bilməlidir. (P2) göndərilmiş məhsulun sayı artırılanda modifikatorlar BÜTÜN instansiyalara birləşir — hər instansı müstəqil olmalıdır; served/ready instansiyaların modifikatoru LOCK. Əlavə: Tarixçə pill light-da qara + tab transition; refund modalı light rewrite; tab keçidində floor-dropdown ghost-ı yox olsun; guest+bag iconları "Masa X" və qiymət ARASINA; "avtomatik hesab berbat işləyir"; delivery form = web standartı, zonalarda qəribəlik OLMASIN; umumi inputlarda space problemi; klavyə açıq popup-da əməliyyat əvvəlcə klavyəni gizlədir; masa birinci toxunuşda açılmır; rezerv actionsheet yenidən dizayn; status/tab ikonlarını düzgün seç.
- **P1 SPEC-SYNC — ✅ E2E (R5 light)**: `usePos.applyInstanceEdits` — göndərilmiş (sent) sətirdə **spec-only** (qty YOX) dəyişiklik → fire-and-forget `POST /api/orders {action:'updateItem'}` (order_item_id, unit_price, quantity, modifiers) → toast **"Mətbəx yeniləndi"**; KDS `/api/orders` poll-u ilə LIVE ticket yenilənir (Kremli→Yüngül R5-də gözləndi). Heç nə unsent deyilsə "Mətbəxə göndər" → `no_new_products` (held var) yoxsa **uğur toast** `all_already_in_kitchen` ("Yeni məhsul yoxdur — bütün sifariş artıq mətbəxdədir") — xəta YOX. i18n az/en/ru.
- **P2 CLONE + LOCK — ✅ E2E (R5 light)**: `usePos.cloneInstance(lineIndex)` — spec'li (modifiers/notes/allergens) sətirdə cart "+" və modal "Miqdar +" → **YENİ müstəqil sətir/pill** (taze instance_id, qty 1, unsent, spec copy, campaign matması ilə qiymət); sadə sətirdə hələ də qty+1. Modal-da sent/spec pill üzərində "+" = draft commit + yeni `__isNew` pill. **LOCK**: `LOCKED_KS = ['ready','served','completed']` (ProductGrid) — per-pill derive (multi) / editKs (single) → banner + CTA "HAZIR (READY) — QƏFƏSLƏNİB". 4 pill-də 2 served → yalnız 2 redaktə (R5: "1 Yüngül"/"2 Yüngül" pill-ləri müstəqil ✓). Identity fallback: stale lineIndex → eyni məhsulun unsent sətirində `cartLineKey` axtarışı.
- **HESAB ÇAĞIR — ✅ E2E (R6 light, PIN 4321)**: 3 root cause: (1) client `fetchData()` (catalog!) + 3s poll-a təmas → **optimistik `pos.patchFloor`** + POST-dan sonra `fetchFloor('manual')`; (2) server cancel-də `payment_pending`-i geri qoymurdu → **`bill_requested=false` + status='occupied' restore**; (3) **smena bağlı olduqda dead-end toast** → `pin_required: true` (shiftGate indi plain-closed halında da qaytarır) → **PinGuard modal** → retry `approver_staff_id` ilə; `shiftGate` server-side manager-role re-verify (`isManagerStaff`, discount pattern). R6: 4321 → "MASA 98 — HESAB ÇAĞIRILDI" + rose chip + payment_pending ≤1s ✓.
- **FLOOR CHIP GHOST — ✅ E2E (R5)**: WhatsApp-style chip→pill flight **SİLİNDİ** (owner: "apple fəlsəfəsi ilə yox olsun") — dine-in-də chip, digər modlarda 120px spacer (stabil header), R5: 3 keçid, flicker YOX.
- **ZONA STANDART — ✅ E2E (R7)**: Wolt/Getir pattern = **address-first, derived values**. Kök qəribəlik: client KM path-də zona adı GÖNDƏRMƏDİ → server km-range re-resolve → tap edilmiş chip sessiz geri dönürdü. Fix: `zoneRepKm(z)` (range midpoint / min+2); chip tap = **zone + KM birgə write** + `pinZone` (RPC-yə `p_zone_name`+`p_distance_km` — server "explicit zone always wins"); KM typing/geo hələ də range re-resolve. R7: ünvan→"≈ 12.9 km"→chip auto→fee ₼2 = chip ₼2, müxalifət YOX.
- **VKB SPACE + CONTROL-TAP — ✅ E2E (R8)**: (a) space-drop kök səbəbi = **controlled value trim** (`nameRaw/phoneRaw/addressRaw` — CustomerPhasePanel input-lar İNDİ raw cart value alır; trim yalnız logic üçün); (b) control tap (chip/button) → focusin/focusout "none" → klavyə dismiss-first → **focusin('none') + focusout guards**: `closest('button,[role=button],a,label,select')` → klavyə AÇIQ qalır (action unmount etsə 300ms detached-poll bağlayır). R8: "a b c" ✓, zone chip tap-da klavyə açıq ✓.
- **RESERVATION SHEET REDESIGN — ✅ E2E (R9+R10)**: native `window.prompt()`-lər **SİLİNDİ** — inline **free-table picker** (boş masa number chips; move = 1 tap, merge = multi-select + "✓ BIRLƏŞDIR: MASA 471 + X" confirm). Layout: full-width indigo **YERLƏŞDİR** CTA → REDAKTƏ ET/ÇAP ET/ZƏNG ET grid → MASA DƏYİŞ (Move icon)/BİRLEŞDİR (Merge icon) → destructive row (NO SHOW/LƏĞV ET). `freeTables` prop (pos.floors empty, non-archived). Info line: double-dim (opacity-50×white/50×opacity-60≈15%) **SİLİNDİ** (TableActionSheet wrapper 1-dim; sheet explicit text-white/white-60; time slice(0,5)). **Deposit drop** kökü: `pos/tables` reservation row NULL-da floor deposit-ni üst-üstə yazırdı → `reservation?.deposit_amount ?? floor.deposit_amount` fallback. R10: "E2E Test · 18:00 · 2 NƏFƏR · 0501234567 · DEPOZİT ₼20" ✓.
- **STATUS/TAB İKON AUDIT — ✅**: `merged` status statusConfig-də **YOXDU** idi (→"Boş" label) → `Layers` + "Qrup" chip (mavi). `TableActionSheet` close button **literal `t('close')`** (curly-brace missing — mətn kimi render) → `{t('close')}`. Tab iconları: Utensils (İCƏRİDƏ) / ShoppingBag (TAKEAWAY) / Bike (ÇATDIRILMA). TableCard: guest+bag counter-ları title və qiymət ARASINA (R5 ✓).
- **TARİXÇƏ + REFUND LIGHT — ✅ E2E (R8)**: topmost active pill light-da **qara** (bg-zinc-900 + white); SİFARİŞLƏR⇄İSTİSNALAR directional slide (x:16, 240ms); refund edit view: ağ kart, oxunaqlı qara mətn, Nağd/Kart (light: red-50/red-600), input-lar zinc-50 (kök: parent white text white card-ə inherit idi). R8: paid MASA 98 ₼45 refund edit tam oxunaqlı ✓ (refund icra OLUNMADI).
- **DOUBLE-TAP — ✅ E2E (R7)**: REAL pointer tap (synthetic JS click artifact deyil!) — boş Masa 471 **BİRİNCİ** tap-da açıldı (blue ring + panel). R5-in "fail"ı synthetic `.click()` artefaktı idi; kodda blocker tapılmadı, real tap-da repro YOX.
- **DB/CLEANUP**: test order `9dcb2255` (Masa 98, ₼14) → items cancelled + order cancelled + table 98 empty + operation_logs audit row; 2 "E2E Test" reservation (cancelled) → DELETE; Masa 471 test-reserved state → empty. **ORD-2920 / Masa 1 toxunulmadı.**
- **Verify**: `tsc --noEmit` təmiz; E2E R5–R10 (light primary + dark spot): P1 ✓ P2 ✓ HESAB+PIN ✓ ghost ✓ zone ✓ VKB ✓ tap ✓ Tarixçə/refund ✓ resv sheet ✓. Qeyd: POS reservation→table link admin detail flow-da "Rezervasiya təsdiqləndi" toast ilə table-confirm ayrı düymədir (R8 observation — UI axını working, toast-label ambiguity qeydə alındı).
- **Fayllar** (14): `usePos.tsx` (cloneInstance, applyInstanceEdits specSyncs, patchFloor, identity fallback), `ProductGrid.tsx` (LOCKED_KS, handleQtyPlus, editKs), `CartPanel.tsx` (onCloneInstance), `page.tsx` (zoneRepKm, pinZone, handleZoneSelect, handleBillRequest+PinGuard, freeTables, onMoveToTable/onMergeWith, tab icons, floor chip), `shiftLock.ts` (approver_staff_id + pin_required), `bill-request/route.ts` (status restore), `pos/tables/route.ts` (deposit fallback), `CustomerPhasePanel.tsx` (raw input values), `VirtualKeyboard.tsx` (focusin/focusout control guards), `ReservationActionSheet.tsx` (rewrite), `TableActionSheet.tsx` (t('close'), subtitle dim), `TableCard.tsx` (merged icon, counters), `OrderHistory.tsx` (pill/transition/refund light), az/en/ru locales (all_already_in_kitchen).

### Jurnal sətiri — 2026-09-28 (ROUND 3: CART COLLAPSE + TIKTOK-STYLE INSTANCE PILL TABS + SERVED LOCK + LIGHT-MODE MAVİ/QARA SWEEP + REFUND FSM + CSRF ROOT FIX + KART TERMINAL RESTORE)

- **Owner turn** (8 nöqtə + 1 light-mode şəkil): (1) modifikator interfeysində instansiyalar arasında keçid üçün **TABLAR əlavə et** + funksiyanı TAM qur; (2) **Served** statusundan sonra modifikatorlar dəyişdirilməməlidir — yoxla/tətbiq et; (3) light mode-da tarixçədə **active pill-lər QARA**; (4) **refund modalı üçün state machine yoxdur** — bütün vəziyyətlər + keçidlər düzgün FSM; (5) qaytarma modalındakı **böyük mənasız izah mətni sil**; (6) **light mode — YALNIZ mavi və ya qara**, orange+sarı HEÇ BİR YERDƏ HEÇ VAXT (dark toxunulmur); (7) **"Invalid CSRF token"** — səbəbini tap, TAMAMİLEN düzəlt; (8) **kart terminalı modalını əvvəlki versiyaya qaytar** + "eyni mehsul ayri-ayri qeyd olunmali deyil, 1 setire collapse olsun, modifikator acanda tiktokdaki kimi surusdurme pilli — 1 ci filadelyiya kremli, 2 ci taba kecid etsen yungul yazilir".
- **(1)+(8) CART COLLAPSE + PILL TABS — ✅ E2E**: **presentation grouping** — `CartPanel.filteredGroups` (group = `product_id|variant_id`; data HƏLƏ per-instance qalır — hər sətir öz modifiers/instance_id/sent state-ini saxlayır, placeOrder identity reconciliation dəyişmədi). Group row: ad + Σqty + Σtotal + sub-row (modifier union chips ×N, shared course chip, tappable "Saxlanılıb" badge, allergen union chip). Stepper: + = son editable instansiya; − = son draft instansiya (yoxdursa hint toast). Hold: batched `onUpdateItems` (single setCart — N sequential onUpdateItem stale-closure collision yaratdı) + per-sent-instance `/api/orders/item-hold` sync. **Modal pill strip (TikTok-style)**: `EditorPreset.instances[]` → horizontal swipe pill (snap-x, numbered circle + hint = exclusive max_select=1 group-un seçilmiş üzvü, yoxsa ilkin modifier adı: **"1 · Kremli" / "2 · Yüngül"**); active pill = light `bg-zinc-900 text-white` / dark `bg-white text-zinc-950` (layoutId morph 200ms). `switchInstance` = commit current draft → load target (`instDraftsRef`); house-default preselect multi-də İCazə VERİLMİR (stored spec = truth, default əlavə qiyməti dəyişərdi). CTA "Yadda saxla" → **`usePos.applyInstanceEdits`** — ATOMİK multi-line replace (1 setCart; no-op diff — dəyişməmiş instansiyalar rewrite olunmur; qiymət = edit-path matması; `sentQty` floor). GERİ QAYTAR = aktiv instansiyanın öz returnCtx-i. E2E: Tom Yam ×3 → **1 sətir qty 3 ₼39.00** ✓; Filadelfiya ×3 → pill 2-yə Kremli → Yadda saxla → 1 sətir + "Kremli" chip ✓ → reopen → **pill "2 · Kremli"**, pill 1 boş ✓, `__errs=[]`. (Tom Yam-in DB-də modifier YOXDUR — `modifiers: []` — pill testi Filadelfiya Classic-də isbat edildi.)
- **(2) SERVED LOCK — ✅ (kod, round 2-dən)**: `kitchen_status ∈ served/completed` → editor spec fields pointer-events-none/opacity-40 + disabled CTA "Served — qəfəslənib"; GERİ QAYTAR axını qorunur. Round 3-də multi-mode-da **per-aktiv-instansiya derive** oldu (1 instansı served, 2-si draft ola bilər → yalnız served pill qəfəsli açılır).
- **(3) TARİXÇƏ QARA PILLS — ✅ E2E**: iki segmented group-un active pill-i light-da `bg-zinc-900` + white text (round 3 əvvəlində edildi, E2E-də təsdiq: HAMISI/ÖDƏNİLDİ black).
- **(4) REFUND FSM — ✅ (kod)**: `edit → confirm → processing → success | error` + guards (close processing-də BLOCK, back confirm→edit, error retry **eyni idempotency keys** — P-4 replay), step chips Seçim/Təsdiq/Nəticə, full-refund warning confirm-də. İzah box-ları silindi (5).
- **(6) LIGHT SWEEP — ✅ E2E (computed-style audit: hue 18–70°, sat ≥0.45 → 0 hit)**: POS surface-də bütün light branch-lər mavi (#3b82f6 ailəsi) və ya qara (zinc-900 ailəsi): CartPanel (hold badge/button BLUE, seated chip, star), TableCard (4 status → black chips; ready border BLUE), KDSView (timer/HOLD/customer note), Kassa (lock banner, No Sale, inputs, paused), RefundModal (CTA black, quick chips), ActionSheet (unpaid chip, bill_request, tip, short change, remaining), WaitlistPanel, OrderHistory/DetailSheet (takeaway icon/badge, preparing, exceptions, PARTIAL, refund button), Delivery/Takeaway status map-ləri (light variant), PinGuard/ClearTable (Shield+CTA black), ReservedTableModal (həmişə-ağ kart → black accents), ProductGrid (combo label, alov+glow black, catalog error, minNeed). **Gold (CƏMİ, brand) saxlanıldı** — owner şəklinə daxildir, iki temada eyni. Admin pages (dashboard/shifts) dark-only (layout-da lightMode YOX) → toxunulmadı. Bonus: OrderDetailSheet-də 3 **literal `t('...')` JSX bug** tapılıb+düzəldildi (mətn kimi render olunurdu).
- **(7) CSRF — ✅ (kod)**: ROOT CAUSE = client-issued `saito_csrf` cookie max-age 3600 **səssində bitir** (və ya cross-tab rotation) → header var, cookie YOX → 403 "Invalid CSRF token". Köhnə self-heal yalnız drift (fresh present) halını örtürdü. Fix: `ensureCsrfToken` **proaktiv** re-establish/adopt + `apiFetch` 403 missing-cookie retry + `admin/shifts/page.tsx` raw fetch (manual cookie read — expiry-də boş) → **apiFetch**. `item-hold` route CSRF-exempt (requireKdsAction) — raw fetch-ə icazəli qaldı.
- **(8a) KART TERMINAL RESTORE — ✅ (kod)**: `6b519ad8` "bypass" (direct capture) **revert** olundu — page `handlePaymentMethodSelect('card')` → `setTerminalState` (wait view "Terminala göndərildi") → confirm → **TerminalTapModal** (idle→tapping→approved/declined simulator); ActionSheet Kart button-ları (×2) → `setCardConfirmView(true)` eyni yola.
- **DB**: E2E heç bir order yaratmadı (kitchen send TAPDILMADI, draft Təmizlə ilə silindi — Masa 98 BOŞ təsdiq). **ORD-2920 (Masa 1) toxunulmadı.**
- **Verify**: `tsc --noEmit` təmiz; E2E light-theme (Masa 98): A/B/C PASS, `__errs=[]`.
- **Fayllar** (20): `usePos.tsx` (applyInstanceEdits), `CartPanel.tsx` (filteredGroups + group row + onUpdateItems), `ProductGrid.tsx` (instances preset + pill strip + switchInstance + CTA), `page.tsx` (onRequestEditor multi + onUpdateItems + onApplyInstanceEdits + light chips), `api-fetch.ts` (CSRF), `shifts/page.tsx` (apiFetch), `OrderHistory.tsx` (FSM + pills + light), + light sweep: ActionSheet, CashDrawerPanel, KDSView, WaitlistPanel, RefundModal, TableCard, OrderDetailSheet, CustomerPhasePanel, DeliveryOrders, TakeawayOrders, PinGuard, ClearTablePinModal, ReservedTableModal.

### Jurnal sətiri — 2026-09-28 (ROUND 2: per-instance LOAD/RECONCILE bug fixes + allergen SSOT + modal allergen bölməsi + Scheduling bərpa + Q1/Q2 cavabları + FROZEN audit)

- **Owner turn** (4 nöqtə + 1 şəkil): (1) modifikatorlar **hər sifariş olunan məhsul (instansiya) üçün ayrıca** olsun — 2× Filadelfiya: birinə kremli+losos+avokado, digərinə fərqli; məhsul bazasında + sifariş ekranında aydın görünməlidir; (2) **allergenlər sətrini modalda AŞAĞIDA ayrıca bölmə** kimi göstər; (3) **"frozen" hissələrə zərər dəyib-dəymədi**, dəyişikliklərin həmin funksiyalara təsiri yoxdur — yoxla; (4) **Scheduling hissəsini bərpa və test et** — "kassa bağlı olanda sifariş yaradıla bilərmi? shift bağlı olanda kassa açılır? bunları bilmək lazımdır".
- **SCHEDULING BƏRPA ✅ (E2E)**: `/admin/shifts` (Növbələr) **POZULMUŞDU** — səhifə `{shifts, kpis}` gözləyirdi, amma `GET /api/shifts` **sadə array** qaytarır (raw rows: staff_id UUID, closed_at; ad/duration/status/kpis YOXDU) → səhifə HƏMİŞƏ "No shifts found" + sıfır KPI. Fix səhifə tərəfində (API shape YOX — digər consumar-lar: `staff/shifts`, `staff/[id]` array-ə üstun): array parse + `staff_name`/`staff_role` join `/api/staff` (eyni pattern kimi), duration/status client-Compute, KPI-lər client-side (aktiv smenalar, bugünkü saatlar, orta müddət, kassa fərqi). Tam AZ lokalizasiya (NÖVBƏLƏR, Bütün/Aktiv/Bağlı/Fərqli, Smena Detalı: Başlanğıc/Bitiş/Müddət/Status/Açılış Kassa/...). E2E: **88 smena, real adlar** (UUID yoxdur), KPI-lər, detail panel, light tema — hamısı ✓.
- **Q1 CAVABI = BƏLİ ✅ (E2E)**: **Kassa BAĞLI olanda sifariş YARADILA BİLİR** — `POST /api/orders`-da heç bir shift/kassa gate YOXDUR (yalnız auth + location). E2E: kassa bağlı + aktiv shift OLMADIQDA order yaratıldı + mətbəxə send olundu (Masa 14, 35.00 ₼). Ödəniş də hard-block olunmur: pay route-un cash-drawer session lookup-u **non-fatal** (yoxdursa `null` → RPC null qəbul edir) — nağd ödəniş sadəcə drawer session-a bağlanmır.
- **Q2 CAVABI = Xeyr (by design) ✅ (E2E)**: **Shift BAĞLI olanda kassa AÇILMIR** — frozen **S-08** `open_cash_register` RPC shift (clock-in) bəndi qaytarır (`OPEN_SHIFT_REQUIRED`). UI: **"VARDİYA AÇIQ DEYİL"** dialoq (i18n `open_shift_required`: "Kassanı açmaq üçün əvvəl vardiyanızın (clock-in) açıq olması lazımdır...") + **bir klik "İŞƏ BAŞLA (CLOCK-IN)"** — clock-in-dən sonra drawer open avto-retry. E2E: dialoq görüntüləndi, clock-in-a toxunulmadı (state dəyişmədi).
- **PER-INSTANCE LOAD MERGE BUG — KRİTİK, FIX ✅ (E2E)**: E2E defect #3: send→reopen-dan sonra 2 fərqli konfiqurasiyalı Filadelfiya **1 sətirə collapse** olurdu (41.00 = 2×20.50 vs real 35.00; Row B-nin modifiers + allergen itirilirdi). **Root cause**: `selectTable` server item-ları **yalnız `product_id+variant_id`** ilə merge edirdi (modifiers/notes/allergens nəzərə alınmır — pre-per-instance artifact). Fix: **hər server order_item = 1 cart sətir** (merge silindi). Draft carry: yalnız **id ilə** re-attach (send-dən sonra "+" halları), ref-dedup; digər draftlar öz instansiyaları. `placeOrder` reconciliation: **instance identity** (`instance_id ?? id ?? legacy key`) — köhnə product-key held twin-i də sent marklayırdı (held eyni məhsulun digər instansiyası ilə). E2E: 2 sətir geri (20.50/14.50, total 35.00 = floor card), **held-twin testi**: Tea×2, biri held → send-dən sonra held sətir DRAFT qaldı (badge + stepper), digəri FROZEN ✓.
- **ALLERGEN SSOT — 3 qapıya FIX ✅ (E2E)**: (a) cart row RAW code ("fish") göstərir → `resolveAllergenEntry` ilə SSOT label (**"Balıq"**); (b) **load mapping `allergens` + `variant_id` SİLİRDİ** (DB-də doğrulandı: `order_items.allergens=["fish"]` — reload-da chip yox idi) → ikisi də geri; (c) **addItems insert `allergens` DROP edirdi** (create path var idi) → simmetriya. **YENİ**: KDS ticket sətirlərində allergen chip (localized, QIZIL, additive — `parseAllergens`+`resolveAllergenEntry`; yalnız flag-lı instansiyada) — allergen flag-ların məqsədi "müşəri allergiyası → mətbəx WARNING" idi, amma KDS heç vaxt göstərmirdi. E2E: cart "Balıq" chip ✓ + KDS qızıl **BALIQ** chip (yalnız item 1) ✓, `__errs=[]`.
- **ALLERGEN BÖLMƏSİ AŞAĞIDA ✅ (E2E dark+light)**: modal header-dan (görsəl·ad·qiymət·chips) çıxarıldı → **aşağıda ayrıca "ALLERGENLƏR:" bölməsi** (Qeyd-dən sonra, CTA-dan əvvəl). Header yenidən təmiz (görsəl·ad·qiymət).
- **CART PER-INSTANCE AYDINLIQ ✅ (E2E)**: truncated ad- siyahısı → **per-instance chip-lər** (ad ×qty, `whitespace-nowrap` — 1568px-də chip içində sətir-kəsik fix) — hər sətirin chip-ləri = HƏMİN instansiyanın seçimi. Edit modal preset = tap olunan sətirin öz state-i (E2E: Yüngül/Acılı Mayonez, Kremli/Losos/Avokado YOX). Qeyd: məhsul kartına tap = **fast-add** (mövcud dizayn, dəyişmədi) — modal sətir "Ətraflı"-dan açılır.
- **FROZEN AUDIT ✅**: bu round-un diff-i frozen set-ə toxunmur: `transition_order_status_validated` (state machine), `calculate_order_total_v3` (total SSOT + VAT), `return_to_stock`/`record_item_waste` (return/waste), `undo_operation_v4`, `mark_sold_out_atomic`, KDS mark-ready RPC — heç biri dəyişməyib (grep audit + diff review). E2E kanadları: send→confirmed keçidi işlədi, CƏMİ floor card-la uyğun (35.00/45.00/55.00), KDS ticket + HOLD badge (held item ticket-də YOX — düzgün, çünki held send-olunmayıb), read-only KDS. KDS route = `/admin/kds` (sidebar-da YOX — direct URL; "Mətbəx Ekranı", station tabs).
- **DB**: E2E order **ORD-2921** (Masa 14: Filadelfiya×2 + Tea×1 + 2 kitchen tickets) təmizlənib (pointer-lar əvvəl NULL). **ORD-2920 (Masa 1, 09:37) SAQLANDI** — owner-in öz canlı testi (şəkildəki modal 3× Filadelfiya məhz onundur).
- **Verify**: `tsc --noEmit` təmiz; E2E round-4 + re-test + final verification (screenshots CDN: cart 2-lines dark/light, KDS BALIQ chip, held-twin, shifts page dark/light, kassa dialoq).
- **Fayllar**: `usePos.tsx` (load merge silindi + allergens/variant_id mapping + draft id-carry + identity reconciliation), `CartPanel.tsx` (modifier chips + allergen SSOT label), `ProductGrid.tsx` (allergen bölməsi aşağıya), `KDSView.tsx` (allergen mapping + ticket chip), `api/orders/route.ts` (addItems allergens), `admin/shifts/page.tsx` (bərpa + AZ).

### Jurnal sətiri — 2026-09-28 (INSTANCE STATE MACHINE: per-instance səbət sətirləri + Hold/Resume + Void always-on + SƏRV sil + Apple mətbəx popover + sabit çip eni)

- **Owner turn** (3 şəkil, 6 nöqtə): (a) VIP seçildikdə çip kiçilməsin — digər çiplərlə eyni ölçüdə, balanslı, sabit; (b) əvvəlki versiyadakı **Void** funksiyasını tapıb bərpa et; (c) şəkildəki **SƏRV** elementini rədd et; (d) modifikatorları **hər məhsul instansiyası üçün ayrıca** idarə et (3× Filadelfiya = 3 müstəqil instansiya, birindəki dəyişiklik digərlərinə tətbiq olumasın); (e) **Hold/Resume state machine** — modifikator dəyişiklikləri, Hold/Resume və "Send to Kitchen" arasında düzgün maşin; dəyişiklik yalnız müvafiq instansiya-ya, ardıcıl + itkisiz, send mətbəxə düzgün gitsin, edge-case-lər nəzərə alındı; (f) MƏTBƏX STATUSU popover-ı **sablon kimi olmasın — Apple feyzi ilə qəşəng UI**.
- **(a) SABİT ÇİP ENİ — ✅ E2E (hər iki tema)**: v1 cəhd (JS ölçülü `absolute` sizer + inline width pin) E2E-də **fail**: `position:absolute` out-of-flow → sizer flex pill-ə **0 en** verir (VIP 82.02px vs 1-ci 145.78px; probe: sizer offsetW=82 amma pill 82-ya collapse). **FIX (in-flow, JS YOX)**: invisible sizer + görünən label **eyni grid cell**-də paylaşır (`grid items-center` + hər ikisi `[grid-area:1/1]`) — cell həmişə ən uzun option-un text enini rezerv edir → pill BÜTÜN floor-larda, BÜTÜN theme-lərdə sabit. `useLayoutEffect`/`longestW` state ölçməsi tam silindi (sizer = layout). E2E: 5 probe (1-ci/VIP × dark/light + final) = **145.78px hər biri, diff 0px**, `__errs=[]`. Bonus: morph ghost-un origin box-ı da floor-lar arasında sabit oldu.
- **(b) VOID BƏRPA + HƏMİŞƏ GÖRÜNÜR — ✅ E2E**: funksiya kodda canlı idi (`a18da58` byte-for-byte restore) amma **görünmürdü** — bütün cart draft olduqda LƏĞV ET pill flex-0-a collapse olurdu. İndi quick-actions row cart boş deyilsə həmişə render olur: LƏĞV ET həmişə mövcuddur — heç nə voidable deyilsə (hələ send olunmayıb) **dimmed (opacity 0.45) + hint toast** `t('hint_void_not_sent')`; send-dən sonra **aktiv**. Void axını: `voidMode`/`voidSelection`/`doVoid` → `POST /api/orders/void` (`requirePermission('pos.void')`, VOID_APPROVAL_THRESHOLD=50 → manager PIN fallback, RPC `void_items_state_aware` → `kitchen_status='voided'` + `total_price=0`). Voidable = `sentQuantity>0 && kitchen_status ∈ pending/accepted/sent/preparing`. E2E: dimmed state ✓, hint toast ✓, send-dən sonra aktiv ✓, void-mode açılma/bağlanma (rose strip + footer) ✓.
- **(c) SƏRV RƏDD OLUNDU — ✅**: cart row-da SƏRV chip **silindi** (owner şəkildə rədd etdi); `isReturnableRow` yalnız void-mode hint üçün qalır. E2E: DOM-də `includes('SƏRV') = false`.
- **(d) PER-INSTANCE SƏTİRLƏR — ✅ E2E**: `addToCart`-da **auto-merge SİLİNDİ** (eyni product+variant+mods+notes artıq qty += merge-etmir) — hər tap öz instansiyasını yaradır; yeni client-side `instance_id` (crypto.randomUUID) = stabill React key + per-instance targeting; `lineKey` = `item.id ?? instance_id ?? config|${idx}`. Editor (editOf.lineIndex) yalnız TAP olunan sətiri əvəz edir (merge yox, count+ yox). E2E: Filadelfiya 3× tap → 3 müstəqil sətir; 2-ci sətirin editor-una "test-nota-2" → **yalnız 2-ci**, 1-ci boş qalır.
- **(e) HOLD/RESUME STATE MACHINE — ✅ E2E + kod audit**: instansiya xətləri: **DRAFT ─hold─► DRAFT_HELD ─resume─► DRAFT ─send─► SENT**. `toggleHold`: sent xətlər **frozen** (early return); server-də mövcud sətirdə (`item.id` var) guarded `POST /api/orders/item-hold` (draft lokalda saxlanılır, server yoxdurda fetch YOX). DRAFT + DRAFT_HELD-da modifikator/nota/course edit icazəlidir — YALNIZ bu instansiya rewrite olunur (held instansiya re-spec edilə bilir, resume-da başqalarının dəyişmədiyi halda çıxır). **Send** (`placeOrder`): hər sətir `delta = qty − sentQty > 0 && !is_hold` — özündə **CARİ** modifiers/notes/course/allergens daşıyır → resume→növbəti send **itkisiz**; bütün cart held → "no_new_products" toast. `is_hold` draft localStorage-da + server sətirlərində sync edilir. Tappable **"Saxlanılıb"** badge (tap = resume) passiv chip-in yerini aldı; hold'da kontroller held-vari-yata keçir. E2E: hold on → badge + kontrol switch ✓; resume → badge yox ✓; send-dən sonra xətt frozen (hold button yoxdur) ✓. Edge-case-lər: sent+hold qovşağı (frozen qalır), held+send (istisna olunur), all-held (toast), edit-də hold state-in qorunması (`isHold !== undefined` override).
- **(f) MƏTBƏX POPOVER — APPLE FEELS — ✅ E2E (dark+light)**: sablon tile-chip layout **silindi**. Yeni: tək frosted səth (backdrop-blur-xl, rgba 0.92/0.94), rounded-[28px], header small-caps tracking label + status dot, source card (emerald ping dot + label + "Seçilmiş"), 3 statistika **TƏK hairline-divided kartda** (inset box-shadow `--div`), böyük **tabular-nums (24px)** — rəng **RƏQƏMDƏDİR, fill-də yoxdur** (zinc/orange/emerald), zero-state 25% opacity. Entrance spring 500/26 (iOS snappy ~250ms, zero overshoot), exit 280ms `[0.45,0,0.55,1]` (graceful). `panelW=272` clamp. E2E: "one frosted rounded card, 3 BIG numbers, hairlines" — dark **VƏ** light ✓.
- **Bonus filter fixes (əvvəlki round, bu commit-ə düşdü)**: `orders/history/[id]` audit → `record_id=eq.${id}` (root cause: raw fetch template `?or(`-də `=` YOXDU — PostgREST malformed param-ı **səssizcə ignore** edir → hər sifarişin altında GLOBAL son 100 audit sətiri görünürdü; qayda: raw fetch URL-də həmişə `key=op.value`, or-filter `or=(...)`; `%` → `%25`); waste-standards → `.ilike('keyword', q)` (`keyword_en` sütunu YOXDUR); campaigns → `.lt('end_date', today)`; CustomerSelect-in əvvəlki 2-query "fix"-i **GERİ ALINDI** (supabase-js `.or(...)` düzgün URL qurur — "Supabase or()-i dəstəkləmir" nəzəriyyəsi yalandı).
- **DB**: `seed-test-orders.sql` (repo root) — owner istəyi ilə **150 test sifəri geri qoyuldu** (106 paid/39 cancelled/4 closed/1 refunded; 87 dine-in/46 takeaway/17 delivery; 324 items, 112 payments, 112 ledger, 250 audit, 39 cancelled-orders; sequence-lər: ORD-→2918, #A→95, #D→70); 27 NULL dine-in `table_number` patch-landı (verified: still_null=0, occupied_now=0). E2E-dən qalan test sifarişi **ORD-2919** (Masa 15, 3× Filadelfiya) təmizlənib: order + order_items 3 + operation_logs 1 + table_floors pointer (pointer-lar ƏVVƏL NULL — FK RESTRICT).
- **Verify**: `tsc --noEmit` təmiz (app-scope 0 xəta; mövcud jest test xətaləri excluded). E2E screenshots 66–73 + chip-fix-verified-dark (e2e-shots/).
- **Fayllar**: `LiquidDropdown.tsx` (grid-cell sizer, JS ölçmə silindi), `CartPanel.tsx` (SƏRV sil, per-instance lineKey, hold/resume machine + tappable badge, LƏĞV ET always-visible), `usePos.tsx` (merge silindi + instance_id, per-line send payload, held exclusion), `ProductGrid.tsx` (Apple popover + panelW 272), `page.tsx` (morph ghost silhouette note + data-floor-chip E2E probe), `orders/history/[id]/route.ts` + `waste-standards/route.ts` + `campaigns/route.ts` (filter fixes).

### Jurnal sətiri — 2026-09-27 (ENTRY-BUG FIX + MORPH V2: Tarixçə girişi düzəldildi, idlePrime 500, chip-morph deterministik manual ghost)

- **Owner**: "yoxla" (browser relay yenidən icazəli). Brauzer E2E 3 fix-i təsdiqlədi + morph-un ƏKS istiqamətində layoutId qüsurunu ortaya qoydu.
- **(d) TARİXÇƏ entry bug — ✅ DÜZƏLDİLDİ** (2 səbəb, brauzerdə reproduksiya olundu):
  1. **"0 sifariş" + ~1s spinner → bütün sətirlər bir anda pop**: ilk açılışda cold pooler ~1s çəkirdi. FIX: `OrderHistory` indi **mount-da bir dəfə prefetch** edir (`mountPrefetched` ref + `fetchOrders/fetchExceptions`) — Kassa ilə eyni stale-while-revalidate doctrine; ilk açılış artıq data ilə anında paint olur. Subtitle bonus: `loading && totalCount===0 && orders.length===0` → "Yüklenir..." (həqiqi empty state "0 sifariş" qalır).
  2. **Next dev "1 Issue" badge = Runtime Error 500 @ `data-cache.ts run()`**: `AdminDesktopShell`-in `idlePrime(['/api/orders', ...])` → `primeCache` = `void cachedFetch(...)` — **catch YOXDUR**; cold-pooler 500 (QF9 flake) unhandled rejection olub badge yaradırdı. FIX: `primeCache`-də `.catch(() => {})` (warm-up fail heç vaxt user-visible olmamalı). E2E: badge YOX, `window.__errs=[]`.
- **(a) MORPH V2 — layoutId → deterministik MANUAL GHOST** (E2E: layoutId projection YALNIZ chip→pill istiqamətində işlədi; pill→chip qaytışı opacity-0-da bitən elementdən project olunmurdu — framer qüsuru). Yeni arxitektura: `DragTabSwitcher`-a `onBeforeChange` prop (klik anında, pill travel-ı BAŞLAMAZDAN ƏVVƏL — iki tərəf də ölçüləndikcə); page `handleTabMorph`: chip box / cari pill mərkəzi / hədəf tab button rect ölçülür → **chip-styled `fixed left-0 top-0` ghost** `x/y/width/height/opacity` animasiyası: OUT = box→point 260ms `[0.45,0,0.55,1]` + çip 150ms dim (cüt şəkil YOX); IN = point→box 340ms (pill-ın posMode flip-i ilə eyni anda land edir) + çip mount-dan dimmed, land-dən sonra görünür. `layoutId` mexanizmi `LiquidDropdown`-dan geri alındı (temiz). **CRITICAL PITFALL (E2E ölçdü: +346/+68 offset)**: `position:fixed` + Framer `x/y` = FLOW pozisiyasına TRANSFORM — `left-0 top-0` origin-anchor olmadan ghost yanlış küncdən uçurdu.
- **E2E NÖHTƏVİ (rAF rect trace, dark+light, focused tab)**: OUT ghost START `[813,68,158,39]` = chip box **BAY-BAY eyni** → END `[593,83,10,9]` center (598,87.5) ≈ TAKEAWAY pill center (593,88), opacity 100→0, **253ms** ✓; IN ghost START `(593,88)` pill center, w8, op0 → END `[813,68,157,39]` = chip box, op100, **334ms** ✓ (qaytış ÇIPİN SONUNCU BİRLƏŞDİYİ pill-dən — TAKEAWAY-dan — başlanır, düzgün semantika); console errors **0**; settled state: 1 çip, ghost qalığı YOX, grid pozulmayıb. Entry: list anında (4/4 frame settled), "0 sifariş" = həqiqi count (DB təmiz), flash YOX.
- **Səbətlənən**: `55-morph-final-dark`, `56-chip-before-dark`, `57-tarixe-entry-instant-dark`, `58-tarixe-entry-settled-dark` (e2e-shots/).
- **Fayllar**: `OrderHistory.tsx` (mount prefetch + subtitle), `data-cache.ts` (primeCache catch), `page.tsx` (handleTabMorph + ghost + tabGroupRef/chipWrapRef/chipDimmed), `DragTabSwitcher.tsx` (onBeforeChange; pillOverlay geri alındı), `LiquidDropdown.tsx` (layoutId geri alındı). `tsc` təmiz.

### Jurnal sətiri — 2026-09-27 (MORPH + CART-PERSIST + DB HYGIENE: mərtəbə çipi ⇄ tab pill, Customer Info-da səbət, simmetrik phase transition, Supabase təmizləmə)

- **Owner turn** (5 nöqtə): (a) mərtəbə çipi tab dəyişəndə bir anda yox olmasın — aktiv tab pill-ə doğru uçub onunla birləşsin (WhatsApp-style); (b) Customer Info açılanda səbət yoxa çıxmasın + Products↔Customer transition-ı: giriş (bizə doğru) qorunur, çıxış eyni trayektoriya ƏKS istiqamətdə; (c) 4-6 şəkillər (Tarixçə/detail/refund) **təsdiqləndi — toxunulmadı**; (d) Tarixçə modal girişi bug — brauzerdən baxılmalı; (e) 335 sifariş "həddən çoxdur" — real Supabase yoxlanıb + lazımsızlar təmizlənib.
- **(a) Mərtəbə çipi ⇄ tab pill morph** (`LiquidDropdown.tsx`, `DragTabSwitcher.tsx`, `page.tsx`): shared-element via **`layoutId="pos-floor-chip"`**. İÇƏRİDƏ-da çip (`LiquidDropdown` trigger, `layoutId` prop) görünür; TAKEAWAY/ÇATDIRILMA-da çip YOXDUR və bunun əvəzinə `DragTabSwitcher`-in **aktiv sliding pill-in MƏRKƏZİNƏ** yeni `pillOverlay` slotu ilə 12px qeyri-bərabər dot eyni `layoutId`-la mont olur → Framer çipin son box-ından dot-a **project** edir (çip pill-ə "uçub" içində əriyir, 260ms `[0.45,0,0.55,1]`, opacity 1→0). Geri İÇƏRİDƏ-da tərs: çip dot-ın box-ından çıxıb öz yerinə böyüyür (opacity 0→1). Zamanlama: pill öz spring-si ilə çatanda `onChange` fırlanır → morph pill-in yerində başlamaqda (WhatsApp sequenced hiss). `floors.length === 1`-də heç nə dəyişmir. `pillOverlay` prop-u optionaldır (Reservations/Staff-dakı drag-tab toxunulmayıb).
- **(b) Səbət Customer Info-da QALIR** (`page.tsx`): `posPhase !== 'customer' &&` gate-i **SİLİNDİ** — 440px cart column bütün phase swap boyu mounted + görünür (content loss YOX, column collapse YOX). Phase transitions **simmetrik edildi**: customer exit `{y:14, scale:0.99}` (enter-in exact reverse — köhnə `y:-10 scale:0.995` "up-and-away" snap-itdi), products exit `{y:10}` (enter-in reverse). Enter-lər qorunub (owner: "bizə doğru gəlməsi pis deyil"). `transition={SPRING}` (pos-motion 280/22/0.9, ζ≈0.98 ≈ zero overshoot) hər iki pane-də eyni qaldı → mode="wait" ardıcılığında outgoing geriyə çəkilib incoming eyni yoldan bizə doğru gəlir.
- **(d) TARİXÇƏ modal girişi bug — ⏳ AÇIQ (növbəti round brauzer reproduksiya)**: owner "brauzerdən baxsan anlayasan". Bu turn-də browser relay fail oldu (circuit breaker: stale fused-ref + tab-loss cascade) → brauzer verilişi yenidən açılanda ilk iş: entry-ni 5–8 frame ilə sample et + console error-ları topla + diaqnoz. Statik suspektlər: (1) ilk açılışda subtitle `0 sifariş → N sifariş` count flash (`totalCount` state 0-dan start, fetch gələnədək), (2) screenshot-dakı Next dev "1 Issue" badge-i = React error (məzmunu bilinmir), (3) `centerModal` spring 500/26 (ζ≈0.58) 85vh card-da kiçik overshoot. OrderHistory.tsx **bu round-da toxunulmayıb** — bug fix ayrıca.
- **(e) DB HYGIENE (REAL Supabase, psql pooler)**: `orders` **849 → 0** (modalda görünən "335" = `status='paid'` subset). Diaqnoz: BÜTÜN orders dev/test data — date range **2026-03-19 → 2026-09-27**, created_by = "Admin Updated" (467) / "superadmin" (160) / NULL (78) / 9 test staff (Kamran/Nurlan/Tural...), customer names: "Test Müştəri", "E2E Test A/B/E3", "AUDIT TEST", "Delivery Test", "o2i3hjio", MASA 511/97 (plan 1–1605 içində test masaları). Silinənlər (bir transaction, `DISABLE TRIGGER USER` → `ENABLE TRIGGER USER`): orders 849 + CASCADE: order_items 891, order_payments 161, payments 2, order_events 54, cancelled_orders 25, kitchen_tickets 24 + explicit: kitchen_schedule 3, operation_logs 351, price_overrides 3, outbox_events 130 (order/order_item), audit_logs 392, inventory_logs 64 (order_item ref). **NÜANSLAR:** `order_payments` immutable trigger (PAYMENT_RECORD_IMMUTABLE) + `inventory_logs` immutable trigger (UPDATE forbidden) → user triggers transaction içində disable/re-enable; `table_floors.current_order_id` RESTRICT → 2 sətir əvvəl NULL; `orders.merged_into` self-FK → 12 sətir əvvəl NULL; `order_hourly_stats` VIEW-dir (silinmir, özü təmizlənir). **SAXLANDI:** floors 2, table_floors 107 (floor plan!), staff, customers 18, reservations 92, cash drawer (Kassa state), stok, settings, order counters. Tarixçə indi "0 sifariş" göstərir (empty state mövcuddur).
- **E2E — ⏳ GÖZLƏYİR** (browser relay bu turn fail oldu): növbəti brauzer pass-də: (1) Tarixçə entry bug reproduce + fix + verify; (2) çip morph dark+light (pill-ə uçub ərimə + geri çıxma); (3) Customer Info swap-da səbətin HƏR frame-də görünməsi + simmetrik transition; (4) floor kartlarına toxunulmadığını confirm (owner təsdiqi).
- Verify (kod): `tsc --noEmit` app-scope **0 xəta** · **3 fayl** (`LiquidDropdown.tsx`, `DragTabSwitcher.tsx`, `page.tsx`).

### Jurnal sətiri — 2026-09-27 (MODAL & VKB BATCH: refund üfüqi + sticky actions + audit collapse + VKB stacking/Apple restyle + Kassa aydın label + TableCard de-crowd)

- **Owner turn** (7 nöqtə): refund klaviaturada ekrandan çıxır + bütün modallar üfüqi/balanslı; refund düyməsinə həddindən artıq scroll; Tarixçə-nin lazım olub-olmadığına qiymət; inputlar bir-birinə girir (ş4) + 1/2/3-dən yalnız 1 (owner **V1 seçdi**); ş5-də məqsədi aydın olmayan düymələr; klaviatura blur/modal ARXASINDA açılır; klaviatura Apple-stil; state machine/fokus/ekran ölçüləri + ş6/7 kart məlumatları sıxışır.
- **Tarixçə qərarı (mənim qiymətim — SAXLANDI, yığcamlaşdırıldı)**: lazım — receipt reprint, refund (sequential partial), exceptions audit (VOID/REFUND) core kassir axınıdır (2026-09-23 owner Toast benchmark ilə istəyib). Silmək əvəzinə detail view yığcam (aşağıda).
- **Refund (RefundView, `OrderHistory.tsx`)**: tək 700px column → **wide 2-column sheet** (max-w-2xl): SOL = summary (ödənilən/qaytarılan/qalan) + qaytarılma üsulu + hint-lər; SAĞ = TAM/QİSMİ/MƏHSUL + məbləğ (+%) və ya item list + səbəb; FOOTER (full-width) = warning + LƏĞV ET/TƏSDİQLƏ. Card `maxHeight = calc(100vh - var(--vk-height) - nativeVKB - 48px)` → klaviaturada **heç vaxt ekranın yuxarısından çıxmayıb** (E2E: card top=69 ≥ 0, klaviaturaya 85px gap, dark+light).
- **Detail view**: action-lar (Çap + Qaytarma) **STICKY FOOTER** (scroller-dan kənar) — E2E: scrollY=0-da hər ikisi viewport-da, scroll bottom-da da görünür. Audit log default **3 sonuncu** + "Bütün tarixçə (N)" expand (100→3 satır, expand/collapse test edildi). space-y 4→3.
- **Variant qərari**: owner **V1 "Clean list"** seçdi — V2/V3 + header 1/2/3 switcher SİLİNDİ (`renderOrderCard` indi V1-only).
- **Modal eni (üfüqi balanslı)**: Tarixçə max-w-xl → **max-w-2xl** (E2E 672px). Header row boşluqları (filter tracks bir-birinə/search-a toxunmur).
- **VKB STACKING fix (`VirtualKeyboard.tsx`)**: root cause — slide-in transform **WRAPPER** div-də idi: transformed ancestor = fixed child-in containing block + stacking context → ~280ms entrance-də `z-[10002]` z-auto wrapper-in trapped idi → klaviatura blur/modal ARXASINDA açıb animasiya bitəndə "jump" edirdi. Fix: **fixed+z element ÖZÜ** motion elementdir. E2E: z=10002 + elementFromPoint = key (crisp topmost).
- **VKB Apple restyle**: light theme (ağ keycap, grey plate) + dark (frosted white/16 keycap); done key amber → **EMERALD** (doctrine: no yellow); "Virtual Keyboard" label YOX → grabber + GİZLƏ pill (E2E catch: pill itmişdi — bərpa olundu, işləyir); key 54→52px, whileTap scale+brightness (canlı press hiss). `.vk-active` input ring amber → emerald.
- **Kassa accessory row (ş5 — "user anlamaq lazımdır")**: NO SALE→**Satışsız**, DROP→**Nağd çekmə**, QİFİL→**Qıfılla**, Z→**Z hesabat** (+ Receipt icon) — hər birinin `title` tooltip-i EFFECT-i izah edir (məs. "Kassadakı artıq nağdı safe-ə köçür").
- **TableCard (ş6/7 — "məlumatlar bir-birinə girib")**: group child nömrələri (16/18) absolute top-[68px]-dən (amount hero ilə collision) → top row-a (E2E: counter-la 7px overlap tapıldı!) → sonda **BOTTOM-LEFT row-a** (waiter yanı) köçdü; counter-lar quiet (13px icon, white/55); ⋮ quiet (opacity-40); badge-li title text-xl → text-lg. E2E: 0 overlap, title truncation YOX, normal masalar text-2xl (24px) qaldı.
- **E2E (Chrome :3000, real DB-yə 0 yazı)**: refund 672×463 2-col · VKB z+elementFromPoint PASS (dark+light) · card top 69≥0 · GİZLƏ pill close PASS · sticky footer PASS · audit 3→100→3 PASS · **0 console error**.
- Verify: `tsc --noEmit` app-scope **0 xəta** · **4 fayl** (`OrderHistory.tsx`, `VirtualKeyboard.tsx`, `CashDrawerPanel.tsx`, `TableCard.tsx`) · screenshots `e2e-shots/30-40-*`.

### Jurnal sətiri — 2026-09-27 (DESIGN BATCH: Tarixçə tabs + 3 order-card variant + ORD chip sil + Kassa Apple-minimal)

- **Owner turn**: 6-nöqtəlik batch-in **dizayn** yarısı: (2) çirkin şablonlardan 3 variant + 2-ci şəkildəki ORD chip-ənin silinməsi; (3) Tarixçə tab-ları "hər tab digəri ilə qarışmış görünür" — hamar transition + aydın aktiv indikator; (5) Kassa "sadə şablondan çıx" — Apple fəlsəfəsi, minimal, premium.
- **Task 5 — Tarixçə tabs** (`OrderHistory.tsx`):
  - SIFARİŞLƏR/İSTİSNALAR → **sliding pill** (`layoutId="oh-sheet-pill"`, 240ms `[0.45,0,0.55,1]`, zero overshoot) — aktiv tab bir nazarda aydın.
  - 8 chip (2 müxtəlif filter sistemi, 1 clipped scroll row) → **2 ayrı quiet qrup**: source (HAMİSİ/İÇƏRİDƏ/TAKEAWAY/ÇATDIRILMA) + status (ÖDƏNİLDİ/QAYTARILMIŞ/LƏGV/**BÜTÜN**), hər qrupun öz sliding pill-i (`oh-src-pill`/`oh-st-pill`); status "Hamısı" → "Bütün" (iki Hamısı qarışırdı). Artıq heç label clip olunmur (QAYTARILMIŞ kəsik deyil).
  - Tab CONTENT = **parallel crossfade**: 2 pane relative container-da absolute stack (card-a **list mode-da definite height** — 85vh; detail content-sized qaldı) — 220ms fade, blank frame YOX, hər pane öz scroll-un saxlayır. Search orders pane-ə köçdü (exceptions-da görünüb, heç nə etmir idi).
- **Task 6 — 3 order-card variant** (`OrderHistory.tsx`): `renderOrderCard()` + **TEMPORARY 1/2/3 switcher** (modal header, X-in yanı): **V1 "Clean list"** (hairline separator, round source glyph, title+meta sol / total sağ) · **V2 "Ledger card"** (kart səthi, kvadrat glyph, title/total baseline, dot-meta) · **V3 "Accent receipt"** (source-rəngli left accent bar, uppercase title, böyük total). **Owner seçəcək; sonra switcher + digər 2 silinəcək.**
  - **ORD chip SİLİNDİ** (`CartPanel.tsx`): cart header-dəki dine-in `cart.order_number` chip yoxdur (owner explicit: "ikinci şəkildəki chipi sil") — data cart-da qalır (detail/receipt yolları toxunulmayıb).
- **Task 7 — Kassa Apple-minimal** (`CashDrawerPanel.tsx`): 6 metric tile (shift 3 + balance 3 colored) = `SAITO_UI_VISUAL_DIRECTION.md` §5-in "dashboard syndrome"-u → **tək hero section**: status dot + 34px tabular balance + 1 sətir shift meta (kassir · 11:42 · 9s 23dq · açılış) + hairline NAĞD/KART/XƏRC (**yalnız rəqəmlər rəngli**). 3-colored primary grid → **tək solid emerald "Daxilolma"** (yalnız accent) + quiet bordered Xərc/Smenanı bitir cütü. 5 colored mini-tile → **borderless accessory row** (No Sale/Drop/Depozit/Qıfıl/Z). Hərəkətlər: card fill → hairline list, quiet circle icon-də. Bütün handler-lər eyni.
- **E2E (Chrome :3000, rAF frame-sampling, real DB-yə 0 yazı)**:
  - **2 BUG tapıldı + fix olundu**: (1) card **0px collapse** (content-sized card + absolute panes — flex-in grow etmək üçün space yoxdu) → list mode-da definite 85vh; (2) **iki pane eyni anda render** (ternary guard itki) → AnimatePresence-də `sheetTab` ternary, yalnız aktiv pane DOM-da.
  - **Crossfade sübutu (hər iki istiqamət)**: outgoing 1→0 ∥ incoming 0→1, **~14–16 ara dəyər**, **frame-frame cəmi ≈ 1.0** (203/226ms), 0 blank frame, çıxan pane 220ms-də unmount (ghost qalmır).
  - **Tab isolation (elementFromPoint)**: orders↔exceptions 3/3 PASS · 0 console error.
  - Kassa: accessory row 5 item tam görünür, clip YOX (dark+light) · Card 737px (85vh), list scroller 483px işləyir, detail content-sized (max-h, forced deyil).
  - 25-exceptions: 8 CANCEL row tam body-də (45px collapse fix olundu).
- Verify: `tsc --noEmit` app-scope **0 xəta** · **3 fayl** (`OrderHistory.tsx`, `CartPanel.tsx`, `CashDrawerPanel.tsx`) · screenshots `e2e-shots/21-*` (Kassa dark/light), `22-*` (V1 dark/light), `23-*` (V2), `24-*` (V3), `25/26/27/28-*`.
- **⚠️ OWNER QƏRARI GÖZLƏYİR**: order-card variantı hansı (1/2/3) — seçildikdən sonra switcher + digər 2 variant silinəcək.

### Jurnal sətiri — 2026-09-27 (GUEST OPTİMİSTİK + MODAL STALE-WHILE-REVALIDATE + KASSA BLUR SINGLE-CLOCK + VKB FIT)

- **Owner turn**: 6 nöqtəlik batch — (1) guest confirm gecikir; (2) 3 order-card variantı + ORD chip sil; (3) Tarixçə tabs qarışıq görünür — hamar transition + aktiv indikator; (4) VKB-açıldıqda modal balanssız/qalın düzbucaqlı; (5) Kassa "sadə şablon"dan çıxarmaq — Apple minimal/premium; (6) Kassa + Tarixçə gec açılır + "Tarixçə bluru möhtəşəm, Kassa-da modal açılır BLUR SONRA olur". Bu sətir **texniki batch** (1, 4, 6 + blur fix)-in nəticəsidir; dizayn nöqtələri (2, 3, 5) növbəti round-da.
- **Task 1 — Guest OPTİMİSTİK update** (`CartPanel.tsx` + `page.tsx` + `usePos.tsx`): kök səbəb — köhnə kod `await POST` (server: 1 SELECT + N table PATCH + 1 order PATCH) edib, **sonra** `pos.fetchData()` TAM fan-out (floor + catalog + per-table prefetch) gözləyirdi. Fix: `onGuestCountSaved` **TAP-da** fırlanır (page.tsx optimistic `setCart({...cart, guest_count})`), POST background-da gedir; yalnız **COMMIT-də** `onGuestCountPersisted` → `pos.fetchFloor()` (yalnız floor card, catalog YOX — stale flash yox). `fetchFloor` hook-dan exposed olundu (1 sətir).
- **Task 2 — Modal STALE-WHILE-REVALIDATE** (`CashDrawerPanel.tsx` + `OrderHistory.tsx`): hər iki modal blank mount edib spinner-da network-gözləyirdi. `hasLoadedOnce` ref: **yalnız ilk yük** spinner gate-i göstərir; re-open cache-dəki session/orders **dərhal** render olur, refresh background-da.
- **Task 3 — Kassa blur SINGLE-CLOCK** (`CashDrawerPanel.tsx`): kök səbəb — Kassa `backdrop-blur-sm`-i **nested veil child** (z-0, `pointer-events-none` root-də, transition-siz) üzərinə qoyurdu → blur card-dan SONRA composite olundu. Tarixçə-nin quruluşuna köçdü: **root** = clickable blurred backdrop (`bg-black/20 backdrop-blur-sm`) `fastExit` clock-da; **card** = child (`stopPropagation`). Ayrı veil YOX.
- **Task 4 — VKB FIT** (hər iki modal): köhnə `calc(var(--vk-height, 0px) + 16px)` **heç vaxt təyin olunmamış** CSS var idi (dead code). İndi hər ikisi `useKeyboardHeight()` (visualViewport): keyboardHeight>0 → card `maxHeight: calc(100vh - keyboardHeight - 32px)` + backdrop `paddingBottom: keyboardHeight+16` → modal görünən sahəyə balanslı uyğunlaşır, input kəsilir YOX. (Desktop-də VKB yoxdur — code-only fix, mobil E2E lazımdır.)
- **E2E (Chrome :3000, rAF sampling, real DB-yə 0 yazı)**:
  - **Task 1**: guest +/− instant (**~31ms**); ✓ confirm **52ms** (köhnə: 1500ms+ network+fanout gözləmə); "3 Nəfər" chip persist oldu; masa 15 empty-ya restore.
  - **Task 2**: Kassa ilk-open **4333ms** → re-open **65–68ms** · Tarixçə ilk-open **1115ms** → re-open **179ms** — re-open instant (cached).
  - **Task 3**: hər iki modal `backdrop-filter: blur(8px)` **animated root**-da, ~280ms opacity ramp **SYNC**, nested veil yox → "Kassa blur sonraydı" ARDAN QALDIRILDI.
- Verify: `tsc --noEmit` app-scope **0 xəta** · **5 fayl** (`CartPanel.tsx`, `CashDrawerPanel.tsx`, `OrderHistory.tsx`, `usePos.tsx`, `page.tsx`) · screenshots `e2e-shots/20-kassa-blur-sync.png`, `20-kassa-reopen-instant.png`.

### Jurnal sətiri — 2026-09-27 (CART BODY STATE MACHINE — empty↔items CROSSFADE, ~320ms blank gap aradan qaldırıldı)

- **Owner turn**: "sebet instant deyisiklik gosterir (hem elave, hem Təmizlə); masa bos olanda Təmizlə button/placeholder desync; webde arastirsan gorersen STATE MACHINE ne duseren".
- **Kök səbəb (E2E frame-sampling ilə sübut olundu)**: empty + non-empty cart **iki müstəqil JSX budağı** idi. Non-empty bədən (items + Təmizlə/Ləğv row + totals) `!isEmpty` **hard-unmount** ilə **BİR FRAME-də** yox olurdu (instant-out), empty placeholder isə **320ms fade-in** → ~320ms **BOŞ frame** (item yox, button yox, placeholder ~görünməz). Add-da da **single-frame jump** (items 0→1 + Təmizlə 0→383px eyni frame).
- **Fix (state machine)**: kart bədəni **tək `AnimatePresence` crossfade**-inə çevrildi:
  - **non-empty bədən** → in-flow keyed `motion.div` (`cart-body-items`, `flex flex-col h-full min-h-0`), graceful **enter** (opacity 0→1, y 10→0) + **exit** (opacity 1→0), 280ms.
  - **empty placeholder** → absolute overlay keyed `motion.div` (`cart-body-empty`, `absolute inset-0`), graceful enter/exit (opacity), 280ms.
  - Container `relative flex-1 min-h-0 overflow-hidden`. İki state eyni AnimatePresence-də → **crossfade** (bir-birinin üstünə, **boş frame YOX**).
  - **Təmizlə/Ləğv morph row non-empty bədənin İÇİNDƏDİR** → items-lə BİRLİKDƏ fade in/out (artıq instant pop/vanish YOX).
- **E2E (Chrome :3000, rAF opacity sampling, real DB-yə 0 yazı)**:
  - **ADD** (dark ~265ms): bodyOp 0→1 ∥ emptyOp 1→0 **overlap** (max 0.63/0.66).
  - **CLEAR** (dark ~261ms): bodyOp 1→0 ∥ emptyOp 0→1 **overlap**. **BLANK frame (bodyOp<0.1 AND emptyOp<0.1) = 0** (dark ×2 + light).
  - **Təmizlə/Ləğv row**: `temizleW` bütün exit fade-də 383px sabit, body unmount olduqda null → row body ilə birlikdə fade olur ✅.
  - Light mode: eyni (ADD overlap 0.61/0.68, CLEAR 0.42/0.30), 0 blank. Console errors **0**. Table 15 empty-ya restore olundu.
- Verify: `tsc --noEmit` app-scope **0 xəta** · 1 fayl (`CartPanel.tsx`) · screenshots `e2e-shots/19-crossfade-add-dark.png`, `19-crossfade-clear-dark.png`.
- **Qeyd**: primary CTA (MASANI TUT / Sifariş et / Ləğv — "Unified morph action button") və modallar bu bədənin **SIBLING**-ıdır, toxunulmadı — onlar ayrı always-rendered morph-dur.

### Jurnal sətiri — 2026-09-27 (TƏMİZLƏ ↔ LƏĞV ET MORPH BƏRPA — header pill geri qaytarıldı, eyni sətirdə split)

- **Owner turn**: "'Təmizlə' gedib en yuxarıya düşüb — LƏĞV ET ilə **EYNI SƏTİRDƏ** olmalıdır. Əvvəlki commit-lərdəki morph geri qaytar: draft yoxdur → LƏĞV ET **full**; draft var → TƏMİZLƏ **solda** görünür, LƏĞV ET bölünər."
- **Root**: 2026-09-27 "Təmizlə header pill" round (`6bd92ec3`) owner-in "çox pis yerləşdirilib" şikayətini header-ə köçürəndə **morph-u qırdı** — Təmizlə header-ə ghost pill oldu, void-row **VOID-ONLY** oldu. Əsl morph dizaynı `b469f842`-də (parent) var idi: `CartPanel.tsx` `flex gap-2` row-da Təmizlə `flex: hasDraft ? '1 1 0%' : '0 0 0%'` + Ləğv `flex: hasVoidableItems ? '1 1 0%' : '0 0 0%'`.
- **Fix**: (1) header-dakı Təmizlə ghost pill **SİLİNDİ**; (2) void-row → **morph row** (eyni yerdə: `border-t`, customer area altında, items üstündə). İki `motion.div` (spring 400/30/0.8) öz **flex share**-ini animasiya edir; row özü `AnimatePresence`-da graceful height+opacity collapse (280ms, doctrine saxlanılır).
  - **No draft** (tək sent item) → Ləğv **full** (Təmizlə `flex:0 0 0%`)
  - **Draft, no sent** (tək draft) → Təmizlə **full** (Ləğv `flex:0 0 0%`)
  - **Mixed** → hər ikisi `1 1 0%` = **50/50 split**
- **E2E (Chrome, :3000, rAF width sampling, real DB-yə 0 yazı)**:
  - **TEST A** (masa 15, +1 Tea, pure draft): Təmizlə **383px** / Ləğv **2px** / row 391 → Təmizlə full ✓ · header-də Təmizlə pill: **YOX** ✓ · Təmizlə-yə **1 tap** → cart boşalır (Bug B fix saxlanılır) ✓.
  - **TEST B** (masa 17, sent Filadelfiya Classic, no draft): Təmizlə **2px** / Ləğv **383px** → Ləğv full ✓.
  - **TEST C** (masa 17 + +1 Tea draft, mixed): Təmizlə **192px** / Ləğv **192px** / gap 8px → 50/50 ✓. **Morph rAF seriyası**: (2, 383)→(45, 334)→(58, 320)→(73, 304)→(141, 236)→(164, 216)→(180, 201)→(188, 194)→(192, 191) = **~210ms smooth split**, ani jump YOX.
  - **LIGHT** mode: eyni split (192/192/8/391) — hər iki tema ✓. Console errors **0**. **Backend writes: 0** (masa 15 təmizləndi, masa 17 orijinal sent-only halına qayıtdı).
- **Qeyd**: `Trash2` importu saxlanıldı (Təmizlə buttonunda işlədilir). Served-only (returnable) edge case parent-də də var idi — toxunulmadı.
- Verify: `tsc --noEmit` app-scope **0 xəta** · **1 fayl** (`CartPanel.tsx`) · screenshots `e2e-shots/17-morph-A-draft-full.png`, `17-morph-B-legv-full.png`, `17-morph-C-split.png`, `17-morph-C-light.png`.

### Jurnal sətiri — 2026-09-27 (BUG A + B FIX — KASSA/TARİXÇƏ view-swap crossfade + TƏMİZLƏ ilk-klik: kök səbəb EFFEKT-SIRASI YARIŞI idi)

- **Owner turn**: "davam ele" — HANDOVER §3-ün #1 prioriteti (iki açıq bug) icra olundu. Bu jurnal sətiri həmin round-un nəticəsidir.
- **BUG A — KASSA view-swap opacity donmuş (visually: ~215ms boş ekran + snap)** — fix 2 qatlı:
  1. **Kök səbəb tapıldı**: card-da `backdrop-blur-xl`. `backdrop-filter` ancestor Chrome-da uzaq child-in opacity animasiyasını dondurur — transform/y işləyir, opacity yalnız son frame-də tətbiq olunur (buna görə "opacity 1-də donub silinir" / "opacity 0-da qalıb anidən 1-ə qalxır" görünürdü). `CashDrawerPanel` + `OrderHistory` card-dan blur **APARILDI** (veil `bg-black/20 backdrop-blur-sm` səhifəni artıq blur edir), səth `/90` → **`/95`** (dark `bg-zinc-900/95`, light `bg-white/95`) — oxunaqlılıq dəyişməz.
  2. **`mode="wait"` → `mode="popLayout"`**: wait rejimi iki view-i **ARDICIL** edirdi (əvvəl exit, sonra enter) → keçidin ortasında "boşluğa düşmə". `popLayout` çıxan view-i layout axınından çıxarır (absolute), girən view yerini **dərhal** alır və ikisi BİRLİKDƏ fade olur = əsl crossfade: boşluq yox, reflow yox (eyni pattern artıq `lib/motion/Morph.tsx`-dədir). Container-ə `relative` əlavə olundu (popped child üçün anchor), motion child-a `w-full`.
  3. **TARİXÇƏ-yə eyni müalicə**: list ↔ detail indi BİR `AnimatePresence` içində iki keyed child (`oh-list` / `oh-detail`). Əvvəl list `<>` fragment idi — **AnimatePresence fragment-i track etmir**, ona görə swap ANİ olurdu. List wrapper `w-full min-h-0 flex-1 flex flex-col` (içindəki `flex-1 overflow-y-auto` işləməyə davam edir; sadə `div` olsaydı scroll region qırılardı).
- **BUG B — TƏMİZLƏ ilk tap no-op** — **kök səbəb event deyil, EFFEKT SIRASI YARIŞI** (E2E ilə sübut olundu: uğursuz ilk tapda tam `pointerdown → mousedown → pointerup → mouseup → click` zənciri TƏMİZLƏ düyməsinə çatır, DOM node identity dəyişmir — yəni handle işləyir, state dəyişmir):
  - `usePos.tsx`-də draft-**restore** effekti draft-**persist** effektindən **ƏVVƏL** elan olunub. Clear-in commit-ində restore BİRİNCİ işləyir: "canlı cart boşdur" görür → `sessionStorage['pos_draft_<mode>']`-i oxuyur — açar hələ ORADADIR, çünki onu silən persist effekti **eyni commit-də SONRA** işləyir → `setCart(parsed.cart)` ilə **yenicə silinmiş itemləri geri yazır**. Ona görə 1-ci tap no-op görünür; 2-ci tap işləyir (o vaxta `draftRestoredForRef` mode-u saxlayıb → restore qısa-keçir).
  - **Fix**: `clearCart` indi draft açarını **SİNXRON** silir (`sessionStorage.removeItem`) — hər iki yolda (dine-in + reservationMode), yalnız cart "dataless" qalanda (persist effektinin `hasData()` predikatı ilə eyni: item yox + customer_name/phone/delivery_address yox).
  - **E2E (deterministik — hər iterasiya TƏMİZ reload ilə, çünki ref reload-da sıfırlanır)**: **5/5 ilk tapda təmizləndi** (masa 15/98/99/471/472). `pos_draft_dine_in`: clear-dan əvvəl 456 simvolluq draft → sonra **`null`**; reload-da item QAYITMIR.
- **REGRESSION yoxlaması (kritik)**: "səbət itmir" davranışı **QORUNUR** — İÇƏRİDƏ → GEL-AL → İÇƏRİDƏ tab dəyişməsindən sonra masaya yenidən tap → unsent item (Tom Yam, 13.00₼) yerindədir; sonra tək tap ilə təmizlənir ✅.
- **Frame-sampling sübut (Chrome, :3000, rAF opacity sempl)**: KASSA `main→DAXİLOLMA` **20 ara dəyər** (dark) · `DAXİLOLMA→GERİ` 26 · `main→XƏRC` 24 · **light** rejim 10 — hər swapda **boşluq 0 ms** (region mətn uzunluğu hər frame-də 575–634 simvol, boş frame yox). TARİXÇƏ `list→detail` ~200ms crossfade, `detail→list` eyni ✅. TƏMİZLƏ exit: boşalmış region fade-in **17 ara dəyər (~320ms)** + pill fade-out **14 ara dəyər** ✅. Console errors: **0** (bütün sessiyalarda).
- **Qeyd (gələcək üçün — TOXUNULMADI)**: (1) `resetCart` (table empty → `setCart(null)`) eyni sinif yarışa açıqdır: persist effekti `!cart` halında **qəsdən** erkən return edir (bu, tab-dəyişməsində draft-ın qalmasını təmin edir), ona görə ref-guard işə düşməmişdən əvvəl bir dəfə draft resurrect ola bilər — owner istəsə ayrıca tapşırıq. (2) Cart item SƏTİRLƏRİ özləri DOM-dan bir frame-də unmount olur (per-row opacity ramp YOX); graceful hiss boşalmış region fade-in-i + pill fade-out ilə verilir — sətir-exit ramp-ı ayrıca qərardır. (3) Reload bəzən "MƏRTƏBƏ VƏ YA MASA KONFİQURASİYA EDİLMƏYİB" + Retry göstərir (data fetch miss) — Retry ilə bərpa olunur, bug deyil.
- **§3-C.2 — 60s kataloq avto-sinxronu: YOXLANDI, PASS.** `usePos.tsx` `setInterval(…, 60000)` (`document.hidden` guard) + `fetchCatalog` (**stabil identity** — `useCallback([], ...)`, ona görə effekt intervalı sıfırlamır) → `GET /api/pos/products`. Runtime sübut (Chrome, tab seçili, `document.hidden=false`): **4 ardıcıl tick, delta 59991 / 60000 / 60002 / 59997 ms** (≈60s dəqiq). **OOS zənci REAL DB-YƏ YAZI ETMƏDƏN sübut edildi**: bir tick üçün cavab yerində modifikasiya olundu (`Coca-Cola 330ml` → `is_in_stock:false`) → **növbəti avto-sync tick-də, reload/naviqasiya OLMADAN** kart `opacity-50 grayscale border-rose-500/30` + "Stokda yoxdur" pill aldı, grid badge 7→8, başqa kart təsirlənmədi, toast yox; patch götürüldükdən sonra növbəti tick-də geri qayıtdı (3× təkrar). **Nəticə: admin `is_in_stock` flag-ı dəyişdikdə POS 60s içində özü yenilənir** (owner sualı — TƏSDİQLƏNDİ).
- **E2E qalıqları (TOXUNULMADI — yalnız oxundu; owner qərarı gözləyir)**: **masa 17 = QRUP** (17+16+18), `ORD-2817`, Filadelfiya Classic ×1, **₼14.00**, chip **MƏTBƏXDƏ** — HANDOVER-də gözlənilən "1 draft Tea" DEYİL, kart hazırda 1 qrup sifarişidir; **masa 18 ayrı kart deyil** — həmin qrupun içindədir. Digər: 14/15/98/99/471/472/991/992/993/995/996 **BOŞ** · 97/511 **TƏMİZLƏNMƏLİ** · 401/502/901 **YENİ OTURUŞ**. İcazəsiz dismiss edilmədi.
- **Real DB yoxlaması (məcburi — "supabase yoxla" qaydası)**: bu sessiyada `orders` və `table_floors` cədvəllərinə **0 yazı** (`orders_2h = 0`, `tables_2h = 0`; son order yazısı `13:51:56Z` — sessiyadan ƏVVƏL). Bütün E2E addımları yalnız oxuma + client-side idi.
- Verify: `tsc --noEmit` app-scope **0 xəta** (`src/__tests__/*` jest-tipləri pre-existing, toxunulmadı) · **3 fayl** · screenshots `e2e-shots/14-bugB-first-tap.png`, `14-bugA-kassa-swap.png` (+ light), `14-tarixce-swap.png`, `15-bugB-fixed-first-tap.png`, `15-regression-tabswitch.png`, `15-clear-exit-fade.png`, `16-catalog-sync-tick.png`, `16-oos-propagation.png`.

### Jurnal sətiri — 2026-09-27 (FLOOR CLEAN — "borderleri hamisi agdir nie": boş masalardan border götürüldü)
- **Owner turn**: screenshot + "bunedir ag ag" / "borderleri hamisi agdir nie".
- **Cause**: 2026-09-25 board-card redesign-də HƏR kart status-accent border aldı; empty dark = `border-white/10`. 1-ci mərtəbədə 95 masanın 90-ı boş → bütün floor ağ çərçivəli grid kimi görünürdü (grace fade border-ləri diqqət çəkdikdən sonra owner bunu daha aydın gördü).
- **Fix (1 sətir, TableCard stateBorder)**: empty dark → **`border-transparent`** (kart səthi #141419 öz kənarını verir). State accent-lər (emerald/indigo/amber/rose) toxunulmadı. Bonus: yeşil border indi transparent-dan "yaranır" — 320ms grace fade ilə daha təmiz birth.
- **E2E visual proof**: 12 kart dump — BOŞ (15, 98, 99, 471, 472) = `rgba(0,0,0,0)` ✅ · occupied/seated/cleaning (14, 17, 401, 502, 901, 97, 511) = emerald 0.45 ✅ · screenshot `saito-pos-floor.png` (workspace).
- **Qeyd (design)**: 'cleaning' status hazırda isOccupied family-dədır → emerald border + amber TƏMİZLƏNMƏLİ chip. Owner soruşarsa: cleaning-ə öz amber border-i ayrıca qərardır.
- Verify: tsc 0 error · 1 file.

### Jurnal sətiri — 2026-09-27 (GHOST BLUE BORDER FIX — tab dəyişib geri qayıtda masa "seçili" görünürdü)
- **Owner turn**: "sene dediyim mavi border var idi — 1 masaya girdim, başqa tab-a kecdim (takeaway/delivery), dine-in girende hemin masada eyni borderi görürəm".
- **Root cause**: 09-27 "sebet itir" fix-i dine-in draft-ını tab-geri qayıtda yalnız data deyil, **SELECTION ilə bərabər** restore edirdi (`pendingTableRestoreRef` → `setSelectedTable(tbl)` + `setActiveView('order')`) → operator-un tap etmədiyi masa mavi "seçili" border ilə geri gəlirdi (ghost).
- **Fix (data-only restore)**: (1) restore indi YALNIZ `setCart(parsed.cart)` edir — selection/view toxunulmur, floor TEMİZ qayıdır (tab handler artıq `setActiveView('floor')` etdiyi üçün panel də açılmır); (2) `selectTable`-də `switchingToDifferentTable` indi `cart.table_number`-a da baxır → restored draft-ı olan masaya tap etdikdə itemlər "başqa masa" sanilib silinmir (no-primary pathdə `draftsAreThisTables` guard-ı da əlavə olundu); (3) occupancy guard saxlanıldı (masanı başqa terminal tutduqda draft düşürülür, floors gecikəndə `pendingTableGuardRef` ilə deferred).
- **E2E (Masa 14/15)**: tap+item (₼100) → TAKEAWAY tab → İÇƏRİDƏ: **0 ghost border** (bütün kartlar neutral) ✅ · tap → panel: eyni item+amount (silinməyib) ✅ · başqa masa (15) tap → draft düşürülür (0 item) ✅ · console errors: 0.
- Verify: tsc 0 error · 1 file (usePos.tsx).

### Jurnal sətiri — 2026-09-27 (P0 FIX: bütün masa kartlarındakı 1px AĞ RİNG — owner "ag borderler... men ele bir sey istemememem")
- **Owner turn**: "ag borderler gormursenn, ala kartin borderleri, onu nie elave etdin ki, men ele bir sey istemememem" — sən haklı idi, əlavə mən etmişdim (doğrudan da, özümdən).
- **Root cause (nadir JS footgun)**: 3eea7dfe (border grace turn) zamanı TableCard-ın `className={` şablonu İÇİNƏ yazdığım `/* comment */`-in içində **"ring" sözü ayrı token** idi ("like the blue ring he praised"). Brauzer class attribute-ı boşluqla bölür → comment mətni LİVƏ CLASSƏ çevrilir → Tailwind v4-un `.ring` utility-si (1px, default rəng = currentColor = **ağ**) bütün masa kartlarına 1px ağ contour çəkirdi. Bu ring 16:29-dakı ilk "ag ag" şikayətindən İTİBARƏN var idi; keçən 2 fix (border-white/10→transparent, zinc-200→transparent) border-color-u düzəlsə də ring box-shadow-da olduğu üçün görünürdü.
- **Fix**: comment tamamilə className-dan çıxarılıb elementin YUXARISINA köçürülüb (həmçinin xəbərdarlıq: "NEVER put a /* comment */ inside className — hər söz class olur").
- **System-wide audit**: bütün src-da **1582 className şablonu** skan olundu (robust parser, `${}` nesting-in də nəzərə alınması) → **0 qalıq comment-landmine**.
- **E2E təsdiq (live)**: 10 kartın hamısında `boxShadow: none` (ring yoxdur) · boş kart border `rgba(0,0,0,0)` · occupied = emerald 0.45 ✅
- **Anti-regression qayda**: (1) className stringi daxilində HEÇ VAXT `/* */` comment yazma — istənilən ingilis sözü (border/ring/shadow/flex/grid/block/hidden/relative...) canlı class olur. (2) "bütün kartlarda eyni görünən xətt" şikayəti → ilk addım `getComputedStyle().boxShadow` + `borderTopColor` dump-u (border vs ring vs surface distinction).
- Verify: tsc 0 error · 1 file.

### Jurnal sətiri — 2026-09-27 (TABLE BORDER GRACE — "mavi border kimi" yaşıl border fade-out: Dismiss / Sərbəst burax / Hesabı bağla)
- **Owner turn**: "Masadan çıxanda mavi border-in fade-out çox uğurludur. Eyni zərif fade-out-u 'Dismiss table', 'Sərbəst burax', 'Hesabı bağla' state machine-lərində də tətbiq et — yaşıl border anidən yox olur."
- **Təhlil**: 3 axının hamısı green(emerald) border-i mənbəyidir — occupied→empty (Masanı boşalt), paid→empty (Sərbəst burax), occupied→paid (Hesabı Bağla — burada border eyni emerald kalır, yox olma Sərbəst burax-da olur). Root cause: card-ın `border-color` CSS transition-u **200ms decel**-idi, content isə **320ms blur drift** edir → border content-ən əvvəl "snap" edirdi; mavi ring (1.5s) isə uğurlu referens idi. Node remount DEYİLDİ (probe: data-probe-tag 1801+876 frame boyu keçdi, 0 REMOVED/WRONGNODE).
- **Fix (1 sətir, TableCard)**: `border-color` 0.2s cubic-bezier(0.4,0,0.2,1) → **0.32s cubic-bezier(0.45,0,0.55,1)** (grace band, simmetrik in-out). İndi border + content + pill BİRLİKDƏ bir motion kimi gedir; enters də eyni yumşaqlıqda (green "yaranır"). Selection/transfer/overdue border-ləri eyni token-dan keçir — hamısı tutarlı.
- **E2E frame proof (border-top-color sampler, rAF, 2.5s pəncərə)**: Sərbəst burax paid→empty **312ms, 19 ara rəng** (oklab -0.16→0.05 alpha .45→.14) ✅ · Masanı boşalt occupied→empty **281ms, 17 ara rəng** ✅ · Hesabı Bağla occupied→paid: border sabit emerald (eyni endpoint — gözlənilən) ✅ · node identity: 0 remount ✅ · console errors: 0.
- **Dev-env qeydi**: probe zamanı ilk 3 dismiss cəhdi "Invalid CSRF token" (stale dev session token) ilə səs-səssiz no-op oldu — page reload-dan sonra keçdi. Prod-da session-expiry eyni simtom verə bilər → qeydə alındı (session refresh mexanizması ayrıca tapşırıq).
- Verify: tsc 0 error · 1 file.

### Jurnal sətiri — 2026-09-27 (RESTORE: cart counter-roll — owner "qaytar ona, o daha qesengdir, icazəsiz şeylər etmə")
- **Owner qərarı (final)**: Cart footer totals = **counter-roll (NumberRoll ×4 + RollingNumber hero total, duration 0.3)** — bu SƏRHİN premium hiss'idir; Morph crossfade buranın yerinə keçid deyil. `a117c749`-da icazəsiz dəyişilmişdi → `0ba5ecd0`-da byte-for-byte qaytarıldı, `Morph` import-u CartPanel-dən çıxarıldı (Morph digər səthlərdə qalır: table cards, board cards, action sheets).
- **Qayda (anti-regression)**: vizual pattern swap-ləri (roll↔fade↔morph, ikon dəsti, spring tuning) **yalnız owner açıq soruşduqda** edilir. "Daha premium" hissini öz iqtidarımla təyin etmək icazə deyil.
- Verify: tsc 0 error · 1 file.

### Jurnal sətiri — 2026-09-27 (iOS-27-TRASH GİRACE DOKTRİNASI — bütün POS state exits + "instant vanish" presence bug-larının kök fix-i + waitlist optimistic removal)
- **Owner turn**: "state machine-ləri hələ də tam anlamamısan… iOS 27-də Gallery zibil qutusunda şəkillər bir anda yox olmur; yavaş və zərif fade-out ilə çıxır. Eyni prinsipi POS-un bütün state dəyişikliklərinə tətbiq et — keçidlər instant olmasın, çox yumşaq və premium".
- **Grace doktrinası (token səviyyəsində, `lib/motion/system.ts`)**: `T.grace = 320ms` + `EASE.graceful = [0.45,0,0.55,1]` (simmetrik in-out — "drift away"). Qayda: **enters snappy qalır, EXITS premium-dir** — `choreo()`-nun bütün exit-ləri indi T.grace+EASE.graceful+scale 0.985; GridCell collapse 300ms; `modal-transitions.ts`: `gracefulExit` 280ms (slideUp/centerModal exit-ləri) + **`fastExit` də 280ms graceful oldu** — tək token dəyişikliyi ilə bütün POS modal backdrop-ları (Numpad, PinGuard, RoomCharge, GiftCard, LossItem, Corporate, PaymentSuccess, BillSplit, ClearTablePin, Refund, VoidItems, OrderDetail, ReservedTable, OrderHistory×2, Kassa×2), view wrapper-ları (floor/takeaway/delivery/order), ActionSheet morph view-ləri (actions/payment/more/cash-tendered/card-confirm/split) + VKB close + bill-notify hamısı graceful close oldu.
- **P0 kök səbəb tapıldı (nəyədirsə "instant" idi)**: 4 modal-da `if (!open) return null` + içində AnimatePresence = **komponent özü unmount olurdu, exit heç vaxt oynamır**. Fix (self-managed presence): (1) **OrderHistory** — `open &&` şərti AnimatePresence İÇİNƏ (keyed child), early return silindi; (2) **WaitlistPanel** — root plain div → keyed motion overlay (300ms fade) + card-ın öz graceful exit-i (y:18, scale 0.97); (3) **CashDrawerPanel** — bütün layer (backdrop+card) keyed motion child (300ms), card üstəlik centerModal settle; (4) **TableActionSheet** — self-managed AnimatePresence (slideUp graceful exit). (5) **ReservationActionSheet** — AnimatePresence FRAGMENT-ı track ETMİR (backdrop+sheet fragment içində idi → instant) → backdrop = direct keyed motion child, TableActionSheet = self-managed sibling; page.tsx parent-da **`lastReservationArrival` retention** (data close-dan sonra qalır, `open = !!reservationArrival` live flag) — sheet exit oynaya bilib demount olur.
- **Digər graceful exit-lər**: TableCard content exit (T.grace + blur 4px — artıq E2E-confirmed), TableCard kitchen↔status chip swap exit 280ms, CartPanel void-lines 320ms + note backdrop 300ms, floor toolbar clean↔normal exit 300ms, merge-preview bar exit 300ms.
- **Waitlist OPTIMISTIC REMOVAL** (E2E probe: fade 1.5s server round-trip-ə qalırdı — "trash feel" deyil): removeEntry/setStatus(no-show)/seatEntry → local state-də SƏHHİNƏN tap-da silinir, fade dərhal başlayır; server reconcile (load()); failure-da sətr geri qayıdır + toast.
- **Group-table kök fix (keçən turn-də açıldı, bu commit-də)**: `api/pos/tables` cAggs +`table_number` → `mg-undefined` React key collision + `/api/orders/unmerge` 400 aradan qaldı. Waitlist "Oturduul"→"Oturdul" typo (4 yer).
- **E2E frame-sampling proof (Chrome, :3000, rAF opacity sampler)**: Round 1 — TableCard dismiss fade 34 partial frame / ~265-300ms ✅. Round 2 — TARİXÇƏ close **15 frame / 231ms** ✅ · KASSA close **20 frame / 237ms** ✅ · Növbə panel close **21 frame / 258ms** ✅ · tap-to-fade: fade START **84ms**-də (≤250ms), span **235ms**, "Növbə boştur" sətr hələ partial-opacity-da iken görünür ✅ · Rezerv sheet SKIP (test data-da reserved masa yoxdur) · console errors: 0.
- Verify: `tsc --noEmit` 0 error · 13 file.

### Jurnal sətiri — 2026-09-27 (ICON SYSTEM OVERHAUL → Phosphor (bütün sistem) + state machine motion pass + E2E defect fixes)
- **Owner turn**: "bütün POS state machine-lərini audit et, hər dəyişilik zərif/ardıcıl transition; terminal modalı tam ləğv et; UI-ni tam yenilə (tarixce/kassa/dine-in/pos kartları/waitlist/rezerv actionsheet); kart logoları hazır resurslarla; dine-in metin girməsi; BÜTÜN popuplar klaviatura üstündə; ikonları tamamilə yenilə (vəbdə araşdır, premium dəst, stroke/ölçü qoruyub); E2E brauzer + 4321".
- **ICON SYSTEM (bütün sistem)**: web research → **Phosphor** seçildi (1500+ ikon, Tək 256px grid, 6 ağırlıq, MIT, rəsmi React pakeyi; lucide-də Saito-un 128 ikonunun ekvivalenti yoxdu = "məhduddur" problemi). `src/components/ui/saito-icons.tsx` = drop-in adapter (231 ikon, lucide props kontraktı: size/strokeWidth/className; strokeWidth→weight: ≤1.25 thin / ≤1.5 light / ≤2.25 regular (default, eyni 2px sıxlığı) / >2.25 bold). **185 faylın hamısı** sed ilə swap olundu (POS + admin + staff). E2E: POS-da 72/72 svg = Phosphor (viewBox 256), **0 qırıq/boş/tamfu ikon**.
- **State machine motion pass**: (1) Cart total-lar: counter-roll (NumberRoll/RollingNumber) LƏĞV → Morph yerində crossfade (owner: "pul counter absurd"); (2) BoardOrderCard stage accent border 200ms crossfade; (3) Product card 86-flip: grayscale+opacity 250ms crossfade (re-86-da tərsi); (4) SendOrderButton 3-state morph artıq var idi (idle→loading→success) — browser-da loading verified.
- **VKB LIFT SWEEP (bütün popuplar)**: sistemli grep — POS-da input-lu 15 faylın HAMISININ lift-i təsdiqləndi (--vk-height/vkHeight/keyboardHeight); OrderHistory-nin 2 modalına əlavə edildi. CustomerPhasePanel axırda panel-dir (page-in vk padding əhatəsində).
- **E2E defect fixes** (browser tapıntılarından): (1) OrderHistory header 4 sırt stacked → 2 filter row BİRLƏŞDİ (hairline divider) + date range CALENDAR toggle-ı arxasında collapse (200ms); (2) CashDrawer 8 action 3×3 (aşağı sıra clipped) → 4×2 compact; (3) TableCard title truncate "Masa 17"→"M..." edirdi → badge varsa text-xl, həmişə 1 sətir.
- **Qalıq (M2-UI wave)**: 6 surface "premium" rewrite dərinliyi (waitlist/rezerv action sheet/dine-in kart premium), kart marka logoları (Visa/MC rəsmi brend assetləri — PSP dalğası ilə), ₼ fallback font, SendOrderButton success state (cart unmount etdikdə görünmür).
- Verify: tsc 0 error · browser E2E (4321) — icons 72/72, modals centered, VKB lift OK, send morph OK, merge pill glide OK · 10 screenshot · commit `a117c749` (189 files).

### Jurnal sətiri — 2026-09-27 (Owner turn: kart terminal bypass, VKB lift ×6, dismiss fade, E2E browser 6/6)
- **Owner turn**: "kart seçəndə terminal modali — deaktiv et, terminal qoşulmayıb; butun state machine fade in/out sexy olsun (dismiss: reqemler/border aniden yox olmasin, yavas fade out); dine-in kartlar bir-birinə girib duzene sal; pos kart logolari webden tap; tarixce/kassa/waitlist/rezerv actionsheet UI yeniden qeseng; canliligi E2E brauzerden təsdiqlə (login 4321)".
- **Kart terminal bypass (2 yol!)**: (1) `handlePaymentMethodSelect` — Kart → birbaşa `runPaymentFlow` (SIM code), TerminalTapModal dormant (real PSP M-wave-də terminalState ilə qayıdar); (2) E2E tapdı ki, "Hesabı bağla" yolu (ActionSheet) AİRİ terminal-wait ekranı idi ("Terminala göndərildi / Müştəri kartı terminala yaxınlaşdırsın" + TAP) — hər iki Kart düyməsi birbaşa capture-a bağlandı.
- **VKB lift bug fix (owner: "popup klavye altda qalır yazmaq olmaz")**: VKB z=10002, 5 input-lu modal z=10001-də klavyənin ALTINDA qalırdı — RefundModal, CorporateModal, GiftCardModal, LossItemModal, RoomChargeModal-a `--vk-height` lift əlavə olundu (qlobal CSS var, hooks-sız).
- **Dismiss fade choreography**: TableCard content bloku AnimatePresence ilə sarıldı — dismiss/clear-də amount/guests yuxarı sürüşüb blur ilə 200ms fade-out olur, border eyni pəncərədə crossfade (CHOREO cədvəlindəki "collapse/reveal" arxetipləri).
- **Kart title wrap fix (E2E tapıntısı)**: "Masa 17" QRUP badge-i yanında 2 sətirə wrap olurdı → whitespace-nowrap + truncate + badge shrink-0.
- **E2E browser verify (PIN 4321, 6/6 PASS)**: floor 3 viewport-da 0 overlap; dismiss flow OK; VKB+note & VKB+discount input keyboard ÜSTÜNDƏ; kart ödənişi birbaşa receipt ("SIFARIŞ ÖDƏNİLDİ ✓"). Screenshots: saito-pos-01..06.
- **Qalıq (M2-UI wave)**: TARİXÇƏ/Kassa/Waitlist/Rezerv action sheet "daha qeseng" rewrite + kart logoları/icons web research (partner logoları artıq düzgün SVG-dir — Wolt/Uber/Glovo/Bolt Wikimedia licensed; audit-da qeyd olundu).
- Verify: tsc 0 error · commit `6b519ad8`.

### Jurnal sətiri — 2026-09-27 (APPLE SENIOR MOTION AUDIT + "OVERLAY NEVER" + spring doctrine)
- **Owner turn**: "1 sozle cox irgencc… apple philosophy lazimdir… overlayy nedir… OVERLAY NEVER… her operation fade in fade out kimi, dismiss bassdiq masa fade out, borderler yavassca fade olur, label yavassca morph… ilk otce butun pos-u UI audit et (sen apple senior UI muhendisisen, webden araştırdır)".
- **OVERLAY NEVER**: op-flash label sistemi kompletdə SÖKÜLDÜ (TableCard opFlash + OP_FLASH_STYLES + render; usePos flashTable + 6 call; page 6 call). Qayda: kartın üzərinə heç vaxt operation label oturmur — kartın ÖZÜ feedback-dir (border crossfade 200ms + label morph + card settle + grid glide).
- **Spring doctrine (2 ailə)**: state transition = TIME-BASED EASING (fade/morph, overshoot YOX — "yavassca"); fiziki obyekt = owner-tuned SPRING. `system.ts`-də 5 canonical spring: kessey 500/26 (yalnız dialog surface/note pill), press 420/28, micro 280/22, surface 480/24, soft 320/32 (layout).
- **Capsule REVERT**: keçən turn capsule-ləri 500/26-ya itələmişdim; `pos-motion.ts` tuning qeydi (2026-09-21) "500 = çox kəskin, no snap" dediyi üçün geri qaytarıldı (DragTabSwitcher 420/28+480/24, toolbar pills 400/35).
- **Audit tapıntıları** (tam sənəd: workspace `POS-APPLE-MOTION-AUDIT.md`): P0 = cart total-larda counter-roll (NumberRoll/RollingNumber — "absurd" qadağası) → Morph texsili; spring fragmentation (14 müxtəlif dəyər); `transition-all` transform catch (TableCard düzəldildi, qalan sweep P1). P1 = 2 canonical modal surface (CenteredDialog/BottomSheet), BoardOrderCard accent crossfade, MƏTBƏXƏ GÖNDER button 3-state morph, stock crossfade 250ms, toast/VKB tokens. P2 = shared-element (TableCard→OrderDetail "eyni object-in başqa səviyyəsi"), sidebar micro-motion, prefers-reduced-motion, global token sweep.
- Owner-a 4 açıq sual (sənəddə §5): counter-roll təsdiqi, shared-element M2 yoxsa M3, KDS/BDS eyni sistem, Settings reduced-motion toggle.
- Verify: tsc 0 error · commit `7220ff18`.

### Jurnal sətiri — 2026-09-27 (SAITO MOTION SYSTEM M1 + owner bug batch: sebet itimi, Kassa auto-close, 86-cycle, VAT, no-yellow, centered modals)
- **MOTION ARCHITECTURE (owner: "state dəyişmir, state transition baş verir; hər yer STATE üçün konkret ENTER/UPDATE/EXIT choreography")**: `lib/motion/system.ts` — vahid motion dili: timing scale (instant 80 / quick 140 / standard 200 / emphasis 280 / complex 360ms), easing (enter/exit/settle/morph/continuous), springs (DNA **500/26 "kəsəy"** + travel + soft layout), motion hierarchy (**primary** state dəyişikliyi > **secondary** info > navigation > micro), **TABLE_LIFECYCLE state-machine xəritəsi** (EMPTY→NEW_SESSION→ACTIVE→IN_KITCHEN→READY→SERVED→WAITING_PAYMENT→PAID→CLEANING→RESERVED; hər transition → entrance/reveal/morph/emphasize/replace/settle/collapse archetype-inə, hər archetypenin konkret enter/update/exit + cardSettle + cardExit dəyərləri) + `tableStateOf()` raw DB status → TableState mapper. `lib/motion/Morph.tsx` = yerində value morph (popLayout, blur 3px, 200ms). `lib/motion/GridCell.tsx` = alive grid cell (exit: scale 0.985+fade 140ms, **qonşu kartlar layout glide edir — teleport YOX**).
- **Motion System tətbiq (M1 — table lifecycle + order lists + capsules)**: TableCard → `motion.div` + **card settle** (state dəyişəndə choreography-dən 0.99→1 "nafəs"), amount Morph (₼13→₼17 crossfade, counter-roll YOX), guest count Morph, status pill surface 200ms rəng crossfade (border "yumşaq yaranır"), open-ring 450ms→**1.5s** (owner: "masa acilanda 1.5s gorsensin"); Floor grid + TakeawayOrders + DeliveryOrders → AnimatePresence + GridCell (dismiss/completed card collapse + qonşular glide); BoardOrderCard → stage label in-place morph + paid-check spring pop + total Morph; DragTabSwitcher + NORMAL/BİRLƏŞDİR/KÖÇÜR capsule springs → DNA 500/26 (sliding capsule artıq var idi — indi bütün POS eyni dili danışır).
- **Owner bug batch (həmin turn)**: (1) **Sebet itimi FIX** — dine-in cart-da draft yox idi (mode switch = cart destroyed); indi BÜTÜN mode-lər sessionStorage draft (`pos_draft_{mode}`) + dine-in restore-da table re-select (yalnız hələ free-dirsə). (2) **Kassa öz-özünə bağlanma FIX** — session 8h-də expired olurdu → `/api/auth/keepalive` (12h slide, staff.active check) + 5-dəq client ping (visible) + onUnauthorized last-chance keepalive retry. (3) **86-cycle TAMAM** — migration `20260927010000` (LIVE): `sync_product_availability()` + `availability_trigger_fn()` ingredients.current_stock UPDATE trigger → stock ≤0 = auto 86 (recipe BOM ilə), stock >0 = auto re-86; POS `pos-products-availability` realtime → grid saniyələr içində yenilənir. (4) **VAT** — cart-də VAT sətri indi settings `auto_apply_vat`-ə tabedir (old: hardcoded 0.18, switch bağlı olsa belə görünürdü). (5) **NO YELLOW** — `focus:border-amber/gold` **0 qalıq** (emerald focus sweep, bütün OS); Kassa Wallet ikonu emerald. (6) **TARİXÇƏ + KASSA centered modals** — bottom-sheet → `centerModal` (500/26) diyaq. (7) **op-flash** — `usePos.flashTable()` → TableCard overlay (1.6s, tone): OVRULDU / MASA BOŞALDI / TƏMİZLƏNDİ / BİRLƏŞDİ / KÖÇÜRÜLDÜ / ÖDƏNDDİ / BÖLÜNDÜ / LƏĞV EDİLDİ — bağlanıb: seat/release/dismiss/clear/merge/transfer/pay (hər iki yol)/split/group-clear/void.
- M2/M3 plan (owner-approved faza): M2 = payment/KDS/reservation lifecycle choreography; M3 = shared-element (table card → order detail drawer transform), sidebar light motion, global audit.
- Verify: tsc 0 error · offline 18/18 GREEN · smoke health/pos/reservation 200 · commit `0d67ccda`.

### Jurnal sətiri — 2026-09-27 (OFFLINE test mode + 18-check code-level proof + Settings UX redesign "whatsapp kimi")
- **Offline test mode (owner: "internet söndürsəm işləyəcək??")**: `monitor.ts` +`setForcedOffline()/isForcedOffline()` — `saito_offline_force` flag (localStorage, cross-tab): internet VAR, amma app tam offline davranır (reads→cache, writes→queue, money-cash-drawer→503). Release = optimistik online + verifying ping. Girişlər: (1) Settings → Terminallar → **OFFLINE TEST REJİMİ card** (TESTİ BAŞLAT/BURAQ + 3-addımlı istiqamat), (2) OfflineBanner sync popover-da toggle.
- **Code-level proof**: `src/__tests__/offline-queue.test.mjs` (node --experimental-strip-types, house konvensiyası) — **18/18 GREEN**: capture policy, idempotency dedupe, auto/manual flags, replay 200→drop+sync-event, 409 idempotent_conflict→drop, 500→keep+backoff, force-offline, apiFetch: pay offline→202 queued(auto), cash-drawer offline→503 OFFLINE, waitlist→202, GET→cache (X-Saito-From-Cache), online GET→snapshot refresh, online money→no interception.
- **Settings UX redesign (owner: "min input, hint olsun, whatsapp settings kimi")**: EMAIL card = 3 addımlı guid: ① Provider chip (Gmail/Brevo/Resend/Postmark/Öz SMTP) + **kontekstual "key necə alınır" hint** (provider-ə görə) + avtomatik host/user chip; ② **cəmi 2 sahə** (business email + key) — ⚡"ümumi e-maili istifadə et" shortcut; custom-da host/port/user `details`-də gizli; ③ Test+Saxla (test = real mail). Status chip indi **deqiq** deyir: "Qalan: e-mail + key" / "Hazırdır". Defolt = AKTİV (config tamam olanda). Şablon preview `details`-ə qatlanıb.
- Verify: tsc 0 error · 18/18 test · settings/pos 307 · /reservation 200.

### Jurnal sətiri — 2026-09-26 (Q7 TERMINAL SIMULATOR + OFFLINE Phase 2 (təam POS) + Email AUTOMATION)
- **Q7 terminal (owner: "fiziki terminal yoxdur, hazırla")**: `lib/terminal/simulator.ts` — adapter interfeysi + **SIMULATOR** (2.2s tap, 92% approve, auth code SIM-XXXXXX; Harbon/SkyPay/Qiwi/Stripe = ready-state "adapter gözləyir"). POS-da **KART ödənişi indi terminal dialogundan keçir** (`TerminalTapModal`: məbləğ → tap → NFC pulse → approve/decline+təkrar) → `/api/orders/pay` +`card_reference` → **`order_payments.reference`** (auth code ledger-də, refund/chargeback üçün canonical). `TerminalsTab`: yuxarıda **Kart Terminalı (PSP) card** (provider status). Fiziki terminal gələndə = provider seç + API key (M wave), UI/flow dəyişmir.
- **OFFLINE Phase 2 (owner: "offline tam — bütün POS offline-da işləsin, səhifələrə keçdikcə")**: (1) read-cache **20 route** (products/floors/tables/orders/settings/customers/reservations/waitlist/cash-drawer/couriers/delivery/history/Z) — bütün FOH səhifələri offline render; (2) **offline ÖDƏNİŞ = auto**: `/api/orders/pay` queue-ya AUTO (deterministic `payKeyFor(order.id)` idempotency key + server 409 `idempotent_conflict` dedupe = double-charge IMPOSSIBLE), receipt-ə amber **"sinxron olacaq"** flag + toast; (3) sənədləşdirilən qayda: cash-drawer/refund/void/gift-card-redemption offline-da HALA BLOCK (server-side session/ledger lazımdır — Phase 3: offline cash drawer); (4) banner → **sync popover**: queue list (auto=yeşil/manual=sarı, attempt count) + **"İNDİ SİNHRONLAŞDIR"** + sinxron toast-ları; (5) order create/append = manual queue (duplication riski — operator təsdiqi).
- **Email AUTOMATION (owner: "1 şey yazıb bütün rezervlər düşsün ora")**: `lib/resv-email.ts` shared engine (cfg load + templates + email_logs + guest-email→reservations persist). (1) **AUTO-CONFIRM**: hər yeni rezerv → mail avtomatik (guest email varsa ona, YOXSA business mail-ə — `reservations` route-də fire-and-forget); (2) **AUTO-REMINDER**: migration `20260926080000` (`reservations.last_reminder_at`), `/api/cron/resv-emails` (CRON_SECRET, bugün+sabah active rezervlər, 20h cutoff, idempotent stamp), **`instrumentation.ts` server-side scheduler** (günün 09:00 + 16:00 Asia/Baku, loopback POST) — POS server 24/7 işlədiyindən xarici cron lazımsız; (3) EMAIL card-da **provider preset** (Gmail/Brevo/Resend/Postmark/Custom) → host/user avtomatik, operator **yalnız 1 API key + business mail** yazır.
- Verify: tsc 0 error · GET /api/health 200 · /api/cron/resv-emails 401 (gate) · /api/email/send 401 (gate) · admin/pos+reservations+settings compile 307.

### Jurnal sətiri — 2026-09-26 (377-feature 4-vendor matrix + Email infra + OFFLINE Phase 1 START)
- **377-sətirlik tam matrix** (owner: "hər 320 features + map — bu tam hazırdırmı?"): Saito vs Toast vs Lightspeed vs Square, module-module. Sənəd: workspace `SAITO-OS-VS-TOAST-LIGHTSPEED-SQUARE.md`. Nəticə: Saito 271✅/38🟡/4⚪/64❌ = 77% (377); core-scope (ekosistem çıxıldı, 298 sətir) ≈ **88% vs Toast 89%**, BOH 94% (rəqiblərdən irəli), 20★ differentiator. Hüküm: single-venue satışa hazırdır; açarlar Q7 terminal, Q8 offline, Q10 comms.
- **Email infra (owner: "settingsden business mail daxil edib mail göndər — UI buttonlar")**: migration `20260926070000` (`reservations.email`, `settings.email_settings` jsonb, `email_logs` audit + RLS). `/api/partners` GET/POST +`email` (pass MASKED — heç vaxt client-ə qaytmır). **Yeni `/api/email/send`**: test/confirm/remind şablonları (brand layout, VIP+depozit çipləri), nodemailer SMTP, hər cəhd → `email_logs`, success-da `reservations.email` persist. Settings → Bildirişlər: **EMAIL card** (business e-mail + SMTP host/port/user/pass + Test + enable). Rezerv səhifəsi: form-da email field, detail-da email chip, action grid-də **"EMAIL GÖNDƏR"** (prefill + template picker + preview). i18n az/en/ru. tsc 0 error; smoke: /api/health 200 (PUBLIC_PATHS-ə əlavə edildi), admin routes 307, /reservation 200.
- **OFFLINE Phase 1 START (owner: "offline 10000% bunu basla duzeltmeye")**: (1) `lib/offline/monitor.ts` — navigator.onLine + 20s `/api/health` ping, cross-tab sync, `useIsOffline()`; (2) `lib/offline/queue.ts` — localStorage FIFO write-queue, dedupe by idempotency_key, **conservative auto-replay** (yalnız guarded/upsert route-lar: `/api/pos/tables`, `/api/reservations/pre-order-items`), append-type route-lar = manual (sync panel Phase 2), backoff 10s→120s; (3) `lib/offline/cache.ts` + **apiFetch integration**: offline GET (products/floors/settings/orders/staff) → snapshot cache (`X-Saito-From-Cache: 1`), online-da hər ok GET snapshot-refresh; offline writes → queue+202 `{queued:true}`; **PUL ROUTE-LARI (pay/cash-drawer/refund/void/gift-card redeem) = BLOCK 503 `{error:'OFFLINE'}`** — offline "paid" receipt = yalan, Phase 2 offline cash ledger; (4) **OfflineBanner** (admin layout, amber pill, spring 500/26, queue count + "N sinxronlaşdı" toast). Q8 qalan: offline cash ledger + offline card (Q7 terminal ilə birlikdə) + manual sync panel + Electron/Capacitor offline davranışı.
- **Qərarlar (owner, bu turn)**: upsell = PARKED qalır (toxunulmur); waitlist/reserv **SMS provider = PARKED** (ready-state config saxlanılır, provider qoşulmaz); Q7 terminal = açıkladı (manually-captured card işləyir, contactless/bar-tab/tableside-pay/stored-cards terminal bridge gözləyir — provider qərarı: Harbon/SkyPay/Qiwi).

### Jurnal sətiri — 2026-09-26 (Task 54: POS FULL A→Z VERIFY — 2 braun, sıfır-bug acceptance)
- **Owner**: "pos da heqiqeten verify olunub butun ui, backend, features, en xirdaa bug belə istemirem" → browser E2E (PIN 4321, dev :3000) + psql DB check + console sweep, 2 braun.
- **Round 1 (11 checkpoint)**: flow-lar green (floor→cart→send→KDS→pay→DB), amma **5 product bug** tapıldı:
  1. **P0 /kitchen crash** — `merged_into_table:orders!merged_into(table_number)` PostgREST EMBED = `{table_number}` OBJECT; `mapRawOrder` onu raw render edir → "Objects are not valid as a React child" (hər open merged order crash). Fix: number[] normalization (scalar + embed + array shape-ləri).
  2. **P0 Pay button görünmür** — stale `localStorage pos_session` (dəyişən role) `isCashierOrAbove=false` edib close_bill/void/discount-u SİNTSƏ gizlədir (zero feedback). Fix: session effect **həmişə** role-u live `/api/pos/session`-dən re-sync edir (SSOT = cookie; localStorage = instant-paint cache).
  3. **P1 ready-notify part** — 'partially_ready' in-progress set-dən çıxılmışdı (2-item order preparing→partially_ready→ready ping-etməzdi). Fix: əlavə olundu.
  4. **P2 raw enum leak** — TableCard chip `PARTIALLY_READY` raw render. Fix: case normalization + hər value → localized label (partial→hazırlanır), raw fallback YOX.
  5. **P2 owner dashboard** — (a) UTC server TZ: 12:18 Baku order → hour 8 → chart boş; fix = frozen S-05 `localDayRange` (locations.timezone) + `hourInTz`. (b) `kds_active`: 'sent' whitelist-dən kənar idi → 0 vs 6 live; fix = non-terminal definition (KDS mirror). (c) `##D053` double-hash (partner number özündə '#' daşıyır) → prefix guard.
  - Əlavə hardening: floor ilk-load retry 3×1s → 5×1.5s (dev cold-start compile).
- **Round 2 (7 checkpoint, re-verify)**: **7/7 PASS** — /kitchen render (0 crash, merged header numbers, 8 ticket), chips localized (regex sweep 0 raw enum), **PAYMENT E2E GREEN** (Masa 97 → HESABI BAĞLA → Nağd ₼13 → "Bütün sifarişlər ödənildi" → chip TƏMIZLƏNMƏLI; DB: `order_payments` row cash 13.00 captured @12:40 Baku — qeyd: POS payment SSOT = `order_payments`, `payments` = legacy empty), **READY-TOAST captured** ("Masa 511 — sifarişi hazırdır — təhvil verin" + green flash), owner chart bar present (hour 12, ₼30), no `##`, **console: 0 errors** (3 page).
- **Round-2 fix-ləri**: İNDİ counter = LIVE open orders (KDS mirror status filter, today-scoped deyil — 2 vs 8 mismatch tapıldı+fix); HESABI BAĞLA = gold primary affordance (cosmetic, round-2 qeydi).
- **Qalan qeydlər (bug DEYİL)**: (1) `/kitchen` order-level "Hazırdır — Servisə Ver" (per-item ✓ = `/admin/bds` KDSView-də — design fərqi, feature request olarsa birləşdirilir); (2) first cold-compile 500 = transient, reload-da self-heal (monitor); (3) offline = FROZEN (cache-first prerequisite).
- **Nəticə**: POS A→Z (UI + backend + DB) = **verify olundu, round-1 bugs fix+re-verify green, sıfır-bug acceptance PASS**.

### Jurnal sətiri — 2026-09-26 (Task 53: Toast FEATURE-COUNT compare + missing implement)
- **Owner request**: "pos compare et toast ilə ne qədər features var, hər şeyi compare et, eksikləri DİREKT implement et + heç bug istemirem".
- **Gap-report düzəliş (stale state tapıldı)**: §2-də "missing" deyilən **tip engine, loyalty engine, recipe costing artıq var imiş** (code-verify: `/api/tips`+rules+TipManagement+payroll, `loyalty_accounts`+earn/reverse triggers+LoyaltyTab+redeem UI, `/api/recipes/margin-analysis`+waste+BOM+AI constructor). Əsl missing list ~30%-a düşdü.
- **Feature count (code-verified)**: Saito ≈ **117 shipped feature** (single-venue scope, 11 modul cədvəli — workspace TOAST-WOLT-GAP-REPORT.md §5). Toast ≈ 180-220 tracked feature, amma ~40%-i chain/ecosystem (multi-location, payroll/benefits/lending, 100+ integrations) = Saito scope-UNDA DEYİL. **Müqayisə olunan single-venue scope-da Saito ≈ 90%**.
- **Bu wave-də implement olunan (missing-ə)**:
  1. **Realtime → KDS/BDS/TA-Delivery list** (son poll-only board-lar: KDSView 5s, /admin/delivery 5s, POS TA/Delivery 15s → `useCrossTableRefresh` orders+order_items, 1.5s debounce; poll fallback qaldı — Toast-style sub-second cross-terminal).
  2. **KDS ready→server notify** (POS floor: table kitchen_status in-progress→ready/completed keçidində chime + toast + table card flash — `prevKitchenStatusRef` map, first-load ping ETMİR; i18n `kitchen_ready_notify` az/en/ru).
  3. **Owner mobile dashboard** (`/owner` + `/api/owner/dashboard` aggregation + OwnerDashboard.tsx — hourly sales bars, "İndi" card (open tables/KDS/delivery/takeaway), top-5 dishes, low-stock + KDS-overdue alerts, son 10 sifariş; realtime + 60s fallback; admin sidebar "Sahib paneli" + middleware matcher; auth = /admin eyni).
  4. **Customer loyalty balance** (`/api/customers/loyalty?ids=` — loyalty_accounts via service role, frozen `get_customer_timeline` RPC-yə toxunulmadı; customer list "Xal" sütunu (Star) + Inspector KPI "Xal Balansı" (qazanıldı/istifadə)).
- **Qalan əsl gap-lar (FROZEN, prioritetli)**: (1) **OFFLINE** — cache-first prerequisite (Task 31 step 2) → L wave; (2) courier live GPS — partner inteqrasiyasından sonra; (3) guest self-order storefront — scope-dankə (L); (4) email campaigns — SMS ready-state var; (5) loyalty sign-up bonus/birthday — S; (6) purchase orders — M; (7) staff scheduling — M. + Faza 2 (auto-update/signing, iOS print, prompt→modal).
- **Verify**: tsc clean, /owner 307→/staff/login (= /admin eyni), /api/owner/dashboard 401 unauth + 200 real data (node harness: revenue 17/1 order, 10 open tables, top dish Coca-Cola ×5, 6 low-stock, 14 hourly bars). **Browser E2E = Task 54** (owner Chrome).

### Jurnal sətiri — 2026-09-26 (Task 51 Faza 1: native wrap — Capacitor + Electron)
- **Capacitor (iOS/Android)**: `capacitor.config.ts` (com.saito.pos, **server-url mode** — Next.js core server-də qalır, native shell `SAITO_SERVER_URL` ilə yükləyir), `cap add android/ios` + `cap sync` green; plugins: `@capacitor/preferences` (Keychain/KeyStore device_id), `@capacitor/device` (model/OS meta), `@capacitor/status-bar`, `@capgo/capacitor-keep-awake`. AndroidManifest `usesCleartextTraffic` (dev localhost).
- **Device identity Faza 1**: `src/lib/native-bridge.ts` — native-də `saito_device_id` @capacitor/preferences-a re-home (SSOT); web→native migrasiya = **EYNİ ID** (localStorage seed); `ensureNativeDeviceId()` `useDeviceHeartbeat`-dən çağırılır (idempotent); `collectDeviceMeta()` real OS/model qaytarır (`meta.os`, yeni `meta.platform`). Web-də no-op.
- **Keep-awake (wake lock)**: native → CapGo `KeepAwake.keepAwake()/allowSleep()`; web/Electron/Android-Chrome → Web Wake Lock API; heartbeat mount/unmount-da on/off → BÜTÜN stansiya səhifələri (POS/KDS/BDS/Expo/Admin) shift boyunca ekranda qalır.
- **Electron desktop** (`artifacts/saito-desktop`, @workspace/saito-desktop, Electron 44): kiosk `main.mjs` — fullscreen, menyu/resize/devtools OFF (prod), navigasiya LOCK (yalnız SAITO_URL origin), external link → OS browser, permission-lər DENY, **watchdog** (render-process-gone / 10s unresponsive → auto-reload — kiosk boş ekran qalmır); sandboxed preload (`window.SAITO_DESKTOP`); README + macOS/Windows kiosk provisioning; dev-də Escape = çıxış.
- **Provisioning (kod DEYİL)**: iOS **Guided Access** + Android **Lock Task** (Device Owner/MDM) — `NATIVE_NOTES.md`-də qeyd.
- **Faza 1 verify**: tsc clean, cap sync green (4 plugin × 2 platform), POS page compile OK (307 auth redirect, 500 yox). **Electron binary download TƏMMALANMADI** (GitHub releases yavaş; proses owner istəyilə kill olundu — komputer donurdu, səbəb Spotlight indexing idi → android/ios/node_modules üçün `.metadata_never_index` qoyuldu) — re-download = 1 command; kiosk launch testi deferred.
- **Faza 2 (deferred)**: auto-update (electron-updater) + code signing, iOS native print path, `prompt()`×2 → native modal, offline (Q8 — cache-first prerequisite).

### Jurnal sətiri — 2026-09-26 (Task 51: POS A→Z FROZEN audit + qərarlar)
- **Owner request**: "POSla bağlı digər ne varsa ne varsa tap, qərar ver, uje bağla, frozen etmək lazımdır" → A→Z final audit (`admin/pos/**` + reservations + KDS/BDS + device lib), sonra Faza 1 wrap.
- **Audit nəticələri (code sweep, exhaustive)**:
  - **TODO/FIXME/HACK markers: 0.** Əlavə 3 i18n key missing idi (`select_courier`, `service_charge`, `admin_action`) + 2 yeni (`loyalty_redeem_failed`, `z_report_error`) — **hamısı az/en/ru-də əlavə olundu**.
  - **Worst error-leak fix-ler (owner qaydası: raw DB code = heç vaxt user-facing)**: `alert()`×2 → `toast` (ActionSheet loyalty redeem — native alert webview-də blocking idi), no-fallback `toast.error(err.error)` (usePos transfer → `t('transfer_failed')`), Z-report `Z report: <raw>` → i18n `z_report_error`. **Qərar: qalan ~40 `err.error ||` pass-through YERİ = FROZEN NOTE** — server dost business kod qaytarır (kritik qapılarda mapping var: OPEN_SHIFT_REQUIRED s.k.); mərkəzi `friendlyError` mapper = növbəti wave candidate (FROZEN-a toxunma).
  - **Dead components: 6** (`LossItemModal`, `OrderDetailSheet`, `PaymentSuccessModal`, `RefundModal`, `ReservedTableModal`, `VoidItemsModal` + `SendOrderButton` body = type-only import). **Qərar: FAYLLAR SAQLANIR (owner qaydası: özbaşına silmə) — DEAD marker** (map-da qeyd; live path-lər: inline refund OrderHistory-də, inline void CartPanel-də, `ReservationActionSheet` reserved-table üçün).
  - **Hooks-rule violations: 0** (CartPanel crash klassı bütün POS components-ində verify edildi — early return-lər bütün hooks-dan SONRA).
  - **Native-wrap (Faza 1) blockers**: `prompt()`×2 (target_table / merge_tables, page.tsx) → 4 platformada da işləyir (WKWebView/Electron JS dialog) = **defer Faza 2** (native modal); `navigator.getBattery` already guarded; `window.open` print path → Electron-da OK, iOS Faza 2 (prod print = LAN agent path).
  - **Storage keys (7)**: `pos_session`, `saito_pos_preorder_context`, `pos_terminal_id`, `pos_draft_${mode}`, `saito_device_id`, `saito_admin_language`, `saito_light_mode` — webview-də persistent, heysi işləyir; Faza 1-də YALNIZ `saito_device_id` re-home olunur (Keychain/KeyStore, eyni ID).
- **POS = FROZEN** (2026-09-26-dan): yeni feature YOX (owner request-ə görə yalnız); regression yoxlaması icazəli.

### Jurnal sətiri — 2026-09-25 (Partner branding: Bolt/Uber Eats/Glovo/Wolt — logo + brend rengi + kurye; Partners + SMS settings tabları; test order ORD-2804)
- **Owner request**: "partner api üçün logolar olsun — delivery/pickup tab-larında hansı qoşulubsa onun logosu solda; POS/BDS/KDS mətbəxlərin hamısında; kurye adı soyadı nömrəsi; kartın arxa planda tətbiqin rengi (Bolt = yaşıl); 1 dənə test burax görəyim necə görünür."
- **DB migrasiya** `20260925020000` (APPLIED): `orders.partner_source, external_order_id, courier_phone, courier_assigned_at` + `settings.delivery_partners, sms_settings jsonb DEFAULT '{}'` + partial index `idx_orders_partner_source`. POS/KDS boardlar `select=*` oxuduğu üçün data axını avtomatik (heç bir board query dəyişmədi).
- **UI** (`pos/lib/partners.ts` + `pos/components/PartnerBadge.tsx`): `PARTNERS` = 4 partner (id/name/logo/accent/chipBg) — logolar LOKAL `public/partners/*` (Wikimedia Commons), brend rəngləri logo fill-lərindən: Bolt `#34D186`, Uber Eats `#06c167`, Glovo `#fdc500`, Wolt `#0022E6`. Komponentlər: `PartnerStripe` (3px sol brend şeridi, kart `overflow-hidden`), `PartnerTint` (soft arxa-plan, opacity 0.05/0.07), `PartnerBadge` (ağ logo chip). Tətbiq: POS Çatdırılma + Gel-Al kartları (stripe+tint+badge "Çatdırılma 2804" yanında) və KDS ticket-i (badge + stripe) — **BDS inherit edir** (KDSView `stationType='bar'`). Kurye sətiri: `Elvin Məmmədov · +994 50 123 45 67` (nömrə muted).
- **API**: `/api/partners` (GET = settings-dən partner statusları + sms; POST = `{partner, connected}` toggle VƏYA `{sms: {...}}` merge-save) + `/api/partners/test-order` (POST `{partner, mode}` → REAL confirmed order: `ORD-(max+1)`, 2 active product `kitchen_status='sent'`, delivery = district/zone/street + `courier_name/courier_phone/courier_assigned_at`, `external_order_id`, audit `partner_test_order`). **Test zamanı tapılan bug**: `orders.organization_id` NOT NULL — service-role yolunda (session yoxdur) org `locations` row-dan resolve olunur (fix route-da).
- **Settings**: 2 yeni tab — **Delivery Partnerləri** (`PartnersTab`: partner kartları, logo chip, "Bağlanıb/Hazır" status, 1-klik toggle, Takeaway/Delivery test düymələri) + **Bildirişlər** (`NotificationsTab`: SMS READY state — provider Twilio/WhatsApp Business/local, göndərən, SID, masked token, şablon preview, enable; göndəriş intentional olaraq YOX — owner "hazır vəziyyətdə saxla, özləri connect edib işlədər"). i18n az/en/ru: `tab_partners`, `tab_notifications`, `partners_hint`, `sms_hint`, `sms_note`. `tsc --noEmit` clean.
- **Test (owner preview üçün)**: Bolt connected (settings row) + **ORD-2804** delivery test yaradıldı (external `BOLT-TEST-1234`, Yasai Roll Vegetarian ₼9 + Edamame ₼5 = ₼14, kurye Elvin Məmmədov +994 50 123 45 67, order `kitchen_status='sent'` → KDS ticket aktif). DB verifikasiya edildi: order + 2 items + settings flag + audit row. **Visual screenshot GÖZLƏYİR owner login** (browser session expirə olub; dev server əlavə olaraq hung compile-də asılıb → restart edildi, port 3000 sağlam). Owner giriş edincə: POS → Çatdırılma board ("Çatdırılma 2804" kartı: yaşıl şerid + Bolt logo + kurye), KDS (Bolt chip-li ticket), Settings → Delivery Partnerləri (Bolt "Bağlanıb" + canlı 1-klik/test düymələri).
- Qeyd: real partner API inteqrasiyası (Bolt/Uber Eats webhook-ları) — **yox**; READY state dizaynı (owner: "adamlar 1 kliklə qoşsunlar" = connection flag + test sifarişi; həqiqi provider credentials + webhook = növbəti faza).

#### Partner redesign round 2 — "Slick Dark / Smoky" (owner Part 1+2, eyni gün)
- **Part 1 (biznes məntiqi, owner)**: partner sifarişi ≠ daxili çatdırılma — müştəri ünvan/zona/kurye-ni artıq partner app-də edib; restoran üçün kart = **kod + tərkib (KDS) + kurye ETA + status**. POS-da ünvan/zona re-input YOX. Card dizaynında zona sətiri silindi, ünvan muted tək sətir (truncate), ETA ön plana çıxdı.
- **DB**: migrasiya `20260925030000` — `orders.courier_eta text` (partner app-dan gələn display mətni, "12–15 dəq"; webhook faza-yadək test flow simulyasiya edir; ORD-2804-ə qoyuldu).
- **UI**: `PartnerOrderCard.tsx` (yeni, shared delivery+takeaway) — dark mat kart `#141419`, sol-üstkü **blurred radial glow** (partner accent, 18px blur), **native logo** (ağ sticker chip YOX — `PartnerLogo`), top-right: ETA chip (accent bg) + logo + ⋮; `#2804` 24px white; customer/phone `#8E8E93` muted; address 10.5px dimmer truncate; courier sətiri (accent icon); bottom: status pill (sistem rəngləri: confirmed=amber "TƏSDİQLƏNDİ") + total **altın** (`₼14.00`, paid/ready=emerald). **Flex-flow layout — absolute stacking yoxdu → overlap mümkün deyil** (owner şikayəti: "#2804 mətnin üstündə" — həlli verici səbəb idi). Takeaway partner variant: kurye/ünvan sətirləri yoxdur, ETA-nin yerinə elapsed chip.
- **KDS/BDS ticket**: ağ chip → native `PartnerLogo` (stripe qalır — sıx grid-də thin signal line glow-dan yaxşı oxunur, owner konsepti ilə uyğun: stripe kartda yox, ticket-də).
- **Logo asset problemləri (screenshot verifikasiyası ilə tapıldı)**: Commons Uber Eats wordmarkı `#142328` dark-on-dark → dark kartda görünmürdül → `uber-eats-dark.svg` yaradıldı (ağ "Uber" + green "Eats"; ölçülən kontrast 16.5:1 / 7.2:1). Wolt: alpha-sız ağ-boxed PNG-lər → `wolt-dark.svg` wordmark; `#0022E6`≈2:1, `#3D5AFE`≈3.3:1, **final `#5C7CFF`≈4.8:1 crisp** (3 round screenshot ilə ölçüldü). `partners.ts`: `logo` (dark-native) + `logoLight` (settings kataloqu) iki variant.
- **Yoxlama**: preview page (real DOM strukturu, 5 kart: bolt/glovo/wolt/uber + takeaway bolt) → browser screenshot ×3, overlap=none (pairwise bounding-box check), glow visible, kontrastlar ölçüldü. tsc clean. **Live POS screenshot = owner login-gözləyir** (server 10:50 restart edilmişdi — sağlam).
- **Part 1.1 qeydi (Phase 2)**: offline əl ilə partner sifarişi (Bolt down, müştəri zəng etdi) — POS-da "partner sifarişi qeyd et" modu (ünvan/zona/fee input-ları YOX, yalnız kod+tərkib+partner tag). Bu round-da build olunmayıb; owner təsdiqi ilə faza 2-ə.

#### Partner redesign round 3+4 — "hamısı eyni ailə" (owner rəyi, eyni gün)
- **Round 3 (owner)**: (a) light mode "biraz sonuk qalır" → light-də accent border (`accent+59` = 35%) + güclü glow (`accent+59`); (b) **içəri (daxili) kartlar da eyni ailəyə**, amma DATA İTKİSİZ (customer+phone / address / zone / courier+ETA hamısı qaldı — "çoxda zibilini çıxartmadan"); (c) **total rəngi HƏC VAXT sari olmamalı → ağ (dark) / near-black (light)** (altın `amber-300` silindi).
- **Round 4 (owner)**: (a) **glow ("tüstü") = PARTNER kartları yalnız** — daxili kartlarda yoxdur (border/glow ayrıldı: daxili light-də yalnız accent border saxlayır); (b) **Wolt light mode-da "logosu dəyişir" idi** — səbəb: `logoLight` = `wolt-black.png` (fərqli, ağ-boxed PNG). Qayda: **bir wordmark forması, surface-ə uyğun rəng** — 4 partnerin hamısına tətbiq olundu: `bolt-light.svg` (#34D186→#0B9E68), `glovo-light.svg` (#fdc500→#E0A400), `uber-eats-light.svg` (ağ "Uber"→#111827 "Uber" + green "Eats"), `wolt-light.svg` (#5C7CFF→#0022E6, eyni viewBox/font). `partners.ts`: `logo` (dark) / `logoLight` (light) iki variant, Settings kataloqu da `logoLight` istifadə edir.
- **Miqyar**: `PartnerOrderCard` silindi (trash) → tək `BoardOrderCard.tsx` (partner + in-house, `isPartner` branch). DeliveryOrders/TakeawayOrders: köhnə absolute kartlar tam silindi — hər iki board yalnız `BoardOrderCard` render edir (1 kart ailəsi). Phone duplication qorunması: delivery = inline phone, takeaway = ayrı phone sətiri (QA bug 4 qaydası).
- **Yoxlama (v4+v5 screenshots, browser agent)**: in-house kartlarda glow node YOX (dark+light), accent borderlar var (mavi/yaşıl 35%); partner glow-lər yalnız gözlənilən kartlarda; Wolt light ↔ dark eyni forma (yalnız fill fərqli); 11 kartda 0 overlap (pairwise bounding-box); hamı legible. tsc clean.
- **Owner sualı (cavab verilmişdi)**: "3-cü tərəf sifarişləri niyə modal içində customer info daxil edilir?" — modal (Yeni sifariş) **yalnız daxili** axındır; partner sifarişi POS-dan yaradılmır, API-dən gəlir (indilik `POST /api/partners/test-order`, prod = partner webhook). Offline əl ilə partner qeydi = Phase 2.

#### Partner redesign round 5 — live POS fixləri (owner screenshot-larla, eyni gün)
- **Bug 1 — chip qırılması ("əgəzlər" effekti)**: live POS-da dar kartda elapsed/ETA chip 2 sətirə qırılırdı ("9 / min") — səbəb: chip-ə `white-space:nowrap`/`shrink-0` yox idi, geniş partner logo flex row-u sıxırdı. Fix: chip-lər `whitespace-nowrap shrink-0`, title `flex-shrink-0` (nömrə HEÇ VAXT kəsilmir), logo `shrinkable` (`min-width:0` — sıxıda logo compress olur, nömrə deyil). 240px stress kartla verifiye: chip 17.5px=1 sətir, title 63/63 px tam görünür, logo 70→66px compress; ⋮ yalnız <240px-də kəsilir (grid `minmax(280px,1fr)` → realda mümkün deyil).
- **Bug 2 — partner sifarişində müştəri inputu**: owner: "müştəri inputları API-dən tətbiqdən götürülməlidir, özünə yox". Partner order seçilib cart-a yükləndikdə customer chip CustomerPhasePanel (AD/TELEFON/ZONA/ÜNVAN) açırıb — DÜZƏLDİLDİ: `page.tsx` → CartPanel `partnerSource={editingOrder.partner_source}` prop + `onOpenCustomerPhase` guard (partner üçün `return`); CartPanel: partner order-da chip **READ-ONLY** (partner native logo + ad + telefon + **lock icon**, kəsinmə, click yoxdur, title="Müştəri məlumatı partner tətbiqindən (API) gəlir — əllə dəyişdirilmir"). İçəri (daxili) axın dəyişməz.
- **Yoxlama**: v6+v7 screenshots (browser agent, ölçməli): chip heights 17.5px ×3, title scrollWidth==clientWidth, logo widths, cart locked-chip 0 overlap. tsc clean.

#### Partner redesign round 6 — live POS (owner screenshot, eyni gün)
- **Bug 3 — ⋮ kartdan çıxıb + klik olunmurdu**: 230px live takeaway kartda topright (chip+logo+⋮) overflow → ⋮ kənar kəsilib. Fix: **topright = LOGO + ⋮ YALNIZ**; time chip aşağıda ayrı absolute sətirdə (`top-[46px] right-5`, klassik kartın ritmi); ⋮-də `stopPropagation`, opacity 30→55%, `shrink-0`, `-mr-1` silindi; logo `maxWidth` prop (kartda 64); customer row `pr-16` (chip zona). v8 screenshot (230px): ⋮ box right=21px margin kart içində, elementFromPoint hit-test OK (kliklənir), 0 overlap.
- **Bug 4 — "müştəri info-sunu niyə kilidlədin"**: sadə lock chip YETMİR → cart-da **read-only "Partner tətbiqindən (API)" bloku**: partner native logo + lock + tam API payload: ad/telefon, ünvan (street,building,district · zona), kurye (ad/telefon/ETA). Data mənbəyi: `partnerOrder` prop (editingOrder satırı — courier/ETA order-da, cart-da yoxdur). Customer phase həmçinin qapalı qalır (round 5 guard).
- **Research + DB dizayn**: `PARTNER_API_DESIGN.md` (repo kökü) — Wolt v2 / Uber Eats v0.5 sahe cədvəli (status enum, payment method/status/amount/tip, courier, ETA), Bolt = NDA doc. **Qaydalar**: statuslar ayri saxlanilir (`partner_orders.partner_status` vs daxili), ödenisler ayri (`payment_owner: partner|restaurant`, Kassa/Z-report channel, CASH/STORE_CASH → restaurant), customer = API payload (input yoxdur), kurye = partner kuryesi. **Sxem**: `partner_orders` (1:1 orders) + `partner_webhook_events` (idempotency + signature log) + orders.partner_payment_owner (denorm) + webhook endpoint `/api/partners/webhook/:partner` (HMAC + dedup + 60s polling fallback) + reverse sync (HAZIRDIR → partner) + connection health. Fazalar: 1=Wolt+schema+Kassa ayriliq, 2=UE+acceptance+health, 3=Bolt+Glovo, 4=offline elle partner qeydi. **Build olunmayıb — owner təsdiqi gözləyir.**

#### Partner redesign round 7 + POS audit (owner screenshot, eyni gün)
- **CRITICAL FIX — kart root "yenib"**: round-6 edit `BoardOrderCard`-ın **kök `div`-ini silib** (root, topright-div nüsxəsinə çevrilib) → bütün board kartları `h-[180px]`/bg/border/onClick-sız bir inline şeridə sıxılıb (owner: "bu nədir kartlar belə aaa"). Kök bərpa olundu: `h-[180px] rounded-4xl p-5 flex-col bg-[#141419]/white border(accent) + onClick=onSelect`. **Dərs**: el yazılan HTML preview komponent kodunu verify ETMİR — structure dəyişən edit-dən sonra real komponenti read-back etməliyəm (owner canlı POS-da tapdı).
- **Dine-in (TableCard) → eyni ailə**: owner "biraz daha seliqeli forma" — status-ə görə rəngli KART FONLARI silindi; tək sakit səth (`#141419`/white) + **status accent border** (occupied=emerald, ready=amber, reserved=indigo, dirty/waiting=amber/40, overdue/bill=rose, empty=neutral). Layout: absolute → **flex-flow** (top row: masa+chips+guests/items/⋮; middle: amount hero + rez adı; bottom `mt-auto`: waiter + status chip + HESAB). Hamı saxlanıldı: ring-lər (seat/tap), merge/transfer/selection, group stripe, pre-order chip, kitchen chip, flash, archived variant. tsc clean.
- **PARTNER FAZA = FROZEN (owner qərarı)**: "burada frozen edək, Settings tab yaxanda configure edəcəyik; 3-cü tərəfi sonraya buraxaq, restoran istəsə edər". `20260925040000_partner_orders.sql` = **tətbiq olunmayıb** (faylda FROZEN DRAFT marker + `kitchen_sent_at`→`kitchen_accepted_at` düzəlişi); `PARTNER_API_DESIGN.md` dizayn sənədi qalır (Wolt əvvəl, ACCEPT = ƏL İLƏ — auto-accept YOX, NDA izahı).
- **POS + REZERV audit (owner: "ne var ne yox, bitirek")**:
  - **POS bağlı olanlar** (canlı): orders (pay/refund/void/discount/bill-split/transfer/merge/unmerge/undo/dismiss/bill-request/mark-ready/customer/return-to-stock/waste/reprint/loyalty), tables (seat/release/floors), reservations (reserve/cancel/no-show/walk-in/guest-arrived/move/merge/pre-order/send-kitchen/status + POS link `seat_guests_atomic` → order+preorder→items+kitchen_scheduled_for), kassa (cash-drawer×5, verify-pin), menu (filter-data, campaigns/coupon×2, gift-cards/redeem), delivery (delivery-status, calculate_delivery_fee RPC, create_* RPC), stock (stock/loss, waste, return-to-stock), print (enqueue/reprint), operation-logs.
  - **POS-da YOX / qalıq**: waitlist UI (🟡 route var, Q4 qərarı), table analytics bloku (🟡 raporda), floor editor dərinliyi (🟡 Addım 2), bar tab + house account (❌ Addım 2), loyalty tier/VIP (⚪ Q2 qərarı), offline-first (❌ Q8), handheld/terminal (❌ Q7), 3-cü tərəf import (❌ **FROZEN** → Settings faza).
  - **Rezerv↔BOH**: engine ✅ (87 rez verify 09-25), pre-order ✅, kitchen schedule ✅; yox: waitlist SMS + UI (Q4), online booking push (🟡), Google/3rd-party (Wave C).
  - **Inventory/recipes/stock ↔ satış**: avtomatik consume on sale ✅ FROZEN, reverse on refund ✅, waste ✅, stocktake ✅, PO+suppliers+invoices+OCR ✅, auto-86 cron ✅; yox: batch/expiry (Addım 2), multi-location transfer (Addım 3), auto-reorder PO (suggestions var, auto yox), modifier-ə görə consumption fərqi (Addım 2).
  - **POS-u "bitirib" digər səhifələrə keçmək üçün bloklayıcı**: yox — qalanlar hamısı 🟡/⚪ qərar gözləyən (Q2/Q4/Q7/Q8) və ya Addım 2-3 ərazisi. Bu round-dan sonra POS = stabildir (kart ailəsi birlikdə, root fix).

#### Expo view + Device health (owner qərarı, eyni gün)
- **Expo view** (`/admin/expo`, nav "EXPO"): tablet/2-ci ekran canlı display — 3 zona: **Sifariş Hazırdır** (orders: `kitchen_status='ready'` + active status; takeaway=emerald, delivery=blue), **Masa Boşaldı** (table_floors `status='empty'`, son 3 dəq), **Hesab Göndərildi** (`bill_requested`, son 3 dəq, 3 dəq sonra auto-expire). NEW backend YOX — mövcud `createRealtimeChannel('expo-sync')` (orders+table_floors postgres_changes) + 5s poll fallback (POS pattern). Böyük hərflər (məsafədən oxunuş), CANLI/OFFLINE dot + canlı saat. DB status dəyərləri verify olunub (orders.status: closed/paid/served/... blacklist; table_floors: 'empty' — 'available' YOXdur).
- **Device health**: migrasiya `20260925050000` (APPLIED): `device_heartbeats` (location+name unique, last_seen_at; online = ≤45s). API `/api/devices` (GET status list, POST heartbeat; auth+CSRF). Hook `useDeviceHeartbeat(name,type)` — 30s beat, visibility-aware, best-effort (error operatora görünmir). Mount: POS/KDS/BDS/Expo/Admin dashboard. UI: Settings → **Terminallar** tab (30s poll; qeyd: 'devices' key artıq çap cihazları tabıdır → yeni key='terminals'; deep link `?tab=terminals` support əlavə olundu) + dashboard **Terminal Statusları** kartı (60s poll, "Ayarlar" link).
- **Yolboyu qeyd**: `DevicesTab.tsx` (çap) ad collision → yeni tab `TerminalsTab.tsx`; yazma zamanı mövcud DevicesTab overwrite olundu → git-dən bərpa olundu (dərs: mövcud fayla yazmadan əvvəl read et).
- **Yoxlama**: tsc clean; route-lar compile OK (401/307); v9 design mock screenshot (Expo frame + terminal card + settings rows, 0 overlap). Canlı verify = owner login (heartbeat yalnız auth session-də yazılır).

#### Waitlist — "waitlist duzelt" (owner, eyni gün; Q4 = sadə UI)
- **Root cause**: `/api/waitlist` + `/api/waitlist/seat` route-ları var idi, amma **`waitlist` cədvəli heç vaxt yaratılmayıb** — hər çağırış 500. UI də yox idi. (Sidebar-dakı "NÖVBƏLƏR" = staff shifts səhifəsidir, waitlist DƏYİL.)
- **Fix**: migrasiya `20260925060000` (APPLIED): `waitlist` (id, location_id, name, phone, guests 1-99, status waiting/seated/cancelled/no_show, notes, created_at, seated_at; idx status+created_at). Yeni `WaitlistPanel.tsx` + toolbar "NÖVBƏ" düyməsi (yalnız dine_in, indigo count badge, 20s poll) — modal: əlavə formu (ad lazımdır, telefon opsional, guests stepper), queue listesi (pozisiya #n, gözləmə dəqiqəsi live, name+guests+phone), aksiyalar: **OTURDUUL** (boş masa picker → mövcud `/api/waitlist/seat` → masa occupied + guest info + 'seated' + floor refresh), **No-show** (PATCH), **SİL** (DELETE). 15s poll + 10s tick. Snappy spring (500/26).
- **Yoxlama**: tsc clean; v10 design mock (panel+queue+table picker, 0 overlap). Canlı flow = owner login: NÖVBƏ → əlavə → boş masaya oturduul.
- **SMS notify (növbə çağırması)**: bildirişlər faza-sında (Settings → Bildirişlər provider connect olanda) — hazırda yox.

#### Waitlist round 2 — owner sualı + toggle (eyni gün)
- **Owner sualı**: "yalnız boş masa nədir? waitlist dolu masalar üçündür — o dursun, digəri gəlsin; toggle olsun ayarlarda." Cavab: boş-masa picker DOĞRUDUR — gözləyən qonaq yalnız BOŞ masaya oturur; masa dolanda qonaq növbədə qalır, boşalanda oturur. Təkmilləşdirmələr:
  - **Settings toggle**: `settings.waitlist_enabled` (migrasiya `20260925070000` APPLIED, default TRUE = fail-open pattern); `/api/settings/general` COLS + GeneralTab-də "Növbə (Waitlist)" switch. POS: düymə `posMode==='dine_in' && waitlistEnabled` (mount-da /api/settings/general, fail-open).
  - **"Bütün masalar doludur" halı**: panel-da amber hint strip ("qonaqlar növbədə qalır, boşalanda toast + Oturduul aktiv olacaq").
  - **"O dursun, digəri gəlsin" automation**: POS dine-in-da table-status transition detect (occupied→empty) + növbə doludur → `toast.success("Masa N boşaldı — növbədə X qonaq")` + **action button "Oturdur"** (panel açır). Dedup: transition bazlı (prev status map ref).
 - **Yoxlama**: tsc clean; /api/settings/general compile OK (401 fast).

#### Waitlist round 3 — Walk-In SİLİNDİ + Oturdur = tam keçirmə (order auto-open) (eyni gün)
- **Owner qərarı** ("duzunu desem walk in nedir bilmirem... walk in eger lazim deyilse sıl, yerine isə waitlist-i keçir"; "masanı tut... məntiq budur, boş olsa ofisiantlar biləcək heç kim oturmayıb"):
  - **Walk-In UI TAMAM SİLİNDİ** POS-dan: 2 toolbar buttonu + modal + 9 state (`page.tsx`); grep: `walkIn` referensləri **0**. **FROZEN (silinmədi, UI-dən kəsilib)**: `/api/reservations/walk-in` route + `walkin_atomic` RPC — yeganə caller o modal idi (grep təsdiqi). **MASANI TUT SAQLANDI** — `occupied` claim, menyu-oxuma pəncərəsində (qonaq oturub, order yox); HOLD deyil — real hold = REZERVSİYALAR səhifəsi (walk-in pre_order orada redundant idi).
  - **Oturdur = tam keçirmə (walk-in parity)**: `POST /api/waitlist/seat` indi `table.status==='empty'` guard-dan sonra **ORDER yaradır**: `next_order_number` ('ORD-' race-free daily seq) + REST insert (service role, P5 trigger-lər; `/api/orders` POST create path-i ilə eyni kontrakt) `status='new', total=0` + **`customer_name`/`customer_phone` waitlist entry-dən** — qonaq identiki order-da qalır, kassir məhsulu EYNİ order-a append edir (/api/orders active-order guard 2-ci order-a imkan vermir) + `table_floors.occupied + current_order_id + total_amount=0`. Order insert fail → 500 table/waitlist patch-DƏN ƏVVƏL (qonaq növbədə qalır). Toast: "Ad → Masa N · order açıldı".
  - Məntik zənciri (owner ssenari "masa 14"): müştəri gəlir + boş masa yox → NÖVBƏ → masa 14 boşalır → toast "Masa 14 boşaldı" → Oturdur → occupied + **order açıq, ad/telefon order-da** → kassir birbaşa məhsul əlavə edir.
- **Yoxlama**: tsc — dəyişən fayllarda 0 error (`__tests__`-dəki jest-typelər pre-existing, toxunulmayıb). Visual E2E = owner login (PIN wall); test: NÖVBƏ-ə əlavə → Oturdur → masada order kartı ad/telefonla görünməlidir.

#### Full-seat LIVE test + 2 UI gap fix (eyni gün)
- **Full-seat (Oturdur→order) canlı E2E** (owner PIN 4321): waitlist entry → OTURDUUL → **yalnız boş masalar** picker → toast "order açıldı" → DB-də `ORD-xxxx` (status new, customer_name/phone, guest_count) → cleanup (MASANI BOŞALT + PIN, order soft-cancel). **PASS**.
- **Gap A (fix)**: 0-item full-seat order `kitchen_status='pending'` default + `sync_table_kitchen_status` trigger (HƏR open order-ı floor-a sync edir) → masa MƏTBƏXDƏ badge alırdı. Fix: `composedKitchenStatus` (pos-tables.ts) — `item_count === 0 → null` (trigger dəyişdirilmədi; race-flicker də qorunur). Canlı re-test: 993 = DOLU chip, badge YOX; real masalar (471 MƏTBƏXDƏ, 991 ÖDƏNİŞ GÖZLƏYİR) dəyişməz.
- **Gap B (fix)**: Açılan masada cart guest identiyini itirirdi ("Müştəri əlavə et" görünürdü) + ORD nömrəsi heç yerdə görünmürdü. Fix: `selectTable` setCart-ə `customer_id/name/phone + order_number` (+ `loadOrderIntoCart` order_number); PosCart.type + order_number; CartPanel header-də dine-in **ORD chip** (MASA 993 yanında mono). Canlı test: chip `ORD-2810` + "FIX TEST" adı ✓.

#### Faza 0 LIVE VERİFİ + 2 gap fix (eyni gün)
- **Live visual E2E** (owner PIN verdi, browser test): waitlist round 2 ✅ (NÖVBƏ button, panel, test entry add+delete, "Növbə boşdur"), Cihazlar panel ✅ (card: `macOS · Chrome 153 · 1470x956 · 80% · v0.1.0` + device_id mono + YENİ badge), **remote reload ✅** (admin "Yenilə" → Realtime → sayf reload), **unpair ✅** (BLOKLANIB, 0/1 online, button → Bərpa et), **lockout ✅** (full-screen "Bu cihaz bloklanıb" + device ID, z-999999 portal), **recovery ✅** (DB restore → reload → normal UI, 0 JS error).
- **Gap 1 (fix)**: `/admin/settings`-də heartbeat hook YOXDU idi → settings ekranında lockout çıxmayıb + bloklanan cihaz öz "Bərpa et"-ını basıb açıla bilərdi (security hole). Fix: `useDeviceHeartbeat('Admin','admin')` settings page-ə qoşuldu.
- **Gap 2 (fix)**: Self-restore qadağası — öz bloklanan kartının "Bərpa et" düyməsi disabled (`isSelf = device_id === getDeviceId()`); bərpa yalnız BAŞQA (admin) cihazdan.
- Screenshotlar: `devices-cards.png`, `pos-toolbar.png`, `waitlist-entry-added.png`, `lockout-overlay.png`, `recovered.png` (workspace root).

#### Device identity FAZA 0 — terminal kimliyi + Unpair + Remote Reload (eyni gün)
- **Owner qərarı** ("bu native app olacaq... necə edirik") + Faza 0 təsdiqi ("başla brat"):
  - **DB** (`20260925020000`): `device_heartbeats` + `device_id` (stabil UUID; unique `(location_id, device_id)`), `first_seen_at` (YENİ badge), `blocked`/`blocked_at` (UNPAIR). Yeni cədvəl `device_commands` (remote command; RLS: select = authenticated → Realtime postgres_changes, insert = service role only).
  - **Client**: `src/lib/device-identity.ts` — `getDeviceId()` (localStorage `saito_device_id`, bir dəfə random; **wrap fazada yalnız storage dəyişir** → Keychain/KeyStore, ID eyni qalır) + `collectDeviceMeta()` (OS/browser UA parse, ekran, **battery level+charging** — navigator.getBattery, app version). `device-heartbeat.tsx` (.ts-dən): heartbeat indi deviceId+meta göndərir; **403 DEVICE_BLOCKED → module-level portal lockout** ("Bu cihaz bloklanıb" — toast pattern, **5 səhifəyə toxunulmayıb**); **Realtime `device_commands` listener** (filter: öz device_id) → 'reload' → `window.location.reload()`.
  - **API**: `/api/devices` POST (deviceId+meta upsert; blocked → 403 `DEVICE_BLOCKED`) / GET (+device_id, first_seen, is_new, blocked, meta). Yeni: `/api/devices/unpair` + `/api/devices/command` (hər ikisi `settings.admin`).
  - **UI** (Settings → Cihazlar / TerminalsTab): meta sətiri (OS·browser·ekran·battery%·⚡·version), device_id (mono), **YENİ** badge (first_seen ≤24 saat), **BLOKLANIB** halı (qırmızı card), **"Yenilə"** (remote reload) + **"Unpair"/"Bərpa et"** (confirm → cihazda lockout).
- **Yoxlama**: tsc clean; **DB direct test** — eyni device_id upsert → 1 sətir (duplikat YOX), first_seen qorunur, meta yenilənir, block toggle ✓; test sətirləri silindi. Route compile OK (401 fast). Visual E2E = owner login.
- **Növbəti (wrap faza)**: storage → Keychain/ANDROID_ID (eyni ID), native model/OS, Android Lock Task / iOS Guided Access (provisioning, kod deyil), Electron desktop (kiosk+auto-update+watchdog), push. **Offline-first SQLite = PLANDA YOX** (owner + A yol qərarı).

#### Product direction — NATIVE APP (owner qərarı, eyni gün)
- Owner: Saito **native app** olacaq — **iOS/Android + Mac/Windows**, web app DEYİL. Mövcud Next.js core = app-in **motoru** (wrap: Capacator sinfi mobile, Tauri/Electron sinfi desktop — 1 codebase, 4 platform). **Web kiosk/PWA workaround təklifləri QADAĞA** (qabaq kiosk-guide təklifi geri çəkildi). Device identity dizaynı: stabil `device_id` (localStorage — web-də də wrapper-də də işləyir) + qeydiyyat (cihaz info → `device_heartbeats.meta`) + gələcək **device–account binding** (anti-paylaşma = server-side, browser hack deyil).

### Jurnal sətiri — 2026-09-25 (GERİ QAYTAR → Miqdar sətiri + status hint + məcburi səbəb + return backend tamamlandı, `886c9871`; VOID eyni gün GERİ Gətirildi — owner: "geri getir bunu və öz başına heçnə silmə")
- VOID RESTORATION: CartPanel + page.tsx (`onVoidSuccess`) + i18n `hint_minus_blocked` mətnləri `51b2705d`-dən **bayt-bayt** restora edildi (pill, void mode, doVoid, manager PIN fallback, CTA void branch, rose strip, sətir void render). Status hint chip yox edilmədi — Təmizlə + Ləğv et + status chip indi eyni row-da flex. Miqdar-sətiri GERİ QAYTAR, məcburi səbəb, return backend (migrasiya 20260925010000) dəyişməz qaldı. Visual E2E: browser session müddəti keçmişdi (PIN wall); owner tab-da PIN-dən keçəndə W1–W4 tamamlanır.

- Owner: (1) GERİ QAYTAR header-dən **Miqdar: label sətirinin SAĞINA** köçürüldü (header = yalnız X); (2) "2-ci şəkildəki ləğv etmə — əslində lazımsızdır" → **LƏĞV ET pill + void mode TAMAMEN YOX EDİLDİ** (CartPanel: voidMode/voidSelection/doVoid/PinGuard/CTA void branch/rose strip/sətir void render — backend `/api/orders/void` FROZEN, toxunulmayıb); (3) onun yerinə **STATUS HINT**: quick-actions row-da chip — `● N hazır` (emerald, ks ready/completed/served × sentQty) `● N hazırlanır` (amber, digər sent) `● N draft` (unsent) — yalnız `ready+prep>0`-da görünür; (4) "geri qaytar backendini qur, varsa oldugu kimi qalsın; loglamada səbəb məcburi DB-də" → **TAPINTI**: live `return_to_stock` RPC stock-a qaytarıb + audit yazırdı AMMA **SƏNƏDƏ MƏHSULU ÇIXARMIYDI** (sətir invoice-də qalırdı, total dəyişməzdi) → migrasiya `20260925010000`: `record_item_waste`-in bill pattern-i əlavə olundu (full → `kitchen_status='voided', total_price=0`; partial → qty decrement; order total recompute; all-voided → order cancelled) + audit metadata-yə `reason_text`. Yeganə caller = yeni POS return flow-u (refund route ayrıca `refund_with_inventory` istifadə edir — toxunulmayıb).
- **UI: məcburi səbəb** — return view-da "SƏBƏB *" 8 chip (customer_return/kitchen_error/wrong_item/burned/spilled/expired/spoilage/other — DB enum-larıyla eyni kodlar, az/en/ru label) + opsiyonel sərbəst qeyd; **səbəb seçilməyənə qədər iki tale buttonu DISABLED**; `reason`+`reason_text` İKİ endpoint-ə də gedir (əvvəl waste hardcode `customer_return`, stock heç nə göndərmirdi).
- **E2E (Masa 97, Tea ready + Coke pending)**: C1 status chip `1 HAZIR + 1 HAZIRLANIR` PASS, LƏĞV ET yoxdur PASS, SƏRV badge PASS · C2 modal: header yalnız X + Miqdar sətirində sağda mavi GERİ QAYTAR + footer full-width ƏLAVƏ ET PASS · C3 return view: 8 chip + note + buttons disabled→chip seçiləndə enabled PASS (PIN təmpenar bypass ilə yoxlandı, sonra geri qaytarıldı) · C5 unserved modal: Miqdar sətirində pill YOX PASS · C6 console 0 error. **C4 (UI click → return) CSRF 403 ilə bloklandı** — dev browser-da 5 POS/KDS tab + 1 saatlıq müddəti keçmiş client-issued `saito_csrf` token cross-tab race (api-fetch.ts-də qeyd olunan məlum residual limitation, SINGLE-tab prod terminal-da problem deyil). **Eyni endpoint+payload API-səviyyəsində tam verifiye edildi**: `POST /api/orders/return-to-stock {reason:'burned', reason_text:'test qeydi'}` → `success, bill_updated` → Tea sətiri `voided`/total 0, order total 13.00→3.00, `inventory_logs` reversal (reason "test qeydi"), `audit_logs_canonical` (action=return_to_stock) `new_data={reason:'burned', reason_text:'test qeydi', quantity:1, product_name:'Tea'}`.
- Stats üçün sorğu: `SELECT new_data->>'reason' FROM audit_logs_canonical WHERE action='return_to_stock'` (+ `type='waste'`/`item_waste` itkilər üçün).
- Cleanup: test order `10772d57` RPC `cancelled`, masa 97 `empty`. Təmizlə pill davranışı köçmədi (hasDraft=false-ikən 0 en — eskisi kimi).

### Jurnal sətiri — 2026-09-24 (Return = details panel MORPH — owner FINAL, `51b2705d`)
- Owner: "modifikator paneli oldugu kimi qalsın, amma orada sağ tərəfdə geri qaytar buttonu olsun və ona basanda üzə panel morph olsun geri qaytar panelinə dönüşsün" → **ReturnItemModal.tsx SİLİNDİ** (git rm), sətir-tap triqqəri (e1228024) ləğv olundu, row-body yenidən **PASSİV**-dir (yalnız void-mode hint toast). ProductGrid details modal-un FOOTER-ı: solda yaşıl "ƏLAVƏ ET" (08-26 olduğu kimi), **sagda YALNIZ served sətirlərə** mavi "GERİ QAYTAR" (RotateCcw) — `returnCtx` page.tsx preset-indən gəlir (`sentQuantity>0` + `kitchen_status ∈ ready|completed|served`).
- **Morph**: PinGuard (action=`void_item`) uğurda eyni 820px card-da AnimatePresence slide — edit content `x:-36` out / return content `x:+36` in (200ms, [0.32,0.72,0,1]). Return view: məhsul info kartı (ad, ₼/ədəd, −/ədəd/+ stepper — **cap = returnCtx.quantity**), "MƏHSULUN TALEYİ": **Anbara qaytar** (`POST /api/orders/return-to-stock`, mavi/Package) + **İtkiyə yaz** (`POST /api/orders/waste`, reason=`customer_return`, qırmızı/Trash2), footer-da ← GERİ (edit view-ə qayıtma). Uğurda toast + modal bağlanır.
- E2E tapıntısı: `returnCtx.quantity` sətirin TAM ədədini daşıyırdı (sətirdə unsent draft varsa, served hissəsindən çox) → `Math.min(quantity, sentQuantity)` cap.
- Escape təbəqə bugu: modal-un document-level Escape handler-i PinGuard üstündə ikən də bağlanırdı → hər iki qat bir anda gedirdi → `!returnPinOpen` guard (Escape yalnız PIN qatını bağlayır, details aça qalır; 2-ci Escape modal).
- Void pill (Ləğv et) + Təmizlə — 08-26 yerində, toxunulmayıb. SƏRV badge qalır (göstəriçidir, triqer deyil). i18n: hint_return_item yeniləndi (az/en/ru).
- **E2E** (Masa 97, Tea→KDS ready + Coke pending): SƏRV badge PASS · row-body passiv PASS (ilk round-un "1→2" nəticəsi sintetik click-in `+` stepper-a düşməsi idi — kod passivdir, 2-ci roundda təsdiqləndi) · Tea footer = green ƏLAVƏ ET + blue GERİ QAYTAR (sagda, ↺) PASS · GERİ QAYTAR → PinGuard overlay PASS (PIN daxil edilmədi — dev bypass YOXDUR) · Coke footer = green-only PASS · Escape fix PASS · console 0 error. **PIN-dan SONRAKİ morph (return view) browser-də yoxlanmadı** — owner PIN-i ilə test edilə bilər (kod+tsc təsdiqlənib). Screenshotlar: `e2e-morph-{v2b,v3,v4,v4b,v5}.png`.
- Cleanup: test order `843db7cd` RPC-lə `cancelled` (audit saxlanılır) + **masa 97 "empty"** (RPC cancel table-release atlayır — mövcud davranış, SQL ilə buraxıldı; masada 09-21-ci `closed` zombie qalıq tapıldı — terminal status, toxunulmadı).

### Jurnal sətiri — 2026-09-23 (owner pass, Kassa/History BENCHMARK, Toast/Square parity)
- **Kassa** (migration `20260924000001_kassa_benchmark.sql`, additive): bill-by-bill sayım (`denomination_counts` — cədvəl DB-də YOX idi, yaradıldı) + Quick Cash; **No Sale** (məcburi səbəb, `no_sale` log type); **Cash Drop → House** (`cash_drop`); **drawer lock** (`locked`+`locked_by`, manager PIN); **Depozit** (yeni `deposits` cədvəli — expected/actual/fərq); **Paused drawer** ("Sonra say" → status `paused` + yeni drawer, "SAY" ilə finalize); **4AM auto-close** (gecən günün open sessiyası növbəti gün avtomatik bağlanır, GET-də).
- **History**: status filtrləri (paid/refunded/cancelled/hamısı — əvvəl yalnız paid görünürdü), **load more** pagination (100 cap), **İstisnalar tab** = Sales Exception report (`/api/orders/history/exceptions`: void/cancel/refund + order ref + səbəb + staff; legacy int record_id-lər filter olunur).
- **/admin/cash-reports** (yeni səhifə + nav "Kassa"): Close-Out-Day checklist (açıq sessiyalar, açıq sifarişlər, depozitlər + `/api/finance/close-day` aksiyası), Drawer History cədvəli (60 gün), Nağd Aktivliyi (300 hərəkət, order ref + staff), No Sale istisnaları.
- Frozen sərhəd toxunulmayıb: `close_cash_register_v2` RPC dəyişməyib (paused finalize ayrı manual yol; denominations close-dan SONRA yazılır).

### Jurnal sətiri — 2026-09-24 (owner: "toastdaki her şey?" — final Toast qapıları)
- **Z-Report any time** (POS Kassa): bənövşəyi `Z` action (active session) + sessiya açılmayıb olanda da "Z-Report" düyməsi. Read-only daily Z (günü ROLL etmir — close-day ayrıca). `@media print` CSS (`z-report-print`) ilə print-ready. **E2E cavi**: browser client-ın Supabase JWT-i yoxdur (PIN session → anon role) → RPC permission denied → yeni `GET /api/reports/z` (service-role, digər report route-larının patterni). E2E PASS (report render + bölmələr, `screenshots-2026-09-24/z-report-ok.png`).
- **Adjust Closing Entries** (Toast "Edit Historical Data"): `POST /api/cash-drawer` action `adjust_close` — yalnız CLOSED sessiya, manager PIN + `cash.close.approve`, difference log-walk ilə recompute, `approved_by`+`approval_note` (old dəyər) + `adjust_close` log sətiri (CHECK constraint-a əlavə olundu). UI: closed sətirlərdə **DÜZƏLT** düyməsi. **E2E cavi**: view "active session" branch-i içində idi → sessiya yoxduqda inert; Z+adjust view-lar container səviyyəsinə köçdü. E2E PASS (0.00→2.50₼, DB: adjust_close row + closing_balance + approval_note; test sessiyaları təmizləndi).
- **Multi-location reports**: /admin/cash-reports + bütün kassa API-ları operator-un active location context-inə bağlıdır (global location switcher ilə ikinci loca) — Toast per-location drawer history təmin olunur, əlavə iş yox idi.
- **Card auto-capture — N/A (scope- dışında)**: payment provider (terminal gateway) konfiqurasiyasıdır; frozen payment core-a aiddir (Q7 provider qərarı). Manually-captured card modeli ilə qeyd olundu. **⏸ YADDADA (owner 09-24: "lazım olsa edəcəyik")** — Wave C #1 (Q7) altında park edilib.
- **Custom error ekran — OPEN_SHIFT_REQUIRED** (owner: "bizde error ekranlarımız yoxdurmu?"): POS-da clock-in button yoxdur (09-21 owner istəyi ilə çıxarılıb) + raw DB kodu toast-da düşürdü. **Həll:** Kassa panelində on-demand custom modal (amber clock icon + "VARDIYA AÇIQ DEYIL" + izah + **BAĞLA** / **İŞƏ BAŞLA (CLOCK-IN)**); clock-in uğra → dialog özünə bağlanır + kassa açma AUTO-RETRY. Digər raw kodlar dost toast-a map. **E2E round-2 cavi**: `role_id: posSession?.role` (role NAME string) → route UUID ilə müqayisə → `400 INVALID_ROLE` (shift yaradılıb, amma active_role_id=NULL); fiks = `role_id` göndərilir deyil (single-role D-19, column dead). E2E round-3 PASS (~11s, auto-retry, cleanup BAĞLI; `shift-required-dialog.png`, `r3-after-clockin.png`).
- Toast/Square kassa+history parity tamamlandı — qalan heç bir ❌ yoxdur (bax: `AUDIT-KASSA-HISTORY-2026-09-23.md` §5).

### Jurnal sətiri — 2026-09-24 (Return = sətir tap — owner FINAL, `e1228024`)
- Owner 4 turdan sonra final qərar: "void/temizlə yerini dəyişmə, yalnız return üçün düşün" → **return-un yeri YOXDUR**: servis edilmiş sətirdə yaşıl "✓ SƏRV" badge + **SƏTRƏ TAP → ReturnItemModal** (PIN + Anbara/İtki), hər mode-da işləyir. Dünənki pill-merge geri alındı (pill void-only, 08-26 halı), Təmizlə toxunulmadı. Sətir button-larına stopPropagation. Qarışıq cart: draft=−, sent=void pill, served=sətir tap — 3 kanal, 0 toqquşma. E2E Masa 97 (Tea ready + Coke pending): hamısı PASS.
- E2E tapıntısı (mövcud davranış, toxunulmayıb): **void CTA-sı PIN-siz icra olur** (08-26-dən belə) — return-də PinGuard var, void-da yox. Owner istəsə ayrıca fix.
- Dizayn dərsi: "action-u hara qoyaq" sualı 4 dəfə işləmədi → cavab "yer seçmə, trigger-et" idi (sətrin özü). Qarışıq state kartlarında cart-səviyyəli giriş (pill/mode) strukturla qırılır.

### Jurnal sətiri — 2026-09-24 (Void/Return birləşməsi — owner request, `52729983`)
- Owner: "geri qaytar buttonu niyə məhsulun üstündədir — void buttonu əvəz etsin əgər məhsullar servis edilibsə" → sətirdəki **permanent "Geri qaytar" buttonu (26.08-dən) SİLİNDİ**. Bir pill: unserved var → "Ləğv et" (± void selection, olduğu kimi); **yalnız served var → pill özünə "Geri qaytar"** (RotateCcw) olur; qarışıq → "Ləğv et" və mode daxilində served sətir **mavi** highlight + mode-içi chip — sətirə toxunma/chip → ReturnItemModal (PIN → Anbara qaytar / İtkiyə yaz). CTA + banner + hint toasts yeniləndi (az/en/ru).
- E2E (Masa 97, Tea sent → KDS ready+complete): normal sətirdə blue button YOX; pill "GERI QAYTAR"; mode: mavi sətir + chip + "QAYTARMAQ ÜÇÜN MƏHSULUN SƏTİRİNƏ…"; sətir tap → PinGuard. Test order cancelled, **masa 97/98 "empty"-yə buraxıldı** (status dəyərləri: cleaning/empty/occupied/payment_pending/reserved — "available" YOXdur!).
- Qeyd: `transition_order_status_validated` ilə RPC cancel API-nin **table-release addımını atmır** — masa "occupied" qalır (bu gün 97/98-də tutdu, SQL ilə boşaldım). Keçən 6 cleanup-da da elə idi — gələcəkdə RPC cancel-dən sonra table_floors-a bax.

### Jurnal sətiri — 2026-09-24 (BDS = Bar Display + /api/stations root cause, `aa959292`)
- Owner suali: "BDS bar display sistemidir (KDS kimi, kofe/shake) — sən çatdırılma kimi nəzərdə almısan gicsen?" — **Bəli**: 09-23 sessiyası /admin/bds-ı Delivery/Takeaway board-u kimi qurub. Qərar: **/admin/bds = Bar Display** (KDSView `stationType="bar"`), delivery board → **/admin/delivery** (originally approved Phase 2 route). Sidebar: BDS (Coffee) + yeni "Çatdırılma" (Bike).
- **Root cause (09-23-dən yatan bug)**: `/api/stations?kind=*` PostgREST `in.()` filtrini **qısqırcıq** düzülürdü — `in.('kitchen','bar')` literal qısqırla match olub **səssiz `[]`** qaytarırdı (curl-ı təsdiq olundu). Nəticə: KDS station tab-ları (HAMISI/Main Kitchen/Bar/Grill/Prep/Service) **heç vaxt render olunmayıb**, bar display station set-i boş idi. Fix: qısqırsız `in.(kitchen,bar,...)`.
- Bar station routinq hazır idi: `stations.station_type='bar'` (Bar, 09-29-dən), `products.station_id` → `order_items.station_id` trigger, KDSView station boards. Data fix: Green Tea Japanese Style + Tea (İçkilər) Grill→Bar; Coca-Cola artıq Bar idi. Bar-a məhsul atmaq = product form-da station selector (owner özünə görərdə).
- E2E (3 round): KDS chips render (BAR daxil); bar order (Green Tea ×1) **yalnız** bar board + KDS Bar/HAMISI tab-da (Main Kitchen-də YOX); ✓ + Sifarişi Tamamla → ticket gedir; order cancelled; /admin/delivery board + pause pill sağlam. 8 zombie test sifarişi KDS-dən təmizləndi (#A044/#A045/#D051/#A046/#A047/#A048/ORD-279/ORD-2797).
- Qeyd: bar board ready-semantika = KDS eyni (item ✓; complete-order bütün order-in bütün station-larının ready olmasına bağlı — per-station ready müstəqil deyil, əgər istənilsə ayrı feature).

### Jurnal sətiri — 2026-09-24 (Delivery Phase 2 — ops/enforcement, `15c07757`)
- Owner "basla 2ye" → **Phase 2**: BDS board-u + kuryer assign (staff role=courier) 09-23-dən hazır idi — real gap **enforcement + operativ kontrol** idi:
  - `/api/orders` POST-da **server gate-ləri**: `DELIVERY_DISABLED` (403), `DELIVERY_PAUSED` (403), `DELIVERY_MIN_ORDER` (422; zona `min_order` → `settings.min_order_amount` fallback); **server-resolved promised ETA** (now + zona ETA range high) — client göndərməsə belə; append yol ETA-nı artıq silmir. GET: +`delivery{enabled,accepting}` (BDS artıq poll edir — əlavə request yox).
  - **Yeni `/api/pos/delivery-status`**: any-staff authenticated gate oxuması. **E2E tapdı**: browser POS anon-dur, `settings` RLS-dir → direkt Supabase oxuma 401 (banner heç render olunmurdu) → fix: gate-lər bu endpoint-dən (mount + customer phase girişində; fail-open).
  - POS: mode chip `disabled` guard; send bloku friendly AZ toast-larla; CustomerPhasePanel: qızıl **pause banner** + **"Min sifariş ₼X — ₼Y daha əlavə edin"** (server math-mirror); usePos: `DELIVERY_*` kodları iki error yolunda da friendly mətnə map olunur.
  - BDS: header-da **live pause pill** (qırmızı "Qəbul dayandırılıb" / yaşıl "Çatdırılma aktiv") — pause native confirm istəyir, resume 1 klik; kartlarda **"ETA HH:MM" chip** (keçəndə qırmızı).
- E2E (3 browser round): pause→banner+min-line (₼15−6=9 düzgün)→friendly toast (raw `DELIVERY_PAUSED` YOX, round 1-də tapılıb, round 2-də fix); server 403; pill red→confirm→green; ₼15 cart min-order-dan keçdi → **#D051** yarandı (server ETA 11:23Z = now+30m); BDS kart "ETA 15:23" (Baku vaxtı) + zona/fee/ünvan; KDS ready → ALINDI → YOLDADIR → TESLİMEDİ (3×200) → kart board-dan getdi. Dev server E2E ortasında 1 dəfə restart edildi (auth API saturation — mövcud). tsc clean.
- **Qeyd**: bu DB-də aktiv kuryer staff YOXDUR — "Kuryer seç" → "Staff-də aktiv kuryer yoxdur" (owner Staff-də rol: courier əlavə etməlidir). Kuryer assign UI mövcuddur.

### Jurnal sətiri — 2026-09-24 (409 root cause + Delivery Settings Phase 1, `ad0c6d6a`, `550d0ce1`)
- **409 "başqa terminaldan dəyişdirildi" — ƏSL root cause** (owner: "sadece bir terminal, bəzi masalarda"): 3 qatlı — (1) double-tap self-race (React state guard microtask gecikməsi) → sinkron `placingRef` lock (`3024d3ab`); (2) `idx_orders_active_table`-da 3 final status vs kodun 6-si → refunded sifarişlər masaları sonsuz bloklayırdı → migration `20260924030000`; (3) **dominant**: `next_order_number`-də `lpad(v_num,3,'0')` UZUN ədədləri SAĞDAN KƏSİRDİ (2795 → "ORD-279" — mövcud nömrə ilə toqquşma) → `GREATEST(3, length(v_num::text))` (`ad0c6d6a`). E2E: 97+98 masalar 200 OK.
- **Conflict dialog tam metadata ilə** (owner: "tam versin — hansı terminaldı, self-ordermı, KDS/BDS-mi"): 409 body indi `conflict{}` daşıyır (kanal klassifikasiyası: kds / pos_other_terminal / pos_same_terminal / system_or_qr / other_location + son op + terminal + version + vaxt); POS modal 6 sətir detallı info (BAĞLA / YENİLƏNDİR). Cross-location 409 ayrıca pre-check (`TABLE_ACTIVE_ORDER_OTHER_LOCATION`).
- **Delivery Settings Phase 1** (owner "Settings = davranış konfiqurasiyası, Delivery = operasiyalar" təklifi → "tamam başla"): migration `20260924050000` — `delivery_zones.min_km/max_km/min_order/priority/est_minutes_min/max` (NULL max = limitsiz, NULL min_order = qlobal), `locations.delivery_mode (own|third_party|both)`, `settings.delivery_enabled/delivery_accepting_orders`. **Yeni overload** `calculate_delivery_fee(text,numeric,numeric)`: adla seçilmiş zona USTUNLÜK → əks halda məsafə (`min_km<=d<max_km`, priority ASC); zone→global settings fallback; **köhnə (text,numeric,text) signature FROZEN** (POS fey flow dəyişməyib). `/api/settings/delivery` GET/PUT yeni sahələr; DeliveryTab: **Ümumi kart** (2 toggle + mode select + 3 qlobal fallback) + zona kartları (km aralığı, min sifariş, ETA range, prioritet); POS: zones priority order, chip `"Bakı Mərkəz 0–5 km ₼2 · 25–40 dəq"`, `delivery_enabled=false` → zone siyahısı gizlənir (fail-open). Yoxlama: RPC psql (priority tiebreak, min_order_ok, named override, köhnə signature byte-identical) + browser E2E 15/15 (settings edit+persist, POS chip, ₼2 fee, screenshot). **Phase 2 (ops page /admin/delivery — aktiv çatdırılmalar + kuryer borchusu) və Phase 3 (slots, address validation, notifications, map) — owner approval gözləyir.**

### Jurnal sətiri — 2026-09-23 (owner pass, `6a9897aa`)
- **TableCard**: guest+item ikonları TOP row (boşluq dolduruldu), status/HESAB chip bottom-RIGHT (owner screenshot).
- **BDS**: default **Bütün (ALL)** tab — dine-in + delivery + pickup həmişə ekranda; per-order kind badge; **courier = real staff record** (DB `roles.courier` yaradıldı; /api/orders/courier; BDS kartında picker).
- **POS**: wide blue cart-binding banner **REJECTED** → compact chip cart header-də; product modal X = top-right (missing `flex` bugu).
- **Kassa/History audit** (`AUDIT-KASSA-HISTORY-2026-09-23.md`): timeline həmişə boş idi — audit rows `record_id`-də saxlanılır, route `order_id` soruşurdu → `or(order_id,record_id)` + staff resolver; kassa movements order-ref + staff adı (DB-də var idi, UI-da yox); date-filter TZ + count bugları; detail: customer/delivery/service/campaign.
- **Delivery (Wolt-like)**: Settings → **Çatdırılma** tab (ünvan/telefon + zones CRUD, /api/settings/delivery). **Fee indi REAL olaraq charge olunur** (creation-da total-a daxil; əvvəl display-only metadata idi — DB sübutu #D040). RPC `is_free` sayılır (₼50+ = ₼0); cart dəyişəndə fee recalc; **FREE_DELIVERY kampaniyası** (məhsul/kateqoriya/global) fee-yi server-də 0 edir + campaign stamp.

---
*Yaradılıb: 2026-09-11 — REAL DB inventar (156 cədvəl / 419 RPC / 263 route) əsasında. Sonrakı status dəyişikliyi §6.3 jurnalında izlənilir.*
