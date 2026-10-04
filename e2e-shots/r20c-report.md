# r20c — final verification (Saito POS/KDS)

Scope: (1) clean up leftover test order so Masa 3 = BOŞ; (2) re-verify offline-reload fix (stations + board cache).

Progress: 11/11 steps done. All PASS.

| Step | Result | Evidence |
|---|---|---|
| S0 | PASS | Fresh tab, 0 SW unregistered, saito_offline_force removed; Masa 2 ticket visible; tabs Kitchen/Bar/Expo/GÜN |
| C1 | PASS | CANCEL_RESULT 200 {"success":true,...} |
| C2 | PASS | Masa 3 chip = BOŞ (VIP floor); r20c-1-masa3-bos.png |
| C3 | PASS | GÜN: SIFARIŞLƏR only "11:09 Masa 2 ×2 HAZIRLANIR"; 0 ×0 GÖZLƏYİR ghosts; r20c-2-gun-clean.png |
| O1 | PASS | saito.kds.stations.v1 non-null (Kitchen/Bar/…); saito.kds.board.v1 contains "table_number":2 |
| O2 | PASS | r20c-offline-sw.js written (531 chars) |
| O3 | PASS | SW activated; "OFFLINE — YERLI REJIM" banner |
| O4 | PASS | a) Masa 2 rendered; b) "son sinxron 14:41"; c) 4 tabs; r20c-3-offline-reload.png |
| O5 | PASS | 1 SW unregistered, file deleted; live board restored; r20c-4-back-online.png |
| F1 | PASS | console errors = 0; console error msgs = 0 |
| F2 | PASS | Masa 2 active/untouched (HAZIRLANIR, 3h34m, Filadelfiya Classic ×1) |

CANCEL_RESULT line:
CANCEL_RESULT 200 {"success":true,"data":{"done":2,"total":2,"action":"cancel","denied":0,"success":true,"order_id":"40ba4b11-8803-4339-81db-e388592a77c7","performed_by":"c814879d-5378-4791-8c5f-8ee5aee51994","finalized_skipped":0}}

Anomalies: during O4 the offline test SW intentionally blocked /api/ (503) → dev overlay text "Failed to load location context (503)" while offline (expected, cleared after O5). VIP floor required clicking floor selector (button "VIP").

Tabs: tab-vtab-780962436 (agent, /admin/kds live board).
