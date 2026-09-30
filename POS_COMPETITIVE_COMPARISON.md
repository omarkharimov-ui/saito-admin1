# SAITO POS vs Toast · Lightspeed · Square — Feature Audit (2026-09-30, round 7)

> Əsas: SAITO = bu repo-nun kodu üzrə verified feature set (round 1–7 E2E). Rəqiblər =
> hər birinin müstəqil Restaurant POS məhsulunun müəssisəleşmiş core feature set-i
> (vendor sənədlərinin cari versiyasını order-ixtisaslaşdırılmış detallar üçün yenidən yoxlamaq lazımdır).
 > Hədəf: hansı şeyin var, çatışmır və yaxşılaşdırılmalıdır — səbəb ilə.
 >
 > **STATUS (2026-09-30, rounds 11a–11e):** §2-dəki 5 əsas çatışmazlığın HAMISI bağlandı
 > (payroll 11a · purchasing 11b · analytics 11c · online ordering 11d · offline 11e —
 > hərəsi ayrıca commit, jurnallar MASTER_FEATURE_MAP.md §10). Qalan: §2.6 real PSP
 > (owner qərarı), §2.7 e-commerce (low priority), §2.8 franchise.

## 1. BƏRABƏR / QÖNÇƏ (parity or better)

| Feature | SAITO | Toast | Lightspeed | Square |
|---|---|---|---|---|
| Floor/table management (merge, transfer, status chips) | ✅ + rotation-morph UI, kitchen-status per card | ✅ | ✅ | ✅ (Square for Restaurant) |
| Per-instance modifiers (multi-instance pills, independent specs) | ✅ **daha dərin**: hər instance öz modifier/variant/course/allergen/hold saxlayır (E2E verified) | ✅ (line-level) | ✅ | ✅ |
| Allergens (auto-icon, per line, kitchen warning) | ✅ | ✅ | ✅ | ⚠️ məhdud |
| Payments: cash/card/QR/transfer/corporate/gift/room charge + split (amount & per-item) + tip | ✅ 8 method + item-level split | ✅ | ✅ | ✅ |
| Refund: full/partial/item-level + inventory fate (stock/waste/none) + approval threshold + idempotency (server) | ✅ **daha sərt**: DB atomic, net-paid guard, idempotency keys | ✅ | ✅ | ✅ |
| Cash drawer (shift open/close, in/out, no-sale, drop, deposit, Z, manager lock) | ✅ | ✅ | ✅ | ✅ |
| Shift/role/PIN permissions + audit log + approval requests | ✅ | ✅ | ✅ | ✅ |
| Reservations + waitlist + pre-order | ✅ | ✅ | ✅ | ✅ |
| Delivery (courier, zones, fee, status) + Takeaway | ✅ | ✅ | ✅ | ✅ (Square Delivery) |
| Kitchen (KDS) + per-item status (cooking/ready/served) | ✅ | ✅ | ✅ | ✅ |
| Campaigns/coupons (server-validated, min-order, dining window) | ✅ | ✅ | ✅ | ✅ |
| Loyalty (points spine, redeem at payment, reverse on refund) | ✅ | ✅ | ✅ | ✅ |
| CRM customers (shared source, phone, linking) | ✅ | ✅ | ✅ | ✅ |
| Receipts (thermal print queue, reprint) | ✅ | ✅ | ✅ | ✅ |
| Multi-location, i18n (az/en/ru), light/dark, reduced-motion | ✅ | ⚠️ | ✅ | ⚠️ |
| Device pairing/heartbeat/remote commands | ✅ (Phase 0–1) | ✅ (Toast hardware) | ✅ | ✅ (Terminal) |

## 2. ÇATISMIYAN (missing — prioritized)

