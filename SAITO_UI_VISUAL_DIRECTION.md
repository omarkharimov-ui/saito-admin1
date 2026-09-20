# SAITO UI — VISUAL DIRECTION

**Ratified:** 2026-09-19, user (Omar) — binding for ALL UI work (W-A2 menu, W-A3
customers, and every future wave). Decisions locked here: **QR menu = 1A sticky
total bar** · **CRM = 2B dedicated `/admin/customers` page**.

> **Empty-looking, but never empty.**
> The user must immediately understand what to do; the UI must not announce itself.

The UI must feel **calm, premium, minimal, and intentional**. Do NOT interpret
"Apple-like" as simply adding whitespace or making everything white. The
interface should contain all necessary information and actions, but visual
noise must be aggressively removed.

## Core principles

### 1. Content first
The product/content is the visual focus. UI chrome stays secondary.

### 2. Strong hierarchy
Every screen has a clear **primary information → secondary information →
primary action**. Never give every element equal visual weight.

### 3. Generous spacing
Use whitespace deliberately. Do not fill empty space just because it exists.

### 4. No decorative UI
Avoid: unnecessary gradients · excessive shadows · decorative cards · giant
headers · excessive borders · badge spam · redundant icons · ornamental
illustrations · unnecessary animations · excessive rounded containers. Every
visual element must have a functional reason.

### 5. Avoid "dashboard syndrome"
Do not turn every screen into a collection of cards. Prefer clean lists,
sections, typography hierarchy, subtle separators, contextual actions — over
card grids, metric tiles everywhere, colored status blocks, dense control
panels.

### 6. Mobile QR experience
The customer flow: **browse → select → adjust quantity → see total → add to
check** — without unnecessary screens. The sticky total bar stays visually
quiet; it must not look like a conventional shopping-cart widget.
Conceptual hierarchy: `2 items · ₼18.50        Add to my check →` — the action
is obvious without dominating the screen.

### 7. Customer CRM
`/admin/customers` = a focused customer workspace, not an enterprise
spreadsheet. Prefer **Search → customer list → customer profile → timeline**.
Avoid unnecessary columns and controls. History is readable through typography
and spacing, not heavy cards.

### 8. Interaction design
Prefer: direct manipulation · predictable gestures · one primary action ·
contextual secondary actions · progressive disclosure.
Avoid: unnecessary confirmation modals · multi-step flows · nested drawers ·
hidden critical actions · duplicated controls.

### 9. Animation
Only when it communicates state or hierarchy. Never for decoration.

### 10. Consistency
Use the existing Saito design system and frozen backend contracts. Do not
invent a new visual language per feature. New UI must feel like the same product.

## Critical rule — frozen backend

**Do not modify backend logic to make the UI easier to implement.** The backend
is frozen. If the UI appears to require a backend change:
1. inspect the existing contract;
2. determine whether the UI can adapt;
3. if not, **STOP**;
4. report the exact contract mismatch.
Never silently reopen frozen business logic.

## Final quality test

> Can I remove 20% of this UI without losing functionality? If yes — simplify.

The goal is not an empty interface. The goal is to make complexity feel
invisible. *Complexity behind the scenes, simplicity in front.*
