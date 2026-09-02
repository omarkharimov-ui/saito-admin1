-- ============================================================================
-- DEMO SEED for Staff UX preview (idempotent-ish; safe to re-run)
-- Inserts clearly demo staff + realistic live data for TODAY so KPI strip,
-- directory cards, detail drawer tabs all show non-zero data end-to-end.
-- ============================================================================

-- ---- 0) demo staff (fixed UUIDs) -------------------------------------------
INSERT INTO public.staff
  (id, name, full_name, phone, email, pin_hash, is_active, shift, hourly_rate,
   overtime_rate, role_id, expected_cash, drawer_variance, risk_score, risk_level,
   risk_flags, last_activity, can_apply_discount, can_void_items,
   can_open_drawer_without_sale, can_refund, can_view_reports, can_manage_staff)
VALUES
 ('15000000-0000-4000-8000-000000000001','Kamran Əliyev','Kamran Əliyev','+99450 301 12 01','kamran@saito.az','seed',true,'full_time',8,1.5,'cd686876-10d9-4cb2-8cf7-ca6e30beb850',0,0,12,'low','{}',now(),true,false,false,false,false,false),
 ('15000000-0000-4000-8000-000000000002','Nurlan Qasımov','Nurlan Qasımov','+99450 301 12 02','nurlan@saito.az','seed',true,'full_time',8,1.5,'cd686876-10d9-4cb2-8cf7-ca6e30beb850',0,0,6,'low','{}',now(),true,false,false,false,false,false),
 ('15000000-0000-4000-8000-000000000003','Rəşad Məmmədov','Rəşad Məmmədov','+99450 301 12 03','resad@saito.az','seed',true,'full_time',10,1.5,'24051900-4d57-46e7-8790-b28a09c1a1ad',0,0,15,'low','{}',now(),false,true,false,false,false,false),
 ('15000000-0000-4000-8000-000000000004','Emin Hüseynov','Emin Hüseynov','+99450 301 12 04','emin@saito.az','seed',true,'full_time',10,1.5,'24051900-4d57-46e7-8790-b28a09c1a1ad',0,0,72,'high','{late_tickets,re_fired}',now(),false,true,false,false,false,false),
 ('15000000-0000-4000-8000-000000000005','Leyla Kərimova','Leyla Kərimova','+99450 301 12 05','leyla@saito.az','seed',true,'full_time',9,1.5,'945137c3-fc59-457e-abaa-c16ff8e9cee3',200,35,68,'high','{drawer_variance}',now(),true,true,true,false,false,false),
 ('15000000-0000-4000-8000-000000000006','Tural Əsgərov','Tural Əsgərov','+99450 301 12 06','tural@saito.az','seed',true,'full_time',11,1.5,'f3b15dcb-0f64-4361-9f0a-ba029f290c21',0,0,8,'low','{}',now(),false,false,false,false,false,false),
 ('15000000-0000-4000-8000-000000000007','Aysel Nəbiyeva','Aysel Nəbiyeva','+99450 301 12 07','aysel@saito.az','seed',true,'part_time',7,1.5,'5667b32a-b7f8-4034-b749-73519cb928d8',0,0,3,'low','{}',now(),false,false,false,false,false,false),
 ('15000000-0000-4000-8000-000000000008','Fərid Səlimov','Fərid Səlimov','+99450 301 12 08','ferid@saito.az','seed',true,'full_time',15,1.5,'bb579b8a-022d-4f89-99c7-56eebcec3032',0,0,22,'medium','{void_refund_approvals}',now(),true,true,true,true,true,true)
ON CONFLICT (id) DO NOTHING;

-- ---- 1) locations (restaurant outlets) + staff_locations -------------------
INSERT INTO public.locations (id, name, address, is_active)
VALUES
 ('70000000-0000-4000-8000-000000000001','Saito Nizami','Bakı, Nizami küç. 98',true),
 ('70000000-0000-4000-8000-000000000002','Saito Dənizkənarı','Bakı, Dənizkənarı Bulvar 3',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_locations (staff_id, location_id, is_primary, assigned_at)
VALUES
 ('15000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',true,now()),
 ('15000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001',false,now()),
 ('15000000-0000-4000-8000-000000000006','70000000-0000-4000-8000-000000000001',true,now()),
 ('15000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000001',true,now());

-- ---- 2) extra cash registers ------------------------------------------------
INSERT INTO public.cash_registers (name, terminal_id, location, status)
VALUES ('VIP Kassa','POS-02','Nizami', 'active'),
       ('Bar Kassa','POS-03','Bar',   'active')
