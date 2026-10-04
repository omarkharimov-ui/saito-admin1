# r13v verification — FINAL findings
Tab tab-vtab-780962410 (owner's Chrome). PIN 4321 = SUPERADMIN.
Order under test: **ORD-2957 / Masa 99** = Filadelfiya Classic (Standart · Əlavə Losos ×3 · Sesam Toxumu) + Tea.

## STEP 1 — mixed order — PASS (after 1 recovery)
Attempt 1: food line got HELD (mis-click on per-line hold "Saxla (mətbəxə göndərmə)") -> only Tea sent (₼10.00). Recovery: re-added food, sent -> Masa 99 ₼33.50 · HAZIRLANIR · 2 items. ORD-2957.

## STEP 2 — modifier TEXT — PASS
Grid card + modal both show modifiers as a quiet plain-text line `Standart · Əlavə Losos ×3 · Sesam Toxumu` (no chips).
Light mode: legible but muted/low-contrast gray-on-white. Reverted to dark.
Shots: r13v-card-text-dark.png, r13v-modal-text-dark.png, r13v-card-text-light.png, r13v-modal-text-light.png

## STEP 3 — cross-station isolation — PASS (no leakage)
- 3.1 KDS Main Kitchen card listed ONLY the food item (drink absent). Shots: r13v-card-text-dark.png / r13v-main-afterbar.png
- 3.2 BDS Bar card listed ONLY the drink "Tea ×1". Shot: r13v-bds-card.png
- 3.3 Modal STANSIYALAR grouped correctly: Bar 0/1 · Main Kitchen 0/1 (food under Main Kitchen, drink under Bar). No item under a wrong station.
- Observation: the item row badge shows "MAIN" on BOTH rows (incl. the Tea drink) in card+modal, but STANSIYALAR counts Tea under Bar. Badge label looks like it is not the station (or is mislabelled) — worth a look, but grouping itself was correct.

## STEP 4 — ready flow + revert watch
- 4.1 BDS modal "Hazırdır" -> **ISSUE**: it completed the WHOLE order, not just the drink. Header -> HAZIRDIR; STANSIYALAR -> Bar 1/1 · Main Kitchen 1/1; both rows got green check + strike-through. Shot: r13v-bds-ready.png
- 4.2 KDS card header then read **SERVİSƏ HAZIRDIR** with Bar 1/1 · Main Kitchen 1/1 (expected a partial HAZIRDIR-family label + Main Kitchen 0/1). Shot: r13v-main-afterbar.png
- 4.3 Whole-order KDS "Hazırdır" CTA was already disabled ("Servis POS-dan edilir") because 4.1 had completed it. REVERT WATCH: no revert — status held SERVİSƏ HAZIRDIR at t0/t10/t30/t60. Shots: r13v-serve-t0/t10/t30/t60.png
- 4.4 POS -> Masa 99 kebab -> action sheet -> SERVISƏ VER -> toast "Servisə verildi"; card -> SERVİS EDİLDİ. KDS re-check: 4 active, Masa 99 gone from active board. Shots: r13v-served.png, r13v-kds-after.png

## Empty-board flicker (KDS)
Observed >=3 flashes on /admin/kds: board briefly rendered the empty state ("0 aktiv sifariş" / "Bütün sifarişlər hazırdır") each lasting <1s, then repopulated on its own or after reload. Correlated with the ~3s pos-sync poll refetch (list unmounts/empties during refetch). Broke element-scoped screenshots. Also seen once on first KDS mount (0 orders until reload).

## Console
No errors, no warnings captured (only [pos-sync] debug + [placeOrder] logs + HMR).
