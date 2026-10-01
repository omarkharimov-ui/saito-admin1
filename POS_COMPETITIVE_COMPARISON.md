# SAITO POS vs Toast · Lightspeed · Square — Feature Audit (2026-10-01, rounds 7 → 11q)

> Əsas: SAITO = bu repo-nun kodu üzrə verified feature set. Rəqiblər = hər birinin
> müstəqil Restaurant POS məhsulunun müəssisəleşmiş core feature set-i.
>
> **STATUS (2026-10-01, rounds 11a–11n):** 5 əsas çatışmazlığın HAMISI bağlandı
> (payroll 11a · purchasing 11b · analytics 11c · online ordering 11d · offline 11e),
> qalanlar 11f-də, backend consistency audit + Apple polish 11g-də, POS status axını
> (fulfillment/payment ayrılığı) + served-lock + default serving 11n-də, chip mənatiqi +
> custom ikonlar (person+bag / moped) + action-sheet back 11o-da, qısa status label +
> pill ikonları + düz ödəniş text + "#" təmizliyi 11p-də. Hər addımın
> before/after müqayisəsi aşağıda (§0). Qalan: §2.6 real PSP (owner qərarı),
> §2.7 e-commerce (low priority), §2.8 franchise, light-mode phase-2 (POS sheet-ləri).

## 0. BEFORE / AFTER — 11a–11g dəyişikliklərinin tam müqayisəsi

