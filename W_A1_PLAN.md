# W-A1: Guest channel — QR sifarişində müştəri identifikasiyası (PLAN + DELEGATED GO)

> **Tarix:** 2026-09-19 · **Status:** IN PROGRESS · **Master map:** MASTER_FEATURE_MAP.md §0.3 (Q), §8.1, Wave A #1
>
> **Governance dəyişikliyi (owner, 2026-09-19):** "Hard stop uže senin qərarında olacaq —
> dayanmana ehtiyac yoxdur." → Wave A qərarları agent-ə **delegasiya** olunub. Hər qərar bu
> faylın §5 decision log-una yazılır. Red lines (data təhlükəsizliyi, frozen trigger/FK toxunulmazlığı,
> kök-green yoxdur, manual DB delete yoxdur) qüvvədə qalır.

## 1. Niyə (problemin izahı)

Hazırda QR sifariş (G3, O frozen contract) **işləyir amma anonimdir**: müştəri menyu
baxır, cart doldurur, `POST /api/orders/qr` ilə sifariş yaradırır — amma sifariş
**heç kimə bağlı deyil** (`customer_id = NULL`). Nəticə:

- Loyalty spine (`trg_order_loyalty_spine`) `no_customer` səbəbi ilə **heç vaxt fire etmir**.
- CRM history / total_visits / total_spent QR sifarişlərə heç vaxt yazılmır.
- Restoran QR sifariş verən qonağı tanıya bilmir (SMS/loyalty/marketing mümkün deyil).

Staff axınında customer attach mövcuddur (`/api/orders/customer`, requireAuth+CSRF) —
amma o, staff POS-udur; qonağın öz nömrəsini daxil etməsi üçün **qonaq yolu** yoxdur.

## 2. Audit sübutları (read-only, 2026-09-19, canlı DB)

| Fakt | Dəyər | Mənbə |
|---|---|---|
| `orders.customer_id` FK | mövcud: `orders_customer_id_fkey`, orphan = 0 | pg_constraint + JOIN sayımı |
| `orders.customer_name/phone`, `loyalty_points_earned` sütunları | mövcud | information_schema |
| customers sətrləri | 7 (hamısı phone-lu; 0 NULL phone; **0 duplicate phone**) | SELECT |
| customers.phone-də unik index | **YOX** (yalnız pkey) | pg_indexes |
| Loyalty spine | `trg_order_loyalty_spine` → paid keçidində `loyalty_earn(order_id)` + customer stats UPDATE | pg_proc |
| `loyalty_item_points` məntiqi | (1) product rule → (2) category rule → (3) default `floor(total × settings.loyalty_points_per_manat)`; qapı: `settings.loyalty_enabled` | prosrc verbatim |
| `settings.loyalty_enabled` / `loyalty_points_per_manat` | **true / 1** (canlı) | settings id='1' |
| `loyalty_product_rules` / `loyalty_accounts` sətrləri | 0 / 0 (təmiz) | SELECT |
| QR contract (G3) | `/api/orders/qr` PUBLIC, IP rate-limit 20/min, location/org server-trusted (table row), `order_type` server-side forced | route.ts + middleware.ts verbatim |
| Gate-lər `customers`-a toxunur? | **HƏR HANSI BİR gate YOX** (20 gate/probe faylında grep = 0 hit) | grep |
| Boş table range | 410–430 tam boş (table_floors) | SELECT |

## 3. Dizayn (scope: W-A1a — identifikasiya + status; pay/bill = W-A2)

```
Qonaq: /menu?table=N  (public, mövcud)
  ├── [yeni] ixtiyari phone input (bonus xallar üçün)
  ├── "Göndər" → POST /api/orders/qr { table_number, items, customer_phone?, customer_name? }
  │     └── [yeni] customer_phone varsa → rpc/guest_link_customer (service-role)
  │           → customer_id/name/phone order INSERT-inə daxil (atomic, create-time attach)
  │           → invalid phone → 400 (sifariş yaratılmır)
  │           → phone yoxdur → G3 davranışı HƏR CƏHƏTDƏ eyni (customer_id NULL)
  └── [yeni] order card: id, status, total, item sayı → 15s poll GET /api/orders/qr/status?table=N
        (public, IP rate-limit 30/min, yalnız ÖZ masasının order summary-si)
```

