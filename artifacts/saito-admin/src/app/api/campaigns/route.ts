import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

const ALLOWED_FIELDS = [
  'name', 'title', 'description', 'type', 'status',
  'priority', 'stackable', 'exclusive',
  'max_uses', 'max_uses_per_customer', 'max_uses_per_day', 'max_uses_per_order',
  'min_order_amount', 'max_order_amount',
  'customer_tags', 'dining_type', 'table_numbers', 'branch_id',
  'auto_apply', 'requires_coupon', 'coupon_code',
  'is_active', 'start_date', 'end_date',
  'discount_value', 'target_type', 'target_id',
];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(['admin', 'superadmin', 'cashier']);
    if (!auth.authenticated) return auth;

    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const status = url.searchParams.get('status');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;

    const supabase = await createAuthClient();
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);

    await supabase
      .from('campaigns')
      .update({ status: 'expired', is_active: false })
      .eq('is_active', true)
      .or(`end_date.lt.${today},and(end_date.is.null,end_date.lt.${today})`);

    let query = supabase
      .from('campaigns')
      .select(`
        *,
        rules:campaign_rules(*),
        targets:campaign_targets(*),
        schedules:campaign_schedules(*)
      `, { count: 'exact' })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return NextResponse.json({ data: data || [], total: count || 0, page, limit });
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
        .select('targets:campaign_targets(*)')
        .eq('id', body.id)
        .single();

      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'inactive', is_active: false })
        .eq('id', body.id);

      if (error) throw error;

      const productTargets = (campaign as any)?.targets?.filter((t: any) => t.target_type === 'product') || [];
      for (const pt of productTargets) {
        if (pt.target_id) {
          await supabase.from('products').update({ discount_price: null }).eq('id', pt.target_id);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (body.id) {
      const clean: Record<string, any> = {};
      for (const key of ALLOWED_FIELDS) {
        if (key in body) clean[key] = body[key];
      }
      if (clean.title === '') clean.title = null;
      if (clean.name === '') clean.name = null;

      const { data, error } = await supabase
        .from('campaigns')
        .update(clean)
        .eq('id', body.id)
        .select(`
          *,
          rules:campaign_rules(*),
          targets:campaign_targets(*),
          schedules:campaign_schedules(*)
        `)
        .single();

      if (error) throw error;

      if (body.rules) {
        await supabase.from('campaign_rules').delete().eq('campaign_id', body.id);
        for (const rule of body.rules) {
          await supabase.from('campaign_rules').insert({ ...rule, campaign_id: body.id });
        }
      }
      if (body.targets) {
        await supabase.from('campaign_targets').delete().eq('campaign_id', body.id);
        for (const target of body.targets) {
          await supabase.from('campaign_targets').insert({ ...target, campaign_id: body.id });
        }
      }
      if (body.schedules) {
        await supabase.from('campaign_schedules').delete().eq('campaign_id', body.id);
        for (const schedule of body.schedules) {
          await supabase.from('campaign_schedules').insert({ ...schedule, campaign_id: body.id });
        }
      }

      return NextResponse.json(data);
    }

    const { rules, targets, schedules, ...campaignData } = body;
    const { data, error } = await supabase
      .from('campaigns')
      .insert([campaignData])
      .select(`
        *,
        rules:campaign_rules(*),
        targets:campaign_targets(*),
        schedules:campaign_schedules(*)
      `)
      .single();

    if (error) throw error;

    if (rules && data) {
      for (const rule of rules) {
        await supabase.from('campaign_rules').insert({ ...rule, campaign_id: data.id });
      }
    }
    if (targets && data) {
      for (const target of targets) {
        await supabase.from('campaign_targets').insert({ ...target, campaign_id: data.id });
      }
    }
    if (schedules && data) {
      for (const schedule of schedules) {
        await supabase.from('campaign_schedules').insert({ ...schedule, campaign_id: data.id });
      }
    }

    return NextResponse.json(data);
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
    const supabase = await createAuthClient();
    const update: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) update[key] = body[key];
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(update)
      .eq('id', id)
      .select(`
        *,
        rules:campaign_rules(*),
        targets:campaign_targets(*),
        schedules:campaign_schedules(*)
      `)
      .single();

    if (error) throw error;

    if (body.rules) {
      await supabase.from('campaign_rules').delete().eq('campaign_id', id);
      for (const rule of body.rules) {
        await supabase.from('campaign_rules').insert({ ...rule, campaign_id: id });
      }
    }
    if (body.targets) {
      await supabase.from('campaign_targets').delete().eq('campaign_id', id);
      for (const target of body.targets) {
        await supabase.from('campaign_targets').insert({ ...target, campaign_id: id });
      }
    }
    if (body.schedules) {
      await supabase.from('campaign_schedules').delete().eq('campaign_id', id);
      for (const schedule of body.schedules) {
        await supabase.from('campaign_schedules').insert({ ...schedule, campaign_id: id });
      }
    }

    return NextResponse.json(data);
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
    
    await supabase.from('campaign_rules').delete().eq('campaign_id', id);
    await supabase.from('campaign_targets').delete().eq('campaign_id', id);
    await supabase.from('campaign_schedules').delete().eq('campaign_id', id);
    
    await supabase.from('campaigns').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
