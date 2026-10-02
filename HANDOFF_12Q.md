# HANDOFF — 12q (KDS: status revert + latency + kitchen gap sweep)

**Tarix:** 2026-10-03 · **Vəziyyət:** kod bitdirilib + E2E'də təsdiqlənib; **docs yenilənməYİB** (aşağıda dəqiq siyahı). Bu commit 12q-nun kodunu + E2E şutilərini + bu handoff-u main-a gətirir.
**Owner:** Omarkharimov (AZ-də işləyir; cavablar AZ) · Repo: `/Users/mr.apple/saito-admin1/` · App: `artifacts/saito-admin/` (Next.js 16, dev :3000, `corepack pnpm`, HMR live — **heç vaxt test ortasında restart etmə**)

---

## 1. OWNER İSTƏYİ (12q, 3 tapşırıq)

> "hazirdir basiram, mehsul hazirdir, sonra evvelkine statusuna geri qayidir… birdeki buttonlar gec reaksiya verir basiram qebul et veya hazirdir fikirlesir 2-3sn sonra edir emeliyyati… ondan sonra competitorlar ile detaylı feature müqayise et. master-mapdan bax gor metbexe aid neler qalibdir, duzeldek hamisini"

1. **Hazırdır basandan sonra status GERİ QAYIDIYIR** — düzəldildi (3 root cause).
2. **Buttonlar 2-3s "fikirləşir"** — düzəldildi (optimistic UI; ölçülən vizual cavab **23ms**).
3. **Rəqib müqayisəsi + MFM-də metbəx qalıqlarının HAMISININ düzəldilməsi** — RUSH / course-firing / 86 UI bağlandı (DB mexanizmi artıq FROZEN idi, UI yoxdu idi). **Müqayisə SƏNƏDİ yazılmayıb** (aşağıda §6.2).

---

## 2. TASK 1+2 — REVERT + LATENCY: 3 ROOT CAUSE

| # | Root cause | Fix (fayl) |
|---|---|---|
| a | `handleMakeReady`-də **optimistic update YOX** idi → kart yalnız RPC round-trip bitəndə (advisory lock + FOR UPDATE + stock + PostgREST + EU pooler ≈ 2-3s) hərəkət edirdi | **Optimistic-first handler**-lar: UI `await`-DAN ƏVVƏL patch olunur, fail-də snapshot rollback. Tick / Hazırdır / Rush / Fire / 86 hamısı belə (`KDSView.tsx`) |
| b | `fetchKDS` blind full-replace `setOrders()` — click-dən ƏVVƏL başlayan poll click-dən SONRA cavab verib təsdiqlənmiş state-i köhnə snapshot-la üst-üstə yazırdı (lost update → kart geri qayıdır, növbəti poll bərpa edirdi) | **Fetch seq guard** (`fetchSeqRef`): superseded in-flight responslar drop olunur. Artıq `usePos.fetchFloor`-da da eyni guard var |
| c | **DEMOTE BUG (DB):** `trg_sync_order_kitchen_status` order status-unu YALNIZ item status-larından rollup edir. `accept_kitchen_ticket_atomic` order-u `accepted` edir, **item-lər `pending` qalır** → istənilən item update (hətta sadə tick!) order-u geri `pending`-ə düşürdü | `/api/kitchen/accept/route.ts`: accept RPC-dən sonra item-lər `pending/sent → 'accepted'` aline edilir (edge "cart → accepted" DB-də registered idi — `state_transitions`-dən verify edildi; full cycle real DB-də ROLLBACK testlərlə təsdiqləndi: `/tmp/align_test.sql`) |

**Əlavə qoruma (12q):**
- **Optimistic merge window** (`KDSView.tsx`, `optimisticRef` Map, `OPTIMISTIC_MS = 15000`): hər order üçün `{readyItems[], orderReadyAt, orderAcceptedAt, prepared{}}` — köhnə snapshot təsdiqlənmiş lokal əməliyyatı heç vaxt demote etmir; DB confirm etdikdə (və ya 15s) release; recall/fail-də `clearOptimisticItem`.
- **POS floor high-water clamp** (`usePos.tsx`): `KITCHEN_RANK {cancelled:-1, pending:0, accepted:1, sent:1, preparing:2, partially_ready:3, ready:4, served:5, completed:6}` + `kitchenHighWaterRef` (hər floor `{orderId, rank, at, status}`, 6s pəncərə) — eyni order-un rank≥4-dan aşağı düşməsi suppress olunur; terminal statuslar + yeni order-lar HƏMİŞƏ tətbiq olunur.
- **`kitchen_accepted_at` persist bug (12p-də tapıldı):** accept RPC bu stamp-ı YAZMIRDI → route indi NULL-ikən stamp edir → GÜN "Ø QƏBUL" + legacy timer dəqiq.

