# D-8 / 1.4 — REFUND CHAIN (5 BLOCKER) — DİZAYN + REVIEW

**Tarix:** 2026-09-10 · **Mode:** REVIEW — migration YAZILIB, **applied DEYİL** (sənin təsdiqindən sonra).
**Q1 qərarı (həyətdə):** Tax-Exclusive default, opt-in VAT, tək canonical SSOT engine. (Bu doc refund chain-i örtür; VAT/total = 1.5/SSOT ayrıca migration.)

---

## Root cause sübutu (REAL DB kodu, 2026-09-10 oxunub)

### BLOCKER 1 — recalc "captured" gap (PUL xətası, ən kritik)
**Mənbə:** `complete_payment_atomic_v2` → `INSERT INTO order_payments (... status='captured' ...)`.
**Mənbə:** `recalculate_order_payment_state` →
```sql
v_paid  = SUM(amount) WHERE status IN ('success','paid','authorized') AND is_refund=false;
v_cash  = SUM(amount) WHERE status IN ('success','paid','authorized') AND is_refund=false AND payment_method IN ('cash','nağd');
```
**Xəta:** Canonical ödəniş sətiri `captured`-dır → recalc onu **saymır**. `refund_with_inventory` refund-dan sonra `recalculate_order_payment_state` çağırır → `v_paid=0` → `UPDATE orders SET paid_amount = v_paid` → **paid_amount refund-dan sonra 0-a sıfırlanır** (H10.1 "paid_amount NEVER decremented" qaydasına birbaşa ziddiyyət).
**Fix:** `v_paid`/`v_cash` status siyahısına `'captured'` əlavə et (back-compat üçün qalanları saxla).
**FROZEN təhlükəsi:** YOX. `complete_payment_atomic_v2` paid_amount-u BİRBACAZİ aritmetik yazır (v_new_paid), recalc çağırmır → frozen pay path dəyişmir. Recalc yalnız refund/void çağırışlarında işləyir.

### BLOCKER 2 — reopen-də double stock-return (inventar inteqrallığı)
**Mənbə:** `refund_with_inventory` (item_fate=return_to_stock) → `inventory_logs` `type='reversal'`, `idempotency_key='refund:'||item||':'||ing`.
**Mənbə:** `reopen_order_atomic` → `_inventory_reverse_item` → `type='reversal'`, `idempotency_key='reversal:'||item||':'||ing||':'||corr`.
**Xəta:** Fərqli key sxemləri → eyni `order_consumption` refund (1 reversal) + reopen (2 reversal) ilə **2 dəfə qaytarılır** → stok şişirilir.
**Fix (təhlükəsiz, korreliya əsaslı):** `_inventory_reverse_item` yalnız **hələ qaytarılmamış net istehlakı** tersinə çevirsin:
```sql
... WHERE type='order_consumption' AND order_item_id=p
GROUP BY ingredient_id
HAVING SUM(consumption.qty) > COALESCE(
   (SELECT SUM(r.qty) FROM inventory_logs r WHERE r.type='reversal'
      AND r.order_item_id=p AND r.ingredient_id=grp.ingredient_id), 0)
```
Məntiq: consume(1)→refund reversal(1)→reopen reversal(1)≥consumption(1)=qaytar → **skip**. Sonra repay consume(2)→reopen reversal(1)<consumption(2)→ **qaytar**. Double-return ARXIV, idempotent.

### BLOCKER 3 — state machine: partial refund-dan sonra reopen qırılır
**Mənbə:** `state_transitions` (entity='order', is_active):
- `paid → new` ✅ · `refunded → new` ✅ · `paid → partially_refunded` ✅ · `partially_refunded → refunded` ✅
- **`partially_refunded → new` ❌ YOX**
**Mənbə:** `reopen_order_atomic` → `IF v_order.status NOT IN ('paid','completed') → error`. `partially_refunded`/`refunded` qəbul olunmur.
**Xəta:** Partial refund → status `partially_refunded` → reopen (a) funksiyada status check-də rədd (b) belə olsa belə `trg_order_state_machine_guard` `partially_refunded→new` transition tapmadan RAISE edir.
**Fix:** (a) `state_transitions`-ə `partially_refunded → new` əlavə et (perm: `orders.edit`, refund.approve ilə uyğun). (b) `reopen_order_atomic` source status check → `IN ('paid','completed','partially_refunded','refunded')`.

### BLOCKER 4 — ledger trigger refund-ları "existing"ə sayır (repay bloklanır)
**Mənbə:** `validate_payment_order_balance` (BEFORE INSERT trigger on order_payments):
```sql
v_existing = SUM(amount) WHERE order_id=NEW.order_id AND id!=NEW.id AND status NOT IN ('failed','voided');
-- ^ refund sətirləri (status='captured', is_refund=true) BURA DAXİLDİR
IF NOT NEW.is_refund AND (v_existing + NEW.amount) > v_order_total THEN RAISE;
```
**Xəta:** Refund sətiri "mövcud ödəniş" kimi sayılır → refund-dan sonra (reopen etmədən) yenidən ödəniş block olunur (O-2 "both layers").
**Fix:** `v_existing` SUM-una `AND is_refund=false` əlavə et. Refund = çıxış, mövcud ödəniş deyil. Doğru semantik.

