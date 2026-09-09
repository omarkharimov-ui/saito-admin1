
- `2026-09-10 — 1.5 — TOTAL SSOT + VAT: canonical engine calculate_order_total_v3 + D-9 (qty recompute) + void + create_takeaway SSOT + settings vat_* + orders.apply_vat. Qərar: tax-exclusive default, opt-in VAT, POS toggle = manager PIN (b), QR = sərbəst. Migration 20260910000003 (dry-run clean, APPLY olunmayıb) — gözləyir: R1 (service əsası) + R2 (auto_apply_vat) + R3 (QR sərbəst) + apply`# SAITO OS — HANDOVER KIT (hər yeni agent BURADAN başlayır)

- `2026-09-10 — 1.5 APPLY — migration 20260910000003 LIVE (R1=service on Subtotal, R2=auto_apply_vat, R3=QR sərbəst/POS PIN). Engine E2E GREEN (S1 vat-off=150, S2 vat-on=177, S2b svc=7.50 R1-verified, S3 void recompute=59, S4 D-9 qty=118, S4b stable no-double-vat) + zero residu (settings restore false/18/false, orders=691, op=61). UI Addım 3 qalıb — commit 390d455 (migration) + bu`

- `2026-09-10 — 1.5 UI — POS VAT toggle (ActionSheet, manager PIN via PinGuard action 'vat' + server re-verify discount.approve) + QR sərbəst toggle (menu/page.tsx, /api/public/vat-config) + /api/orders/apply-vat route + qr route SSOT call (apply_vat flag → calculate_order_total_v3). Client display-only (təxmin), final = server SSOT. Master switch: settings.vat_enabled=false zamanı toggle ON da VAT bloklanır (safe default). Build green (0 error), RPC contract E2E GREEN (177/27 named params, master gate, zero residu) — commit 64ff651 + 076c9a0 — P0-5 TAM (engine+UI). Qeyd: /api/orders/qr indiki halda staff-auth tələb edir (anon customer access = Wave A scope) |`> **Bu fayl sistemi davam etdirən agent-ə verilən ilk sənəddir.**
> Son yenilənmə: 2026-09-09. Agent dəyişdikdə, iş bitdikdə bu faylın `CARİ STATUS` bölməsini yeniləmək ZORUNLUDUR (aşağıda SYNC PROTOKOL).

---

## 1. MİSİYA

Saito = restoran Operating System (məqsəd: Toast / Square / Lightspeed parity).
Plan: **Addım 1 (təməli möhkəmləndir, ~2 həftə) → Addım 2 (yarımçıqları tamamla) → Addım 3 (yeni feature-lər, dalğalarla)**.
Tam plan, checkbox-larla: **Notion səhifəsi** → link SECRETS.local.md-dədir (aşağı §4).

Qaynaq sənədlər (repo root-da):
- `MASTER_AUDIT.md` — 17 sahə, 142 feature, P0–P3 (2026-09-09 read-only audit)
- `SAITO_ROADMAP.md` — planın tam versiyası
- `SAITO_OS_DATA_MAP.svg` — 154 cədvəlin FK xəritəsi
- `code-quality-audit.md` — dead/dup/any sweep
- `AUDIT_REPORT.md`, `BACKEND_AUDIT_REPORT.md`, `D2_D5_FIX_REPORT.md` — tarixi

> **Qeyd:** köhnə `HANDOVER.md` (backend audit davamı) tarixidir — onun qızıl qaydaları (§2) qüvvədədir, amma statusu köhnədir. Status üçün YALNIZ bu faylın §5 + Notion.

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
├── SECRETS.local.md         ← girişlər (gitignored; burada yoxdursa, yenidən yarat §4)
├── MASTER_AUDIT.md, SAITO_ROADMAP.md, SAITO_OS_DATA_MAP.svg
└── artifacts/saito-admin/   ← NEXT.JS app (Next.js 16)
    ├── .env.local           ← app secret-ləri (gitignored)
    ├── src/app/api/         ← 256 route
    ├── src/app/admin/pos/   ← POS terminal
    ├── src/context/, src/lib/
    └── supabase/            ← migrations
