import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { Supplier, CreateSupplierPayload } from '@/types/inventory';

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const supabase = svc();
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');
    if (error) throw error;
    return NextResponse.json(data as Supplier[]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateSupplierPayload;
    const supabase = svc();
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name: body.name,
        contact_person: body.contact_person || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        tax_id: body.tax_id || null,
        notes: body.notes || null,
        status: 'active',
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data as Supplier);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
