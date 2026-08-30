import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Missing Supabase configuration. Restart the dev server after creating .env.local');
  }
  return {
    url,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { table_id, guest_count } = await req.json();
    if (!table_id) return NextResponse.json({ error: 'Table ID required' }, { status: 400 });

    const s = svc();

    // Atomic activate via RPC
    const rpcRes = await fetch(`${s.url}/rest/v1/rpc/activate_table_atomic`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        p_table_id: table_id,
        p_guest_count: guest_count || null,
      }),
    });

    if (!rpcRes.ok) {
      const errText = await rpcRes.text();
      const status = rpcRes.status;
      if (status === 409) return NextResponse.json({ error: 'Table is not reserved' }, { status: 409 });
      return NextResponse.json({ error: `Activation failed: ${errText}` }, { status: 500 });
    }

    const rpcData = await rpcRes.json();
    return NextResponse.json({ 
      success: true, 
      table: rpcData?.table, 
      order: rpcData?.order, 
      items: rpcData?.items 
    });
  } catch (error: any) {
    console.error('[API /tables/activate] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
