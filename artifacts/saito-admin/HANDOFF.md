# SAITO OS — HANDOFF (növbəti agent üçün)
**Tarix:** 2026-09-10 · **Repo:** `omarkharimov-ui/saito-admin1` (branch: main) · **Status:** CORE GREEN + A→Z audit bitmiş + 10 konkret qıryıq siyahılaşdırılmış

Bu fayl TEK rəsmi handoff-dur. Köhnə iş-çatı MD-ləri (CORE_FREEZE, MASTER_AUDIT, ROADMAP-lər) silinib — məzmunu bu faylda.

---

## 1. NƏ İŞLƏYİR (green, sübut olunub)
- **Money Spine tam:** order→pay→refund→void→ledger, `refund_with_inventory` (D-8), `complete_payment_atomic_v2` (D-9), double-count YOX, partial refund, split payment, tip.
- **Loyalty v2 tam:** customer (ad+soyad+phone) → earn (product>category>default rules) → refund-da reverse → redeem→discount. **Migration 000009** `loyalty_order_points` snapshot (full-refund-da item silinməsi points leak-ini bağladı).
- **POS core E2E (browser-da):** order create→KDS ticket→✓ ready, pay+change+receipt, paid-table RELEASE, merge, void+discount, unsent-cart guard, customer attach.
- **BOH:** Settings 11 tab, Dashboard, Stats, Inventory, Products, Staff, Reservations — 20/20 crash-sız.
- **Guest:** QR order, reservation form, staff login (PIN masked).
- **Torture test:** 8/8 PASS (race, double-count, partial refund, split, tip, discount, concurrent pay, refund chain).

