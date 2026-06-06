# SAITO Premium POS/ERP Design System

**Philosophy**: Apple simplicity + Stripe polish + Linear precision + Notion clarity

## COLOR PALETTE

### Neutrals (90%)
- Background Primary: `#F8F9FB`
- Background Secondary: `#FFFFFF`
- Text Primary: `#111827`
- Text Secondary: `#6B7280`
- Text Muted: `#9CA3AF`
- Border: `#E5E7EB`
- Border Light: `#F3F4F6`
- Subtle: `#F9FAFB`

### Accent (8%)
- Primary Blue: `#2563EB`
- Primary Light: `#EFF6FF`
- Primary Hover: `#1D4ED8`

### Status (2%)
- Success: `#22C55E` (✓ green)
- Warning: `#F59E0B` (⚠ amber)
- Danger: `#EF4444` (✗ red)
- Info: `#3B82F6` (ℹ blue)

### Premium
- Luxury Gold: `#C6A969` (only for premium insights)

## TYPOGRAPHY

### Font Stack
`"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

### Scales
- **Display**: 32px / 40px (semibold) - Page titles
- **Heading 1**: 24px / 32px (semibold) - Section headers
- **Heading 2**: 20px / 28px (semibold) - Subsection headers
- **Heading 3**: 16px / 24px (semibold) - Card titles
- **Body Large**: 16px / 24px (regular) - Primary content
- **Body**: 14px / 22px (regular) - Standard content
- **Body Small**: 13px / 20px (regular) - Secondary content
- **Label**: 12px / 16px (medium) - Form labels, badges
- **Mono**: 13px / 20px (monospace) - Numbers, codes

### Font Weights
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

## SPACING

### Scale (8px base)
- `xs`: 4px
- `sm`: 8px
- `md`: 12px
- `lg`: 16px
- `xl`: 24px
- `2xl`: 32px
- `3xl`: 48px

### Layout Spacing
- Sidebar Width: 280px
- Header Height: 72px
- Card Radius: 18px
- Button Radius: 12px
- Modal Max Width: 640px
- Modal Radius: 24px
- Padding (inside cards): 24px
- Gap (between cards): 32px

## SHADOWS

### Elevation
- **None**: 0
- **Subtle**: `0 1px 2px rgba(17, 24, 39, 0.05)`
- **Small**: `0 1px 3px rgba(17, 24, 39, 0.1), 0 1px 2px rgba(17, 24, 39, 0.06)`
- **Medium**: `0 4px 6px rgba(17, 24, 39, 0.1), 0 2px 4px rgba(17, 24, 39, 0.06)`
- **Large**: `0 10px 15px rgba(17, 24, 39, 0.1), 0 4px 6px rgba(17, 24, 39, 0.05)`

## BORDERS & RADIUS

### Radius
- **sm**: 8px
- **md**: 12px
- **lg**: 18px
- **xl**: 24px

### Borders
- **Default**: 1px solid #E5E7EB
- **Light**: 1px solid #F3F4F6
- **Hover**: 1px solid #D1D5DB

## COMPONENTS

### BUTTONS

**Primary Button**
- Background: #2563EB
- Text: White
- Height: 44px
- Radius: 12px
- Hover: #1D4ED8
- Active: #1E40AF
- Focus: 2px ring #3B82F6

**Secondary Button**
- Background: White
- Border: 1px solid #E5E7EB
- Text: #111827
- Height: 44px
- Radius: 12px
- Hover: #F9FAFB

**Ghost Button**
- Background: Transparent
- Text: #111827
- Height: 44px
- Radius: 12px
- Hover: #F3F4F6

**Danger Button**
- Background: #EF4444
- Text: White
- Height: 44px
- Radius: 12px
- Hover: #DC2626

### INPUTS

- Height: 44px
- Radius: 12px
- Border: 1px solid #D1D5DB
- Focus: 2px ring #3B82F6
- Placeholder: #9CA3AF
- Label padding: 8px above input

### FORM FIELDS

- Label: 12px, #6B7280
- Helper text: 12px, #9CA3AF
- Error message: 12px, #EF4444
- Field spacing: 16px

### CARDS

- Radius: 18px
- Background: #FFFFFF
- Border: 1px solid #E5E7EB
- Padding: 24px
- Shadow: Subtle
- Gap between cards: 32px

### MODALS

- Max Width: 640px
- Radius: 24px
- Background: #FFFFFF
- Overlay: rgba(17,24,39,0.4)
- Header padding: 24px
- Content padding: 24px
- Footer padding: 24px
- Border-top footer: 1px solid #E5E7EB

### TABLES

- Row height: 48px
- Header background: #F9FAFB
- Header text: 12px, #6B7280
- Body text: 14px, #111827
- Border: 1px solid #E5E7EB
- Hover: #F9FAFB
- Selected: #EFF6FF
- Padding: 16px

### SIDEBAR

- Width: 280px
- Background: #FFFFFF
- Border-right: 1px solid #E5E7EB
- Menu item height: 44px
- Menu item radius: 12px
- Menu item padding: 0 12px
- Active indicator: 4px left #2563EB
- Default hover: #F3F4F6
- Active background: #EFF6FF

### HEADER

- Height: 72px
- Background: #FFFFFF
- Border-bottom: 1px solid #E5E7EB
- Padding: 0 24px
- Vertical center content

## ICONS

### Colors
- Default: #6B7280
- Hover: #374151
- Active/Selected: #2563EB
- Success: #22C55E
- Warning: #F59E0B
- Danger: #EF4444

### Sizes
- Small: 16px
- Standard: 20px
- Large: 24px
- XLarge: 32px

### Behavior
- Icons are ALWAYS monochrome by default
- Colors only on: active, selected, status indicators
- No random icon coloring

## ANIMATIONS

- **Duration**: 150-250ms
- **Timing**: cubic-bezier(0.4, 0, 0.2, 1)
- **Effects**: 
  - Subtle scale (0.98-1)
  - Subtle opacity (0.5-1)
  - No bouncing
  - No flashy transitions

## INTERACTIONS

- Hover: Subtle background change or border
- Active: Blue accent + slightly darker background
- Focus: 2px ring on inputs/buttons
- Disabled: 50% opacity
- Loading: Spinner (16px, monochrome)

## ACCESSIBILITY

- Minimum contrast ratio: 4.5:1
- Focus indicators: Always visible
- Touch targets: Minimum 44x44px
- ARIA labels on interactive elements
- Semantic HTML structure

## DARK MODE

- Background Primary: #0F172A
- Background Secondary: #1E293B
- Text Primary: #F1F5F9
- Text Secondary: #94A3B8
- Border: #334155
- All colors adjusted for dark theme

---

**Remember**: Every element must serve a purpose. Remove anything that doesn't help users complete tasks faster.
