import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateAuth, createAuthClient } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const s = await createAuthClient();
    const body = await request.json();
    const { action, role_id } = body;

    if (!action || !['in', 'out'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const staffId = auth.user?.id;

    if (!staffId) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    if (action === 'in') {
      const { data, error: rpcError } = await s.rpc('clock_in_atomic', {
        p_staff_id: staffId,
        p_notes: null,
        p_performed_by: staffId,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      if (role_id && data?.shift_id) {
        const svcData = svc();
        await fetch(`${svcData.url}/rest/v1/shifts?id=eq.${data.shift_id}`, {
          method: 'PATCH',
          headers: { ...svcData.headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ active_role_id: role_id }),
        }).catch(() => {});
      }

      return NextResponse.json(data);
    } else {
      const { data, error: rpcError } = await s.rpc('clock_out_atomic', {
        p_staff_id: staffId,
        p_notes: null,
        p_performed_by: staffId,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
