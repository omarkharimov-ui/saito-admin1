# Audit: Kassa (cash drawer) + History (tarixçe) — 2026-09-23

Owner request: "kassa və history popuplarına baxaq, real analiz edək,
eksikləri nədir, onlar DB-də saxlanılırmı? Tarixçe paneli çox zəifdir,
həmçinin kassada."

Bu fayl live DB (Supabase, service-role) + kod qarşılaştırması əsasında yazılıb.

---

## 1. HISTORY (OrderHistory.tsx → /api/orders/history)

### 1.1 Root cause: "Tarixçe" timeline HƏMİŞƏ boş idi
- `audit_logs` cəmdə **440 sətir var** (`order.transition` 265, `payment` 19,
  `status_change` 37, `cancel` 59 …) — yəni eventlər yazılır.
- **LƏKİN**: bütün 440 sətirdə `order_id = NULL`. Order ID `record_id`
  sütununda saxlanılır (order-scoped sətirlər üçün `table_name='orders'`).
- History detail route `audit_logs?order_id=eq.{id}` sorğusu atırdı →
  həmişə `[]` → "Tarixçe" bloku `auditLogs.length > 0` şərti ilə **heç vaxt**
  render edilmirdi.
- **FİKS (edildi)**: [id] route indi `or(order_id.eq.{id},record_id.eq.{id})`
  sorğusu atır + `performed_by` staff-ID-lərinin adlarını batch ilə resolver edir
  (`staff_name` sətirlərdə NULL olurdu).
- Qalıq risk: köhnə sətirlərdə `staff_name` NULL → yeni resolver bunu qapar.

### 1.2 DB-də var, UI-da YOX (history detail)
| Field (DB column) | Durum |
|---|---|
| `customer_name`, `customer_phone` | Order object-də gəlir, detail-də göstərilmir (yalnız search-ə daxil) |
| `delivery_address`, `delivery_zone`, `delivery_fee` | Delivery sifarişlərdə detail-də görünmür |
| `service_charge_amount`, `tax_amount` | Mali breakdown-da yox (yalnız subtotal/discount/total/refund/paid) |
| `campaign_id` → kampaniya adı | Discount göründüyü halda hansı kampaniya olduğu bilinmir |
| `paid_at` | "Ödənilən" cəmi var, ödəniş TARİXİ yox |
| payment sətirlərində `performed_by_name` | Kim ödənişi etdi görünmür |
| payment sətirlərində `status` (captured/pending) | Pending card payment captured ilə eyni görünür — ALGI RİSKİ |
| payment sətirlərində `change_amount`, `cash_received` | Nağd veriliş/geri qaytarma görünmür |

### 1.3 DB-də yox / UI-da zəif olanlar
| Məsələ | Detall |
|---|---|
| Yalnız `status=paid` list | Refunded / partially_refunded / cancelled sifarişlər POS history-də görünmür (admin/orders var, POS kassiri görmür). Filter siyahısı: all/dine_in/takeaway/delivery — **status filtri yoxdur** |
| Pagination qıraqı | List `limit=100` hardcode; route `totalCount` hesablayır amma `select=count` `head:true` olmadan → həmişə 0; UI-da "load more" yoxdur. 100 sifarişdan çox olan gün tarixçə kəsikir |
| Date filter TZ bugu | `date_from`/`date_to` UTC (`T00:00:00.000Z`) ilə qurulur; Baku UTC+4 → günün ilk 4 saati kəsilir, ertəsi gün 4 saat sızır |
| Search yalnız client-side | Son 100 sətirdə axtarır; DB-də `order_number ilike` dəstəyi yoxdur |
| Timeline cap | API 100 qaytarır, UI `slice(0,20)` göstərir — 20-dən çox eventli sifarişdə qalan görünmür |
| Refund modal | Var (full/partial/item) ✓ — bu hissə sağlam |

---

## 2. KASSA (CashDrawerPanel.tsx → /api/cash-drawer)

### 2.1 DB modeli (sağlam)
- `cash_drawer_sessions`: opening_balance, expected_balance, difference,
  status, opened_by/closed_by (staff FK), location_id ✓
- `cash_drawer_log`: type (open/close/cash_in/cash_out/payment/card_payment/
  refund/void/reopen), amount, description, **order_id**, **created_by**,
  created_at ✓
