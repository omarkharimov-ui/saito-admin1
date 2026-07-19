import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin', 'kitchen']);
    if (!auth.authenticated) return auth;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '20');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    let query = `${url}/rest/v1/customers?select=id,name,phone,total_visits,total_spent&order=total_visits.desc&limit=${limit}`;
    if (q) {
      query += `&or=(name.ilike.%${encodeURIComponent(q)}%,phone.ilike.%${encodeURIComponent(q)}%)`;
    }

    const res = await fetch(query, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Find-or-create a customer by phone. Returns the existing or newly created row.
export async function POST(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) return auth;

  try {
    const body = await request.json();
    const { name, phone } = body;

    if (!phone || !String(phone).trim()) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 });
    }

    const cleanPhone = String(phone).trim();

    // 1. Try to find an existing customer by phone
    const findRes = await fetch(
      `${svc().url}/rest/v1/customers?select=*&phone=eq.${encodeURIComponent(cleanPhone)}`,
      { headers: svc().headers }
    );
    const existing: any[] = await findRes.json();

    if (Array.isArray(existing) && existing.length > 0) {
      const customer = existing[0];
      // Keep the name fresh if a new one was provided and the stored one is empty.
      if (name && (!customer.name || customer.name === customer.phone)) {
        await fetch(`${svc().url}/rest/v1/customers?id=eq.${customer.id}`, {
          method: 'PATCH',
          headers: svc().headers,
          body: JSON.stringify({ name }),
        });
        return NextResponse.json({ customer: { ...customer, name } });
      }
      return NextResponse.json({ customer });
    }

    // 2. Create a new customer
    const createRes = await fetch(`${svc().url}/rest/v1/customers`, {
      method: 'POST',
      headers: { ...svc().headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        name: name || cleanPhone,
        phone: cleanPhone,
        total_visits: 0,
        total_spent: 0,
        created_at: new Date().toISOString(),
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return NextResponse.json({ error: `Customer creation failed: ${err}` }, { status: 500 });
    }

    const created = await createRes.json();
    const customer = Array.isArray(created) ? created[0] : created;
    return NextResponse.json({ customer });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
