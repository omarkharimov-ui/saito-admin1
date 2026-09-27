# HANDOVER — Saito POS (agent switch, 2026-09-27, ~18:00 Baku)

> Bu sənəd növbəti agent üçün tam özünü-kafi handoff-dur. Səhv etdiyim yerdə
> `git log --oneline -20` + `MASTER_FEATURE_MAP.md` §10 (journal, newest-first) bax.

## 0. STATUS QISCA

- **Repo:** `/Users/mr.apple/saito-admin1/` · app: `artifacts/saito-admin/` (git path prefix `artifacts/saito-admin/`)
- **HEAD:** `50e0fb63` (entry-bug fix: mount-prefetch SWR + primeCache 500-catch + morph visibility) + üstündə **MORPH V2 batch** (deterministik manual ghost — layoutId bir-istiqamətli çıxdı) + 1 docs commit. Zəncir: `git log --oneline -7`. Variant qərari: **V1 "Clean list"**. **BÜTÜN owner nöqtələri (a-e) TAMAMDIR** — §3-D də ✅ FIXED (E2E rAF trace, dark+light, 0 console error). Repo **TƏMİZDİR**, `origin/main` ilə sinxron.
  - ⚠️ Əvvəl burada "HEAD `b469f842` — 7 fayl UNCOMMITTED" yazırdı — **o qeyd KÖHNƏ idi** (§2-dəki 7 fayl həmin anda commit olunmuşdu).
- **Dev server:** `http://localhost:3000` (adətən işləyir; yoxdursa `corepack pnpm dev` inside `artifacts/saito-admin/`)
- **Login:** `/login` → PIN **4321** · POS: `/admin/pos`
- **pnpm workspace** — `npm i` QIQDIR (repo qırılır). Həmişə `corepack pnpm`.
- **tsc:** `npx tsc --noEmit` — app kodu təmiz olmalıdır. `src/__tests__/*` jest-typing xətaləri PRE-EXISTİNG-dır — ignor.
- **Owner:** AZ danışırlar, mənə "brat" deyirlər, sərt və dəqiq. Owner-ə cavab HƏMİŞƏ AZ. "lazımsızdır" ≠ silmək icazəsi.

## 1. ENV / TOOLS

- E2E = browser sub-agent (user Chrome) + **frame sampling** (animasiyaları opacity keyfiyyətlərlə ölç). Screenshot-lar: `artifacts/saito-admin/e2e-shots/`.
- Journal: `MASTER_FEATURE_MAP.md` §10 — hər round-dan sonra newest-first entry əlavə et.
- Canonical UI direction (ratified 2026-09-19, BINDING): `SAITO_UI_VISUAL_DIRECTION.md`.

## 2. ƏVVƏLKİ TURN (ARTIQ COMMIT OLUNUB — `080742b5`-də)

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

## 2b. BU ROUND (2026-09-27, "davam ele") — BUG A + B FIX (✅ TAMAM, commit olunub)

İki açıq bug (§3-A, §3-B) bağlandı. Dəyişən fayllar: **3**
(`CashDrawerPanel.tsx`, `OrderHistory.tsx`, `hooks/usePos.tsx`) + sənədlər.

- **BUG A** → card-dan **`backdrop-blur-xl` APARILDI** (kök səbəb: ancestor
  `backdrop-filter` Chrome-da uzaq child-in opacity animasiyasını dondurur), səth
  `/90` → `/95`; view-swap `mode="wait"` → **`mode="popLayout"`** (container
  `relative`, child `w-full`); TARİXÇƏ list↔detail indi bir `AnimatePresence`-də
  iki keyed `motion.div` (`oh-list` / `oh-detail`).
- **BUG B** → `clearCart` indi `pos_draft_<mode>` açarını **SİNXRON** silir (hər iki
  yol: dine-in + reservationMode). Kök səbəb **effekt-sırası yarışı** idi — event
  deyil (ilk tapda `click` düyməyə çatırdı).
- **E2E**: BUG B **5/5 ilk tap** (hər iterasiya təmiz reload → deterministik) ·
  KASSA/TARİXÇƏ crossfade 20–26 ara opacity, **0 ms boşluq** · tab-dəyişməsi
  ("səbət itmir") reqressiyası **PASS** · console errors **0**.
