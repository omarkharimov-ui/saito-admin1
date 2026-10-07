# HANDOFF 13p — Stok UI tam 0-dan (2026-10-08) + Supabase egress BLOCKER + SaaS yol xəritəsi

## Owner mandatı (söz-lə-söz)
> "basla 0 dan tam yeni, tam 0-dan qur, bildiyin mövcud UI sil, tam yenisini yaz, bax digər səhifələrdən ilham al, başla"
> (sonra) "brauzerdən bax, Supabase-ə mən girdim, sən bax, oradan nə olar özün düzəlt, upgrade ETMƏ, nə isə et"
> (sonra) "app-i satmaq üçün mütləq upgrade etməm lazım… fərqli restoran dediyim eyni sahibkarın fərqli filialları DEYİL — fərqli sahibkarların fərqli restoranları"
> (sonra) "Pro-nu pul yoxdur, alelik onsuz davam edək, ilk müştəri qazanan kimi edək, aylıq"
> (sonra) "indi heçnəyə etmalı heçnə yoxdur, handoffu qaydaları tamam şəkildə doldur, yaz harada qalmışdıq, push main elə; **ayrı bir project fikrim var**"

## Nə edildi (13p — shell rewrite)
**Scroll-spy maşını TAM silindi.** 13n/13o-nun bütün bug sinfi (r38/r39/r39c/r39d:
sticky pill nav, MutationObserver reflow-spy, URL write-back, settle-lock, jump/oscillation)
aradan qaldırıldı. Yerində app-in **focused-view dili** (gift-cards / customers / products):

- **`stock/page.tsx` REWRITE (~176 sətir):**
  - `PageHeaderCard` (serif display title "STOK" + dinamik subtitle) + **4 ZONE pill**
    (accent-soft, `layoutId="stock-zone-pill"` spring morph) = primary nav.
  - **TƏK sabit scroll body** (page-owned `overflow-y-auto`) — spy/anchor/settle-lock YOX.
  - **Deep link = ONE-WAY:** `?view`/`?tab`/`?sub`/`?ingredient` URL→state oxunur,
    **URL-a heç vaxt write-back YOX** (gift-cards heç nə sync-etmir) → reflow-la
    savaşacaq / oscillate edəcək heç nə yoxdur. Bütün 13f/13h/13i legacy `?view=`
    (anbar/intelligence/buy/invoice/po/orders/suppliers/counts/waste/returns/anomalies/
    report/trends/audit) + `?view=recipes`→`/admin/recipes` redirect saxlanılır.
  - Zone = plain React state; tab swap = `key` + 0.18s fade (y-slide YOX — 13m lesson).
  - Elevated optimistic gating preserved (`!authChecked || role∈{superadmin,owner}`).
- **`next/StockZone.tsx`:** prop `gotoSection(sectionId)` → `onNavigate(zone, sub)`;
  4 CTA (hero "Sayım et"/"Nə Alım"/"İtki" + metrics "mənfi") scroll əvəzinə **tab-switch**
  edir. Qalan data engine (realtime 1.5s coalesce, freshness, advisor, Anbar, push panels)
  **toxunulmayıb**.
- **SİLİNDİ:** `next/Shell.tsx`, `next/useScrollSpy.ts`, `components/StockTab.tsx` (legacy).

## Saxlanıldı (data contract — toxunulmayıb)
Bütün `api/**` route-lar · `stock-ui.tsx` (primitiv kit: FullPanel/Drawer/DataTable/Chip/
Stat/formatter/Seg — 3 xarici səhifə import edir) · `useAsyncView` · 4 zone engine
(StockZone + ProcurementHub/OperationsHub/AnalyticsHub) + bütün API-bound leaf
(counts-content, returns-content, ReportsTab, purchase-orders-content, waste-standards-content,
audit-content, InspectorPanel, OrderGuideSection, InvoiceUploadSection, SuppliersSection,
AdvisorCard). **Qeyd:** 3 hub-un sub-tab chrome (13o, öncə uncommitted) bu shell-də işləyir + commit olundu.

## VƏZİYYƏT: ⚠ PRE-E2E (DB suspended)
- **tsc: 0 error.** Code + shell hazır.
- **E2E keçirilməYİB** — Supabase project **suspended** (aşağı), app down.
- **Birinci əməliyyat DB qayıtdıqda** = 13p E2E (matrix aşağıda) + 13q (ölçərək).

