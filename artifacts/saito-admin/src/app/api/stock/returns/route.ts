import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { data, error } = await supabase
      .from('supplier_returns')
      .select('*, supplier:suppliers(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'manager']);
    if (!auth.authenticated) return auth;

    const { supplier_id, return_number, reason, items } = await request.json();
    if (!supplier_id || !return_number) {
      return NextResponse.json({ error: 'supplier_id and return_number are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('supplier_returns')
      .insert({
        supplier_id,
        return_number,
        reason,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;

    // Insert items if provided
    if (items && Array.isArray(items) && items.length > 0) {
      const { error: itemsError } = await supabase.from('supplier_return_items').insert(
        items.map((item: any) => ({
          supplier_return_id: data.id,
          ingredient_id: item.ingredient_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost || 0,
          total_cost: (item.quantity || 0) * (item.unit_cost || 0),
          reason: item.reason,
        }))
      );
      if (itemsError) throw itemsError;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
