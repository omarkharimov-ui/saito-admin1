import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier']);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    
    const supabase = await createAuthClient();
    let query = supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    
    const { data, error } = await query;
    if (error) throw error;
    
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const supabase = await createAuthClient();

    if (body.action === 'deactivate') {
      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'inactive' })
        .eq('id', body.id);
      
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from('campaigns').insert([body]);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const body = await req.json();
    const allowedFields = ['name', 'description', 'type', 'status', 'discount_percent', 'discount_amount', 'start_date', 'end_date', 'min_order_amount', 'max_discount_amount', 'code', 'is_active'];
    const update: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in body) update[key] = body[key];
    }

    const supabase = await createAuthClient();
    const { error } = await supabase.from('campaigns').update(update).eq('id', id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin']);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });
    
    const supabase = await createAuthClient();
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