| Qabiliyyət | BEFORE (round 7 audit anı) | AFTER (11a–11g) |
|---|---|---|
| **Online ordering** | Yox idi — customer kanalının özü missing | Menü → table-suz checkout (takeaway/delivery) → server-price order → public tracking səhifəsi → KDS axını. Rate-limit + CRM link + zone/fee/min/ETA. 67 "qayıb" no-table order KDS-də görünür (bug fix) |
| **Offline mode** | Yox idi — internet kəsilişində order qəbulu mümkün deyildi | Order intake + queue (idempotency-key, **iki-faza reserve/confirm**) + auto-replay + sync panel + force-test rejimi. Payment-lər də queued (7 caller, fake-success yox). Reload-dan sonra banner qorunur |
| **Time-clock / payroll** | Scheduling var idi, punch + payroll export YOX | `get_payroll_export` RPC (LAG pairing + overtime + tips) + admin sheet (preview/CSV/history) + staff CSV + payroll_periods upsert |
| **Analytics** | Statistik səhifə var idi amma staff panel DEAD idi (role column yox), peak hours yox | 24s peak (SİFARİŞ/GƏLİR toggle + PİK), product food-cost/net-profit drill-down, staff çəkiliş dəqiqəsi + CSV, panel canlanıldı (role_id fix) |
| **Purchasing (PO)** | Stock return/waste/level var idi; PO/receiving/cost YOX | PO create (auto ingredient bind) → atomic `receive_purchase_order` RPC (row-lock, partial/full, WAC) → supplier counter (atomic inc/dec). `sync_product_availability` dead-schema fix — anbar artımı ilk dəfə real işləyir |
| **VOID** | Sent xətt void olunanda DB düzülürdü, UI-da sətir GERİ ÇOXURDU (rehydration bug) | Voided/cancelled xəttsələr rehydration-da filtrlənir + `orderIsDead` → sent səttsələr drop. E2E: səttsə yox olur və qalmır |
| **Room-charge / Corporate pay** | HƏMİŞƏ 400 (modal order_id-siz POST) — heç vaxt işləməyib | Modal input-only → parent canonical idempotent flow → reference `order_payments.reference`-da |
| **Append (addItems) offline** | Manual queue idi (dup riski) — blind replay riskli sayılırdı | İki-faza idempotency (reserve→confirm) → **tam auto-replay-safe**; 5xx retry də duplicate-safe |
| **Queue data loss** | Replay cavabı 200 {success:false} olsa da item SİLDİLİRDI (silent order loss) | Business-fail replay = MANUAL-a keçir (insan qərarı), sync toast səbəbi ilə |
| **Devices page** | 500× React duplicate-key error (console spam) | Client dedup (device_id, ən yeni heartbeat) → console 0 |
| **Payroll webhook POST** | SSRF (istənilən URL) + date injection (raw URL interpolation) | YYYY-MM-DD gate + public http(s)-only host guard |
| **Online zone** | Naməlum zone_id → `zones[0]` (yanlış fee/min/ETA) | Explicit-invalid = 400; absent = default; min-order client-da göstərilir + disable |
| **Checkout UX** | "Sifariş et" düyməsi invalid formda click → error toast | Düymə valid olana qədər disabled; delivery zona yoxdursa segment disabled; minimum order hint (progressive disclosure); track link eyni tab-da |
| **Delivery status toast** | Server fail olsa belə "success" toast (transitionDelivery {success:false} ignored) | Result check → real success/error |
| **UI (Apple polish)** | — | Payroll panel auto-load + meaningful empty state; peak-hours redundant footer aradan qaldırıldı; binding docs-a uyğun consistency (hər screen: content-first, one primary action) |
| **Backend integrity** | Fire-and-forget idempotency writes; non-atomic goods-receipt (rollback dead code); read-modify-write races (supplier counter, double receive) | Reserve-before-create + blocking confirm; atomic RPC receive (FOR UPDATE); atomic counter RPC-ləri; in-route auth (middleware fail-open əməliyyatına qarşı) |
| **Zone logic + dynamic ETA (11q)** | Bakı Mərkəz: min_km=5 (0–5 km müştəri zonadan XARİC), min_order=3 (Ümumi 15-lə ziddiyyət), ETA boş amma POS "30 dəq" (legacy estimated_minutes fallback); müştəri mərhələsində KM/haqq zona seçimdən sonra da 0.0/₼0; warning "Min sifariş ₼15 — ₼15 daha əlavə edin" aydın deyildi | min_km=0, min_order=NULL (→ global), ETA 20–30 (chip real aralığı oxuyur); chip tap = KM midpoint (7.5) + haqq RPC avto-dolur; **"Məntiq qaydaları" box** settings-də; **`estimate_delivery_eta` RPC**: zona base + LIVE mutfak növbəsi (hər aktiv sətir +2 dəq, cap +30, 30 sn poll) → "50–60 dəq · mətbəx: 18 aktiv sətir"; kassa açılmayıb = non-blocking amber banner + one-tap "KASSANI AÇ" (satış blokLANMIR); ₼ prefix bərabərləşdirildi (input içi) |
| **Board status UX (11p)** | Uzun label-lar ("Hazırdır — Təhvil", "Kuryer Alıb", "Təsdiq Gözləyir"), ikon yox, "#" nömrə önündə, ActionSheet-də ödəniş = pill/chip | Qısa word (Yeni/Təsdiq/Mətbəxdə/Hazırdır/Alındı/Transitdə/Çatdırıldı/Ləğv) + status ikonu (ChefHat/User/Moped/Navigation), sırf rəqəm, ödəniş = düz text (emerald/amber) |
| **Board status axını (11n)** | Chip = derived stage, "ÖDƏNİLDİ" stage idi → 33/34 takeaway kartı progress yox, pullu vəziyyət; `sent/accepted/reserved` rollup dəyərləri tanınmırdu ("Mətbəxdə" → "Təsdiqləndi"); in_transit config yoxdu (pending-ə düşürdü) | Chip = yalnız FULFILLMENT (kuryer maşini > kitchen rollup > order status); ödəniş = total yanında ikon (✓ / hourglass); sent/accepted/reserved/served düzgün axınır |
| **Takeaway/delivery ikonları (11n→11o)** | Mode switcher: Handbag (börüş); board: UserCheck; delivery: Bike | Deep browser search (7 icon seti, Iconify API) → custom: Takeaway = **TakeawayPickup** (person + takeout bag — universal "customer picks up" piktogramı, lucide grid-də), Delivery = **Moped** (Tabler, MIT — Baku kuryer skuteri). Candidate v1 (Hugeicons hand-bag) E2E-də handbag olduğu üçün reject → v2 |
| **Served məhsula yeni porsiyon (11n)** | SERVED xəttsədən eyni məhsulun YENİ porsiyonu əlavə olunmurdu (single-mode-da düymə yoxdu, multi-da kilidlə gizlənirdi — dead end) | "Yeni porsiyon əlavə et" (single + həmişə görünən multi "＋") → fresh draft, kilid yalnız göndərilmiş porsiyona |
| **Serving üsulu (course) (11n→11o)** | Hər məhsula 'main' (Ana yemak) SƏSSİZ təyin olunurdu + cart-da HƏMİŞƏ chip (chaos) | Ayarlar → Mətbəx: `default_course` (4 seçimi); plain tap = null (səsiz default, chip-siz); Mərhələ section yalnız modifier-lı məhsulda (panel-də, default gold); chip YALNIZ real + fərqli seçimdə (Utensils ikon + course-tint, "1 əlavə" mod chip-dən aydın fərqli) |

