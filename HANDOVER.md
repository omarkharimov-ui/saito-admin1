# SAITO OS — HANDOVER KIT (hər yeni agent BURADAN başlayır)

> **Bu fayl sistemi davam etdirən agent-ə verilən ilk sənəddir.**
> Son yenilənmə: 2026-09-11. Agent dəyişdikdə, iş bitdikdə bu faylın `CARİ STATUS` bölməsini yeniləmək ZORUNLUDUR (aşağıda SYNC PROTOKOL).

---

## 1. MİSİYA

Saito = restoran Operating System (məqsəd: Toast / Square / Lightspeed parity).
Plan: **Addım 1 (təməli möhkəmləndir) → Addım 2 (yarımçıqları tamamla) → Addım 3 (yeni feature-lər, dalğalarla)**.

**MASTER PLAN = `MASTER_FEATURE_MAP.md`** (2026-09-11) — A→Z 30 modul, hər feature üçün REAL status (156 cədvəl / 419 RPC / 263 route inventar əsasında), DB/API/UI/permission xəritəsi, Toast/Square/Lightspeed parity, Wave A/B/C roadmap.
Tam plan checkbox-ları: **Notion səhifəsi** → link SECRETS.local.md-də (§4).

Qaynaq sənədlər:
- `MASTER_FEATURE_MAP.md` — **master plan (cari, 2026-09-11)**
- `MASTER_AUDIT.md`, `SAITO_ROADMAP.md`, `SAITO_OS_DATA_MAP.svg`, `code-quality-audit.md` — ⚠️ bu checkout-da YOXDUR (təhvil zamanında itki; məzmunu Notion planında qismən var). Yenidən lazımdırsa: audit REAL DB + routes əsasında `MASTER_FEATURE_MAP.md` §9-a görə yenidən qurulur.
- `AUDIT_REPORT.md`, `BACKEND_AUDIT_REPORT.md`, `D2_D5_FIX_REPORT.md`, `*_REPORT.md` — tarixi (repo root-da mövcuddur)
- `.db-inventory-2026-09-11.txt` — REAL DB inventar snapşotu (156 cədvəl + 419 funksiya imzaları + realtime pub + data nümunəsi)

---

## 2. QIZIL QAYDALAR (dəyişdirilmir)

1. **SSOT** — hər business əməliyyatın tək backend giriş nöqtəsi var (atomic RPC). Frontend heç vaxt bir neçə update-i koordinat ETMƏLİDİR.
2. **Arxitektura redizaynı YOX** — arxitektura artıq qərarlaşdırılıb. Yeni feature üçün sual: "bu operation hansı state-i dəyişir, hansı downstream təsirlənir?" — "UI-də harada olsun?" DEYİL.
3. **UX/UI = CORE FREEZE v1.0-dan SONRA.** Indiki faza (Addım 1) biznes-logicdir, dizayn toxunulmur.
4. **FROZEN yenidən audit EDİLMİR** — yalnız regression şübhəsində (§5 FROZEN list).
5. **Heç vaxt `psql --single-transaction`** içində `ROLLBACK` olan skriptlərə — auto-commit qaydası ilə işlə (in-file `BEGIN…ROLLBACK`).
6. **Test data artıq:** Tables 6/7 = zombie reservation (biznes qərarı gözləyir — toxunma). 9991 residue saxlanılır.
7. **Commit mesajı formatı:** `X.Y: qısa təsvir` (məs. `1.3: KDS realtime publication fix`). Hər tapşırıq = öz commit-i.

---

## 3. REPO QURULUŞU

```
/Users/mr.apple/saito-admin1/
├── HANDOVER.md              ← BU FAYL
├── MASTER_FEATURE_MAP.md    ← MASTER PLAN (A→Z 30 modul, REAL status)
├── SECRETS.local.md         ← girişlər (gitignored)
├── .credentials             ← token snapşot (gitignored)
├── .db-inventory-YYYY-MM-DD.txt ← REAL DB inventar snapşotları (gitignored; yeni snapshotlar lokal)
└── artifacts/saito-admin/   ← NEXT.JS app (Next.js 16, pnpm workspace)
    ├── .env.local           ← app secret-ləri (gitignored)
    ├── src/app/api/         ← 263 route
    ├── src/app/admin/pos/   ← POS terminal
    ├── src/context/, src/lib/
    └── supabase/            ← migrations (⚠️ lokal boşdur — migrations REAL DB-dədir; "supabase'i yoxla" = REAL DB, §4)
```

