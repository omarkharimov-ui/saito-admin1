# SAITO Admin — Bərpa & Sabitləşdirmə Planı (Single Source of Truth)

**Məqsəd:** Səhifələr dağınıq deyil, real Supabase datası ilə işləyən **vahid workflow** olsun.
Hardcode / mock / sınıq sync-lər aradan qaldırılsın. İş **fazalarla** (hər faza 2-3 səhifə) gedəcək.

**Layihə:** `artifacts/saito-admin` (Next.js 16, App Router)
**Supabase:** `jbxmlnsicbfkbsatnoej` (Frankfurt) — real data mövcuddur:
orders=359, order_items=805, products=14, ingredients=34, recipes=60, inventory_logs=506 (480 order_consumption).

**Razılaşdırılmış qərarlar (istifadəçi təsdiqlədi):**
- `.env.local` real açarlarla **yalnız lokaldan** yazılacaq; git-ə düşmür. GROQ_API_KEY istənilərsə istifadəçi verəcək.
- Ölü funksiyalar **tam işlək ediləcək** (silinməyəcək): bill-split, loss/İtki, AI forecast, mobil what-if.
- Faza ardıcıllığı: **0 → 1 → 2 → 3 → 4**.
- Hər faza sonunda `pnpm dev` ilə real Supabase datasına qarşı yoxlanılacaq.

---

## ⚠️ FAZA 0 — TƏMƏL / KRİTİK (əvvəlcə bu, yoxsa qalanı mənasızdır)

Bu problemlər səbəbindən proqram real datanı **brauzerdə ümumiyyətlə oxuya bilmir** → səhifələr boş/hardcode görünür.

