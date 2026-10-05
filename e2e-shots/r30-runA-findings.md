# R30 (run A) — Merged-group payment E2E — COMPLETE (feature works; 1 label bug)

Tab: tab-vtab-780962572  http://localhost:3000/admin/pos  Floor 1-CI MƏRTƏBƏ  Dark theme (untouched)

## Steps
1 PASS  Floor grid, dark theme, 1-ci Mərtəbə. r30-0-floor-dark.png
2 PASS  Masa 90 + "Green Tea Japanese Style" ₼4.00 → kitchen → card 4.00 GÖZLƏYİR
3 PASS  Masa 401 + "Tea" ₼10.00 → kitchen → card 10.00
4 PASS* BIRLƏŞDIR → 90 (Əsas 90 + 1 uşaq) → 401 → Təsdiqlə → ONE card "Masa 401 GRUP 1 ₼14.00" (member 90). r30-1-floor-merged.png
        *DEVIATION: the merged PARENT is 401, child 90 (meta canonical_order_from=401, t90.merged_into_table=401),
         even though UI said "Əsas 90". Card/labels show 401, not 90.
5 PASS  Merged card ⋮ → ActionSheet "MASA (ƏSAS) · 2 QONAQ · ₼14.00" → HESABI BAĞLA → ÖDƏNIŞ ÜSULU → Kart
        → terminal tip TAP → SIFARIŞ ÖDƏNILDI ✓, YEKUN 14.00 ₼, Ödəniş Kart. r30-2-paid.png
        401→cleaning, group total→0.
6 PASS* ONE history entry (not two): "MASA 401 + 401" + green "2 MASA" chip + ₼14.00. r30-3-history-merged-entry.png
        *BUG: title shows child as "401" (want "MASA 90 + 401").
7 PASS* Detail: banner "BIRLƏŞIK QRUP ÖDƏNIŞI ₼14.00"; primary order MASA 401 (1x Tea ₼10) with
        ÖDƏNIŞ Card ₼10.00 (non-empty); member section "MASA 401 · ₼4.00" = 1x Green Tea ₼4 + Card ₼4.00.
        r30-4-group-detail.png
        *BUG: all child table labels show "401" not "90".

## Console (whole run, no reload after start)
- JS exceptions: 0. console.error: 0. console.warn: 0.
- Known pooler 500s (flag as known, not new): POST /api/devices (500), GET /staff/login (500).
  Normal: GET /api/pos/tables 200 (≈3s poll), /api/print/claim 200.

## KEY FINDING — merged child table number is displayed as the parent's
After bill-merge the child order (originally Masa 90) has order.table_number = 401 and
merged_from_table = 90. History/detail render the CHILD using order.table_number (401)
instead of merged_from_table (90). Result everywhere the child should read "90" it reads "401":
- history title "MASA 401 + 401" (expected "MASA 90 + 401")
- banner chips "MASA 401 · ₼10.00" + "MASA 401 · ₼4.00" (expected 90 · ₼4.00)
- member section header "MASA 401 · ₼4.00"
Also the merge chose 401 as PARENT though UI picked 90 as "Əsas" (parent/child inversion).

Positive: ONE shared history entry, ONE shared ₼14.00 total, "2 MASA" chip, per-order payment
ledger rows both present (Card ₼10 + Card ₼4) — the shared split/ledger behaviour is correct.

## Files saved
r30-0-floor-dark.png, r30-1-floor-merged.png, r30-2-paid.png,
r30-3-history-merged-entry.png, r30-4-group-detail.png
