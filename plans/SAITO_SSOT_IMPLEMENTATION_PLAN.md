# SAITO Admin — Single Source of Truth Implementation Plan

## Yandıq vəziyyət (təxmini)
- **Dependencies:** `pnpm install` tamamlandı.
- **Env:** `.env.local` real Supabase açarları ilə konfiqurasiya edilib.
- **Local düzəlişlər:** Git working tree-də faza 0 və faza 1 üzrə 16 faylda düzəlişlər aparılıb (commit edilməyib).
- **Qalan iş:** Faza 2–4 üzrə sahələri real data ilə əvəz etmək, mockları təmizləmək, ölü kodları silmək və workflow yaratmaq.

## İş prinsipi (workflow)
1. **Data yuxarıdan aşağı:** Frontend → `/api/*` → Supabase RPC/views → Postgres.
2. **Single source of truth:** Yeganə mənbə Supabase-dir. Hardcode, mock, localStorage fallback və ya test dataları yoxdur.
3. **Real-time + fallback:** Realtime abunəliyi əsas, offline/fallback üçün 30–60 saniyəlik polling.
4. **Test döngüsü:** Hər faza bitdikdə `pnpm dev` ilə Supabase-a qarşı test edilir.

---

## FAZA A — ƏSAS DÜZLİŞLƏRİ COMMİT ET (hazırda working tree-dədir)

**Hədəf:** Hazır real-dəyişikliklər commit edilir, baza sabitləşir.

| Fayl | Düzəliş |
|-----|---------|
| `src/app/api/stats/route.ts` | `NEXT_PUBLIC_SUPABASE_URL` env səhvi düzəldi |
| `src/app/admin/stock/components/IntelligenceTab.tsx` | `.suggestions` və `.insights` response shape düzəldi |
| `src/app/admin/stock/components/CalibrationSuggestionsPanel.tsx` | `actualStock` / `theoreticalStock` ötürülür |
| `src/app/admin/recipes/components/RecipeConstructorModal.tsx` | Modal açılan kimi AI çağırışı (side-effect) ləğv edildi |
| `src/app/admin/recipes/components/IntelligenceTab.tsx` | Waste endpoint düzəldi |
| `src/app/admin/recipes/page.tsx` | Sürətli əlavədə `quantity_brutto` və `hot_waste_percentage` yazılır |
| `src/app/api/recipes/clear-all/route.ts` | `products.has_active_recipe = false` endir |
| `src/app/api/recipes/margin-analysis/route.ts` | `quantity_brutto` ilə maya hesablanması |
| `src/app/api/recipes/waste-analysis/route.ts` | `cost_variance_pct` və actual/theoretical marja |
| `src/app/lib/stockAutomation.ts` | `reference_type`, `reference_id` əlavə edildi |
| `src/app/admin/stock/page.tsx` | Tarixçə modalı, stok girişi/itzki routing |
| `src/app/admin/products/page.tsx` | Yaddaşdakı məhsul yeniləndikdə `/api/products/costs` çağırılır |
| `src/app/admin/pos/page.tsx` | `cartCounts` və `outOfStock` real data, `handleRecordLoss` əlavə edildi |
| `src/app/api/pos/tables/route.ts` | `last_activity_at` real zaman döndürülür |

**Əməliyyat:** 
```bash
git add -A && git commit -m "fix: real Supabase data sync across stock, recipes, products, pos, stats"
```

---

## FAZA B — KİTCHEN / SOLD-OUT VƏ DEAD CODE TƏMİZLİYİ

| # | Problem | Təyinedici fayl | Düzəliş |
|---|---------|----------------|---------|
| B1 | Kitchen-də sold-out `quantity:999999` waste hack | `kitchen/page.tsx` | `set_ingredient_sold_out` RPC ilə `current_stock = 0`, log tipi `adjustment` |
| B2 | `/api/orders?status=active` parametri ignore | `api/orders/route.ts` | `status=eq.active` query dəstəyi |
| B3 | `MergedGroupCard`, `AIPremiumCard`, `HorizontalOrderCard` ölü kod | müxtəlif komponentlər | `rm` |
| B4 | `split`, `paid`, `cancel` route-lar ölü | `app/api/orders/*` | `rm` |
| B5 | `onPrint={window.print()}` tam səhifə çap edir | `pos/page.tsx` | `ReceiptModal` ilə real çek |

---

## FAZA C — DASHBOARD / STATS REAL DATA

