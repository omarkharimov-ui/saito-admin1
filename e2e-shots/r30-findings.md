# r30 run D — POS pending-chip E2E findings (FINAL)

Tab: tab-vtab-780962578 (http://localhost:3000/admin/pos, SUPERADMIN, dark theme, viewport 1920x1080)
Scope respected: only Masa 3 touched (Masa 2/4/5/6/7/8/9/10 untouched).

## Verdict
- Step 1 (add + send): PASS
- Step 2 (chip + CTA before reload): PARTIAL — qty 2 OK, CTA "+1" pill OK, chip NOT visually rendered
- Step 3 (after hard reload): PARTIAL — restored qty 2 + pending OK, CTA "+1" OK, chip again NOT visually rendered
- Step 4 (cleanup): DONE — Masa 3 = BOŞ
- Step 5 (console/network): 0 JS console errors; 11x POST /api/devices → 500 (identical, = known pooler 500); all other requests 200

## Exact texts observed
- Chip DOM text: "1 gözləyir"  (SPAN, amber color lab(80,16.6,99.2), hourglass icon child)
- CTA button text: "MƏTBƏXƏ GÖNDƏR +1"  (visible label "MƏTBƏXƏ GÖNDƏR" + "+1" pill)

## KEY DEFECT (visual)
The amber chip exists in the DOM but is NOT visible on screen (both before and after reload).
Root cause: the product-name cell of the cart line is a truncated flex container
(class "text-sm font-semibold truncate ... flex items-center") nested in a
"flex-1 min-w-0" wrapper that collapses to ~35px because the qty/detail controls
sibling is ~242px wide in a ~400px cart column. The name text fills the 35px and the
chip is laid out past the overflow-hidden edge (chip x≈1665, row right edge ≈1553) -> clipped.
The chip renders correctly only if the name column is wide enough; with the long name
"Green Tea Japanese Style" it is fully hidden. Screenshot crop confirms no amber chip.

## Tool-call hazard
Clicking the big send CTA once returned "detached_or_invisible" (page re-rendered / POS
re-mounted, floor reset to 1-CI MƏRTƏBƏ). Second attempt succeeded ("Sifariş göndərildi").

## Files
- r30-masa3-open.png
- r30-16-pending-chip.png           (step 2 full page)
- r30-cartline-crop.png             (step 2 cart-row crop -> no chip visible)
- r30-17-pending-chip-restored.png  (step 3 full page)
- r30-17-cartline-crop.png          (bad capture = skeleton placeholder)
- r30-findings.md
