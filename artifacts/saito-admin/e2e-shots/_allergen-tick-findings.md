# Diagnostic: POS product modal — "Allergenlər:" section + tick (✓) mark

App: http://localhost:3000/admin/pos (dev, auto session). Table under test: **Masa 98** only.
Masa 1 never touched. "MƏTBƏXƏ GÖNDƏR" never clicked. Cart left as found (no committed lines).

## Flow note (deviation from task assumption)
Clicking the product card **"Filadelfiya Classic"** does NOT open an editor modal — it adds the
product to the cart as an unsaved draft line. The editor modal containing the `ALLERGENLƏR:`
section is opened from the **cart line's "Ətraflı"** button. Allergen state is draft-only and is
discarded on close (verified).

## Defects found

### 1. Tick has NO transition — it snaps, it does not draw or fade  (primary defect)
* Chip class: `[transition:background-color_0.2s_ease,border-color_0.2s_ease,color_0.2s_ease]`
  → only background/border/text colour animate (0.2 s).
* Tick markup (inside each chip, after the label):
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0">
     <path d="M4 12.5 L9.5 18 L20 6.5" stroke="currentColor" stroke-width="3.4"
           stroke-linecap="round" stroke-linejoin="round" opacity="0"
           pathLength="1" stroke-dashoffset="0" stroke-dasharray="0 1"/></svg>`
* Computed transition on both the tick `<svg>` and its `<path>`: **`all 0s`** → zero animation.
* On SELECT the tick pops to `opacity="1"` / `stroke-dasharray="1 1"` **instantly**, while the
  chip's red background/border/text are still 0.2 s mid-fade → the ✓ appears before the chip
  finishes turning red.
* On UNSELECT the tick vanishes **instantly** while the red fades out → **no fade-out**.
* `pathLength` / `stroke-dasharray` / `stroke-dashoffset` are present (a "draw the checkmark"
  rig) but nothing is wired to them → dead code; the rig never animates.

### 2. Tick is hidden by two overlapping mechanisms
`opacity` (0↔1) **and** `stroke-dasharray` (`"0 1"` ↔ `"1 1"`) are both toggled.
Two redundant hide paths, neither transitioned → guaranteed hard snap in both directions.

### 3. Allergen chips do not match the sibling chip style
| | allergen chip | MƏRHƏLƏ / SERVINQ chip |
|---|---|---|
| height (measured) | **38 px** (`min-h-[38px]`) | **34 px** (`px-4 py-2`) |
| unselected bg (light) | `bg-zinc-100` (solid grey) | `bg-white/60` |
| border | `border-zinc-200` | `border-zinc-200` |
| text | `text-xs font-bold text-zinc-500` | `text-xs font-bold text-zinc-500` |
| dark unselected | `bg-white/5 border-white/10 text-white/50` | no equivalent dark treatment |
Both are `rounded-full`, but the allergen chips are **4 px taller and visibly greyer/chunkier**,
and they carry an icon the modifier chips don't have. Visually they read as a different control.

### 4. Tick slot is permanently reserved (chips look empty on the right when off)
The 14 px tick `<svg>` is always in the layout (only its opacity/dasharray change) plus a 6 px
`gap-1.5`. So an **unselected** chip carries 20 px of dead space on the right:
left inset 16 px (padding) vs effective right inset ≈ 36 px. The icon+label block therefore sits
left-of-centre and the chip looks unbalanced/"missing something" until it is ticked.
No layout shift occurs on toggle — chip widths stay constant (Balıq 104 px, Süd 96 px, Küncüt 116 px).

## Verified correct behaviour
* **SELECT** → chip turns red: computed bg `oklab(0.637 0.214 0.101 / 0.15)` (= `bg-red-500/15`),
  border `red-500/60`, text `lab(55.48 75.07 48.85)` (red-500). Tick renders on the **RIGHT**,
  `stroke: currentColor` (red), 14×14, vertically centred, right inset 17 px (= 16 px padding + 1 px
  border). No text overlap, no clipping, no stray tick on other chips.
* Same result in **dark** theme (`text-red-500` is not overridden in dark).
* **UNSELECT** → red state clears fully and the tick disappears.
* **Persistence**: left "Süd" selected → closed modal via × (no save) → reopened via "Ətraflı" →
  `anySelected: false`. **Selection does NOT persist.** Correct.
* **Console**: 0 error-level messages, 0 JS exceptions during all toggling (light + dark).

## Artifacts (all verified on disk, 1568×925, true PNG)
insp-allergen-light-before.png, insp-allergen-light-on.png, insp-allergen-light-two.png,
insp-allergen-light-off.png, insp-allergen-dark-on.png, insp-allergen-dark-off.png,
insp-allergen-reopen.png
zoom crops: zoom-light-before/on/two/off.png, zoom-dark-on.png, z8-light-before-chip.png,
z8-light-on-chip.png, z8-dark-on-chip.png, z4-dark-off-row.png,
cmp-light-before-modifiers-vs-allergen.png, cmp-dark-modifiers-vs-allergen.png
