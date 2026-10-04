# R14 Kitchen fixes verification — FINAL findings

Env: built-in browser DISABLED -> used owner's Chrome (user), NEW tab targetId=tab-vtab-780962422. App http://localhost:3000, PIN 4321.
Order under test: ORD-2959 / table_number 2 (Masa 2), status confirmed, kitchen_status accepted. NOT served/cancelled/paid (verified before + after; I never pressed Hazirdir/Servis).

## TASK 1 — KDS navbar rename — PASS
Tabs: "Kitchen" (badge 1) | "Bar" (badge 1) | "GÜN" (no badge). No "Main Kitchen". r14-kds-navbar.png

## TASK 2 — Modal grouping — PASS (one data note)
- Header: "Masa 2" + "HAZIRLANIR" + timer ("37m") + "GEÇİKME". NO ORD-XXXX. r14-modal-header.png
- Groups: "BAR · İzləmə" (0/1) -> ONLY "Green Tea Japanese Style"; "KITCHEN" (0/1) -> "Filadelfiya Classic". r14-modal-groups.png
  NOTE: order has only ONE Filadelfiya row (qty 1). Its modifier text line = "Standart" (order's real modifiers = [{Standart}]); the "Kremli · Əlavə Losos · Acılı Mayonez · Əlavə Avokado" example is NOT present in this order's data.
- No "X"/circle-x next to any tick: only the round ✓. r14-modal-notick.png
- Kitchen active -> BAR group header shows "İzləmə" read-only marker; BAR ✓ = static dim circle (NOT a button); KITCHEN ✓ = active button. PASS
- TICK test on KITCHEN ✓: -> KITCHEN 1/1, green ✓, row STAYED visible (dimmed, not removed). Un-tick restored 0/1. r14-modal-aftertick.png / r14-modal-untick.png
- Bar tab: Masa 2 card lists ONLY Green Tea. Modal: BAR group Green Tea = active ✓; KITCHEN · İzləmə = read-only static circle. r14-bar-modal.png

## TASK 3 — BDS (Bar terminal) — PASS
- Navbar: "Bar 1" (own) | "Kitchen 1" + "İZLƏMƏ" badge (read-only sibling) | "GÜN". r14-bds-navbar.png
- Bar tab: Masa 2 card = only Green Tea with active ✓ (own station). r14-bds-bar-card.png
- Kitchen (İzləmə) tab: card ✓ = static dim circle (no button); footer shows quiet "İzləmə" caption INSTEAD of "Hazırdır". Click test on circle location -> no state change, no toast. r14-bds-watch.png
- Kitchen watch modal: CTA = quiet disabled "Servis POS-dan edilir"; RUSH = non-clickable dim chip; ALL items (Bar's Green Tea too) static circles. r14-bds-watch-modal.png
- Back to Bar tab: active ✓ works again. r14-bds-bar-restored.png

## TASK 4 — light mode — PASS
- data-theme=light, body bg rgb(247,247,248). Modal: station group headers, read-only "İzləmə" markers and modifier text all legible. r14-light-modal.png
- Switched back to dark (data-theme=dark).

## Console
0 errors, 0 warnings across the whole session. Only info/log/debug (React DevTools banner, [HMR] connected, [pos-sync] refetch). One transient HTTP 500 on GET /api/orders (network log r236) which briefly blanked the board; recovered on reload. No app-level console errors.

## Gotchas observed (not part of the 12s fixes)
- KDS ticket modal AUTO-DISMISSES after ~10s (likely re-render on the 5s /api/orders poll). React re-render also briefly detaches refs (click may report detached_or_invisible).
- Element-crop screenshots inside the modal render BLACK (backdrop-filter compositing quirk) -> used full-viewport screenshots.
- KDS/BDS station tabs are <button>s not exposed as a11y refs; clicked via JS.

## Safety
No order cancelled, no shift closed, Masa 2 NOT sent to service (tick was restored).
