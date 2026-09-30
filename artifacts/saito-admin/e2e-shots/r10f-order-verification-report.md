# r10f — Order-panel "Qeyd əlavə et" pill↔card morph — E2E verification

Env: Next.js dev server http://localhost:3000, POS `/admin/pos`, MASA 14, Filadelfiya Classic in cart (1 Nəfar, CƏMI 14.00 ₼).
Viewport 1440×900. rAF sampler armed/reset before each interaction (`r10f-sampler.js`); no `document.getAnimations()`.
Pointer clicks were real element-center clicks via the browser driver.

## 0. Pre-conditions / environment notes
- Page arrived with a leftover, **inert** "Kart terminalı" payment-simulator modal in the DOM
  (`div[role=dialog]`, inline `z-index:120`, backdrop `opacity:0`, container `pointer-events:none`).
  It contains a second "Ləğv et" button. It never intercepted clicks (pe:none) and is pre-existing app state, not a regression.
- Theme on arrival was **LIGHT** (`<html class="... light">`). Toggled to DARK for RUN A/B/C, back to LIGHT for RUN D
  via the header/right-panel sun-moon button ("Mövzu dəyiş").
- The virtual keyboard (`[data-vk-panel]`, `--vk-height: 281px`) is **not mounted until the card opens**;
  kbTop is measured at **619.5 px** once settled.