- **Tam detallar + qalıq qeydlər**: `MASTER_FEATURE_MAP.md` §10 →
  "2026-09-27 (BUG A + B FIX …)" (newest-first, ən yuxarıda). Orada qeyd olunanlar:
  `resetCart` eyni sinif yarışa açıqdır (TOXUNULMADI), cart sətirlərinin özü bir
  frame-də unmount olur (per-row opacity ramp yox), reload-da nadir "Retry" ekranı.
- Screenshots: `artifacts/saito-admin/e2e-shots/14-*` və `15-*`.

## 2c. MORPH BƏRPA (2026-09-27, "Təmizlə en yuxarıya düşüb") — ✅ TAMAM

Owner: "TƏMİZLƏ LƏĞV ET ilə **eyni sətirdə** olmalıdır — əvvəlki morph geri qaytar".
2026-09-27 "header pill" round (`6bd92ec3`) morph-u qırmışdı; `b469f842`-dəki dizayn
bərpa olundu. `CartPanel.tsx`-də:
- header-dakı **Təmizlə ghost pill SİLİNDİ** (artıq en yuxarıda YOX).
- void-row → **morph row**: eyni row-da (border-t) iki button, spring flex-share morph:
  **no draft → LƏĞV ET full** · **draft+no sent → TƏMİZLƏ full** · **mixed → 50/50 split**
  `[TƏMİZLƏ | LƏĞV ET]`. Row graceful collapse (280ms) saxlanıldı.
- E2E: TEST A Təmizlə 383/Ləğv 2 (full) · TEST B Təmizlə 2/Ləğv 383 (Ləğv full) ·
  TEST C 192/192/8 (50/50, ~210ms smooth split) · light eyni · **0 console error, 0 DB yazı**.
- Detal: jurnal `MASTER_FEATURE_MAP.md` §10 (newest-first) · screenshots `e2e-shots/17-morph-*.png`.

## 2d. CART BODY STATE MACHINE (2026-09-27, "sebet instant; button/placeholder desync") — ✅ TAMAM

Owner: "sebet eləmədə/təmizləmədə **instant** dəyişir, amma masa boş olanda
Təmizlə/placeholder **desync**; state machine düşün".
- **Kök səbəb**: empty + non-empty cart **iki müstəqil JSX budağı** idi → non-empty
  bədən 1 frame-də **instant unmount**, empty placeholder **320ms fade-in** = ~320ms **boş frame**.
- **Fix**: kart bədəni **tək `AnimatePresence` crossfade**-inə çevrildi — non-empty
  (in-flow, graceful enter/exit 280ms) + empty placeholder (absolute overlay, graceful)
  üst-üstə fade olur → **boş frame YOX**. Təmizlə/Ləğv morph row bədənin içindədir,
  items-lə birlikdə fade olur. Primary CTA (MASANI TUT/Sifariş) + modallar sibling, toxunulmadı.
- E2E: ADD/CLEAR dark+light — **0 blank frame**, max overlap ~0.4–0.67, row body ilə fade.
- Detal: jurnal `MASTER_FEATURE_MAP.md` §10 (newest-first) · screenshots `e2e-shots/19-crossfade-*.png`.

## 2e. TECH BATCH (2026-09-27, owner 6-nöqtəlik turn) — ✅ TAMAM

Owner turn-un **texniki** hissəsi (guest confirm, modal açılış performansı, blur
sync, VKB fit). Dizayn hissəsi (3 order-card variantı, Tarixçə tabs, Kassa
Apple-minimal redesign) növbəti round. Dəyişən: **5 fayl** + sənədlər.

- **Guest OPTİMİSTİK**: `commitGuestCount` tap-da `onGuestCountSaved` fırladır (cart
  chip **instant**), POST background-da; commit-də `onGuestCountPersisted` →
  `pos.fetchFloor()` (yalnız floor, `fetchData()` fan-out YOX). E2E: +/− ~31ms,
  ✓ confirm **52ms** (köhnə 1500ms+).