1. **`.env.local` açarları saxtadır** (`artifacts/saito-admin/.env.local`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder` → bütün client-side Supabase sorğuları uğursuz.
   - `SUPABASE_SERVICE_ROLE_KEY=S03Pm26Nu8nI0hl5` → saxta (JWT deyil) → API route-lar sınıq.
   - **Düzəliş:** real anon + service_role JWT açarları qoyulacaq (əldə edilib; `.env.local` yalnız lokaldır, git-ə düşmür).
2. **Stats API-də env adı səhvi** — `src/app/api/stats/route.ts:57`
   `process.env.NEXT_PUBLIC_supabaseUrl` (kiçik hərf) → həmişə boş → bütün Stats səhifəsi sıfır göstərir.
   **Düzəliş:** `NEXT_PUBLIC_SUPABASE_URL`.
3. **Lokal yoxlama mühiti:** `pnpm` yoxdur (build script pnpm istəyir). Qurulacaq, `pnpm install` + `pnpm dev` ilə real işlədilib test ediləcək.
4. `supabase link` icra ediləcək (`--project-ref jbxmlnsicbfkbsatnoej`) ki, gələcək migrasiyalar/DB düzəlişləri plana uyğun getsin.

**Nəticə:** Bu fazadan sonra əksər səhifələr real datanı avtomatik göstərməyə başlayacaq.

---

## FAZA 1 — STOK / İNVENTAR (`/admin/stock` + returns + counts)

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | "Stok Girişi" və "İtki Qeydi" düymələri mövcud olmayan `/api/inventory/logs`-a POST edir → həmişə 404 | `stock/page.tsx:124` | Yüksək |
| 2 | Intelligence "Təkliflər" tabı crash — `setSuggestions(await r.json())` obyekt qaytarır, `.filter` çağırılır | `stock/components/IntelligenceTab.tsx:39,57,82` | Yüksək |
| 3 | Intelligence "İnsaytlar" tabı crash — `setInsights(await r.json())`; düzgünü `.insights` | `IntelligenceTab.tsx:47,150` | Yüksək |
| 4 | Kalibrasiya "Tətbiq et" həmişə 400 — panel `actualStock` göndərmir | `CalibrationSuggestionsPanel.tsx:69-73` | Yüksək |
| 5 | InspectorPanel "Tarixçə" düyməsi heç nə etmir (no-op) | `stock/page.tsx:378`, `InspectorPanel.tsx:179` | Orta |
| 6 | Suppliers kartında "Ətraflı →" düyməsində handler yoxdur | `stock/page.tsx:273` | Aşağı |
| 7 | "AI" adlandırması yanıltıcı (sadə variance qaydası, model çağırışı yoxdur) | calibration/insights routes | Aşağı |

**Düzəliş:** stock_in/waste → mövcud `/api/stock/stock-in` route-una bağlamaq; response-shape uyğunsuzluqlarını düzəltmək; kalibrasiya apply-a `actualStock` ötürmək; Tarixçə üçün `inventory_logs`-dan real tarixçə çəkmək; ölü düymələri bağlamaq.

---

## FAZA 2 — RESEPTLƏR + MƏHSULLAR (`/admin/recipes`, `/admin/products`)

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | Reseptlər Intelligence "Tullantı" tabı səhv endpoint-ə bağlı → `₼undefined` | `recipes/components/IntelligenceTab.tsx:33` | Yüksək |
| 2 | Konstruktor modalı **açılan kimi** avtomatik AI çağırır və bazaya AI-resept yazır (save-siz mutasiya) | `RecipeConstructorModal.tsx:87-93` | Yüksək |
| 3 | Məhsulların `cost_price`/`profit_margin` heç vaxt yenilənmir — `/api/products/costs` heç yerdən çağırılmır → cədvəldə maya/marja köhnə/boş | `products/page.tsx`, `api/products/costs` | Yüksək |
| 4 | `waste-analysis` route-da `cost_variance_pct=0` hardcode, actual==theoretical (saxta) | `api/recipes/waste-analysis:114,123,131` | Orta |
| 5 | Maya bazası uyğunsuz: modal `quantity_brutto`, margin API `quantity_required` → ekranlar fərqli marja | recipes routes vs modal | Orta |
| 6 | Sürətli resept əlavəsi `quantity_brutto`/`hot_waste_percentage` yazmır | `recipes/page.tsx:120` | Orta |
| 7 | `clearAllRecipes` `has_active_recipe` bayrağını sıfırlamır → orphan bayraqlar | `recipes/page.tsx:141` | Aşağı |
| 8 | `autoTranslateMissing` hər refresh-də DB-yə yazır (təkrar side-effect) | `products/page.tsx:171` | Aşağı |
| 9 | `confidence:0.7` hardcode; `calcBrutto` integer-ə yuvarlaqlaşdırır | ai-suggest:81, modal:135 | Aşağı |

**Düzəliş:** Waste tabı düzgün `/api/recipes/waste-analysis`-ə; auto-AI side-effecti istifadəçi əməli ilə şərtləndirmək; save-dən sonra maya/marjanı yenidən hesablayıb yazmaq (**single source of truth**); maya bazasını (brutto) hər yerdə uyğunlaşdırmaq.

---

## FAZA 3 — POS + SİFARİŞLƏR + MASALAR (`/admin/pos`, `/admin/orders`, `/admin/tables`)

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | **Stok ikiqat çıxılma:** `mark_order_ready` VƏ `process_order_payment` RPC-lərinin ikisi də inventar toxunur (DB-də təsdiqləndi) | RPC + `orders/mark-ready:43`, `orders/pay` | Yüksək |
| 2 | Bill-split tam ölüdür — route+modal+`onSplit` var, amma UI heç vaxt bağlamır (**TAM İŞLƏK EDİLƏCƏK**) | `BillSplitModal`, `OrderModal:1482`, `ReceiptModal:250` | Orta |
| 3 | POS "İtki" (loss) axını ölü — `onRecordLoss` heç vaxt ötürülmür (**TAM İŞLƏK EDİLƏCƏK**) | `CartPanel`, `pos/page.tsx` | Orta |
| 4 | POS masa "dwell timer" işləmir — `/api/pos/tables` `last_activity_at` qaytarmır | `TableCard.tsx:35-51`, `api/pos/tables` | Orta |
| 5 | POS `cartCounts={{}}` və `outOfStock=new Set()` hardcode → badge/out-of-stock heç vaxt işləmir | `pos/page.tsx:285-286` | Orta |
| 6 | `handleCloseBill` həmişə card ödəniş (cash spliti ignore) | `pos/page.tsx:49-91` | Aşağı |
| 7 | `onPrint={window.print()}` bütün səhifəni çap edir (real çek yoxdur) | `pos/page.tsx:313` | Aşağı |
| 8 | `/api/orders?status=active` param-ı API-də ignore olunur (client-side filtr işləyir, kontrakt yanıltıcı) | `KDSView:34`, `api/orders/route.ts` | Aşağı |
| 9 | Ölü kod: `MergedGroupCard`, `AIPremiumCard`, `HorizontalOrderCard`, routes `split`/`paid`/`cancel` | müxtəlif | Aşağı |

**Düzəliş:** İkiqat çıxılmanı bir mərhələyə (ya ready, ya pay) endirmək + idempotentlik təsdiqi (RPC daxilində və ya `stockAutomation.deductStockForOrder` idempotency ilə); **bill-split və loss axınını tam işlək bağlamaq**; POS badge/out-of-stock/timer üçün real data ötürmək; nağd/kart spliti düzəltmək; `AIPremiumCard` düymələrini bağlamaq və ya sadələşdirmək.

---

## FAZA 4 — DASHBOARD + STATS + KİTCHEN/KDS (`/admin`, `/admin/stats`, `/kitchen`)

| # | Problem | Fayl:sətir | Ağırlıq |
|---|---------|-----------|---------|
| 1 | Stats env səhvi (Faza 0-da) — bütün KPI sıfır | `api/stats/route.ts:57` | Kritik |
| 2 | `forecast`/`anomalies` heç vaxt doldurulmur → AI Forecast paneli ölü UI (**TAM İŞLƏK EDİLƏCƏK**) | `stats/page.tsx:44-45`, `StatsAIForecast.tsx` | Yüksək |
| 3 | Mobil Stats: chat və what-if **mock** (`setTimeout` fake cavab) (**TAM İŞLƏK EDİLƏCƏK**) | `StatsMobileView.tsx:60-79` | Yüksək |
| 4 | HeroBanner: dekorativ sparkline SVG + trend oxları real data deyil (yanıltıcı) | `HeroBanner.tsx:196-215,274-322` | Aşağı |
| 5 | Kitchen sold-out `quantity:999999` waste hack → `inventory_logs` çirklənir | `kitchen/page.tsx:966` | Orta |
| 6 | `tableCount=12` bir neçə widget-də hardcode fallback | HeroBanner:36, LiveFloorSnapshot:36 | Aşağı |

**Düzəliş:** Faza 0-dan sonra Stats real işləyəcək; forecast/anomaly real API-yə (`/api/sensei/...` və ya mövcud stats hesablamaları) bağlanacaq; **mobil chat/what-if real API-yə bağlanacaq**; sold-out hacki təmiz "set to zero" RPC ilə əvəzləmək; dekorativ SVG-ləri real trend məlumatı ilə əvəzləmək və ya silmək.

---

## VALİDASİYA (hər fazadan sonra)
- `pnpm dev` → real Supabase (pooler: `aws-1-eu-central-1.pooler.supabase.com`) datasına qarşı açılır.
- Əsas axın əl ilə yoxlanılır: POS-da sifariş → ödəniş → `inventory_logs` rows-da 1 dəfə (ikiqat yox) `order_consumption` yazılır.
- `tsc --build` + `pnpm lint` təmiz keçir.
- Stats səhifəsi real KPI göstərir (sıfır deyil); crash olan tablar açılır.

## RİSKLƏR
- `process_order_payment` RPC daxilində artıq idempotentlik ola bilər — Faza 3-də RPC mənbəyi oxunub təsdiqlənəcək.
- `inventory_status`, `current_stock` view-ləri və RPCs (`perform_stock_audit`, `process_stock_in`, `process_supplier_return`, `apply_stock_count`) mövcudluğu DB-də təsdiqlənib.
- GROQ_API_KEY olmadan bəzi "AI" hissələri (waste-standards, sensei) real dataya fallback edəcək.