1. ~~**Online ordering / customer-facing channel**~~ — ✅ **BAĞLANDI (11d):** `api/orders/online` (takeaway/delivery, server price + CRM link + zone/fee/min/ETA) + public `/api/orders/[orderId]/track` (tracking səhifəsi) + menu no-table checkout. Bonus: KDS `table_number gt.0` bug fix — 67 mövcud no-table order KDS-də ilk dəfə görünür.
2. **Offline mode** — ✅ **PHASE 1 BAĞLANDI (11e):** offline order intake + idempotency-key dedup + auto-replay sync (banner + sinxron panel). Qalan (phase 2): offline cash drawer ledger + append dedup.
3. ~~**İş vaxtı/time-clock + payroll export**~~ — ✅ **BAĞLANDI (11a):** `get_payroll_export` RPC (punch LAG pairing + overtime + tips) + admin/staff CSV export + payroll_periods upsert + history.
4. ~~**Advanced reporting/analytics dashboard**~~ — ✅ **BAĞLANDI (11c):** 24s peak hours (SİFARİŞ/GƏLİR toggle), product food-cost/net-profit drill-down, staff performance (fix: dead `role` column) + çəkiliş dəqiqəsi + CSV.
5. ~~**Inventory purchasing (PO/receiving/supplier)**~~ — ✅ **BAĞLANDI (11b):** PO create (auto ingredient bind) + goods-receipt (delta, partial/full, WAC cost) + supplier order counter + `sync_product_availability` dead-schema fix.
6. **Hardware terminals (Square Terminal, Toast Station/stand)** — SAITO-da card terminal = SIMULATOR (adapter arxitekturası hazırdır, real PSP bağlı deyil).
7. **E-commerce sync (Lightspeed)** — B2C store sync yoxdur (SAITO restaurant-first olduğu üçün low priority).
8. **Franchise/multi-org hierarchy (Lightspeed)** — SAITO multi-location var; franchise royalty/reporting yoxdur.

## 3. YAXŞILAŞDIRILMALI (improve — near-term)

1. **Card terminal: real PSP** — adapter interfeysi hazırdır (SIMULATOR); owner qərarı ilə real PSP bağlıb. (Gəlir/köpür: Square/Toast ödəniş marjasından azalıb.)
2. **Print: network thermal printers** — hazırda print queue + reprint var; printer agent (BDS) istiqaməti Phase 0-da.
3. **Kitchen KDS screen (standalone)** — KDS page var; kiosk/standalone kitchen screen + priority queue polishing.
4. **Customer self-service (table QR menu/order)** — Masa 471 QRUP chip var (QR göstəriş) — tam QR menu/order axını yoxdur.
5. **Analytics: daily close summary** — Z report var; end-of-day summary (top items, avg check, staff) print/dashboard.
6. **Notifications** — order placed/bill requested push (staff IM) — hazırda in-app chip/toast.
7. **Device unpair UX** — E2E-lərdə 2 dəfə unpair lockout (round 6/7) → Settings → Cihazlar-da "Bərpa et" axını + self-recovery (PIN) düşünülə bilər.
8. **Next dev "Issues" pill** — dev-only; warning-ları sıfırlamaq üçün hər round-da console scan (round 7: 0 warning).

## 4. QƏLƏBƏ NÖQTƏLƏRİ (SAITO's edge)

- **Motion/design quality**: iOS-philosophy animation system (rotation morph, stroke-draw, measured sliding capsule, reduced-motion) — rəqiblərdə bu səviyyədə POS front-end nadirdir.
- **Per-instance modifier model**: line-level spec isolation (round 6/7 E2E) — çox POS-da modifier "merged" davranır.
- **Server-sərt refund/ödəniş**: atomic DB functions, net-paid semantics, idempotency keys, approval spine — accounting integrity Toast/Square səviyyəsində.
- **Baku/AZ yerelliği**: AZN, az/en/ru, lokal terminologiya, EDV.

## 5. TÖVSIYYƏ (roadmap order)

1. Real PSP card terminal (adapter hazırdır) — payment reliability. *(yeganə qalan əsas item — owner qərarı)*
2. ~~Offline mode~~ — ✅ 11e (phase 1: order intake+sync; phase 2: cash ledger)
3. ~~Online ordering (MVP)~~ — ✅ 11d
4. ~~Analytics summary~~ — ✅ 11c (peak hours + staff/product drill-down + CSV)
5. ~~Inventory purchasing (PO/receiving)~~ — ✅ 11b
6. ~~Staff time-clock + payroll~~ — ✅ 11a