ON CONFLICT DO NOTHING;

-- ---- 3) OPEN shifts today (feeds live_shifts, labor_cost, on_shift) --------
INSERT INTO public.shifts (staff_id, report_date, opened_at, starting_cash, active_role_id)
VALUES
 ('15000000-0000-4000-8000-000000000001', CURRENT_DATE, (CURRENT_DATE + time '10:05')::timestamptz, 0,   'cd686876-10d9-4cb2-8cf7-ca6e30beb850'),
 ('15000000-0000-4000-8000-000000000002', CURRENT_DATE, (CURRENT_DATE + time '10:30')::timestamptz, 0,   'cd686876-10d9-4cb2-8cf7-ca6e30beb850'),
 ('15000000-0000-4000-8000-000000000003', CURRENT_DATE, (CURRENT_DATE + time '09:00')::timestamptz, 0,   '24051900-4d57-46e7-8790-b28a09c1a1ad'),
 ('15000000-0000-4000-8000-000000000004', CURRENT_DATE, (CURRENT_DATE + time '09:15')::timestamptz, 0,   '24051900-4d57-46e7-8790-b28a09c1a1ad'),
 ('15000000-0000-4000-8000-000000000005', CURRENT_DATE, (CURRENT_DATE + time '09:45')::timestamptz, 150, '945137c3-fc59-457e-abaa-c16ff8e9cee3'),
 ('15000000-0000-4000-8000-000000000006', CURRENT_DATE, (CURRENT_DATE + time '11:00')::timestamptz, 0,   'f3b15dcb-0f64-4361-9f0a-ba029f290c21'),
 ('15000000-0000-4000-8000-000000000007', CURRENT_DATE, (CURRENT_DATE + time '11:30')::timestamptz, 0,   '5667b32a-b7f8-4034-b749-73519cb928d8');

-- ---- 4) closed shifts for past 6 days (feeds SPLH hours, reviews) ----------
DO $$
DECLARE d date; staff uuid; shid uuid;
BEGIN
  FOR d IN SELECT CURRENT_DATE - gs FROM generate_series(1,6) gs LOOP
    FOR staff IN SELECT id FROM public.staff WHERE id::text LIKE '15000000-%' LOOP
      INSERT INTO public.shifts (staff_id, report_date, opened_at, closed_at, starting_cash, actual_cash, expected_cash, difference, active_role_id)
      VALUES (
        staff, d,
        (d + time '10:00')::timestamptz,
        (d + time '18:00')::timestamptz,
        (random()*100)::numeric(10,2),
        (200 + random()*800)::numeric(10,2),
        200, ((200 + random()*800) - 200)::numeric(10,2),
        (SELECT role_id FROM public.staff s WHERE s.id = staff)
      )
      RETURNING id INTO shid;
    END LOOP;
  END LOOP;
END $$;

-- ---- 5) time_clock_entries for open + previous-day shifts ------------------
DO $$
DECLARE d date; staff uuid; shid uuid; start_ts timestamptz;
BEGIN
  -- clock_in for everyone with an open shift today
  FOR shid, staff, start_ts IN
    SELECT sh.id, sh.staff_id, sh.opened_at FROM public.shifts sh WHERE sh.closed_at IS NULL AND sh.staff_id::text LIKE '15000000-%'
  LOOP
    INSERT INTO public.time_clock_entries (staff_id, entry_type, timestamp, pin_verified, source)
    VALUES (staff, 'clock_in', start_ts, true, 'admin_panel');
  END LOOP;
  -- clock_in + clock_out yesterday for all demo staff
  SELECT CURRENT_DATE - 1 INTO d;
  FOR staff, shid, start_ts IN
    SELECT sh.staff_id, sh.id, sh.opened_at FROM public.shifts sh
    WHERE sh.staff_id::text LIKE '15000000-%' AND sh.closed_at <= (CURRENT_DATE - 1)::timestamptz + time '23:59'::time AND sh.opened_at >= (CURRENT_DATE - 1)::timestamptz
  LOOP
    INSERT INTO public.time_clock_entries (staff_id, entry_type, timestamp, pin_verified, source)
    VALUES (staff, 'clock_in', start_ts, true, 'admin_panel'),
           (staff, 'clock_out', start_ts + interval '8 hours', true, 'admin_panel');
  END LOOP;
END $$;

-- ---- 6) TODAY's orders (feeds KPIs + staff_stats + detail) -----------------
INSERT INTO public.orders
  (status, total_amount, cash_amount, card_amount, discount_amount, refund_amount, void_reason, created_by, created_at, table_number, order_number, payment_method, is_draft)
