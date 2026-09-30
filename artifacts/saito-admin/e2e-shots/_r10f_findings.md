# E2E Qeyd shared-element morph (round 10) — rolling findings

Scope: test POS product-modal Qeyd pill<->floating card morph on table Masa 98 only.
NEVER touch Masa 1 / MƏTBƏXƏ GÖNDƏR. Tab: tab-vtab-780962095 (http://localhost:3000/admin/pos)

## Setup
- [x] Logged in via PIN 4321 (auto-session had expired -> staff login)
- [x] Masa 98 selected; cart emptied earlier (released empty table), order view open
- [x] Tapped Filadelfiya Classic once -> 1 line; editor opened via cart "Ətraflı"
- QEYD pill refs change per snapshot; editor body must be scrolled to reveal pill.

## Checks
- [x] CHECK 1 open morph: mid-flight captured (card smaller/lower, ghosted) ; settled card "MƏHSUL QEYDI" centered above keyboard -> PASS
- [x] CHECK 2 close morph: mid-close frame captured (card shrinking down-left toward pill slot); pill text -> "morph test" -> PASS
- [x] CHECK 3 reopen retention: reopened with "morph test" pre-filled; closed via × -> PASS
- [ ] CHECK 4 multi-instance isolation (dashed + -> pill2 placeholder) -> r10f-4-multi.png
- [ ] CHECK 5 save + persistence -> r10f-5-saved.png
- [ ] CHECK 6 dark theme morph + allergen tick -> r10f-6-dark.png, r10f-7-allergen-dark.png
- [ ] CLEANUP: close modal, TƏMIZLƏ Masa 98 (PIN 4321)

## Files saved (workspace)
e2e-shots/r10f-1-open.png, r10f-2-midflight.png, r10f-3-after-close.png
(+ helper _layout*.png, _editor*.png, _cart1.png, _midclose.png, _reopen.png)

## Blockers
- savePath wrote to workspace e2e-shots/, NOT external dir; must copy CDN URLs -> /Users/mr.apple/saito-admin1/artifacts/saito-admin/e2e-shots/
