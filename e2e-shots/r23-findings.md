# E2E r23 — multilingual note-routing engine (Saito POS/KDS) — COMPLETE
Tab: tab-vtab-780962479 (fresh, http://localhost:3000)
Shots: saito-admin1/e2e-shots/ prefix r23-

## Result: M1-M6 ALL PASS
M1 PASS — Kitchen tab Masa 2 = NO "Qeyd:"; Bar tab Masa 2 = "Qeyd: green tee soyuq olsn"
M2 PASS — AZ note; order ORD-2966 (1e191cf5-...)
   sent: "çay soyuq olsun, filadelfiya soğansız, təşəkkür"
   Kitchen card = "filadelfiya soğansız · təşəkkür" (no çay)     [r23-2]
   Bar card    = "çay soyuq olsun · təşəkkür" (no filadelfiya)   [r23-3]
M3 PASS — CANCEL_A 200 success; DISMISS_A 200 table_status=empty; Masa 3 BOŞ
M4 PASS — RU note; order ORD-2967 (e2daab5d-...)
   sent: "чай холодный, филадельфия без крема, спасибо"
   Kitchen card = "филадельфия без крема · спасибо"             [r23-4]
   Bar card    = "чай холодный · спасибо"                        [r23-5]
M5 PASS — CANCEL_B 200 success; DISMISS_B 200 table_status=empty; Masa 3 BOŞ (VIP, status=empty)
M6 PASS — light theme legible [r23-6]; final dark clean [r23-7]:
   Masa 2 intact (Kitchen no note / Bar note present), Expo 0, no test tickets,
   console errors = 0, "supabaseKey" found = NONE

## Anomalies
- POST /api/tables/seat returned 403 (transient "Forbidden" toast) once; seating not required —
  adding products directly creates the order and MƏTBƏXƏ GÖNDƏR works.
- No supabaseKey leakage; console error count 0 from fresh tab.