## ⛔ SUPABASE EGRESS BLOCKER (root cause + status)
- Project `jbxmlnsicbfkbsatnoej` (org `saito-frankfurt`, **FREE** plan).
- Hər REST + RPC **HTTP 402**: **"exceed_egress_quota"**.
- **Egress 15.49 GB / 5 GB (310%)** · **Log Ingestion 8.39 GB / 1 GB (839%)** · cycle 16 Sen–**16 Oktyabr 2026**.
- Dashboard-dan non-upgrade fix **YOXdur**: "Change spend cap" → *"only available on the Pro Plan"*; "Restore service" düyməsi yoxdur.
- Login 500 = `login_preflight` RPC 402 → route 500 (**kod bug YOX, infrastruktur**).
- **App restore:** (a) support lift (istəndi, garantisi yox) VƏYA (b) **16 Oktyabr** cycle reset (mütləq, pulsuz).
- **SUPPORT TICKET GÖNDƏRİLDİ** (2026-10-08 01:07 +04): dashboard Help(?)→"Contact support" form, issue "Other", auto-filled (org/project/reply **omarkharimov@gmail.com**), təsdiq "Support request sent". Cavab email-də (ticket ID yoxdur). Ticket text = workspace root `SUPABASE_SUPPORT_TICKET.md`.

## BİZNES QƏRARLARI (owner)
1. **Pro upgrade İNDİ YOX** — pul yoxdur ($25/ay, aylıq). **İlk ödəyən müştəri qazanınca** açılır (o ay = xidmət xərci, self-funding).
2. **Multi-tenant (13r) İNDİ YOX** — **ilk müştəri gələndə** build.
3. **Tenant semantik (təsdiq):** "fərqli restoran" = **fərqli SAHİBKAR** = fərqli `organization_id` (müstəqil biznes). Fərqli **filial** = eyni sahibkar = eyni org, fərqli `location_id`. **Tenant sərhədi = `organization_id`.**
4. **Data modeli artıq multi-tenant-ready:** hər cədvəldə `organization_id` + `location_id`. Default model = **bir project, çox restoran, `organization_id` isolasiya** (shared-DB). Hard isolation (ayrı project per restoran) = premium tier, sonradan.
5. **"AYRI BİR PROJECT" FİKİR (owner, hələ izah olunmayıb):** PENDING müzakirə, **başlayılmayıb**. (Multi-tenant isolation ilə bağlı ola bilər; dəqiqləşmə gözlənilir.)

## 13q — EGRESS HARDENING (plan; DB qayıtdıqda ÖLÇƏRƏK ship)
> Free 5 GB-da bu **survival**-dır (13q OLMASA hər ~16-da re-suspend).
> **Ölçmə protokolu:** baseline (req/s + Supabase usage egress ~30 dəq) → fix → after.
> **Unverified live POS/KDS/track-ə ship ETMƏ** (owner E2E qaydası).

**P0 (ən böyük təsir, risk az):**
- Public `app/track/[orderNumber]/page.tsx`: `delivered`/`cancelled`-də poll **DAYANIR** (indiki forever) · `document.hidden`-da dayandır · **route geometry yalnız 1 dəfə**, sonra yüngül status · max lifetime (30 dəq).
- Bütün poll-a **`document.hidden` guard**: POS 3s (`app/admin/pos/page` `floorPollTimer` + `hooks/usePos`), KDS 5s (`KDSView` `fetchKDS`), expo 5s (`app/admin/expo/page`), `LiveFloorSnapshot` 5s, orders 10s (`useOrders`), kitchen 15s (`app/admin/kds/page`).

**P1 (systemic):** `event:'*'` CDC `postgres_changes`-ləri yüngülləşdir (payload-atılan handler-larda tam row YOX, change-signal/broadcast) + eyni cihazda redundant subscriber-ləri birləşdir (orders, order_items, table_floors, inventory_logs, courier_location, products, ingredients, recipes, reservations).

**P2:** idle-də poll interval 3–5s → 10–15s (yalnız hərəkət yoxdursa) · payload slim: `select('*')` → lazım column.

