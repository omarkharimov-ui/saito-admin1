import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get('role_id');

    const s = svc();

    if (roleId) {
      const res = await fetch(`${s.url}/rest/v1/location_permission_overrides?select=*`, {
        headers: s.headers,
      });
      const data = await res.json();
      const overrides: Record<string, Record<string, boolean>> = {};
      if (Array.isArray(data)) {
        for (const override of data) {
          if (!overrides[override.location_id]) {
            overrides[override.location_id] = {};
          }
          overrides[override.location_id][override.permission_id] = override.is_granted;
        }
      }
      return NextResponse.json(overrides);
    }

    return NextResponse.json({});
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authenticated) return auth;

    const body = await request.json();
    const { role_id, overrides } = body;

    if (!role_id || !overrides) {
      return NextResponse.json({ error: 'role_id and overrides are required' }, { status: 400 });
    }

    const s = svc();

    await fetch(`${s.url}/rest/v1/location_permission_overrides?role_id=eq.${role_id}`, {
      method: 'DELETE',
      headers: s.headers,
    });

    const entries: any[] = [];
    for (const [locationId, perms] of Object.entries(overrides)) {
      for (const [permissionId, isGranted] of Object.entries(perms as Record<string, boolean>)) {
        entries.push({
          location_id: locationId,
          permission_id: permissionId,
          is_granted: isGranted,
        });
      }
    }

    if (entries.length > 0) {
      const res = await fetch(`${s.url}/rest/v1/location_permission_overrides`, {
        method: 'POST',
        headers: { ...s.headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(entries),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: err || 'Failed to save overrides' }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
