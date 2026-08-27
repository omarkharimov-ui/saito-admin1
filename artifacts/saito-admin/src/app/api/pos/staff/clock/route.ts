import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateAuth } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const s = await (await import('@/lib/api-auth')).createAuthClient();
    const body = await request.json();
    const { action } = body;

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