- **Modal STALE-WHILE-REVALIDATE**: `hasLoadedOnce` ref — spinner yalnız İLK
  yükdə; re-open cache-dən instant + background refresh. E2E: Kassa 4333ms→
  **65ms**, Tarixçə 1115ms→**179ms**.
- **Kassa blur SINGLE-CLOCK**: blur nested veil-dən **animated root**-a köçdü
  (`bg-black/20 backdrop-blur-sm` + `fastExit`), card child `stopPropagation` —
  Tarixçə ilə eyni quruluş; "Kassa açılır, blur sonra olur" aradan qaldırıldı.
- **VKB FIT**: hər iki modal `useKeyboardHeight()` (köhnə `var(--vk-height)`
  DEAD idi); keyboardHeight>0 → card `maxHeight: calc(100vh - kh - 32px)` —
  balanslı, input kəsilmir. Desktop E2E-olunmayıb (mobil lazımdır).
- Detal: jurnal `MASTER_FEATURE_MAP.md` §10 (newest-first) · screenshots
  `e2e-shots/20-*.png` (18-*-lərlə birlikdə bu round-un).

## 2f. DESIGN BATCH (2026-09-27, owner 6-nöqtəlik turn) — ✅ TAMAM (variant qərari gözləyir)

- **Tarixçə tabs**: sliding pill segmented (Sifarişlər/İstisnalar + 2 filter qrupu:
  source/status, hər birinin öz pill-i); status "Hamısı" → "Bütün"; tab content
  = parallel crossfade (220ms, frame-cəmi ≈1.0 — rAF ilə sübut). 2 E2E bug
  tapılıb-fix olundu: card 0px collapse → list mode-da definite 85vh; iki pane
  eyni anda render → `sheetTab` ternary AnimatePresence-də.
- **3 order-card variant** `renderOrderCard()` + **TEMPORARY 1/2/3 switcher**
  (modal header): V1 clean list · V2 ledger card · V3 accent receipt.
  **⚠️ Owner variant seçəcək → sonra switcher + digər 2 silinəcək.**
- **ORD chip SİLİNDİ** (`CartPanel.tsx` cart header, owner explicit) — data saxlanılır.
- **Kassa Apple-minimal**: metric tile-lər yoxdur (dashboard syndrome → tək hero:
  balance + 1 sətir meta + hairline NAĞD/KART/XƏRC rəqəm-rəngli); tək solid emerald
  Daxilolma; quiet secondary pair; borderless accessory row; hairline hərəkət list.
- Detal: jurnal `MASTER_FEATURE_MAP.md` §10 (newest-first) · screenshots
  `e2e-shots/21-28-*`.

## 2g. MODAL & VKB BATCH (2026-09-27) — ✅ TAMAM

Owner-un 7 nöqtəlik turn: refund modalı + üfüqi balanslı modallar + scroll azaltma +
Tarixçə qiyməti + variant qərari + Kassa label-ları + VKB stacking/stil + TableCard.

- **Refund** indi **wide 2-column sheet** (summary+üsul sol, mode+məbləğ+səbəb sağ,
  actions footer) — klaviaturada card `maxHeight: calc(100vh - vk - 48px)` ilə
  **ekrandan çıxmayıb** (E2E top=69). Detail: **sticky footer** (Çap/Qaytarma həmişə
  görünür) + audit log default 3 ("Bütün tarixçə (N)" expand).
- **Variant qərari: V1 "Clean list"** — V2/V3 + switcher silindi. Tarixçə eni
  max-w-2xl (672px, üfüqi balanslı).
- **VKB stacking fix**: transform wrapper-dan fixed element-in özünə köçdü
  (köhnə: z-10002 wrapper-in trapped → klaviatura modal arxasında açılırdı).
  Apple restyle: light/dark keycap, done key EMERALD, "Virtual Keyboard" label yox →
  grabber + GİZLƏ pill, `.vk-active` ring emerald.
- **Kassa accessory row**: Satışsız / Nağd çekmə / Depozit / Qıfılla / Z hesabat
  + tooltip-lər (effekti izah edir).
- **TableCard**: group child chip-lər (16·18) bottom-left row-a; counter-lar quiet;
  badge-li title text-lg; E2E 0 overlap.
