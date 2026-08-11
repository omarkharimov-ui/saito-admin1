import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const { searchParams } = new URL(request.url);
    const reservation_id = searchParams.get('reservation_id');

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data, error } = await supabase
      .from('reservation_preorder_items')
      .select('*')
      .eq('reservation_id', reservation_id)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      reservation_id,
      items: data || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
  if (!auth.authenticated) {
    return auth;
  }

  try {
    const body = await request.json();
    const { reservation_id, items } = body;

    if (!reservation_id) {
      return NextResponse.json({ error: 'reservation_id is required' }, { status: 400 });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const rows = (Array.isArray(items) ? items : []).map((item: any) => ({
      id: item.id || null,
      reservation_id,
      product_id: item.product_id || null,
      product_name: item.product_name || 'Məhsul',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      modifiers: item.modifiers || [],
      special_notes: item.special_notes || '',
      course: item.course || 'main',
    }));

    if (rows.length === 0) {
      const { error: clearErr } = await supabase
        .from('reservations')
        .update({ pre_order_items: null, pre_order_total: null })
        .eq('id', reservation_id);
      if (clearErr) {
        return NextResponse.json({ error: clearErr.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, items: [] });
    }

    const { data, error } = await supabase.rpc('upsert_reservation_preorders', {
      p_reservation_id: reservation_id,
      p_items: rows,
      p_replace_all: true,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const cache = (data || []).map((item: any) => ({
      product_id: item.product_id || null,
      product_name: item.product_name || 'Məhsul',
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      modifiers: item.modifiers || [],
      special_notes: item.special_notes || '',
    }));
    const total = cache.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0);
    await supabase
      .from('reservations')
      .update({ pre_order_items: cache.length > 0 ? cache : null, pre_order_total: cache.length > 0 ? total : null })
      .eq('id', reservation_id);

    return NextResponse.json({ success: true, items: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
