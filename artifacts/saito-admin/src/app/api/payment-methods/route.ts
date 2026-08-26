import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, createAuthClient } from '@/lib/api-auth';

export async function GET() {
  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['superadmin']);
  if (!auth.authenticated) return auth;

  try {
    const supabase = await createAuthClient();
    const body = await request.json();
    const { key, display_name, display_name_az, icon, allows_split, allows_refund, allows_tip, min_amount, max_amount, requires_authorization, sort_order, config } = body;

    if (!key || !display_name) {
      return NextResponse.json({ error: 'key and display_name required' }, { status: 400 });
    }

    const { data, error } = await supabase.from('payment_methods').insert({
      key, display_name, display_name_az, icon,
      allows_split: allows_split ?? true,
      allows_refund: allows_refund ?? true,
      allows_tip: allows_tip ?? false,
      min_amount: min_amount ?? 0,
      max_amount: max_amount ?? null,
      requires_authorization: requires_authorization ?? false,
      sort_order: sort_order ?? 0,
      config: config ?? {},
    }).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
