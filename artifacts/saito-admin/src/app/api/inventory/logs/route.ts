import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await validateAuth(['admin', 'superadmin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { ingredient_id, type, quantity, reason, cost_per_unit, created_by } = body;

    if (!ingredient_id || !type || quantity === undefined || quantity === null) {
      return NextResponse.json({ error: 'ingredient_id, type, and quantity are required' }, { status: 400 });
    }

    const s = svc();
    if (!s.url || !s.headers['apikey']) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
    }

    const res = await fetch(`${s.url}/rest/v1/inventory_logs`, {
      method: 'POST',
      headers: s.headers,
      body: JSON.stringify({
        ingredient_id,
        type,
        quantity: Number(quantity),
        reason: reason || null,
        cost_per_unit: cost_per_unit ? Number(cost_per_unit) : 0,
        created_by: created_by || null,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Inventory log failed: ${errText}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to log inventory change' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await validateAuth(['admin', 'superadmin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const s = svc();
    const url = new URL(req.url);
    const ingredientId = url.searchParams.get('ingredient_id');
    const type = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    let query = `${s.url}/rest/v1/inventory_logs?select=*,ingredients!inner(id,name,unit,current_stock)&order=created_at.desc&limit=${limit}`;
    if (ingredientId) query += `&ingredient_id=eq.${ingredientId}`;
    if (type) query += `&type=eq.${type}`;

    const res = await fetch(query, { headers: s.headers });
    if (!res.ok) throw new Error('Failed to fetch inventory logs');

    const data = await res.json();
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch inventory logs' }, { status: 500 });
  }
}