- Payment sətirləri order-a bağlı yazılır (test: order d5a7c20a → ₼13
  'payment' sətiri var) — **saxlanılır ✓**
- Manager PIN verification server-side (P-8 frozen set) ✓

### 2.2 DB-də var, UI-da YOX (movements log)
| Field | Detall |
|---|---|
| `order_id` → sifariş referansı | Hər 'payment' sətiri order-a aiddir, UI-da görünmür. Kassir "bu ₼13 hansı sifarişdi?" cavabını alamır. **FİKSEDİLƏCƏK**: API movements-ə order_number/table/order_source + created_by adını əlavə edəcək, UI sətirində göstərəcək |
| `created_by` (staff) | 'open' sətirində var, 'payment' sətirlərində NULL (payment flow created_by yazmır) — DB gap: payment sətirində staff atributu itir |

### 2.3 UI/zəif nöqtələr
| Məsələ | Detall |
|---|---|
| Active session card-da opening balance YOX | Sessiyin açılış məbləği yalnız "shift_entry" (today sessions) listində görünür, başlıca balans kartında yox |
| Movements log cap `max-h-48` + filter yoxdur | Uzun shift-də 30+ hərəkətdə scroll; type filter (yalnız ödənişlər/yalnız expense) yoxdur |
| Card total heç vaxt drawer-dan çıxılmır | 'card_payment' log type-i var amma ödəniş axını (pay route) card ödənişlərini cash_drawer_log-a yazmır — kart cəmi `session.card_total`-dan gəlir (open/close anında hesablanan) → **card ödənişlərinin sətir logu itir** (reconciliation üçün kritik) |
| Expected/difference live YOX | Fəaliyyətə sessiyada "gözlənilən balans" real-time göstərilmir (yalnız close modalında) |
| Reopen flow | UI-da reopen action yoxdur (DB type-i var; reopen admin tərəfindən) |

---

## 3. EDİLƏN FİKSLƏR (bu pass)
1. History timeline: `or(order_id,record_id)` sorğusu + staff name resolver ✓
2. Kassa API: movements enrichment (order ref + staff name) — **edilir**
3. Kassa UI: hərəkət sətirlərində order badge + kim ✓ — **edilir**
4. Kassa UI: active session card-a opening balance — **edilir**

## 4. TAVSİƏLƏR — STATUS (2026-09-23 benchmark pass-dan sonra)
1. ✅ History status filtrləri (refunded/cancelled/hamısı) + "load more" pagination
2. ✅ TZ düzgün date filter (local day bounds, `tz_offset_min`)
3. ✅ History detail: customer + delivery info + campaign adı + delivery fee + servis
4. ✅ DB: payment sətirlərinə `created_by` backfill trigger (`trg_cash_log_backfill_staff`, sessiyanın açanından) — dry-run PASS
5. ✅ DB: card ödənişləri `cash_drawer_log`-a düşür (`trg_payment_card_to_drawer`, type=card_payment, staff=performed_by) — dry-run PASS (test session + fake card payment, rollback)
6. ✅ Timeline cap 20 → 100
7. ✅ (bonus, Toast/Square parity): bill-counting, No Sale, Cash Drop, drawer lock,
   deposits, paused drawer ("Sonra say"), 4AM auto-close, /admin/cash-reports
   (Drawer History + Cash Activity + Close-Out-Day checklist) — migration
   `20260924000001_kassa_benchmark.sql`

---

## 5. FİNAL TOAST QAPILARI (2026-09-24, "toastdaki her şey?")

### 5.1 Z-Report "any time" (read-only daily Z, does NOT roll the day)
- POS Kassa panelinə `Z` action əlavə olundu (active session) + **sessiya
  açıq olmasa belə** "Z-Report" düyməsi (Toast semantics: Z he vaxt əlçatandır).
- **E2E cavi (bug)**: browser client-in Supabase JWT-yi yoxdur (custom PIN
  session → `anon` role) → `supabase.rpc('get_z_report')` = *permission denied*.
  **Fiks**: yeni `GET /api/reports/z?date=YYYY-MM-DD` route (service-role,
  `requireAuth`) — digər report route-ları ilə eyni pattern.
- Z görünüşü `z-report-print` class + `@media print` CSS ilə print-ready.
- E2E (2026-09-24): report render olunur — Satış/Ödənişlər/Ləğvlər(3, ₼11)/
  Kassa/Fəx bölmələri + ÇAP ET (screenshot `screenshots-2026-09-24/z-report-ok.png`).

