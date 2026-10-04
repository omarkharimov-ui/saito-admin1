# r13d — KDS flicker + multi-station CTA verification (FINAL)

Tab: tab-vtab-780962413 (new tab, user Chrome; built-in browser disabled). Base http://localhost:3000
Shots: saito-admin1/artifacts/saito-admin/e2e-shots/r13d-{board,bds-after,main-stillpreparing,allready,modal-quiet,served}.png

## PART 1 — flicker (90s on /admin/kds, 22:36:06–22:37:43 UTC)
- MOUNT lines: **2** → 22:36:07.198, 22:36:07.216 (double mount; no remount loop afterwards).
- fetch lines (all identical), in order seq=2..22: `raw=202 kept=9 stations=0` (every ~5s).
- EMPTY-FLASH lines: **7**, verbatim each:
  `[kds-debug] EMPTY-FLASH orders=0 stations=2 boardStations=2 activeStationId=null itemStations=[]`
  at 22:36:07.584, 07.599, 08.202, 09.200, 09.460, 10.208 (itemStations=[] in all).
- Visual flashes to empty state: **7** logged, all confined to first ~3s after mount; steady state showed 4 active orders, no flash observed.
- Other console output: React DevTools info, [HMR] connected, [pos-sync] debug (leftover POS page), 2× [Fast Refresh] (22:36:50, 22:37:53). **No JS errors.**
- Extra: ~22:39 the KDS board got STUCK rendering the empty state ~30s while /api/orders returned 124 active orders; manual reload repopulated. Root-cause candidate: HMR Fast Refresh at mount drops fetched data.

## PART 2 — multi-station CTA
Order: MASA 97 / **ORD-2958** (dine_in, ₼25.50). Filadelfiya Classic + mod "Kremli" (Main) + Tea (Bar). placeOrder success 22:38:53.840.
- S2 BDS modal → showed Tea (drink). Clicked "Hazırdır". PASS
- S3 BDS after: STANSIYALAR **Main Kitchen 0/1, Bar 1/1**; header **HAZIRLANIR** (not SERVİSƏ HAZIRDİR). Tea ✓ green ready; Filadelfiya ✓ outline pending. PASS
- S4 KDS (Main Kitchen tab active): modal "Hazırdır" ACTIVE → clicked → STANSIYALAR **Main Kitchen 1/1, Bar 1/1**; card → **SERVİSƏ HAZIRDİR**. PASS
- S5 Reopen modal: quiet emerald **"Servis POS-dan edilir"** hint disabled, no active Hazırdır. PASS
- S6 POS kebab → SERVISƏ VER → toast "Servisə verildi"; table 97 → SERVİS EDİLDİ. KDS board: Masa 97 / ORD-2958 GONE ("4 aktiv sifariş"). PASS

## Console errors throughout
No JS exceptions. Transient API blips at 22:37:52 only: POST /api/devices 500 (×2), GET /api/orders?order_source=delivery... 403. No action cancelled, shift not closed.
