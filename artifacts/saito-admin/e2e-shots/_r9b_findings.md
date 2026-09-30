# POS round 9b E2E — rolling findings

App: http://localhost:3000/admin/pos (tab-vtab-780962095). Table used: Masa 98. Never sent to kitchen.
Shots dir: /Users/mr.apple/saito-admin1/artifacts/saito-admin/e2e-shots/

## Progress
- [x] Setup: opened POS, opened Masa 98 panel (cart was already empty; no TƏMİZLƏ needed).
- [x] TEST 1 PASS — plain tap "Filadelfiya Classic": pill 1 label "Standart" (×1); SERVİŇƏ ÜSLUBU = "Standart" selected.
- [x] TEST 2 PASS — Kremli on pill1 -> pill1 "Kremli"; "+ Yeni variant" -> pill 2 "Standart" (fresh, NOT Kremli/Yüngül); body = Standart.
- [x] TEST 3 PASS — × on active pill 2 removed it; back to 1 pill "Kremli" (×1).
- [x] TEST 4 PASS(no-clip) WITH NOTE — see below.
- [x] TEST 5 — 3 pills: 1 Kremli×1, 2 Standart×1 (with Əlavə Avokado), 3 Standart×1 (no addons). Plain tap did NOT merge into the Standart+avocado line; created a NEW "Standart" pill. Cart row qty 3, 45.50 ₼.
- [ ] TEST 6 dark — in progress.
- [ ] Cleanup Masa 98 (TƏMİZLƏ).

## TEST 4 NOTE (label priority)
- With SERVİŇƏ ÜSLUBU = "Standart" set, adding addon "Əlavə Avokado" did NOT change the pill label (stayed "Standart").
- Tapping the selected "Standart" option DESELECTED it, and THEN the pill label became "Əlavə Avokado".
- Measured on active pill: label clientWidth=scrollWidth=89px, capsule=pill width=200px -> NOT clipped; capsule fully covers label. CSS still has max-w-[110px] truncate.
- Saved pill2 as Standart + Əlavə Avokado (re-selected Standart) to match TEST 5 premise.

## Screenshots saved
r9b-1-default-pill.png, r9b-2-fresh-variant.png, r9b-3-deleted.png, r9b-4-no-clip.png, r9b-5-merge.png, r9b-6-dark.png