SELECT
  'paid',
  round(((random()*25+8) * 5)::numeric, 2),
  CASE WHEN random() < 0.45 THEN round(((random()*25+8) * 5)::numeric,2) ELSE 0 END,
  CASE WHEN random() >= 0.45 THEN round(((random()*25+8) * 5)::numeric,2) ELSE 0 END,
  CASE WHEN g % 9 = 0 THEN round((random()*3)::numeric,2) ELSE 0 END,
  CASE WHEN g % 17 = 0 THEN round((random()*20+5)::numeric,2) ELSE 0 END,
  CASE WHEN g % 13 = 0 THEN 'Müştəri orderi ləğv etdi' ELSE NULL END,
  (ARRAY[
    '15000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000002',
    '15000000-0000-4000-8000-000000000002',
    '15000000-0000-4000-8000-000000000006'])[1 + (g % 6)]::uuid,
  (CURRENT_DATE + (time '11:00' + (g ||' minutes')::interval))::timestamptz,
  1 + (g % 15),
  'ORD-' || (2500 + g),
  CASE WHEN random() < 0.5 THEN 'cash' WHEN random() < 0.8 THEN 'card' ELSE 'qrv' END,
  false
FROM generate_series(1, 40) g;

-- duplicate ~14 orders on previous 5 days for lifetime/performance stats
INSERT INTO public.orders
  (status, total_amount, cash_amount, card_amount, discount_amount, refund_amount, created_by, created_at, table_number, order_number, payment_method, is_draft)
SELECT
  'paid',
  round(((random()*25+8) * random() * 3)::numeric, 2),
  round(((random()*10)::numeric), 2),
  round(((random()*30)::numeric), 2),
  CASE WHEN g % 11 = 0 THEN round((random()*2)::numeric,2) ELSE 0 END,
  0,
  (ARRAY[
    '15000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000002',
    '15000000-0000-4000-8000-000000000006'])[1 + (g % 3)]::uuid,
  (CURRENT_DATE - ((g % 5) || ' days')::interval + (time '12:00' + (g ||' minutes')::interval))::timestamptz,
  1 + (g % 15),
  'ORD-' || (2700 + g),
  CASE WHEN random() < 0.5 THEN 'cash' ELSE 'card' END,
  false
FROM generate_series(1, 70) g;

-- ---- 7) void operation_logs today (feeds high_risk_voids) ------------------
INSERT INTO public.operation_logs (action, operation, performed_by, reason, created_at, old_state, new_state)
SELECT 'void', 'void', '15000000-0000-4000-8000-000000000001',
       'Müştəri düşüncəsindən sonra ləğv', (CURRENT_DATE + (time '12:00' + (g ||' minutes')::interval))::timestamptz, '{}', '{}'
FROM generate_series(1,5) g;

-- ---- 8) kitchen tickets today (feeds directory kitchen metrics) ------------
INSERT INTO public.kitchen_tickets (order_id, assigned_to, status, priority, created_at, started_at, completed_at, notes)
SELECT
  o.id,
  CASE WHEN o.rn % 2 = 0 THEN '15000000-0000-4000-8000-000000000004' ELSE '15000000-0000-4000-8000-000000000003' END::uuid,
  CASE WHEN o.rn % 4 = 0 THEN 'preparing'
       WHEN o.rn % 9 = 0 THEN 'cancelled'
       ELSE 'completed' END,
  o.rn % 3,
  o.created_at,
  o.created_at + interval '2 minutes',
  CASE WHEN o.rn % 9 = 0 THEN NULL ELSE o.created_at + interval '9 minutes' END,
  'Demo ticket'
FROM (SELECT o.id, o.created_at, row_number() over (order by o.id) AS rn
      FROM public.orders o
      WHERE DATE(o.created_at) = CURRENT_DATE AND o.created_by::text LIKE '15000000-%'
      LIMIT 24) o;

