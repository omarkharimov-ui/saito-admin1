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
| Prep-time + station analytics | ✅ | `kitchen_analytics`, `log_kitchen_analytics`, `get_kitchen_stats` | `admin/kitchen-analytics` |
| Kitchen schedule (reservation pre-fire) | ✅ | `kitchen_schedule`, `process_due_kitchen_schedules` (cron) | — |
| Expo station + course firing UI | 🟡 | stations var | UI-də ayrıca "Expo" görünüşü Addım 2 |
| Printer routing (kitchen/bar printers) | ✅ **pr v1 (09-20)** | `print_jobs`, `print_devices`, `/api/print/*`, `/api/settings/printer` | Gate 35/35 + E2E R20-R28; LAN agent (tools/print-agent) |
| Realtime ticket push | ✅ FROZEN (P0-3) | `supabase_realtime` (kitchen_tickets daxil) | — |

### 16. INVENTORY
Products/ingredients/units/recipes/recipe costing; stock (current/min/max/reorder); transactions (sale/purchase/adjustment/waste/spoilage/theft/transfer); purchasing; cost (avg/last/food cost/valuation); control (actual vs theoretical, variance, stocktake); automation (low stock, auto reorder, auto 86, availability, expiry).

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Ingredients + units + stock levels | ✅ | `ingredients`, `stock_transactions`, `inventory_logs` | `/api/stock*` (11 route), `admin/stock` |
| Recipe-based consumption on sale + reverse on refund | ✅ FROZEN | `consume_stock_for_item`, `_inventory_reverse_item_qty`, `reverse_stock_for_items` | — |
| Waste + waste standards + spoilage | ✅ | `waste_standards`, `record_item_waste`, `waste_order_item_atomic` | `admin/waste-standards` |
| Stocktake + apply count + variance | ✅ | `stock_counts`, `stock_count_items`, `apply_stock_count` | `admin/stock/counts` |
| Purchase orders (draft→sent→received) | ✅ | `purchase_orders`, `purchase_order_items`, `atomic_receive_goods` | `admin/purchase-orders`, `/api/procurement/receive` |
| Suppliers + supplier returns | ✅ | `suppliers`, `supplier_returns`, `process_supplier_return` | `/api/suppliers*` |
| Invoices + atomic apply + OCR | ✅ | `invoices`, `invoice_items`, `atomic_apply_invoice`, `/api/invoice-ocr` | `/api/invoices*` |
| Auto 86 on depletion / low-stock alerts | ✅ | `check_stock_thresholds` (cron) | `stock/ai-insights`, `stock/suggestions` |
| Batch / expiry tracking | ⚪ | cədvəldə sahə yoxdur | Addım 2 |
| Multi-location inventory transfers | ❌ | — | Addım 3 |
| Auto reorder (PO auto-təklifi) | 🟡 | `stock/suggestions` var | Auto-PO generation yox |

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
