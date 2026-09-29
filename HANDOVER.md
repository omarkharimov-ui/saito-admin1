# HANDOVER — Saito POS (agent switch, 2026-09-27, ~18:00 Baku)

> Bu sənəd növbəti agent üçün tam özünü-kafi handoff-dur. Səhv etdiyim yerdə
> `git log --oneline -20` + `MASTER_FEATURE_MAP.md` §10 (journal, newest-first) bax.

## 0. STATUS QISCA

- **Repo:** `/Users/mr.apple/saito-admin1/` · app: `artifacts/saito-admin/` (git path prefix `artifacts/saito-admin/`)
- **MOTION PHILOSOPHY (CANONICAL):** [SAITO_MOTION_PHILOSOPHY.md](SAITO_MOTION_PHILOSOPHY.md) — hər UI interaction dəyişikliyi 12 qaydaya görə review olunur (state→motion, continuity, physical, interruptible, morph-not-replace, moving layout, input-device, immediate feedback, selective, no generic AI UI, fast-not-abrupt, **reduced-motion**). POS root-da `MotionConfig reducedMotion="user"` (final check round-da əlavə edildi).
- **HEAD:** `8a61212a` (**ROUND 8** — modal Miqdar+ həmişə qty, ⋮→○→✓ single morph, refund detalları, refund flash fix, TAM HANDOVER §7–§10) + son code round **ROUND 8b (2026-09-30, LIVE QTY SYNC + PILL ×QTY BADGE)**: (1) **LIVE QTY SYNC** (modal ↔ cart — owner: "səbətdeki sayı artıranla modal içi say artırma sync işləsin"): modal +/− → `onLiveQtyChange(lineIndex, qty)` → page `applyInstanceEdits` ilə sətirin **öz spec-i** ilə qty-only edit (P1 kitchen spec-sync YANMIR; sent hissə `max(qty,sentQty)` clamp; unsent delta növbəti send-də); cart +/group+ → `cartItemQtys` sync effect → açıq editor izləyir; loop-safe. **E2E s8**: save-etsiz +×2 → cart DƏRHAL 3/₼39, reopen=3, kitchen ticket 1 prep + 1 unsent delta (yanmadı). **Semantik: modal qty dəyişikliyi İNDİ live — X ilə bağlama rollback ETMİR** (sync budur). (2) **PILL ×QTY BADGE** (owner: "yuxarıdakı 1 və 2 artmır — nə üçündür?"): pill = **instansiya TAB** (rəqəm = tab indeksi, say DEYİL — hər pill öz spec-i ilə müstəqil sətirdir) → indi hər pill **canlı ×qty badge** daşıyır. **⚠️ AÇIQ: VOID ANOMALİYASI** — sent sətirdə LƏĞV ET: toast success amma sətir qalır; DB DÜZGÜN (item `voided`, order `cancelled`, `FINAL_ORDER_STATUSES` 'cancelled' əhatə edir, primary filter düzgün) → client re-hydration yolu (tableOrderCache / fetch race / else-branch) — NÖVBƏTİ: owner browser-ında `/api/orders?table_number=99` response-unun canlı oxunması (kəsilmiş sessiya, state naməlum). ← ROUND 8 details: (1) **MODAL MIQDAR+ = HƏMİŞƏ qty artır** (round 6-dakı sent→clone qolu owner-in "işləmir/3-cü yarandı" bug-un özünü idi — clone İNDİ yalnız CART-ROW + -da; E2E r8: sent pill 1→3, pill count 2-də QALDI, cart ₼52 düzgün); (2) **⋮→○→✓ TƏK morph** (circle indi +120°-dan girir — dots-un clockwise spin-inin DAVAAMI; round 7-də istiqamətlər əks idi = "3 ayrı hərəkət"); (3) **REFUND DETALLARI** (TƏSDİQ: order identity Masa/ORD#/tarix/sətir + Üsul/Həcm/Məbləğ/**Qalacaq**/**Sətirlər** + warning; MƏHSUL sətirlərinə −₼amount; NƏTİCƏ: identity + üsul + "Sifariş tam qaytarıldı"/"Qalan ₼X") E2E ✓; (4) **REFUND "LOADING" BUG** = `amount` state useEffect-də (post-paint) dolurdu → ilk frame BOŞ input + say "pop" + DAVAM ET disabled→enabled titrəmə; fix: initial state = full remaining (rAF probe: first frame "13.00", 8/8 stabil). **E2E r8 full cycle**: add→GÖNDƏR→+ on sent→save→HESABI BAĞLA ₼13 nağd→TARIXÇƏ→refund→tam qaytarıldı (QAYTARMA disabled), console 0. **HANDOVER indi TAM: §7 feature inventory · §8 state-machine kataloqu · §9 UI qanunları (12 rule + approved pattern-lər) · §10 harda qalıb.** Comparison: `POS_COMPETITIVE_COMPARISON.md` (repo root-da qalır). ← ROUND 7 details: (1) Modifikator + **verified working** (2-instance E2E: inst1 Losos×2 ₼20 + inst2 Losos×1 ₼17 = ₼37.00 exact — per-instance, NO copy; köhne bug = round-5 spec clone, round-6 state rule ilə düzəlib); (2) MERJ/KÖÇÜR capsule-ə **GERİ pill** əlavə olundu (yalnız ✕ idi; digər bütün sub-view-ların BackButton-u var idi — E2E w7); (3) Kassa locked → **7 nağd düyməsi disabled** (yalnız AÇ aktiv) E2E v7 ✓; **leave-shift → sifariş qəbulu MÜMKÜNDÜR** (shiftGate yalnız 6 route: bill-request/reopen/delivery-status/walk-in/waitlist/kitchen-void → manager PIN; order create + payment gated DEYİL = Toast/Square modeli); (4) Küncüt flicker: **persistent path** (mount/unmount yox, fixed 14px slot) — MutationObserver: 0 remount ✓; (5) "Toxunma" → **"Qeydsiz"** + tooltip (fate=none = stok-təsirsiz refund — functional, saxlanıldı; return_to_stock ikon = PackageOpen); (6) TAKEAWAY ikon `ShoppingBag` (15px-də box oxunur) → **`Handbag`** (header + OrderHistory + CartPanel) E2E ✓; (7) DragTabSwitcher light active pill `#171717` → **`#3b82f6`** (dark white pill eyni) E2E computed-style ✓; (8) **"4 Issues" = Next.js 16 dev-only indicator** — konsol 0 warning/badge yox (transient idi, prod-da yoxdur); **3-dots blink**: mode switch-də grid tam re-mount + ⋮ spin-in (−120°→0) = "blink" → indi **calm 180ms fade** + opacity framer-owned (rest 0.4/hover 1 — CSS conflict aralandı). ⚠️ E2E artefaktı: device `6e3bcf1a…` blocked=true idi (10:48 UTC, əvvəlki E2E qalıq) → DB-dən unblock edildi (`device_heartbeats`). **Müqayisə: `POS_COMPETITIVE_COMPARISON.md`** (repo root — Toast/Lightspeed/Square). E2E: d7 (diagnosis) + v7 (verify) + w7 (capsule/light/cleanup) + f7 (handbag + 2-instance). Final state: DARK, kassa UNLOCKED, Masa 99/471 empty. tsc clean. ← ROUND 6 details: (1) split view GERİ = raw dark-hardcoded button → theme-aware `BackButton` (light-da invisible → görünür, E2E z11); (2) VKB **iki fazalı jump**: `--vk-height` transition 0.3s→**0.18s** snappy (content ~180ms irəliləyir) + klavyə `SPRING.surface` settle — videodakı feel; (3) **REFUND DOUBLE-COUNT (server bug, 4 yerdə fix)**: `orders.paid_amount` **NET**-dir (DB function hər refund-da decrement edir) — köhnə DB guard + route pre-guard + client `remaining`/disable hamısı `paid − refunded` hesab edirdi → ilk partial refund-dan sonra Qalan=₼0.00, QAYTARMA dead. Fix: DB function guard (**LIVE psql `CREATE FUNCTION`** → `refund > net_paid + 0.01`), route (`refundAmount > paidAmount + 0.01`), client `remaining = max(0, paidAmount)`, "Ödənilən" = gross (`paid+refunded`). **E2E: 2-ci ₼22.50 refund server-də uğur → order tam qaytarıldı ✓**. + comment leak (RefundView JSX-dəki dev `//` comment visible text idi) fix; (4) RefundView BÜTÜN FSM transitions: **measured sliding mode capsule** (refs + useLayoutEffect + offsetLeft/Width + spring x/width — `layoutId` scaled modal-da unreliable), quick-% / over-amount / warning / item-check AnimatePresence; (5) instance pills **44px/22px** + eyni sliding capsule (1→2 morph); (6) allergen Küncüt check = SVG **stroke-draw** `pathLength 0→1` (owner-approved pattern); (7) **Miqdar+ STATE RULE** (owner decree): unsent draft → **eyni instansiyanın qty-sı artır** (yeni pill YOX); sent/locked (ready/served/completed) → **yeni müstəqil instansiya** (spec copy) — modal + cart group + hər ikisində; (8) cart row: **`⚙ N əlavə` tək chip** (SlidersHorizontal, list `title`-də) + allergen 1-line `Label +N`; (9) HOLD = **icon-only w-5 badge** (Pause, micro pop); (10) TableCard status icons redesign (UserCheck/CalendarDays/BrushCleaning/CookingPot/ClipboardCheck/CheckCheck/ChefHat/BellRing/HandPlatter/Utensils/Users/Banknote/CreditCard/CheckCircle2/Table2/Layers). ⚠️ cz-E2E: **"Bu cihaz bloklanıb"** (unpaired) overlay çıxdı — sub-agent JS-lə remove etdi (test üçün); POS bloklanıbsa: Settings → Cihazlar → "Bərpa et". **E2E z1–z13 + cz1–cz5 + b-series: bütün nöqtələr verified; theme final DARK; tsc clean.** ← ROUND 5 (10 owner nöqtəsi) details: (1) toast `{tables}` literal-leak fix; (2) guest/bag counter row "Masa X"↔qiymət arasına (dedicated row); (3) TA/DELIVERY scroll fix (wrappers `h-full min-h-0 overflow-hidden`); (4) modal regeneration — capsule chips + 200ms state crossfade + AnimatePresence micro-pops + ALLERGENLƏR↔Qeyd swap + Mərhələ pill light `bg-blue-500` (qara DEYİL); (5) VKB iOS-spring (`SPRING.surface` enter + 260ms exit + `@property --vk-height` transition — content-push klavyə ilə eyni ritmdə); (7) **per-instance modifier bug = VERIFIED FIXED** (R13 unsent + R14 sent ssenariləri, cross-leak YOX, + hər pill-də işləyir, DB spec-sync təsdiqi: Losos×3/Avokado×3 server satırlarında — owner-in reportu KÖHNƏ build-dən, code dəyişikliyi TƏLEB OLMADI); (8) allergen **auto-icon** (`allergens.ts` ALLERGEN_KEYWORDS az/en/tr substring + alcohol/Wine); (9) light status chips qapı-qara → dark mirror (seatedNoOrder "YENİ OTURUŞ" orange-100/800; `cleaning`/`ready`/`payment_pending` amber-100/800) + Masa 17 chip-overlap fix (bottom row `flex-wrap`, right container `ml-auto`); (10) light action-sheet FULL audit — BackButton theme-aware (hardcode white-on-white idi → light-da İNVISIBLE) + courier rows qara pill → ağ satır + blue ChevronRight. ⚠️ GOTCHA: `ProductGrid.tsx` SPRING = tək micro-spring (pos-motion re-export), named-preset OBIQKT DEYİL — orada `SPRING.kessey` INVALID (TableCard-da valid-dir). ← `97224482` (selection-tick morph + HESAB pop) ← `341e33e4` (docs) ← `05e85f58` (round 4 code: P1 SPEC-SYNC + P2 CLONE/LOCK + HESAB ÇAĞIR + zona standartı + VKB space/trim + resv sheet redesign). Zəncir: `git log --oneline -12`. **BÜTÜN owner nöqtələri TAMAMDIR** — E2E R13–R16 verified (light primary + dark spot; R15 full light audit: 0 solid-black pill, 0 overlap, 0 invisible text; test data void-landı, ORD-2920/Masa 1 toxunulmadı). Jurnal: `MASTER_FEATURE_MAP.md` §10 round-5 entry.
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

## 2i. INSTANCE STATE MACHINE (2026-09-28, owner 6-nöqtəlik turn) — ✅ TAMAM (E2E-verified)

- **(a) Sabit çip eni**: VIP seçildikdə çip kiçilmir. `LiquidDropdown`-da **in-flow grid-cell sizer** (invisible sizer + görünən label eyni `[grid-area:1/1]` cell) — pill həmişə ən uzun floor label-ının enində (E2E: 5 probe = 145.78px, diff 0px, dark+light). ⚠️ v1 `absolute` sizer out-of-flow → 0 en verdi — JS ölçmə tam silindi, sizer = layout.
- **(b) Void bərpa + always-visible**: funksiya kodda canlı idi (`a18da58`) amma all-draft cart-da flex-0-a collapse olub görünmürdü. İndi LƏĞV ET cart boş deyilsə HƏMİŞƏ var: voidable yoxdursa dimmed (0.45) + hint toast, send-dən sonra aktiv. Axın: `POST /api/orders/void` (perm `pos.void`, 50 ₼ → manager PIN, RPC `void_items_state_aware`).
- **(c) SƏRV rədd olundu**: cart row-dan silindi; `isReturnableRow` yalnız void-hint üçün qaldı.
- **(d) Per-instance sətirlər**: `addToCart` auto-merge SİLİNDİ — hər tap öz instansiyası; client-side `instance_id` (React key + targeting); editor yalnız tap olunan sətiri rewrite edir. E2E: 3× Filadelfiya = 3 sətir, nota yalnız 2-ci-də.
- **(e) Hold/Resume maşin**: DRAFT ─hold─► DRAFT_HELD ─resume─► DRAFT ─send─► SENT (per instance). Sent = frozen. Send: `delta = qty − sentQty > 0 && !is_hold`, cari modifiers/notes/course daşıyır → lossless. All-held → "no_new_products" toast. `is_hold` localStorage + (server sətirdə) `/api/orders/item-hold`. Tappable "Saxlanılıb" badge = resume.
- **(f) Mətbəx popover — Apple feels**: tək frosted səth (blur-xl, 28px radius), source card (emerald ping + "Seçilmiş"), 3 stat TƏK hairline-divided kartda, 24px tabular-nums (rəng rəqəmdədir, fill-də yoxdur), entrance spring 500/26, exit 280ms `[0.45,0,0.55,1]`. `panelW=272` clamp.
- **Bonus**: 3 filter fix (`history/[id]` audit `record_id=eq.${id}` — raw fetch `?or(` `=`-siz, PostgREST səssizcə ignore edir; waste-standards `ilike('keyword')`; campaigns `lt('end_date')`) + CustomerSelect revert (supabase-js `.or` düzgündür).
- **DB**: `seed-test-orders.sql` (repo root) = 150 test sifəri (owner: 849 yox, 100-200). E2E test order ORD-2919 (Masa 15) sonradan təmizlənib (pointer-lar ƏVVƏL NULL — FK RESTRICT).
- **Verify**: tsc təmiz; E2E 66-73 + chip-fix-verified-dark; detal → `MASTER_FEATURE_MAP.md` §10 (2026-09-28 entry).

## 2j. PER-INSTANCE FIXES + SCHEDULING BƏRPA (2026-09-28, owner 4-nöqtəlik turn round 2) — ✅ TAMAM (E2E-verified)

- **(1) Per-instance aydınlıq**: E2E **kritik defect** tapdı: `selectTable` server sətirlərini `product_id+variant_id` ilə merge edirdi → send→reopen-da 2 fərqli Filadelfiya 1 sətirə çökürdü (41.00 vs real 35.00, Row B konfiqurasiyası itirilirdi). **Fix: hər order_item = 1 sətir**; draft carry id-based; `placeOrder` reconciliation **instance identity** ilə (held twin artık sent-mark olunmur — E2E Tea×2 testi ✓). Cart row: per-instance **modifier chip-lər** (ad ×qty, nowrap); edit modal preset = tap olunan sətirin öz state-i (E2E ✓). Məhsul kartı tap = fast-add (mövcud dizayn); modal = sətir "Ətraflı".
- **(2) Allergenlər aşağıda ayrıca bölmə**: modal header təmizlənib (görsəl·ad·qiymət); "ALLERGENLƏR:" bölməsi Qeyd-dən sonra (dark+light E2E ✓).
- **Allergen SSOT end-to-end (3 qapı + 1 yeni)**: cart label `fish`→`Balıq` (resolveAllergenEntry); load mapping `allergens`+`variant_id` geri (DB-də doğrulandı); addItems insert `allergens` simmetriya; **YENİ** KDS ticket-da qızıl allergen chip (kitchen warning artık mətbəxə çatır). E2E: cart "Balıq" + KDS "BALIQ" (yalnız flag-lı item) ✓.
- **(3) FROZEN audit**: diff frozen set-ə toxunmur (state machine RPC, total SSOT/VAT, return/waste, undo, sold-out, KDS mark-ready) — grep + diff review + E2E kanadları (send keçidi, CƏMİ=floor card, KDS read-only, HOLD badge).
- **(4) Scheduling bərpa + Q1/Q2**: `/admin/shifts` pozulmuşdu (page `{shifts,kpis}` gözləyirdi, API sadə array qaytarır → həmişə boş). Page restore: array parse + staff join + client KPI + AZ. **Q1: kassa bağlı olanda sifariş YARADILA BİLİR** (POST /api/orders-da gate yoxdur; pay-ın drawer lookup-u non-fatal). **Q2: shift bağlı olanda kassa AÇILMIR** — frozen S-08 `open_cash_register` → `OPEN_SHIFT_REQUIRED`; UI "VARDİYA AÇIQ DEYİL" + bir-klik clock-in.
- **DB**: E2E ORD-2921 (Masa 14) təmizlənib; **ORD-2920 (Masa 1) = owner-in canlı testi — SAQLANDI**.
- Detal → `MASTER_FEATURE_MAP.md` §10 (2026-09-28 round-2 entry).

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
Son commits: `336cfd2c` (final: SAITO_MOTION_PHILOSOPHY.md canonical + MotionConfig reducedMotion=user POS root, journal §10 final entry) ← `05e85f58` (round 4: P1 spec-sync + P2 clone/lock + HESAB ÇAĞIR optimistic+restore+PIN + floor-chip ghost removed + zone standard pinZone + VKB space/trim + control-tap focus guard + reservation sheet redesign + merged icon + t('close') bug + Tarixçə/refund light, journal §10 round-4) ← `c938651c` (round 3: cart collapse + pill tabs + served lock + light sweep + refund FSM + CSRF + kart terminal restore, journal §10) ← `87de6227` (docs round 2) ← `8825e548` (per-instance load/reconcile fixes + allergen SSOT end-to-end + KDS allergen chip + modal allergen section + /admin/shifts restore, §2j) ← `ad216023` (instance state machine: per-instance lines + Hold/Resume + Void always-on + SƏRV sil + Apple popover + sabit çip eni + filter fixes + seed SQL, §2i) ← `f59a9a67` (docs) ← `5f191006` (morph v2: deterministic manual ghost + left-0 top-0 fix — E2E byte-exact, §2h ⚠️) + `50e0fb63` (Tarixçə entry fix: mount-prefetch SWR + primeCache 500-catch + morph landing visibility, §3-D ✅ FIXED) ← `9c789a9f` (docs) ← `49fa87a0` (morph + cart-persist + DB hygiene, §2h) ← `a1dacd86` (modal/VKB batch: refund 2-col + VKB stacking/Apple restyle + Kassa label + TableCard, §2g) ← `f91f5c15` (design batch: tabs crossfade + 3 variants + ORD sil + Kassa Apple-minimal, §2f) ← `cccbffe9` (tech batch: guest optimistic + SWR + blur single-clock + VKB, §2e) ← `297e26b0` (cart body crossfade, §2d) ← `8fff6c6f` (Təmizlə/Ləğv morph bərpa, §2c) ← `4b507c5e` (60s sync verify) ← `1b5cd979` (Bug A+B, §2b) ← `080742b5` (HANDOVER §4.0) ← `b469f842` (ghost blue border fix) ← `9f4e5302` (1px ring fix) ← `9e3c50c2` / `0253c58e` (border transparent) ← `3eea7dfe` (border grace 320ms — ring bug buradan gəldi) ← `0ba5ecd0` (cart counter-roll RESTORE) ← `a3021e4a` (grace doctrine + presence fixes).

---
---

# TAM HANOVER SƏHİFƏLƏRİ (round 8, 2026-09-30 — owner: "handover tam şəkildə hazırla, tam nəyi varda, harda qalmışıq, UI qanunları, state machine transition və s. HƏR ŞEY handover-da olsun")

## 7. FEATURE INVENTORY — NƏ VARDIR (kod + E2E verified, round 1–8)

> Repo: `omarkharimov-ui/saito-admin1` · App: `artifacts/saito-admin/` (Next 16.2.3 + React 19.1 + Supabase Postgres + framer-motion) · Dev: `corepack pnpm dev` · **PIN 4321** · **Test masaları: 98/99/471 — Masa 1 / ORD-2920 HEÇ VAXT toxunulmur.**

### 7.1 POS səthi (`/admin/pos`)
- **Floor**: mərtəbə seçimi (Mərtəbə dropdown), masa kartları (status icon+border, guest/bag counter, kitchen status, amount hero, pre-order chip, merged group "QRUP N", ⋮ action, selection mode), 3s poll + realtime `pos-sync` (optimistic snap YOX — generation token stale-guard).
- **Mode tabs**: İÇƏRİDƏ / TAKEAWAY (Handbag) / ÇATDIRILMA (Bike) — DragTabSwitcher (sliding pill; light = mavi, dark = white).
- **Floor operation modes**: NORMAL / BIRLƏŞDIR (merge: əsas+uşaq, GERİ pill+✕ capsule, "GERİ AL" undo pill) / KÖÇÜR (transfer) — capsule bar + floor radio selection (⋮→○→✓ single-morph, round 8).
- **Cart**: sətirlər (qty stepper, `⚙ N əlavə` chip, allergen `+N`, HOLD icon-badge, course/priority/station), **per-instance lines** (eyni məhsul = 1 group, N instance pill), guest count (optimistic), customer (CRM link + suggestions), order-type switch (dine/takeaway/delivery), delivery form (zona/ünvan/fee/courier ETA), coupon (server-validated), global note, clear (TƏMİZLƏ), void mode (LƏĞV ET), **MƏTBƏXƏ GÖNDƏR** (delta send: yalnız unsent), HESABI BAĞLA.
- **Product grid**: kartlar (image, campaign badge, OOS grayscale+pill), search, kategoriya tabs, Son/Məşur/Sevimli filter, combo tab, **product editor modal** (variant, exclusive/additive modifier groups ± count, course, note, allergen çipləri + auto-icon + stroke-draw tick, instance pills (44px + measured sliding capsule), MIQDAR stepper (həmişə active instance qty artırır — round 8), GERİ QAYTAR (served lines: stock/waste + səbəb + PIN), spec-lock (ready/served/completed)).
- **Payments (ActionSheet)**: 8 üsul (nağd/kart/QR/transfer/korporativ/gift card/room charge/digər), cash tendered (qalıq), card terminal (SIMULATOR adapter), **split payment** (amount + per-item, back button), tip, loyalty redeem, customer attach, method-specific sub-views (həmmisi BackButton-lu — round 7 capsule GERİ daxil).
- **Kassa (CashDrawerPanel)**: shift open/close (smena + sayım), cash-in (Daxilolma), cash-out (Xərc), **no-sale (Satışsız, məcburi səbəb)**, cash drop (Nağd çekmə), deposit (bank, manager PIN), **Z hesabat** (print), **lock/unlock (AÇ/QIFIŞLA — manager PIN; locked = 7 nağd düymə disabled, round 7)**, views arası back button.
- **Tarixçə (OrderHistory)**: SWR list (prefetch + load-more), status filter (PAID/QAYTARILMIŞ/LƏĞV OLUNUB/HƏMMİSİ), date range, search, order card (source glyph + Handbag takeaway), detail (badges, customer/delivery, items+mods, maliyyət breakdown, ödəniş+lər (refund rows daxil), timeline/audit (3+expand), note), reprint, **RefundView (FSM — bax §8.1)**, QAYTARMA sticky footer.
- **Refund** (RefundView, OrderHistory.tsx): TAM/QİSMİ/MƏHSUL (measured sliding mode capsule), quick-% chips, over-amount red+hint, item selection (qty + fate: Qeydsiz/Anbara qaytar/İtkiyə yaz), method, reason, TƏSDİQ (order identity+details, round 8), PROCESSING (close-blocked), SUCCESS (identity+method+qalan), ERROR (retry = eyni idempotency key). Server: `/api/orders/refund` + `complete_payment_atomic_v2` (NET-paid guard — round 6 server fix), inventory fate RPC.
- **Rezervasiyalar** (ReservationActionSheet + page): yarad/əlaqə/çatdı (walk-in seat)/ləğv; pre-order; overdue badge. **Waitlist**: seat, notify. **KDS** (`/admin/kds` + in-POS kitchen filter): station board, per-item status (cooking/ready/served), allergen chip. **Expo** (expo/salon flow). **Scheduling** (`/admin/shifts`): növbə planlaması. **Staff** (shift handover, roles, PIN, issues view).
- **Admin** (`/admin`): məhsullar (catalog, variants, modifier groups, campaigns, OOS flag), kateqoriyalar, mərtəbələr/masalar, cihazlar (pairing/heartbeat — `device_heartbeats`, unpair/blocked flag), audit log, statistics, partner orders (aggregator API — read-only cart), loyalty config, settings (EDV/switches, receipt settings).

### 7.2 Backend (Supabase Postgres + Next API routes)
- **Order spine**: `orders` (status lifecycle, **paid_amount = NET** — hər refund-da decrement; total/refund/cash/card/tip/discount), `order_items` (per-line kitchen_status, sentQuantity delta model, spec fields), `order_payments` ledger (is_refund/is_partial/split_group), `complete_payment_atomic_v2` (atomic pay/refund: idempotency dedupe → guards → ledger → status; FOR UPDATE lock), `payment_idempotency_keys` (namespace 'payment'/'refund', (namespace,key) unique + order+amount bound → replay / 409).
- **shiftGate** (`lib/shiftLock.ts`): yalnız 6 route (bill-request, reopen, delivery-status, reservations/walk-in, waitlist/seat, kitchen/void-comp-waste) → shift closed-də 403 `pin_required` → manager PinGuard → approver re-verify. **Order create + payment shiftGate DAİRE DEDİR** (leave-shift-dən sonra sifariş qəbulu mümkündür — round 7 analizi).
- **Kitchen sync**: P1 spec-only sync (updateItem on save) + qty delta on next send; KDS `order_items` live oxuyur.
- **Loyalty spine**: points credit on paid, `loyalty_reverse` on refund (best-effort).
- **Campaigns/coupons**: server validation (min order, dining window, table window), exclusive with coupon.
- **Devices**: heartbeat (60s), blocked flag (unpair), remote commands (`device_commands`), print queue.
- **CSRF**: double-submit (`X-CSRF-Token` = `saito_csrf` cookie; 403 → re-read + 1 retry, `apiFetch`-də).
- **RLS + service-role** auth client (`createAuthClient`).

## 8. STATE MACHINE CATALOGU (hər FSM + keçidləri — owner: "hər state machine üçün transition")

> Ümumi qanun (4.0): hər keçid = animasiyalı; enters snappy, exits graceful (280ms `[0.45,0,0.55,1]`); value/label morph = time-based (80–360ms); token-lər `src/lib/motion/system.ts` (+ `pos-motion.ts` single-micro); test = frame sampling + 2 tema.

### 8.1 RefundView FSM (`OrderHistory.tsx`)
`EDIT → CONFIRM → PROCESSING → SUCCESS | ERROR`; CONFIRM ←(Geri) EDIT; ERROR ←(Yenidən cəhd, EYNİ idempotency key) PROCESSING; SUCCESS/(Bağla)→close; PROCESSING-də close BLOCKED.
- Edit: mode capsule = **measured sliding indicator** (refs+useLayoutEffect+offsetLeft/Width+spring x/width — `layoutId` scaled modal-da unreliable); quick-% active (200ms); over-amount red input + AnimatePresence hint; item check = AnimatePresence micro-pop; amount **initial state** (flash YOX — round 8).
- Confirm: order identity + detail rows + item list (fate+amount) + full-refund warning (AnimatePresence + TriangleAlert, spring pop).
- Processing: spinner (close blocked). Success: ✓ + amount + identity + qalan (round 8). Error: ✕ + msg + retry/close.
- Step chips: Seçim/Təsdiq/Nəticə (current/passed/pending rəng).

### 8.2 TableCard (floor)
States: EMPTY→OCCUPIED→COOKING→WAITING_BILL→PAID→DIRTY/CLEANING→EMPTY (+RESERVED, MERGED child, PRE-ORDER).
- Status **icon** set (round 6): UserCheck/CalendarDays/BrushCleaning/CookingPot/ClipboardCheck/CheckCheck/ChefHat/BellRing/HandPlatter/Utensils/Users/Banknote/CreditCard/CheckCircle2/Table2/Layers.
- Border crossfade **320ms symmetric**; content drift+blur on dismiss (200ms); OVERLAY NEVER (operation = kartın öz transformu).
- **Control morph slot** (keyed AnimatePresence, mode=popLayout): ⋮(ctl-menu) ↔ M(ctl-source) ↔ H(ctl-target) ↔ ○/✓(ctl-select). Round 8: **⋮→○→✓ TƏK morph** (dots +120° clockwise çıxır, circle +120°→0 DAVAAM edir — eyni istiqamət; tick = stroke-draw 280ms, 80ms delay). Return ○→⋮ = sakin 180ms fade (spin-in YOX — round 7 "blink" fix). ⋮ opacity = framer-owned (rest 0.4, hover 1.0).

### 8.3 Product editor modal
- Open/close: centerModal spring (500/26 kəsəy) + fastExit 280ms.
- **Instance pills** (multi-line product): 44px/22px, **measured sliding capsule** (spring, iki istiqamət); switch = commit draft → load next (TikTok pattern).
- **Miqdar+** (round 8, owner-final): HƏMİŞƏ active instance-in **total qty artırır** (sent instance-də belə: `applyInstanceEdits` `newQty = max(qty, sentQty)` — göndərilmiş hissə toxunulmur, **unsent delta növbəti send-də çıxır**). CART-ROW + = ayrı rule: unsent → qty artırır; **sent/locked → YENİ müstəqil instansiya** (clone, spec copy) — "one more of this product".
- Modifier chips: tap = toggle/±; additive = count (₼/hər vahid), exclusive (max 1) = radio; group cap = total; **allergen tick = persistent stroke-draw** (fixed 14px slot, mount/unmount YOX — round 7 flicker fix).
- Spec lock (ready/served/completed): bütün controls pointer-events-none + banner + CTA "qəfəslənib" (yalnız GERİ QAYTAR canlı).
- Return flow (GERİ QAYTAR): PIN → stock/waste + **məcburi səbəb** → deterministic reset+close.

### 8.4 Cart
`EMPTY → DRAFT → SENT` (per-line: draft / cooking / ready / served via kitchen_status); void mode sub-state (LƏĞV ET selection: icon swap = **ROTATION morph** — dots ±120°, circle same direction — owner video-approved; check = stroke-draw). Row enter snappy / exit graceful 260ms; Təmizlə = rows graceful exit → empty fade 320ms; footer totals = **COUNTER-ROLL** (NumberRoll/RollingNumber — icazəsiz dəyişmir).
- **HOLD/RESUME**: icon-only badge (Pause, micro pop) — hold = is_hold + hold_until.

### 8.5 Payment (ActionSheet)
`ACTIONS(root) → PAYMENT → (CASH TENDERED | CARD CONFIRM | SPLIT → per-item) → CONFIRM-ACTION → (PIN) → PROCESSING → DONE`; hər sub-view = BackButton (round 7: MERJ/KÖÇÜR capsule-lərə də GERİ pill). Payment = `complete_payment_atomic_v2` (atomic; split = `split_group_id`; tip/loyalty attach).

### 8.6 Kassa (CashDrawerPanel)
`MAIN → CASH-IN | CASH-OUT | NO-SALE(reason) | CASH-DROP | DEPOSIT(PIN) | LOCK(PIN) | CLOSE(sayım+final) | Z(print)` — hər sub-view back-ə malik; **LOCKED state** (round 7): 7 nağd əməliyyat disabled (opacity-30), yalnız AÇ canlı. Shift = session (open → locked? → closed); closed-dan sonra sifariş qəbulu MÜMKÜNDÜR (§7.2 shiftGate).

### 8.7 Floor operation modes
`NORMAL ⇄ BIRLƏŞDIR ⇄ KÖÇÜR` (top DragTabSwitcher): merge/transfer = capsule bar (GERİ pill + ✕ + Təsdiqlə) + floor radio selection; merge confirm → group (parent QRUP chip + children hidden); unmerge (MASALARI AYIR: child seç + Seçilənləri Ayır) → cards remount; **GERİ AL undo pill** (merge-dən sonra).

### 8.8 VKB (virtual keyboard)
**Two-phase jump** (round 6, iOS video feel): content push = `@property --vk-height` transition **0.18s** `cubic-bezier(0.2,0.8,0.2,1)` (content irəliləyir) + keyboard = `SPRING.surface` (480/24/0.36, ~480ms settle) + exit 260ms. Modal-ə fit: keyboard açılanda modal rebalance (maxHeight calc(--vk-height + native)).

### 8.9 Order detail (Tarixçə)
`LIST ⇄ DETAIL` (keyed crossfade 220ms + SWR; detail loading = spinner) → QAYTARMA → §8.1.

## 9. UI QANUNLARI (owner-final — HƏR UI DEYİŞİKLİYƏNDƏN ƏVVƏL BUNLARI QARŞILAŞDIR)

### 9.1 Motion Philosophy — 12 rule (canonical: `SAITO_MOTION_PHILOSOPHY.md`)
1. **Think in States, Not Animations** — motion STATE transitions-dan başlanır (heç vaxt animation-first).
2. **Motion Must Explain Continuity** — hər hərəkət "nə baş verdi"ni izah etməlidir.
3. **Prefer Physical Motion Over Decorative** — fiziki (spring/weight) > süslü.
4. **Interactions Must Be Interruptible** — transition-ini başqa input DAVAAM etdirir (zero-dan yox, cari progress-dən).
5. **Morph Instead of Replace** — eyni obyektin iki state-i = MORPH (key sabit, property animasiya).
6. **Layout Is Allowed to Move** — grid reflow = smooth glide (framer `layout`).
7. **Touch/Mouse/Keyboard are different inputs** — touch = 44px minimum, whileTap; hover effektləri touch-da zərər verə bilməz.
8. **Feedback Must Be Immediate** — tərzi dərhal (optimistic), server təsdiqi ayrıca (toast).
9. **Do Not Animate Everything** — selective motion; info verməyən animasiya SILİNİR.
10. **Avoid Generic "AI UI"** — random fade / excess scale / bounce / glowing / particles YOX.
11. **Fast But Not Abrupt** — enters snappy, exits graceful.
12. **Respect Reduced Motion** — POS root `<MotionConfig reducedMotion="user">`.

### 9.2 Owner-approved KONKRET pattern-lər (video/screenshot təsdiqli — icazəsiz dəyişmir)
- **Selection-mode icon swap** = ROTATION morph (dots ±120°, circle EYNİ istiqamətdən spin-in) — crossfade+scale-pop rədd olunub ("pisdir").
- **Selected checkmark** = SVG **stroke-draw** `pathLength 0→1` (left→right, ~280ms easeOut, ~60-80ms delay, strokeWidth 3.4, exit fast) — scale-pop YOX. (TableCard sel-tick, allergen tick. Allergen tick round 7-dən PERSISTENT path — mount/unmount flicker mənbəyi idi.)
- **⋮→○→✓ single morph** (round 8): circle +120°-dan girir (dots-un spin-inin davamı); return = calm 180ms fade.
- **Measured sliding capsule** (pill tablar, refund mode capsule): refs + `useLayoutEffect` (offsetLeft/offsetWidth) + absolute `motion.div` spring x/width — `layoutId` scaled modal-da unreliable (transform projection).
- **VKB two-phase** (0.18s content push + 480ms keyboard settle) — iOS videodan.
- **Counter-roll** (cart footer) — `NumberRoll`/`RollingNumber` — "daha qəsəngdir" (owner).
- **Miqdar+ semantics** (round 8 + 8b): modal + = həmişə qty artırır; cart-row + = unsent grows / sent-locked clones. **LIVE sync (8b)**: modal qty dəyişikliyi `onLiveQtyChange` ilə DƏRHAL cart-a düşür (qty-only, line-in öz spec-i ilə — P1 spec-sync yananmır); cart dəyişikliyi `cartItemQtys` effect-i ilə açıq editor-ə axır; X ilə bağlama rollback ETMİR; pill-lər canlı `×qty` badge daşıyır (pill rəqəmi = tab indeksi, say DEYİL).
- **popLayout** — view swap-larında `if (!open) return null` + inner AnimatePresence YASAQ (owner qaydası).

### 9.3 Token-lər (raw framer qiyməti İCXETMƏ)
- `src/lib/motion/system.ts`: **SPRING** = { kessey 500/26 (owner-tuned dialog), press 420/28, micro 280/22/0.9, surface 480/24/0.36, soft 320/32 }, **T** (time-based), **EASE** `[0.45,0,0.55,1]`.
- `src/app/admin/pos/lib/pos-motion.ts`: **SPRING** = single micro 280/22/0.9 + TAP (ProductGrid/CartPanel/old-RefundModal istifadə edir — ⚠️ `SPRING.kessey` YOXDUR, system.ts-dən götür).
- `src/lib/modal-transitions.ts`: `fastExit` 280ms, `slideUp`, `centerModal`.

### 9.4 Digər binding qanunlar (§4.0–4.14-dan — qısa)
- **İkonlar**: Phosphor YALNIZ (`saito-icons.tsx` adapter, `lucide-react` YASAQ). Light-da yalnız **mavi/qara** accent (sarı YOX — amber yalnız mövcud warning state-lərdə; round 7: light active pills = blue-500).
- **OVERLAY NEVER** (table card operation-ları). **Feature/visual pattern icazəsiz silinmir** (owner soruşulur).
- **Hər UI dəyişikliyi = HƏR İKİ temada test** (frame sampling: opacity intermediate dəyərləri + layout shift yoxlaması).
- **Tema**: light+dark `lightMode` + CSS var-lar; dev indicator / console warnings = 0 saxlanılır (round 7 "4 Issues" lesson-i).
- **JSX footguns**: `{/* */}` prop ARASI / element body-si = visible text (round 6 refund comment leak); `//` comment JSX içində = visible text; className template-də comment = Tailwind class (4.12).
- **useLayoutEffect SSR**: static route-da prerender olunanda "does nothing on the server" warning — client-only context-də (modal içi) istifadə təhlükəsizdir; console 0 warning saxla.

## 10. HARDA QALIBIQ (status, 2026-09-30)

### 10.1 TAMAM (round 1–8, hamısı E2E verified + committed/pushed)
Bax: `git log --oneline -20` + `MASTER_FEATURE_MAP.md` §10 journal (newest-first). Son: **round 8** = `e7846d39`-dən sonrakı commit (bu push).

### 10.2 AÇIQ / OWNER QƏRARI GÖZLƏYİR
0. **VOID ANOMALİYASI (round 8b)** — sent sətirdə LƏĞV ET: toast success + DB düzgün (item `voided`, order `cancelled`) amma client cart sətirini saxlayır. `FINAL_ORDER_STATUSES`/primary filter düzgün → şübhə: `tableOrderCache` (usePos.tsx ~602) və ya fetch race (reqId guard ~630) / else-branch. DİAQNOSTİKA: owner browser-ında `fetch('/api/orders?table_number=99')` response-unu oxu (status + order_items) + void-dan 5s sonra cart oxu. **Bunu düzəltmədən void axını "tam" sayma.**
1. **Online ordering** (ən böyük çatışmazlıq — bax `POS_COMPETITIVE_COMPARISON.md`): customer-facing channel MVP təklifi gözləyir.
2. **Real PSP card terminal**: adapter hazırdır (SIMULATOR-da) — PSP seçimi (owner).
3. **Offline mode** (order+drawer cache): roadmap-da, başlamayıb.
4. **Device unpair UX**: E2E-lərdə 2 dəfə lockout (round 6/7) → Settings → Cihazlar "Bərpa et" + self-recovery (PIN) — təklif, qərar gözləyir. (Round 7: device `6e3bcf1a…` DB-dən unpair olundu.)
5. **End-of-day analytics summary** (Z var; top items/avg chart/dashboard yoxdur).

### 10.3 Məlumat qeydləri
- **Comparison sənədi**: `POS_COMPETITIVE_COMPARISON.md` (repo root) — Toast/Lightspeed/Square feature audit (round 7).
- **Test data**: masa 98/99/471 üzərində refund/void olunmuş test sifarişləri normal audit trail-dir (Masa 99 r8: ORD-2931 ₼13 tam refund).
- **DB live fixes** (code-dan kənar, psql ilə): `complete_payment_atomic_v2` NET-paid guard (round 6) — function definition-ı yenilənib (repoda schema file YOXDURsa, `SELECT prosrc FROM pg_proc` snapshot: `/tmp/cpacv2_full.sql`).
- **E2E shots**: workspace `shots/` (r8_* = round 8; d7/v7/w7/f7 = round 7; b/z/c = round 6).
