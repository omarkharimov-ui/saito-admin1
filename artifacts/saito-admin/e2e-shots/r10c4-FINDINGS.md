# ROUND-4 (r10c4) — POS "Qeyd" morph EXIT re-verification — dark + light

Run: 2026-09-30, http://localhost:3000/admin/pos, session = SUPERADMIN (no login wall).
Flow: /admin/pos → Masa 98 (empty table → order view) → cart line "Filadelfiya Classic" ×3 (42.00 ₼)
→ product editor via cart "Ətraflı" → Qeyd pill ("Qeyd əlavə et") at x=382,y=689 (b=727.4, 132.9×38).
Instrument: `window.__startSmp()` rAF sampler (1800 ms window), armed on the target button's
**capture-phase `pointerdown`**, so t=0 == the real click (`pill` / `TƏSDİQLƏ` / `×`). Viewport 1470×867 CSS px.
Card node = `div.fixed` with class `z-[10003]`. Keyboard = `[data-vk-panel]`.

## Metrics

### ENTRY (dark) — r10c4-entry-dark.json (54 frames)
- first card frame t = **51 ms** (card already == pill rect: 382.3 / 689.4 / 132.9×38)
- worst card.b − kb.y over the whole flight = **−14.0 px** (at t=291) → occlusion frames = **0** (no key overlap)
- settled (t≈1818): card.b = **572.5**, kb.y = 586.5 → **card.b == kb.y − 14 exactly (Δ 0.0 px)**

### ENTRY (light) — r10c4-entry-light.json (54 frames)
- first card frame t = **52 ms**
- worst card.b − kb.y = **−14.0 px** (t=341) → occlusion frames = **0**
- settled: card.b = **572.5**, kb.y = 586.5 → **Δ vs kb.y−14 = 0.0 px**

### EXIT #1 (dark, TƏSDİQLƏ) — r10c4-exit1-dark.json (55 frames)
- first card frame t = **59** · convergence (card within 4 px of pill, all x/y/w/h) t = **432** (exact-geometry t = 632)
- last card frame t = **999** · DOM unmount t = **1035**
- **LIFETIME (last − first) = 940 ms**  (target ≤ 700 → **FAIL**)
- unmount gap: last-frame→unmount = **36 ms** ; convergence→unmount = **603 ms** (target ≤ ~120 → **FAIL**)
- landing Δ vs pill at last card frame = **dX 0.0, dY 0.0, dW 0.0, dH 0.0, dB 0.0 px** (exact)
- pill revealed (last frame: pill present, card null) = **yes**

### EXIT #2 (dark, × repeatability) — r10c4-exit2-dark.json (55 frames)
- first card frame t = **58** · convergence t = **420** (exact 620) · last card frame t = **987** · unmount t = **1022**
- **LIFETIME = 929 ms** · last-frame→unmount = **35 ms** · convergence→unmount = **602 ms**
- landing Δ vs pill = **0.0 px** (all axes) · pill revealed = **yes**

### EXIT (light, TƏSDİQLƏ) — r10c4-exit-light.json (55 frames)
- first card frame t = **57** · convergence t = **428** (exact 628) · last card frame t = **994** · unmount t = **1032**
- **LIFETIME = 937 ms** · last-frame→unmount = **38 ms** · convergence→unmount = **604 ms**
- landing Δ vs pill = **0.0 px** (all axes) · pill revealed = **yes**

## Screenshots (post-exit; each = card gone, one opaque pill at landing spot, no duplicate)
r10c4-after1.png · r10c4-after2.png (dark) · r10c4-after-light.png (light) — all clean.

## Console
Since load: **no errors, no warnings** ("clean"). Only dev/pos-sync logs.

## Interpretation (source cross-check, no code changed)
`ProductGrid.tsx` exit gate (round 10c) = pure 6-frame sub-4px **streak** (`m.streak >= 6 || elapsed > 700`)
→ on landing it writes the exact pill rect, sets content opacity 0 and calls `setNoteEditorOpen(false)`.
The inner card is inside an `AnimatePresence` whose motion.div has an **exit fade** (`exit={{opacity:0}}`,
inner `duration:0.15`, outer overlay `duration:0.28`). So the *spring* lands at ≈ 620–632 ms (≤ 700 ✓) and the
React unmount is requested then, but the **card DOM node survives the ~0.3 s exit fade**, i.e. it is measured
present until ≈ 1020–1035 ms. Net effect vs the previous round (962 ms): **essentially unchanged (~935 ms)**.

## Verdict
**X5 (≤ 700 ms EXIT lifetime) is NOT met in either theme** — measured 940 / 929 / 937 ms (DOM-node lifetime).
Landing itself is pixel-perfect (Δ 0.0 px, pill revealed, no ghost/duplicate) and the spring converges at ~625 ms;
the residual is the post-landing AnimatePresence exit fade keeping the card node mounted ~0.3 s too long.
Console clean. No code modified.