---

## 3. TASK 3 — KITCHEN GAP SWEEP (rəqib parity)

Rəqib təhlili (2026-10, web-verified): **Toast** = overall best KDS (stations, bump/recall, timers, expo, analytics, offline); **Square** = KDS $20/mo add-on (rəng kodlu ticket-lər, bump bar ayrıca, 10"); **Lightspeed** = ən yaxşı course management (15", expo + müstəqil stansiya ekrani, sophisticated routing). 2026 trend-ləri: **course-based firing rules**, stansiya workload balancing, per-ticket ETA.

DB mexanizmi FROZEN idi, UI YOXDU idi → bu round-da bağlandı:

| Feature | DB (old) | Yeni route | UI |
|---|---|---|---|
| **RUSH** | `orders.is_rush` + `toggle_rush` RPC | `src/app/api/kitchen/rush/route.ts` (requireKdsAction `kitchen.manage`, flag read-back echo) | Modal-da ghost pill (Zap "RUSH"), active = **solid red**; kart = qırmızı border + header-də ⚡RUSH marker (sayaçdan əvvəl); GÜN sətirində qırmızı Zap |
| **Course firing** | `fire_course_atomic` (pending/accepted → preparing; NULL course = 'main') | `src/app/api/kitchen/fire-course/route.ts` (`g.performed_by`) | Modal-da CTA-dan yuxarı course pill-ləri (Flame; yalnız pending/accepted item-i olan course-lər: `Array.from(new Set(items.filter(qty>0 && pending/accepted).map(i => i.course \|\| 'main')))` ) |
| **86 / item void** | `item_kitchen_terminal('voided')` | canonical `/api/kitchen/void-comp-waste` (`action:'void'`, `reason:'kds_86'`, **`origin:'kds'`**) | Modal item sətirində ✕ (XCircle) ghost 28px, "×N" və ✓ arasındə; served sətirlərdə YOX; `kds_86_toast` |

**12q-da DB config dəyişikliyi (1 sətir):**
- `INSERT INTO role_permissions (kitchen role, 'order.void')` — 86 standart KITCHEN əməliyyatıdır (Toast/Square-də chef 86 edir; əvvəl 403 idi). Reversible: `DELETE FROM role_permissions WHERE role_id='24051900-4d57-46e7-8790-b28a09c1a1ad' AND permission_key='order.void'`.

**E2E r12q2 tapıntısı + fix — shiftGate:**
- E2E-də 86 birinci cəhddə **"Smena bağlıdır. İdarəçi PIN ilə davam edin."** hard-fail verdi (cash shift bağlı idi; KDS-də PinGuard yoxdur).
- Fix: `void-comp-waste` route-də `origin === 'kds' && action === 'void'` → shiftGate **exempt** (86 = kitchen-availability, register əməliyyatı deyil; POS comp/void/waste gate + PinGuard qorunur). Permission gate (`order.void`) + state machine + operation log qüvvədə qalır.
- ⚠️ **Bu fix browser-da YENİDƏ test olunmayıb** (route compile oldur — 401 warmup OK). E2E-də sub-agent shift açaraq (KASSA AÇ, opening 100, superadmin clock-in — **bu shift hələ açıq qalıb**) 86-nı uğurla bitirdi.

**i18n (az/en/ru, `kds_uncheck`-dən sonra):** `kds_rush` (RUSH/RUSH/СРОЧНО), `kds_rush_toggle_on/off`, `kds_fire_course` (Mərhələni at/Fire course/Отдать курс), `kds_item_86`, `kds_86_toast`. **GÜN:** `/api/kitchen/daily` select-ə `is_rush` əlavə olundu + ticket row-dan keçir.

---

## 4. TAM UX WAYFINDING (KDS axını — bu round-dan SONRAKİ vəziyyət)