-- ---- 9) waiter assignments today (feeds tables/guests/tips) ----------------
INSERT INTO public.waiter_assignments (waiter_id, table_id, guest_count, status, seated_at, completed_at, total_amount, tip_amount)
SELECT
  (ARRAY[
    '15000000-0000-4000-8000-000000000001',
    '15000000-0000-4000-8000-000000000002'])[1 + (g % 2)]::uuid,
  (ARRAY[
    '76af57cf-76a6-4434-b649-b476b7a92c6a','019be67d-54d9-45f1-a48a-88f3b98b5d3e',
    '0e70d20c-2cf9-43a7-bf36-30a72cfa384f','ad048851-e038-422c-8bab-4a2547ffcba6',
    '6e0434a7-8497-4a57-8338-8af8e83681c6','ab90c9cf-ac68-46bf-ac58-bfad485f3d1b'])[1 + (g % 6)]::uuid,
  1 + (g % 4),
  CASE WHEN g % 3 = 0 THEN 'occupied' ELSE 'completed' END,
  (CURRENT_DATE + (time '11:00' + (g || ' minutes')::interval))::timestamptz,
  CASE WHEN g % 3 = 0 THEN NULL ELSE (CURRENT_DATE + (time '12:30' + (g || ' minutes')::interval))::timestamptz END,
  round((random()*60+20)::numeric,2),
  round((random()*8+1)::numeric,2)
FROM generate_series(1, 18) g;

-- ---- 10) price_overrides today (feeds staff_activity) ----------------------
INSERT INTO public.price_overrides (order_id, staff_id, catalog_price, override_price, variance, variance_percent, reason, manager_approved)
SELECT o.id, o.created_by, 22.00, 18.00, -4.00, -18.18, 'Daimi müştəri endirimi', true
FROM public.orders o WHERE DATE(o.created_at)=CURRENT_DATE AND o.created_by::text LIKE '15000000-%' LIMIT 3;

-- ---- 11) staff_metrics daily (7 days) ---------------------------------------
DO $$
DECLARE d date; staff uuid;
BEGIN
  FOR d IN SELECT CURRENT_DATE - gs FROM generate_series(0,6) gs LOOP
    FOR staff IN SELECT id FROM public.staff WHERE id::text LIKE '15000000-%' LOOP
      INSERT INTO public.staff_metrics
        (staff_id, metric_date, active_tickets, completed_tickets, avg_prep_time, late_tickets,
         cancelled_tickets, active_tables, tables_served, guests_served, avg_table_turnaround,
         total_tips, avg_ticket_size, cash_sales, card_sales, total_voids, total_discounts,
         total_refunds, drawer_variance, total_orders, total_revenue)
      VALUES (
        staff, d,
        (random()*4)::int, (random()*20+20)::int, make_interval(mins => (8 + random()*10)::int),
        (random()*3)::int, (random()*2)::int,
        (random()*6+2)::int, ((random()*10+8)::int), ((random()*25+15)::int),
        make_interval(mins => (35 + random()*20)::int),
        round((random()*40+10)::numeric,2), round((random()*15+7)::numeric,2),
        round((random()*300+100)::numeric,2), round((random()*250+50)::numeric,2),
        (random()*4)::int, round((random()*10)::numeric,2),
        round((random()*8)::numeric,2), round((random()*12)::numeric,2),
        ((random()*20+15)::int), round((random()*900+300)::numeric,2)
      );
    END LOOP;
  END LOOP;
END $$;

-- ---- 12) risk_scores today --------------------------------------------------
INSERT INTO public.risk_scores (staff_id, score_date, total_score, cash_variance_score, void_score, refund_score, override_score, permission_denied_score)
SELECT id, CURRENT_DATE,
  CASE id::text WHEN '15000000-0000-4000-8000-000000000004' THEN 72
                WHEN '15000000-0000-4000-8000-000000000005' THEN 68
                WHEN '15000000-0000-4000-8000-000000000008' THEN 22
                ELSE 0 END,
  0,0,0,0,0
FROM public.staff WHERE id::text LIKE '15000000-%';

-- ---- 13) tip pool today + shortfalls ----------------------------------------
INSERT INTO public.tip_pools (pool_date, total_amount, status) VALUES (CURRENT_DATE, 246.00, 'open');
INSERT INTO public.tip_shortfalls (staff_id, period_start, period_end, hours_worked, tipped_wage_rate, minimum_wage, tips_earned, shortfall_amount, is_resolved)
SELECT id, CURRENT_DATE - 28, CURRENT_DATE, 120, 4.00, 6.50, round((random()*120+40)::numeric,2), round((random()*80+20)::numeric,2), false
FROM public.staff WHERE id::text LIKE '15000000-%';

-- ---- 14) shift_reviews for recent closed shifts ----------------------------
INSERT INTO public.shift_reviews (shift_id, staff_id, review_status, hours_worked, total_sales, non_cash_tips, declared_cash_tips, declared_tip_out, declared_notes, manager_notes, reviewed_by, reviewed_at)
SELECT sh.id, sh.staff_id,
  CASE WHEN sh.opened_at::date = CURRENT_DATE - 1 THEN 'approved' ELSE 'pending' END,
  8, round((random()*800+200)::numeric,2), round((random()*40+10)::numeric,2),
  round((random()*30+5)::numeric,2), round((random()*10)::numeric,2),
  'Demo review', 'Yoxlanıldı', '15000000-0000-4000-8000-000000000008', sh.closed_at
