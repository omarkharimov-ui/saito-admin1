# E2E verification — "Qeyd" note pill↔card morph exit handoff (round 10e, post-fix)

App: Next.js dev http://localhost:3000 · POS `/admin/pos` · MASA 14 · product "Filadelfiya Classic"
Method: continuous 60fps rAF sampler (`window.__r9`), real pointer clicks at element centers. No `document.getAnimations()` used.

## VERDICT: PASS (all 3 runs)
- Pre-fix bug (pill ghost 0.4/'' while open; exit crossfade 0.4 → 0.713 → 1.0 over 135ms) is GONE.
- Post-fix: no ghost while open (0 / '0'); exit pill opacity reaches 1.0 then stays FLAT at 1.0; card final rect == pill rect (Δ≈0).

## TARGET verification
| Run | Target matched | span "Qeyd:" count | pill rect at verify (x,y,w,h,b) | card z-[10003] before open |
|---|---|---|---|---|
| A dark | YES | 1 | 382.3, 689.4, 132.8, 38, 727.4 | 0 |
| B dark | YES | 1 | (open) pill = modal "Qeyd:" sibling | 0 |
| C light | YES | 1 | 382.3, 689.4, 132.9, 38, 727.4 (html class `... light`) | 0 |

Order-panel "Qeyd əlavə et" pill (bottom of right panel) was never touched.

## RUN A — DARK, cancel path
### NO-GHOST while open & settled (pill under dim backdrop)
| since card open | pill.opComp | pill.opInline |
|---|---|---|
| t+300ms | 0 | '0' |
| t+800ms | 0 | '0' |
| t+1200ms | 0 | '0' |
=> 0 / '0' — PASS (pre-fix was 0.4 / '').

### ENTRY (first card frame)
- Card born ON pill rect: card {x382.3, y689.4, w132.8, h38, b727.4, op '1'} == pill rect at arm (dx 0.0, dy 0.0, dw 0.0, dh 0.0).
- card.op = '1' from the first frame.
- pill.opComp frames 1..10 after card born: 1, 1, 0.739, 0.503, 0.334, 0.092, 0.034, 0.0035, 0, 0, 0 → quick fade to 0 under the card by ~frame 8 (~160ms). opInline stayed '0'.

### EXIT (cancel via card ×)
- Landing frame t = 26628 (first frame card=null). 
- card.op @ landing-5 = 0.0411041 ; @ landing-1 = 0.000908202.
- pill.opComp: landing-5 = 0.910239 | landing-1 = 1 | +1 = 1 | +3 = 1 | +10 = 1 | +30 = 1  → **1.0 FLAT from landing-1 onward**.
- Crossfade overlap point: pill.opComp first hits 1.0 at t=26594 (landing-2), where card.op = 0.00419733.
- Geometry Δ (card last rect vs pill rect at landing): dx 0.1, dy -0.1, dw 0, dh 0.

Last 12 frames before landing (t | card{w,h,b,op} | contentOp | pill{y,w,h,opComp,opInline}):
```
26433 | w148.0 h45.3 b720.5 op1        | 0 | y688.9 w132.9 h38 opComp0        opInline'0'
26445 | w144.5 h43.6 b721.5 op1        | 0 | y689.3 w132.9 h38 opComp0        opInline'0'
26462 | w141.7 h42.3 b722.7 op0.932628 | 0 | y689.4 w132.9 h38 opComp0        opInline'1'
26478 | w139.5 h41.2 b723.8 op0.636971 | 0 | y689.4 w132.9 h38 opComp0.260482 opInline'1'
26499 | w137.8 h40.4 b724.7 op0.275304 | 0 | y689.4 w132.9 h38 opComp0.481641 opInline'1'
26509 | w136.5 h39.8 b725.4 op0.139093 | 0 | y689.4 w132.9 h38 opComp0.675304 opInline'1'
26527 | w135.4 h39.2 b726.0 op0.075597 | 0 | y689.4 w132.9 h38 opComp0.818976 opInline'1'
26544 | w134.5 h38.8 b726.5 op0.041104 | 0 | y689.4 w132.9 h38 opComp0.910239 opInline'1'
26560 | w133.8 h38.5 b726.8 op0.022057 | 0 | y689.4 w132.9 h38 opComp0.966412 opInline'1'
26577 | w133.4 h38.3 b727.1 op0.010745 | 0 | y689.4 w132.9 h38 opComp0.996524 opInline'1'
26594 | w133.1 h38.1 b727.2 op0.004197 | 0 | y689.4 w132.9 h38 opComp1        opInline'1'
26611 | w132.9 h38.0 b727.3 op0.000908 | 0 | y689.4 w132.9 h38 opComp1        opInline'1'
[26628 landing: card=null | pill opComp1 opInline'1']
```

