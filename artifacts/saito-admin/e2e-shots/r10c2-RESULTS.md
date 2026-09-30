# ROUND-2 (v2) POS "Qeyd" pill <-> card morph — browser measurement record

Run: 2026-09-30, http://localhost:3000/admin/pos, Masa 98, Filadelfiya Classic line (qty 3), viewport 1470x867 CSS px
Instrument: window.__startSmp() (rAF sampler, 1700 ms window) — see task spec. Light-theme entry/exit re-run with __startSmp.
Entry/exit clicks were synced by arming the sampler on the next capture-phase `pointerdown`, so t=0 == the real click.

## DARK THEME

### ENTRY (click pill -> card) — r10c2-entry-dark.json (104 frames)
| t(ms) | pill.b | card y | card h | card b | card w | kb.y |
|---|---|---|---|---|---|---|
| 12  | 727.4 | -     | -     | -     | -     | -     |
| 148 | 727.2 | 689.4 | 38.0  | 727.3 | 132.7 | 986.5 |
| 181 | 727.2 | 688.1 | 39.1  | 727.2 | 135.1 | 861.5 |
| 292 | 727.2 | 618.4 | 108.8 | 727.2 | 279.0 | 838.9 |
| 298 | 589.7 | 448.6 | 128.2 | 576.9 | 319.3 | 590.9 |
| 344 | 587.3 | 433.9 | 138.7 | 572.6 | 340.9 | 586.6 |
| 452 | 586.9 | 405.5 | 166.9 | 572.4 | 399.2 | 586.4 |
| 705 | 586.9 | 395.6 | 176.9 | 572.5 | 419.7 | 586.5 |
| 1705| 586.9 | 395.5 | 177.0 | 572.5 | 420.0 | 586.5 |

### EXIT (click TƏSDİQLƏ -> pill) — r10c2-exit-dark.json (52 frames)
| t | pill.b | card y | card h | card b | card w | kb.y |
|---|---|---|---|---|---|---|
| 13  | 586.9 | 325.9 | 246.6 | 572.5 | 420.0 | 586.5 |
| 47  | 586.9 | 444.7 | 135.5 | 580.1 | 362.5 | 586.5 |
| 103 | 586.9 | 451.7 | 128.9 | 580.6 | 359.1 | 597.9 |
| 121 | 679.9 | 550.1 | 83.2  | 633.3 | 335.4 | 652.9 |
| 192 | 722.1 | 623.0 | 58.8  | 681.8 | 322.8 | 771.1 |
| 254 | 727.3 | 659.2 | 47.5  | 706.7 | 316.9 | 923.7 |
| 346 | 727.4 | 679.3 | 41.4  | 720.7 | 313.8 | null  |
| 746 | 727.4 | 689.4 | 38.0  | 727.4 | 312.0 | null  |
| 1081| 727.4 | 689.4 | 38.0  | 727.4 | 312.0 | null  | (last card frame)
| 1113| 727.4 | null  |       |       |       |       |

## LIGHT THEME (same modal re-opened with the committed note on the pill)

### ENTRY — r10c2-entry-light.json (52 frames)
| t | pill.b | card y | card h | card b | card w | kb.y | card.b-(kb.y+2) |
|---|---|---|---|---|---|---|---|
| 71  | 727.4 | 689.4 | 38.0  | 727.4 | 312.0 | 861.5 | -136.1 |
| 74  | 727.4 | 688.2 | 39.2  | 727.4 | 312.9 | 844.5 | -119.1 |
| 104 | 727.4 | 618.6 | 108.8 | 727.4 | 367.0 | 700.3 | +27.1  <-- OCCLUSION |
| 146 | 727.4 | 569.6 | 116.7 | 686.3 | 373.1 | 613.6 | +72.7  <-- OCCLUSION |
| 152 | 634.4 | 454.0 | 145.6 | 599.6 | 395.6 | 607.7 | -10.1  |
| 183 | 602.4 | 443.2 | 150.5 | 593.7 | 399.4 | 591.1 | +2.6   <-- OCCLUSION |
| 250 | 588.2 | 407.4 | 165.3 | 572.8 | 410.9 | 586.5 | -15.7  |
| 715 | 586.9 | 395.5 | 177.0 | 572.5 | 420.0 | 586.5 | -16.0  |

### EXIT — r10c2-exit-light.json (46 frames)
| t | pill.b | card y | card h | card b | card w | kb.y |
|---|---|---|---|---|---|---|
| 107 | 586.9 | 477.2 | 103.0 | 580.1 | 362.5 | 586.5 |
| 221 | 586.9 | 482.0 | 98.6  | 580.6 | 359.1 | 656.5 |
| 337 | 586.9 | 515.6 | 68.1  | 583.8 | 335.4 | 668.0 |
| 354 | 722.0 | 591.6 | 64.5  | 656.1 | 332.6 | 932.5 |
| 429 | 727.3 | 644.8 | 49.6  | 694.5 | 321.0 | null  |
| 728 | 727.4 | 689.4 | 38.0  | 727.4 | 312.0 | null  |
| 1061| 727.4 | 689.4 | 38.0  | 727.4 | 312.0 | null  | (last card frame)
| 1097| 727.4 | null  |       |       |       |       |

## GROWN (idle tracking, dark) — r10c2-grown2-dark-frames.json
text 248 chars -> card h 177 -> 188 -> 197.6 -> 211 -> 222.6 -> 235.5 -> 246.6 (3 smooth row-bursts),
card y 395.5 -> 325.9 (top lifted), card b constant 572.5 == kb.y-14 all the way; max(card.b-(kb.y+2)) = -16.0.

## CONSOLE
No errors, no warnings. Only dev logs: "[Fast Refresh] rebuilding / done in 710ms" @12:51:59Z and
"[pos-sync] debounced refetch poll" / "refetch start poll gen=137..140" (3 s cadence).
