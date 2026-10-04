# HANDOFF — ROUND 13a (2026-10-04) — INVENTORY: audit + dead-module revival

**Scope:** 12y-dəki təklif #4 (GÜN poll 30→60s = **12z**, ayrı commit `70ef7f4`) → owner:
"sonra kecek inventory" → 0-dan professional audit (code + live DB + E2E) + tapılan
dead-zonelərin revival + E2E r26 deep verify.

## 1. AUDIT NƏTİCƏLƏRİ (code explore + psql live DB)

**Baza:** 19 table/view (ingredients, inventory_logs, stock_counts/items, suppliers,
purchase_orders/items, invoices/items, recipes, recipe_items, waste_standards,
supplier_returns/items, current_stock+inventory_status+v_stock_health views).
Pages: stock (4 tab), counts, returns, waste-standards, recipes, purchase-orders,
audit, history, loss-prevention + POS touchpoints (return-to-stock/waste RPC-lər).
Cron: `stock-thresholds` **ACTIVE** (*/5, `check_stock_thresholds` — critical_limit
üzeri, 4s dedupe). Auto-consumption FROZEN engine = CANLI (661 order_consumption log).

**Tapılan kök (professional):**
1. **BROWSER CLIENT = ANON** (app-wide): browser-in Supabase REST session user JWT
   daşımayıb → bütün client read-lər RLS-dən 200+[] keçir, client write-lərin
   authenticated policy-si YOX idi. inventory_logs RLS = `is_superadmin()` =
   `current_setting('app.current_role')` — pooler bunu user JWT-də set ETMİR.
   → **Audit page = HEÇ VAXT data görməmişdi** (966 log, 0 görünən);
   **Stok Tarixçəsi = boş**; **Recipes modul = TAM DEAD** (12 reseptli məhsul,
   UI-da "0 resept"; constructor save = 3 RLS-blocked call + manual rollback);
   **ProcurementTab "Avto-sifariş Bildirişləri" = /api/notifications YOX idi** (404,
   catch{}-la sükut) + type mismatch (`supplier_auto_order` vs cron-un yazdığı `stock`).
2. **Orphaned routes:** /admin/stock/counts (sayım!), /admin/stock/returns,
   /admin/waste-standards — nav-da YOX (yalnız URL ilə) → DB-də 0 istifadə.
3. **Waste-standards route = phantom sütunlar:** `keyword_en`/`note` (+PATCH-də
   `updated_at`) DB-də YOX → POST 500, PATCH 500, GET AI-cache upsert = sükut fail
   (cache HEÇ persist olmayıb).
4. **Counts DELETE = silent no-op:** `.in(status,[draft,cancelled])` 0 sətir
   match etsə belə `success:true` (completed = audit record, silinmir — amma
   caller bilmiirdi).
5. **Dev-warm list:** 4 ölü route (adjustments/locations/transfers/receipts) hər
   dev boot-da 404.
6. **Data flags (owner qərarı):** 5 mənfi stok (Avokado −1290, Qırmızı kələm −650,
   Bənövşəyi soğan −550, Sésam −190, Tofu −100) + Doner əti 0 = phantom debt
   (stock-in edilməyib, consumption düşüb); `avakado` (192kg!) + `Qızardılmış soğan`
   (199kg) = şübhəli import dəyərləri; 4 məhsul reseptsiz (**Filadelfiya Classic**
   daxil — auto-consumption/86 onlara işləmir); 1 orphan resept
   (`a1b2c3d4-0001…` = kataloqda olmayan menyu id, 12 sətir); min_limit = 5
   placeholder (cron critical_limit istifadə etdiyi üçün blocker YOX).

## 2. FIX-LƏR (bütün = service-role API pattern; frozen RPC-lərə toxunulmayıb)

