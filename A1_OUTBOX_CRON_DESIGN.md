# A#1 — OUTBOX CONSUMER + CRON SCHEDULER — DİZAYN QEYDİ (2026-09-11)

## Problemlər (REAL DB sübutu)
1. `outbox_events`-a yazılır (`emit_outbox_event`) amma **consumer YOX** — 309 event backlog
   (table.kitchen_changed=123, table.status_changed=89, table.order_changed=63, kds.ticket.upsert=58,
   order.status_changed=19, location.*/staff.*/inventory.* = qalan).
2. 6 cron route var amma **scheduler yalnız 1 job** işlədir: `pg_cron` → `auto-clockout-staff */5`.
   Qalan 5 (auto-no-show, stock-thresholds, kitchen-schedules, tip-shortfall, expired-reservations)
   heç trigger olunmur → son izlər: no_show=2026-07-19, tip_shortfall=2026-09-01.
3. Müddəti keçib proses edilməyən reservation: 12 (confirmed/pending, date < bugün).
4. `/api/cron/check-stock-thresholds` route-u özü məntiq işlədir amma köhnə sütun adlarından
   istifadə edir — RPC (`check_stock_thresholds`) artıq özü discrepancy_alerts + notifications
   yazır (dedupe'lu). Route bataqlaşır → scheduler RPC-yi birbaşa işlətməlidir.

## Qərarlar
- **Scheduler = pg_cron** (artıq DB-dədir, hosting-dən asılı deyil, mövcud pattern-dir).
  `cron.job_run_details` audit verir. `pg_cron.network` offdur → bütün joblar DB-in içində
  SQL/PL-pgSQL ilə işləyir (http fetch YOX).
- **SSOT:** outbox-da tək giriş = `outbox_pump()` RPC. UI/API heç vaxt event-i birbaşa
  işlətmir. Yeni route: `/api/cron/outbox-pump` (Bearer CRON_SECRET) = əl ilə tetik +
  `process_expired_reservations`-in olmadığı qat üçün `/api/cron/process-expired-reservations`
  mövcuddur amma RPC YOXDUR → migration-da yaradıla (`process_expired_reservations_atomic`).
- **Idempotency + batch + dead-letter:**
  - claim: `SELECT ... WHERE status IN ('pending','processing') AND (next_retry_at IS NULL OR next_retry_at<=now()) FOR UPDATE SKIP LOCKED` (200/batch)
  - uğur → `status='processed', processed_at=now()`
  - xəta → `retry_count+1`; `retry_count < max_retries` → `next_retry_at = now() + (retry_count * 60s)`
    (linear backoff), deyilsə → `status='failed'` (dead-letter) + `error_message`
  - notification yazıları `EXCEPTION WHEN OTHERS` ilə sarılır → notification failure event-i
    failed ETMƏLİDİR (event özü məlumat daşıyır; UI-də bildiriş qısqıcı kritik deyil)
- **Job interval-ları (pg_cron, UTC):**
  | job | schedule | iş |
  |---|---|---|
  | `outbox-pump` | `*/30 * * * * *` (30s) | `outbox_pump()` |
  | `kitchen-schedules` | `* * * * *` (60s) | `process_due_kitchen_schedules()` |
  | `auto-no-show` | `*/15 * * * * *` (15d) | `auto_no_show_v2()` |
  | `stock-thresholds` | `*/10 * * * * *` (10d) | `check_stock_thresholds()` |
  | `expired-reservations` | `*/15 * * * * *` (15d) | `process_expired_reservations_atomic()` |
  | `tip-shortfall` | `0 1 * * *` (gündə 01:00) | `auto_calculate_tip_shortfalls(yesterday)` |
  - mövcud `auto-clockout-staff */5` — saxlanılır.
  - `pg_cron.install()` + `cron.job` DDL = transaction-dan kənarda (pg_cron tələbi) —
    apply skriptində migration block-dan AYRI icra olunur.
- **Handler-lər (pump içində, switch):**
  | event_type | əməliyyat |
  |---|---|
  | `order.status_changed` | status='paid' → order-paid notif; status IN ('cancelled','voided') → order-cancelled notif |
  | `payment.failed` | 15 dəq pəncərədə failed payment_attempts + açıq order → order-pay-failed notif |
  | `payment.refunded` / `order.refund.*` | 1 saatdakı completed refunds → refund notif (order_number, amount, by) |
  | `inventory.stock_changed` | ingredient current_stock<=critical_limit → low-stock notif (**4 saat dedupe**) |
  | digər (table.*/kds.*/location.*/staff.*) | `noop` → processed (backlog drain; kds/table realtime artıq Supabase Realtime pub ilə gedir) |
- **`process_expired_reservations_atomic()` (yeni RPC):** `auto_no_show_v2` pattern-i, amma
  `confirmed` → `no_show` (+15 dəq grace), `pending` → `cancelled` (auto_expired_reservation),
  table release (`table_floors`), operation_logs, notification (expired_reservation).
- **Təhlükəsizlik:** notification insert-lərində `title/body` dəyərləri DB-dən gəlir —
  SQL-injection YOX (parametrized PL/pGSQL), amma `body`-də user content (customer name) var
  → bildiriş UI bunu text kimi render edir (existing pattern, XSS riski mövcud app-i
  dəyişdirmir; yeni səth deyil).

## Acceptance (E2E)
1. Backlog 309 → 0 processed (48s-ə qədər, pump 30s × 200/batch)
2. Səniaryal: test order paid/void, test failed payment attempt, test low-stock ingredient,
   1 müddəti keçən confirmed + 1 pending reservation → gözlənilən notification-lar +
   reservation status + table release + operation_logs
3. Dead-letter: pozuq payload test event → 6 retry → `failed` + `error_message`
4. `cron.job_run_details`-də job-ların uğurlu run-ları

## ResidU qaydası (golden rule 5 — auto-commit)
Test event-ləri (aggregate_type='__a1_test__') sonda DELETE edilir; test ingredient
(min_limit dəyişikliyi) eski dəyərinə qaytarılır; test order/payment data-ları
saxlanılır (real orders kimi; delete-ALL helper-lərinə toxunulmur).
