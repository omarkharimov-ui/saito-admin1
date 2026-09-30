# SAITO POS E2E sweep (r11j) — FINAL

Server: http://localhost:3000 (dev) · all sections PASS

## A. POS money path — PASS
- MASA 97 (empty) → 1× Tea (₼10) → MƏTBƏXƏ GÖNDƏR → order sent (Masa 97 → MƏTBƏXDƏ). Kitchen-send toast auto-dismissed before capture.
- Payment: table "..." action sheet → HESABI BAĞLA → method Nağd (cash) → amount 10 → ÖDƏNIŞI TAMAMLA.
- TOAST (exact): "Bütün sifarişlər ödənildi"  — normal green-check success toast, NOT the offline-queue toast.
- Receipt modal "Sifariş ödənildi ✓"; Masa 97 → TƏMIZLƏNMƏLI (free).
- Screenshot: r11j-pos-paid.png · Console: errors 0, warns 0

## B. Menu online checkout — PASS
- /menu (no table) → Tea → "Sifariş et →" → checkout sheet "ONLAYN SIFARIŞ".
- Empty name/phone ⇒ "Sifarişi göndər" DISABLED (greyed). Screenshot: r11j-menu-disabled.png
- Filled "Test Freeze" / 0501112233 ⇒ button ENABLED.
- Çatdırılma ENABLED (zone "Bakı Mərkəz · ₼2 · ~30 dəq"); address "Test küçəsi 1, Bakı".
- Success panel total: ₼12.00 (Tea ₼10 + delivery ₼2).
- "Sifarişi izlə →" navigated SAME tab → track page.
- orderId (URL slug): ec2ffb92-456b-4d0b-af5b-932bf57078ce
  URL: http://localhost:3000/kitchen/track/ec2ffb92-456b-4d0b-af5b-932bf57078ce
- Track page: "Sifariş İzləmə" / Çatdırılma / Qəbul edildi / item Tea. Screenshot: r11j-menu-track.png
- /kitchen: new order appears as card titled "ÇATDIRILMA" (non-MASA), marked "İndi".
- Console /menu (incl. track): errors 0, warns 0 · /kitchen: errors 1, warns 0
  (/kitchen error = React hydration mismatch: server `bg-[#0a0a0a] text-white` vs client `bg-white text-black`)

## C9. Stats — PASS (with UI caveat)
- PİK SAATLƏR card renders 24-bar timeline ✓
- SİFARİŞ/GƏLİR toggle works (active pill moved SİFARİŞ → GƏLİR) ✓
- Bottom "PİK SAAT (top banner)" GONE — no standalone "PİK SAAT" text in DOM ✓
- CAVEAT/BUG: heading `<h3 class="text-white font-bold text-lg">PİK SAATLƏR</h3>` sits on a white card (bg 255,255,255) → title invisible in light mode.
- Screenshot: r11j-stats.png · Console: errors 0, warns 0

## C10. Payroll auto-load — PASS
- /admin/staff → "Maaş eksportu" → panel AUTO-LOADED current-month report WITHOUT clicking "Hesabatı yüklə".
  Staff table appeared: 10 IŞÇI, columns İŞÇI/ROLL/SAAT/ƏLAVƏ/TARIF/UCMA/BRUTTO/NETTO, period 2026-10-01 → 2026-10-01, "Bu ay" selected.
- Screenshot: r11j-payroll-auto.png · Panel closed (Escape). Console: errors 0, warns 0

## D. Settings terminals — PASS
- /admin/settings → TERMINALLAR tab → 0 console errors, 0 warnings (verified clean in a fresh tab).
- Terminals rendered: POS terminal ONLINE / OFFLINE / ONLINE ("1 / 3 terminal online"). No duplicate-key errors.

## Console error/warn per page
| Page | errors | warns |
|---|---|---|
| /admin/pos | 0 | 0 |
| /menu (+track) | 0 | 0 |
| /kitchen | 1 | 0 |
| /admin/stats | 0 | 0 |
| /admin/staff | 0 | 0 |
| /admin/settings (Terminals) | 0 | 0 |

Note: the /kitchen hydration error persisted in the tab console buffer during later navigations (same tab); settings confirmed clean in a new tab.

## Extra observation
- An "OFFLINE — YERLI REJIM" banner appears in the admin chrome (seen on /admin/staff). Did NOT affect POS payment (normal online success toast used).

## Screenshots
- r11j-pos-paid.png, r11j-menu-disabled.png, r11j-menu-track.png, r11j-stats.png, r11j-payroll-auto.png
