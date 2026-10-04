# r13c status-revert reproduction — FINAL findings

Tab: tab-vtab-780962407 (NEW tab, http://localhost:3000, owner's Chrome). Login PIN 4321 = SUPERADMIN OK, admin rendered (no "supabaseKey" error).
Shots dir: saito-admin1/artifacts/saito-admin/e2e-shots/

## PHASE 1 — KDS whole-order "Hazırdır" CTA — RESULT: PASS (no revert)
Ticket: MASA 996 / ORD-2956 (as specified). Item Filadelfiya Classic (Standart, Əlavə Losos ×3, Sesam Toxumu), ticked ✓, note "test qeydi r13".
Modal status timeline (header label / footer CTA):
- before click: HAZIRLANIR / active "Hazırdır"  → r13c-m1-before.png
- t0 (immed): HAZIRLANIR / active "Hazırdır"   → r13c-m2-t0.png
- t3: SERVİSƏ HAZIRDİR / quiet emerald "Servis POS-dan edilir" → r13c-m3-t3.png
- t10: SERVİSƏ HAZIRDİR → r13c-m4-t10.png ; card in grid SERVİSƏ HAZIRDİR → r13c-card-t10.png
- t30: SERVİSƏ HAZIRDİR → r13c-m5-t30.png ; card r13c-card-t30.png (SERVİSƏ HAZIRDİR)
- t60: SERVİSƏ HAZIRDİR → r13c-m6-t60.png
No state REVERT at any timestamp. No console error/warn.

## PHASE 2 — POS floor serve (Masa 996) — RESULT: PASS (no revert)
- Floor card chip before: SERVİSƏ HAZIRDIR (23.50) → r13c-pos-before.png
- NOTE/UX: tapping the table card opens the order sheet whose ONLY action is "MƏTBƏXƏ GÖNDƏR" (no serve). The serve action lives in the card's kebab menu → action sheet "ƏSAS ƏMƏLIYYATLAR / DAHA" → "SERVISƏ VER".
- Clicked SERVISƏ VER → toast "✓ Servisə verildi". → r13c-pos-t0.png
- t10: chip SERVİSƏ HAZIRDIR → SERVİS EDİLDİ (table still occupied, 23.50) → r13c-pos-t10.png
- t30: SERVİS EDİLDİ (stable, no revert) → r13c-pos-t30.png
- KDS re-check: MASA 996 GONE from board (5→4 aktiv sifariş) → r13c-kds-after.png
No console errors.

## PHASE 3 — station isolation — RESULT: PASS (no leakage observed)
- Station navbar = "Main Kitchen 4 | Bar 0 | GÜN" (plain <button>s inside nav.flex; not in ARIA tree).
- Bar view: "Bu stansiyada aktiv sifariş yoxdur" (0 orders) → r13c-bar-board.png
- No Bar ticket existed, so per instructions used unified Main Kitchen view.
- Modal stations section: each checked ticket groups its items under the item's OWN station:
  * Masa 10 / ORD-2952: P8_PROD [MAIN] → STANSIYALAR: Main Kitchen 1/1 → r13c-modal-stations.png
  * Masa 993 / ORD-2954: Tom Yam [MAIN] → STANSIYALAR: Main Kitchen 1/1 → r13c-modal-stations-993.png
- No item appeared under a non-matching station. All currently-active tickets are Main-Kitchen (food) items; none appear on the Bar board.

## Console (whole run)
0 errors, 0 warnings (only React DevTools info / HMR / [pos-sync] debug).
