# Round 10b E2E — Qeyd popup v2 — FINAL

App: http://localhost:3000/admin/pos | tab: tab-vtab-780962095 | test table: Masa 98 (never touched Masa 1; never clicked MƏTBƏXƏ GÖNDƏR)
Shots: /Users/mr.apple/saito-admin1/artifacts/saito-admin/e2e-shots/ (prefix v2-, converted to real PNG)

## Results
- TEST 1 new UI: PASS. Light+dark = ONE clean surface, header one line ("MƏHSUL QEYDI" + X), textarea, TƏSDIQLƏ bottom-right. No inner bordered box, no green ring.
- TEST 2 close timing: PASS. TƏSDIQLƏ -> vkTop 627->662@107ms->683@130ms->863@209ms->off-screen ~250ms, unmounted ~300ms; card gone ~690ms. Freeze frames: close-a(anim~150ms) card already pill + keyboard sliver; close-b(anim~400ms) keyboard removed, card closed, pill "timing". No frozen-open keyboard.
- TEST 3 VKB ✓ done key: PASS. vkTop 627->666@102->902@218->removed ~339ms; card gone ~810ms; pill "done".
- TEST 4 GİZLƏ: PASS. vkTop 627->804@181->951@244->removed ~324ms; card gone ~644ms; pill "done". No stranded card.
- TEST 5 caret at end: PASS. On open caret=4(end) for "done"; first key 'x' -> "donex" (idx5); shift+X -> "doneX". Appended at END.
- TEST 6 Escape: PASS. Card+keyboard closed, editor modal STAYED OPEN (title "Filadelfiya Classic" still visible), pill "doneX".
- TEST 7 Enter newline: PASS. VKB ↵ -> value "sətir1\n" (caret 7), card stayed open; then "sətir2"; Təsdiqlə -> pill shows multi-line "sətir1\nsətir2" truncated (123px).
- TEST 8 long text growth: PASS. 140 chars -> textarea 52px -> 73px, clientHeight==scrollHeight (NO internal scroll), max-height 160px, card 200px.
- TEST 9 multi-instance isolation: PASS. ＋ -> 2nd instance (variants 1×1Standart,2×1Standart, footer "YADDA SAXLA · 2"); its Qeyd = "Qeyd əlavə et" placeholder. Switching back: instance1 Qeyd = long note; instance2 = placeholder.
- TEST 10 console: PASS. 0 JS errors across the whole run (browser_utility errors -> []).
- CLEANUP: editor modal closed; Masa 98 TƏMIZLƏ -> "MƏHSUL YOXDUR" (empty). Note: no PIN prompt appeared for TƏMIZLƏ on an empty/unsent cart.

## Notes
- DOM text is lower/mixed case; UI uppercases via CSS (e.g. "Təsdiqlə" renders "TƏSDIQLƏ", "Məhsul qeydi" renders "MƏHSUL QEYDI").
- Mid-transition frames captured by time-scaling performance.now x0.1 then freezing (framer-motion is rAF-driven; WAAPI pause alone does not freeze it).
- Incidental: a stray click hit the header "Kassa" and opened a card-terminal simulator + Kassa modal; both were closed via their own cancel/close controls. No transaction was created.
