# E2E r22 — KDS/POS smart-note routing + sub-tabs (rolling findings)

Tab: tab-vtab-780962471 (fresh) → http://localhost:3000
Test order: VIP floor, Masa 3. Items: Filadelfiya Classic x1 (kitchen) + Green Tea Japanese Style x1 (bar).
Note: "green tea extra buz, filadelfiya kremli, təşəkkür"
Masa 2 untouched (owner): note "green tee soyuq olsn".

## Completed
- N1 PASS: Kitchen sub-tabs HAZIRLANIR/HAZIRDİR pills; Masa 2 in HAZIRDİR; Kitchen card no note. shot r22-1
- N2 PASS: Bar tab, Masa 2 HAZIRLANIR, card note "Qeyd: green tee soyuq olsn"; modal full note. shots r22-2, r22-3
- N3 PASS: Masa 3 order created + sent to kitchen.
- N4 PASS: Kitchen card note "Qeyd: filadelfiya kremli · təşəkkür"; Bar card note "Qeyd: green tea extra buz · təşəkkür". shots r22-4, r22-5
- N5 PASS: BDS drink ready → KDS Kitchen food ready → ticket moved HAZIRLANIR→HAZIRDİR (HAZIRDİR·2). shot r22-6

## Remaining
- N6 Expo full note (shot r22-7)
- N7 serve + cancel + dismiss (shot none)
- N8 light theme (shot r22-8) + final fresh reload (shot r22-9) + console 0

## Notes
- Fresh tab console cleared at start; no supabaseKey so far.
- KDS station tabs: Kitchen / Bar / Expo / GÜN. Sub-tabs: HAZIRLANIR / HAZIRDİR.