FROM public.shifts sh
WHERE sh.staff_id::text LIKE '15000000-%' AND sh.closed_at IS NOT NULL
LIMIT 16;

-- ---- 15) security_events today ---------------------------------------------
INSERT INTO public.security_events (staff_id, event_type, success, ip_address, user_agent, metadata, created_at)
SELECT id,
  CASE WHEN g=0 THEN 'login' WHEN g=1 THEN 'login' WHEN g=2 THEN 'login_failed' WHEN g=3 THEN 'permission_denied' ELSE 'clock_in' END,
  CASE WHEN g IN (2,3) THEN false ELSE true END, '85.132.20.' || (10+g)::text, 'Demo Browser/5.0', '{}',
  (CURRENT_DATE + (time '09:00' + (g || ' minutes')::interval))::timestamptz
FROM public.staff s, generate_series(0,4) g WHERE s.id::text LIKE '15000000-%';

-- ---- 16) approval_requests today --------------------------------------------
INSERT INTO public.approval_requests (staff_id, action_type, entity_type, amount, reason, status, old_values, new_values)
SELECT ('15000000-0000-4000-8000-00000000000' || (1 + (g % 5))::text)::uuid,
  CASE WHEN g % 2 = 0 THEN 'void' ELSE 'refund' END, 'order', round((random()*30+5)::numeric,2),
  CASE WHEN g % 2 = 0 THEN 'Müştəri şikayəti' ELSE 'Artıq ödəniş geri qaytarıldı' END,
  CASE WHEN g % 3 = 0 THEN 'approved' ELSE 'pending' END, '{}', '{}'
FROM generate_series(1,8) g;

-- ---- 17) payroll periods + entries ------------------------------------------
INSERT INTO public.payroll_periods (id, period_start, period_end, status, total_gross_pay, total_hours)
VALUES ('80000000-0000-4000-8000-000000000001', '2026-07-01', '2026-07-31', 'locked', 0, 0),
       ('80000000-0000-4000-8000-000000000002', '2026-08-01', '2026-08-31', 'open', 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payroll_entries (payroll_period_id, staff_id, regular_hours, overtime_hours, regular_pay, overtime_pay, tips, gross_pay, notes)
SELECT '80000000-0000-4000-8000-000000000002', s.id,
 160 + (g % 3), g % 2,
 s.hourly_rate * (160 + (g % 3)), s.hourly_rate * 1.5 * (g % 2),
 round((random()*180+60)::numeric,2),
 s.hourly_rate * (160 + (g % 3)) + s.hourly_rate * 1.5 * (g % 2) + round((random()*180+60)::numeric,2),
 'Demo entry'
FROM (SELECT id, hourly_rate, row_number() over (order by id) rn FROM public.staff WHERE id::text LIKE '15000000-%') s
CROSS JOIN generate_series(0, 0) g;

-- ---- 18) weekly schedule (next 7 days) --------------------------------------
INSERT INTO public.schedule (staff_id, schedule_date, planned_start, planned_end, role_at_time, notes)
SELECT s.id, CURRENT_DATE + gs, '10:00'::time, '18:00'::time, r.name, 'Demo shift'
FROM public.staff s JOIN public.roles r ON r.id = s.role_id
CROSS JOIN generate_series(1,7) gs
WHERE s.id::text LIKE '15000000-%'
  AND (CURRENT_DATE + gs)::text NOT IN ('2026-09-06');

-- ---- 19) staff_documents ----------------------------------------------------
INSERT INTO public.staff_documents (staff_id, document_type, file_name, file_path, file_size, mime_type, is_verified, verified_by)
VALUES
 ('15000000-0000-4000-8000-000000000001','contract','kamran_muqavile.pdf','/docs/kamran.pdf',120, 'application/pdf', true, '15000000-0000-4000-8000-000000000008'),
 ('15000000-0000-4000-8000-000000000001','id','kamran_id.png','/docs/kamran_id.png',340,'image/png', true, '15000000-0000-4000-8000-000000000008'),
 ('15000000-0000-4000-8000-000000000005','contract','leyla_muqavile.pdf','/docs/leyla.pdf',110,'application/pdf', false, NULL),
 ('15000000-0000-4000-8000-000000000003','medical','resad_saglamliq.pdf','/docs/resad.pdf',90,'application/pdf', true, '15000000-0000-4000-8000-000000000008');