# r21 E2E findings (rolling)

Tab: tab-vtab-780962401 (localhost:3000 admin)

- S1 PASS — KDS Kitchen: zones HAZIRLANIR (left, empty) + HAZIRDIR ·1 (right, Masa 2). NOTE: label text is "HAZIRDIR" (plain I), task expected "HAZIRDİR".
- S2 FAIL — Masa 2 modal opens (Masa 2 / HAZIRLANIR / 8h21m GEÇİKME / Filadelfiya Classic / RUSH / "Servis POS-dan edilir"). NO "Qeyd: green tee soyuq olsn" anywhere (searched innerText+textContent).
- S3 PASS — Bar tab (watch): Masa 2 in HAZIRLANIR, Green Tea Japanese Style, footer "İzləmə" (no timestamps yet), no tick buttons, no note.
- S4 PASS — Expo tab empty: "Hazır bilet yoxdur" + hint "Bütün stansiya hazırlayıb — bilet buraya düşür"; no SERVİSƏ VER button.
- S5 PASS — VIP floor, Masa 3=BOŞ. Created order: Filadelfiya Classic + Green Tea Japanese Style x1, sent. KDS Kitchen HAZIRLANIR·1 = Masa 3; HAZIRDIR·1 = Masa 2.
- S6 in progress — BDS: Masa 3 bar item ready (Bar 1/1) OK. Now readying Masa 3 food on KDS Kitchen.
Remaining: S6 verify zone move, S7 expo, S8 pos serve, S9 toast, S10 light, S11 cleanup, S12 final.