**Board (12n):** YALNIZ BİR umumi board + üst **station navbar**: `Main Kitchen · Bar · GÜN` (HAMISI silinib; tab-lar yoxdur — Toast modeli). Kart sıralaması: HAZIRDIR əvvəlcə (emerald top group, `stationAllDone`), sonra HAZIRLANIR. Vizual: **zero badge spam** — state = border/text RƏNGİ (emerald=ready, red=delay/RUSH ONLY, amber=qeydlər). Kart: title (Masa N / ad), order_type bold, telefon, status label, timer (GÜN Ø ilə, gecikmədə qırmızı + pulse), item sətirləri (name + course chip + modifier chips + Qeyd + ⚠allergen chip + ×N + ✓), station-scoped "Hazırdır" CTA. Modal = **morph** (layoutId `kds-ticket-{id}`, MORPH_SPRING; grid slot-da placeholder → zero reflow).

**Order axını (adım-adım):**
1. **POS "MƏTBƏXƏ GÖNDƏR"** → KDS ticket **~1-8s** ərzində görünür (realtime push 1.5s debounce + 5s poll fallback).
2. **GÖZLƏYİR = TRANSIENT (~1-8s)** — KDS hər pending order-ı **bir dəfə SƏSSİZ auto-accept** edir: `useEffect([orders])` + `acceptedRef` Set (order başına bir dəfə) + `acceptAttemptRef` Map (fail-də 30s cooldown; 409/'not pending' race-lər clear olunur; demote olunmuş order-ları yenidən accept edir). **"Qəbul et" buttonu HEÇ YERDƏ YOXDUR** (12p — kart pill + modal pending branch + `handleAccept` referenslərinin hamısı silindi).
3. **HAZIRLANIR** — chef əməliyyatları:
   - **✓ tick (48px)** = **preparation progress ONLY** (12o): `prepared_quantity` 0↔qty; yeni `/api/kitchen/item-prepared` = sadə UPDATE (state machine-a toxunmur → auto-ready YOX). POS cart badge-də tap-də bounce.
   - **READY item-dən un-tick = RECALL** (`item_kitchen_terminal('recalled')`, ready→pending; frozen registry edge). Served sətirlər final (toggle yoxdur).
   - **"Hazırdır" CTA** — kartda station-scoped (aktiv stansiyanın pendingIds), modal-da whole-order → `mark_item_ready_atomic` (advisory lock + FOR UPDATE + stock consume; bütün item-lər ready → order `ready` + `kitchen_ready_at` stamp). **Optimistic: klik anında emerald.**
   - **RUSH pill** (yalnız pending/preparing wf-də görünür) — toggle; red = critical rəng (visual direction).
   - **Course pill-ləri (Flame)** — pending/accepted item-i olan course-lər; klik = həmin course `preparing`.
   - **✕ 86** — item voided; sətir ticket-dən çıxır; smena bağlı olanda da işləyir (origin='kds' exemption).
4. **HAZIRDIR** (emerald top group) → **+3s** (`SERVE_LAG_MS`) UI-da derived **SERVİSƏ HAZIRDİR** — **quiet text, button DEYİL** (12o: "servis POS-dan edir"). Footer eyni element (text+color morph; blink yoxdur — motion philosophy).
5. **POS floor chip "SERVİSƏ HAZIRDİR"** → POS "Servisə Ver" (`mark_order_served_atomic`) → **SERVİS EDİLDİ**. **KDS "Hazırdır"-da BİTİR** (12i: serve = floor/POS action).
6. **GÜN tab** — `/api/kitchen/daily` (30s refresh): metrikalar (Sifariş / Məhsul / İstehsal / Ø Qəbul / Ø Hazırlıq — `kitchen_accepted_at`-dan, indi dəqiq), İstehsal top-30, günün bütün ticket-ləri (served/closed daxil) + RUSH marker.

**E2E kanonu:** browser sub-agent (owner Chrome; built-in browser disabled), fresh agent tab, PIN 4321, psql real-DB verify, shot-lar `artifacts/saito-admin/e2e-shots/r<round>-*.png`, console 0.

---

## 5. E2E NÖTİCƏLƏRİ

