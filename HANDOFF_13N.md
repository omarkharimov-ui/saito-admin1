# HANDOFF 13n — Inventory UI 0-dan (2026-10-05)

## Owner mandatı (söz-lə-söz)
> "basla 0 dan"
> (öncü: "səni necə dəfə dedim ki 0-dan yenidən yaz, UI hal hazırda pisdir" +
> hard stop: "başını burax, heç nə etmə… hard stop" → mandat yenidən verildi)

## Commit
`637ef2d` — 9 files, +989/−193, pushed to main. E2E r38c: **T1/T2/T3/T5/T6 PASS**
(console 0, dark+light), **T4 = OPEN VERIFY** (aşağı). 19 shot `e2e-shots/r38c-*`.

## MİTARXİTURƏ — no tabs by construction
`stock/page.tsx` (112 sətir, REWRITE) + yeni **`stock/next/`**:
- `Shell.tsx` (156) — 1 fasiləsiz səhifə: 4 zone `<section id="sec-*" scroll-mt-20>`
  (Stok / Tədarük / Sayım&İtki / Analiz) + head (overline + active-zone H1) +
  **sticky scroll-spy pill nav** (`layoutId="stock-zone-pill"` SPRING + active label)
  + settle-lock deep-link effect.
- `StockZone.tsx` (620) — 0-dan: 3-saniiyyə hero (honest loading) · live metrics strip
  (clickable: kritik→filter, mənfi→Sayım et) · AdvisorCard · Anbar DataTable
  (name+unit+freshness-chip / price / stock+ratio-bar / status) · 4 push panel
  (Xammal Girişi / Əməliyyat / Yeni Xammal / Tarixçə) — hamısı **FullPanel** pattern.
- `useScrollSpy.ts` (75) — real scroll root tap (birinci `overflowY auto|scroll`
  ancestor), rAF-throttled **viewport-relative** active compute
  (`elRect.top - rootTop ≤ NAV_OFFSET+8` — 13n-1: absolute-offset versiyası birinci
  section-da YELMİŞDİ), smooth `scrollTo` (NAV_OFFSET=76 compensation).

**Nav click = smooth scroll YALNIZ.** Heç nə unmount/remount olunmur →
"səhifə oynuyur" klassı konstruktiv olaraq yoxdur. Köhnə StockTab file = DEAD
(delete candidate — import yoxdur). 3 hub (Procurement/Operations/Analytics, 13l
stacked sections) = zone MƏZMUNU, 0 feature loss.

## URL CONTRACT
`VIEW_TO_SECTION`: bütün 13f/13h legacy `?view=` (anbar/intelligence/buy/invoice/
orders/suppliers/counts/waste/returns/anomalies/report/trends/audit + 4 zone) → `sec-*`.
`?view=recipes` → `/admin/recipes` redirect (13g). `?ingredient=<id>` → inspector push.
**Scroll-spy `?view=<zone>` back-write** (router.replace, scroll:false, `sub` delete).
Elevated sections = optimistik `!authChecked || isElevated` + auth-drop + fallback
(13i kök qorunur).

## SETTLE-LOCK DEEP LINKS (13n-3) ⚠ T4 OPEN VERIFY
Fixed [120..2400]ms re-anchor async content-ə uduzdu (r38c: po → −2194px, counts → +255;
skeleton→table SHRINK = anchor-dan sonra target sürüşür).
**Fix:** 300ms tick — target >8px uzaqdırsa instant nudge; max 8s; user takeover =
yalnız explicit INPUT (wheel/touchmove/keydown). 13n-2-nin "unexplained scroll event"
heuristic-i PROBLEM idi — programmatic scrolls (route-level resets) ilə ölürdü.
**Niyə OPEN:** E2E run-ın ortasında owner Chrome sessiyası EXPIRE oldu (tab →
/staff/login redirect; elevated sections unmount → səhifə hündürlüyü 20.6k→collapsed —
bu "accordion" görünüşünün real səbəbi idi, lazy rendering YOX). 13n-3 build untested.
**13n-4 (hazır sənaredir):** sessiya qayıtdıqda: `?view=po` → `#sec-orders` rect.top ∈
[−80,160] ×2 ölçmə (4.5s/9s, drift <30) + eyni counts/audit + final URL zone rewrite
(procurement/operations/analytics).

## r38c STABILITY KOKLARI (DB-verified)
1. **Refetch loop (~170 req/90s):** realtime `postgres_changes` (canlı KDS consumption,
   1-2s) → UNDEBOUNCED `reload()` + `useAsyncView` inline `reload` arrow = hər render-da
   yeni identity → effect hər render-da RESUBSCRIBE (StrictMode = duplicate pairs).
   **Fix:** trailing 1.5s coalesce timer (StockZone) + STABLE `reloadFn` (useAsyncView).
   **E2E: Δ5 req/30s idle, scrollHeight drift 0.57%** (əvvəl: 5246↔18938).
2. **COGS = 0 DATA DEFECT:** 661 `order_consumption` satırın **609-u
   `cost_per_unit=NULL`** (frozen RPC snapshot etmir; 30g pəncərə: 67 satır, 0-u cost-lə).
   **Fix (frozen toxunulmayıb):** `/api/inventory/reports` fallback = ingredient
   `average_cost_per_unit` (3 nöqtə: cogs/waste + shrinkage + pattern). **E2E: ₼53 > 0.**
   Owner candidate: consumption-da cost snapshot (RPC dəyişikliyi = ayrı qərar).
3. COGS chart = API yalnız data-d olan günləri qaytarırdı (4 bar!) → client zero-pad 30d
   (UTC keys, route-la eyni).
4. İtki Pattern weekday: `['B.e','Çax','Ç','Cax','C','Ş','B']` (Ç/C qarışığı) →
   `['B.e','Ç.ax','Çər','C.ax','Cüm','Şən','Baz']`.
5. Freshness date `toLocaleDateString('az')` = **M10** (ICU) → `fmtDate` (13m formatter).

## Kiçik
- FullPanel **ESC-close** (panel TAM main area — backdrop click strip-siz idi).
- counts Sayyan + Təyin UUID mask (`—`).
- **r38c E2E öz bug-unu tapdı:** mənim `useMemo`-m early-return-dən SONRAdı idi →
  conditional hook → TAM route crash (ErrorBoundary). Fix: hook əvvələ + null-guard.
  Lesson: early return olan komponentdə hook placement = həmişə yuxarı.

## E2E r38c NÖTIQLƏRİ
- "OFFLINE — YERLİ REJİM" banner online halda görünür — global monitor, transient
  pooler 500-ə reaksiya (KNOWN monitoring item, 13d-dən).
- Dev server = `nohup` launch (background bash 15-min cap = server-i öldürürdü; pid 7096/7120).

## OPEN (owner)
- **T4 verify (13n-4)** — browser sessiyası /staff/login-a daxil olmaq lazımdır.
- GROQ_API_KEY · sayım (8 mənfi/şübhəli maddə) · multi-location · cost-snapshot RPC qərarı.
