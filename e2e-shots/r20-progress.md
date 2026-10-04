# r20 E2E Progress Record

Scope: E2E test round r20 for Saito POS/KDS at http://localhost:3000
Tab: tab-vtab-780962430 (agent tab, reused). Console cleared at start.

## Key app facts discovered
- /admin/kds = Kitchen-family board (Kitchen operable; Bar tab = view-only watch "İZLƏMƏ"; Expo = serving gate tab). Tabs: Kitchen · Bar · Expo · GÜN.
- /admin/bds = Bar-family board ("BDS — BAR") where the Bar share is operable (equivalent to task's "Bar tab" action).
- Stations cache: saito.kds.stations.v1 = Kitchen/Bar/Expo. Board cache: saito.kds.board.v1.
- Table "Masa 3" lives on VIP floor (not 1-ci Mərtəbə). VIP floor also holds Masa 2 (owner test order).

## Completed (with console err counts)
- STEP1 PASS: 4 tabs present; Expo 0; empty state "Hazır bilet yoxdur" + hint. r20-1, r20-2. err=0
- STEP2 PASS: Masa 3 order created (Filadelfiya Classic + Green Tea Japanese Style), sent to kitchen. KDS Kitchen 2 / Bar 2 / Expo 0. r20-3. err=0
- STEP3a PASS: Bar share done via /admin/bds (Bar 1/1). Expo still empty on KDS = gate holds. r20-4. err=0
- STEP3b IN PROGRESS: kitchen share for Masa 3 ticked + Hazırdır pressed on /admin/kds Kitchen tab. About to verify Expo card.

## Remaining
- STEP3b: verify Expo ready card (BÜTÜN STANSİYA HAZIRDİR, SERVİSƏ VER). r20-5
- STEP4: one-press serve -> r20-6, POS served chip -> r20-7
- STEP5: offline reload SW test -> r20-8, back online -> r20-9
- STEP6: transitions + Bar watch no-circle -> r20-10
- STEP7: light theme -> r20-11 (then back to dark)
- STEP8: cleanup Masa 3 -> r20-12

## Constraints
- Do NOT touch Masa 2. Do NOT restart server.
