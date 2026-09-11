# A — AUTHENTICATION/RBAC: FREEZE AUDIT (2026-09-11)

## Regression
**39/39 PASS** (`.a-regression-report.json`, live REAL DB + dev server; reproducible — `node .a-regression.cjs`)

## Final GO gate
| Kriteriya | Nəticə |
|---|---|
| Critical | **0** |
| High | **0** |
| Known A security bypass | **0** |
| Cross-location leak | **0** (Z-1/Z-2/Z-3: location_denied + anon RLS matrix) |
| Credential exposure | **0** (anon `staff`/`sessions`/`settings` = 0 rows; `staff_public_view` pin_hash-sız; reset response PIN saxlamır) |
| Unprotected auth-sensitive route | **0** (middleware default-deny; unauth probe ×5 → 401) |
| Unpinned SECURITY DEFINER | **0 / 323** |
| git tree clean | **0 files** (commit `d84c20e`) |
| Migration registry complete | **8/8** (20260911000001–8 qeydiyyatda) |
| 39/39 reproducible | **PASS** (son run 2026-09-11) |

## 5 REAL PRODUCTION BUG — root cause → fix → migration → live proof → regression test

### BUG 1 — `force_logout_staff` TAMAMİNLƏ BOZULDUB
- **Root cause:** `log_audit`-a yanlış siqnatuura ilə çağrılıb (9 positional arg, uyğun gəlmədi) → "function does not exist" → generic `EXCEPTION` swallow edib → `success:false` → **session-lar HƏÇ VAXT revoke edilməyib, audit yox**. Force-logout heç nə etməyib.
- **Fix:** düzgün `log_audit(action, entity_type, entity_id, actor_id, actor_name, old, new, metadata, ip)` çağrısı + `status='REVOKED'`.
- **Migration:** `20260911000008` (DROP+CREATE, eyni siqnatuura).
- **Live proof:** `force_logout_staff(kassir, admin)` → `{"success":true,"sessions_revoked":3}` + `audit_logs_canonical` row (action='force_logout').
- **Regression:** A11 (force logout → 401), A26 (audit row), C-2 (disable race).

### BUG 2 — REVOKED session-lər 12 saatdan sonra belə İŞLƏYİB
- **Root cause:** `validateAuth` + middleware YALNIZ `expires_at` yoxlayırdı; `status/revoked_at`-a baxmırdı. Logout/force-logout/`set_staff_pin` revoke edirdi amma session keçərdi.
- **Fix:** hər iki qatda `revoked_at || status='REVOKED'` → 401 + delete.
- **Migration:** code (`lib/api-auth.ts`, `middleware.ts`) — DB dəyişikliyi tələb etmədi.
- **Live proof:** A10 (revoked → 401), A11 (force → 401), A14 (pin change → old token 401).
- **Regression:** A09/A10/A11/A13/A14.

### BUG 3 — `PATCH /api/staff/[id]` status-ı RAW yazırdı
- **Root cause:** route `updates.status = status` → `.update()` — transition qaydası YOX, audit YOX, session-revoke YOX (contract §12).
- **Fix:** status flow → `set_staff_status_atomic` (transaction: transition rules + session revoke + `security_events` + `operation_logs`).
- **Migration:** `20260911000005` (RPC) + route code.
- **Live proof:** A05/A06/A24/C-3 + A24 lifecycle events (2+ `staff_suspended/enabled`).
- **Regression:** A08, A24, C-2, C-3.

### BUG 4 — `set_staff_status_atomic` YOXDAN `TERMINATED` enum qeyd etdi
- **Root cause:** `staff_status` enum = `ACTIVE, INACTIVE, SUSPENDED` (TERMINATED yoxdur). C-3 testində canlı exception: `invalid input value for enum`.
- **Fix:** terminal state = `INACTIVE`; transition qaydası yenidən yazıldı.
- **Migration:** `20260911000005` (re-apply).
- **Live proof:** C-2/C-3 pass (INACTIVE/ACTIVE transitions).
- **Regression:** C-2, C-3, A24.

### BUG 5 — 5 SECURITY DEFINER RPC `search_path` pinsiz idi
- **Root cause:** `complete_payment_atomic_v2`, `create_delivery_order`, `resolve_staff_location`, `split_by_seat`, `split_order_atomic` → `proconfig`-də `search_path` YOX (privilege-escalation səthi; digər 318/323-də pin var).
- **Fix:** `ALTER FUNCTION ... SET search_path = public` ×5.
- **Migration:** `20260911000007`.
- **Live proof:** `unpinned DEFINER = 0` (query təkrar verified).
- **Regression:** A-modul sweep (hər PHASE re-check: `proconfig NOT LIKE '%search_path%'` = 0).

## Brute-force / PIN (4.1 + migration 5)
- IP rate-limit: **10 wrong/5 dəq → 429** (A04 live) + global backstop 50/5 dəq
- Per-staff lock: **5 attributed → 15 dəq `locked_until`**, auto-expiry (A05/A06 live)
- Banned PIN policy DB-də: `is_banned_pin()` (`0000,1111,0001,2222,1234,1213,1122,1212`) — login **HARD reject** (A07)
- Weak/legacy hash: login ET + G5: **13 staff SUSPENDED** (A08)
- DoS qorunması: verify loop yalnız valid pbkdf2-260k hash-lər üzərində (bounded ~7)

## RLS (migration 6)
- `sessions_select_auth` → `user_id = current_setting('app.current_staff_id')` (öz session-in)
- `staff_public_view` (pin_hash-sız) authenticated-ə; raw `staff`-ın `pin_hash`-i yalnız service_role
- Anon matrix (live PostgREST): staff/sessions/table_floors/orders/roles/permissions/settings/security_events/login_attempts = **0 row**

## DEFERRED (A-dan D-yə keçir — A STATUS: NOT BLOCKING)
```
A AUDIT:        FOUND
ID:             D-01 discount authorization
CLASSIFICATION: D — Discounts
A STATUS:       NOT BLOCKING (RBAC SSOT sağdır: waiter discount.approve=false — A16)
D STATUS:       OPEN — HIGH
DETAILS:
  1) /api/orders/discount role guard `auth.role === 'cashier'` (role-name hardcoded,
     permission deyil) → waiter `discount.create`+`discount.approve` YOX olanda belə
     item_percent/discount_amount (hər qadəmsiz) tətbiq edə bilir.
  2) Tanınmayan `discount_type` (məs. 'order_percent' yazısı 'percent' olmalı) →
     `isOrderPercent=false` → guard-dan keçib generic apply (200). Input validation gap.
EVIDENCE:       A16e2e run (waiter 25% → 200) + route line 138-150
NEXT:           D-modul audit-də FIRST ITEM; fix = discount_type whitelist +
                role check → permission check (discount.create/discount.approve)
```

## A — FROZEN QAYDASI
A-modulun kodu bundan sonra YALNIZ bunlarda yenidən açılır:
(1) real production security vulnerability, (2) data corruption, (3) regression,
(4) frozen contract-da aşkar edilən səhv. "Yaxşılaşdıraq" motivi = YOX.
A-nın sənədləri: `A_FOUNDATION_GATE.md`, `AUDIT_PHASE1.md`, `AUDIT_A_FREEZE.md`,
`.a-regression.cjs` (permanent suite), migrations `20260911000004–8`.
