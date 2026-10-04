# HANDOFF 13d — CLIENT-AUTH AUDIT TAMAM + İtki Pattern (commit `820b4c0`)

Owner auto-mandat: 2-3 run; "diger sehifeye kecmezden qabaq etdiyin sehifeleri e2e
brauzer ve kodda verify et"; qərar mənə, professional. → 13d-A (13a candidate: app-wide
client-auth audit) + 13d-B (§1d zəif #8) + 13d-C (E2E + docs).

## Nə edildi (verify: E2E r28→r28d2, console 0, dark+light)

### 13d-A — Table RLS qatı (13a "anon-client" bug klassının TAM sweep-i)
Browser client = anon; pooler `app.current_role`/`app.current_org_id` set etmir → bütün
`*_select_loc`/`*_insert_loc` = sükutla boş. 10 yuzey → service-role API:

| Yuzey | Route | Client |
|---|---|---|
| Expo board | `GET /api/expo/board` | `expo/page.tsx` |
| Badges (bell+overdue+səs) | `GET /api/admin/badges?delay_minutes=` | `NotificationContext.tsx` |
| Müştəri list/axtarış/create | `GET|POST /api/customers` | `CustomerSelect.tsx`, `OrderModal.tsx` |
| Floors (POS filter + kitchen map) | `GET /api/floors` | `pos/page.tsx` (?), `kitchen/page.tsx`, `TableStatusGrid.tsx` |
| Rezervlər (kitchen panel) | `GET /api/kitchen/reservations` | `UpcomingReservations.tsx` |
| Cancel tarixçəsi | `GET|POST /api/cancelled-orders` | `OrderModal.tsx` |
| Active order guard | `GET /api/orders/table-active` | `ManualOrderModal.tsx` |
| Qty edit | `POST /api/orders/item-quantity` | `OrderModal.tsx` (draft) |

### 13d-A2 — RPC EXECUTE qatı (r28b tapdı — audit-in 2-ci səviyyəsi)
Anon-a EXECUTE grant YOX: `cancel_order_items`, `reverse_stock_for_items`,
`add_order_items`, `cancel_table_orders`, `update_order_item_quantity`. 4 call-site
`.error`-ı yoxlamırdı → **sükutla itki** (B2: audit+toast yazıldı, item silinmədi).
GRANT əlavə ETMƏDİK (location-scoping modeli) — yeni bridge-lər:

- `POST /api/orders/cancel-items` — `{order_id, items:[{order_item_id, quantity}]}`
- `POST /api/orders/reverse-stock` — `{items:[{order_item_id, reverse_qty}]}`
- `POST /api/orders/cancel-table` — `{table_number, reason}` (p_performed_by = staff)
- mövcud `POST /api/orders/item-quantity` reuse
- Client: OrderModal ×6, ManualOrderModal, useOrders "Clear Table" — hamısı throw.

**`add_order_items` RPC = plan-time ÖLÜ** (təpik bug): `v_item->>'modifiers'` (text) →
jsonb sütun → **hər payload-da** error (psql repro). Fix: client `POST /api/orders
{action:'addItems'}` (production-proven: service insert + discount recompute).
Yaradılmış add-items bridge route **silindi** (duplikasiya).

### 13d-A2 — UI/race gap-lar
- Desktop **Sidebar badge heç render olunmurdu** (yalnız mobile dock) → qızıl badge.
- `handleConfirmWithDraft` = save-dan **əvvəl** onRefresh → köhnə list; indi yazıdan sonra.
- `/api/admin/badges` = pooler 5xx retry (1×, 300ms) — transient 500 ×2+ kök idi.

### 13d-B — İtki Pattern (§1d zəif #8 → bağlandı)
`GET /api/inventory/reports` → `shrinkage_pattern`: 28g Mon-start H1–H4 + Toplam, gün
paylanması (7), per-item WoW trend_pct, top-5. ReportsTab "İtki Pattern" kartı.
§1d status: **7/8** (qalan = multi-location, biznes).

## PostgREST jsonb PITFALL (lesson — gələcək bridge-lər üçün)
Body JSON 1:1 jsonb-ə map olunur. `p_items: JSON.stringify(items)` = jsonb **STRING
SCALAR** → `jsonb_array_elements` = "cannot extract elements from a scalar". **Həmişə
real JSON array göndər** (`p_items: items`). psql test bunu maskalayır (text→jsonb cast
re-parse). RPC-ləri psql deyil, **PostgREST fetch ilə** test et.

## DB son state (net-clean, psql verify)
- Masa 1 = ₼46.00: Green Tea ×1 @4 + Filadelfiya Classic ×3 @14 (yeni row `6928323e-…`;
  menyu qiyməti 08-01-dən 14-dir — köhnə ₼67/₼21 = sentyabr test artefaktı, incident DEYİL).
- cancelled_orders = 45 (44 + 1 REAL audit row: r28d D1, customer_refused, ₼84).
  3 saxta row silindi (r28b/r28c — uğursuz cancel-lərin audit qalıqları).
- 2 temp rezervasiya silindi.

## Dead code (sənədləndi, toxunulmayıb)
- `OrderModal._handleCancelOrder` (browser `cancel_table_orders` içində)
- `useReports.ts` (import YOX — get_z_report/v.b. client call-ları da 401 idi amma səhv yoxdur)
- `managerPin.ts` RPC-ləri server routes-dan service rol ilə çağırılır (OK)

## Qalan (13e candidate)
1. **Orders-page merged-group payment** = yalnız seçilmiş order-row-u ödəyir
   (`complete_payment_atomic_v2` p_order_id-only; child-satırlar qalıb). POS pay loop
   ayrı işləyir. Design qərari lazımdır (group-pay vs row-pay).
2. Pooler transient 500 monitoring (badges retry gəldi).
3. POS cart unsent delta = in-memory (reload itki) — KDS offline buffer pattern-i POS-a.
4. Multi-location = biznes qərari (§1d-in yeganə qalan zəifi).

## Owner-gözləyən (13a-dan, dəyişməz)
Sayım: Avokado −1290, Qırmızı kələm −650, Bənövşəyi soğan −550, Sésam −190, Tofu −100,
Doner əti 0, avakado 192000, Qızardılmış soğan 199460 → Stok Sayımı (Scale) → APPLY.
Test-order consumption verify = hold (owner "hele etməyə").