## 13r — MULTI-TENANT CORE (DEFER; ilk müştəri gələndə)
1. Provisioning/onboarding: yeni restoran = 1 `organization` + `locations` seed + owner hesab.
2. Org-scope audit: hər cədvəl/query `organization_id`-filtrli (cross-org YOX).
3. **RLS hardening** (`organization_id` üzrə policy, defense-in-depth) — İNDİ RLS yalnız `email_logs`-da; tenant isolasiya RPC-dədir (token→`authorize()`/`p1_actor_allowed_at_location`). Məhsul üçün RLS **şərt**.
4. Tenant-scoped realtime (channel-lar `organization_id`-filtrli).
5. Per-org usage/egress + abunə billing.
6. (opsion) white-label per restoran.

## RESUME STEPS (DB qayıtdıqda)
1. **Dev server:** `( cd saito-admin1 && nohup corepack pnpm --filter @workspace/saito-admin dev > /tmp/saito-dev-13p.log 2>&1 & )` → `localhost:3000` (Next 16.2.3 Turbopack). Port 3000 boş olmalıdır; köhnə `next-server` PID `kill -9`.
2. **DB back check:** `curl -o /dev/null -w "%{http_code}" "$SUPA_URL/rest/v1/staff?select=id&limit=1" -H "apikey:$KEY" -H "Authorization: Bearer $KEY"` → **200 = OK**, 402 = hələ suspended.
3. **Browser auth:** `localhost:3000/admin/stock` → /staff/login → **PIN 4321** (owner verdi, bu sessiya üçün).
4. **13p E2E matrix:** header (serif STOK + 4 pill, active accent, morph) · 4 zone click = in-place swap (no reload/jump) · sub-tabs (Tədarük: Faktura/Sifarişlər/Tədarükçülər; Sayım&İtki: Anomaliyalar; Analiz) · inspector FullPanel (row→slide-in, ESC close) · deep links `?view=po/counts/audit/recipes→redirect/intelligence` · **dark+light** · **console 0**.
5. **13q:** P0→P1→P2 ölç → commit.
6. **Commit:** `<round>: <desc>` + push main · Docs: MFM §10 jurnal + HANDOFF + MEMORY/diary (**append, overwrite ETMƏ**).
7. **SƏXVLƏT:** `.env` İNDİ `.gitignore`-dədir (öncə deyildi). **`git add -A` ETMƏ** — yalnız explicit path. E2E screenshot-ları (`e2e-shots/*`) commit ETMƏ.

## DEV/OPS QAYDALARI (xatırlatma)
- Dev = `corepack pnpm --filter @workspace/saito-admin dev` (root `pnpm dev` YAXSIZ).
- Background bash 15-min cap → server-i `nohup` subshell-da qaldır.
- tsc: `corepack pnpm exec tsc --noEmit | grep 'error TS' | grep -v 'src/__tests__/'`.
- DB debug = real service-role (REST/pooler psql), local SQL file YOX.
- Icons = **Phosphor** (`@/components/ui/saito-icons`); **Lucide YASAQ**. Motion = `@/lib/motion/system`.
- Owner dil = **AZ**. "qərar sənə" (page/feature). **E2E dark+light + console 0 before commit**.

## FILES CHANGED (13p)
- `artifacts/saito-admin/src/app/admin/stock/page.tsx` (REWRITE)
- `artifacts/saito-admin/src/app/admin/stock/next/StockZone.tsx` (`onNavigate`)
- DELETE `next/Shell.tsx`, `next/useScrollSpy.ts`, `components/StockTab.tsx`
- hub sub-tab chrome (13o): `ProcurementHub/OperationsHub/AnalyticsHub.tsx` + `stock-ui.tsx`
- `.gitignore` (+`.env`) · `next-env.d.ts` (auto) · `MASTER_FEATURE_MAP.md` (§10 13p) · `HANDOFF_13P.md` (this)

## OPEN (owner)
- **Supabase:** support ticket cavabı (omarkharimov@gmail.com) VƏYA **16 Oktyabr** reset → DB back → resume.
- **13p E2E** (DB back) · **13q** (ölçərək) · **13r + Pro** (ilk müştəri) · **"ayrı project" fikri** (müzakirə).
- GROQ_API_KEY · sayım 8 mənfi/şübhəli maddə · cost-snapshot RPC qərarı.
