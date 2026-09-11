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

---

## 1. FOH — FRONT OF HOUSE

### 2. POS (terminal + order entry)
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
| Order creation (table/takeaway/delivery/reservation/walk-in) | ✅ | `create_or_append_order`, `walkin_atomic`, `create_takeaway_order`, `create_delivery_order` | `/api/orders`, `/api/orders/qr` |
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
| Gift card tender | 🟡 | `gift_cards`, `gift_card_ledger`, `gift_card_redeem` (0 card) | UI yox — Addım 2 |
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
| Customer profile + addresses + allergies | ✅ | `customers` (7), `customer_addresses`, `allergens`, `product_allergens` | `/api/customers` |
| Order/visit history + favorite items | 🟡 | `orders.customer_*` bağları var | UI-də customer timeline bloku zəif |
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
| Core engine (issue/redeem/ledger) | 🟡 | `gift_cards` (0), `gift_card_ledger`, `gift_card_transactions`, `gift_card_issue`/`gift_card_redeem` | `/api/gift-cards`, `/api/gift-cards/redeem` |
| UI (create/manage/report) | ❌ | — | Addım 2 (Q3 qərarı gözləyir) |

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
| Reservation engine (atomic: reserve/assign/cancel/walk-in/seating/no-show) | ✅ | `reservations` (86), `reservation_tables`, `assign_reservation_tables_atomic`, `confirm_and_checkin_atomic`, `mark_no_show_atomic`, `auto_no_show_v2` | `/api/reservations*` (14 route), `admin/reservations`, `public/reservations` |
| Pre-order on reservation | ✅ | `reservation_preorder_items`, `upsert_reservation_preorders`, `send-kitchen` | — |
| Table merge/move within reservation | ✅ | `merge_table_to_reservation`, `move_reservation_table_atomic` | — |
| Waitlist (SMS + queue + estimated wait) | 🟡 | `waitlist` route + `/api/waitlist/seat` | SMS notification YOX; UI Addım 2 (Q4 qərarı) |
| Online booking channel (public) | 🟡 | `api/public/reservations` | Confirmation/reminder push YOX |
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
| Waitlist core | 🟡 | `/api/waitlist`, `/api/waitlist/seat` | UI + SMS Addım 2 |

### 14. UPSELLING
Suggested modifier, recommended item, combo upsell, cross-sell, AI recommendation, server prompt, time-based.

| Feature | Saito | DB | API/UI |
|---|---|---|---|
| Campaign-based upsell (best cart campaign) | 🟡 | `get_best_cart_campaign` | POS-də "recommend" UI bloku yox |
| AI recommendation (Sensei) | ✅ | `ai_cache`, `popular_queries`, Sensei routes | `/api/sensei/*`, `recipes/ai-suggest` |

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
| Printer routing (kitchen/bar printers) | 🟡 | `print_jobs`, `/api/settings/printer` | Hardware test + routing Addım 2 |
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
| Onboarding workflows + tasks (auto role-based) | ✅ | `onboarding_workflows`, `onboarding_tasks`, `start_onboarding`, `complete_onboarding_task` | `/api/onboarding` |
| Daily operating checklists (opening/closing) | ❌ | — | Addım 2 (Lightspeed 2026 parity) |
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
| Print jobs + printer settings | 🟡 | `print_jobs`, `/api/settings/printer` | Device registry + health + routing YOX |
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
| Public QR menu + QR order + QR pay | ✅ | `/api/orders/qr`, `menu/page.tsx` | Qeyd: qr route hazırda **staff-auth tələb edir** → anon customer access = Wave A |
| Public reservation (website) | ✅ | `api/public/reservations`, `reservation/page.tsx` | — |
| Online ordering (pickup/delivery, telefonla münasibət) | ✅ | takeaway/delivery RPC-lər | Customer-facing order UI (phone) Addım 2 |
| Public VAT config | ✅ | `/api/public/vat-config` | — |

### 31. KIOSK
Self order, upsell, payment, loyalty. → **❌ YOX** — Addım 3.

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

---

## 9. ROADMAP — WAVELƏR (nərdən başlayırıq)

### Wave A — "Sistemi aç" (Addım 2-in ilk yarısı)
1. ~~**Outbox consumer**~~ ✅ **BİTİB (2.1, 2026-09-11)** — `outbox_pump` SSOT + handlers + dead-letter; pg_cron scheduler 7 job LIVE; backlog drained
2. **QR anon customer access** (qr route staff-auth → anon; customer order/pay/loyalty açılır)
3. **Gift card UI** (engine ✓, UI+report yoxdur) + bar tab (pre-auth, `customers` var)
4. **Customer timeline UI** (history/favorites/spend) + segmentation bloku
5. **Daily operating checklists** (opening/closing/maintenance; onboarding engine mövcuddur — eyni pattern)
6. **Waitlist SMS** + reservation reminder/confirmation (provider: WhatsApp mövcuddur → genişləndirmə)
7. ~~**Cron verification**~~ ✅ **BİTİB (2.1)** — 7 job LIVE, run audit `cron.job_run_details`
8. **Device registry + print routing** (print_jobs var, registry yoxdur)
9. **Loyalty qərarı Q2** (tiers/birthday UI build/cut) — qədardan asılı

### Wave B — "Guest channels" (Addım 2-in son yarısı)
1. **Online ordering (customer UI)**: pickup/delivery, phone-dan sifariş, loyalty bağlantısı
2. **Kiosk** (self-order, upsell, payment, loyalty)
3. **Upsell UI** (get_best_cart_campaign → POS/QR-da recommend bloku)
4. **Advanced analytics blokları** (retention, AOV, table revenue, delivery performance)
5. **Batch/expiry tracking** (inventory-də sahələr + UI)

### Wave C — "Platform genişlənməsi" (Addım 3)
1. **Payment terminal provider (Q7)** → offline payment, pay-at-table, signature, chargeback, pre-auth
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
| Q3 Gift cards | Wave A #3 | gözləyir |
| Q4 Waitlist | Wave A #6 | gözləyir |
| Q7 Terminal provider | Wave C #1 + bar tab pre-auth + pay-at-table | **kritik — çəkiliş** |
| Q8 Offline-first | Wave C #2 + sync_operations | gözləyir |
| Q10 Push token | Wave C #3 | gözləyir |

---

## 10. SYNC PROTOKOL QAYDALARI (bu fayl üçün)
- Bu fayl = **master plan**. HANDOVER.md-də status (§5), Notion-də checkbox-lar — hamısı bu fayl üzərindən gedir.
- Hər Wave tapşırığı bitəndə: bu fayldakı status sütunu (✅/🟡/⚪/❌) yenilənir + HANDOVER §6.3 jurnal sətiri + Notion tick.
- **Yeni feature təklifi gələndə** əvvəl §0.2 backbone sualı verilir: "bu operation hansı state-i dəyişir, hansı downstream təsirlənir?" → cavab burada (müvafiq modulda) yazılır.

---
*Yaradılıb: 2026-09-11 — REAL DB inventar (156 cədvəl / 419 RPC / 263 route) əsasında. Sonrakı status dəyişikliyi §6.3 jurnalında izlənilir.*
