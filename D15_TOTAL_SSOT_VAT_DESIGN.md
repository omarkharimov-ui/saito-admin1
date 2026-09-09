# 1.5 / D-9 — TOTAL SSOT + VAT — DİZAYN + REVIEW

**Tarix:** 2026-09-10 · **Mode:** REVIEW — migration YAZILIB, **applied DEYİL**.
**Q1 (sən təsdiqlədin):** Tax-Exclusive default, opt-in VAT, tək canonical engine.
**Q2 (sən təsdiqlədin):** VAT toggle = **Manager PIN** (b).
**QR (müşterinin):** sərbəst (opt-in, sən Q2-də POS üçün (b) dedin; QR-də kassir yoxdur → sərbəst). Sən təsdiqlə → belə.

---

## Mövcud vəziyyət (REAL DB, 2026-09-10)

- `orders` sütunları **artıq var, 0-də**: `tax_pct`, `tax_amount`, `service_charge_pct`, `service_charge_amount`.
- `settings` (tək satır, geniş cədvəl): `receipt_service_fee_pct=5`, `receipt_show_service_fee=true`. **VAT sütunları YOX.**
- `void_order_item_atomic` artıq void-də `SUM(total_price WHERE NOT voided)` recompute edir (subtotal).
- `update_order_item_quantity` (D-9) — **total recompute YOX** (yalnız `order_items.total_price` yenilənir).
- `discount/route.ts` — client TS-də hesablayır (SSOT-a köçürülməlidir).
- `orders/qr/route.ts` — `totalFromItems = reduce(...)` client hesabı.
- 14 ayrı client formula (audit) — hamısı `total = sum(items) + service − discount` variantı.

## Qarşıdakı SSOT

```
Subtotal = Σ order_items.total_price WHERE kitchen_status NOT IN ('cancelled','voided')
VAT      = (apply_vat=true AND settings.vat_enabled) ? Subtotal × settings.vat_percentage/100 : 0
Service  = (apply_service=true AND settings.receipt_show_service_fee) ? (Subtotal + VAT) × settings.receipt_service_fee_pct/100 : 0
Total    = Subtotal + VAT + Service − order.discount_amount
```

**Qərar (service əsası):** service, **Subtotal+VAT** üzərindən hesablanır (Baku restoran standartı — VAT-ın da xidmət haqqı var). Sən fərqli istəyirsənsə (yalnız Subtotal üzərindən) de, düzəldirəm.

---

## MİQRASİYA MƏZMUNU

| # | obyekt | dəyişiklik | risk |
|---|---|---|---|
| 1 | `settings` | `vat_enabled bool DEFAULT false`, `vat_percentage numeric DEFAULT 18`, `auto_apply_vat bool DEFAULT false` | AŞAĞI |
| 2 | `orders` | `apply_vat bool DEFAULT false` (order-level flag, screenshot/audit) | AŞAĞI |
| 3 | `calculate_order_total_v3(p_order_id, p_apply_vat, p_apply_service)` | **YENİ CANONICAL** — bax yuxarı formula. UPDATE orders SET total_amount, tax_pct, tax_amount, service_charge_pct, service_charge_amount, apply_vat | AŞAĞI (yalnız çağırışda) |
| 4 | `update_order_item_quantity` (D-9 fix) | `UPDATE order_items`-dən sonra `PERFORM calculate_order_total_v3(order_id, apply_vat, apply_service)` | AŞAĞI |
| 5 | `void_order_item_atomic` | mövcud recompute (`SUM(total_price)`) → `PERFORM calculate_order_total_v3(...)` (VAT/service dəqiq) | AŞAĞI |
| 6 | `create_takeaway_order` / `create_delivery_order` | INSERT order `total_amount=0` → sonra `PERFORM calculate_order_total_v3(...)` (default: vat=false, service=true) | AŞAĞI |
| 7 | `complete_payment_atomic_v2` — **FROZEN, toxunulmur**. O, `total_amount`-a baxır (SSOT-dan artıq dəyər gəlir) | — |
| 8 | `recalculate_order_payment_state` — D-8-dən sonra 'captured' ilə işləyir; **SSOT-la bağlı YOX** (refund yoludur) | — |

**UI (applied migration-dən SONRA, ayrı commit):**
- `OrderDetailSheet.tsx` Summary box: Subtotal altı → `[VAT toggle]` + `[Service toggle]` + `VAT ₼X` + `Service ₼X` satırları. Toggle ON → **PinGuard** (manager) → `rpc('calculate_order_total_v3')` → yeni total.
- `menu/page.tsx` (QR): `cartTotal` üstü → eyni toggle (sərbəst, PIN yox) → order POST body-ə `apply_vat`/`apply_service` keçir → server engine hesablayır.
- `discount/route.ts`: TS hesabı → `rpc('calculate_order_total_v3')` çağırışı.
- 14 client formula → **yalnız display** (server total_amount-ı göstərir). Heç biri hesablamır.

---

## SƏNDƏN QƏRARLAR (apply ƏVVƏLƏ)

- **R1.** Service charge əsası: `(Subtotal + VAT)` yoxsa `(Subtotal)`? → **Təklif: (Subtotal+VAT)** (Baku standartı).
- **R2.** `auto_apply_vat=true` olduqda (admin bunu settings-də açsın) yeni sifarişlər avtomatik VAT-lı yaransın? → **Təklif: HƏ** (settings-də toggle, default false).
- **R3.** QR (müşteri) VAT toggle = sərbəst (PIN yox), POS = manager PIN? → **Təklif: HƏ**.

**APPLY?** Sən R1/R2/R3 + "apply" de → işə salım + E2E (pay → VAT toggle ON → total dəyişir → partial refund → vat refund düzgün → reopen → repay → double-VAT YOX). Sonra UI toggles (POS PinGuard + QR sərbəst).

---
**STATUS: DİZAYN + MİQRASİYA HAZIRDİR. APPLY ETMƏMİŞƏM.**
