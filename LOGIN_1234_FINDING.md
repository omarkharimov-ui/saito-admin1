# P0 — "Superadmin + 1234 → wrong PIN" — root-cause proof (2026-09-11)

> **VERDICT: NOT a regression. The frozen A contract is intact and behaving correctly.**
> `1234` is the **pre-rotation** admin PIN. The A freeze rotated it to a new canonical
> admin PIN (per A-freeze evidence). `1234` now (a) matches **zero** active staff hashes
> and (b) is a **banned default PIN**, so it is hard-rejected by design.
> **A is not re-opened.** No A business logic was changed (read-only investigation).

## How the login actually works (source)

- `components/StaffLogin.tsx:30` — the UI sends **only** `{ pin }`. No staff id, role, or
  name is in the payload. "Superadmin" is a role *label* in the UI; it is **not** an
  identity the server uses to pick a record.
- `/api/auth/staff-login` (frozen) does 3 phases:
  1. `login_preflight(p_ip)` → IP rate-limit + list of **active staff candidates** (with their
     pbkdf2 hash, `weak` flag).
  2. **PBKDF2 verify in Node** — the entered PIN is checked against ALL valid-hash
     candidates; `matched` = the single record whose hash verifies (constant-cost loop).
  3. `login_commit(...)` → single-DB-transaction: `FOR UPDATE`, inactive/lockout/weak-hash
     rejects, **`p_pin_banned` → hard reject**, else create session + audit.
- `BANNED_PINS = {0000, 1234, 1111, 0001, 2222, ...}` — **`1234` is banned** (A G1 hard policy).

## Real-DB evidence

| Check | Result |
|---|---|
| Superadmin staff records | **2**: `Admin Updated` (4e25370a…) and `superadmin` (c814879d…). Both `is_active=true`, `status=ACTIVE`, **pbkdf2 hash present**. |
| Does `1234` match **any** active staff hash? | **NO — 0/14** active pbkdf2-hashed candidates verify `1234`. (boolean-only check; hash never printed) |
| Does the rotated admin PIN match? | **YES — exactly 1** active staff (`Admin Updated`, the A-regression superadmin). |
| `1234` in frozen `BANNED_PINS`? | **YES** → even if it matched, it would hard-reject (`banned_pin`). |
| Recent login attempts for superadmins | The 4 failures at **17:18:16–17:18:28** are all `staff=NULL, success=false, reason=invalid_pin` — i.e. the PIN matched **no hash** (Phase 2 no-match → `login_commit(p_success:false, p_candidate_id:null)`). Consistent with `1234`. |
| `1234` ever reaching the banned-pin branch? | **No** — DB shows `invalid_pin`, not `banned_pin`, because verification already failed first. |
| Lockout state (both superadmins) | `failed_login_attempts=0`, `locked_until=none` — **not locked**. |
| Last successful superadmin login | `Admin Updated` @ **16:42:20** (with the rotated PIN). The other record has never logged in. |
| A regression login check (rotated PIN) | **PASS** — `.a-regression.cjs` logs in via the real route with the rotated admin PIN and is part of the just-run **A 39/39**. → the login path itself is healthy. |
| Dev server build | pid 22096, cwd = this app, clean `next dev` (restarted during O final-gate); **not** a stale build. |

## Exact reject stage

`1234` is rejected at **Phase 2 (PBKDF2 verify)**: it matches no active staff hash →
`matched = null` → `login_commit(p_success:false, p_candidate_id:null, reason='invalid_pin')`
→ HTTP **401 "Yanlış PIN"**. It does not reach the banned-PIN branch (verification fails first),
which is why the DB logs `invalid_pin`, not `banned_pin`. Both are correct rejections.

## Conclusion

- `Superadmin + 1234` → "wrong PIN" is **EXPECTED** after the A-freeze PIN rotation. `1234` is
  both non-canonical (no hash matches) **and** a banned default.
- The correct login is the **rotated admin PIN** (the A-regression canonical superadmin PIN,
  already proven working by A 39/39 this session).
- **No A change, no O change, no K scope impact.** A frozen contract confirmed healthy.
- Minor observation (not a defect): there are **two** `superadmin`-role records; login is
  PIN-only, so the one whose hash verifies (the rotated admin) is the one that logs in — both are
  superadmin-role, so access is correct.

## Nothing changed

Read-only investigation. No PIN or hash was logged/exposed (all checks returned booleans).
No code, migration, or A/O/F contract was modified. Proceed to K-0 after this.
