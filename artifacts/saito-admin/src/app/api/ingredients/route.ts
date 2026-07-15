import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateAuth } from '@/lib/api-auth';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    const supabase = svc();
    const { data, error } = await supabase
      .from('ingredients')
      .insert([{
        name: body.name,
        unit: body.unit || 'gram',
        current_stock: Number(body.current_stock) || 0,
        theoretical_stock: Number(body.theoretical_stock) || 0,
        critical_limit: Number(body.critical_limit) || 0,
        average_cost_per_unit: Number(body.average_cost_per_unit) || 0,
        purchase_price: Number(body.purchase_price) || 0,
        cold_waste_percentage: Number(body.cold_waste_percentage) || 0,
        supplier_id: body.supplier_id || null,
      }])
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const auth = await validateAuth();
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const supabase = svc();
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
