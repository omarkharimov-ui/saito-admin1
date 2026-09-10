# SAITO OS — CONTRACT AUDIT: PHASE 1 (Foundation/Security) — 2026-09-11

> Framework: `AUDIT_FRAMEWORK.md`. Yalnız tool evidence ilə verdict; "kod var" ≠ PASS.
> Status: **A-modul TAM** (evidence aşağıda) · E/S, Z, Infrastructure = **QISMƏN** (addım limit; növbəti sessiya).

---

## A — AUTHENTICATION / RBAC

| ID | Check | Verdict | Evidence |
|---|---|---|---|
| A-01 | Identity: tək canonical (staff), auth.users ilə ikinci identity YOX | ✅ PASS | `auth.users count=0 \| staff=22` |
| A-02 | Staff state kolonları (status enum, locked_until) | ✅ PASS | staff: `is_active, status, ...` + `check_login_allowed` gövdəsində `locked_until` |
| A-03 | Session schema (token, expiry, revoke, location, org) | ✅ PASS | sessions: `token, expires_at, revoked_at, active_location_id, organization_id, status, last_activity_at, ip` |
| A-04 | Unauthenticated API → 401 | ✅ PASS | `curl /api/orders` → **401** |
| A-05 | Wrong PIN → 401 + security_event | ✅ PASS | `curl -d pin:9999` → 401 `{"error":"Yanlış PIN"}`; security_events: `login_failed {invalid_pin}` |
| A-06 | Correct PIN → session (12h) + cookie | ✅ PASS | `pin:1234` → 200 + token + `expiresAt` +12h; cookie `httpOnly:true, secure:prod, sameSite:lax` |
| A-07 | **Brute-force rate-limit (check_login_rate_limit) API-də bağlıdır?** | ❌ **FAIL (CRITICAL)** | `grep rate_limit\|locked\|check_login app/api/auth/staff-login/route.ts` → **NONE**. RPC mövcuddur amma route istifadə ETMİR — sonsuz wrong-PIN cəhdi mümkün |
| A-08 | **login_attempts doldurulur?** | ❌ **FAIL (CRITICAL)** | `SELECT count(*) FROM login_attempts` → **0** (təcrübəlik wrong PIN-lərdən sonra belə). Audit trail + rate-limit ikisi də bu cədvəldən asılıdır |
| A-09 | **Zəif default PIN canlı istifadədə** | ❌ **FAIL (CRITICAL)** | `pin:0000` → **200 + session** (waiter "Tural Memmedov"). 4-4 rəqəmli guess = 10000 kombinasiya; lock yoxdur (A-07) |
| A-10 | **Fake pin_hash data (6 staff)** | ⚠️ PARTIAL | `pbkdf2$10000$fakehash1..5` (Ayşə, Murad, Səbinə, Elvin, Nərmin + 1) — login ETMƏLİDİR amma active statusda qalıb |
| A-11 | Session expiry (expired token → 401 + delete + audit) | ✅ PASS | `validateAuth()` gövdəsi: expiry → `session_expired` event + delete |
| A-12 | **Disabled staff → active session invalid olunur** | ✅ PASS | **LIVE TEST**: waiter session 200 → `is_active=false` → write endpoint `/api/orders/discount` → **401 "Account disabled"**; session DELETE (count=0); restore OK |
| A-13 | Logout (revoke + cookie clear) | ✅ PASS | logout route: `revoked_at` update + `saito_token`/`saito_csrf` clear (httpOnly) |
| A-14 | Authorization: requirePermission → has_permission RPC + 403 + audit | ✅ PASS | `api-auth.ts`: `rpc('has_permission')` → deny → `permission_denied` security_event + 403; RPC gövdəsi: role_permissions JOIN + `is_active` check |
| A-15 | Hardcoded role bypass (superadmin/admin if) API routes-da | ✅ PASS | `grep role === 'superadmin'\|is_superadmin app/api` → **0** nəticə |
| A-16 | Manager override (verify_manager_pin/ensure_manager_override) API-də istifadə | ✅ PASS | 7+ route-də istifadə (P0-2 qeydi + grep) |
| A-17 | RLS critical tables (staff/sessions/roles/permissions/settings/audit/security) | ✅ PASS | 8/8 cədvəldə `rls=true` + policy-lər |
| A-18 | RLS: anon staff oxuya bilmir | ✅ PASS | `has_table_privilege('anon','staff','SELECT')` = **false** |
| A-19 | **RLS: authenticated istənilən session token-lərini oxuya bilər** | ⚠️ PARTIAL | `sessions_select_auth` policy qual = **`true`** (user_id filter YOX) — token enumeration riski (cookie httpOnly olduğuna görə browser-dən çətin, amma DB səviyyəsində açıq) |
| A-20 | **RLS: authenticated staff digərlərinin pin_hash-i oxuna bilər** | ⚠️ PARTIAL | `staff_select_loc` qual = `is_superadmin() OR has_org_access(organization_id)` — **pin_hash exclude YOX**; app API service_role + sanitizeStaff istifadə edir (qorunur) amma DB səviyyəsində column qorunması YOX |
| A-21 | Middleware: API 307→HTML vermirlər (JSON 401) | ✅ PASS | middleware.ts: API call üçün explicit JSON 401 qaydası |
| A-22 | **Read-only endpoint disabled-staff üçün** | ⚠️ PARTIAL | LIVE TEST: `/api/pos/session` disabled waiter üçün **200** qaytardı (write 401 idi) — session endpoint validateAuth deyil, daha zəif guard istifadə edir |
| A-23 | Audit: login/failed/permission_denied/session_expired/account_disabled | ✅ PASS | security_events-da `login, login_failed` canlı görünüb; digər 3 tipi `validateAuth`/`requirePermission` gövdələrində insert |
| A-24 | Named RPC routes auth (generic proxy YOX) | ✅ PASS | `/api/rpc/*` = 6 adlandırılmış route (heç biri generic); `transition_order_status`-də `requireAuth/validateAuth` var (count=2) |