```

- Dev server: `cd artifacts/saito-admin && npm run dev` (:3000, log `/tmp/saito-admin-dev.log`)
- Build: `npm run build` — hər commit-dən əvvəl ZORUNLU
- Git: origin = `github.com/omarkharimov-ui/saito-admin1` — **push 401** (token sərf oldu, §5). Token əvəz olunmadan push yoxdur.
- Məlum repo məsələsi: dərin history-də 1 commit missing (709d1c59) — `git gc` xəta verir amma commit/pull işləyir. **Toxunma.**

---

## 4. GİRİŞLƏR (access map)

| Nə | Harada |
|---|---|
| Supabase psql (REAL DB) | `SECRETS.local.md` → `psql` command hazır |
| Supabase URL / anon / service key | `artifacts/saito-admin/.env.local` (və SECRETS.local.md) |
| GitHub token | `git remote -v` içində embedded (hələ sərf olub — əvəzləmək lazımdır) |
| Notion plan səhifəsi | `SECRETS.local.md` → page id + URL |
| Notion API (agent üçün) | `accio-mcp-cli` → notion toolkit. Yeni agent: `plugin` action=install skill_id `notion`, sonra `apply`. Hesab: 6m6vx2bpg2@privaterelay.appleid.com (omar kharimov's Space) |

**"supabase'i yoxla" demək = REAL DB-yə psql ilə baxmaq** (repo-da SQL file-lərə DEYİL).

> Əgər `SECRETS.local.md` yoxdur (təmiz clone): `artifacts/saito-admin/.env.local`-dan qur — orada hamısı var (SUPABASE_URL, ANON, SERVICE_ROLE, DATABASE_URL, SUPABASE_DB_PASSWORD, CRON_SECRET).

---

## 5. CARİ STATUS

### Son etilən (VERIFIED/FROZEN)
- ✅ **D-6 + D-7** (commit `8c7f587`, migration `20260908000005`, LIVE): `complete_payment_atomic_v2` — idempotency dedupe, refund guard, overpay guard, atomic ledger insert. Real parallel psql race-lərlə təsdiq (double-charge YOX).
- ✅ **D-2 + D-5** (commit `22508af`, migration `20260908000006`, LIVE): split location inherit; takeaway/delivery location guard + server-side `resolve_staff_location` (`src/lib/location-context.ts`).
- ✅ **FULL TORTURE RE-RUN PASS** (commit `073a5ce`) — R1–R4 + L1–L4 + integrity sweep, zero residue.
- ✅ Commit chain (local): `… → 8c7f587 → 073a5ce → 22508af` (origin-dən qabaqda, push BLOCKED)

### FROZEN-VERIFIED (yenidən audit etmə — regression yoxlaması istisna)
Payment core (D-6/D-7) · merge/unmerge/transfer V2 contracts · D-2/D-5 location propagation · inventory consume/waste · agg/reconciler trigger · Z-report · auth core · order state machine.

### AÇIQ (P0 — Addım 1-in işi, Notion-da da aynısı var)
| # | Məsələ | Status |
|---|---|---|
| ~~P0-1~~ | ~~FIX-1 CSRF~~ | ✅ **2026-09-10 — commit c317b71** (build green; POS op-lar CSRF-süz) |
| ~~P0-2~~ | ~~No-auth routes~~ | ✅ **2026-09-10 — commit 90021fe**. Dəqiqləşmə: həqiqi no-auth 7 idi (sensei/ocr/vision/discrepancies/costs/stats artıq validateAuth istifadə edirdi). 7 route-a requirePermission: cash/recon(+[id]), handover, schedule(+swap+[id]), messages. Middleware artıq redirect verirdi (307) — route-level = defense-in-depth. |
| ~~P0-3~~ | ~~Realtime pub~~ | ✅ **2026-09-10 — commit aa66c58, LIVE**. `supabase_realtime` = 12 cədvəl (+kitchen_tickets, +inventory_logs, +cash_drawer_sessions). Qeyd: KDS artıq orders kanalından realtime işləyirdi (15s polling + orders realtime); bu fix = direct ticket/inventory/drawer realtime yolu. |
| ~~P0-4~~ | ~~D-8 refund chain~~ | ✅ **2026-09-10 — LIVE (commit 83cecbc)**: 5/5 fix applied+verified. E2E GREEN (full/partial refund→reopen→repay, double-stock guard, zero residu). R1=saxla, R2=1.5-ə |
| ~~P0-5~~ | ~~Total SSOT~~ | ✅ **2026-09-10 — TAM (engine+UI)**: canonical engine calculate_order_total_v3 LIVE (390d455, E2E GREEN R1-verified) + UI toggle POS(manager PIN 64ff651)/QR(sərbəst 076c9a0) + /apply-vat + /public/vat-config + qr route SSOT. Client display-only. Master switch=settings.vat_enabled. Qeyd: 14 client formula-ların hamısı display-only-ya çevrilmədi (qr route SSOT-a bağlandı; discount route client hesabı qalıb = P2) |

### P1–P3 (qısa)
O-1 dismiss-on-occupied · B-2 unmerge occ+occ (browser repro) · active-location persist (0/310) · gift card/loyalty/PO/stock-count/couriers = boş (Addım 2) · outbox consumer yox (220 event) · cron unverified · 300 orphan fn / 91 orphan route / 24 dead module · `:any` 1079.

### Qərarlar gözləyir (Notion §0)
Q1 VAT (8-ci günə qədər) · Q2 loyalty build/cut · Q3 gift cards · Q4 waitlist · Q7 terminal provider · Q8 offline-first · Q10 push token.

---

## 6. SYNC PROTOKOL (hər agent ZORUNLU)

### İşə BAŞLARKAN
1. Bu faylı (HANDOVER.md) BAŞDAN AXXA oxu.
2. `SECRETS.local.md` ilə DB + Notion-a giriş al.
3. Notion səhifəsini aç → tikli/bos checkbox-lara bax → **nə harada dayandı** müəyyən et.
4. `git status` + `git log --oneline -10` — uncommitted iş var?
5. YENİDƏN AUDIT ETMƏ (MASTER_AUDIT var). FROZEN-a toxunma.

### Hər TAMAMLANAN tapşırıqdan SONRA (X.Y) — və HƏR dəyişiklikdən sonra
> **⚠️ MÜTƏLƏQ QAYDA: hər dəyişiklikdən (commit / fix / status dəyişikliyi / qərar) SONRA
> DEYİŞİKLİK JURNALINA (§6.3) yeni sətir əlavə ET. Jurnal yenilənməyən commit = bitmiş sayılmır.
> Qayda agent dəyişsə belə qalır — heç bir dəyişiklik yaddan çıxmasın.**

1. **Test/build**: `npm run build` green (feature işindənsə + E2E smoke).
2. **Commit**: `X.Y: təsvir` (yalnız həmin tapşırıq faylları).
3. **HANDOVER.md yenilə**: §5-də tapşırıq "AÇIQ"dan "son etilən"ə köçür (commit hash + tarix).
4. **JURNAL** (ZORUNLU): §6.3 DEYİŞİKLİK JURNALINA yeni sətir əlavə et (format: `YYYY-MM-DD — X.Y — nə etdin — commit <hash7> — status`). Notion versiyasına da aynısını qoy.
5. **Notion sync** (accio-mcp-cli / notion plugin):
   - tapşırıq + sub-checkbox-ların üstünə tik qoy,
   - tapşırıq altına qeyd: `YYYY-MM-DD: bitdi — commit <hash7>`,
   - status dəyişibsə (məs. "🔴 18" → "🔴 17") son bölməni yenilə,
   - Notion "DEYİŞİKLİK JURNALI" section-unun sONUNA ayni sətir əlavə et.
   - Notion-a giriş yoxdursa: §6.3 jurnalına `Notion tiklənib YOX — <tarix>` qeyd et (növbəti agent tikləsin).
6. **Push** (token işləyirsə; 401-dirsə qeyd et, davam et — lokal commit kifayətdir).

### 6.3 DEYİŞİKLİK JURNALI (ZORUNLU — hər dəyişiklikdən sonra sətir əlavə et)
> Format: `YYYY-MM-DD — X.Y — nə etdin — commit <hash7> — status`. Yeni sətir HAMİŞƏ SONA.
> Bu jurnal Notion-da da aynıdır ("DEYİŞİKLİK JURNALI" section). İkisi eyni olmalıdır.

- `2026-09-09 — AUDIT — MASTER AUDİT tamam (142 feature, P0-5, A–Z xəritəsi) — MASTER_AUDIT.md — 87🟢/31🟡/18🔴/6⛔`
- `2026-09-09 — HANDOVER — HANDOVER.md + SECRETS.local.md + Notion plan yaradıldı — commit 0bfc0d0 — Addım 1 hazırdır`
- `2026-09-09 — CHECKLIST — TAM A–Z + Layer 4 Notion səhifəsi (475 feature, 38 modul, checkbox) — səhifə 3d678888-d173-81d4-92db — qurma xəritəsi hazırdır`
- `2026-09-10 — 1.1 — FIX-1 CSRF bitirildi (singleton token + apiFetch conversions) — commit c317b71 — P0-1 TAM, build green`
- `2026-09-10 — 1.3 — Realtime pub: +kitchen_tickets, +inventory_logs, +cash_drawer_sessions (idempotent migration, LIVE) — commit aa66c58 — P0-3 TAM, pub=12 cədvəl`
- `2026-09-10 — 1.2 — 7 route-a requirePermission guards (cash/recon, handover, schedule, messages) — commit 90021fe — P0-2 TAM, build green, anon → middleware 307 + route 401/403`
- `2026-09-10 — Q1 — VAT QƏRAR (təsdiqlənib): Tax-Exclusive default (Baku) + opt-in "ƏDV Tətbiq Et" düyməsi (POS+QR). Settings: vat_enabled(false) / vat_percentage(18) / auto_apply_vat(false). Tək canonical SSOT engine: Total = Subtotal + (VAT%×Subtotal) + Service; VAT=0 əgər düymə basılmayıb. 1.4/1.5 dizaynı buna görə — status: QƏRAR`
- `2026-09-10 — 1.4 — D-8 refund chain: 5 blocker dizayn + migration (REVIEW, APPLY olunmayıb, dry-run ROLLBACK təsdiqi) — commit 83cecbc — gözləyir: sən R1/R2 + apply təsdiqi`
### Agent/credits DEYİŞƏNDƏ
- Yuxarıdakı addımlar (özelliklə jurnal) edilibsə → yeni agent §6.1 ilə başlayır, problem YOX.
- Ən vacib: **uncommitted iş qoyma**. Half-done tapşırıqda dayandınsan: ya bitir, ya §5-ə dəqiq qeyd et + jurnal sətiri ("1.4: blocker 2-5 qalıb, migration yarımçıq — ROLLBACK edilib").

---

## 7. TƏHLÜKƏ ZONALARI

- **PUL:** payment core FROZEN-dir. `complete_payment_atomic_v2`-yə toxunmaq = torture re-run tələb edir.
- **DELETE-ALL:** sentinel UUID-lə "delete all" helper-ləri var (products/inventory/recipes clear-all) — İŞLETMƏ.
- **Zombie data:** tables 6/7, 9991 residue — toxunma.
- **Dev backdoor:** `pos/page.tsx:276` dev-session superadmin (dev-guard) — prod bundle-a diqqət (P2).
- **Realtime:** publication-da olmayan cədvəl = KDS/inventory miss. Yeni cədvəl realtime lazımdırsa PUBLICATION-a əlavə et.

---
*Bu fayl sistemi SİZİDİR. Agent dəyişir, qaydalar qalır.*

- `2026-09-10 — 1.4 APPLY — migration 20260910000002 LIVE apply olundu (sən təsdiq: R1=saxla, R2=1.5-ə). 5/5 fix verified live. E2E GREEN (2 ssenari: full-refund→reopen→repay, partial→reopen) + double-stock guard təsdiq + ZERO RESIDU (stock=144, op=61, il=709) — P0-4 TAM, commit 83cecbc (migration) + bu journal`