| # | Fix | Fayllar |
|---|---|---|
| 1 | **3 orphaned page → NAV** (Stok Sayımı / Tədarük Returns / İtki Standartları; `Scale`/`RotateCcw`/`Trash` saito-ikonları) + permissions (inventory.manage) + warm list cleanup | `adminNavLinks.ts`, `permissions.ts`, `AdminDesktopShell.tsx` |
| 2 | **`GET /api/notifications`** (yeni; type+limit filter) + ProcurementTab type fix (`supplier_auto_order`→`stock`) | `api/notifications/route.ts`, `ProcurementTab.tsx` |
| 3 | **`GET /api/inventory/logs`** (yeni; service-role + ingredient join + order context 1 call-da) → **audit page + Stok Tarixçəsi** keçdi | `api/inventory/logs/route.ts`, `admin/audit/page.tsx`, `admin/stock/page.tsx` |
| 4 | **Recipes modul = API migration:** `GET/POST/DELETE /api/recipes` (list/add/one-row delete), `POST /api/recipes/save` (constructor — atomic replace + has_active_recipe), `POST /api/recipes/ai-apply` (single+batch) → page + RecipeConstructorModal bütün client call-ları silindi | `api/recipes/*` (3 yeni), `admin/recipes/page.tsx`, `RecipeConstructorModal.tsx` |
| 5 | **Waste-standards** POST/PATCH/GET-upsert = yalnız real sütunlar (keyword, waste_percentage, category) + upsert error-check | `api/inventory/waste-standards/route.ts` |
| 6 | **Counts DELETE guard:** status check → 404/409 (artıq silent no-op yox) | `api/stock/counts/[id]/route.ts` |
| 7 | **İnventarizasiya modal: 0 icazədir** (fiziki sayım 0 = mənfi phantom-ın yeganə UI recovery yolu; mənfi hələ də bloklanır — doğru) | `admin/stock/page.tsx` |

## 3. E2E r26 (3 run, S0–S17, dark+light, console 0, 19 screenshot)

- **S0 root-cause probe** (audit boşluğunun network kanıtları) → fix #3 → **S10a: audit = 83 sətir CANLI** (3 Avokado E2E sətiri verbatim ✓, filter-lar ✓)
- **S3–S5 reversible stock cycle** (Avokado +1000/−100/−900, net 0 — DB verify) → **S12: Stok Tarixçəsi = 3 sətir CANLI**
- **S1 NAV** 3 yeni item ✓ · **S2 ANBAR** 34 sətir, mənfi-lər qırmızı ✓ · **S6 sayım full flow** (Mango 920=920, delta 0, completed) ✓ · **S7 return create+cancel** (R-E2E-13a) ✓ · **S8 waste-standards CREATE = 500** (fix #5-dən sonra **S10b: UI create+delete PASS**) · **S9 procurement feed = CANLI "Ehtiyat azalıb" kartları** (fix #2 kanıt) ✓ · **S10c recipes = "0 resept"** (fix #4-dən sonra **S14: 11 məhsul reseptli CANLI**, 4 reseptsiz verbatim: P8_PROD / Filadelfiya Classic / Coca-Cola 330ml / Kaliforniya Gold; **S15 constructor edit = 5 sətir load** (Doner) ✓) · **S10d PO** (2 × "Alındı") ✓ · **S11 light theme** ✓ · **S16 DELETE guard = 409** ✓ · **S17 counts list BOŞ** ✓

## 4. BACKEND VERIFY (psql, son)

stock_counts=0 · waste_standards=0 · supplier_returns=1 (cancelled) · ingredients=34 ·
Avokado = −1290 exact (net 0) · Mango adjustment = 0.000 (zero-delta) ·
orphan resept = 1 id (12 sətir) · cron `stock-thresholds` active.

## 5. OWNER QƏRAR GÖZLƏYƏNLƏRİ (business data — kod deyil)

1. **5 mənfi stok = sayım ilə düzəlir** (indi NAV-da!): Stok Sayımı → Avokado 0 (və ya
   fiziki dəyər) → apply → phantom debt temiz. Mənfi sayım DB CHECK-lə bloklanır (doğru).
2. **4 reseptsiz məhsul** (Filadelfiya Classic = flagship!): Constructor indi işləyir —
   BOM yaz (və ya AI suggest → təsdiq). P8_PROD = test məhsulu (silinməsi candidate).
3. **Şübhəli stock dəyərləri:** `avakado` (192,000 g!) + `Qızardılmış soğan`
   (199,460 g) — import qalıqları? Dedup/zero?
4. **Orphan resept** (`a1b2c3d4-0001…`, 12 sətir) — silinməsi candidate (kataloqda yox).
5. **App-wide client-auth audit** (növbəti round candidate): browser Supabase client
   anon-u digər modullarda da eyni latent bug yaradar (dashboard/customers/… —
   client read/write istifadə edən hər sahə). Inventory modul = artıq API-based (immune).

## 6. Qalan (13b+)

- i18n: inventory UI = hardcoded AZ (7 key) — localization round-u.
- Dual-write path canonical (min_limit vs critical_limit drift; /api/inventory vs
  /api/stock/ingredients).
- Batch/expiry tracking (⚪), multi-location transfers (❌), auto-PO (🟡) — §16 plan.
- `recipe_items` = `recipes`-in 100% mirror-i (60/60 pair) — legacy dead table
  (drop candidate, migration).
