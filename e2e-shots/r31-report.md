# E2E Round r31 (run F) — Recipes split out of Stok hub

App: http://localhost:3000 (superadmin, dark theme default)

## Per-step results
1. **PASS** — Sidebar shows TWO separate entries: "Stok" → /admin/stock (warehouse icon) AND "Reseptlər" → /admin/recipes (document/scroll icon). Both visible for superadmin. Screenshot: `r31-1-sidebar-two-entries.png`.
2. **PASS** — Hero chip row on /admin/stock has EXACTLY 10 chips, no "Reseptlər" chip.
3. **PASS** — Clicking sidebar "Reseptlər" loads standalone /admin/recipes (URL confirmed /admin/recipes, recipes UI rendered). Screenshot: `r31-2-recipes-standalone-dark.png`.
4. **PASS** — Direct nav to /admin/stock?view=recipes redirects to /admin/recipes (client-side redirect; final URL /admin/recipes, recipes page rendered, no Stok hub). Note: redirect is not instant — verified after ~3s settle.
5. **PASS** — Light mode via navbar toggle: html class → "light", body bg rgb(247,247,248), text rgb(29,29,31), h1 rgb(17,24,39) → readable dark-on-light. Screenshot: `r31-3-recipes-light.png`. Reverted to dark (html class "dark") afterwards.
6. **PASS** — Recipe list loads on /admin/recipes: product rows with price + "N resept" (P8_PROD 0, Tea 1, Lahmacun 3, Doner 5, Dragon Roll 5, Saito Special Set 9, Green Tea Japanese Style 1, Tom Yam 5, Sake Nigiri 5, Filadelfiya Classic 7, Coca-Cola 330ml 0, Kaliforniya Gold 7, Edamame 4, Miso Sorbasi 8, Yasai Roll Vegetarian 9, ...). No blank page, no crash.

## Chip count & labels (step 2)
Count = **10** (matches expected exactly):
ANBAR · AĞILLI ANALIZ · TƏDARÜK · ALIŞ SIFARIŞLƏRI · REPORT · TƏDARÜKÇÜLƏR · SAYIM · QAYTARIŞ · İTKI ST. · AUDIT

No "Reseptlər" chip present in the hero row.

## Console
Console error count: **0** (no JS exceptions; no error-level console messages). No transient /api 500s observed during this run.

## Screenshots
- r31-1-sidebar-two-entries.png — sidebar with Stok + Reseptlər entries + Stok hub hero (10 chips)
- r31-2-recipes-standalone-dark.png — standalone /admin/recipes (dark)
- r31-3-recipes-light.png — /admin/recipes in light mode

Overall: **PASS** (6/6).
