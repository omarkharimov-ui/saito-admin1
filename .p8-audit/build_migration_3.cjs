// Build 20260917000003_p8_idempotency_order.sql from the live close_v2 body:
// move the drawer idempotency REPLAY check from inside the token path (after the
// 'Session already closed' return) to the TOP of the function (P-4 ordering).
'use strict';
const fs=require('fs');
let body=fs.readFileSync('.p8-audit/close_v2_body.sql','utf8');
const assertOnce=(s,frag)=>{const n=s.split(frag).length-1;if(n!==1)throw new Error('expected exactly 1 occurrence, got '+n+' for: '+frag.slice(0,60));};

const OLD_BLOCK=`    IF p_idempotency_key IS NOT NULL THEN
      SELECT order_id, amount, result INTO v_idem_oid, v_idem_amt, v_idem_res
      FROM public.payment_idempotency_keys
      WHERE namespace = 'drawer' AND key = p_idempotency_key;
      IF FOUND THEN
        IF v_idem_oid IS DISTINCT FROM p_session_id
           OR v_idem_amt IS DISTINCT FROM COALESCE(p_actual_cash, 0) THEN
          RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to session % amount %; request was session % amount %',
            p_idempotency_key, v_idem_oid, v_idem_amt, p_session_id, p_actual_cash;
        END IF;
        RETURN COALESCE(v_idem_res, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING'))
               || jsonb_build_object('idempotent', true, 'duplicate', true);
      END IF;
    END IF;
`;
const NEW_TOP=`  -- P-8 (D-11, P-4 ordering — gate T-4 fix, 20260917000003): idempotent replay is
  -- checked FIRST, before the session status check. A retry of an already-committed
  -- close must return the original stored result (idempotent:true), NOT 'Session
  -- already closed'. Binding (session + amount) is verified pre-access. The trusted
  -- path (p_token NULL) carries no key and is unaffected.
  IF p_token IS NOT NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT order_id, amount, result INTO v_idem_oid, v_idem_amt, v_idem_res
    FROM public.payment_idempotency_keys
    WHERE namespace = 'drawer' AND key = p_idempotency_key;
    IF FOUND THEN
      IF v_idem_oid IS DISTINCT FROM p_session_id
         OR v_idem_amt IS DISTINCT FROM COALESCE(p_actual_cash, 0) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: key % is bound to session % amount %; request was session % amount %',
          p_idempotency_key, v_idem_oid, v_idem_amt, p_session_id, p_actual_cash;
      END IF;
      RETURN COALESCE(v_idem_res, jsonb_build_object('success', false, 'error', 'IDEMPOTENCY_DATA_MISSING'))
             || jsonb_build_object('idempotent', true, 'duplicate', true);
    END IF;
  END IF;

`;

assertOnce(body,OLD_BLOCK);
assertOnce(body,'BEGIN\n  SELECT * INTO v_session FROM public.cash_drawer_sessions');
assertOnce(body,'  -- location binding + idempotency. p_token NULL = trusted service/postgres');

// 1) remove the old nested block
body=body.replace(OLD_BLOCK,'');
// 2) fix the now-stale comment in the token path
body=body.replace(
`  -- P-8 (D-5/D-10/D-11): token path = app/route context → full identity +
  -- location binding + idempotency. p_token NULL = trusted service/postgres`,
`  -- P-8 (D-5/D-10/D-11): token path = app/route context → full identity +
  -- location binding (D-11 idempotency replay check moved to function top — P-4 ordering). p_token NULL = trusted service/postgres`);
// 3) insert the replay check at the top (right after BEGIN)
body=body.replace('BEGIN\n  SELECT * INTO v_session FROM public.cash_drawer_sessions',
  'BEGIN\n'+NEW_TOP+'  SELECT * INTO v_session FROM public.cash_drawer_sessions');

const mig=`-- =============================================================================
-- P-8 D-11 IDEMPOTENCY ORDERING FIX (2026-09-17) — found by .p8-gate.cjs T-4 run 2.
-- close_cash_register_v2 returned 'Session already closed' BEFORE checking the
-- drawer idempotency key, so a client retry of an ALREADY-COMMITTED close (same
-- session + same key + same amount) got {success:false} instead of the stored
-- original result with idempotent:true. This breaks the ratified D-11 contract
-- ("P-4 pattern, drawer namespace"): idempotent replay must be checked FIRST.
-- Trusted 5-arg path (p_token NULL) is unaffected (it never carries a key).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_cash_register_v2(
  p_session_id uuid,
  p_actual_cash numeric,
  p_notes text,
  p_manager_id uuid,
  p_performed_by uuid,
  p_token text,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$
`+body+`\$\$;
`;
fs.writeFileSync('supabase/migrations/20260917000003_p8_idempotency_order.sql',mig);
console.log('WROTE supabase/migrations/20260917000003_p8_idempotency_order.sql ('+mig.split('\n').length+' lines)');
// sanity: the top block must precede the 'Session already closed' return
const mi=mig.split('\n');
const iTop=mi.findIndex(l=>l.includes('gate T-4 fix'));
const iClosed=mi.findIndex(l=>l.includes("RETURN jsonb_build_object('success', false, 'error', 'Session already closed'"));
if(!(iTop>0&&iTop<iClosed))throw new Error('block order wrong: top='+iTop+' closed='+iClosed);
if(mi.filter(l=>l.includes('IF p_idempotency_key IS NOT NULL THEN')).length!==0)throw new Error('bare old read block still present');
if(mi.filter(l=>l.includes('IF p_token IS NOT NULL AND p_idempotency_key IS NOT NULL THEN')).length!==2)throw new Error('AND-form count wrong (expect 2: top replay check + write-side bind guard)');
console.log('ORDER OK: replay check line',iTop+1,'< session-closed line',iClosed+1);
