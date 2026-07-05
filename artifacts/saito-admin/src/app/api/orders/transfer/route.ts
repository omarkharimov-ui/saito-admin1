import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { executeTransactionalOrderAction } from '@/lib/transaction';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { from_table, to_table } = await request.json();

    if (!from_table || !to_table) {
      return NextResponse.json({ error: 'from_table and to_table required' }, { status: 400 });
    }

    const result = await executeTransactionalOrderAction('TableTransfer', async () => {
      // Use atomic RPC with FOR UPDATE — locks source tables + target floor
      const { data: rpcResult, error: rpcError } = await supabase.rpc('transfer_orders_atomic', {
        p_from_table: from_table,
        p_to_table: to_table,
        p_performed_by: auth.user?.id || null,
      });

      if (rpcError) {
        if (rpcError.message === 'TARGET_TABLE_RESERVED') {
          throw new Error('TARGET_TABLE_RESERVED');
        }
        if (rpcError.message === 'TARGET_TABLE_OCCUPIED') {
          throw new Error('TARGET_TABLE_OCCUPIED');
        }
        throw rpcError;
      }

      return rpcResult;
    });

    if (!result.success) {
      if (result.error === 'TARGET_TABLE_RESERVED') {
        return NextResponse.json({ error: 'Hədəf masa rezerv edilib' }, { status: 409 });
      }
      if (result.error === 'TARGET_TABLE_OCCUPIED') {
        return NextResponse.json({ error: 'Target table is already occupied' }, { status: 409 });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

