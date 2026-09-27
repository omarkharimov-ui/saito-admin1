# HANDOVER — Saito POS (agent switch, 2026-09-27, ~18:00 Baku)

> Bu sənəd növbəti agent üçün tam özünü-kafi handoff-dur. Səhv etdiyim yerdə
> `git log --oneline -20` + `MASTER_FEATURE_MAP.md` §10 (journal, newest-first) bax.

## 0. STATUS QISCA

- **Repo:** `/Users/mr.apple/saito-admin1/` · app: `artifacts/saito-admin/` (git path prefix `artifacts/saito-admin/`)
- **HEAD:** `b469f842` — **HARİÇDƏ: 7 fayl UNCOMMITTED** (bu turn-un işi, §2-də detallı). `git status` / `git diff --stat` ilə görünür.
- **Dev server:** `http://localhost:3000` (adətən işləyir; yoxdursa `corepack pnpm dev` inside `artifacts/saito-admin/`)
- **Login:** `/login` → PIN **4321** · POS: `/admin/pos`
- **pnpm workspace** — `npm i` QIQDIR (repo qırılır). Həmişə `corepack pnpm`.
- **tsc:** `npx tsc --noEmit` — app kodu təmiz olmalıdır. `src/__tests__/*` jest-typing xətaləri PRE-EXISTİNG-dır — ignor.
- **Owner:** AZ danışırlar, mənə "brat" deyirlər, sərt və dəqiq. Owner-ə cavab HƏMİŞƏ AZ. "lazımsızdır" ≠ silmək icazəsi.

## 1. ENV / TOOLS

- E2E = browser sub-agent (user Chrome) + **frame sampling** (animasiyaları opacity keyfiyyətlərlə ölç). Screenshot-lar: `artifacts/saito-admin/e2e-shots/`.
- Journal: `MASTER_FEATURE_MAP.md` §10 — hər round-dan sonra newest-first entry əlavə et.
- Canonical UI direction (ratified 2026-09-19, BINDING): `SAITO_UI_VISUAL_DIRECTION.md`.

## 2. BU TURN-DA YAPILANLAR (UNCOMMITTED — 7 fayl + e2e-shots)