| # | Problem | Təyiedici fayl | Düzəliş |
|---|---------|----------------|---------|
| C1 | Stats env bug (faza 0-da həll) | `api/stats/route.ts` | ✅ |
| C2 | `forecast`/`anomalies` heç vaxt doldurulmur | `stats/page.tsx` | `/api/stats`ə `forecast` və `anomalies` əlavə et, warm-start üçün localStorage cache kəsmək |
| C3 | HeroBanner dekorativ sparkline | `HeroBanner.tsx` | `last_7_days` revenue data ilə mini chart |
| C4 | `tableCount=12` hardcode fallback | `HeroBanner.tsx`, `LiveFloorSnapshot.tsx` | `/api/dashboard/stats`dən real table count oxu |
| C5 | Yoji Advice fallback mətnlər real data ilə əvəz edilir | `admin/page.tsx` | Zəif göstəricilər üçün konkret müşavirət mətni |

---

## FAZA D — MƏHSULLAR / RESEPTLƏR — REAL COST + MOCK Təmizliyi

| # | Problem | Təyiedici fayl | Düzəliş |
|---|---------|----------------|---------|
| D1 | `autoTranslateMissing` hər refresh-də DB-yə yazır | `products/page.tsx` | Sadəcə `language !== 'az'` olduqda və `useEffect` dependencies-dən `products`-ı kənarlaşdır, yaxud `useRef` ilə “artıq tərcümə edildi” bayrağı qoy |
| D2 | `confidence: 0.7` hardcode | `api/recipes/ai-suggest/route.ts` | `match_confidence` adambaşı hesabla (məs. `matchedIngredients / totalIngredients`) |
| D3 | `calcBrutto` integer yuvarlaqlaşdırır | `admin/recipes/components/RecipeConstructorModal.tsx` | `Math.round(qtyBrutto * 100) / 100` |
| D4 | Product `cost_price` / `profit_margin` görüntülənmir | `admin/products/page.tsx` | `products/costs` API-sindən gələn dəyərləri göstər, hər dəfə `fetchData` sonrası yenilə |

---

## FAZA E — SİFARİŞLƏR / ÖDƏNİŞLƏR — İKİQAT ÇıXıLMA

| # | Problem | Təyiedici fayl | Düzəliş |
|---|---------|----------------|---------|
| E1 | `mark_order_ready` + `process_order_payment` hər ikisi inventory toxunur | `useOrders.ts` + RPC-lər | `process_order_payment` RPC-də mövcud `p_deduct_stock` bayrağı (false qoy); `process_order_payment` özü stock-dən çıxarır, `mark_order_ready` sadəcə status dəyişir |
| E2 | Bill-split tam ölüdür | `OrderModal`, `api/orders/bill-split` | `api/orders/bill-split` route-u və `BillSplitModal` komponentini tam funksional edir |
| E3 | `handleCloseBill` kart/nağd split-i ignore | `pos/page.tsx` | `handleCloseBill` `payment_method` və `cash_amount`/`card_amount` ilə çağır |
| E4 | `onPrint={window.print()}` | `pos/page.tsx` | `ReceiptModal` aç, şəklin və ya metnin `window.print()` əvəzinə `@react-pdf/renderer` ilə PDF yarat |

---

## FAZA F — MOBİL STATS MOCK VƏ ANOMALİ

| # | Problem | Təyiedici fayl | Düzəliş |
|---|---------|----------------|---------|
| F1 | Mobil chat və what-if mock | `StatsMobileView.tsx` | `/api/sensei/chat` və `/api/sensei/what-if` API-lərinə bağla |
| F2 | forecast/anomalies heç vaxt doldurulmur | `stats/page.tsx` | `/api/stats` cavabına `forecast` və `anomalies` əlavə edirik |

---

## FAZA G — WORKFLOW VƏ TEST

1. **CI/Tests:** `pnpm lint`, `pnpm typecheck`, `pnpm build` wrapper script yaz.
2. **Dev server:** `pnpm dev` ilə təmiz başlatma testi.
3. **Supabase health:** `/api/dashboard/stats` və `/api/stats` endpoints-lərinin 200 gətirdiyini yoxla.
4. **Smoke test:** Dashboard → Products → Recipes → Stock → POS → Orders → Kitchen sıfırdan keç.

---

## Risklər
- **İkiqat stok çıxılma:** DB-də `process_order_payment` və `mark_order_ready` eyni order üçün iki dəfə deduksiya edirsə, inventar mənfi gedə bilər.
- **Auto-translate side-effect:** Hər fetch-də translate API-sinə yazılan `/api/translate-text` DB-mutation edirsə, onu optimize etmək lazımdır.
- **Dead code təmizliyi:** Köhnə komponentləri silərkən import-ların qırılmasına diqqət et.
