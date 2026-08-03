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
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';

    let query = `${s.url}/rest/v1/couriers?select=*&order=name.asc`;
    if (activeOnly) query += `&is_active=eq.true`;

    const res = await fetch(query, { headers: s.headers });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const couriers = await res.json();
    return NextResponse.json({ couriers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const body = await request.json();
    const { name, phone, vehicle_type } = body;

    if (!name) {
      return NextResponse.json({ error: 'Kuryer adı tələb olunur' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/couriers`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        name,
        phone: phone || null,
        vehicle_type: vehicle_type || 'car',
        is_active: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const courier = await res.json();
    return NextResponse.json({ success: true, courier: courier[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID tələb olunur' }, { status: 400 });
    }

    const res = await fetch(`${s.url}/rest/v1/couriers?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...s.headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const courier = await res.json();
    return NextResponse.json({ success: true, courier: courier[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const s = svc();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID tələb olunur' }, { status: 400 });
    }

    // Soft delete — set is_active to false
    const res = await fetch(`${s.url}/rest/v1/couriers?id=eq.${id}`, {
      method: 'PATCH',
      headers: s.headers,
      body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