| Fayl | Dəyişiklik | E2E statusu |
|---|---|---|
| `src/lib/api-fetch.ts` | **CSRF 403 self-heal**: mutation-da 403 → `saito_csrf` cookie-ni yenidən oxu, singleton-ı yenilə, 1 dəfə retry. "Mexaniki ilk klik" kök səbəbi (dismiss 403 → 2-ci klik işləyirdi). | ✅ dismiss **ilk klikdə 200**, sessiya boyu **0×403** |
| `src/app/admin/pos/components/ProductGrid.tsx` | Kitchen popover = **yalnız seçilmiş masa** ("Bütün sifarişlər" + `useKitchenSummary` 5s RPC poll **silindi**); pill badge = masanın ready+prep; alov = statik ikon + opacity-only breathing glow 2.4s (scale/skew YOX); OOS image: `?t=Date.now()` retry **silindi** (error → dərhal placeholder; kataloq reload-da reset) — **yanıb-sönmə fix** | ✅ popover "Masa 17 • SEÇİLMİŞ" + 3 stat cell; `animation-name: saito-flame-breathe`/`saito-glow-breathe`; 12s sample = **1 distinct state** |
| `src/app/admin/pos/components/CartPanel.tsx` | **Təmizlə** full-width bardan cart header-in SAĞ YUXARISINA köçdü (ghost pill, trash icon, rose hover, AnimatePresence 240ms fade, `hasDraft && !voidMode`-də görünür); void row = yalnız LƏĞV ET, AnimatePresence height-collapse 280ms; empty state = fade-in 320ms | ⚠️ yerləşim/exit/empty-state OK (screenshot 07/08/12) — **AMA B-BUG:** ilk TƏMİZLƏ tap no-op (aşağıda) |
| `src/app/admin/pos/page.tsx` | `outOfStockSet` + `posCartCounts` **useMemo** (inline Set/reduce hər 3s floor-poll-da yeni identity → grid `filtered` memo invalidate → OOS flicker kökü); `currentTableKitchen={pos.cart ? ... : null}` | ✅ (flicker fix-in bir hissəsi) |
| `src/app/admin/pos/hooks/usePos.tsx` | **60s kataloq avto-sync** (`document.hidden` guard) — stok SSOT = `products.is_in_stock`/`is_available` admin flag-ları; POS-da OOS/prices/availability avtomatik yenilənir | ⚠️ kod yazıldı, network verification (60s-də /api/pos/products tick) E2E-də görünmədi — qısa probe ilə təsdiqlə |
| `src/app/admin/pos/components/OrderHistory.tsx` | **TARİXÇƏ premium redesign**: max-w-xl, `rounded-[32px]`, `/90` bg + `backdrop-blur-xl`, header = emerald clock chip + title + canlı subtitle (order count / detail-da date·time), circular ghost close, **segmented** SİFARİŞLƏR/İSTİSNALAR (2 üzən button yox), order cards: total sağda bold, guests, kiçik chips | ✅ ilk-klik: order card→detail, back, İSTİSNALAR, reprint (screenshots 01/02/09) |
| `src/app/admin/pos/components/CashDrawerPanel.tsx` | **KASSA premium redesign**: max-w-lg, `rounded-[32px]`, header = wallet chip + "Açıq/Qıfıllandırılıb · Kassir" subtitle, primary grid `grid-cols-3`, view-swap `AnimatePresence mode="wait"` wrapper | ✅ ilk-klik: 8/8 sub-view + Z (screenshots 03/04/05/10/13) — **AMA A-BUG:** view-swap opacity animatsiya ETMİR (aşağıda) |

`tsc --noEmit` (app scope) = **təmiz**.

## 3. PENDING BUGS — növbəti agentin #1 prioriteti

### A. KASSA view-swap opacity donmuş (visually: 215ms boş ekran + snap)
**Repro:** KASSA aç → DAXİLOLMA bas → köhnə grid y-animatsiya edir (0→−8) amma **opacity 1-də donub** 220ms-də silinir; yeni form **opacity 0-da 216ms boş** qalıb, y-animatsiya edir, opacity anidən 1-ə qalxır. (Probe timeline: t=5195→5660, `e2e-shots/13-kassa-cashin.png`.)
**Root cause hipotezi:** card-da `backdrop-blur-xl` — Chrome backdrop-filter ancestor-u child opacity animasiyasını qırır (transform/y ayrı pipeline olduğundan y işləyir). Modal entrance (card öz opacity-si) işləyir; **içəri** view swap-lar işləmir.
**Fix plan:**
1. Card-dan `backdrop-blur-xl`-i APO (veil `bg-black/20 backdrop-blur-sm` səhifəni artıq blur edir); bg-ini daha opaque et (dark `bg-zinc-900/95`, light `bg-white/95`).
2. `AnimatePresence`-i `mode="wait"` → default **sync** (page.tsx products/customer phase wrapper-da İŞLƏYƏN pattern — oranın prop-larını kopyala: `initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.22, ease:[0.4,0,0.2,1]}}`).
3. **Eyni müalicəni TARİXÇƏ-yə də tətbiq et:** (a) onun card blur-u da apara, (b) list↔detail switch hazırda **anidən** swap olunur — iki keyed motion child (key="oh-list" / "oh-detail") ilə eyni 220ms fade ver (fragment AnimatePresence-də track olunmur — hər biri ayrı `motion.div` olmalıdır).
4. Frame sampling ilə verify: opacity 0→1 ramp görməlisən, boş boşluq YOX.

