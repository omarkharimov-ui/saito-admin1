# SAITO OS — PRODUCTION-GRADE CONTRACT AUDIT FRAMEWORK (2026-09-11)

> Məqsəd: **"kod var" yox, "business rule həqiqətən qorunur"**.
> İllkin faizlər (MASTER_FEATURE_MAP) **inventory göstəricisidir** — final score
> yalnız bu framework-ün evidence-lərindən hesablanır.

## Scoring qaydası (hissiyat YOX)
- Hər check = 1 qeyd: `ID | check | verdict | evidence`
- Verdict: **PASS** (1) / **PARTIAL** (0.5) / **FAIL** (0) / **BLOCKED** (0, hesablamaya daxil — external asılı) / **N-A** (hesablamaya daxil deyil)
- **Score = (PASS + 0.5×PARTIAL) / (PASS+PARTIAL+FAIL)** — BLOCKED/N-A məxrəcdən kənar
- **VERDICT:**
  - `GO` — score ≥ 90% AND **0 critical FAIL**
  - `NO-GO` — hər critical security/atomicity FAIL → NO-GO (score nə qədər yüksək olursa)
  - `CONDITIONAL` — score ≥ 90% amma critical blocker qalıb → qeydlə GO
- **Evidence rule:** hər verdict-in əməlində tool output (psql/curl/grep nəticəsi) olmalıdır. "Görünür var" = evidence DEYİL.

## Dövr (problem tapılanda)
`FOUND → CLASSIFY (critical/high/med/low) → FIX (yalnız frozen contract-a toxunmayıb) → TEST → RE-AUDIT`
Frozen contract-lar (payment core, state machine, merge/transfer V2, Total SSOT) səbəbsiz dəyişdirilmir.

## Test qaydaları
- Live test = REAL DB + REAL API (curl localhost:3000 / psql pooler).
- Test fixtures **metadata/`a1_`-`a3_test` marker** ilə yaradılır, sonda DELETE → **zero residue verify**.
- FROZEN RPC-lərə test yazılır, amma gövdəsinə toxunulmur.
- Live DB test data: orders=706+, staff=22 — fixtures bunlarla qarışdırılmır.

## Checklist template (hər modul, 30 bölmə)
1. BUSINESS CONTRACT · 2. DB SCHEMA · 3. ENUMS/STATES · 4. RPC/FNS · 5. SERVER SERVICES ·
6. API ROUTES · 7. AUTHENTICATION · 8. AUTHORIZATION · 9. RLS · 10. LOCATION SCOPING ·
11. VALIDATION · 12. ATOMICITY · 13. IDEMPOTENCY · 14. CONCURRENCY · 15. STATE TRANSITIONS ·
16. AUDIT LOGGING · 17. OUTBOX EVENTS · 18. REALTIME · 19. CRON/ASYNC · 20. ERROR PATHS ·
21. SECURITY · 22. DATA INTEGRITY · 23. UI CONTRACT · 24. E2E · 25. CROSS-MODULE DEPS ·
26. EDGE CASES · 27. MIGRATION/LEGACY DEBT · 28. TEST COVERAGE · 29. PRODUCTION RISKS · 30. VERDICT

## Fazalar
- **PHASE 1 (Foundation/Security):** A, E, S, Z, Infrastructure
- **PHASE 2 (Core transaction):** O, B, P, V, D
- **PHASE 3 (Operation):** F, T, K, M, I
- **PHASE 4 (Guest):** C, L, G, Q, R, W
- **PHASE 5 (Commerce):** X, Delivery, N, Guest Channels
- **PHASE 6 (Intelligence):** Y, U, J
- **PHASE 7 (Hardware/Integrations):** H, Integrations