**Yeni DB səthi (additive yalnız):**
1. `customers_phone_uq` — UNIQUE partial index (phone IS NOT NULL).
2. `guest_link_customer(p_phone, p_name)` — SECURITY DEFINER, find-or-create;
   grants: **`service_role` ONLY** (house pattern, eyni `transition_order_atomic` ACL;
   anon + authenticated + PUBLIC revoked — Supabase explicit grant-larını da təmizləyirik).
   Phone validation: spaces/dashes çıxarılır → `^\+?[0-9]{8,15}$` → əks halda `GUEST_LINK_BAD_PHONE`.
   Name: btrim + left(…,80); boş → `'Qonaq ' || right(phone,4)`.
   Race: unique-violation → retry find (deterministic winner = index).

**Dəyişdirilməyən (frozen toxunulmazlığı):**
- `trg_order_loyalty_spine`, bütün 13 order trigger, M6 FK-lər, settings — sıfır dəyişiklik.
- Loyalty accrual üçün **heç bir yeni trigger/RPC lazım deyil** — create-time attach
  mövcud spine-in özü ilə işləyir (audit §2).
- G3 route davranışı (phone-siz) byte-məna baxımından eyni qalır (O gate G3 = SQL proof, təsirlənmir).

## 4. Gate (.w-a1-gate.cjs — SQL-level, ~18 check)

Fixtures (deterministic, teardown-contract): tables **410/411/412** @LOC_A, customers
`0007777%`, staff `WAG_%`, rule `label='W_A1_TEST_RULE'`. START self-heal + END residue=0
(Z1), archive guard re-enable (Z2). Əsas checks:

| ID | Claim |
|---|---|
| S1 | `customers_phone_uq` mövcuddur |
| S2 | RPC = 1 overload; **yalnız service_role** EXECUTE (anon + authenticated YOX — house pattern) |
| S3 | create yolu: `00077770001` → created=true, name='Qonaq 0001' |
| S4 | find yolu: eyni phone → eyni id, created=false, 1 sətir |
| S5 | birbaşa duplicate INSERT (RPC-dan kənar) → 23505 (index işləyir) |
| S6 | invalid phone ('abc', '12345') → GUEST_LINK_BAD_PHONE |
| S7 | name cap: 300 char → saxlanılan = 80 |
| S8 | G3 backward compat: phone-siz qr_order → customer_id NULL, trigger-lər keçir |
| S9 | create-time attach: order-da customer_id/name/phone görünür |
| S10 | rule fixture: product rule points_per_unit=5 (qty 2 → 10 xal) |
| S11–S12 | paid keçidi (admin atomic) → `loyalty_points_earned=10`, 1 transaction, balance=10, `total_visits=1` |
| S13 | `total_spent` = order.paid_amount (mənfəət consistency) |
| S14 | 2-ci order eyni customer → visits=2, balance=20, per-order idempotency |
| S15 | phone-siz order paid → 0 xal, yeni transaction YOX ('no_customer' skip) |
| EC1 | replay: o410 üçün 2-ci paid cəhdi → double-earn YOX (state guard) |

## 5. Decision log (delegated GO — owner 2026-09-19 səlahiyyəti ilə)

