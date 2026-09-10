# A-FOUNDATION GATE (FROZEN — 2026-09-11)
> 4.1 (login_hardened) BAŞLAMAZDAN ƏVVƏL qapalı olmalıdır. Hər item: qərar + evidence.
> Gate açıqdırsa → 4.1 start ETMƏ.

## 1. PIN-only UX + threat model — **FROZEN: qəbul**
- 4-rəqəmli PIN saxlanılır (kassa UX, sən təsdiqlədin). Təhlükəsizlik PIN uzunluğuyla YOX: rate-limit + lockout + RBAC + location isolation + DB enforcement + audit.
- **Threat model qəbul:** PIN-only + username-yox → enumeration riski var. Qəbul: (a) generic error message ("Yanlış PIN" — staff adı/tərəf YOX — mövcud route-də belədir), (b) 20 active staff = kiçik search space, amma rate-limit (aşağı) onu qoruyur, (c) PIN 10000 kombinasiya → 5/5dəq lock ilə max ~5 cəhd/IP/5dəq.
- **Evidence:** staff count=20 active; `verifyPin` PBKDF2-260k.

## 2. PBKDF2 cost / DoS strategy — **FROZEN: bounded full-valid-hash loop**
- Sənin #1 təhqiri QƏBUL OLUNUB: "bütün staff üzərində loop" DoS riskidir.
- **Qərar:** loop yalnız **`is_active=true AND pin_hash LIKE 'pbkdf2_sha256$260000%'`** üzərində (valid-hash staff) — `active_valid_hash=5` (evidence). 5 × ~100ms ≈ **max 500ms/login** → bounded.
- Weak-hash staff (fakehash) login ET (A-09: login et + inactive + event) — loop-a daxil olmur.
- Staff sayı böyüdükcə (say > 50) → `settings.login_verify_mode = 'full_loop'|'first_match'` switch (vaxtilə plan, indi YOX).
- **Bounded cost = DoS qəbulu.**

## 3. Login enumeration protection — **FROZEN: generic + IP+staff double lock**
- Generic "Yanlış PIN" (mövcud). + `login_attempts` staff-dimension: **5 wrong/staff/15 dəq → `locked_until`** (staff lock) + **IP-dimension: 10 wrong/IP/5 dəq** (IP lock). İkiləməli lock = enumeration + brute-force hər ikisini qoruyur.

## 4. Session model — **FROZEN: mövcud modeli saxla, rolling rotation ET**
- Sənin #2 təhqiri QƏBUL: "köhnə token 2-ci request-də ölür" POS-da concurrent 401 yaradır → **ROLLING TOKEN LAYIQDIR (4.5 commit LAYIQ).**
- Session: 12h hard expiry + `last_activity_at` (mövcud, `set_session_staff`-də update olunur — evidence). Revocation: `status=REVOKED`/`revoked_at` (mövcud). Token UUIDv4 + httpOnly cookie (mövcud).
- Stolen-token qoruması: rolling YOX → əvəz: **session `ip` kolonu** (mövcud) + `user_agent` change alert (security_event) — concurrency-safe (idempotent update, 401 YOX).

## 5. RLS model + pin_hash — **FROZEN: mövcud + 2 kiçik fix**
- Sənin #4: raw `staff`-ın pin_hash-ini oxuya bilən rollar: **yalnız `service_role` (service_full_staff) + authenticated org-scope (staff_select_loc)**.
- **6 pin_hash RPC-lərinin HAMISI `SECURITY DEFINER`** (clock_in/out, create/update_staff_atomic, reset_staff_pin, verify_manager_pin — evidence) → heç biri PostgREST client call-ı ilə çata bilməz (service_role-only routes). **Leak YOX — gate PASS.**
- Qalan 2 fix (4.3): (a) `staff_select_loc`-a `pin_hash` column exclude (view), (b) `sessions_select_auth` → `user_id = current_staff_id()` qual.

