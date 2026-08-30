import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { order_item_id, ingredient_id, quantity, unit, transaction_type, reference_type, reference_id, performed_by } = body;

    if (!ingredient_id || !quantity || !unit || !transaction_type) {
      return NextResponse.json({ error: 'ingredient_id, quantity, unit, transaction_type are required' }, { status: 400 });
    }

    const s = svc();
    const payload: Record<string, any> = {
      order_item_id: order_item_id || null,
      ingredient_id,
      quantity,
      unit,
      transaction_type,
      reference_type: reference_type || null,
      reference_id: reference_id || null,
      performed_by: performed_by || null,
      created_at: new Date().toISOString(),
    };

    const res = await fetch(`${s.url}/rest/v1/inventory_transactions`, {
      method: 'POST',
      headers: { ...s.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Inventory transaction failed: ${errText}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderItemId = searchParams.get('order_item_id');
    const ingredientId = searchParams.get('ingredient_id');
    const transactionType = searchParams.get('transaction_type');

    const filters: string[] = [];
    if (orderItemId) filters.push(`order_item_id=eq.${orderItemId}`);
    if (ingredientId) filters.push(`ingredient_id=eq.${ingredientId}`);
    if (transactionType) filters.push(`transaction_type=eq.${transactionType}`);

    const s = svc();
    const query = `${s.url}/rest/v1/inventory_transactions?${filters.join('&')}&order=created_at.desc`;
    const res = await fetch(query, { headers: s.headers });
    const data = await res.json();

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
