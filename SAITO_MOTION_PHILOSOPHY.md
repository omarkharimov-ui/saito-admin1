# Saito Motion & Interaction Philosophy

> **CANONICAL DESIGN LAW — bağlayıcıdır.** Hər UI interaction dəyişikliyi (hər
> agent round-ı, hər feature) bu sənəddəki qaydalara görə review olunur.
> Məqsəd "Saito-nu animasiyalı etmək" DEYİL — Saito-nu **canlı, ardıcıl,
> anında və fiziki inanılır** hiss etdirməkdir.

**Motion is not decoration. Motion is part of the product's interaction model.**
Every interaction must feel intentional, physical, responsive, and state-aware.

## 1. Think in States, Not Animations

Never ask: *"What animation should I add?"*
Ask: *"What changed in the system, and how should the interface communicate that change?"*

UI motion must originate from state transitions:

```
USER ACTION → STATE CHANGE → UI TRANSFORMATION → MOTION
```

Never create animation first and attach business logic afterward.

## 2. Motion Must Explain Continuity

When something changes, preserve the user's sense of where it came from and where it went.
Elements should not randomly disappear and reappear elsewhere.

Prefer: `old position → transformation → new position`
over: `fade out → render completely different UI → fade in`

If two UI states are conceptually related, their visual transition should make that relationship obvious.

## 3. Prefer Physical Motion Over Decorative Motion

Do not rely on generic `transition: all 200ms ease` as the default solution.
For meaningful interactions, consider:

- spring motion
- velocity
- drag progress
- rubber-band resistance
- snapping
- momentum
- interruption
- gesture progress
- layout interpolation

The interface should feel as though it has physical properties.

## 4. Interactions Must Be Interruptible

A transition must not feel like a prerecorded animation.
If the user changes direction halfway through an interaction, the UI should respond from its current state.

Bad: `animation starts → user interrupts → animation resets → new animation starts`
Good: `current interaction progress → user changes direction → transition continues from current state`

The user's input always has priority over the animation.

## 5. Morph Instead of Replace

When two UI states are conceptually the same object, prefer transforming the existing visual
structure rather than destroying one component and creating another.

```
[ Edit ] [ Delete ]
        ↓
[       Save       ]
```

The user should perceive: *"These controls transformed."*
Not: *"The old buttons disappeared and a new button appeared."*

Preserve position, size relationship, spatial continuity, container identity, and visual hierarchy whenever possible.

## 6. Layout Is Allowed to Move

Do not treat layout as static. When content changes, allow surrounding elements to smoothly reposition.

Prefer: `element changes size → neighboring elements naturally reposition → layout settles`
instead of: `old layout disappears → new layout appears`

Layout transitions should communicate hierarchy and causality.

## 7. Touch, Mouse and Keyboard Are Different Inputs

Do not blindly copy mobile interactions onto desktop. Use the same underlying motion philosophy
but adapt the interaction to the input device.

- **Touch** — drag, swipe, pull, rubber-band, spring, gesture-driven progress
- **Mouse / Trackpad** — hover, press, drag, cursor-relative feedback, snapping, trackpad gestures, spatial transitions
- **Keyboard** — focus continuity, selection movement, predictable state transitions, immediate feedback

Same system. Different physical language.

## 8. Feedback Must Be Immediate

The interface should acknowledge user input immediately. Do not make users wait for a
network request before showing that their action was received.

Separate **interaction feedback** from **server confirmation**:

```
USER CLICKS → immediate visual response → optimistic/local state where safe → server operation → confirmed state
```

Never make the interface feel disconnected from the user's action.

## 9. Do Not Animate Everything

Premium motion is selective. Motion should communicate: causality, hierarchy, spatial
relationships, state changes, feedback, focus.

Do not animate elements merely because animation is technically possible.
If motion adds no information, remove it.

## 10. Avoid Generic "AI UI"

Never produce:

- random fades everywhere
- excessive scale animations
- unnecessary bounce
- slow transitions
- floating cards with meaningless motion
- animation on every hover
- modal-after-modal transitions
- exaggerated spring effects
- decorative particles
- "AI-looking" glowing effects

Saito should feel like a serious commercial product, not a design showcase.

## 11. Motion Should Be Fast, But Not Abrupt

Default to responsive motion. The user should feel *instant response + controlled settling* —
not an instant jump, and not a slow cinematic animation.

Use different motion characteristics according to interaction importance:
small feedback should be almost instantaneous; structural transitions can have more visible movement.

## 12. Motion Must Respect Reduced Motion

Support `prefers-reduced-motion`. When reduced motion is enabled:

- remove unnecessary movement
- reduce spring displacement
- remove parallax
- minimize large spatial transitions
- preserve state clarity and feedback

Accessibility is part of the motion system.

---

## THE CORE MENTAL MODEL

Before implementing any interaction, reason through:

1. What is the current state?
2. What action happened?
3. What is the new state?
4. Which visual objects are actually the same object?
5. What should remain spatially continuous?
6. What should transform?
7. What should move?
8. What should disappear?
9. What should appear?
10. What should respond immediately?
11. What should wait for server confirmation?
12. What physical behavior best communicates this change?

Only then implement the motion.

## FINAL RULE

Never build animation for the sake of animation. Build a UI where:

- state changes have visible consequences,
- visual objects preserve continuity,
- user input controls the interaction,
- motion communicates causality,
- and the interface feels physically responsive.

The goal is not to "make Saito animated." The goal is to make Saito feel **alive, coherent,
immediate, and physically believable.** When choosing between a simpler transition and a more
sophisticated interaction, choose sophistication only when it improves comprehension or
interaction quality. **Complexity belongs behind the scenes. Simplicity belongs in front.**
