# E/S — FOUNDATION + CURRENT STATE AUDIT (2026-09-11)

> **Bu sənəd kod/fix DEYİL** — mövcud DB/code contract-ı + undefined qərarlar + critical tapıntılar.
> Bütün evidence = REAL DB (`jbxmlnsicbfkbsatnoej`) + repo source.
> **A (AUTH/RBAC) = FROZEN dependency** — identity/status/PIN/roles/locations/audit A-dan istifadə olunur, A audit EDİLMİR.
> Məqsəd: "100%" iddiası YOX — production contract-ların harası müəyyən, harası qırılıb, harası sənə qərardır.

---

## 🔴 CRITICAL (production-a buraxılmaz)

### S-01 — CLOCK-IN TAMAMİNLƏ QIRILIB (hər iki path)
**Sübut (live):** `clock_in(admin, '1871', 'audit_test')` → **`ERROR: null value in column "location_id" of relation "shifts" violates not-null constraint`**.
- `shifts.location_id` + `shifts.organization_id` = **NOT NULL**.
- `clock_in` gövdəsi: `INSERT INTO shifts (staff_id, opened_at, starting_cash)` — **location_id/organization_id YOX**.
- Trigger `enforce_shift_staff_org` yalnız **validasiya** edir (org match), **auto-fill ETMİR**.
- `clock_in_atomic` gövdəsi eyni pattern: `INSERT INTO shifts (staff_id, opened_at, notes)` — **eyni NOT NULL crash** (by inspection; eyni constraint).
- **Nəticə:** heç kim clock-in edə bilmir. 23 mövcud `time_clock_entries` 01.09-dan (location_id NOT NULL oldundandı). Bu, "clock in/out işləyir" iddiasının (əvvəlki 100%) **təzə sübutu edilməmiş qısqıcıdır**.

### S-02 — TIME-CLOCK IDOR (security)
**Sübut (source):** `/api/time-clock/[id]/clock-in|clock-out|break|status` route-ləri **`requireAuth`/`requirePermission` YOXDUR** — `svc()` ilə birbaşa service-role RPC, `[id]` URL-dən gəlir.
- Middleware default-deny **authentication** qoruyur (token yox → 401), amma **authorization YOX**: istənilən valide-session staff istənilən `staff_id` üçün clock-in/out/break edə bilir.
- Müqayisə: `close_shift` **ownership check**-i var (`Cannot close another staff shift`), `clock_in_atomic` session identity istifadə edir — amma `clock_in`/`clock_out`/`start_break`/`end_break` **caller-provided `p_staff_id`** alırlar, ownership/permission yoxlamaq YOX.
- **Nəticə:** waiter manager-in shift-inə clock-out/break edə bilər. A-dakı "caller-supplied identity trust edilmir" qaydasının S-də pozulması.

---

## 🟠 HIGH

### S-03 — PIN metodu parçalanıb (3 variant)
- `clock_in`/`clock_out` → **`md5(p_pin)`** (login PBKDF2-260k ilə **hər vaxt mismatch** → real PIN-lə clock-in "Invalid PIN" olur; live testdə PBKDF2 PIN `1871` → "Invalid PIN" sübut olundu).
- `clock_in_atomic` → **PIN YOX** (session trust).
- Login (A, frozen) → PBKDF2-260k.
- **Qərar lazımdır:** S-də təyinat = A-nın PBKDF2 modelinə uyğun (sabit, constant-time, ban/lock) yoxsa session-trust (atomic)? İndi hamısı yoxdur.

### S-04 — OVERTIME HEÇ VAXT HESABLANMIR
- `overtime_records` schema var, **0 row**.
- `overtime_thresholds`: daily 8h/1.5, weekly 40h/1.5, double 12h/2.0 (data mövcuddur).
- `get_overtime_summary` **read-only** (yalnız `SUM`); **heç bir generator RPC YOX** (overtime_records-a yazan fn tapılmadı).
- `payroll_entries.overtime_hours/overtime_pay` var amma heç vaxt doldurulmayıb.
- **Nəticə:** overtime = dead; payroll-də həmişə 0. Qərar + implementasiya lazımdır (s-06 bax).

### S-05 — TIMEZONE İŞLƏMİR (business date səhv)
- DB = **UTC** (`TimeZone=UTC`). `locations.timezone` = `Asia/Baku` (3/3) amma **heç yerdə istifadə olunmur**.
- 419 funksiyanın içində **`AT TIME ZONE` = 0**.
- `shifts.report_date DEFAULT CURRENT_DATE` → **UTC date**. 23:30 lokal (19:30 UTC) açılan shift → səhv business date; gün sərhədində clock-in/out → report/payroll date səhv.
- **Qərar (sən qeyd etdin):** UTC store + location tz display + business date in location tz — **implementasiya olunmayıb**.

---

## 🟡 MEDIUM

### S-06 — Break RPC-ləri permission-siz, caller staff_id
`start_break(p_staff_id, p_break_type)` / `end_break(p_staff_id)` → token/permission/ownership YOX (S-02-nin break versiyası).