## RUN B — DARK, commit path (live relabel)
Note: the cart item note was **EMPTY** at start (pill read "Qeyd əlavə et"; textarea placeholder "Qeyd..."), NOT "test qeydi".
So typing " 2" produced note " 2" (rendered "2"), not "test qeydi 2".
- pill.w at arm-frame = 132.9 ("Qeyd əlavə et") → **live relabel while open to 59.1 ("2")** → pill.w at landing = 59.1 (the hidden pill relabels live). During the exit itself pill.w was constant (Δ=0).
- Landing t = 13063 ; card.op @ landing-5 = 0.0160169 ; @ landing-1 = '0'.
- pill.opComp: landing-5 = 0.900798 | -1 = 1 | +1 = 1 | +3 = 1 | +10 = 1 | +30 = 1 → **1.0 FLAT**.
- Geometry Δ: dx 0, dy 0, dw 0, dh 0.
- Crossfade overlap: pill.opComp first hits 1.0 at t=13030 (landing-2), card.op = 0.000127044.
- card.w single-frame jump > 30px during shrink: **YES** — several during the ease-out fast phase; max **64.9px** (262.0 → 197.1 @ t=12737, dt 18ms). This is the natural ease-out curve of the 420 → 59.1 width morph (~361px over ~250ms), not an isolated discontinuity; the pill width did not change during the exit, so it is not a relabel-induced jump.

## RUN C — LIGHT theme
- No-ghost while open: t+300 = 0/'0' ; t+800 = 0/'0' ; t+1200 = 0/'0' → PASS.
- Landing t = 14601 ; card.op @ landing-1 = '0' ; @ landing-5 = 0.0163624.
- pill.opComp: landing-5 = 0.918243 | -1 = 1 | +1 = 1 | +3 = 1 | +10 = 1 | +30 = 1 → **1.0 FLAT**.
- Geometry Δ: dx 0, dy 0, dw 0, dh 0.
- Crossfade overlap: pill.opComp first hits 1.0 at t=14568 (landing-2), card.op = 0.000253787.
- max card.w single-frame jump 56.1px (301.9 → 245.8 @ t=14276) — same ease-out character as dark.

## Console
- Messages captured: 0 total. Errors: 0. Warnings: 0. (JS exception log also empty.)

## Saved files (workspace-relative)
- r10e-fix-open-dark.png
- r10e-fix-exit-cancel.json
- r10e-fix-settled-dark.png
- r10e-fix-exit-commit.json
- r10e-fix-open-light.png
- r10e-fix-exit-light.json
- r10e-fix-settled-light.png

## Method notes / deviations
- The pill button (modal "Qeyd:" sibling) is routinely pruned from the fused ARIA tree because it is clipped/occluded by the sticky "YADDA SAXLA" footer (and, when the editor modal is open, the whole background is occluded by the z-[130] overlay). To obtain a ref for a REAL pointer click, the pill container was scrolled into center view and the button temporarily tagged with `aria-label="PILL_TRIGGER_X"` (a no-op that does not affect geometry or behaviour). Same technique used for the theme toggle. These temporary attributes were only for targeting.
- Theme toggle: modal had to be closed first (header was occluded by the modal overlay). Toggle title was "Aydın rejim" (didn't touch order-panel pill).
