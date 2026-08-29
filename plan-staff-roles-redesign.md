# Plan: POS-Template Redesign — Staff & Roles Pages Only

## Goal
Apply the POS page's iOS 18 Liquid Glass design system to the Staff and Roles admin pages only, keeping all backend and business logic frozen.

## Scope
- `app/admin/staff/page.tsx` — Main TEAM page (staff rows + shifts tab)
- `app/admin/staff/roles/page.tsx` — Roles permission matrix
- `app/admin/staff/[id]/page.tsx` — Staff detail/profile page
- `lib/staff-utils.ts` — Centralize duplicated `ROLE_COLORS` / `ACTION_LABELS`

## Key Discoveries

### 1. Duplicated `ROLE_COLORS`
- `staff/page.tsx:29-41` defines its own `ROLE_COLORS` with `glow` field
- `staff/roles/page.tsx:27-39` defines its own `ROLE_COLORS` without `glow`
- `staff/[id]/page.tsx:47-59` defines its own `ROLE_COLORS` with `glow`
- `lib/staff-utils.ts:73-85` already exports `ROLE_COLORS` (without `glow`) and `getRoleColor()` — **pages don't import it**

### 2. Legacy color patterns still in use
| Legacy | Theme Token |
|--------|-------------|
| `bg-white/[0.02]` | `bg-[var(--theme-surface-soft)]` |
| `bg-white/[0.03]` | `bg-[var(--theme-surface-soft)]` |
| `bg-white/[0.04]` | `bg-[var(--theme-surface-soft)]` |
| `bg-white/[0.05]` | `bg-[var(--theme-surface-soft)]` |
| `bg-white/[0.06]` | `bg-[var(--theme-surface-soft)]` |
| `text-white/20` | `text-[var(--theme-text-muted)]` |
| `text-white/30` | `text-[var(--theme-text-muted)]` |
| `text-white/40` | `text-[var(--theme-text-muted)]` |
| `text-white/50` | `text-[var(--theme-text-secondary)]` |
| `border-white/[0.04]` | `border-[var(--theme-border)]` |
| `border-white/[0.06]` | `border-[var(--theme-border)]` |
| `border-white/[0.08]` | `border-[var(--theme-border)]` |
| `border-white/[0.12]` | `border-[var(--theme-border-strong)]` |
| `border-emerald-500/20` | `border-[var(--theme-border)]` + `bg-[var(--theme-success-soft)]` |
| `shadow-[0_0_16px_rgba(...)]` glow | Remove — use `shadow-lg` + surface tokens instead |

### 3. Already modernized (no changes needed)
- `staff/shifts/page.tsx` — Uses `--theme-surface-muted`/`-border` tokens heavily, `GoldSelect`, `EmptyState` from primitives. Skip.
- `StaffWorkspaceSwitcher` — Already has `layoutId` animation. Keep as-is.

## Migration Strategy

### Step 1: Centralize `ROLE_COLORS` in `lib/staff-utils.ts`
- Add `glow` field back to `ROLE_COLORS` (or add a `getRoleGlow()` helper)
- Ensure `getRoleColor()` returns all fields used by pages
- Remove local `ROLE_COLORS` definitions from all three page files

### Step 2: `staff/page.tsx` — Staff List + Shifts Tab
**Changes:**
1. Import `getRoleColor` from `lib/staff-utils.ts`
2. Replace all raw `bg-white/[0.0x]` → `bg-[var(--theme-surface-soft)]` or `bg-[var(--theme-nested)]`
3. Replace all `text-white/xx` → `text-[var(--theme-text-muted)]` or `text-[var(--theme-text-secondary)]`
4. Replace all `border-white/[0.0x]` → `border-[var(--theme-border)]`
5. Replace `bg-emerald-500/[0.07]` active shifts banner → `bg-[var(--theme-success-soft)]`
6. Replace `border-emerald-500/20` → `border-[var(--theme-border)]`
7. Replace `shadow-[0_0_16px_rgba(...)]` glow on role badges → remove glow, rely on `shadow-lg` + surface contrast
8. Replace `rounded-4xl` (invalid) → `rounded-[32px]` on staff rows
9. Replace inline `style={{ backgroundColor: ... }}` → `bg-[var(--theme-surface-soft)]` / `bg-[var(--theme-surface)]`
10. Keep `layout` + spring animations on rows — they're already POS-style
11. Keep `StaffWorkspaceSwitcher` — already has `layoutId`

**Target:** Staff rows become GlassCard-like surfaces with `rounded-[32px]`, `bg-[var(--theme-surface)]`, `border-[var(--theme-border)]`, hover states via `hover:bg-[var(--theme-surface-soft)]`.

### Step 3: `staff/roles/page.tsx` — Permission Matrix
**Changes:**
1. Import `getRoleColor` from `lib/staff-utils.ts`
2. Replace all raw `bg-white/[0.0x]` → `bg-[var(--theme-surface-soft)]` / `bg-[var(--theme-surface)]`
3. Replace all `text-white/xx` → `text-[var(--theme-text-muted)]` / `text-[var(--theme-text-secondary)]`
4. Replace all `border-white/[0.0x]` → `border-[var(--theme-border)]`
5. Replace `bg-white/[0.06]` selected state → `bg-[var(--theme-surface-soft)]`
6. Replace `border-white/[0.12]` → `border-[var(--theme-border-strong)]`
7. Replace `border-rose-500/20` delete button → `border-[var(--theme-border)]`
8. Replace `bg-rose-500/10` → `bg-[var(--theme-danger-soft)]` (or keep if no token exists, use `bg-white/5` fallback)
9. Replace `bg-amber-500/10` note card → `bg-[var(--theme-warning-soft)]` or keep amber if intentional brand color
10. Wrap permission categories in `GlassCard` where appropriate, or use `Card` from primitives
11. Keep `layoutId="roleCheck"` — already POS-style

### Step 4: `staff/[id]/page.tsx` — Staff Detail
**Changes:**
1. Import `getRoleColor` and `ACTION_LABELS` / `getActionMeta` from `lib/staff-utils.ts`
2. Remove local `ROLE_COLORS` and `ACTION_LABELS`
3. Replace raw color patterns with theme tokens
4. Replace stat cards `rounded-2xl bg-white/[0.02]` → `GlassCard` or `Card variant="default"`
5. Standardize edit sheet and confirm dialogs

### Step 5: Modals & Sheets Standardization
- Use transitions from `lib/modal-transitions.ts`:
  - Backdrop: `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}`
  - Sheet slide: `initial={{ x: '100%', opacity: 0.8 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0.8 }} transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.5 }}`
- Ensure all modals use `fixed inset-0 z-[100] bg-black/40 backdrop-blur-md` pattern

## Constraints
- Backend frozen: no API/schema changes
- All changes uncommitted, local only
- Preserve all existing business logic and data fetching
- Maintain backward compatibility with existing components

## Execution Order
1. **Centralize `ROLE_COLORS`** in `lib/staff-utils.ts`
2. **Redesign `staff/page.tsx`** (most complex, reference for others)
3. **Redesign `staff/roles/page.tsx`** (grid layout, permission matrix)
4. **Redesign `staff/[id]/page.tsx`** (detail/profile)
5. **Run `npx tsc --noEmit`** after each page
6. **Run lint**