### A — HECSAB
- Checks: 24 · **PASS: 17 · PARTIAL: 3 · FAIL: 3 (bütün 3-ü CRITICAL)**
- **Score = (17 + 1.5) / 21 = 88.1%**
- **VERDICT: 🛑 NO-GO** — score ≥ 90% olmasa da, 3 critical security FAIL (brute-force yoxdur, login_attempts boşdur, PIN 0000 canlıdır) → production-a buraxılmamalı.

### A — FIX QUEUE (FOUND→CLASSIFY; fix növbəti sessiyada, frozen contract-a toxunmur)
1. **CRIT-1:** `staff-login` route-da `check_login_allowed` + `record_login_attempt` + `check_login_rate_limit` bağla (RPC-lər mövcuddur — yalnız wiring).
2. **CRIT-2:** `login_attempts` insert-i route-da et (indi `security_events`-ə gedir, `login_attempts` boş qalır).
3. **CRIT-3:** Default/zəif PIN-lər: `0000`-ı qadağa (login route-da reject) + 6 fake-pin_hash staff-ı inactive və ya real PIN-a köçür (data migration).
4. HIGH: `sessions_select_auth`-a `user_id = (current staff)` qual; `staff_select_loc`-dan `pin_hash` exclude (v-view və ya qual).
5. MED: `/api/pos/session` guard-ını `validateAuth`-a çək (A-22).

---

## E — EMPLOYEES / S — STAFF/SHIFTS (QISMƏN — addım limiti)

| ID | Check | Verdict | Evidence |
|---|---|---|---|
| E-01 | Break rules configured | ✅ PASS | `break_rules`: 13 qayda (sütun adları: duration_minutes deyil — digər, verify pending) |
| E-02 | Overtime thresholds configured | ✅ PASS | `overtime_thresholds`: daily 8h×1.5, weekly 40h×1.5, double 12h×2.0 (active) |
| E-03 | **Break tracking REAL istifadə** | ❌ FAIL | `shift_breaks=0`, `break_adherence=0`, `break_compliance=0` — engine mövcuddur, heç vaxt çalışmayıb |
| E-04 | **Overtime REAL generasiya** | ❌ FAIL | `overtime_records=0` — threshold var, record yoxdur |
| E-05 | Clock in/out REAL data | ⚠️ PARTIAL | 23 entry (15 in / 8 out), PIN-verified, son: 01.09 (stale) |
| E-06 | Shift lifecycle | ⚠️ PARTIAL | 70 shift, hamısı CLOSED, son: 01.09 (stale) |
| E-07 | Auto-clockout cron REAL iş | ✅ PASS | `shifts WHERE auto_closed` = 10, son: 02.09 — cron həqiqətən bağlayıb |
| S-01 | Schedule | ⚠️ PARTIAL | 48 entry amma hamısı keçmişdə (02.09–08.09), gələcəyə 0 |
| S-02..S-10 | Shift close/cash variance/swap/handover/parallel-close | ⏸ QALIB | növbəti sessiya |

**E+S Score: hesablanmayıb** (6/10 check evidence ilə: 2 PASS + 4 PARTIAL-ish + 2 FAIL → təxmini ~40-50%, **NO-GO** — real data + concurrency testləri qalıb).

## Z — MULTI-LOCATION (QISMƏN)
Evidence toplanmayıb (addım limiti). Növbəti sessiya: `has_location_access/has_row_access/enforce_*_location` live cross-location IDOR testləri.

## INFRA (QISMƏN — A#1 əsasında)
| ID | Check | Verdict | Evidence |
|---|---|---|---|
| I-01 | Cron 7 job status | ✅ PASS | 7/7 `latest=succeeded` (job_run_details) |
| I-02 | Outbox pump + dead-letter | ✅ PASS | A#1 E2E (455→0, dead-letter verified) |
| I-03 | Pump idempotency (2x eyni batch) | ⏸ QALIB | növbəti sessiya |
| I-04 | Realtime pub coverage (12/156 cədvəl) | ⏸ QALIB | növbəti sessiya |

---

## PHASE 1 ÜMUMİ
- **A: NO-GO** (3 critical) · **E+S: NO-GO (partial)** (0 real break/overtime data) · **Z: BLOCKED (start qalmayıb)** · **Infra: partial GO**
- Ən vacib fix queue: **A-CRIT-1..3** (login security) → E/S canlı data testləri → Z cross-location.

*Framework + bu report: AUDIT_FRAMEWORK.md, AUDIT_PHASE1.md. Növbəti: PHASE 1 tamamlanması + PHASE 2 (O/B/P/V/D core transaction).*
