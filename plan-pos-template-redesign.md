# Plan: POS-Template Redesign for Legacy Admin Pages

## Goal
Apply the POS page's iOS 18 Liquid Glass design system as a reusable template to all remaining legacy admin pages, keeping the backend frozen.

## POS Design Patterns to Extract as Template

### 1. Top Toolbar with Animated Pill Tabs
- `layoutId` for shared-element spring transitions between tabs
- `motion.div` with `layoutId="tab-pill"` for animated active indicator
- Spring config: `stiffness: 400, damping: 35, mass: 0.4`
- Icon + label pills with `active:scale-[0.95]` haptic feedback

### 2. Page Shell Structure
- Full-height flex column: `flex-1 min-h-0 w-full h-full flex flex-col`
- Theme-aware background: `bg-[var(--theme-bg)] text-[var(--theme-text)]`
- Padding: `p-6` for desktop content area
- `AnimatePresence mode="wait"` for view transitions

### 3. Card/Grid Layout
- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5`
- Each card wrapped in `motion.div` with:
  - `initial={{ opacity: 0, scale: 0.9 }}`
  - `animate={{ opacity: 1, scale: 1 }}`
  - `exit={{ opacity: 0, scale: 0.9 }}`
  - `transition={{ duration: 0.2 }}`

### 4. Glass Surfaces
- `rounded-[32px]` for premium cards
- `bg-[var(--theme-surface)]` or `bg-[var(--theme-nested)]`
- `border border-[var(--theme-border)]`
- `backdrop-blur-xl` for floating panels
- `shadow-xl` / `shadow-2xl` for depth

### 5. Status Badges
- Config-based: `Record<string, { bg, text, dot, border }>`
- `px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest`
- Live ping dot: `animate-pulse` for active states
- Ambient glow via `shadow-lg shadow-{color}/10`

### 6. Hover Actions
- Reveal on hover with `group-hover` transitions
- `blur-in` effect: `group-hover:backdrop-blur-sm`
- Stagger animation: `transition-delay` on children

### 7. Skeleton Loading
- Dedicated skeleton components per page
- `animate-pulse` on placeholder elements
- Light/dark mode aware colors

### 8. Modal/Bottom Sheet
- Fixed overlay: `fixed inset-0 z-[100] bg-black/40 backdrop-blur-md`
- Spring animation: `type: 'spring', stiffness: 400, damping: 35, mass: 0.9`
- Capsule container: `rounded-[3.5rem]`

### 9. Theme Tokens (Replace hardcoded values)
| Legacy | Modern Token |
|--------|-------------|
| `bg-[#080808]` | `bg-[var(--theme-bg)]` |
| `bg-[#0f0f0f]` | `bg-[var(--theme-surface)]` |
| `text-white` | `text-[var(--theme-text)]` |
| `text-white/40` | `text-[var(--theme-text-muted)]` |
| `bg-white/5` | `bg-[var(--theme-surface-soft)]` |
| `border-white/10` | `border-[var(--theme-border)]` |
| `bg-zinc-900` | `bg-[var(--theme-nested)]` |

### 10. Button Patterns
- Primary: `bg-gold text-black rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider`
- Secondary: `bg-white/5 border border-white/10 rounded-full`
- Active: `active:scale-[0.95] transition-all`
- Icon buttons: `w-8 h-8 rounded-full flex items-center justify-center`

## Pages to Redesign

### Priority 1: reservations
- **Current**: `bg-[#0f0f0f]`, hardcoded colors, `lightMode` ternaries everywhere, no `var(--theme-*)`
- **Target**: GlassCard-based layout, animated pill filters, spring transitions, theme tokens
- **Files**: `page.tsx`, `components/ReservationFilters.tsx`, `components/ReservationRow.tsx`, `components/ReservationModals.tsx`

### Priority 2: orders
- **Current**: Raw `text-white` literals, `bg-white/[0.03]`, no theme tokens
- **Target**: Grid cards with motion wrappers, animated status pills, glass surfaces
- **Files**: `page.tsx`, `components/OrderCard.tsx`, `components/OrderModal.tsx`, `components/ManualOrderModal.tsx`, `components/ReceiptModal.tsx`

### Priority 3: history
- **Current**: `bg-[#080808]`, ambient blobs, no theme tokens
- **Target**: Timeline with glass cards, animated entries, theme tokens
- **Files**: `page.tsx` (self-contained)

### Priority 4: waste-standards
- **Current**: `bg-[#080808]`, hardcoded table styles, mixed theme usage
- **Target**: GlassCard rows, animated inline edit, theme tokens
- **Files**: `page.tsx` (self-contained)

### Priority 5: kitchen-analytics
- **Current**: Mixed lightMode ternaries, minimal theme tokens
- **Target**: Stat cards with GlassCard, animated charts/bars, theme tokens
- **Files**: `page.tsx` (self-contained)

### Priority 6: kds
- **Current**: Delegates to `KDSView` component
- **Target**: Wrap with modern shell, apply theme tokens to KDSView
- **Files**: `page.tsx`, `components/KDSView.tsx`

### Bonus: dashboard YojiAdvice widget
- **Current**: Hardcoded `bg-[#1c1c1e]`
- **Target**: Replace with GlassCard

## Reusable Template Components to Create

### `admin/components/PosStyleTemplate.tsx`
Shared layout wrapper with:
- Animated toolbar
- Pill tab switcher (configurable tabs)
- Search/filter bar
- Grid container
- Skeleton wrapper

### `admin/components/StatusBadge.tsx`
Reusable status badge with config:
```tsx
<StatusBadge status="pending" config={STATUS_CONFIG} />
```

### `admin/components/AnimatedCard.tsx`
Motion-wrapped card with POS-style enter/exit:
```tsx
<AnimatedCard index={i}>
  <GlassCard>...</GlassCard>
</AnimatedCard>
```

## Execution Strategy

1. **Create template components** in `admin/components/`
2. **Redesign reservations** (most complex, most legacy)
3. **Redesign orders** (grid-based, good test for AnimatedCard)
4. **Redesign history** (timeline, simpler)
5. **Redesign waste-standards** (table rows)
6. **Redesign kitchen-analytics** (stats dashboard)
7. **Redesign kds** (wrap + KDSView cleanup)
8. **Fix dashboard widget**
9. **Run lint, typecheck, build**

## Constraints
- Backend frozen: no API/schema changes
- All changes uncommitted, local only
- Preserve all existing business logic and data fetching
- Maintain backward compatibility with existing components
