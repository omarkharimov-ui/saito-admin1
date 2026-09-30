# SAITO POS E2E — r11f findings (rolling)

## Tabs
- admin: tab-vtab-780962237 (user Chrome, admin session OK) — last at /admin/pos
- customer/KDS: tab-vtab-780962301 — /kitchen

## CHECK A — Analytics — PASS
- 24-bar hourly timeline renders (labels 00..22); SİFARİŞ/GƏLİR toggle present
- SİFARİŞ: 13:00 — 9 sifariş · PİK ; 12:00 — 6 sifariş
- GƏLİR: 13:00 — 345.00 ₼ · PİK ; 12:00 — 172.00 ₼  → toggle changes values = YES
- Staff panel: 4 rows (K cashier, S superadmin, A superadmin, TA courier); metric col "ÇƏKILIŞ" (e.g. 39 dəq); CSV export button present
- Console /admin/stats: 0 errors, 4 warnings (chart width/height 0), 2 logs
- Shots: r11f-stats-peak.png, r11f-stats-staff.png

## CHECK B — Online ordering (/menu, no table) — PASS
- Tea x2 → sticky "2 mövqe · ₼20.00" + "Sifariş et →" clickable without table
- Checkout Takeaway, name "Test Musteri", phone 0501234567, Ümumi ₼20.00
- orderId 7ed5d518-feee-495e-a276-435e9c85b131 ; total ₼20.00
- Track /kitchen/track/<uuid>: "Qəbul edildi" + item Tea 0/2 (not 404)
- KDS /kitchen: card title "TAKEAWAY" (not MASA undefined), Tea ×2 → visible YES
- Console: /menu + track 0 err/0 warn ; /kitchen 0 err/0 warn (HMR logs only)
- Shots: r11f-menu-checkout.png, r11f-menu-success.png, r11f-menu-track.png, r11f-kds-takeaway.png

## CHECK C — Offline — PARTIAL / BLOCKED (MASA 10 not configured)
- Step1 ✓ offline test started (button -> "AKTİVDİR — BURAQ")
- Step2 ✓ /admin/pos amber banner "OFFLINE — YERLI REJIM · 1 gözləyir · tap = sinxron panel" (NOTE: already 1 queued item pre-existing)
- Step3 ✗ BLOCKED: MASA 10 NOT present in POS floor (only 17 tables: Masa 14,15,17,97,98,99,401,471,472,502,511,901,991,992,993,995,996). No order created (constraint respected).
- Step4 ✗ sync popover could not be opened via synthetic clicks (not captured); banner showed 1 queued item
- Step5 ✓ released offline (button back to "TESTİ BAŞLAT")
- Step6 ~ banner disappears confirmed (bannerVisible:false on /admin/pos); sync toast NOT captured (faded before screenshot)
- Console /admin/settings (TERMINALLAR): 500 errors (buffer cap) all = React "two children with the same key" duplicate-key; 0 warnings; "2 Issues" dev overlay
- Console /admin/pos: not captured
- Shots: r11f-pos-initial.png, r11f-offline-panel.png (=POS), r11f-offline-synced.png (=settings terminals after release)
- NOTE: POS table list also missing Masa 1/8/9 (which KDS shows) → likely stale offline cache.