| # | Qərar | Rəy / əsas |
|---|---|---|
| D1 | Guest identifikasiya = **phone** (token yoxdur) | Staff axını artıq phone ilə müştəri tanıyır; token = yeni secret lifecycle + revocation səthi (pay-at-table üçün W-A2/Q7 zamanı dəyərləndiriləcək) |
| D2 | Find-or-create **DB RPC-də** (route = thin wrapper) | SSOT baxımından tək yerdə, gate-testable, atomic; house pattern (bütün kritik məntiq DB-dədir) |
| D3 | Mövcud 7 customer phone-ı **yenidən yazılmır** (formatlar qarışıqdır: '+994…', '05…', '234567') | Frozen data red line; validasiya yalnız YENİ girişə tətbiq olunur; canonical normalization = W-A2 improvement |
| D4 | Attach **INSERT zamanı** (PATCH deyil) | Spine + stats heç bir trigger dəyişikliyi olmadan işləyir; race yoxdur |
| D5 | Invalid phone → **400, sifariş yaratılmır** (silent-drop deyil) | Qonaq məqsədyəli phone verdiyi halda səssiz itirmək = loyalty/CRM sükutlu itki |
| D6 | Rate limits: qr = 20/min (dəyişməz), status = 30/min (polling) | G3 contract dəyişmir; status read = asan hədəf |
| D7 | Scope boundary: bill-request / pay-at-table / kiosk / online UI = **W-A2+** (pay Q7 terminal provider-ə bağlıdır) | Master map §9 Wave A/C uyğunluğu |
| D8 | **Narrowed reflow:** W-A1 + O + P-9 + F; qalan 11 gate-ə full reflow növbəti shared-state dəyişikliyinə qədər əhəmiyyətsiz | Ədədi sübut: 20 gate/probe faylının HEÇ BİRİ `customers` cədvəlinə toxunmur (§2 grep); dəyişən route faylları additive-only (qr + yeni status); O gate-in G3 testi SQL-level-dir (route kodunu test etmir) |
| D9 | **M0: `loyalty_order_points` + `loyalty_transactions` verbatim yenidən yaradılır** (P-7 "zero-reference" drop-u latent regression idi — 4 canlı fn hələ də onlara referens edir: `loyalty_earn`, `_loyalty_post`, `loyalty_reverse`, spine trigger) | Preflight sübutu: hər iki cədvəl yoxdur, `loyalty_accounts`=0, spine trigger mövcuddur → 2026-09-14-dan loyalty-earn sükutlu şəkildə qırıq idi. Baseline `2026-09-14` schema + `20260910000009` verbatim. Gate S11–S14 earn-dəyir. |
| D10 | Customer create = **explicit `total_visits=0, total_spent=0`** (RPC + CustomerSelect) | `customers.total_visits DEFAULT 1` schema quirk — default-sız create "1 visit" ilə başlayır; D10 ilə counter sadəcə faktiki order-lardan artar |
| D11 | **G3 order-creation semantikası dondurulmuş qalır: 1 active order / table** (`idx_orders_active_table`, O-freeze). Qonağın "çatda əlavə sifariş" axını W-A1-də DƏYİŞMİR | E2E E4: 2-ci POST = 23505 → 500, customer dup yoxdur (find path işləyir), order toxunulmur. Add-to-check UX = gələcək wave-in product qərarı (MASTER_FEATURE_MAP §9-ya qeyd) |

## 6. İcra addımları

1. [x] Audit (§2) + decision log (§5)
2. [x] Preflight (read-only) → `.w-a1-audit/w_a1_preflight_out.txt`
3. [x] Migration apply: M0 loyalty repair + `20260919000001_w_a1_guest_channel.sql` (+rollback)
4. [x] App: qr route extension, status route, menu UI (phone + status card), CustomerSelect D10
5. [x] Lint + typecheck (app) — tsc clean (4 fayl); eslint pre-broken (unrelated)
6. [x] `.w-a1-gate.cjs` run → GREEN (18/18, REAL-RISK=0, residue=0)
7. [x] Route E2E `.w-a1-audit/w_a1_route_e2e.cjs` → GREEN (5/5, E4=D11 frozen contract, residue=0)
8. [ ] Narrowed reflow: O + P-9 + F (dev server up) → GREEN
9. [ ] W_A1_FREEZE_REPORT + HANDOVER + MASTER_FEATURE_MAP status yeniləmə
10. [ ] git commit + push