- **Tarixçə qərarı (qiymətləndirmə)**: SAXLANDI (reprint/refund/exceptions = core
  kassir axını) — yığcam həll ilə (sticky footer + audit collapse).
- Detal: jurnal `MASTER_FEATURE_MAP.md` §10 · screenshots `e2e-shots/30-40-*`.

## 2h. MORPH + CART-PERSIST + DB HYGIENE (2026-09-27, owner 5-nöqtəlik turn) — ✅ TAMAM (E2E + §3-D pending)

- **(a) Mərtəbə çipi ⇄ tab pill morph** (WhatsApp-style shared element): `layoutId="pos-floor-chip"` — İÇƏRİDƏ-da `LiquidDropdown` trigger (yeni `layoutId` prop), TAKEAWAY/ÇATDIRILMA-da `DragTabSwitcher`-in aktiv pill-in MƏRKƏZİNƏ `pillOverlay` (yeni optional prop) ilə dot; Framer layoutId projection = çip pill-ə uçub əriyir / geri çıxır (260ms `[0.45,0,0.55,1]`, zero overshoot). `floors>1` şərti ilə fəaliyyət göstərir (DB-də 2 floor).
- **(b) Səbət Customer Info-da qalır**: `page.tsx`-də `{posPhase !== 'customer' && (cart)}` gate SİLİNDİ — 440px column həmişə mounted. Phase exit-ləri enter-in exact reverse-etdi (customer `y:14 scale:0.99`, products `y:10`) — "açılış bizə doğru, bağlanış eyni yol əksinə".
- **(c) Owner təsdiqi**: Tarixçə modal (ş4) + detail (ş5) + refund (ş6) dizaynları **qəbul olundu — toxunulmadı**.
- **(d) ✅ Tarixçə modal-girişi bug DÜZƏLDİLDİ** (E2E-reproduksiya olundu: mount-prefetch SWR + "Yüklenir..." subtitle + `primeCache` 500-catch — detal §3-D).
- **(e) DB HYGIENE**: orders 849→0 (bütün data dev/test: 2026-03-19→09-27, Admin Updated/superadmin/test staff) + uşaqlar (items 891, payments 161+2, events 54, cancelled 25, kitchen 24+3, logs 351+392+130, inventory 64). Immutable trigger-lər (`order_payments`, `inventory_logs`) transaction içində disable/enable; `table_floors` (107 masa) + floors + staff + customers + reservations + Kassa saxlanıldı. Detal: jurnal §10.
- **E2E**: ✅ TAMAM (2 browser round, rAF rect trace + frame sampling, dark+light): entry anında (flash YOX), 500 badge YOX (`__errs=[]`), morph OUT 253ms chip-box→pill-center (start **bayer-bayer** chip box), IN 334ms pill-center→chip-box, console errors 0, layout breakage 0. Screenshotlar: `e2e-shots/41-65, 55-58, 70/80-final`.
- **⚠️ MORPH V2 (möhüm)**: layoutId projection E2E-də yalnız chip→pill istiqamətində işlədi (opacity-0-da bitən elementdən framer project etmir) → morph indi **deterministik manual ghost**dur (`page.tsx` `handleTabMorph` + `fixed left-0 top-0` ghost; `DragTabSwitcher.onBeforeChange` klik anında fırlanır). **CRITICAL PITFALL:** fixed element + Framer x/y = flow pozisiyasına transform — `left-0 top-0` olmadan +346/+68 offset (E2E ölçdü). Ghost semantika: qaytış çipin SONUNCU BİRLƏŞDİYİ pill-dən (məs. TAKEAWAY-dan İÇƏRİDƏ-yə → ghost TAKEAWAY pillindən çıxır).

## 3. BUG STATUS — A ✅ FIXED · B ✅ FIXED · C ⏳ (owner qərarı) · D ✅ FIXED

