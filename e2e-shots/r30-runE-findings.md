# r30 run E — POS unsent-chip re-check (Masa 3, VIP)

Tab: tab-vtab-780962588 → http://localhost:3000/admin/pos (superadmin, dark theme)
Console cleared at start; no other tables touched (Masa 2/4/5/6/7/8/9/10 untouched).

## Steps performed
1. /admin/pos → floor selector → **VIP** → Masa 3 (was BOŞ). Clicked card → order panel → **MASANI TUT** (occupied, toast "Müştəri oturdu").
2. Added **Green Tea Japanese Style** qty 1 → **MƏTBƏXƏ GÖNDƏR +1** (toast "Sifariş göndərildi"), cart line qty 1 (sent).
3. Re-opened Masa 3, added **Green Tea** qty 1 again (unsent) → cart line qty **2**.
4. CLEANUP: tapped CTA (toast "Sifariş göndərildi"), then Masa 3 "⋮" → **MASANI BOŞALT** → confirm **TƏSDIQLƏ** → PIN **1871** → **TƏSDIQLƏ** (toast "Masa 3 boşaldıldı"). Masa 3 card text = "Masa 3 - Boş" (empty). ✔

## Step 2 verdict: **PASS**
- Cart line: "Green Tea Japanese Style" (name truncated on screen "Green T…"), qty controls = **2**, line total 8.00 ₼.
- Chip below the product name: text **"1 gözləyir"** with hourglass icon → rendered amber chip ("⏳ 1 gözləyir"), amber border, **visibly painted** (computed opacity 1, visibility visible), NOT clipped. No modifier chips present.
- Send CTA pill: **"MƏTBƏXƏ GÖNDƏR"** with **"+1"** badge (enabled/white).
- Screenshot (right panel crop, cart row + CTA): r30-18-chip-visible.png — chip clearly visible, no fallback crop needed.

## Console / network
- JS console errors (console.error / exceptions): **0**.
- Network: 2 × transient **POST /api/devices → 500** at page load (known pooler 500). All other /api calls 200.

## Blockers
None.