- **pnpm workspace**: root-da `pnpm dev` → `@workspace/saito-admin` → `next dev -p 3000`. (Bu makində `pnpm` PATH-də YOXDUR: `export PATH="$HOME/.npm-global/bin:$PATH"`.) İlk start-da supply-chain yoxlaması (1088 paket) bir neçə saniyə çəkir — normaldır.
- Build: `pnpm build` — hər commit-dən əvvəl ZORUNLU
- Git: origin = `github.com/omarkharimov-ui/saito-admin1` — token embedded remote-dadır (2026-09-11 yenilənib; push yoxlanıb, işləyir)
- Məlum repo məsələsi: dərin history-də 1 commit missing (709d1c59) — `git gc` / bəzi `git log --all` xəta verir amma commit/pull işləyir. **Toxunma.**

---

## 4. GİRİŞLƏR (access map)

| Nə | Harada |
|---|---|
| Supabase psql (REAL DB) | `SECRETS.local.md` → `psql` command hazır |
| Supabase URL / anon / service key | `artifacts/saito-admin/.env.local` (və SECRETS.local.md) |
| GitHub token | `git remote -v` embedded (2026-09-11 rotasiya edilib, push OK) + `.credentials` |
| Supabase CLI access token (sbp_) | `SECRETS.local.md` / `.credentials` |
| Notion plan səhifəsi | `SECRETS.local.md` → page id + URL |
| Notion API (agent üçün) | `accio-mcp-cli` → notion toolkit. Yeni agent: `plugin` action=install skill_id `notion`, sonra `apply`. Hesab: 6m6vx2bpg2@privaterelay.appleid.com (omar kharimov's Space) |

**"supabase'i yoxla" demək = REAL DB-yə psql ilə baxmaq** (repo-da SQL file-lərə DEYİL).

> Əgər `SECRETS.local.md` yoxdur (təmiz clone): `artifacts/saito-admin/.env.local`-dan qur — orada hamısı var (SUPABASE_URL, ANON, SERVICE_ROLE, DATABASE_URL, SUPABASE_DB_PASSWORD, CRON_SECRET).

---

## 5. CARİ STATUS

### Son etilən (VERIFIED/FROZEN)
- ✅ **E/S FOUNDATION FROZEN + S-01 + S-02** (2026-09-11, `4fc5f9d` `96d28d2` `2f0298b`): `ES_FOUNDATION_CURRENT_STATE.md` real-DB audit (2 CRITICAL + 3 HIGH). Gate qərarları FROZEN: **overtime = close-da `actual−break`, >8h/40h→1.5×/2.0× · timezone = UTC store + `location.timezone` · ownership = self + `timeclock.override` · sırası S-01→S-02→E2E→qalan S** (A YENİDƏN AÇILMIR). **S-01 FIXED** (mig `20260911000009`): clock-in/atomic `location_id`+`organization_id` primary-active `staff_locations`-dan resolve + `NO_LOCATION_ASSIGNED` guard (live proof: shift `has_loc/has_org=t`). **S-02 FIXED** (mig `20260911000010`+`11`): 6 uuid-identity RPC → 6 `*_token` RPC (identity=`set_session_staff`, target=self OR `timeclock.override`) + 7 route switched + legacy DROPPED (0-caller sweep) + null-PIN bypass fixed (live proof: waiter→other=**PERMISSION_DENIED IDOR CLOSED**, self=OK, manager→other=OK override=true, expired=**Session expired**). **AÇIQ: S-03 (PIN md5 vs PBKDF2 split — real staff clock-in blocker), S-04 (overtime generator), S-05 (timezone `AT TIME ZONE`), S-06..09 (med/low). Növbəti = S-03.**
- ✅ **D-6 + D-7** (commit `8c7f587`, migration `20260908000005`, LIVE): `complete_payment_atomic_v2` — idempotency dedupe, refund guard, overpay guard, atomic ledger insert. Real parallel psql race-lərlə təsdiq (double-charge YOX).
- ✅ **D-2 + D-5** (commit `22508af`, migration `20260908000006`, LIVE): split location inherit; takeaway/delivery location guard + server-side `resolve_staff_location` (`src/lib/location-context.ts`).
- ✅ **FULL TORTURE RE-RUN PASS** (commit `073a5ce`) — R1–R4 + L1–L4 + integrity sweep, zero residue.
- ✅ **P0-1..P0-5 hamısı TAM** (2026-09-10): CSRF (`c317b71`) · 7 no-auth route guard (`90021fe`) · realtime pub 12 cədvəl (`aa66c58`) · D-8 refund chain LIVE (migration `20260910000002`, `83cecbc`) · **Total SSOT + VAT 1.5**: `calculate_order_total_v3` LIVE (migration `20260910000003`, `390d455`, E2E GREEN) + VAT bug fix (migration `20260910000004`) + POS/QR toggle UI (`64ff651`, `076c9a0`) + `/api/orders/apply-vat` + `/api/public/vat-config` + **1.5 FIX2** (UI toggle state in-place yenilənməsi, build green).
- ✅ **1.5 FIX2 gözləyir:** POS səhifəsində HARD REFRESH (Cmd+Shift+R) + canlı test (toggle ON → 200→236, OFF → 200/0).
- 🔒 **A — AUTHENTICATION/RBAC = FROZEN** (2026-09-11, `d84c20e`): regression **39/39 PASS** (`.a-regression.cjs`), 5 real bug fixed (migrations `20260911000004–8`), RLS sikkası, banned-PIN hard policy, weak-hash 13 staff SUSPENDED, PIN rotation (Admin=1871, Tural=3099 — eski 1234/0000 reject). **A-nı yalnız real security vuln / data corruption / regression / frozen-contract səhvində aç.** Sənədlər: `AUDIT_A_FREEZE.md`, `A_FOUNDATION_GATE.md`, `AUDIT_PHASE1.md`. **D-01 (discount role-guard + type validation) D-a keçdi: A NOT BLOCKING, D OPEN-HIGH.**
- ✅ **A#1 — Outbox consumer + CRON SCHEDULER** (2026-09-11, migrations `20260911000001`+`20260911000002` LIVE): `outbox_pump()` SSOT consumer (claim FOR UPDATE SKIP LOCKED, batch, linear backoff, dead-letter `dead`) + `outbox_dispatch()` (order paid/cancelled, payment.failed, refund, inventory low-stock dedupe handlers) + `process_expired_reservations_atomic()` (confirmed→no_show 15d grace / pending→cancelled, table release via existing trigger, guard-protected skip). **pg_cron 6 job LIVE** (outbox-pump */30s, kitchen-schedules */60s, auto-no-show */15s, stock-thresholds */5d, expired-reservations */15s, tip-shortfall 01:00 UTC). Backlog 455→0 drained. **Pre-existing bug FIXED:** `process_due_kitchen_schedules()` invalid `INSERT…SELECT` SETOF body (heç vaxt işləməyib) → proper PL/pgSQL `RETURN NEXT`; cron run verified `succeeded`. E2E GREEN (5 ssenari + dead-letter), zero residue.

### FROZEN-VERIFIED (yenidən audit etmə — regression yoxlaması istisna)
Payment core (D-6/D-7) · merge/unmerge/transfer V2 contracts · D-2/D-5 location propagation · inventory consume/waste · agg/reconciler trigger · Z-report · auth core · order state machine · **Total SSOT engine (calculate_order_total_v3 + 20260910000004)** · **Outbox consumer (outbox_pump/outbox_dispatch) + pg_cron scheduler** (A#1) · **🔒 A — AUTHENTICATION/RBAC** (2026-09-11, `d84c20e`, 39/39 regression; açma şərti: real security vuln / data corruption / regression / frozen-contract səhvi — `AUDIT_A_FREEZE.md`) · **🔒 E/S FOUNDATION CONTRACT-ları** (2026-09-11: overtime/timezone/ownership qərarları + S-01 clock-in location resolve + S-02 token-RPC IDOR — `ES_FOUNDATION_CURRENT_STATE.md`; açma şərti: contract səhvi / regression; A dependency toxunulmur).

### AÇIQ (növbəti — `MASTER_FEATURE_MAP.md` §9-a bax, orada tam Wave planı var)
**E/S (Staff/Shifts — foundation frozen, S işləmə):** Növbəti: **S-03** PIN unify (`clock_in_token`/`clock_out_token` md5 → PBKDF2 verify; A frozen login toxunulmur) → **S-05** timezone (`AT TIME ZONE` + `report_date` location-local) → **S-04** overtime generator (close-da) → S-06..09 → **REAL DB E2E** (clock-in→break→out→close→overtime→audit) → concurrency battery → regression → **E/S FREEZE**. Detallı tapıntılar: `ES_FOUNDATION_CURRENT_STATE.md`.
**Addım 2 (Wave A → B):** ~~outbox consumer~~ ✅ A#1 · QR anon customer access · gift card UI · customer timeline UI · daily operating checklists · waitlist SMS + reservation reminder · ~~cron verification~~ ✅ A#1 (6 job LIVE) · device registry + print routing · loyalty tiers/birthday UI (Q2) · online ordering (customer UI) · kiosk · upsell UI · batch/expiry tracking · table analytics bloku.
**Addım 3 (Wave C):** payment terminal (Q7) · offline-first (Q8) · marketing stack (SMS/email/push, Q10) · delivery aggregators · outbound API/webhooks · accounting integration · multi-location central.

### Qərarlar gözləyir (Notion §0)
~~Q1 VAT~~ ✅ **BİTİB (1.5, 2026-09-10)**. Gözləyir: **Q2 loyalty build/cut · Q3 gift cards · Q4 waitlist · Q7 terminal provider (kritik — offline/pay-at-table/chargeback bloklarını açır) · Q8 offline-first · Q10 push token.**

---

## 6. SYNC PROTOKOL (hər agent ZORUNLU)

### İşə BAŞLARKAN
1. Bu faylı (HANDOVER.md) BAŞDAN AXXA oxu.
2. `SECRETS.local.md` ilə DB + Notion-a giriş al.
3. `MASTER_FEATURE_MAP.md` §9 (Wave plan) + Notion səhifəsini aç → tikli/bos checkbox-lara bax → **nə harada dayandı** müəyyən et.
4. `git status` + `git log --oneline -10` — uncommitted iş var?
5. YENİDƏN AUDIT ETMƏ (MASTER_FEATURE_MAP var). FROZEN-a toxunma.

### Hər TAMAMLANAN tapşırıqdan SONRA (X.Y) — və HƏR dəyişiklikdən sonra
> **⚠️ MÜTƏLƏQ QAYDA: hər dəyişiklikdən (commit / fix / status dəyişikliyi / qərar) SONRA
> DEYİŞİKLİK JURNALINA (§6.3) yeni sətir əlavə ET. Jurnal yenilənməyən commit = bitmiş sayılmır.
> Qayda agent dəyişsə belə qalır — heç bir dəyişiklik yaddan çıxmasın.**

1. **Test/build**: `pnpm build` green (feature işindənsə + E2E smoke).
2. **Commit**: `X.Y: təsvir` (yalnız həmin tapşırıq faylları).
3. **HANDOVER.md yenilə**: §5-də tapşırıq "AÇIQ"dan "son etilən"ə köçür (commit hash + tarix) + `MASTER_FEATURE_MAP.md`-a müvafiq modulda status sütununu (✅/🟡/⚪/❌) yenilə.
4. **JURNAL** (ZORUNLU): §6.3 DEYİŞİKLİK JURNALINA yeni sətir əlavə et (format: `YYYY-MM-DD — X.Y — nə etdin — commit <hash7> — status`). Notion versiyasına da aynısını qoy.
5. **Notion sync** (accio-mcp-cli / notion plugin):
   - tapşırıq + sub-checkbox-ların üstünə tik qoy,
   - tapşırıq altına qeyd: `YYYY-MM-DD: bitdi — commit <hash7>`,
   - status dəyişibsə (məs. "🔴 18" → "🔴 17") son bölməni yenilə,
   - Notion "DEYİŞİKLİK JURNALI" section-unun sONUNA ayni sətir əlavə et.
   - Notion-a giriş yoxdursa: §6.3 jurnalına `Notion tiklənib YOX — <tarix>` qeyd et (növbəti agent tikləsin).
6. **Push** (token remote-dadır; 401-dirsə qeyd et, davam et — lokal commit kifayətdir).

### 6.3 DEYİŞİKLİK JURNALI (ZORUNLU — hər dəyişiklikdən sonra sətir əlavə et)
> Format: `YYYY-MM-DD — X.Y — nə etdin — commit <hash7> — status`. Yeni sətir HAMİŞƏ SONA.
> Bu jurnal Notion-da da aynıdır ("DEYİŞİKLİK JURNALI" section). İkisi eyni olmalıdır.

- `2026-09-09 — AUDIT — MASTER AUDİT tamam (142 feature, P0-5, A–Z xəritəsi) — MASTER_AUDIT.md — 87🟢/31🟡/18🔴/6⛔`
- `2026-09-09 — HANDOVER — HANDOVER.md + SECRETS.local.md + Notion plan yaradıldı — commit 0bfc0d0 — Addım 1 hazırdır`
- `2026-09-09 — CHECKLIST — TAM A–Z + Layer 4 Notion səhifəsi (475 feature, 38 modul, checkbox) — səhifə 3d678888-d173-81d4-92db — qurma xəritəsi hazırdır`
- `2026-09-10 — 1.1 — FIX-1 CSRF bitirildi (singleton token + apiFetch conversions) — commit c317b71 — P0-1 TAM, build green`
- `2026-09-10 — 1.2 — 7 route-a requirePermission guards (cash/recon, handover, schedule, messages) — commit 90021fe — P0-2 TAM, build green, anon → middleware 307 + route 401/403`
- `2026-09-10 — 1.3 — Realtime pub: +kitchen_tickets, +inventory_logs, +cash_drawer_sessions (idempotent migration, LIVE) — commit aa66c58 — P0-3 TAM, pub=12 cədvəl`
- `2026-09-10 — Q1 — VAT QƏRAR (təsdiqlənib): Tax-Exclusive default (Baku) + opt-in "ƏDV Tətbiq Et" düyməsi (POS+QR). Settings: vat_enabled / vat_percentage(18) / auto_apply_vat. Tək canonical SSOT engine: Total = Subtotal + (VAT%×Subtotal) + Service — status: QƏRAR`
- `2026-09-10 — 1.4 — D-8 refund chain: 5 blocker dizayn + migration (REVIEW, dry-run ROLLBACK təsdiqi) — commit 83cecbc — gözləyir: R1/R2 + apply təsdiqi`
- `2026-09-10 — 1.4 APPLY — migration 20260910000002 LIVE (R1=saxla, R2=1.5-ə). 5/5 fix verified live. E2E GREEN (full/partial→reopen→repay) + double-stock guard + ZERO RESIDU (stock=144, op=61, il=709) — P0-4 TAM`
- `2026-09-10 — 1.5 — TOTAL SSOT + VAT: canonical engine calculate_order_total_v3 + D-9 (qty recompute) + void + create_takeaway SSOT + settings vat_* + orders.apply_vat. Migration 20260910000003 (dry-run clean) — gözləyir: R1 (service əsası) + R2 (auto_apply_vat) + R3 (QR sərbəst) + apply`
- `2026-09-10 — 1.5 APPLY — migration 20260910000003 LIVE (R1=service on Subtotal, R2=auto_apply_vat, R3=QR sərbəst/POS PIN). Engine E2E GREEN (S1 vat-off=150, S2 vat-on=177, S2b svc=7.50 R1-verified, S3 void=59, S4 D-9 qty=118, S4b no-double-vat) + zero residu (orders=691, op=61) — commit 390d455 (migration) + bu`
- `2026-09-10 — 1.5 UI — POS VAT toggle (ActionSheet, manager PIN via PinGuard 'vat' + server re-verify) + QR sərbəst toggle (menu, /api/public/vat-config) + /api/orders/apply-vat + qr route SSOT (apply_vat → calculate_order_total_v3). Client display-only, final = server SSOT. Master switch: vat_enabled=false zamanı toggle ON da VAT bloklanır. Build green, RPC E2E GREEN (177/27 params) — commit 64ff651 + 076c9a0 — P0-5 TAM (engine+UI). Qeyd: /api/orders/qr hazırda staff-auth tələb edir (anon = Wave A)`
- `2026-09-10 — 1.5 FIX — VAT BUG ("0 tətbiq edildi + toggle off qalır"): root cause = engine vat_enabled master gate (Q1 dizayn səhvi — toggle authority olmalı idi). Fix: migration 20260910000004 (engine: IF p_apply_vat YALNIZ, master gate kalk; vat_enabled = UI visibility). LIVE VERIFIED: ON → 200→236 (tax 36/18%), OFF → 200/0, apply_vat persist, 0 residu`
- `2026-09-10 — 1.5 FIX2 — UI toggle state bug ("toggle off olaraq qalır"): actionSheetTable/selectedTable snapshot idi. Fix: handleToggleVat response (total+tax+apply_vat) ilə selectedTable.orders[0] in-place yenilənir + toast tax_amount göstərir ("+₼36.00 — cəm ₼236"). Build green. Gözləyir: HARD REFRESH (Cmd+Shift+R) + canlı test`
- `2026-09-11 — 1.6 — MASTER FEATURE MAP (A→Z 30 modul, REAL DB inventar 156 cədvəl/419 RPC/263 route) + HANDOVER jurnal sıxlama — commit dedf822 — master plan hazırdır`
- `2026-09-11 — 2.1 — A#1 Outbox consumer + CRON SCHEDULER: outbox_pump() SSOT (claim SKIP LOCKED, backoff, dead-letter) + outbox_dispatch() (paid/cancelled/pay-failed/refund/low-stock dedupe handlers) + process_expired_reservations_atomic() (guard-protected). pg_cron 7 job LIVE (stock-thresholds */5d). 2 pre-existing bug fixed: process_due_kitchen_schedules() invalid SETOF body + check_stock_thresholds() ambiguous cols + notification spam. Backlog 455→0. E2E GREEN (5 ssenari + dead-letter), bütün cron runs succeeded, zero residue. Migrations 20260911000001..3 LIVE — A#1 TAM — commit 5ad54e4 — Notion tiklənib YOX (2026-09-11, növbəti agent tikləsin)`
- `2026-09-11 — 2.2 — UI AUDIT (browser, 17 route, PIN 1234 superadmin): 15 OK / 0 ERROR / 2 PARTIAL. CRITICAL: /admin/pos-da məhsul menyu render olunmur (cart əlçatmaz) — backend add_item_atomic işləyir → frontend location-context/render issue. HIGH: /reservation hydration crash (EN/AZ i18n). MEDIUM: settings 3 raw i18n key (TAB_HOURS/TAB_PRINTER/TAB_PAYROLL), TableCard key warning, POS-də VAT toggle tapılmadı. Sənəd: UI_AUDIT_2026-09-11.md — status: AÇIQ (2.2-də debug)`
- `2026-09-11 — 3.1 — CONTRACT AUDIT PHASE 1 (A/E+S/Z/Infra): framework + A-modul TAM (24 check: 17 PASS/3 PARTIAL/3 FAIL-CRITICAL → NO-GO). CRITICAL: brute-force lock API-də bağlı DEYL (login_attempts=0), PIN 0000 canlı (waiter), 6 staff fake pin_hash. E+S partial (break/overtime 0 real data). Sənədlər: AUDIT_FRAMEWORK.md + AUDIT_PHASE1.md. Fix queue: A-CRIT-1..3. Növbəti: E+S/Z tamamlama + PHASE 2 (O/B/P/V/D)`
- \`2026-09-11 — 4.1 — A-FOUNDATION GATE (10/10 FROZEN) + login_hardened: login_preflight (IP rate-limit 10/5d + global backstop 50/5d + candidate list) + login_commit (single-tx: per-staff lock 5/15d, session ACTIVE/12h/org/loc, login_attempts + security_events atomic, banned-PIN soft flag, weak-hash guard). PBKDF2 verify Node-da (PG17 native yox, bounded 5 valid-hash). Route rewrite. LIVE E2E GREEN: correct PIN→200+pinChangeRequired, 10 wrong→401+audit, 11th correct→429. Zero residue. Sənəd: A_FOUNDATION_GATE.md — commit def8806 — A-modul: 3 CRITICAL-dən 2-i (brute-force + login_attempts) FIXED, qalan (banned-PIN data) 4.4-də\`
- `2026-09-11 — 4.2 — A-FREEZE: 5 real production bug fixed (force_logout_staff broken log_audit call → 0 session revoke; revoked sessions honored in validateAuth+middleware; staff status raw-update → set_staff_status_atomic; TERMINATED→INACTIVE enum bug; 5 unpinned SECURITY DEFINER). Migrations 20260911000004–8 LIVE+registry (8/8). Regression 39/39 PASS (harness .a-regression.cjs). PIN rotation: Admin→1871, Tural→3099 (banned-PIN hard reject live). Deferred D-01: discount route role-guard + type validation (A NOT BLOCKING, D OPEN-HIGH). Sənəd: AUDIT_A_FREEZE.md — commit d84c20e — 🔒 A = FROZEN`
- `2026-09-11 — 5.1 — E/S FOUNDATION FROZEN + S-01 FIXED: ES_FOUNDATION_CURRENT_STATE.md (2 CRITICAL: S-01 clock-in NOT NULL crash, S-02 time-clock IDOR; 3 HIGH: S-03 PIN split md5/PBKDF2, S-04 overtime dead, S-05 timezone). Gate qərarları frozen (overtime on close 1.5x/2.0x, UTC+location tz, self+manager timeclock.override, S-01/S-02 first). S-01 LIVE (migration 20260911000009): clock_in/clock_in_atomic location/org resolve from primary active staff_locations; NO_LOCATION_ASSIGNED clean error. Live proof: shift has_loc/has_org=t, double-clock guard, zero residue. S-02 AÇIQ — commit bu`
- `2026-09-11 — 5.2 — S-02 FIXED (time-clock IDOR): 6 legacy uuid-identity RPC (clock_in/clock_out/start_break/end_break/clock_in_atomic/clock_out_atomic) → 6 *_token RPC (identity=set_session_staff(p_token), target=self OR timeclock.override). 7 route switched (time-clock/[id]/{clock-in,clock-out,break}, staff/clock, pos/staff/clock, shifts POST+PATCH). Legacy DROPPED (0 source + 0 DB caller sweep). Live proof: waiter→other=PERMISSION_DENIED(IDOR CLOSED), self=success, manager→other=success override=true, expired-token=Session expired. Zero residue. Migrations 20260911000010+11 — commit bu`
- `2026-09-11 — 5.4 — S-03 FIXED (clock-in/out PIN md5→A-frozen verifyPin): clock_in_token/clock_out_token PIN-agnostic oldu (md5 DB-dən TAM çıxı), 3 route PIN verify TS-ə köçdü (A-frozen verifyPin PBKDF2-260k, target pin_hash). Migration 20260911000012. Live proof: A-format hash → clock_in+clock_out success, audit pin_verified_by=route_verifyPin, old 4-arg overload 0, residue 0. A regression 39/39 (A toxunulmadı). Növbəti=S-05 timezone — commit bu`
- `2026-09-11 — 5.5 — S-05 FIXED (timezone: UTC store + location-local business date): `local_day(ts,location_id)` helper (AT TIME ZONE locations.timezone); clock_in_token day-guard+report_date → local; get_time_clock_status business_date/today/weekly → local (+ date-numeric cast bug fixed); open_shift report_date → local; finance/close-day route → session location tz (lib/timezone.ts: dayInTz/localDayRange/localWeekRange, DST-safe 23h/25h gün). Migration 20260911000013. Live proof DISCRIMINATING (Pacific/Pago_Pago UTC-11): UTC date=09-11 → shift report_date=**09-10 (local)** OK; get_time_clock_status business_date=09-10+tz; Node DST: Vilnius 2026-03-29 = 23h gün OK; Baku 24h OK. A regression 39/39. Residue 0 — commit bu`
- `2026-09-11 — 5.6 — S-04 FIXED (overtime generator): `calculate_shift_overtime(shift_id)` close-da hesab — worked=actual−break, day-tiered (8h→1.5×, 12h→2.0×), week>40h→1.5× (daily/double net), location-local business_date (S-05), idempotent (staff+day/week, approved-lər toxunulmur, approval-lock). Hook: close_shift + clock_out_token + clock_out_atomic_token. `overtime_records.business_date` əlavə; get_overtime_summary business_date üzrə + total_amount. Migration 20260911000014. Live proof P1–P7 (10h→2h@1.5=30, 13h→4h@1.5+1h@2.0, 9h−1h break=8h→0, 42h→2h weekly, no-double, approval-lock), A 39/39, residue 0 — commit bu`
- `2026-09-11 — 5.7 — S-09 FIXED (scheduled overlap = DENY, frozen): exclusion constraint `schedule_no_staff_overlap` (btree_gist, tsrange [start,end) per staff+date — boundary touch ALLOW) + create_schedule/update_schedule hardened (raw-INSERT bypass-da belə blok). Migration 20260911000015. Live proof P1-P9: overlap DENY, 18:00 boundary ALLOW, different date ALLOW, raw bypass DENY, update→overlap DENY, REAL CONCURRENCY (2 parallel psql: 1 wins, 1 conflict), residue 0, A 39/39 — commit bu
### Agent/credits DEYİŞƏNDƏ
- Yuxarıdakı addımlar (özelliklə jurnal) edilibsə → yeni agent §6.1 ilə başlayır, problem YOX.
- Ən vacib: **uncommitted iş qoyma**. Half-done tapşırıqda dayandınsan: ya bitir, ya §5-ə dəqiq qeyd et + jurnal sətiri.

---

## 7. TƏHLÜKƏ ZONALARI

- **PUL:** payment core FROZEN-dir. `complete_payment_atomic_v2`-yə toxunmaq = torture re-run tələb edir.
- **DELETE-ALL:** sentinel UUID-lə "delete all" helper-ləri var (products/inventory/recipes clear-all) — İŞLETMƏ.
- **Zombie data:** tables 6/7, 9991 residue — toxunma.
- **Dev backdoor:** `pos/page.tsx:276` dev-session superadmin (dev-guard) — prod bundle-a diqqət (P2).
- **Realtime:** publication-da olmayan cədvəl = KDS/inventory miss. Yeni cədvəl realtime lazımdırsa PUBLICATION-a əlavə et.
- **Outbox:** consumer **LIVE** (`outbox_pump`, pg_cron */30s) — `outbox_events`-a yeni event tipli feature əlavə edirsənsə `outbox_dispatch()`-də handler qur (yoxsa `noop` → backlog drain). Dead-letter = `status='dead'` (UI-də göstərilə bilər). İcazəli notification tipləri: `payment, reservation, order, kitchen, stock, campaign, system, order_cancelled` (digər `type` = `notifications_type_check` violation).
- **pg_cron:** `postgres` roluna `cron.schedule(text,text,text)` icazəsi var; `cron.job` DDL-ə **direkt INSERT YOX** — job əlavə/sil `cron.schedule(...)` / `cron.unschedule(...)` ilə. Run statusu: `cron.job_run_details`.

---
*Bu fayl sistemi SİZİDİR. Agent dəyişir, qaydalar qalır.*