**Qeyd:** "BEFORE" sütunu = round 7 audit-inin (bu faylın ilk versiyasının) verified durumu.
Hər AFTER claim = round jurnalında (MASTER_FEATURE_MAP.md §10, 11a–11g) commit + E2E
kanıtı ilə dəstəklənir.

## 1. BƏRABƏR / QÖNÇƏ (parity or better)

| Feature | SAITO | Toast | Lightspeed | Square |
|---|---|---|---|---|
| Floor/table management (merge, transfer, status chips) | ✅ + rotation-morph UI, kitchen-status per card | ✅ | ✅ | ✅ (Square for Restaurant) |
| Per-instance modifiers (multi-instance pills, independent specs) | ✅ **daha dərin**: hər instance öz modifier/variant/course/allergen/hold saxlayır (E2E verified) | ✅ (line-level) | ✅ | ✅ |
| Allergens (auto-icon, per line, kitchen warning) | ✅ | ✅ | ✅ | ⚠️ məhdud |
| Payments: cash/card/QR/transfer/corporate/gift/room charge + split (amount & per-item) + tip | ✅ 8 method + item-level split | ✅ | ✅ | ✅ |
| Refund: full/partial/item-level + inventory fate (stock/waste/none) + approval threshold + idempotency (server) | ✅ **daha sərt**: DB atomic, net-paid guard, idempotency keys | ✅ | ✅ | ✅ |
| Cash drawer (shift open/close, in/out, no-sale, drop, deposit, Z, manager lock) | ✅ | ✅ | ✅ | ✅ |
| Shift/role/PIN permissions + audit log + approval requests | ✅ | ✅ | ✅ | ✅ |
| Reservations + waitlist + pre-order | ✅ | ✅ | ✅ | ✅ |
| Delivery (courier, zones, fee, status) + Takeaway | ✅ | ✅ | ✅ | ✅ (Square Delivery) |
| Kitchen (KDS) + per-item status (cooking/ready/served) | ✅ | ✅ | ✅ | ✅ |
| Campaigns/coupons (server-validated, min-order, dining window) | ✅ | ✅ | ✅ | ✅ |
| Loyalty (points spine, redeem at payment, reverse on refund) | ✅ | ✅ | ✅ | ✅ |
| CRM customers (shared source, phone, linking) | ✅ | ✅ | ✅ | ✅ |
| Receipts (thermal print queue, reprint) | ✅ | ✅ | ✅ | ✅ |
| Multi-location, i18n (az/en/ru), light/dark, reduced-motion | ✅ | ⚠️ | ✅ | ⚠️ |
| Device pairing/heartbeat/remote commands | ✅ (Phase 0–1) | ✅ (Toast hardware) | ✅ | ✅ (Terminal) |

## 2. ÇATISMIYAN (missing — prioritized)