### 5.2 Adjust Closing Entries (Toast "Edit Historical Data")
- API: `POST /api/cash-drawer` action `adjust_close` — sessiya **closed**
  olmalı; manager PIN + `cash.close.approve` permission; difference
  `computeExpected` (log-walk) ilə yenidən hesablanır;
  `approved_by` + `approval_note` (old dəyər daxil) stamp olunur;
  `cash_drawer_log`-a `adjust_close` sətiri düşür (status dəyişmir →
  state-guard trigger-a toxunmur).
- UI: closed sessiya sətirlərinə bənövşəyi **DÜZƏLT** düyməsi → form
  (gözlənilən/fərq + yeni məbləğ + səbəb + manager PIN) → confirm → toast.
- **E2E cavi (bug)**: adjust view "active session" branch-in içində idi →
  sessiya bağlandıqda (`session=null`) klik inert idi. **Fiks**: Z + adjust
  view-lar CONTAINER səviyyəsinə köçürüldü (sessiya olmasa da render olunur).
- E2E (2026-09-24): test sessiya 0.00₼ → 2.50₼ (PIN 4321) → DB sübutu:
  `adjust_close` log row (2.50, "E2E adjust test"), session closing_balance=2.50,
  difference=+2.50, approval_note="Manual adjustment (old: 0.00₼): E2E adjust
  test". Screenshot-lar: `adjust-form.png`, `adjust-done.png`, `adjust-verified.png`.
  Test sessiyaları + log sətirləri təmizləndi (residue 0).

### 5.3 Multi-location reports
- /admin/cash-reports + bütün kassa API-ları artıq operator-un **active
  location** context-inə bağlıdır (`resolveWriteLocationContext`) — global
  location switcher ilə ikinci locada da eyni report-lar (Toast: per-location
  drawer history). Heç bir əlavə iş tələb etmir.

### 5.4 Card auto-capture — N/A
- Payment provider (terminal) integrasiyası frozen payment core-a aiddir;
  bu POS-da kart ödənişi "manually captured" modeli ilə işləyir. Toast-da
  auto-capture provider configuration (Visa/MC gateway)-dir. Scope- dışında
  qeyd olundu (feature map; Wave C #1 altında ⏸ YADDADA — owner 09-24:
  "lazım olsa edəcəyik").

### 5.5 Custom error ekran — OPEN_SHIFT_REQUIRED (owner: "error ekranlarımız
yoxdurmu?")
- Problemi: POS-da clock-in button YOXDU (owner 09-21 istəyi ilə çıxarılıb —
  `handleClockIn` dead code idi). Vardiya olmadan kassa açmağa çalışanda
  raw DB kodu (`OPEN_SHIFT_REQUIRED`) toast-da düşürdü.
- **Həll (on-demand custom error dialog):** Kassa panelində `OPEN_SHIFT_REQUIRED`
  olduqda custom modal açılır: amber clock icon + "VARDIYA AÇIQ DEYIL" +
  izah + 2 düymə: **BAĞLA** və **İŞƏ BAŞLA (CLOCK-IN)** (green). Clock-in
  uğurla olarsa dialog öz-özünə bağlanır + kassa açma AUTO-RETRY olunur
  (operator-un niyyəti artıq təsdiqlənib). Digər raw kodlar (məs.
  'No active location in session') dost toast-lara map olunur.
- **E2E round-2 cavi (bug):** `handleClockIn` body-də `role_id: posSession?.role`
  göndərirdi — bu role NAME string-dir ('superadmin'), route isə staff.role_id
  UUID ilə müqayisə edir → shift yaradılır, amma `400 INVALID_ROLE` qayıtır →
  clock-in "fail" görünür (3 test shift-in hamısı `active_role_id=NULL` qalıb).
  Fiks: `role_id` göndərilir DEYİL (single-role model D-19; `active_role_id`
  heç bir yerdə oxunmur — dead column).
- E2E (round 3): PASS — dialog ~11s-də bağlanır (ilk req cold-compile), toast
  + active session view (Cari Balans) + cleanup BAĞLI. Screenshot:
  `screenshots-2026-09-24/shift-required-dialog.png`, `r3-after-clockin.png`.
  Test shift/sessiyalar təmizləndi (residue 0).
