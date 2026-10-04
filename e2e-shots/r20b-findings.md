# E2E r20b — Saito POS/KDS verification (steps 5b–8b) — rolling findings

Scope: http://localhost:3000 (owner Chrome). Steps S0–S9. Screenshots prefix r20-.
Tab used: tab-vtab-780962433 (fresh). Build served from artifacts/saito-admin.

| Step | Result | Notes |
|---|---|---|
| S0 | PASS | fresh tab; unregistered 1 leftover SW (had:1, unregistered:[true]); removed saito_offline_force; cleared error log |
| S1 | PASS | Masa 2 ticket visible; navbar Kitchen·Bar·Expo·GÜN; no "son sinxron"; stations cache non-null; board cache has table_number 2 order (ORD-2959, Filadelfiya Classic + Standart, note "green tee soyuq olsn"). NOTE: cache stores table_number (2), not literal "Masa 2" label |
| S2 | PASS | wrote artifacts/saito-admin/public/r20b-offline-sw.js (exact content) |
| S3 | PASS | registered SW (scope /); after 30s OFFLINE banner "OFFLINE — YERLI REJIM tap = sinxron panel" appeared |
| S4 | FAIL | (a) Masa 2 NOT rendered → "Bütün sifarişlər hazırdır" (FAIL) (b) "son sinxron 14:28" shown (PASS) (c) only GÜN tab restored (Kitchen/Bar/Expo missing) (FAIL). Also header "Failed to load location context (503)". Screenshot r20-8-offline-reload.png |
| S5 | PASS | unregistered SW, deleted file, reload: Masa 2 back, all 4 tabs, no son sinxron, no OFFLINE. r20-9-back-online.png |
| S6 | PASS | Kitchen→Bar→Expo→GÜN→Kitchen sequence; active pill moved; Bar view read-only: 0 tick circles, 0 Hazırdır buttons, footer "İzləmə". r20-10-transitions.png (Bar active). Modal (Masa 2) view-only: no circles, only close X, footer "İzləmə Qəbul 11:09". r20-10b-bar-watch.png |
| S7 | PASS | light theme: html class "light", body bg rgb(247,247,248); modifier "Standart ×1" ~lab(35) dark; card text rgb(17,24,39); tabs dark; Expo empty "Hazır bilet yoxdur". r20-11-light-theme.png; switched back to dark |
| S8 | BLOCKED | VIP floor Masa 3 = SERVİS EDİLDİ ₼18.00. "Masanı boşalt" → confirm → admin PIN 4321 accepted → blocked by toast "Yeməxanada aktiv sifariş var — əvvəl KDS-də təsdiqləyin". Masa 3 NOT cleared (still SERVİS EDİLDİ). KDS GÜN shows leftover Masa 3 empty orders (13:42 ×0 GÖZLƏYİR, 13:47 ×0 GÖZLƏYİR) besides the served one (14:19 ×2). Masa 2 untouched. r20-12-final-clean.png shows Masa 3 still SERVİS EDİLDİ (not BOŞ) |
| S9 | PASS | KDS fresh, 10s; Masa 2 present; all 4 tabs; console error count = 0 (JS exceptions [], console.error []); no "supabaseKey" |

Files: r20-8, r20-9, r20-10, r20-10b, r20-11, r20-12 in e2e-shots/.
SW test file r20b-offline-sw.js deleted in S5.