### B. TƏMİZLƏ ilk tap no-op ("mexaniki problem" variantı)
**Repro:** boş masa → 1 məhsul əlavə et → TƏMİZLƏ ghost pill header-də görünür → **ilk tap: pill highlight olur (klik elementə çatır) amma cart təmizlənMİR; ikinci tap: təmizlənir.** (Probe 1, masa 18.)
**İstiqamət:**
- `usePos.tsx` `clearCart` (~line 1517): guard-lara bax (`reservationMode`, `isDirty`, `cart` null check) — ilk çağırışda hansı şərt no-op verə bilər?
- Və ya `motion.button` entrance animation-ı (opacity 0→1, 240ms) sırasında ilk click-in yutulması — framer gesture/pointer quirk. Test: pill görünən 5s sonra bas (entrance bitib) — işləyirsə → timing quirk; həmişə no-op-dursa → clearCart guard.
- Owner üçün QİRAĞI: hər operation ILK klikdən işləməlidir.

### C. Sonra
1. A + B fix → tsc → qısa E2E (KASSA view-swap fade frame sample; TƏMİZLƏ ilk tap) → **bir commit** (message: bu turn-un bütün işi + fix-lər) → `MASTER_FEATURE_MAP.md` §10 entry (newest-first).
2. Qısa probe: 60s kataloq sync tick görünür? (network-də hər 60s `/api/pos/products` GET) — görünmürsə reason tap (həmçinin admin-də `is_in_stock` toggle edib POS-da OOS badge-in 60s içində dəyişdiyini yoxla — owner bunu soruşdu).
3. E2E qalıqları: masa 18 seated/empty, masa 17-də 1 draft "Tea" (10₼). Demo data; təmizləmək istəsən: kart seç → MƏTBƏXDƏ/⋮ → sifariş dismiss (ilk klikdən işləyir).

## 4. UI QAYDALARI — DETALLI (BINDING, owner-final)

### 4.0 STATE MACHINE QURULUŞU (owner doctrine — ƏVƏLCƏ oxu)
Owner: "Mənim istədiyim çox yumşaq, təbii və premium state transition-lardır. iOS 27
Gallery-da 'Sil' basanda şəkillər bir anda yox olmur; yavaş və zərif fade-out ekrandan
çıxır. Eyni prinsipi POS-un BÜTÜN state dəyişikliklərinə tətbiq et."

**Ümumi qanun (hər state machine üçün):**
1. Hər state change = **animasiyalı transition** — HEÇ BİR şey snap/instan yox olmur, HEÇ BİR şey anidən peyda olunmur.
2. **Enter: snappy** (spring 420/28 press, yaxud 200–280ms). **Exit: graceful** (280–360ms, `ease [0.45,0,0.55,1]`, **zero overshoot**).
3. Value/label/amount dəyişikliyi = **time-based morph/fade** (80–360ms) — spring YOX (4.1-də).
4. Token-lər `src/lib/motion/system.ts`-dən — raw framer qiyməti İCXETMƏ.
5. Implementasiya qaydaları (4.2 + 4.3): persistent AnimatePresence, keyed `motion.div` child, `if (!open) return null` YASAQ, fragment YASAQ, `backdrop-blur` ancestor-də child opacity donur (bug A).
6. Test: frame sampling ilə (opacity intermediate value-ları görməlisən) + HƏR İKİ tema.

**M1 — Table card (floor) state machine:**
- States: `EMPTY(BOŞ) → OCCUPIED → COOKING → WAITING_BILL → PAID → DIRTY/CLEANING → EMPTY`; + seçiliq: **blue selection border**.
- Border qaydaları: empty kart = `border-transparent` (HƏR iki tema — ağ border QAYTARMA, 4.6); occupied = `border-emerald-500/45` (dark).
- **Model transition (owner-approved): blue selection border-in fade-out (Dismiss zamanı).** Green border (occupied) da Sərbəst burax / Hesabı bağla / Dismiss-da **eyni zərif fade-out** — `transition: border-color 0.32s cubic-bezier(0.45,0,0.55,1)` `TableCard.tsx` card base-də. Border-color transition HƏMİŞƏ 320ms symmetric — kənarda 200ms-ə salma (yaxın state-də border "snap" olurdu, `3eea7dfe` lesson-i).
- Kartın içi (label/chip/amount) = content fade/morph; OVERLAY NEVER (4.5): operation = kartın ÖZÜNÜN transformu: border crossfade + label morph + settle 0.99→1 + grid layout glide.
- State DATA-sı server-dən (`/api/pos/tables` 3s poll + realtime `pos-sync`) → kart yeni state-ə animasiya edir; lokal optimistic snap YOX (stale-guard: generation token, `usePos.fetchFloor`).