### A. ✅ FIXED (2026-09-27) — KASSA view-swap opacity donmuş (visually: 215ms boş ekran + snap)
> **Həll §2b-də + jurnalda.** Aşağıdaki mətn fix-dən ƏVVƏLKİ analizdir — tarixi qeyd kimi saxlanılır.
**Repro:** KASSA aç → DAXİLOLMA bas → köhnə grid y-animatsiya edir (0→−8) amma **opacity 1-də donub** 220ms-də silinir; yeni form **opacity 0-da 216ms boş** qalıb, y-animatsiya edir, opacity anidən 1-ə qalxır. (Probe timeline: t=5195→5660, `e2e-shots/13-kassa-cashin.png`.)
**Root cause hipotezi:** card-da `backdrop-blur-xl` — Chrome backdrop-filter ancestor-u child opacity animasiyasını qırır (transform/y ayrı pipeline olduğundan y işləyir). Modal entrance (card öz opacity-si) işləyir; **içəri** view swap-lar işləmir.
**Fix plan:**
1. Card-dan `backdrop-blur-xl`-i APO (veil `bg-black/20 backdrop-blur-sm` səhifəni artıq blur edir); bg-ini daha opaque et (dark `bg-zinc-900/95`, light `bg-white/95`).
2. `AnimatePresence`-i `mode="wait"` → default **sync** (page.tsx products/customer phase wrapper-da İŞLƏYƏN pattern — oranın prop-larını kopyala: `initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.22, ease:[0.4,0,0.2,1]}}`).
3. **Eyni müalicəni TARİXÇƏ-yə də tətbiq et:** (a) onun card blur-u da apara, (b) list↔detail switch hazırda **anidən** swap olunur — iki keyed motion child (key="oh-list" / "oh-detail") ilə eyni 220ms fade ver (fragment AnimatePresence-də track olunmur — hər biri ayrı `motion.div` olmalıdır).
4. Frame sampling ilə verify: opacity 0→1 ramp görməlisən, boş boşluq YOX.

### B. ✅ FIXED (2026-09-27) — TƏMİZLƏ ilk tap no-op
> **Həll:** kök səbəb "mexaniki" DEYİL — **effekt-sırası yarışı**. Draft-restore effekti
> (`usePos.tsx` ~490) draft-persist effektindən (~538) ƏVVƏL elan olunduğu üçün clear-in
> commit-ində restore birinci işləyirdi, `pos_draft_<mode>` açarını hələ silinməmiş oxuyub
> `setCart(parsed.cart)` ilə itemləri geri yazırdı. E2E bunu sübut etdi: ilk tapda tam
> `pointerdown→…→click` zənciri düyməyə çatır, DOM node dəyişmir. **Fix:** `clearCart`
> açarı sinxron silir. E2E **5/5 ilk tap** PASS. Aşağıdaki mətn fix-dən ƏVVƏLKİ analizdir.
**Repro:** boş masa → 1 məhsul əlavə et → TƏMİZLƏ ghost pill header-də görünür → **ilk tap: pill highlight olur (klik elementə çatır) amma cart təmizlənMİR; ikinci tap: təmizlənir.** (Probe 1, masa 18.)
**İstiqamət:**
- `usePos.tsx` `clearCart` (~line 1517): guard-lara bax (`reservationMode`, `isDirty`, `cart` null check) — ilk çağırışda hansı şərt no-op verə bilər?
- Və ya `motion.button` entrance animation-ı (opacity 0→1, 240ms) sırasında ilk click-in yutulması — framer gesture/pointer quirk. Test: pill görünən 5s sonra bas (entrance bitib) — işləyirsə → timing quirk; həmişə no-op-dursa → clearCart guard.
- Owner üçün QİRAĞI: hər operation ILK klikdən işləməlidir.

### C. Sonra
1. ~~A + B fix → tsc → qısa E2E → bir commit → `MASTER_FEATURE_MAP.md` §10 entry~~ ✅ **BİTİB (2026-09-27)** — bax §2b.
2. ~~Qısa probe: 60s kataloq sync tick görünür?~~ ✅ **YOXLANDI — PASS (2026-09-27)**: 4 ardıcıl tick, delta ~60000 ms (59991/60000/60002/59997); OOS zənci **reload olmadan** təsdiqləndi və bu, **real DB-yə yazı etmədən** edildi (cavab bir tick üçün yerində modifikasiya olundu). **Cavab: admin `is_in_stock` flag-ı dəyişəndə POS 60s içində özü yenilənir.** Detal: `MASTER_FEATURE_MAP.md` §10.
3. E2E qalıqları — **OWNER QƏRARI GÖZLƏYİR (icazəsiz təmizlənmədi)**: **masa 17 = QRUP** (17+16+18), `ORD-2817`, Filadelfiya Classic ×1, ₼14.00, chip **MƏTBƏXDƏ** — ayrı "Tea" draft-ı YOXDUR (əvvəlki qeyd köhnəlib); **masa 18 həmin qrupun içindədir**, ayrı kart deyil. Digər: 97/511 TƏMİZLƏNMƏLİ · 401/502/901 YENİ OTURUŞ · 14/15/98/99/471/472/991–996 BOŞ. Təmizləmək: kart seç → MƏTBƏXDƏ/⋮ → sifariş dismiss (ilk klikdən işləyir).

