# SAITO POS — 4 fresh fixes E2E verification (rolling record)

Target: http://localhost:3000/admin/pos (tab-vtab-780962288). Auth cookie present (no login redirect).
Artifacts dir: /Users/mr.apple/saito-admin1/artifacts/saito-admin/e2e-shots/

## KEY ENVIRONMENT NOTE
App hot-reloads / state-resets every ~15s (whole POS re-renders to skeleton "Yüklənir...", mode reverts to İÇƏRİDƏ,
open order closes). Must complete each capture quickly between reloads.

## TEST 1 — mode icons  (MOSTLY DONE)
- Switcher container + icons inspected. Screenshot saved: r11o-mode-icons.png (mode switcher)
- İÇƏRIDƏ icon = fork + knife (Phosphor fork-knife)  ✓ correct
- ÇATDIRILMA icon = MOPED/scooter (Tabler `moped`, exact path match) ✓ correct (NOT a bicycle)
- TAKEAWAY icon = rendered large at 420px: a HANDBAG/PURSE — big handle arc + trapezoid body +
  horizontal flap line + rounded clasp/tongue at bottom-center. NO hand, NO fingers visible.
  Source: src/components/ui/saito-icons.tsx -> PickupBag = Hugeicons `hand-bag-01` (code comment claims
  "a HAND gripping a bag"). Visual contradicts the comment: it is a handbag outline.
  => TEST 1 takeaway icon = FAIL vs spec ("hand gripping a bag"; spec explicitly excludes "handbag outline").
- Takeaway board header (next to "Gel-Al Sifarişləri") = SAME PickupBag icon (text-emerald-500). Screenshot: r11o-takeaway-board.png ✓ (shots captured)
- Delivery board header (next to "Çatdırılma Sifarişləri") = Moped icon (text-blue-500). Screenshot: r11o-delivery-board.png ✓

## TEST 2 — course chip  (IN PROGRESS)
- Dine-in (İÇƏRİDƏ) shows floor map; must open a table order to get product grid + cart.
- Opened table order -> product grid + cart (right panel).
- 2a: tapped "Tea" (₼10) once via real click. Cart row = "Tea | 10.00 ₼ | − 1 +".
  Course/chip container <div class="mt-1 flex items-center gap-1.5 flex-wrap"> is EMPTY.
  => NO course chip, NO "1 əlavə" chip. 2a = PASS.
- 2a screenshot r11o-cart-no-chip.png: element crop caught reload skeleton; viewport shot also skeleton.
  NEED re-capture (fast, right after adding Tea).
- 2b/2c/2d: NOT DONE yet.

## TEST 3 — ActionSheet back button: NOT DONE. (clicking a table card opened the ORDER view, not a
   bottom action sheet — need to find/verify the ActionSheet; possible different trigger or occupied table.)

## TEST 4 — console error count: NOT DONE (collect at end).

## Saved files
- r11o-mode-icons.png
- r11o-takeaway-board.png
- r11o-delivery-board.png
- r11o-cart-no-chip.png  (BLANK/skeleton — must redo)
