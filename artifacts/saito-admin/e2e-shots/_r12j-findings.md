# SAITO POS E2E — round 12j findings (rolling)

Tab: tab-vtab-780962237 (localhost:3000)
Saved: r12j-pos-chips.png, r12j-pos-chips-vip.png

## WORK A — POS floor chips (İÇƏRİDƏ)
Ground truth from GET /api/pos/tables (kitchen_status field):
- Floor "1-ci Mərtəbə": t502 kitchen=served, t991 kitchen=served
- Floor "VIP": t1=pending, t5=ready (merged_into table 4), t4=completed (merged group lead), t8=pending, t9=pending
- NO table has kitchen_status "preparing" anywhere.

Observed chips:
- Masa 502 → emerald "SERVİS EDİLDİ"  ✅ PASS
- Masa 991 → emerald "SERVİS EDİLDİ"  ✅ PASS
- Masa 1 / 8 / 9 (VIP) → grey/zinc "GÖZLƏYİR"  ✅ PASS (pending visible)
- Masa 5 (kitchen READY → expected "SƏRVİSE") → ❌ MISSING: t5 is merged into group with t4; the group card (Masa 4, badge "4 · 5") renders NO kitchen chip. Confirmed via DOM: card children only Masa 4 / QRUP 1 / 2 / 5 / ₼33.00 / "4 · 5" / QRUP. No chip element.
- preparing (HAZIRLANIR) → N/A — no preparing order exists right now.

## WORK B — KDS
(fill in)

## WORK C — console
- /admin/pos: 0 errors, 0 warnings. (network note: POST /api/devices returned 500)

## WORK B — KDS board (HAMISI)
All 10 cards HAVE a bottom bar (none missing). Bar = <button>, state:
- Masa 502 (SERVİS EDİLDİ) → emerald "Servis edildi", disabled=true, pointer-events:none, opacity .4 → NOT clickable ✅ as expected
- Masa 991 (SERVİS EDİLDİ) → emerald "Servis edildi", NOT clickable ✅
- Masa 5 (SƏRVİSE HAZIRDİR/ready) → emerald "Sərvil POS-dan edilir", NOT clickable ✅
- Test 11y (currently SƏRVİSE HAZIRDİR, NOT preparing) → emerald "Sərvil POS-dan edilir". No "Hazırdır" bar exists for it.
- E2E Kurye (GÖZLƏYİR) → "Qəbul et" — WHITE bar (rgb 255,255,255) w/ dark text, CLICKABLE. (Task expected a DARK bar — actual is white.)
- E2E Wolf (GÖZLƏYİR) → "Qəbul et" white, clickable.
DISCREPANCY: task expected "dark bar Qəbul et"; actual = white/light bar.

### BLINK TEST (owner complaint "CTA blink") — RESULT: GOOD, no blink
Instrumented bar with MutationObserver + 60fps rAF sampler (154–156 frames each run):
1) E2E Kurye "Qəbul et" → (POST /api/kitchen/accept 200) → "Hazırdır": 0 frames removed, 0 removal events, y=690 unchanged, text swapped in place at ~1.13s, same white bg.
2) E2E Kurye "Hazırdır" → (POST /api/orders/mark-ready 200) → "Sərvil POS-dan edilir": 0 frames removed, y=690 unchanged, opacity 1 throughout, text AND background (white → emerald oklab(...)) swapped atomically at ~1.58s.
→ The bar MORPHS in place (color+text change, no gap / no disappear-reappear). NOT a flicker.

### TICK BOUNCE TEST — KDS Review / Dragon Roll ✓ circle — RESULT: PASS
- Tick: circle scale sampled via rAF; max scale = 1.179 (+18%) at t≈184ms then smooth decay 1.179→1.166→1.144→… settles to 1. Fill before = emerald lab(66.98,-58.27,19.54); after untick = transparent (outline) → ✓ pops in/out correctly.
- Untick: max scale = 1.180, returns to outline circle. Bounce + fill-pop confirmed both ways.

### GÜN (ALL DAY) VIEW — BLOCKED (server error)
- Clicking "GÜN" tab activates it but panel shows only a spinner forever (≥8s).
- Network: GET http://localhost:3000/api/kitchen/daily → 502 (x2). Direct refetch → 502 body {"error":"Failed to load daily kitchen data"}.
- => metrics row, İSTİHSAT list and SİFARİŞLƏR list CANNOT be read; screenshot captured (spinner).
- Clicking "HAMISI" returns to the board ✅ (PASS).

## WORK C — console
- /admin/pos: 0 errors, 0 warnings
- /admin/kds: 0 errors, 0 warnings
- network non-200 seen: POST /api/devices → 500 (repeating); GET /api/kitchen/daily → 502; HEAD supabase reservations → ERR_ABORTED (harmless preflight).

## Artifacts
r12j-pos-chips.png (floor 1: Masa 502 + 991 SERVİS EDİLDİ), r12j-pos-chips-vip.png (VIP: GÖZLƏYİR x3 + Masa4 group w/o chip), r12j-kds-board.png, r12j-kds-day.png (spinner/502)