**M2 — Cart (order phase) state machine:**
- `EMPTY → DRAFT (unsent items) → SENT (kitchen) → (partial: hər sətirin öz state-i: draft/hazırlanır/hazır via kitchen_status)`; + **void mode** (cart daxilində sub-state: `voidMode` flag, sətirlər voidable olur, LƏĞV ET morph).
- Sətir enter: snappy (spring press 420/28). **Sətir exit: graceful 0.26s** — `exit={{opacity:0, scale:0.98, transition:{duration:0.26, ease:[0.45,0,0.55,1]}}}` (CartPanel rows).
- **Təmizlə: DRAFT → EMPTY** — sətirlər graceful exit → empty state **fade-in 320ms** (data bir anda YOX OLMUR — owner: "aydın və zərif keçid"). Təmizlə yeri: cart header SAĞ YUXARI ghost pill (full-width bar YOX — owner "çox pis yerləşdirilib" dedi).
- Footer totals = **COUNTER-ROLL** (4.1 exception) — hər state change-də rəqəmlər roll olur, fade YOX.
- `hasDraft`/`isEmpty`/`hasVoidableItems` derived flags — UI state-ləri bunlardan törəyir; yeni sub-state əlavə edəndə eyni pattern.

**M3 — Modal/sheet (TARİXÇƏ, KASSA, ActionSheet, PinGuard...):**
- `CLOSED → OPEN`: `centerModal` spring (500/26 "kəsəy" — owner-tuned dialog surface) + backdrop 220ms fade.
- `OPEN → CLOSED`: `fastExit` 280ms `[0.45,0,0.55,1]` (`src/lib/modal-transitions.ts`) — graceful, HEÇ VAXT instant close.
- **Modal İÇİ view swap** (TARİXÇƏ list↔detail; KASSA main↔sub-view) = da state transition-dir: keyed motion child + 220ms fade+8px drift. ⚠️ hazırda QIŞIRI (bug A: KASSA opacity donub + 215ms boşluq; TARİXÇƏ list↔detail anidən) — fix §3-A.
- Pattern (4.2): `{open && <motion.div key="...">}` daimi AnimatePresence içində; ReservationActionSheet fragment lesson-i.

**M4 — Phase/tab switching:**
- products ↔ customer phase, dine-in ↔ takeaway ↔ delivery tab: **sync AnimatePresence + keyed motion.div** (page.tsx-də İŞLƏYƏN pattern — oradan kopyala, 220ms fade + 8-10px drift).
- `switchMode`: selectedTable + cart sıfırlanır (state reset) — view transition animated; qəhvə-draft restore = DATA-ONLY (səth re-select ETMƏ — ghost border lesson-i, `b469f842`).

**New state machine əlavə edəndə checklist:** [ ] states enum/flags tap → [ ] hər transition-ın enter (snappy) + exit (graceful) təyin olunub → [ ] token-lər system.ts-dən → [ ] AnimatePresence qaydaları (4.2) → [ ] backdrop-blur ancestor yoxdursa → [ ] frame sampling E2E + iki tema → [ ] overlay YOX (4.5).