**r12q (revert+latency) — 7/8 PASS** (`e2e-r12q-results.md`, shot-lar `r12q-*.png`):
recall→re-accept ✓ · tick demote etmir (DB) ✓ · Hazırdır instant (23ms) ✓ · 15s+ stabillik ✓ · POS chip ✓ · light mode ✓ · 1 PARTIAL: ~46s sonra DB ready→accepted flip — sub-agent müəyyən etdi ki, bu **OWNER-in öz parallel testidir** (recall→auto-accept→ready = düz yeni davranış), stale-poll bug deyil.

**r12q2 (gap sweep) — A–G** (`r12q2-*.png`), test order **Masa 993 / ORD-2954** (UUID `3fa60b27-2e80-41b4-8608-59bed9d3f4a1`):
A modal content (RUSH pill + MAIN pill + ✕) **PASS** · B rush on (DB `is_rush=t`) **PASS** · C GÜN marker **PASS** · D course fire (item-lər `preparing`) **PASS** · E 86 **PASS (workaround ilə)** — birinci cəhddə shiftGate fail → fix yazıldı (§3) · F rush off (DB `f`) **PASS** · G KDS console **0**; **POS console = 115 duplicate-key burst (OPEN — §6.1)**.
⚠️ Bu E2E-də browser **SUPERADMIN** sessiyasından avto-daxil oldu (PIN 4321 istənmədi — əvvəlki round-un sessiyası canlı idi). Sub-agent 86-ı açmaq üçün **cash shift açdı (opening 100, superadmin clock-in) — hələ bağlımayıb**.

---

## 6. OPEN ITEMS (növbəti agent üçün DƏQİQ siyahı)

### 6.1 POS duplicate-key burst (console 0 pozulur) — TAPILMAYIB
- **Semptom:** POS tab-da 115× React `"Encountered two children with the same key"` — tək 28ms burst (2026-10-03 20:35:28Z = 00:35:28 local), `pos-POS` chunk, superadmin view.
- **Şübhəli:** table grid key-i `page.tsx` ~L3112: ``key={`tbl-${table.table_number ?? table.id ?? _tableIdx}`}`` — `visibleTables` (L1738) archived + child filtrləyir amma **duplicate `table_number` dedup ETMİR**. 11g-da Devices page-də eyni sinif bug idi (client dedup fix). React 19 console.error dedup etdiyi üçün 115 = dedup SONRASI saydır; real dup çox ola bilər.
- **Adım:** (1) `/api/pos/tables` responsunu psql ilə yoxla — eyni floor-da duplicate `table_number`? (2) varsa root cause (JOIN fanout?) + client dedup (device fix-nin eyni patterni); (3) fresh superadmin POS session-da console verify (0).
- Alternativ: burst product grid-dən ola bilər (`ProductGrid.tsx` L1637 `key={...item.id}`) — lakin timing (order göndərmə anı) table grid-yə çoxur.

### 6.2 DOCS YENİLMƏYİB (owner protocolu — bitməlidir)
1. **`MASTER_FEATURE_MAP.md` §10** journal line (newest-first): 12q — 3 root cause (optimistic/seq guard/accept item-alignment), gap sweep (RUSH+course fire+86 UI, kitchen role `order.void`, shiftGate kds exemption), E2E r12q 7/8 + r12q2 A–G, latency 23ms.
2. **`MASTER_FEATURE_MAP.md` §15 KITCHEN:** yeni sətirlər — "RUSH UI (toggle + card marker + GÜN)" ✅ 12q · "Course firing UI (modal pills)" ✅ 12q · "86 / item void UI (modal ✕)" ✅ 12q; Expo 🟡 qalır (Addım 2).
3. **`POS_COMPETITIVE_COMPARISON.md`:** title "rounds 7 → 12p" → **"→ 12q"**; §0 BEFORE/AFTER satırı (12q: revert+latency + gap sweep); §1 KDS suffix yenilə; **YENİ SECTION: "KITCHEN DETALI MÜQAYİSƏ (12q)"** — SAITO vs Toast vs Square vs Lightspeed, ~20 sətir: stations/routing, bump/recall, timers/delay, priority/rush, course firing, expo, 86/void, notes/allergens, auto-print, realtime, all-day analytics, offline, third-party routing, per-station analytics, hardware, pricing. Rəqib data §3-də (web-verified 2026-10).
4. **agent-core memory:** `MEMORY.md` "Son round" → 12q (kondensat); `diary/2026-10-03.md` entry (bu handoff-a pointer).

