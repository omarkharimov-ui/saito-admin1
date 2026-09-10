-- ============================================================================
-- A#1 — pg_cron SCHEDULER JOBS
-- STATUS: ✅ QURULDU (2026-09-11) — pooler 'postgres' roluna cron.schedule(text,text,text)
-- icazəsi var olduğu üçün jobs `cron.schedule(...)` ilə birbaşa yaradıldı.
-- cron.job INSERT icazəsi YOXDUR amma cron.schedule funksiya icazəsi var — bu
-- fayl yalnız reaktivasiya/backup üçün saxlanılır (Studio-da icra edilə bilər).
--
-- Mövcud jobs (cron.job): auto-clockout-staff */5, outbox-pump */30s,
-- kitchen-schedules * * * * *, auto-no-show */15s, stock-thresholds */10s,
-- expired-reservations */15s, tip-shortfall 0 1 * * *
-- ============================================================================

DO $$
DECLARE
  v_count INT;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT * FROM (VALUES
      ('outbox-pump',            '*/30 * * * * *', 'SELECT public.outbox_pump()'),
      ('kitchen-schedules',      '* * * * *',      'SELECT public.process_due_kitchen_schedules()'),
      ('auto-no-show',           '*/15 * * * * *', 'SELECT public.auto_no_show_v2()'),
      ('stock-thresholds',       '*/10 * * * * *', 'SELECT public.check_stock_thresholds()'),
      ('expired-reservations',   '*/15 * * * * *', 'SELECT public.process_expired_reservations_atomic()'),
      ('tip-shortfall',          '0 1 * * *',      'SELECT public.auto_calculate_tip_shortfalls((now() - interval ''1 day'')::date, now()::date)')
    ) AS v(name, schedule, command)
  LOOP
    SELECT count(*) INTO v_count FROM cron.job WHERE jobname = v_rec.name;
    IF v_count = 0 THEN
      INSERT INTO cron.job (jobname, schedule, command)
      VALUES (v_rec.name, v_rec.schedule, v_rec.command);
    END IF;
  END LOOP;
END;
$$;

-- Verifikasiya:
SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobname;
