import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateAuth, createAuthClient } from '@/lib/api-auth';
import { validateCsrfToken } from '@/lib/csrf';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateAuth();
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // P-8 (D-6): CSRF double-submit
    if (!validateCsrfToken(request, true)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
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
      // S-02 (frozen): identity = session token; self clock-in (target = self).
      const { data, error: rpcError } = await s.rpc('clock_in_atomic_token', {
        p_token: auth.token,
        p_target_id: staffId,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }
      if (data?.success === false && data?.error === 'PERMISSION_DENIED') {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

      if (role_id && data?.shift_id) {
        // P-8 (D-19): active_role_id must be the staff's OWN role (single-role
        // model) — client-supplied arbitrary role uuids are rejected.
        const { data: me } = await s.from('staff').select('role_id').eq('id', staffId).maybeSingle();
        if (me?.role_id !== role_id) {
          return NextResponse.json({ error: 'INVALID_ROLE' }, { status: 400 });
        }
        const svcData = svc();
        await fetch(`${svcData.url}/rest/v1/shifts?id=eq.${data.shift_id}`, {
          method: 'PATCH',
          headers: { ...svcData.headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ active_role_id: role_id }),
        }).catch(() => {});
      }

      return NextResponse.json(data);
    } else {
      // S-02 (frozen): self close via session token.
      const { data, error: rpcError } = await s.rpc('clock_out_atomic_token', {
        p_token: auth.token,
        p_notes: null,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }
      if (data?.success === false && data?.error === 'PERMISSION_DENIED') {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

      return NextResponse.json(data);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