### 4.1 Motion doctrine — İKİ fəsilə
1. **STATE TRANSITIONS** (label/amount/pill/view swap): time-based easing, **ZERO overshoot**, 80–360ms, symmetric `ease [0.45,0,0.55,1]` ("yavaşca fade, yavaşca morph"). Hiç bir şey birdən yox olmamalı (iOS 27 Gallery trash doctrine).
2. **PHYSICAL OBJECTS** (capsule/sheet/press): owner-tuned spring-lər — **press 420/28, micro 280/22, surface 480/24**. `500/26` "kəsəy" YALNIZ owner-un özü tuned etdiyi dialog surface-ləri (note pill, modals).
- **Canonical token-lər: `src/lib/motion/system.ts`** — raw framer qiyməti İCXETMƏ. `src/lib/modal-transitions.ts` `fastExit` = `{duration:0.28, ease:[0.45,0,0.55,1]}` — sistem-miş modal exit.
- Doctrine: **enters snappy, exits premium.**
- **EXCEPTION (owner-final, commit `0ba5ecd0`): POS cart footer totals = COUNTER-ROLL** (`NumberRoll` ×4 + `RollingNumber` hero, duration 0.3) — "o daha qesengdir". Roll↔fade↔morph əvəzləmə **icazəsiz HƏRƏKƏT DƏYİLDİR** — vizual pattern, icon set, spring — heç biri icazəsiz dəyişmir.

### 4.2 Presence pattern (exit animasiyasının canlı qalması üçün)
- `if (!open) return null` early-return + internal AnimatePresence = **YASAQ** — component unmount olur, exit oynatılmır. Komponent mounted qalmalı, şərt **daimi AnimatePresence-də keyed motion child** içində olmalı.
- **Fragment AnimatePresence-də track olunmur** — keyed child `motion.div` olmalıdır.

### 4.3 ⚠️ backdrop-filter opacity bug (bug A-da)
- `backdrop-blur-*` card-da **uzaq child** framer opacity animatsiyası donur (yalnız transform işləyir). Card-da blur istifadə etmə; blur veil-də qalsın.

### 4.4 İkonlar
- **Phosphor YALNIZ** `src/components/ui/saito-icons.tsx` adapterindən (185 fayl). `from 'lucide-react'` = **YASAQ**. Yeni ikon = adapterdən (name mapping + `strokeWidth→weight` contract). Install: pnpm.

### 4.5 OVERLAY NEVER
- Table card/surface-ə operation-label overlay (ÖDƏNDDİ, MASA BOŞALDI pill-ləri) QOYMA — owner "cox irgencc" dedi; op-flash sistemi silindi (`7220ff18`), QAYTARMA. Operation elementin ÖZÜNÜN transformu ilə danışılır: border crossfade 200–320ms + label morph + card settle 0.99→1 + grid glide.

### 4.6 Rəng
- **YELLOW YOX** — emerald focus. Amber yalnız mövcud, yerli warning state-lərdə (kassa XƏRC, NO SALE, YENİ OTURUŞ) — yeni sarı accent İCMAL.
- Table borders: empty kartlar = `border-transparent` (HƏR iki tema) — ağ border QAYTARMA (3 round uğursuzluqdan sonra: `3eea7dfe`/`0253c58e`/`9e3c50c2`). Occupied = `border-emerald-500/45` (dark); border-color transition **320ms symmetric** (green border fade = blue border kimi — `3eea7dfe`).

### 4.7 Feature preservation
- Feature "lazımsız" deyib silmək = **İCAZƏSİZ HƏRƏKƏT** (LESSON: LƏĞV ET void mode-u yanlış oxuyub silmişdim, owner qaytarıldırdı — byte-for-byte `51b2705d`-dən restore). Hər silmədən əvvəl owner-ə soruş. Eyni qayda **vizual pattern-lərə** də şamil olunur (2026-09-27 genişləndirmə: "icazəsiz şeylər etmə" — cart counter-roll→Morph swapdan sonra).