### D. ✅ FIXED (2026-09-27) — Sifariş Tarixçəsi modal GİRİŞİ bug
> **Həll (§2h-də E2E-verified):** (1) ilk açılışda "0 sifariş" + ~1s spinner + bütün rows bir anda pop = **cold-pooler ilk load** → `OrderHistory.tsx`-ə **mount-prefetch SWR** əlavə olundu (ilk render-də default view bir dəfə prefetch; `hasLoadedOnce` gate → ilk açılış anında data ilə paint olur) + subtitle "Yüklenir..." (ilk load uçuşda). (2) "1 Issue" badge = `AdminDesktopShell.idlePrime('/api/orders')` → `primeCache`-ın cold-pooler 500-un **unhandled rejection**-i → `data-cache.ts` `primeCache`-a `.catch` əlavə olundu. E2E: list 4/4 frame-də anında, flash YOX, `__errs=[]`, badge YOX. Aşağıdakı mətn fix-dən ƏVVƏLKİ analizdir — tarixi qeyd kimi saxlanılır.
- **Owner**: "sifariş tarixçəsi — modal girişi — zamani bug var onu düzəlt (brauzerdən baxsan anlayasan)".
- **Repro (növbəti brauzer pass)**: POS → TARİXÇƏ click → entry-ni 5–8 frame (~100ms interval) sample et + `window.__errs` hook ilə console error-lar + Next dev "N issues" badge (owner şəkil 4-də görünür → React error var).
- **Statik suspektlər** (OrderHistory.tsx bu round-da TOXUNULMAYIB): (1) ilk açılışda subtitle **"0 sifariş" → "N sifariş" count flash** (`totalCount` state 0-dan start, fetch gələnədək); (2) "1 Issue" badge-in məzmunu bilməyib; (3) `centerModal` spring 500/26 (ζ≈0.58) 85vh card-da kiçik overshoot; (4) layoutId pill-lərin ilk mount davranışı.
- **Plan**: reproduksiya → diaqnoz → fix → E2E both themes + journal/handover update.

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
Son commits: `5f191006` (morph v2: deterministic manual ghost + left-0 top-0 fix — E2E byte-exact, §2h ⚠️) + `50e0fb63` (Tarixçə entry fix: mount-prefetch SWR + primeCache 500-catch + morph landing visibility, §3-D ✅ FIXED) ← `9c789a9f` (docs) ← `49fa87a0` (morph + cart-persist + DB hygiene, §2h) ← `a1dacd86` (modal/VKB batch: refund 2-col + VKB stacking/Apple restyle + Kassa label + TableCard, §2g) ← `f91f5c15` (design batch: tabs crossfade + 3 variants + ORD sil + Kassa Apple-minimal, §2f) ← `cccbffe9` (tech batch: guest optimistic + SWR + blur single-clock + VKB, §2e) ← `297e26b0` (cart body crossfade, §2d) ← `8fff6c6f` (Təmizlə/Ləğv morph bərpa, §2c) ← `4b507c5e` (60s sync verify) ← `1b5cd979` (Bug A+B, §2b) ← `080742b5` (HANDOVER §4.0) ← `b469f842` (ghost blue border fix) ← `9f4e5302` (1px ring fix) ← `9e3c50c2` / `0253c58e` (border transparent) ← `3eea7dfe` (border grace 320ms — ring bug buradan gəldi) ← `0ba5ecd0` (cart counter-roll RESTORE) ← `a3021e4a` (grace doctrine + presence fixes).