### 6.3 Vəziyyət təfsilatları
- **ShiftGate fix E2E re-test YOXDUR** (browser): smena BAĞLI halda 86 = "Smena bağlıdır" toast GÖRÜNMƏMƏLİDİR (origin='kds'). Qeyd: hazırda superadmin cash shift AÇIQDIR (r12q2-də açıldı) — re-test üçün əvvəl bağlanmalı və ya fresh KDS session (kitchen 4321) ilə.
- **Test fixture-ləri (live DB; cleanup = owner GO):** Masa 993/ORD-2954 (yuxarı UUID; Tom Yam `9ef4518a-…` preparing, Kaliforniya Gold `66188253-…` voided) · E2E Wolt `76598434-6267-490f-80d1-596ce8429427` (ready) · Masa 992/ORD-2953 `f48aac33-a107-40d5-b9c8-912c91ba474c` (ready) — üçünün də `customer_phone='R12Q-A'` marker var.
- **Owner GO tələb edən (başlamamaq):** ~103+2 köhnə non-terminal order temizliyi (əvvəl DƏQİQ read-only siyahı verilməli — irreversible) · 12d POS minimap road-following (Task #11) · 12f chime owner ear-check · opsiyal "Main Kitchen"→"Hot" rename.

### 6.4 Qısa ref
- psql: `/opt/homebrew/opt/libpq/bin/psql postgresql://postgres.jbxmlnsicbfkbsatnoej:hivhU3-sathob-bupcar@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`
- tsc: `npx tsc --noEmit` (`src/__tests__` xəta-larını ignore et — həmişə belə olub)
- PIN 4321 = kitchen (`a3d650b1-9635-456a-9bb0-e37d12b475fb`; indi `order.void` DA var) · Kassir `96baaa16-8779-4d1d-a500-a3ce9084810e` · superadmin `c814879d-5378-4791-8c5f-8ee5aee51994`
- Binding docs: `SAITO_UI_VISUAL_DIRECTION.md` (zero badge spam; red = critical ONLY) + `SAITO_MOTION_PHILOSOPHY.md` (12 qayda)
- AZ yazı qaydası (SSOT): yeni AZ status sözünü lüğətlə yoxla — kök harf + dative + ı/i ("hazırdır" = ı; "servisə" = E-dative)
- Dev logs: `/tmp/saito-dev-*.log` (sonuncu: `saito-dev-12c.log` — 12q dövrü)
- Commit üslubu: `<round>: <az/en desc>`; push main. Stale untracked-ları COMMIT ETMƏ: `e2e-shots/r11y-r2-*.tmp`, `bds-review-*.png`, `kds-review-*.png`, `_findings_r11y_r2.md`, `scripts/__pycache__/`, `next-env.d.ts` (dev artifact).

---

## 7. BU COMMIT-DƏ DƏYİŞƏNLƏR (12q)

| Fayl | Dəyişiklik |
|---|---|
| `src/app/admin/pos/components/KDSView.tsx` | seq guard + optimistic merge window + optimistic handlers (tick/ready/rush/fire/86) + auto-accept (acceptAttemptRef) + RUSH card marker/cardCls + modal RUSH pill + course pills + item 86 + GÜN rush marker |
| `src/app/admin/pos/hooks/usePos.tsx` | KITCHEN_RANK + floor high-water clamp (kitchenHighWaterRef) |
| `src/app/api/kitchen/accept/route.ts` | `kitchen_accepted_at` stamp (NULL-ikən) + item alignment pending/sent→accepted |
| `src/app/api/kitchen/rush/route.ts` | **YENİ** — toggle_rush + flag echo |
| `src/app/api/kitchen/fire-course/route.ts` | **YENİ** — fire_course_atomic |
| `src/app/api/kitchen/void-comp-waste/route.ts` | shiftGate `origin:'kds'`+void exemption |
| `src/app/api/kitchen/daily/route.ts` | `is_rush` select + ticket row |
| `src/lib/i18n/locales/{az,en,ru}.ts` | 12q key-ləri (6 ədəd × 3) |
| `e2e-shots/r12q-*.png`, `e2e-r12q-results.md`, `e2e-shots/r12q2-*.png` | E2E sübutları |
| `HANDOFF_12Q.md` | Bu sənəd |
| **DB (repo-xarici, artıq applied):** | `role_permissions` + kitchen/`order.void` |
