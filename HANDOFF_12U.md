# HANDOFF — ROUND 12u (2026-10-04)

§1c-in **10 praktik təklifinin HAMISI** implement + E2E verified (r17/r19/r20/r20b/r20c) + owner-in
3 əlavə tələbi (watch dairə-sizlik, möhtəşəm tab transition, micro-interaction kontrol).
Commit **d140855** pushed main. Owner sessiya müddətində futbol-da idi — autonomous iş.

## 1. EXPO STATION — "SERVING QAPISI" (təklif #3)

- **Qapı qaydası:** order Expo-ya düşür YALNIZ bütün aktiv board item-ləri `ready`/`served` olduqda
  (all-ready invariant). Half-ready order Expo-da GÖRÜNMÜR (E2E r20 S3 verified).
- **FIFO:** `kitchen_ready_at` üzrə (pass order-u bitirmə sırası ilə göndərir).
- **Tək-press SERVİSƏ VER** (kart + bump tile + modal footer) = `POST /api/orders/serve` →
  `mark_order_served_atomic` — POS "Servisə Ver" ilə **eyni frozen edge** (12i). Ready item-lər →
  `served`, order rollup → `served`, bütün board-lardan çıxır, POS floor chip = SERVİS EDİLDİ.
- **Permission:** `floor.manage` (server enforced) = owner/admin. Kitchen/bar role 403 toast görür —
  UI fake action göstərmir (owner qərarı ilə serve = floor action, 12i).
- **DB:** `stations` + 1 sətir: `Expo`, `station_type='service'`, `sort_order=3`
  (id `3cada176-4c01-4a47-aec6-facc7676144f`). CHECK constraint 'service'-ə artıq icazə verirdi —
  **migration gerekmedi**. `/api/stations?kind=kitchen` KITCHEN family-sında 'service' var →
  KDS navbar-a avtomatik düşdü (Kitchen · Bar · Expo · GÜN). BDS navStations-da YOX
  (yalnız own family + kitchen family).
- **Expo kart:** emerald border, "BÜTÜN STANSİYA HAZIRDİR", tam order item list (dim, read-only),
  dairə/tick/Hazırdır **YOX** — yalnız SERVİSƏ VER. RUSH order = red variant.
- **Optimistik flip:** press anında kart in-place çıxır (12i qaydası: bizim press ilə çıxır,
  DB təsdiqləyir və ya 4xx-də rollback). `serve` = offline queue kind (replay-safe:
  already-served = server no-op).
- **Qeyd:** Expo station indi ProductModal station selector-da da görünür (SSOT davranışı —
  owner məhsul routing edə bilər; gələn Expo-routed item də qapı mexanizminə daxil olur).

## 2. OFFLINE BUFFER + READ-CACHE (təklif #2 + #10) — 3 kök səbəb tapıldı + bağlandı

| # | Bug (E2E) | Kök | Fix |
|---|---|---|---|
| 1 | r19: offline reload = "0 aktiv sifariş" (board cache var, ticket YOX) | `GET /api/stations` uncached → stations=[] → station→ticket mapping hamısını drop | `KDS_STATIONS_CACHE` (persist success + restore fail) |
| 2 | r20b: restore işləmədi (yalnız GÜN qaldı) | SW/5xx 503 **resolve** olur (`ok=false`, `d=null`) — restore yalnız `.catch`-də idi | `.then` path-də `failed` flag (`d === null` vs genuine `d=[]`) |
| 3 | r20: board cache offline müddətində `[]`-ə clobber olundu | apiFetch-in synthetic offline snapshot (`/api/orders` ∈ OFFLINE_READ_ROUTES) 200 → fetchKDS onu cache-ə yazdı | (a) boş board heç vaxt son non-empty cache-üstə yazmır; (b) `kdsOrders.length===0 && isOffline()` → `tryCacheFallback()`; (c) `X-Saito-From-Cache` response → "son sinxron" note |

**E2E r20c (final):** offline reload = Masa 2 ticket **render** + "son sinxron 14:41" + 4 tab
(stations restored) → a/b/c PASS; back-online clean; console 0.

**Queue:** `useKdsOfflineQueue` — kinds: `prepared`/`recall`/`ready`/`void`/`serve`;
localStorage persist (reload-dan qorunur); replay = board-un öz healthy 5s poll-i tetikləyir;
reconciliation (stale-drop); 2xx drop / 5xx keep / 4xx `failed` + manual retry; MAX 20, BATCH 5.
**Qəsdən queue-siz:** rush (toggle — replay iki dəfə flip), course-fire (multi-item stateful).

## 3. BƏQİYYƏSİ (12u sweep)

