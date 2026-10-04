# r13 investigation — FINAL findings

Tab: tab-vtab-780962404 (agent, retain) — localhost:3000
Login PIN 4321 OK → /admin/pos rendered. NO "supabaseKey is required" error. Console: no errors; no "two children with the same key"/"Encountered two children" warnings at any point.

artifacts dir: saito-admin1/artifacts/saito-admin/e2e-shots/

## TASK A — modifier rendering  → PASS (chips)
- Existing KDS tickets (Masa5/10/992/993, E2E Wolt, KDS Review) had NO modifiers; only category chip "MAIN" + qty "×N".
- BDS board: no modifiers (Green Tea Japanese Style ×2).
- A ticket WITH modifiers was created (see Task D). KDS card + modal render modifiers as PILL/CHIP labels under the product name:
  Filadelfiya Classic → chips: "Standart" (serving style), "Əlavə Losos ×3" (addition, qty in the chip), "Sesam Toxumu" (addition ×1, no ×N).
  Files: r13-a-card.png (card), r13-a-modal.png (modal), r13-a-board2.png, r13-a-bds.png.
- POS cart renders modifiers as plain TEXT lines ("= 5 əlavə", tag "Balıq") — Masa 995 sheet r13-b-pos-995.png.

## TASK B — cross-table contamination → PASS (none observed)
- modalA = Masa 5 ORD-2949: Yasai Roll Vegetarian ×2 (+note), Lahmacun ×3  (r13-b-modalA.png)
- modalB = Masa 993 ORD-2954: Tom Yam ×1                                (r13-b-modalB.png)
- No items from A appeared in B or vice-versa.
- POS: Masa 993 sheet = Tom Yam ×1 (r13-b-posA.png) → matches modalB; no leak from Masa 995 (r13-b-pos-995.png: Tom Yam ×1, Green Tea ×3, Filadelfiya ×3).
- Note: Masa 5 / Masa 10 are NOT on POS floor "1-CI MƏRTƏBƏ"; Masa 10 is on "VIP" floor.

## TASK C — "Servise ver" revert → NO REVERT (candidate ISSUE: status label never advances)
- masas 993/ORD-2954 was NOT in HAZIRLANIR (already SERVİSƏ HAZIRDIR). Fresh ticket used: Masa 996 / ORD-2956 (HAZIRLANIR, item unchecked).
- Clicked item ✓ (round check). t0: check turns green outline. t10: item dimmed + solid green ✓, STANSIYALAR 0/1 → 1/1. t30: identical (no change).
  Files: r13-c-t0.png, r13-c-t10.png, r13-c-t30.png, r13-c-board-after.png.
- Ticket header status label stayed "HAZIRLANIR" at all 3 samples (did NOT become SERVİSƏ HAZIRDIR) — no revert to previous state at any moment.
- POS floor chip for Masa 996 = "HAZIRLANIR" ₼23.50 (r13-c-posfloor.png) → matches KDS.
- No console error/warning at any sample.

## TASK D — modifier quantity ×3 → PASS
- Free table Masa 996 → added Filadelfiya Classic with Əlavə Losos ×3 + Sesam Toxumu ×1, order note "test qeydi r13"; saved + sent to kitchen (ORD-2956). Order LEFT ACTIVE.
- Files: r13-d-modifiers.png, r13-d-note.png, r13-d-qty.png.
- ×3 displayed as ONE chip "Əlavə Losos ×3" (not three chips). Different modifier once = "Sesam Toxumu".