### BLOCKER 5 — reopen + repay (Blocker 3+4 birgə nəticəsi)
B3 (reopen partial refund-dan icazə) + B4 (ledger refund saymır) düzəndi → reopen (status→new, DELETE order_payments) → repay (total-a) işləyir. Ayrı fix tələb etmir; B3+B4-in kompozit nəticəsidir.

---

## MİQRASİYA MƏZMUNU (fayl: `20260910000002_d8_refund_chain.sql`)

| # | obyekt | dəyişiklik | risk |
|---|---|---|---|
| 1 | `recalculate_order_payment_state` (CREATE OR REPLACE) | `v_paid`/`v_cash` status +`'captured'` | AŞAĞI (yalnız refund yolunda) |
| 2 | `_inventory_reverse_item` (CREATE OR REPLACE) | net-not-yet-reversed HAVING guard | AŞAĞI-ORTA (void/comp/waste/reopen hamısı; idempotent) |
| 3 | `state_transitions` (INSERT, idempotent) | `partially_refunded → new` (orders.edit) | AŞAĞI |
| 4 | `reopen_order_atomic` (CREATE OR REPLACE) | source status +`partially_refunded`,`refunded` | AŞAĞI |
| 5 | `validate_payment_order_balance` (CREATE OR REPLACE) | `v_existing` +`AND is_refund=false` | AŞAĞI |

**İnvariantlar (dəyişdirilmir):**
- `complete_payment_atomic_v2` FROZEN — toxunulmur.
- `order_payments` = canonical ledger — DELETE yalnız reopen-da (mövcud contract).
- Idempotency keys — mövcud sxemlərə toxunulmur, yalnız B2-də net-guard əlavə.
- RLS, state-machine item guard, agg trigger — toxunulmur.

---

## SƏNDƏN QƏRAR (apply ƏVVƏLƏ təsdiqlə)

**R1. Reopen refund-lu sətirlərə nə edir?** İndiki contract: `DELETE FROM order_payments` (refund trail-i order_payments-dən silinir; audit_logs + operation_logs-da qalır).
- (a) **Mövcud contractı saxla** (sərfəli, audit qalır) — təqviməm.
- (b) Reopen refund sətirlərini saxlasın (yalnız ödəniş sətirlərini sıfırlasın) — tam trail, amma reopen+repay-da refund hələ "var" görünüb B4-ə ziddiyyət yarada bilər.
→ **Təklifim (a).**

**R2. Reopen tam refund-olunan (voided, total=0) itemları yenidən satır?** İndiki: reopen status=new amma voided item total=0 qalır → total_amount yenə originaldır → repay original-a çatar, voided item "pul tələb" etmir amma total-a daxil qalır.
- (a) Reopen = "payment-i geri çək, itemlar olduğu kimi" (voided qalır, onlar yenidən satılmır; total = əlavə olmayan itemların cəmi) — düzgün POS semantika.
- (b) Reopen = "tam sıfırla, bütün itemləri geri qaytar" (voided-ləri də yenidən açıq et).
→ **Təklifim (a)** — amma bu `total_amount`-ı recompute tələb edir ki, bu 1.5/SSOT (D-9) ilə birgə edilməlidir. D-8-only migration-da (a) B3/B4/B5-ə kifayətdir; voided-item-total problemini **1.5 SSOT**-a salıram (oraya D-9 də var).

**R3. Test:** Migration apply-dən sonra E2E (pay→full refund→reopen→repay / pay→partial refund→reopen→repay) + double-stock guard yoxlaması edərəm (0 residu). Sən təsdiqlə, edim.

---
**STATUS: DİZAYN + MİQRASİYA HAZIRDİR. APPLY ETMƏDİM.** Sən R1/R2-ə bax, "apply" de → migration işə salınar + E2E.

---
## ƏLAVƏ (2026-09-10) — imza keşfi + dry-run

- **Səhv tapıldı + düzəldildi:** `reopen_order_atomic`-ın canlı imzası `p_performed_by_terminal_id **TEXT**` idi (oid 29843), əvvəlki migration draft `uuid` yazırdı → Postgres bunu replace ETMƏYİB, yeni overload yaratdı. Dry-run-da `text` imza ilə təsdiqləndi ki, düzgün əvəz edir (overload yoxdur).
- **DB vəziyyəti:** migration HƏLƏ APPLY olunmayıb (dry-run ROLLBACK ilə, 8/8 yoxlama = orijinal). `order_payments=61`, `inventory_logs=709`, `state_transitions` orijinal.
- **Səhv apply (əvvəlki) tam geri qaytarıldı:** 5 funksiya `CREATE OR REPLACE` + overload `DROP` + transition `DELETE` ilə orijinala bərpa olundu, 8 yoxlamayla təsdiq.
