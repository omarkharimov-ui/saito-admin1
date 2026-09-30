# ROUND 6 (r10d) — "one clock" morph verification — rolling findings

Scope: verify the POS "Qeyd" pill<->card morph in http://localhost:3000 (active staff session).
Claim under test: entry = ONE 480ms cubic-bezier(0.32,0.72,0,1) glide with a fast committed start,
zero velocity at 480ms; exit = ONE 380ms glide back to the pill rest rect (pill + --vk-height).
Owner complaint: settle ("yerine oturması") used to be floaty/drifting.

Tab: tab-vtab-780962237 (SAITO Admin, /admin/pos) — reused, not re-opened.
Artifacts base: /Users/mr.apple/saito-admin1/artifacts/saito-admin/e2e-shots/

## Instrumentation notes (important)
- `browser_console`/`browser_screenshot` `savePath` REJECTS absolute paths outside the workspace
  ("[Save] Skipped: path outside workspace or invalid"). Saved workspace-relative under `e2e-shots/`
  and copied to the artifacts dir.
- The first sampling run included an animation watcher calling `document.getAnimations()` every frame.
  This forces full style recalc and caused 130-560ms main-thread stalls. Removed -> clean runs.
- Sampler + arms live in `sampler2.js` (verbatim __startSmp, arms without the anim watcher).
- Entry/exit are JS/rAF-driven (NOT CSS transitions/WAAPI): `document.getAnimations()` during the morph
  shows only opacity(120ms), backdrop animation(300ms), --vk-height(180ms) and scrollbar-color(200ms)
  transitions. The card box has no transition/animation entry -> main-thread jank directly stalls it.
- Dev-server (Next dev) main-thread stalls are common on entry (mounting card + 40-key VK + backdrop):
  measured stalls 125-140ms (dark) and 82ms (light). exit is usually smooth.
- `--vk-height` is NOT constant while the card opens: it animates 0 -> ~280px over 180ms
  cubic-bezier(0.2,0.8,0.2,1). The card's y is anchored to it, so raw page-coordinate displacement
  conflates the morph with the keyboard rise. A vk-relative measure (card.y - kb.y) is reported too.

## Completed
- [1/4] ENTRY dark: e2e-shots/r10d-entry-dark.json (janky) + r10d-entry-dark2.json (clean, warm run = primary)
- [2/4] EXIT dark: e2e-shots/r10d-exit-dark.json (clean, 145 frames, no stall)
- [3/4] ENTRY/EXIT light (DOM-forced theme, geometry valid): r10d-entry-light.json, r10d-exit-light.json
- CONSOLE: errors = none, warnings = none -> clean
- Screenshots so far: r10d-lx3.png (light after-exit), r10d-light-state.png (true light floor)
- Theme: real light mode = localStorage saito_light_mode=true (reload applied). True light POS layout
  puts the Qeyd pill at x=1027 (task's x<700 filter does not match that layout).

## Remaining
- Light: re-run entry + exit in TRUE light render (pill at x=1027) + screenshots le2/lx3
- Dark: settled entry + mid-flight screenshots + after-exit
- Final A-G verdict table + one-paragraph verdict

## Blocker / caveat
- Screenshot tool round-trip (~1-3s) exceeds the 480ms animation, so exact-time (~60/200/400ms) painted
  frames are not directly capturable; JSON frame data (16-17ms resolution) is the primary evidence.