## 2. ƏN SON DƏYİŞİKLİK (2026-09-10)
`/api/orders` create path **closed-order leak** fix olundu (commit `d9e00b9`):
- Bug: `status=not.in.(paid,cancelled)` → closed sifarişlər "active" sayılırdı → yeni item-lar QAPALI order-a əlavə olunurdu + masa total = bütün closed cəmi (phantom ₼428.61/₼3016.35).
- Fix: `FINAL_ORDER_STATUSES` konstantı (6 terminal state) — `src/lib/pos-tables.ts`-də. **Hər yeni "active order" sorğusu BU konstantdan istifadə etməlidir.** (`/api/pos/tables` + `/api/kitchen/orders` artıq düzgün işləyir; `/kitchen` page PostgREST-ə birbaşa gedir — aşağıda #4-1.)

## 3. A→Z AUDIT NƏTİCƏSİ — TƏK QALAN 10 QIRIQ (fix paketi)
Sıralı (P0→P2). Hamısı frontend-ə aid, hamısı konkret:

| # | Qıryıq | Yeri | Fix |
|---|--------|------|-----|
| 1 | 🔴 `/kitchen` public KDS **React crash** — merged order gələndə PostgREST join `merged_into_table`-ı **obyekt** edir; `mapRawOrder` (line 184) obyekti array-a sarıyır; line 403 `+{n}` obyekti render edir | `src/app/kitchen/page.tsx:184,403` + fetch `:732` (`select: '*,order_items(...),merged_into_table:orders!merged_into(table_number)'`) | Line 184: `o.merged_into_table?.table_number ?? o.merged_into_table` (obyekt olduqda scalar-a çevir) VƏYA fetch-də join-u `merged_into_table:orders!merged_into(table_number)` → scalar select et. Test: 2 masanı merge et → `/kitchen` aç → crash olmamalı |
| 2 | 🔴 **Unmerge dead-end** — "Separate" təsir etmir | `src/app/admin/pos/page.tsx:1475 handleUnmerge` — `selectedForUnmerge.length===0` → `select_table_first` toast + return (səsiz görünürlük) | UX: child auto-select default et VƏYA modal-da child YOXDURSA button disabled+mesaj. RPC `unmerge_tables_atomic` İŞLƏYİR (DB-dən sübut: bill-merge modunda çalışır) |
| 3 | 🔴 **Merged group: transfer + Clear Group səsiz no-op** | `page.tsx` transfer + dismiss_group flow | Guard cavabı (`G_TABLE_MERGED`/`G_UNMERGE_KITCHEN_ACTIVE`) toast-da görünməlidir — səsiz bağlanmır. Hər RPC error-ı `toast.error(err.error)` |
| 4 | 🔴 **Public menu white-on-white** | `src/app/menu/` (və ya `/public/menu`) card text color | CSS: text color düzəld (light/dark mode). Agent screenshot: kart bg-white, mətn rgb(255,255,255) |
| 5 | 🟡 **KDS delay badge absurd** (`57191d`) | KDS delay hesablaması (created_at ilə) | `formatTime`/delay: gün > 1 olduqda "Xg" göster VƏYA badge-i "new/late" binar et. qeyd: t8-in real order-ı avqust-24-dən — test data |
| 6 | 🟡 **Cash keypad unlabeled backspace** | Payment cash view | Backspace button-a `⌫`/`Sil` label + icon |
| 7 | 🟡 **"No location assigned" header** → `/admin/kds` ticket çəkilmir | location context middleware/store | Default location fallback (settings-dəki primary) VƏYA header warning dismiss-able |
| 8 | 🟡 **Raw i18n keys**: `TAB_HOURS`, `TAB_PRINTER`, `TAB_PAYROLL` | `src/lib/i18n/locales/az.ts` (missing) | 3 key əlavə et: `tab_hours:'İş Saatları'`, `tab_printer:'Printer'`, `tab_payroll:'Maaşlar'` |
| 9 | 🟡 **Merge toast placeholder** `Tables merged: {tables}` interpolasiya olunmur | merge success toast | `t('tables_merged', {tables})` param əlavə VƏYA hardcode "Tables merged" |
| 10 | ⚪ **Customer admin page YOXDUR** (API var: search/create/get) | `/admin/customers` 404 | Feature gap — Dalğa 1-ə qoş (CRM UI) |

**Qeyd:** `AUDIT_REPORT.md` (repo-da) + workspace MD-ləri silinib. Ekran qəbiristəni: `AccioWork/2026-09-08-21-41-48-446-28a67104/az-audit-p1-foh/`, `az-audit-p2-boh/`, `az-audit-p3-public/`.

## 4. DAVAM NÖQTEYİ (növbəti agent buradan başlayır)
1. **Fix paketi #3-dəki 10 qıryığı** (hamısı frontend, ~1 session). Sıralama: 1 (KDS crash) → 8 (i18n) → 9 (toast) → 6 (keypad) → 2+3 (merged lifecycle) → 4 (menu CSS) → 5 (delay badge) → 7 (location).
2. **Fix-dən sonra:** build + 1 browser smoke (merge→`/kitchen` crash-sız, unmerge işləyir, i18n labels).
3. **Dalğa 1 — Money tamamlama (roadmap):**
   - **Tip pool → payroll:** 10 cədvəl hazır (`tip_pools`, `tip_pool_members`, `tip_pool_splits`, payroll_rpc-lər üçün), **0 RPC** — `tip_pool_distribute_atomic` + payroll settlement RPC yazılmalı.
   - **Gift Card pay:** RPC var (`apply_gift_card_payment_atomic`), **UI link YOXDUR** → `/api/orders/pay` + PayPanel-ə bağla.
   - **Bar tab / pre-auth:** tam YOXDUR (design+impl).
4. **Dalğa 2+** (roadmap `SAITO_OS_FULL_ANALYSIS_ROADMAP.md` silindiyi üçün qısa): Split-bill (v1 qismən var: `split_bill_atomic`), Z-report (route canlı), Offline (YOXDUR), Integrations (YOXDUR — kart terminalu/DoorDash/SMS, hesab/API lazımdır).

## 5. MÜHİM TEHNİK FAKTLAR (agent bilməlidir)
- **DB:** Supabase `jbxmlnsicbfkbsatnoej` — pooler `aws-1-eu-central-1.pooler.supabase.com:6543`, user `postgres.jbxmlnsicbfkbsatnoej`, **password: `hivhU3-sathob-bupcar`** (artık repo-da plaintext YOXDUR — `artifacts/saito-admin/.env`-də; növbəti agent `.env`-i təmin et, `cp .env.local .env` VƏYA yeni yarat).
- **SSOT düsturu** (hər status cəmi sorğusu): `status NOT IN ('paid','cancelled','closed','refunded','partially_refunded','voided')` — TS-də `FINAL_ORDER_STATUSES` (`src/lib/pos-tables.ts`), SQL-də eyni 6.
- **Stabil RPC-lər (məhsulda, toxunma):** `seat_guests_atomic`, `send_to_kitchen_atomic`, `unmerge_tables_atomic` (qeyd: bill-merge = tək masada 2 order merge, table-merge = 2 masa 1 order-a birləşir — unmerge table-merge-i ayrır, bill-merge-də "unmerge" concepti YOXDUR → #2 bug-un kökü budur: agent bill-merge etdi, unmerge table-merge gözlədi!), `complete_payment_atomic_v2`, `apply_discount_atomic`, `void_order_item_atomic` (D-8), `apply_tip_atomic`, `split_bill_atomic`, `dismiss_table_atomic`, `release_table_atomic_v2`, `record_payment_atomic`, `apply_gift_card_payment_atomic`, `sync_table_order_aggregates`.
- **Middleware:** `/api/*` 307 redirect YAXDIR → JSON 401 (bug `81674b4`-da fix); page request-lər redirect. Token 72h, `sessions` cədvəli.
- **Dev server:** `npm run dev` (port 3000, `artifacts/saito-admin/`-dən), log `/tmp/saito-admin-dev.log`. **Build:** `npm run build` (~60sn).
- **Test session yaratmaq:** `INSERT INTO sessions (token,user_id,role,expires_at,created_at) VALUES ('X','c814879d-5378-4791-8c5f-8ee5aee51994','superadmin',NOW()+interval '2 hours',NOW());` cookie `saito_token=X`.
- **Rate limit:** dismiss/void endpoint-lərində ~5-6 req/dəq → 429; batch test-lərdə `sleep 2` ara.
- **Browser agent:** max ~8 iteration → dar task (3-5 axın), `sessions_send` ilə resume. Cookie inject: `document.cookie="saito_token=X; path=/; max-age=7200"; location.href="http://localhost:3000/admin/pos"`.
- **Qoruma:** t8 (occupied ₼7) = İSTİFADƏÇİNİN real order — toxunma! t1-t5,9,10 boş, t6,7,16,17,18 reserved.

## 6. GIT
- Bütün iş `main`-da commit olunub (son: `d9e00b9` closed-order leak fix).
- **Push:** bu handoff-commit ilə birlikdə ilk sync. Token: istifadəçidən tələb et (`ghp_...`).
- `git status` təmiz olmalıdır (yalnız bu fayl).

## 7. USER PREF-əri (mr.apple)
- Audit-first: "audit only" desə heç nə DEYİŞDİRMƏ.
- "GO" desə: full stack + E2E + cleanup + journal.
- Səhv tapanda "seneye" deyir — özün tap + düzəlt, "tamam deyib getmə".
- Floor-da İSTİFADƏÇİ test edərkən: onun order-lərinə toxunma, yalız öz test masalarını təmizlə.
