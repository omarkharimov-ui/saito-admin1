import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

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