- **Bump bar** (təklif #1): xl+ aside rail (w-44, sticky) — aktiv stansiya ticket-ləri tək-press
  (station-scoped `handleMakeReady`), "N qalıb · ≈M dəq", ready = sükut emerald tile. Watch tab-da YOX.
- **Per-ticket ETA** (təklif #4): "≈ N dəq" chip (kart + bump) — N = Ø HAZIRLANMA
  (`/api/kitchen/daily` `avgReadyMin`; GÜN mount-da artıq load olunur → 5-min refresh, 30s GÜN açıkdır).
  Elapsed > N → amber (GEÇİKME qırmızı güclü qalır). Watch tab-da YOX (rəqibi deyil, özünü deyir).
- **Watch timestamps** (təklif #5): watch modal footer = "İzləmə · Qəbul HH:MM · Hazır HH:MM"
  (`kitchen_accepted_at`/`kitchen_ready_at` — DB-də artıq var).
- **86 variant (b)** (təklif #6): modal sətirdə kiçik "86" (12s X görünüşü YOX, tick hot zone-undan
  uzaq) → səbəb sheet (4 çip + note) → **PinGuard PIN** → `/api/kitchen/void-comp-waste`
  (`origin:'kds'`, `order.void`) → sətir çıxır + toast. kds+bds page-ləri `VirtualKeyboardProvider`
  ilə sarıldı (r17 crash: PinGuard keypad `useVirtualKeyboard` tələb edirdi — fatal render).
- **Per-stansiya səs** (təklif #7): chime yalnız own family-nin yeni ticket-i üçün
  (`ownStationIds`). **Ear-check = owner NO-GO qalıb** (12f) — səs tərzi unchanged (12f premium bell).
- **Light contrast** (təklif #8): modifier zinc-500 → zinc-600 (kart + modal).
- **Overload badge** (təklif #9): navbar tab pending item amber ≥6 / red ≥12 (pulse); Expo =
  gözləyən bilet amber ≥4 / red ≥8. (Staffing comparison = Addım 2.)
- **Watch dairə-sizlik** (owner): kart + modal — watch tab-da dairə YOX (sükut dim + progress line).
- **Sliding pill + cross-fade** (owner): nav pill = tək ölçülən element (SPRING.surface x/y/w/h;
  r17 layoutId morph fire etmədi → deterministic v2, r18 glide 320ms PASS). Board =
  `AnimatePresence mode="wait"` + `LEVEL.navigation` (enter morph y12+blur4 / exit graceful y-8+blur4)
  — pill ilə parallel = **one state-machine motion**.
- **GÜN ghost fix** (r20b tapıldı): cancelled kitchen order-lar GÜN-də "×0 GÖZLƏYİR" idi
  (E2E cleanup-da Masa 3 clear-i bloklayırdı) → `/api/kitchen/daily` query
  `kitchen_status=not.in.(cancelled)` (SQL `NOT IN` NULL-ı da xaric edir).

## 4. E2E XARİCƏSİ (owner out — autonomous)

| Round | Focus | Nəticə |
|---|---|---|
| r17 | bump/pill-v1/watch-no-circle | PASS; PinGuard crash tapıldı+fix; pill layoutId **FAIL** → v2 |
| r18 | pill glide v2, cross-fade, 86 chain, ETA | PASS (glide 320ms; 86 sheet→chips→note→PIN→void→toast; ETA ≈1→≈4 dəq live) |
| r19 | offline queue + replay | PASS (queue+banner+replay ~10.4s); **stations FAIL** → #1 fix |
| r20 | Expo (gate+serve+bump+chip) + offline board | Expo **PASS**; offline board **FAIL** ([] clobber) → #3 fix |
| r20b | offline re-test + transitions + light | transitions/light **PASS**; stations 503 **FAIL** → #2 fix; Masa 3 blocker |
| r20c | offline final + cleanup | **a/b/c HAMISI PASS** + Masa 3 BOŞ + GÜN clean + console 0 |

Console: fresh-tab **0 error** (r20b S9 + r20c F1). r19-un "6× supabaseKey" = shared-tab history
(təsdiqləndi — fresh tab 0). Dark+light hər round-da.

**Cleanup:** Masa 3 test order-ları — ORD-2960/2961 (cancelled), ORD-2962 (Expo-dan served,
sonra canonical `/api/kitchen/cancel` `e2e_test_cleanup_12u_r20c`, performed_by owner) + Masanı
boşalt → **BOŞ**. **Masa 2 (owner test order) toxunulmayıb** — hələ active (Filadelfiya + Green Tea).

**Dev server:** 12u-də 1 dəfə restart (pid 79308, log `/tmp/saito-dev-12u.log`) — stale
empty-key chunk purge (owner out idi; board sənaye-də kövrək qalırdı).

## 5. OPEN (owner qərarı gözləyir)

1. **Ear-check** (12f NO-GO): per-stansiya səs ROUTİNG hazır, səs tərzi owner qulaq testindən keçməlidir.
2. **Order-level `customer_note` station-scoping** (12t qeydi): indi bütün station kartlarında görünür
   (order info = status, məhsul deyil). Owner istəsə station-a bölünə bilər.
3. **POS 115× duplicate-key burst** — monitoring (repro olmadı).
4. **Superadmin cash shift** — owner GO gözləyir.
5. **Expo serve permission** — hazırda owner/admin (`floor.manage`). Əgər pass chef-i ayrıca
   rolda işləsə, ona `floor.manage` (və ya daha dar bir permission) verilməlidir — qərar: owner.

## 6. FAYLLAR

- `artifacts/saito-admin/src/app/admin/pos/components/KDSView.tsx` (Expo + offline + transitions)
- `artifacts/saito-admin/src/hooks/useKdsOfflineQueue.ts` (**yeni**)
- `artifacts/saito-admin/src/app/admin/{kds,bds}/page.tsx` (VirtualKeyboardProvider)
- `artifacts/saito-admin/src/app/api/kitchen/daily/route.ts` (cancelled ghost fix)
- `artifacts/saito-admin/src/lib/i18n/locales/{az,en,ru}.ts` (`kds_expo_*` + qalan 12u açarları)
- DB: `stations` + Expo sətiri (yuxarıda id)
- `e2e-shots/r17-*`, `r19-*`, `r20-*`, `r20c-*` (+ r20-progress.md, r20b-findings.md, r20c-report.md)
- Docs: `MASTER_FEATURE_MAP.md` §10 journal (12u bloku) + §15 KITCHEN (Expo + §1c sweep sətirləri),
  `POS_COMPETITIVE_COMPARISON.md` §1b/§1c (zəif #1-4 ✅, təklif 1-10 ✅, header 12t/12u)
