# SAITO Admin — Bərpa & Sabitləşdirmə Planı (Single Source of Truth)

**Məqsəd:** Səhifələr dağınıq deyil, real Supabase datası ilə işləyən **vahid workflow** olsun.
Hardcode / mock / sınıq sync-lər aradan qaldırılsın. İş **fazalarla** (hər faza 2-3 səhifə) gedəcək.

**Layihə:** `artifacts/saito-admin` (Next.js 16, App Router)
**Supabase:** `jbxmlnsicbfkbsatnoej` (Frankfurt) — real data mövcuddur:
orders=359, order_items=805, products=14, ingredients=34, recipes=60, inventory_logs=506 (480 order_consumption).

---

## ⚠️ FAZA 0 — TƏMƏL / KRİTİK (əvvəlcə bu, yoxsa qalanı mənasızdır)

Bu problemlər səbəbindən proqram real datanı **brauzerdə ümumiyyətlə oxuya bilmir** → səhifələr boş/hardcode görünür.

1. **`.env.local` açarları saxtadır** (`artifacts/saito-admin/.env.local`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder` → bütün client-side Supabase sorğuları uğursuz.
   - `SUPABASE_SERVICE_ROLE_KEY=S03Pm26Nu8nI0hl5` → saxta (JWT deyil) → API route-lar sınıq.
   - **Düzəliş:** real anon + service_role JWT açarları qoyulacaq (əldə edilib).
2. **Stats API-də env adı səhvi** — `src/app/api/stats/route.ts:57`
   `process.env.NEXT_PUBLIC_supabaseUrl` (kiçik hərf) → həmişə boş → bütün Stats səhifəsi sıfır göstərir.
   **Düzəliş:** `NEXT_PUBLIC_SUPABASE_URL`.
3. **Local yoxlama mühiti:** `pnpm` yoxdur (build script pnpm istəyir). Qurulacaq və `pnpm install` + `pnpm dev` ilə real işlədilib test ediləcək.

**Nəticə:** Bu fazadan sonra əksər səhifələr real datanı avtomatik göstərməyə başlayacaq.

---

## FAZA 1 — STOK / İNVENTAR (`/admin/stock` + returns + counts)

**Vəziyyət:** Əsas panel real data oxuyur (`/api/inventory`, `inventory_status` view), realtime var. Amma bir neçə düymə/tab sınıqdır.

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | "Stok Girişi" və "İtki Qeydi" düymələri mövcud olmayan `/api/inventory/logs`-a POST edir → həmişə 404 | `stock/page.tsx:124` | Yüksək |
| 2 | Intelligence "Təkliflər" tabı crash — `setSuggestions(await r.json())` obyekt qaytarır, `.filter` çağırılır | `stock/components/IntelligenceTab.tsx:39,57,82` | Yüksək |
| 3 | Intelligence "İnsaytlar" tabı crash — `setInsights(await r.json())`; düzgünü `.insights` | `IntelligenceTab.tsx:47,150` | Yüksək |
| 4 | Kalibrasiya "Tətbiq et" həmişə 400 — panel `actualStock` göndərmir | `CalibrationSuggestionsPanel.tsx:69-73` | Yüksək |
| 5 | InspectorPanel "Tarixçə" düyməsi heç nə etmir (no-op) | `stock/page.tsx:378`, `InspectorPanel.tsx:179` | Orta |
| 6 | Suppliers kartında "Ətraflı →" düyməsində handler yoxdur | `stock/page.tsx:273` | Aşağı |
| 7 | "AI" adlandırması yanıltıcı (sadə variance qaydası, model çağırışı yoxdur) | calibration/insights routes | Aşağı |

**Düzəliş yanaşması:** stock_in/waste → mövcud `/api/stock/stock-in` route-una bağlamaq; response-shape uyğunsuzluqlarını düzəltmək; kalibrasiya apply-a `actualStock` ötürmək; Tarixçə üçün `inventory_logs`-dan real tarixçə çəkmək; ölü düymələri ya bağlamaq ya silmək.

---

## FAZA 2 — RESEPTLƏR + MƏHSULLAR (`/admin/recipes`, `/admin/products`)

**Vəziyyət:** Real data + realtime var. Amma maya/marja sync olunmur, bir tab tamam sınıqdır, bir side-effect var.

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | Reseptlər Intelligence "Tullantı" tabı səhv endpoint-ə bağlı → `₼undefined` | `recipes/components/IntelligenceTab.tsx:33` | Yüksək |
| 2 | Konstruktor modalı **açılan kimi** avtomatik AI çağırır və bazaya AI-resept yazır (save-siz mutasiya) | `RecipeConstructorModal.tsx:87-93` | Yüksək |
| 3 | Məhsulların `cost_price`/`profit_margin` heç vaxt yenilənmir — `/api/products/costs` heç yerdən çağırılmır → cədvəldə maya/marja köhnə/boş | `products/page.tsx`, `api/products/costs` | Yüksək |
| 4 | `waste-analysis` route-da `cost_variance_pct=0` hardcode, actual==theoretical (saxta) | `api/recipes/waste-analysis:114,123,131` | Orta |
| 5 | Maya bazası uyğunsuz: modal `quantity_brutto`, margin API `quantity_required` → ekranlar fərqli marja göstərir | recipes routes vs modal | Orta |
| 6 | Sürətli resept əlavəsi `quantity_brutto`/`hot_waste_percentage` yazmır | `recipes/page.tsx:120` | Orta |
| 7 | `clearAllRecipes` `has_active_recipe` bayrağını sıfırlamır → orphan bayraqlar | `recipes/page.tsx:141` | Aşağı |
| 8 | `autoTranslateMissing` hər refresh-də DB-yə yazır (təkrar side-effect) | `products/page.tsx:171` | Aşağı |
| 9 | `confidence:0.7` hardcode; `calcBrutto` integer-ə yuvarlaqlaşdırır | ai-suggest:81, modal:135 | Aşağı |

**Düzəliş yanaşması:** Waste tabı düzgün endpoint-ə; auto-AI side-effect-i istifadəçi əməli ilə şərtləndirmək; save-dən sonra maya/marjanı yenidən hesablayıb yazmaq (single source of truth); maya bazasını (brutto) hər yerdə uyğunlaşdırmaq.

---

## FAZA 3 — POS + SİFARİŞLƏR + MASALAR (`/admin/pos`, `/admin/orders`, `/admin/tables`)

**Vəziyyət:** Əsas axın (POS→sifariş→ödəniş→stok) işləyir və realdır. Amma ikincili funksiyalar sınıq + **stok ikiqat çıxılma riski**.

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | **Stok ikiqat çıxılma:** `mark_order_ready` VƏ `process_order_payment` RPC-lərinin ikisi də inventar toxunur (DB-də təsdiqləndi) | RPC + `orders/mark-ready:43`, `orders/pay` | Yüksək |
| 2 | Bill-split tam ölüdür — route+modal+`onSplit` var, amma UI heç vaxt bağlamır | `BillSplitModal`, `OrderModal:1482`, `ReceiptModal:250` | Orta |
| 3 | POS "İtki" (loss) axını ölü — `onRecordLoss` heç vaxt ötürülmür | `CartPanel`, `pos/page.tsx` | Orta |
| 4 | POS masa "dwell timer" işləmir — `/api/pos/tables` `last_activity_at` qaytarmır | `TableCard.tsx:35-51`, `api/pos/tables` | Orta |
| 5 | POS `cartCounts={{}}` və `outOfStock=new Set()` hardcode → badge/out-of-stock heç vaxt işləmir | `pos/page.tsx:285-286` | Orta |
| 6 | `handleCloseBill` həmişə card ödəniş (cash split-i ignore) | `pos/page.tsx:49-91` | Aşağı |
| 7 | `onPrint={window.print()}` bütün səhifəni çap edir (real çek yoxdur) | `pos/page.tsx:313` | Aşağı |
| 8 | `/api/orders?status=active` param-ı API-də ignore olunur (client-side filtr işləyir, kontrakt yanıltıcı) | `KDSView:34`, `api/orders/route.ts` | Aşağı |
| 9 | Ölü kod: `MergedGroupCard`, `AIPremiumCard`, `HorizontalOrderCard`, routes `split`/`paid`/`cancel` | müxtəlif | Aşağı |

**Düzəliş yanaşması:** İkiqat çıxılmanı bir mərhələyə (ya ready, ya pay) endirmək + idempotentlik təsdiqi; bill-split & loss axınını ya bağlamaq ya təmiz silmək; POS badge/out-of-stock/timer üçün real data ötürmək; nağd/kart split-i düzəltmək.

---

## FAZA 4 — DASHBOARD + STATS + KİTCHEN/KDS (`/admin`, `/admin/stats`, `/kitchen`)

**Vəziyyət:** Dashboard home realdır. Stats səhifəsi env səhvinə görə sınıqdır (Faza 0-da düzəlir), üstəgəl ölü/mock hissələr.

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | Stats env səhvi (Faza 0-da) — bütün KPI sıfır | `api/stats/route.ts:57` | Kritik |
| 2 | `forecast`/`anomalies` heç vaxt doldurulmur → AI Forecast paneli ölü UI | `stats/page.tsx:44-45`, `StatsAIForecast.tsx` | Yüksək |
| 3 | Mobil Stats: chat və what-if **mock** (`setTimeout` fake cavab) | `StatsMobileView.tsx:60-79` | Yüksək |
| 4 | HeroBanner: dekorativ sparkline SVG + trend oxları real data deyil (yanıltıcı) | `HeroBanner.tsx:196-215,274-322` | Aşağı |
| 5 | Kitchen sold-out `quantity:999999` waste hack → `inventory_logs` çirklənir | `kitchen/page.tsx:966` | Orta |
| 6 | `tableCount=12` bir neçə widget-də hardcode fallback | HeroBanner:36, LiveFloorSnapshot:36 | Aşağı |

**Düzəliş yanaşması:** Faza 0-dan sonra Stats real işləyəcək; forecast/anomaly ya real API-yə bağlanacaq ya UI gizlədiləcək; mobil mock-lar real API-yə bağlanacaq; sold-out hack-i təmiz "set to zero" RPC ilə əvəzləmək.

---

## İŞ QAYDASI

- Hər faza ayrıca aparılacaq; faza sonunda `pnpm dev` ilə real Supabase datasına qarşı yoxlanılacaq.
- Heç bir səhifə silinmir; funksiyalar real dataya bağlanır və ya ölü kod təmizlənir.
- Faza 0 mütləq birinci. Sonra razılaşdığın ardıcıllıqla 1→2→3→4.

## AÇIQ SUALLAR (təsdiq lazımdır)
1. Faza ardıcıllığı bu qaydada olsun, yoxsa əvvəl hansısa səhifə? (məs. əvvəl POS/Orders?)
2. Ölü funksiyalar (bill-split, loss, AI forecast, mobil what-if) — **tamamlanıb işlək** edilsin, yoxsa **UI-dan təmiz silinsin**?
3. `.env.local`-a real açarları yazmağa icazə (lokal, git-ə düşmür)?