- **Ref-id caveat:** the fused ref table re-uses/re-assigns ids across DOM changes
  (e.g. `e69` = cart "LƏĞV ET" when the card is closed, and also shown for the card's "LƏĞV ET" when it is open).
  For RUN C the card's discard button was therefore force-tagged with a unique `aria-label`
  (temporary; removed afterwards) so the clicked ref was provably the card's, not the cart's. Verified in the snapshot as
  `button "R10F_DISCARD" [ref=e229]`, sibling of `button "TƏSDIQLƏ" [ref=e230]` in the card portal group.

## 1. TARGET verification (per run)
Card selector: `div.className.includes('z-[10003]')`. Exactly **1** such node in every run.

| Run | theme / close | card header | sub-header | className contains `z-[10003]` | product-editor card ("Məhsul qeydi")? |
|---|---|---|---|---|---|
| A | dark / × | **"Sifariş qeydi"** | "kitchen + receipt-ə düşür" | **YES** | NO |
| B | dark / Təsdiqlə | "Sifariş qeydi" | "kitchen + receipt-ə düşür" | **YES** | NO |
| C | dark / Ləğv et | "Sifariş qeydi" | "kitchen + receipt-ə düşür" | **YES** | NO |
| D | light / × | **"Sifariş qeydi"** | "kitchen + receipt-ə düşür" | **YES** | NO |

RUN A full className: `fixed z-[10003] overflow-hidden border shadow-elevated backdrop-blur-xl bg-[#1D1D24]/97 border-white/12`
RUN D card text: `SIFARIŞ QEYDI / KITCHEN + RECEIPT-Ə DÜŞÜR` → correct order-panel card. **Correct target in all 4 runs.**

## 2. ENTRY (RUN A)
| metric | value |
|---|---|
| first card frame t | **3027 ms** (prev frame t=2988 had `card=null`; birth happened inside a ~39 ms gap) |
| birth card rect | x=997.0 y=742.0 w=122.9 h=34.0 b=776.0 |
| pill rect at birth | x=997.0 y=742.0 w=122.9 h=34.0 b=776.0 |
| **Δ at birth** | **Δx=0.0, Δy=0.0, Δw=0.0, Δh=0.0** (Δ<2px ✅ — card is born exactly on the pill) |
| birth state | `card.op="1"`, `contentOp="0"` (inner content hidden at birth), `pill.opInline="0"` |
| card.b vs kbTop at settle | b=**605.5** vs kbTop=**619.5** → **kbTop − 14.0 px exactly** (target ±1 ✅) |
| card leading the kb during rise | **NOT fully satisfied — 2 violating frames** (see below) |
| kb-mount | `[data-vk-panel]` absent for the first 1032 frames; rise measured only after mount |

Rise violations (frames where `card.b > kbTop`):
- t=3146 ms → card.b=745.9, kbTop=650.0 → **+95.9 px**
- t=3168 ms → card.b=636.0, kbTop=633.3 → **+2.7 px**

Cause: the keyboard's top edge jumps 833.9 → 650.0 px between t=3141 and t=3146 while the card bottom only moves
761.9 → 745.9 px, so the card is briefly behind the rising keyboard. From t≈3200 onward the card leads again
(t=3231 b=606.0 vs kb=619.4) and the 14 px gap holds exactly at settle.

## 3. NO-GHOST while open — pill opacity (RUN A and RUN D)
Pill opacity sampled relative to the **card birth** frame (t_birth), not to arm time:

| t (vs birth) | RUN A `opComp` | RUN A `opInline` | RUN D `opComp` | RUN D `opInline` |
|---|---|---|---|---|
| +300 ms | **0** | **"0"** | **0** | **"0"** |
| +800 ms | **0** | **"0"** | **0** | **"0"** |
| +1200 ms | **0** | **"0"** | **0** | **"0"** |

Pill stays `opComp=0` / `opInline="0"` for the whole open state (also verified on the very last open frame of every run).
**No ghost.** Same-frame race note: on the single birth frame the read was `opComp=1` with `opInline="0"`
(inline style committed in the same frame); by +50 ms it is 0.74 and 0 from +200 ms on — the card already covers the pill rect at t_birth, so nothing is visible.

## 4. EXIT — per run
### 4.1 RUN A — cancel via × (dark)
(a) last 12 frames before `card=null` — `k | t | card{y,w,h,b,op,co} | pill{y,w,h,opComp,opInline} | kbTop`
```
-12 | 92773 | 722.3,138.4,44.8,767.1,1      ,0 | 742,122.9,34,0         ,"0" | 953.1
-11 | 92790 | 726.8,134.8,42.3,769.1,1      ,0 | 742,122.9,34,0         ,"0" | 974.9
-10 | 92806 | 730.4,132.0,40.3,770.8,1      ,0 | 742,122.9,34,0         ,"0" | 999.2
 -9 | 92819 | 733.3,129.7,38.8,772.1,0.95582,0 | 742,122.9,34,0         ,"1" | 1005.7
 -8 | 92838 | 735.3,128.1,37.6,773.0,0.67575,0 | 742,122.9,34,0.289846  ,"1" | 1014.5
 -7 | 92853 | 737.4,126.5,36.5,773.9,0.24344,0 | 742,122.9,34,0.497569  ,"1" | 1019.5
 -6 | 92871 | 738.7,125.5,35.8,774.5,0.12152,0 | 742,122.9,34,0.702166  ,"1" | null
 -5 | 92888 | 739.9,124.5,35.1,775.0,0.05844,0 | 742,122.9,34,0.832130  ,"1" | null
 -4 | 92905 | 740.7,123.9,34.7,775.4,0.02995,0 | 742,122.9,34,0.917908  ,"1" | null
 -3 | 92921 | 741.3,123.4,34.4,775.7,0.01415,0 | 742,122.9,34,0.971115  ,"1" | null
 -2 | 92938 | 741.7,123.1,34.1,775.9,0.00535,0 | 742,122.9,34,0.998606  ,"1" | null
 -1 | 92955 | 741.9,122.9,34.0,776.0,0.00113,0 | 742,122.9,34,1.000000  ,"1" | null
```
(b) landing frame t = **92972** (first frame with `card=null`)
(c) `card.op` at landing−5 = **0.0584**, at landing−1 = **0.00113**
(d) `pill.opComp` at landing−5/**−1**/+1/+3/+10/+30 = **0.83213 / 1 / 1 / 1 / 1 / 1 → FLAT 1.0, no late fade ✅**
(e) geometry Δ card-last vs pill-at-landing = **dx −0.1, dy −0.1, dw 0, dh 0** ✅
(f) exit lifetime t0→landing = **339 ms** (shrink start t=92633 → 92972). Opacity-only portion = 153 ms.
(g) `pill.opComp` first reaches **1.0 at k = −1** (t=92955) where `card.op = 0.00113` → crossfade overlap is minimal
    (pill completes one frame before the card unmounts; card is already visually gone).

### 4.2 RUN B — commit via Təsdiqlə with text (dark)
(a)
```
-12 | 12123 | 728.1,120.5,41.6,769.7,1      ,0 | 742,109.1,34,0         ,"0" | 947.6
-11 | 12138 | 731.1,118.1,40.0,771.1,1      ,0 | 742,109.1,34,0         ,"0" | 976.4
-10 | 12149 | 733.8,115.9,38.5,772.3,0.89705,0 | 742,109.1,34,0         ,"1" | 995.9
 -9 | 12166 | 736.2,113.9,37.2,773.4,0.47902,0 | 742,109.1,34,0         ,"1" | 1006.5
 -8 | 12182 | 737.8,112.6,36.3,774.1,0.19244,0 | 742,109.1,34,0.244066  ,"1" | 1016.7
 -7 | 12200 | 739.2,111.4,35.5,774.7,0.08966,0 | 742,109.1,34,0.497672  ,"1" | null
 -6 | 12216 | 740.2,110.6,35.0,775.2,0.04682,0 | 742,109.1,34,0.685305  ,"1" | null
 -5 | 12231 | 740.9,110.1,34.6,775.5,0.02573,0 | 742,109.1,34,0.806274  ,"1" | null
 -4 | 12250 | 741.5,109.6,34.3,775.8,0.01062,0 | 742,109.1,34,0.909517  ,"1" | null
 -3 | 12264 | 741.8,109.3,34.1,775.9,0.00408,0 | 742,109.1,34,0.961518  ,"1" | null
 -2 | 12293 | 742.0,109.2,34.0,776.0,0.00046,0 | 742,109.1,34,0.996562  ,"1" | null
 -1 | 12297 | 742.0,109.1,34.0,776.0,0      ,0 | 742,109.1,34,1.000000  ,"1" | null
```
(b) landing t = **12313**
(c) `card.op` −5 = **0.02573**, −1 = **0**
(d) `pill.opComp` −5/−1/+1/+3/+10/+30 = **0.806274 / 1 / 1 / 1 / 1 / 1 → FLAT ✅**
(e) geometry Δ = **0, 0, 0, 0** ✅
(f) lifetime = **385 ms** (t=11928 → 12313); fade 164 ms
(g) pill reaches 1.0 at k=−1, `card.op = 0` (card fully invisible)

### 4.3 RUN C — discard via Ləğv et (dark)
(a)
```
-12 | 14943 | 728.3,120.4,41.5,769.8,1      ,0 | 742,109.1,34,0         ,"0" | 965.5
-11 | 14959 | 731.6,117.7,39.7,771.3,1      ,0 | 742,109.1,34,0         ,"0" | 990.0
-10 | 14974 | 734.3,115.5,38.2,772.5,0.84587,0 | 742,109.1,34,0         ,"1" | 1006.5
 -9 | 14985 | 736.3,113.8,37.1,773.4,0.45152,0 | 742,109.1,34,0         ,"1" | 1015.9
 -8 | 15002 | 738.0,112.4,36.2,774.2,0.17388,0 | 742,109.1,34,0.260682  ,"1" | 1019.1
 -7 | 15017 | 739.2,111.5,35.5,774.7,0.09182,0 | 742,109.1,34,0.476550  ,"1" | null
 -6 | 15035 | 740.3,110.6,35.0,775.2,0.04519,0 | 742,109.1,34,0.684153  ,"1" | null
 -5 | 15052 | 741.0,110.0,34.5,775.5,0.02268,0 | 742,109.1,34,0.819062  ,"1" | null
 -4 | 15069 | 741.5,109.6,34.3,775.8,0.01000,0 | 742,109.1,34,0.909864  ,"1" | null
 -3 | 15085 | 741.8,109.3,34.1,775.9,0.00323,0 | 742,109.1,34,0.966445  ,"1" | null
 -2 | 15102 | 742.0,109.2,34.0,776.0,0.00037,0 | 742,109.1,34,0.996539  ,"1" | null
 -1 | 15119 | 742.0,109.1,34.0,776.0,0      ,0 | 742,109.1,34,1.000000  ,"1" | null
```
(b) landing t = **15134**
(c) `card.op` −5 = **0.0226834**, −1 = **0**
(d) `pill.opComp` −5/−1/+1/+3/+10/+30 = **0.819062 / 1 / 1 / 1 / 1 / 1 → FLAT ✅**
(e) geometry Δ = **0, 0, 0, 0** ✅
(f) lifetime = **386 ms** (t=14748 → 15134); fade 160 ms
(g) pill reaches 1.0 at k=−1, `card.op = 0`

### 4.4 RUN D — cancel via × (light)
(a)
```
-12 | 11785 | 729.0,119.8,41.1,770.1,1      ,0 | 742,109.1,34,0         ,"0" | 960.4
-11 | 11800 | 731.8,117.5,39.6,771.4,1      ,0 | 742,109.1,34,0         ,"0" | 985.0
-10 | 11813 | 734.7,115.2,38.0,772.7,0.78655,0 | 742,109.1,34,0         ,"1" | 1002.1
 -9 | 11828 | 736.7,113.5,36.9,773.6,0.37407,0 | 742,109.1,34,0         ,"1" | 1012.3
 -8 | 11845 | 738.2,112.2,36.1,774.3,0.15216,0 | 742,109.1,34,0.258211  ,"1" | 1018.5
 -7 | 11862 | 739.5,111.2,35.4,774.9,0.07695,0 | 742,109.1,34,0.495337  ,"1" | null
 -6 | 11879 | 740.4,110.5,34.9,775.3,0.03998,0 | 742,109.1,34,0.684528  ,"1" | null
 -5 | 11895 | 741.1,109.9,34.5,775.6,0.01974,0 | 742,109.1,34,0.819322  ,"1" | null
 -4 | 11912 | 741.6,109.5,34.2,775.8,0.00837,0 | 742,109.1,34,0.910032  ,"1" | null
 -3 | 11929 | 741.9,109.3,34.1,775.9,0.00247,0 | 742,109.1,34,0.966290  ,"1" | null
 -2 | 11945 | 742.0,109.2,34.0,776.0,0.00016,0 | 742,109.1,34,0.996584  ,"1" | null
 -1 | 11962 | 742.0,109.1,34.0,776.0,0      ,0 | 742,109.1,34,1.000000  ,"1" | null
```
(b) landing t = **11976**
(c) `card.op` −5 = **0.0197421**, −1 = **0**
(d) `pill.opComp` −5/−1/+1/+3/+10/+30 = **0.819322 / 1 / 1 / 1 / 1 / 1 → FLAT ✅**
(e) geometry Δ = **0, 0, 0, 0** ✅
(f) lifetime = **393 ms** (t=11583 → 11976); fade 163 ms
(g) pill reaches 1.0 at k=−1, `card.op = 0`

### 4.5 Exit cross-run summary
| Run | lifetime (width-start→landing) | fade-only | geo Δ | pill.opComp flat 1.0 | ghost |
|---|---|---|---|---|---|
| A cancel dark | 339 ms | 153 ms | (−0.1,−0.1,0,0) | ✅ −1…+30 | none |
| B commit dark | **385 ms** | 164 ms | (0,0,0,0) | ✅ −1…+30 | none |
| C discard dark | **386 ms** | 160 ms | (0,0,0,0) | ✅ −1…+30 | none |
| D cancel light | **393 ms** | 163 ms | (0,0,0,0) | ✅ −1…+30 | none |

All four exits land within ~0.1 px of the pill, pill opacity is flat 1.0 from landing−1 onward (no late fade),
and the pill is invisible (opComp 0 / inline "0") throughout the open state.

## 5. RUN B specifics (pill relabel + width jumps)
- `pill.w` / text during open: **122.9 px / "Qeyd əlavə et"** for 187 frames (note empty) → **109.1 px / "acı olmasın"** after typing (551 frames).
- `pill.w` at landing: **109.1** with text **"acı olmasın"** ✅ (relabel survives the morph).
- Single-frame `card.w` jumps **> 30 px during shrink: YES — 5 events** (identical to RUN A/C/D):
  −30.8 @11939, −43.2 @11966, −49.5 @11979, **−54.1 @12002**, −41.7 @12020.
  These are discrete ~40–55 px width steps during the collapse (the card shrink is stepping, not smooth per-frame),
  yet the landing geometry is still pixel-exact. Entry also steps: +45.4 @3081, +31.1 @3141, +36.7 @3146, **+109.7 @3168**.

## 6. RUN C specifics (discard semantics)
| stage | pill.text | pill.w |
|---|---|---|
| before open | **"acı olmasın"** | 109.1 |
| during open, after appending " XX" | **"acı olmasın XX"** | 127.6 |
| after settle (post-discard) | **"acı olmasın"** ✅ reverted | 109.1 |

Discard correctly reverts to the pre-open committed value; the appended " XX" was not persisted.

## 7. Console
- `browser_console level=error` → **0 messages**
- `browser_console level=warn` → **0 messages**
- No JS exceptions captured (`browser_utility errors` not needed; HMR compile errors absent).

## 8. Verdict
| check | result |
|---|---|
| correct card in all 4 runs (header "Sifariş qeydi", `z-[10003]`, not product editor) | ✅ |
| ENTRY born exactly on pill rect (Δ<2px) | ✅ Δ=0,0,0,0 @ t=3027 ms |
| settle at kbTop−14 ±1 px | ✅ 605.5 vs 619.5 = exactly 14.0 |
| card leads kb during rise | ⚠️ **2 frames violate** (+95.9 px @3146, +2.7 px @3168) |
| no ghost while open (300/800/1200 ms) | ✅ opComp 0, opInline "0" (RUN A & D) |
| landing geometry pixel-exact | ✅ all runs (≤0.1 px) |
| pill opacity flat 1.0 after landing (no late fade) | ✅ all runs |
| exit lifetime ≈380 ms | ✅ 339/385/386/393 ms |
| commit (Təsdiqlə) persists + live relabel | ✅ |
| discard (Ləğv et) reverts | ✅ |
| console errors/warnings | ✅ 0 / 0 |

**Status: PASS with one minor deviation (2 rise frames where the card bottom is behind the rising keyboard).**

## 9. Saved artifacts (workspace-relative)
- `r10f-open-dark.png` — RUN A, card open, dark
- `r10f-settled-dark.png` — RUN A settled, dark
- `r10f-exit-cancel-dark.json` — RUN A frames (6417)
- `r10f-exit-commit-dark.json` — RUN B frames (963)
- `r10f-exit-discard-dark.json` — RUN C frames (1208)
- `r10f-open-light.png` — RUN D, card open, light
- `r10f-settled-light.png` — RUN D settled, light
- `r10f-exit-light.json` — RUN D frames (1022)
- `r10f-entry-A.json`, `r10f-entry-A-fixed.json` — RUN A entry analysis snapshots
- scripts: `r10f-sampler.js`, `r10f-analyze.js`, `r10f-analyze2.js`, `r10f-analyze3.js`, `r10f-stop-save.js`, `r10f-report.js`
