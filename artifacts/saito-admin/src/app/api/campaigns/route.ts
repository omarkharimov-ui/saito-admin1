import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier']);
    if (!auth.authenticated) return auth;

    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    
    const supabase = await createAuthClient();

    await supabase
      .from('campaigns')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .or(`end_time.lt.${new Date().toISOString()},end_date.lt.${new Date().toISOString().slice(0, 10)}`);

    const expiredProducts = await supabase
      .from('campaigns')
      .select('target_id')
      .eq('target_type', 'product')
      .eq('status', 'expired');

    if (expiredProducts.data?.length) {
      const productIds = expiredProducts.data.map(c => c.target_id).filter(Boolean);
      if (productIds.length > 0) {
        await supabase.from('products').update({ discount_price: null }).in('id', productIds);
      }
    }

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
    if (!auth.authenticated) return auth;

    const body = await req.json();
    const supabase = await createAuthClient();

    if (body.action === 'deactivate') {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('target_type, target_id')
        .eq('id', body.id)
        .single();

      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'inactive' })
        .eq('id', body.id);
      
      if (error) throw error;

      if (campaign?.target_type === 'product' && campaign.target_id) {
        await supabase.from('products').update({ discount_price: null }).eq('id', campaign.target_id);
      }

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
    if (!auth.authenticated) return auth;

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const body = await req.json();
    const allowedFields = ['title', 'description', 'type', 'status', 'discount_value', 'start_time', 'end_time', 'end_date', 'target_type', 'target_id', 'translations'];
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
    if (!auth.authenticated) return auth;

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
