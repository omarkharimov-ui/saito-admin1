-- 20260924040000_fix_order_number_lpad_truncation.sql
-- 2026-09-24 (owner: "masa 901-də yerleşdirdim, amma 97/98-də tək terminaldan,
-- tək klikdə 409 — valla, başqa bir şey mane olur"): ROOT CAUSE — lpad
-- truncation in next_order_number.
--
-- Postgres lpad(string, length, fill) TRUNCATES inputs longer than `length`
-- (from the right). The old body did:
--     RETURN p_prefix || lpad(v_num::text, 3, '0');
-- so once a location's sequence passed 999, the number was CLIPPED to 3
-- digits:
--     v_num=2777 -> '277'  (ORD-277)
--     v_num=2784 -> '278'  (ORD-278)
--     v_num=2794 -> '279'  (ORD-279)   <- the 02:46 dine-in order (table 901)
--     v_num=2795 -> '279'  (ORD-279)   <- ALREADY EXISTS -> 409!
--     v_num=2796..2799 -> '279'        <- 409, 409, 409 ...
-- idx_orders_order_number is a GLOBAL unique index on order_number, so every
-- new dine-in order after the sequence crossed 999 collided with the first
-- order of the same 3-digit block and 409'd — misreported to the cashier as
-- "Sifariş eyni anda başqa terminaldan dəyişdirildi" (no second terminal was
-- ever involved). It looks table-specific because the FIRST order of each
-- block succeeds (that was table 901 at 02:46) and everything after fails.
--
-- Fix: dynamic zero-padding width — 3-digit padding up to 999, natural
-- length after (2795 -> 'ORD-2795'). Existing (already-truncated) numbers
-- are left as-is; new numbers can never collide with them (4+ digits vs 3).

CREATE OR REPLACE FUNCTION public.next_order_number(p_prefix text, p_location uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_num integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_prefix || p_location::text));
  INSERT INTO order_number_sequences (prefix, location_id, last_num)
  VALUES (p_prefix, p_location, 1)
  ON CONFLICT (prefix, location_id)
  DO UPDATE SET last_num = order_number_sequences.last_num + 1
  RETURNING last_num INTO v_num;
  RETURN p_prefix || lpad(v_num::text, GREATEST(3, length(v_num::text)), '0');
END;
$function$;