## 6. authorize() trust boundary — **FROZEN: token-derived, p_performed_by = audit context**
- Sənin #5: **qismən həqiqət, qismən mövcud sistem artıq qoruyur:**
  - **Route qatı:** `requireAuth()` → session DB-dən → `auth.user.id` (evidence: void/route.ts:73 `effectiveActor = auth.user!.id`; line 137 `p_performed_by: auth.user?.id`). **Body-dən identity GƏLMİR — impersonation YOX.**
  - **RPC qatı:** 419 RPC-dən 134 `p_performed_by` alırlar (caller-supplied) amma 29 `p_token`, 18 `set_session_staff` çağırır. **FARQ = gap:** 105 RPC in-RPC authorize ETMİR → route guard-ına güvənir.
  - **Qərar (gate):** `p_performed_by` HƏR QAYDADA **audit context** — heç vaxt identity source DEYİL. Identity yalnız `set_session_staff(p_token)` → GUC (`app.current_staff_id`) → `current_staff_id()`. **Mandate (4.1+):** bütün 29 token-RPC-nin gövdəsinin ilk sətirində `set_session_staff(p_token)` varsa → PASS; 11 gap-də (29-18) backfill = **4.8 commit** (A RE-AUDIT-dən sonra, PHASE 2 əvvəlində).
  - **`set_session_staff` evidence:** token→session→expiry/revoked check→GUC set + `last_activity_at` update — mövcud, sağlam.

## 7. Location isolation — **FROZEN: mövcud `authorize(3)` + `staff_locations`**
- Evidence: `authorize(token, perm, location)` gövdəsi: session→staff→org match→**`staff_locations.active` check**→`role_permissions` — 6 qatlı, DB-də authoritative. **PASS (mövcud).**

## 8. Security vs business audit — **FROZEN: 2 ayrı cədvəl, birləşmə YOX**
- Sənin #7 QƏBUL: `security_events` (auth/lockout/deny/force) + `audit_logs_canonical`/`operation_logs` (business before/after) — **ayrı qalır.** 4.2 commit YALNIZ `security_events`-in auth event tiplərini genişləndirir; business audit-ə toxunmur.

## 9. Override execution-time expiry — **FROZEN: PASS (mövcud)**
- Sənin #6: **mövcud kodda artıq var** — `ensure_manager_override`: `mo.status='APPROVED' AND mo.expires_at > now()` (evidence); `approve_override`: `expires_at <= now()` → `EXPIRED` + exception (evidence). Cron YALNIZ təmizlik (4.6: `expire_overrides` job — qoruyucu, single-source deyil). **Gate PASS — planımı düzəltdim.**

## 10. Cookie `secure` dev — **FROZEN: mövcud davranış saxlanılır**
- Sənin #3 QƏBUL: "həmişə secure + localhost exception" tam dizayn deyil. **Qərar: mövcud code saxlanılır** (`secure: NODE_ENV==='production'` — localhost http dev-də cookie işləmir → UX kırılır, prod-da Secure). Dev config ayrıca (vaxtilə). **Gate PASS — 4.x-də cookie dəyişikliyi YOX.**

---

## GATE STATUS: ✅ BÜNDBAŞA QAPALI (10/10 FROZEN)

## Fix queue (yenidən tərtib — sənənin 7 təhqiri ilə)
| # | Commit | Məzmun | Layiq/daşınan |
|---|---|---|---|
| 4.1 | `login_hardened()` RPC | §2 bounded loop (5 valid hash), §3 double lock (IP+staff), generic error, login_attempts + security_events (1 transaction), banned pins (`0000`, `1234`, `1111`, `0001` — settings), weak-hash→inactive+event | — |
| 4.2 | security_events auth enum genişlənməsi | lockout/unlock/pin_change/pin_reset/staff_disabled/staff_enabled/role_changed (business-audita toxunmur) | — |
| 4.3 | RLS 2 fix | staff_select_loc pin_hash exclude (view) + sessions_select_auth user_id qual | — |
| 4.4 | data migration | 6 fake-hash staff inactive + banned pin live test | — |
| ~~4.5~~ | ~~rolling token~~ | **LAYIQ** (§4: concurrency risk) | → user_agent-change alert (4.2 daxil) |
| 4.6 | expire_overrides cron (təmizlik) | — | — |
| 4.7 | A RE-AUDIT | 24 check + concurrency matrix (22 test) | — |
| 4.8 | **YENİ:** 11 gap token-RPC `set_session_staff` backfill | §6 mandate — PHASE 2-dən ƏVVƏL | — |

**Hər checkpoint: E2E → commit → push. FAIL varsa növbəti commit YOX.**
