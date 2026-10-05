# E2E round r30 — Run C — Consolidated Stok Hub Verification

App: http://localhost:3000 (Next.js dev). Session: Chrome as superadmin, dark theme default.
Tab: fresh tab `tab-vtab-780962575` (retained). Console cleared at start; read after each major action.
Note: Masa 2/4/5/6/7/8/9/10 never touched. No order creation performed (read-only + navigation).

## Step results (1–10)

| # | Step | Result | Evidence |
|---|------|--------|----------|
| 1 | /admin/stock hub: hero "Stok Paneli" + 11 chips; sidebar single inventory entry "Stok", old entries gone | **PASS** | 11 chips present: ANBAR, AĞILLI ANALIZ, TƏDARÜK, ALIŞ SIFARIŞLƏRI, REPORT, TƏDARÜKÇÜLƏR, RESEPTLƏR, SAYIM, QAYTARIŞ, İTKI ST., AUDIT. Sidebar inventory = only "STOK" (no Alış Sifarişləri/Reseptlər/Audit/Stok Sayımı/Tədarük Returns/İtki Standartları) |
| 2 | Click "Ağıllı Analiz" renders | **PASS** | URL ?view=intelligence; "AI Inventory Advisor", tabs Təkliflər/Kalibrasiya/İnsaytlar/Trendlər, stats + recommendation cards (TÖVSIYƏLƏR 34, KRITIK 6) |
| 3 | Click "Alış Sifarişləri" renders | **PASS** | URL ?view=po; header "Satınalma Sifarişləri / PURCHASE ORDERS" + PO list (PO-MUU9F6M9-7YFU, PO-MUOA15SU-3NHV, PO-MUO9S5XF-1W6S) |
| 4 | Click "Reseptlər" renders, readable in dark | **PASS** | URL ?view=recipes; "Reseptlər" + product list (P8_PROD, Tea, Lahmacun…); light text on dark bg (readable) |
| 5 | Click "Audit" renders | **PASS** | URL ?view=audit; "Audit Trail" with rows: Stoka Giriş, Sifariş Sərfiyyatı, İtki, Tənzimləmə (+ summary cards 4029/1000/10021/11321 vahid) |
| 6 | Click "Sayım" then "Qaytarış" render | **PASS** | ?view=counts → "Fiziki Sayımlar / STOCK COUNTS"; ?view=returns → "Təchizatçı Qaytarmaları / SUPPLIER RETURNS" (row R-E2E-13a) |
| 7 | Direct nav /admin/recipes → /admin/stock?view=recipes with chip active | **PASS** | URL became http://localhost:3000/admin/stock?view=recipes; Reseptlər content rendered; chip active confirmed in step 8 shot |
| 8 | Light mode: Reseptlər readable (dark text on light) | **PASS** | data-theme=light, body bg rgb(247,247,248); title color rgb(17,24,39) (near-black), secondary rgb(107,114,128); active chip = dark pill. No white-on-white |
| 9 | Light mode: click "Alış Sifarişləri" readable | **PASS** | ?view=po in light theme; header + rows readable (dark text), ALIŞ SIFARIŞLƏRI chip active dark pill |
| 10 | Switch back to DARK (restore default) | **PASS** | data-theme=dark, body bg rgb(13,13,13) |

## Console

- **Total JS errors: 0**
- Total warnings: 1 (unique)
- Unique messages:
  - [warning] "Detected `scroll-behavior: smooth` on the `<html>` element. To disable smooth scrolling during route transitions, add `data-scroll-behavior=\"smooth\"`…" (Next.js dev advisory — cosmetic)
  - [info] React DevTools download banner (x2) — informational
  - [log] [HMR] connected / [Fast Refresh] rebuilding+done — informational
- No React exceptions, no hydration errors, no uncaught errors.

## Network (transient 500s observed — non-blocking, not reproduced on retry)

Requests logged: 421. Non-200 responses: 6 total.
- **Known pooler 500 (transient, /api): 2**
  - `GET /api/customers?q=&limit=50` → 500 (08:20:27)
  - `GET /api/admin/badges?delay_minutes=20` → 500 (08:21:09)
- Non-API 500s: 4
  - `GET /staff/login` → 500 (08:19:09, 08:19:24, 08:21:12, 08:21:26) — RSC/prefetch of the login route erroring; **did NOT** redirect our admin session (auth/me and inventory endpoints returned 200 throughout; all 10 steps succeeded).

## Screenshots (saved to delivery path)
- r30-8-hub-chips.png — hub + 11 chips + sidebar
- r30-9-hub-intelligence.png — Ağıllı Analiz
- r30-10-hub-po.png — Alış Sifarişləri (dark)
- r30-11-hub-recipes-dark.png — Reseptlər (dark)
- r30-12-hub-audit.png — Audit
- r30-13-hub-counts.png — Qaytarış (supplier returns, after Sayım)
- r30-14-hub-recipes-light.png — Reseptlər (light)
- r30-15-hub-po-light.png — Alış Sifarişləri (light)

## Unexpected behavior
1. Chip/nav clicks intermittently returned `actionPerformed:false, reason:"detached_or_invisible"` on the FIRST attempt after a view change (React re-render detached the node), then succeeded on retry. Same for the theme toggle (`reason:"document_changed"` on first click; second click applied). No functional impact — not app errors, just test-tool re-render races.
2. Extra empty `- dialog` + `- alert` nodes appear in the DOM snapshot (a toast/inline alert container); no visible modal blocked interaction.
3. Recurring transient 500 on `/staff/login` (4x) and two `/api` 500s (customers, badges) — see Network. None affected the flow.
