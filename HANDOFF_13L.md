# HANDOFF 13l — Scroll-jump bug fix + full main-area panels + stacked sections (2026-10-05)

## Owner mandatı (söz-lə-söz)
> "ala bax, səhifədə coş berbat bir bug movcuddur — taba keçirsən səhifə oynuyur.
> İsteklerim: xammal modal açılışı səhifəni 2/10 kimi açılmasın, tam şəkildə açılsın
> (baxa bilərsən hədiyyə kartları səhifəsində gör necə açılır). Tab çoxdur — meselən
> Sayım/İtki mənə tab yerində alt-alta məlumatlar header ilə olsa daha mənalı olmazmı?
> Belə coş çirkindirrr."

## Commit
`b23f42f` — 8 files, +233/−266, pushed to main. E2E r35 (7/8) + r35b (2/2), console 0,
dark+light, 17 shot `e2e-shots/r35*`.

## 1. SCROLL-JUMP BUG (kök səbəb + fix)
**Kök:** admin desktop shell (`AdminDesktopShell.tsx`) main content-ı `overflow-y-auto`
container-da scroll edir (`contentRef`). Stok hub-un tab-ları 2-4× fərqli hündürlüklüydü
(13k-dan sonra Tədarük = 4800px+). Tab switch-də container `scrollTop`-nı saxladı →
qısa tab-a keçəndə container "aşağıdan" göründü → **səhifə oynadı**.

**Fix** (`stock/page.tsx`):
- Mount-da səhifə root-dan yuxarı birinci `overflowY: auto|scroll` ancestor tapılır və
  cache olunur (`scrollRootRef`).
- **Hər tab switch-də** `scrollTo({top: 0})` (+ `window.scrollTo(0,0)`).
- **İlk run skip** (`tabSwitchedRef`) — deep-link mount (`?view=po`) zamanı child hub-un
  anchor effect-i (section scroll) parent reset-dən ƏVVƏL işləyir; reset etməsəydi
  anchor-u öldürərdi. (r35 E2E catch → fix → r35b PASS.)

E2E kanıt: scrollTop 900 → tab click → **0** (light + dark), `scrollLeft = 0`.

## 2. FULL MAIN-AREA PANEL (gift-cards pattern)
**Referens:** `gift-cards/page.tsx` 1143-1203 — panel = **tüm main content area**
(sidebar kənarından sağa, header-alından aşağıya), iOS-push, portal to body, geometry
**shell state**-dən (`LayoutContext.mainEdge/mainBottom`) — polling/measurement YOX.

**Yeni `FullPanel`** (`stock-ui.tsx`):
```
createPortal → <div fixed right-0 bottom-0, style={{left: mainEdge, top: mainBottom}}>
  <motion.div backdrop absolute inset-0 (light: black/25, dark: black/50, blur-[3px]) onClick=close>
  <motion.aside role=dialog absolute inset-0 flex-col bg-[var(--theme-bg)]
     x:'100%'→0, ease [0.32,0.72,0,1] 0.28s>
```
- `Drawer` = FullPanel + header (title/subtitle/X) + scroll body + optional footer
  (API dəyişmədi; `wide` = deprecated/no-op — panel artıq tam en).
- **StockTab:** lokal `ModalShell` (13k: 460px right drawer = owner-in "2/10") ✂ →
  4 modal (Xammal Girişi quick / Stok Action / Yeni Xammal / **Stok Tarixçəsi** —
  13k-da centered modal qalmışdı, indi o da tam panel) = shared `Drawer`.
  Formlar `max-w-xl mx-auto` (oxunulabilirlik); siyahılar tam en.
- **InspectorPanel:** köhnə `fixed inset-y-0 max-w-md` shell ✂ → `FullPanel`
  (custom edit header qorunub; content `max-w-3xl mx-auto`).
- **SuppliersSection** detail/form Drawer-ları = avtomatik tam panel (shared komponent).
- **Mobil:** LayoutContext default 0/0 (mobile shell provider vermir) → full viewport.
- Stacking: inspector portal əvvəl, action modal portal sonra → DOM order = modal üstə.

E2E geometry: `left 290, top 58, right 1470 (=vw), bottom 923 (=vh)` ✓.

## 3. SUB-TAB-LAR → STACKED SECTIONS + HEADERS
3 hub-da sub-pill sətirləri + `AnimatePresence` sub-switch ✂. Bütün sectionlar
**alt-alta** render (page = 1 uzun scroll), hər biri:
```
<section id="sec-{id}" class="scroll-mt-6 space-y-4">
  <SectionHead overline="{Tab adı}" title="{Section}" />
  {content}
</section>
```
- **Tədarük:** Nə Alım (13k 2 sütun QORUNUR) → Faktura (OCR) → Sifarişlər (PO, elevated)
  → Tədarükçülər
- **Sayım & İtki:** Sayım (İnventarizasiya) → İtki (Normalar) → Qaytarış (Tədarükçü)
  → Anomaliyalar (elevated gate counts/waste/returns)
- **Analiz:** Hesabat (30 gün) → Trend (14 günlük sərfiyyat) → Audit (tam tarixçə)

**`sub` = indi scroll ANCHOR** (tab deyil):
- `scrollToSection(id)` @ `ViewFrame.tsx` — smooth scroll + **re-anchor 400/900/1600ms**
  (section-un YUXARISINDA async skeleton→table genişləndikdə viewport hədəfdən itməsin).
- Hero CTA ("Anomaliyalar →", Stok metrics "mənfi" → Sayım) = `onSubChange` = anchor scroll.
- Deep link `?view=po` (legacy map) → Tədarük + avto-scroll Sifarişlər (E2E: heading
  top=233 ✓).
- **Main 4 intent tab QALIR** (13i owner qərarı) — yalnız sub-qat təmizləndi.
- Content pages öz slim toolbar-larını saxlayır (böyük title YOX) → SectionHead ilə
  çakışmır.

## E2E r35 + r35b (console 0, dark+light)
- r35: #1-#7 PASS (scroll reset ×2, panel geometry ×2, stacked ×3) · #8 PARTIAL
  (deep-link auto-scroll YOX idi → kök: parent reset child anchor-u öldürdü)
- Fix (ilk-run skip + re-anchor) → r35b: #1 deep-link PASS (top=233, scrollTop=4625) ·
  #2 scroll-reset regression PASS (800→0) · #3 CTA SKIP (open anomaliya YOXDUR — data)
- 17 shot: `e2e-shots/r35-01..14`, `r35b-01..03` + `r35-FINDINGS.md`

## Qalan / diqqət
- `GROQ_API_KEY` hələ də owner action (13k) — faktura OCR + AI advisor + calibrate.
- Sayım (8 mənfi/şübhəli maddə) = owner (13i/13k-dan daşılan).
- §1d yeganə qalan zəif: multi-location (biznes).
- R35 qeydi: waste-standards delete-confirm modal-in heading-i DOM-da "gizli" görünür
  (viewport-da YOX, visual regression DEYİL) — modal mounted amma closed state.

## Dev
```
corepack pnpm --filter @workspace/saito-admin dev   # port 3000
tsc: corepack pnpm --filter @workspace/saito-admin exec tsc --noEmit | grep 'error TS' | grep -v 'src/__tests__/'
```