1. ~~**Online ordering / customer-facing channel**~~ — ✅ **BAĞLANDI (11d):** `api/orders/online` (takeaway/delivery, server price + CRM link + zone/fee/min/ETA) + public `/api/orders/[orderId]/track` (tracking səhifəsi) + menu no-table checkout. Bonus: KDS `table_number gt.0` bug fix — 67 mövcud no-table order KDS-də ilk dəfə görünür.
2. **Offline mode** — ✅ **PHASE 1 BAĞLANDI (11e):** offline order intake + idempotency-key dedup + auto-replay sync (banner + sinxron panel). Qalan (phase 2): offline cash drawer ledger + append dedup.
3. ~~**İş vaxtı/time-clock + payroll export**~~ — ✅ **BAĞLANDI (11a):** `get_payroll_export` RPC (punch LAG pairing + overtime + tips) + admin/staff CSV export + payroll_periods upsert + history.
4. ~~**Advanced reporting/analytics dashboard**~~ — ✅ **BAĞLANDI (11c):** 24s peak hours (SİFARİŞ/GƏLİR toggle), product food-cost/net-profit drill-down, staff performance (fix: dead `role` column) + çəkiliş dəqiqəsi + CSV.
5. ~~**Inventory purchasing (PO/receiving/supplier)**~~ — ✅ **BAĞLANDI (11b):** PO create (auto ingredient bind) + goods-receipt (delta, partial/full, WAC cost) + supplier order counter + `sync_product_availability` dead-schema fix.
6. **Hardware terminals (Square Terminal, Toast Station/stand)** — SAITO-da card terminal = SIMULATOR (adapter arxitekturası hazırdır, real PSP bağlı deyil).
7. **E-commerce sync (Lightspeed)** — B2C store sync yoxdur (SAITO restaurant-first olduğu üçün low priority).
8. **Franchise/multi-org hierarchy (Lightspeed)** — SAITO multi-location var; franchise royalty/reporting yoxdur.

## 3. YAXŞILAŞDIRILMALI (improve — near-term)

1. **Card terminal: real PSP** — adapter interfeysi hazırdır (SIMULATOR); owner qərarı ilə real PSP bağlıb. (Gəlir/köpür: Square/Toast ödəniş marjasından azalıb.)
2. **Print: network thermal printers** — hazırda print queue + reprint var; printer agent (BDS) istiqaməti Phase 0-da.
3. **Kitchen KDS screen (standalone)** — KDS page var; kiosk/standalone kitchen screen + priority queue polishing.
4. **Customer self-service (table QR menu/order)** — Masa 471 QRUP chip var (QR göstəriş) — tam QR menu/order axını yoxdur.
5. **Analytics: daily close summary** — Z report var; end-of-day summary (top items, avg check, staff) print/dashboard.
6. **Notifications** — order placed/bill requested push (staff IM) — hazırda in-app chip/toast.
7. **Device unpair UX** — E2E-lərdə 2 dəfə unpair lockout (round 6/7) → Settings → Cihazlar-da "Bərpa et" axını + self-recovery (PIN) düşünülə bilər.
8. **Next dev "Issues" pill** — dev-only; warning-ları sıfırlamaq üçün hər round-da console scan (round 7: 0 warning).

## 4. QƏLƏBƏ NÖQTƏLƏRİ (SAITO's edge)

- **Motion/design quality**: iOS-philosophy animation system (rotation morph, stroke-draw, measured sliding capsule, reduced-motion) — rəqiblərdə bu səviyyədə POS front-end nadirdir.
- **Per-instance modifier model**: line-level spec isolation (round 6/7 E2E) — çox POS-da modifier "merged" davranır.
- **Server-sərt refund/ödəniş**: atomic DB functions, net-paid semantics, idempotency keys, approval spine — accounting integrity Toast/Square səviyyəsində.
- **Baku/AZ yerelliği**: AZN, az/en/ru, lokal terminologiya, EDV.

## 5. TÖVSIYYƏ (roadmap order)

1. Real PSP card terminal (adapter hazırdır) — payment reliability. *(yeganə qalan əsas item — owner qərarı)*
2. ~~Offline mode~~ — ✅ 11e (phase 1: order intake+sync; phase 2: cash ledger)
3. ~~Online ordering (MVP)~~ — ✅ 11d
4. ~~Analytics summary~~ — ✅ 11c (peak hours + staff/product drill-down + CSV)
5. ~~Inventory purchasing (PO/receiving)~~ — ✅ 11b
6. ~~Staff time-clock + payroll~~ — ✅ 11a
