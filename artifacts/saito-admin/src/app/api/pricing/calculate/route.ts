import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['cashier', 'admin', 'superadmin']);
    if (!auth.authenticated) return auth;

    const { items } = await request.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('calculate_cart_pricing', {
      p_items: JSON.stringify(items),
    });

    if (error) {
      console.error('[pricing/calculate] RPC failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('[pricing/calculate] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
