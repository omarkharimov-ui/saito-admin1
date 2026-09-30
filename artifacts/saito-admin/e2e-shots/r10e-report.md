# Round 10e — POS "Qeyd" pill↔card morph EXIT handoff (pre-fix observation)

Page: http://localhost:3000/admin/pos (staff session OK, SAITO Admin, Masa 14 / P8_PROD)
Viewport: 1470 × 867. Frame interval ≈ 17 ms (60 fps).

## Deviations from the brief (important)
1. **No `z-[10003]` card exists in this build.** The note card renders at
   `fixed z-[10000] left-1/2 -translate-x-1/2 w-[min(92vw,420px)] rounded-[1.75rem] …`
   (`document.documentElement.outerHTML.includes('10003') === false`).
   The exact `getCard()` therefore returned `null` on every frame, so it was extended to
   also match `z-[10000]` + `420px` (only change to the sampler; everything else identical).
2. **There is no `"Qeyd:"` label span** anywhere (`qeydLabelSpans = 0`). `getPill()` falls
   through to the text match on the button `"Qeyd əlavə et"`.
3. The pill is the note button in the order panel, at **x=1027, y=709, w=122.9, h=34, bottom=743**
   (approx. (1088, 726) centre). Tapping it opens the "SİFARİŞ QEYDİ" card (× = **Bağla** at
   card top-right, **LƏĞV ET** = cancel, **TƏSDİQLƏ** = commit) and the virtual keyboard
   (`[data-vk-panel]`, `--vk-height` 0 → 281px).
4. To also capture ENTRY, RUN 1's sampler was armed **before** the pill tap (the brief arms
   after entry settled). The exit is fully contained in the same capture.
5. RUN 2's fixed `getPill()` **never matched** (see §3) — the pill label becomes the note text
   as soon as the textarea has content.

## 1) ENTRY  (RUN 1)
- First frame where the card exists: **t = 12355 ms**, card ≈ 386.4 × 223.9, **pill.op = 1**
  → the expected `pill.op = 0` was **NOT observed** (pill is never faded; it stays opacity 1).
- The card **scales in place** at its fixed centred position (386×223 → 423×245) while the
  keyboard slides up (vk 0 → 281px) over ≈ 200 ms (t 12355 → 12561). No pill-origin morph.

## 2) EXIT RUN 1 (cancel / × )  — landing t = 24825 ms (first frame card = null)
Last 12 frames before landing (idx 1473–1484); pill = {y:709, w:122.9, h:34, op:1} on all:

| t | card y | card w | card h | card b | card op | contentOp |
|---|---|---|---|---|---|---|
| 24627 | 368.4 | 399.1 | 231.3 | 599.7 | 1 | 1 |
| 24643 | 368.3 | 399.0 | 231.2 | 599.6 | 1 | 1 |
| 24660 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24677 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24694 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24711 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24726 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24741 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24758 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24777 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| 24794 | 368.7 | 399.0 | 231.2 | 599.9 | 1 | 1 |
| **24808** | 368.7 | 399.0 | 231.2 | 599.9 | **0** | 1 |

- Landing frame: **t = 24825**, card = null.
- pill.op at landing−3 / −1 / +1 / +3 / +10 = **1 / 1 / 1 / 1 / 1**.
- Geometry Δ (card last rect → pill rect at landing): **dx = +491.5, dy = +340.3,
  dw = −276.1, dh = −197.2 px**  (card last ≈ x535.5 y368.7 399×231; pill x1027 y709 122.9×34).
- kbTop / vk at landing = **null / 0px** (keyboard already fully collapsed).
- Sequence: keyboard collapses 281→0px (t 24352→24511, ≈160 ms), card shrinks 412→397 px,
  then the card's opacity flips 1→0 in a single frame and it unmounts the next frame.
  **No geometry morph toward the pill — it is a hard cut.**

## 3) EXIT RUN 2 (commit / TƏSDİQLƏ) — landing t = 6797 ms (first frame card = null)
- Same card geometry behaviour (keyboard collapses 281→0px t 6323→6481, card 420→397 px;
  card op 1→0 on the last frame; unmount next frame).
- **pill = null on every sampled frame.** Verified live: while the card is open the order-panel
  button reads the note text (**"test qeydi"**), not "Qeyd əlavə et", so the fixed `getPill()`
  (and its missing `"Qeyd:"`-span branch) cannot match it.
- Hence pill.op offsets = **null**; geometry Δ = **n/a** (no pill rect available).
- pill.text just before landing / after = **not measurable**; the order-panel button showed
  **"test qeydi"** both before and after landing (settled pill reads "test qeydi").

## 4) Keyboard at landing
Both runs: **kbTop = null, vk = 0px** → the virtual keyboard is **already fully collapsed**
before the card unmounts (the collapse completes ≈300 ms before the card disappears).

## 5) Console
**0 errors, 0 warnings** — the console buffer, the error-level filter and the page
exception log all returned empty during both runs.

## 6) Saved files (workspace-relative)
- `r10e-editor-open.png`  — order panel/editor open, "Qeyd əlavə et" pill visible
- `r10e-exit-diag.json`   — RUN 1 sampler (1903 frames, ENTRY + cancel EXIT)
- `r10e-settled-dark.png` — pill static again after cancel
- `r10e-exit-diag2.json`  — RUN 2 sampler (784 frames, commit EXIT)
- `r10e-settled-note.png` — settled pill showing note "test qeydi"
- extra: `r10e-pos-initial.png`, `r10e-sampler.js`, `r10e-analyze3.js`, `r10e-inspect.js`

## Summary for the fix
The exit handoff is broken: the pill is **never hidden (op stays 1)**, the card never
morphs its geometry toward the pill (Δ ≈ 491×340 px), and the card **hard-cuts** away
(1-frame opacity flip + unmount) *after* the keyboard has already fully collapsed. There is
no pill↔card morph on exit — neither in the empty-note (cancel) nor the commit path.
