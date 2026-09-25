# 3-CU TEREFF (PARTNER) SIFARISLERI - API TEDQIQATI + DB DIZAYN TEKLIFI

**Tarix:** 2026-09-25 (owner suali: "statuslar 3-cu terefden eyni olmasin - statuslar, odenisler ayri
saxlanilmalidir; Wolt-den gelen API-ni dinlemelidirik; odenis secimleri nedir, kuryer kimdir,
neyi API temin edir - DB-de nece saxlansin?")

**Menbe qeydi:** Wolt (v2) ve Uber Eats (v0.5) sahe siyahlari public developer spec-ine esaslandirilir
(developer.wolt.com / developer.ubereats.com - SPA oldugu xetla field adlari spec-e uyun verilib;
canli doc URL-leri implementasiya zamanlari yeniden tasdiqlenmeli). Bolt Food-un partner API-si
public deyil - partner/NDA doc lazimdir. Sektör pattern (webhook + signature, reverse status sync,
acceptance window, connection health) RestioX/POS inteqrasiya praktikalarindan cross-check olunub.

---

## 1. NEYI API TEMIN EDIR? (partner payload)

Uc platformanin hamisi ayni **normalized saheler** setini verir - fərqli yalniz field adlari:

| Normalized sahə | Wolt v2 (order obj.) | Uber Eats v0.5 (order obj.) | Bolt Food (partner doc) |
|---|---|---|---|
| Partner order ID | order.id | order.id | (partner order id) |
| Partner order no | order.order_number | order.order_number | (order no) |
| **Partner status** | order.status (enum) | order events + state | (status field) |
| Customer ad/soyad | customer.name | customer.first_name+last_name | (customer name) |
| Customer telefon | customer.phone_number | customer.phone_number | (customer phone) |
| Ünván (street/building/district) | fulfilment.delivery_details.address | fulfillment.delivery_details | (address) |
| Delivery instructions | fulfilment...instructions | fulfillment.delivery_instructions | (notes) |
| Fulfillment növü | fulfilment.type: DELIVERY/PICKUP | fulfillment.method: DELIVERY/PICKUP | (mode) |
| **Ödəniş metodu** | payment.payment_method: CARD/CASH | payment.method: CARD/CASH/STORE_CARD/STORE_CASH | (payment method) |
| **Ödəniş statusu** | payment.payment_status: UNPAID/COMPLETED/CANCELED | payment.status: PAID/UNPAID | (paid flag) |
| Ödəniş məbləği | payment.total | payment.amount | (total) |
| **Tip** | payment.tip_amount | payment.tip_amount | (tip) |
| Payment provider | payment.payment_provider (WOLT/STRIPE) | - (platform collects) | (partner collects) |
| **Kurye ad** | courier.name (assigned-e) | fulfillment.courier.name | (courier name) |
| **Kurye telefon** | courier.phone_number | fulfillment.courier.phone_number | (courier phone) |
| **ETA** | estimated_delivery_time (ISO) | delivery ETA (events) | (ETA) |
| Items | items[] (name, qty, total, modifiers) | items[] (name, quantity, total, modifiers) | (items) |
| created_at | created_at | created_at | (created) |

**Necə gəlir:** Wolt/UE = **webhook** (HMAC signature, event: order.created / order.updated /
order.canceled / courier update) + fallback **polling** (GET order, hər 30-60s). Bolt = partner
portal/API push (doc NDA-da).

**Acceptance window (UE):** order created-e restoran **1-2 dəq** içində accept etməlidir
(yoxsə partner cancel edir) - webhook endpoint-da auto-accept (və ya POS-da "accept" alert).


---

## 2. ƏSAS BİZNES QAYDALARI (owner tələbi)

1. **STATUSLAR AYRI SAXLANILIR** — iki müstəqil status oxu:
   - `orders.kitchen_status` / `orders.status` = **restoranın daxili** axını (biz idarə edirik:
     MƏTBƏXƏ GÖNDƏR, HAZIRDIR, LƏĞV…).
   - `partner_orders.partner_status` = **partnerin öz** statusu (API-dən yazılır, biz DƏYİŞDİRMİRİK;
     yalnız **göndəririk** — reverse sync, bax §4).
   - Kartda görünən "TƏSDİQLƏNDİ / HAZIRDIR" = daxili status (bizim sistem rəngləri).
     Partner status ayrıcı kimi göstərilir (chip: "Wolt: READY_FOR_PICKUP") — heç vaxt eyniləşdirilmir.

2. **ÖDƏNİŞLƏR AYRI SAXLANILIR** — partner sifarişində POS payment flow **yoxdur**:
   - `payment_owner = 'partner'` → müştəri Bolt/Wolt app-də ödəyib; restoran kassada pul qəbul **ETMİR**.
   - Kassa / Z-report: partner sifarişləri **nakd gəliri sayılmır**; separat "partner channel" gəliri,
     komissiya düşüldükdən sonra "platform fee" sətiri ilə.
   - `payment_owner = 'restaurant'` (UE STORE_CASH/STORE_CARD, Wolt CASH bəzi marketlərdə) → o zaman
     POS-da ödəniş normal axınla qeyd olunur.
   - **Tip** həmişə restorana aiddir — partner tip-i ödəniş payload-u ilə ötürür.

3. **MÜŞTƏRİ MƏLUMATI = API PAYLOAD** — POS-da input deyil (round 6-dan etibarən cart-da read-only
   "Partner tətbiqindən (API)" bloku). Ünvan/zona/fee restoran tərəfindən hesablANMIR — partner
   artıq hesablayıb.

4. **Kurye = partnerin kuryesi** — restoran kurye TƏYİN ETMİR; kurye adı/telefoni/ETA partner
   API-sindən gəlir (courier assigned event). Bizim `delivery_couriers` stoku partner sifarişləri
   üçün istifadə olunmur.

---

## 3. DB DİZAYN TƏKLİFİ

### 3.1. Yeni cədvəl: `partner_orders` (1:1 → orders.id)

```sql
create table if not exists public.partner_orders (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null unique references public.orders(id) on delete cascade,
  partner              text not null check (partner in ('bolt','uber_eats','glovo','wolt')),
  external_order_id    text not null,          -- partner-in order id (orders-da da denorm)
  external_order_no    text,                   -- partner-in görünən no ("4120")

  -- PARTNER STATUS (biz dəyişmirik, yalnız yazırıq + oxuyuruq)
  partner_status       text,                   -- 'ORDER_RECEIVED','PREPARING',...
  partner_status_at    timestamptz,            -- son dəyişiklik vaxtı (API timestamp)

  -- PARTNER PAYMENT (bizim payment_status ilə heç vaxt qarışdırılmır)
  payment_owner        text not null default 'partner'
                       check (payment_owner in ('partner','restaurant')),
  payment_method       text,                   -- CARD | CASH | STORE_CARD | STORE_CASH
  payment_status       text,                   -- PAID | UNPAID | CANCELED
  payment_amount       numeric(12,2),
  tip_amount           numeric(12,2) default 0,

  -- CUSTOMER snapshot (API payload — input yoxdur)
  customer_name        text,
  customer_phone       text,
  delivery_instructions text,
  address_line         text,                   -- "Azərbaycan prospekti 54, 3"
  address_district     text,
  address_zone         text,                   -- partner zonası (bizim zone DEYİL!)

  -- COURIER (partner kuryesi)
  courier_name         text,
  courier_phone        text,
  courier_assigned_at  timestamptz,
  courier_eta          text,                   -- "12-15 dəq" (partner ETA)

  -- SYNC / AUDIT
  last_webhook_at      timestamptz,
  last_sync_error      text,
  raw_payload          jsonb,                  -- son tam partner payload (debug/audit)

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_partner_orders_partner_status
  on public.partner_orders (partner, partner_status);
create index if not exists idx_partner_orders_external
  on public.partner_orders (partner, external_order_id);
```

**Niyə ayrıca cədvəl (orders-a column əlavə etmək deyil)?**
- Ayrılıq prinsipi (owner tələbi): partner məlumatları orders cədvəlindən **fiziki** ayrılır;
  orders-da yalnız denormalized göstəricilər qalır (`partner_source`, `external_order_id` —
  board/KDS-in `select=*` ilə oxuması üçün).
- Növbəti partner (Talabat, Grab) gələndə sxem dəyişmir.
- `raw_payload` = webhook debug + idempotency üçün.


### 3.2. Webhook event log: `partner_webhook_events`

```sql
create table if not exists public.partner_webhook_events (
  id                bigint generated always as identity primary key,
  partner           text not null,
  event_id          text,                    -- partner-in event id (idempotency)
  event_type        text not null,           -- 'order.created','order.updated',...
  external_order_id text,
  signature_valid   boolean not null default false,
  processed         boolean not null default false,
  error             text,
  payload           jsonb not null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_partner_wh_dedup
  on public.partner_webhook_events (partner, event_id) where event_id is not null;
```

- Duplicate webhook (event_id var) = **idempotent no-op** (təkrar processing yox).
- `signature_valid = false` → sifariş YARADILMIR, yalnız log + alert (connection health).

### 3.3. orders cədvəlinə (minimum) denormalized sütun

Mövcuddur: `partner_source`, `external_order_id`, `courier_name`, `courier_phone`,
`courier_assigned_at`, `courier_eta`. Əlavə (yalnız 1):

```sql
alter table public.orders add column if not exists partner_payment_owner text;
-- 'partner' (partner sifarişləri default) | 'restaurant' (STORE_CASH halı) | null (daxili)
```
Qeyri-partner sifarişlərdə NULL — daxili flow dəyişmir.

### 3.4. Status mapping (partner → daxili TƏKLİF; avtomatik TƏTBİQ olmur)

| Partner event / status | Daxili təklif (bizim status) | Qeyd |
|---|---|---|
| Wolt `ORDER_RECEIVED` / UE `order.created` | order `confirmed` + KDS `sent` | yeni sifariş = dərhal mətbəxə |
| Wolt `PREPARING` | (bizim hazırlanmağımız — heç nə) | iki tarafa da aid ola bilər |
| Wolt `READY_FOR_PICKUP` | KDS `ready` | kurye gəlir |
| Wolt `CURIER_PICKED_UP` / UE delivered | order `delivered` | |
| Wolt `DELIVERED` | `completed` | payment PAID olarsa |
| `CUSTOMER_CANCELED` / `STORE_CANCELED` | `canceled` + inventar geri | mövcud LƏĞV flow |
| `payment.status → PAID` | Kassa: "partner ödənişi" (nakd DEYİL) | Z-report channel sütunu |
| `payment.method = CASH / STORE_CASH` | `partner_payment_owner='restaurant'` → POS payment | müştəri restoranda ödəyir |

Mapping = **code-da sabit cədvəl** (DB cədvəli deyil — 4 partner × ~8 status ≈ 30 sətir,
admin UI lazım deyil). Növbəti partnerdə mapping funksiyası genişlənir.

---

## 4. REVERSE SYNC (biz → partner) + ENDPOINT

**Bizim KDS progress → partner API:** restoran "HAZIRDIR" dedikdə partner app-da müştəri
kurye gözləməyi görür. Wolt: `PATCH order status=READY_FOR_PICKUP`; UE: order state update.
Bolt: partner doc-una görə.

**Webhook endpoint (yeni):** `POST /api/partners/webhook/:partner`
1. Partner signature validasiyası (Wolt: HMAC secret; UE: webhook signing key; Bolt: partner key).
2. Event → `partner_webhook_events` (idempotent dedup).
3. `order.created` → orders + partner_orders satırı (mapping §3.4), board-a düşür.
4. `order.updated` → partner_orders sahələrinin yenilənməsi (status/courier/payment).
5. **Fallback polling:** hər 60s `GET /orders?status=active` (partner baxımından) — webhook
   düşərsə də data itmir (connection health üçün "last successful sync").

**Connection health (Settings → Delivery Partnerləri):** hər partner üçün:
son uğurlu sync, uğur faizli (son 50 event), ardıcıl uğursuzluq sayı, webhook statusu.
Bu, mövcud `delivery_partners` settings jsonb-inə `health` obyekti olaraq əlavə olunur.

---

## 5. FAZA PLANI

- **Faza 1 (öncəlik):** `partner_orders` + `partner_webhook_events` migrasiyaları;
  webhook endpoint skeleti (Wolt adapter — spec ən açıqdır); test-order endpoint-unu
  partner_orders satırı yazmağa bağla; Kassa/Z-report-da `partner_payment_owner` ayrılığı.
- **Faza 2:** UE adapter (acceptance window + STORE_CASH payment_owner='restaurant' halı);
  reverse sync (HAZIRDIR → partner); connection health UI.
- **Faza 3:** Bolt + Glovo adapter-ləri (Bolt = NDA doc; Glovo = developer.glovo.com spec).
- **Qeyd:** offline əl ilə partner qeydi (POS modalı, ünvan/fee-siz) = Faza 4 (owner təsdiqi ilə).

---

## 6. MÖVCUD KODDAN FƏRQ (bu round build edilən vs təklif)

| | Bu round (READY state) | Təklif (Faza 1+) |
|---|---|---|
| Status | yalniz daxili + `partner_source` tag | `partner_orders.partner_status` ayrı saxlanılır |
| Ödəniş | total kartda göstərilir, payment flow daxili kimi | `payment_owner` ayrılığı, Kassa/Z-report channel |
| Müştəri | API payload (test-order yazır), cart read-only blok | eyni + `raw_payload` audit |
| Kurye | simulyasiya (courier_* sütunları) | partner API courier events |
| Sync | test endpoint (elle) | webhook + signature + polling fallback + health |