### 4.8 Frozen / parked (canonical: MASTER_FEATURE_MAP)
- **Upsell**: UI silindi (`dc807f83`, `832cf961`), server `/api/upsell/*` **frozen** — cart-də offer card QAYTARMA.
- **Card auto-capture**: parked (Wave C #1) — istənilmədən implement ETMƏ.
- **POS = NATIVE APP** (owner qərarı 2026-09-25): iOS/Android + Mac/Windows; web-only workaround (kiosk/PWA/browser lockdown) TƏQDİM ETMƏ. Stabil persistent `device_id` (localStorage web+native hər ikisində yaşayır).

### 4.9 Error handling UX
- Raw DB error code HƏR GÖRÜNÜŞƏ ÇIXMAMALI — friendly AZ/EN/RU dialog (nəmunə: `OPEN_SHIFT_REQUIRED` + clock-in button) və ya AZ toast.

### 4.10 i18n
- `useLanguage()` `t()` — **typed key union**; mövcud olmayan key = tsc ERROR (`t('locked')` düşdüm → literal string istifadə). Yeni UI mətni üçün ya mövcud key, ya inline AZ literal (pattern: `t('x') || 'Fallback'` yalnız mövcud key-lər üçün).

### 4.11 Tema
- Light + dark: `lightMode` flag + `--theme-*` CSS var-ları. **Hər UI işini HƏR İKİ temada test et** (owner random rejim dəyişir).

### 4.12 ⚠️ ClassName comment footgun
- Brauzer `class` attribute-i whitespace-də parçalar — `className={` şablonu içində **`/* comment */`-dəki HƏR tək söz canlı Tailwind class-a çevrilir** ("ring" → hər kartda 1px ağ ring, `9f4e5302`-də tapıldı). Comment-lər className-dan XARİCƏ; `TableCard.tsx`-də uyarı var.

### 4.13 Stok (OOS) sistemi — bu turn-da quruldu
- SSOT = `products.is_in_stock` / `products.is_available` (admin flag, Admin → Məhsullar) → `/api/pos/products` → POS-da `outOfStockSet` (memoized) → kart `opacity-50 grayscale border-rose-500/30` + "Stokda yoxdur" pill. **60s avto-sync** (usePos) ilə admin dəyişəndə avtomatik yenilənir. Image error → dərhal placeholder (retry YOX — flicker səbəbi idi).

### 4.14 CSRF (bu turn-da self-heal edildi)
- Double-submit: `X-CSRF-Token` header **=** `saito_csrf` cookie. Client singleton (`api-fetch.ts`) page-load başına 1 dəfə oxunur; cross-tab cookie drift → ilk mutation 403. **İndi:** 403-də cookie yenidən oxunur + singleton yenilənir + 1 retry (CSRF check handler-dan ƏVVƏL işlədiyi üçün retry side-effect-free-dir). Yeni mutation route-u yazanda `apiFetch` istifadə et (bare `fetch` yox) — `fetchFloor`/`fetchCatalog`-dakı bare fetch-lər CSRF-dən təsirsizdir (GET).

## 5. REPO HİJYENE (bu turn-da)
- 39 dated one-off MD (P0–P9, W-A1–3, audits, inventories, `replit.md`, e2e temp findings) → `~/.Trash/saito-mds-2026-09-27/` (həmmisi git-tracked idi → **git history-dən bərpa oluna bilər**: `git show HEAD:PATH`).
- QALAN root MD-lər: `ARCHITECTURE.md`, `HANDOVER.md` (bu sənəd), `MASTER_FEATURE_MAP.md` (journal), `PARTNER_API_DESIGN.md`, `README.md`, `SAITO_UI_VISUAL_DIRECTION.md`, `SECRETS.local.md`.
- `e2e-shots/*.png` — owner baxışı üçün saxlanıldı (13 screenshot); istəsən sil.

## 6. KOMMIT GİSİ (gələn round üçün)
Son commits: `b469f842` (ghost blue border fix) ← `9f4e5302` (1px ring fix) ← `9e3c50c2` / `0253c58e` (border transparent) ← `3eea7dfe` (border grace 320ms — ring bug buradan gəldi) ← `0ba5ecd0` (cart counter-roll RESTORE) ← `a3021e4a` (grace doctrine + presence fixes).
