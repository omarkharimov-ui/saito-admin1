# r21b findings (rolling)

Scope: Saito POS/KDS E2E. KDS fresh tab = tab-vtab-780962451 (console errors counted from start = 0). POS tab = tab-vtab-780962454 (opened fresh this run).

## Tabs
- KDS fresh tab: tab-vtab-780962451 (must stay mounted; error count from fresh start = 0 so far)
- POS tab: tab-vtab-780962454

## Key data
- Tables API: /api/pos/tables (floors: "1-ci Mərtəbə", "VIP")
- Orders API: /api/orders?table_number=N
- Masa 2 = ORD-2959 (id c151767b-…), ks=partially_ready — OWNER TEST, DO NOT TOUCH. Filadelfiya READY + Green Tea accepted; note "green tee soyuq olsn".
- Masa 3 = ORD-2963 (id 5f3bc844-f51e-427f-a1df-ca34d4ab8ad1), ks=served, confirmed → r21 cleanup target. Simple table (not grouped).
- Masa 4 = MERGED group with Masa 5 (merged_with [4,4,5]); group order ORD-2949 belongs to table 5 (33.00 ready). => Masa 4 NOT safe (would touch Masa 5). Avoided; unsent Masa4 draft discarded (verified no draft created).
- Floor plan UI renders ONLY non-empty layout tables (empty tables hidden). No free clickable table on either floor. => T2 will run on Masa 3 after T4 clears it.

## Status
- T1 PASS: modal shows "Qeyd: green tee soyuq olsn" amber (lab 86,6,78). Screenshot r21b-1-modal-note.png. Zone headers: left "HAZIRLANIR" (U+0049 plain I), right "HAZIRDİR" (U+0130 İ) — match task strings.
- T2 pending (do on Masa 3 after T4)
- T3 pending (light theme)
- T4 pending (cancel ORD-2963 + clear Masa 3)
- T5 pending (cancel T2 order + clear table)
- T6 pending (final)

## Notes/anomalies
- POS API saw transient 500s on /api/pos/tables (r114) and /api/print/claim (r143) in the POS tab (not the KDS fresh tab).