### S-07 — `clock_out` hər açıq shift-i bağlayır
`clock_out`: `UPDATE shifts SET closed_at=NOW() WHERE staff_id=p_staff_id AND closed_at IS NULL` → bütün açıq shift-lər (1-open qaydası olsa da, defensive). `clock_out_atomic` fərqli. İki path = iki davranış.

### S-08 — Shift close: cash drawer + closed-correction qeyri-müəyyən
`close_shift` `expected_cash` vs `actual_cash` difference hesablayır amma **cash drawer session-a bağlanmır** (expected_cash hardcode 0). Açıq break varsa close-də auto-close ETMİR (yalnız `clock_out` etdi). Closed shift düzəlişi: `operation_logs` var amma explicit correction fn YOX.

### S-09 — Schedule overlap qorunmur
`trg_shift_no_overlap` **OPEN shift**-i qoruyur (1 staff = 1 open). `schedule` (planned) üzərində **overlap constraint YOX** → eyni staff 10-18 + 14-22 planlaşdırıla bilər.

---

## ⚪ LOW / QARAR (business decision)

### S-10 — Missed punch / retroactive correction fn YOX
`time_clock_entries.is_manual_entry` + `approved_by` kolonları var (səth) amma onları dolduran retroactive fn YOX. Manager correction = UI-səsiz.

### S-11 — Clock state = implicit (explicit column YOX)
State `shifts.closed_at IS NULL` + `shift_breaks.ended_at IS NULL`-dən **derived**. Ayrı `clock_status` column YOX. Concurrency + reporting üçün implicit derivasiya risklidir (s-01 belə sındı).

### E-01 — "Employment" fərqli konsepsiyaya malik deyil
E = staff master data + lifecycle + assignment. Hamısı **A (frozen)**-da: `status` (ACTIVE/INACTIVE/SUSPENDED), role_id, staff_locations, hourly_rate, audit. Ayrı "employment state"/hire date yoxdur — kiçik, ehtimal ki kifayət.

---

## 7 GATE SUALINA MÖVCUD CONTRACT vs UNDEFINED

| # | Sual | Mövcud contract (evidence) | Undefined / sənə qərar |
|---|---|---|---|
| 1 | **Shift ownership** | owner=`staff_id`; location=NOT NULL (amma auto-fill YOX); 1 staff=1 open (trigger DENY); `close_shift` ownership check var | transfer by manager (fn yox); clock-in/out ownership (S-02 qırılıb); 2 path davranışı fərqli |
| 2 | **Timezone** | DB=UTC; `locations.timezone` var (Asia/Baku) | business date in location tz (S-05 — implementasiya yox); display tz |
| 3 | **Clock state machine** | NOT_IN→IN→BREAK→OUT (derived); guards var (already-in, not-in, break-in-progress) | explicit column? (S-11); missed punch; duplicate clock_out |
| 4 | **Break policy** | `break_rules` 13 (role-specific, paid/unpaid); eligibility meal 5h/rest 2h; forgotten break auto-close on clock_out | max breaks/shift (enforce yox); retroactive/manager correction (fn yox); kim break-i force end edə bilər |
| 5 | **Overlapping shifts** | OPEN overlap = DENY (DB trigger) | SCHEDULED overlap (S-09 — qorunmur): ALLOW/DENY? |
| 6 | **Overtime** | thresholds + summary schema | generator (S-04 — yox); scheduled vs actual; break deduction; rounding; approval |
| 7 | **Shift close** | `close_shift`: session+ownership+difference+audit+double-close guard ( sağlam ) | cash drawer link (S-08); closed correction; open break on close |

---

## E vs S — ayrılma
- **E (Employees):** ~A (frozen) əsasında **sound**. Status lifecycle, PIN, roles, locations, audit hamısı A-da. E-nin əlavə audit yükü kiçik (E-01).
- **S (Staff/Shifts):** **2 CRITICAL + 3 HIGH** — clock-in qırılıb (S-01), IDOR (S-02), PIN split (S-03), overtime dead (S-04), timezone (S-05). S əsas işləmə sahəsidir.

---

## NÖVBƏTİ (sənin təsdiqindən sonra)
1. **Gate qərarları:** yuxarıdakı "sənə qərar" sütunları (özelliklə: ownership self-vs-manager, overtime hesab modeli, timezone, explicit clock status).
2. **Fix sırası:** S-01 (clock-in crash) + S-02 (IDOR) = əvvəl (blocker); sonra S-03/04/05.
3. **REAL DB E2E:** `clock in → break → break end → clock out → close → overtime → audit → reports` canlı.
4. **Concurrency battery:** parallel clock in/out, double close, break+close race, auto-clockout race.
5. **Regression suite** (A-nınki kimi) → **FULL RE-AUDIT** → 🔒 E/S FROZEN.

> **A-nı açmayacağam.** S-də A-dan gələn şey (status/PIN/session) dependency-dir; problem S implementasiyasıdır (S-01/S-02), A contract-ı sağlam.
